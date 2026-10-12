// Master data de SAO MD (data/*.bin, FlatBuffers sin esquema) → objetos, como herramientas/master_data.py (D35,
// D40; port a JS en D68, mismo resultado). Los strings van cifrados con XXTEA (clave de la librería del juego,
// claves.js). El tipo de cada campo se deduce una vez por ruta juntando todas sus apariciones en el archivo
// (pasada 1: aprender; pasada 1b: structs; pasada 2: decodificar). Ver la cabecera de master_data.py.
//
// Diferencias de representación con el JSON de Python (los valores son los mismos): los int64 que no caben en
// un double salen como BigInt, y los float con valor entero (30.0) son números de JS (30).

import { xxteaDescifrar } from './xxtea.js';
import { pyRound, div } from './py.js';

const QUORUM = 0.95;
const MAX_DEPTH = 10;
const utf8 = new TextDecoder('utf-8'); // sustituye lo inválido por U+FFFD, como decode("utf-8", "replace")

// Anchos de campos escalares confirmados en el binario (Ghidra), por archivo y ruta (master_data.py).
export const ANCHOS_CONFIRMADOS = {
  'stage.bin': {
    'raiz.f1.f1.f10.f4': 1, // BattleGate: estado inicial (FUN_00834f50 lee un byte)
    'raiz.f1.f1.f11.f1': 1, // BattleEnemyAppear: tipo (FUN_00834590)
    'raiz.f1.f1.f12.f7': 1, // BattleObstacle: dificultad (FUN_00733bac)
  },
};

class FueraDeRango extends Error {}

const f32 = new DataView(new ArrayBuffer(4));
function comoFloat(u) {
  f32.setUint32(0, u, true);
  return f32.getFloat32(0, true);
}

function bisectRight(lista, x) {
  let lo = 0, hi = lista.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (x < lista[m]) hi = m; else lo = m + 1;
  }
  return lo;
}

export class Decoder {
  /** data: Uint8Array; clave: 4 palabras XXTEA (Uint32Array) o 16 bytes; widths: ruta → ancho confirmado. */
  constructor(data, clave, widths = null) {
    this.d = data;
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.clave = clave;
    this.widths = widths || {};
    this.n = data.length;
    this.strCache = new Map();
    this.schema = new Map(); // ruta → Map(campo → tipo)
    this.structSize = new Map();
    this.members = new Map();
    this.structPos = new Map();
    this.vecPos = new Map();
    this.elements = 0;
    this.maxElements = Math.max(2_000_000, div(data.length, 2));
  }

  count(n) {
    this.elements += n;
    if (this.elements > this.maxElements) throw new Error(`más de ${this.maxElements} elementos: estructura mal interpretada`);
  }

  _rango(o, k) {
    if (o < 0 || o + k > this.n) throw new FueraDeRango(`lectura fuera del archivo: ${o}`);
  }
  u8(o) { this._rango(o, 1); return this.d[o]; }
  u16(o) { this._rango(o, 2); return this.dv.getUint16(o, true); }
  i16(o) { this._rango(o, 2); return this.dv.getInt16(o, true); }
  u32(o) { this._rango(o, 4); return this.dv.getUint32(o, true); }
  i32(o) { this._rango(o, 4); return this.dv.getInt32(o, true); }
  f32(o) { this._rango(o, 4); return this.dv.getFloat32(o, true); }
  i64(o) {
    this._rango(o, 8);
    const v = this.dv.getBigInt64(o, true);
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : v;
  }

  // ---- validaciones ----
  isTable(t) {
    if (t <= 0 || t + 4 > this.n || t % 2) return false;
    const so = this.i32(t);
    if (so === 0) return false;
    const vt = t - so;
    if (vt < 0 || vt + 4 > this.n || vt % 2) return false;
    const vs = this.u16(vt), ts = this.u16(vt + 2);
    if (vs < 4 || vs % 2 || vs > 256 || ts < 4 || ts > 1024 || t + ts > this.n || vt + vs > this.n) return false;
    for (let i = 0; i < (vs - 4) >> 1; i++) {
      const off = this.u16(vt + 4 + i * 2);
      if (off && (off < 4 || off >= ts)) return false;
    }
    return true;
  }

  stringAt(s) {
    let v = this.strCache.get(s);
    if (v === undefined) {
      v = this._stringAt(s);
      this.strCache.set(s, v);
    }
    return v;
  }

  _stringAt(s) {
    if (s < 0 || s + 4 > this.n) return null;
    const ln = this.u32(s);
    if (ln === 0) return s + 4 < this.n && this.d[s + 4] === 0 ? '' : null;
    if (ln > 4096 || s + 4 + ln >= this.n || this.d[s + 4 + ln] !== 0) return null;
    const raw = this.d.subarray(s + 4, s + 4 + ln);
    if (ln % 4 === 0 && ln >= 8) {
      const out = xxteaDescifrar(raw, this.clave);
      if (out !== null) {
        let fin = out.length;
        while (fin > 0 && out[fin - 1] === 0) fin--;
        return utf8.decode(out.subarray(0, fin));
      }
    }
    for (const b of raw) if (!((b >= 32 && b < 127) || b === 9 || b === 10 || b === 13)) return null;
    return String.fromCharCode(...raw);
  }

  target(pos) {
    return pos + this.u32(pos);
  }

  outside(t, tgt) {
    const ts = this.u16(t - this.i32(t) + 2);
    return !(t <= tgt && tgt < t + ts);
  }

  tableOk(t, pos) {
    const tgt = this.target(pos);
    return tgt < this.n && this.outside(t, tgt) && this.isTable(tgt);
  }

  vectorOk(t, pos) {
    const tgt = this.target(pos);
    if (tgt % 4 || tgt + 4 > this.n || !this.outside(t, tgt)) return false;
    const cnt = this.u32(tgt);
    return cnt <= 65536 && tgt + 4 + cnt * 4 <= this.n;
  }

  stringOk(pos) {
    return this.stringAt(this.target(pos)) !== null;
  }

  sameType(tables) {
    const vts = tables.map((t) => t - this.i32(t));
    return vts.length < 8 || new Set(vts).size <= Math.max(8, vts.length * 0.25);
  }

  // ---- estructura ----
  /** [[índice, posición, tamaño leído como escalar, hueco hasta el siguiente campo]]. */
  fieldsGap(t) {
    const vt = t - this.i32(t);
    const vs = this.u16(vt), ts = this.u16(vt + 2);
    const items = [];
    for (let i = 0; i < (vs - 4) >> 1; i++) {
      const off = this.u16(vt + 4 + i * 2);
      if (off) items.push([off, i]);
    }
    items.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = [];
    for (let k = 0; k < items.length; k++) {
      const [off, i] = items[k];
      const nxt = k + 1 < items.length ? items[k + 1][0] : ts;
      const gap = nxt - off;
      const size = gap >= 8 && (off % 8 === 0 || gap === 8) && gap < 12 ? 8 : gap >= 4 ? Math.min(gap, 4) : gap;
      out.push([i, t + off, size, gap]);
    }
    return out;
  }

  fields(t) {
    return this.fieldsGap(t).map(([i, pos, size]) => [i, pos, size]);
  }

  scalar(pos, size) {
    if (size === 1) return this.u8(pos);
    if (size === 2) return this.i16(pos);
    if (size === 8) return this.i64(pos);
    const v = this.i32(pos);
    const f = this.f32(pos);
    // Floats típicos (0.5, 1.2, 30.0...) se ven como enteros enormes con exponente sensato.
    if (Math.abs(v) >= 0x30000000 && Number.isFinite(f) && Math.abs(f) > 1e-3 && Math.abs(f) < 1e6) return pyRound(f, 4);
    return v;
  }

  vectorElems(pos) {
    const start = this.target(pos);
    const cnt = Math.min(this.u32(start), div(this.n - start - 4, 4));
    return [start, cnt];
  }

  // ---- pasada 1: aprender tipos por ruta ----
  learn(sig, ts, depth = 0) {
    ts = ts.filter((t) => this.isTable(t));
    if (!ts.length || depth > MAX_DEPTH) return;
    const slots = new Map();
    const gaps = new Map();
    for (const t of ts) {
      for (const [i, pos, size, gap] of this.fieldsGap(t)) {
        if (!slots.has(i)) slots.set(i, []);
        slots.get(i).push([t, pos, size]);
        gaps.set(i, Math.min(gap, gaps.has(i) ? gaps.get(i) : gap));
      }
    }
    const kinds = new Map();
    const children = new Map();
    for (const [i, lst] of slots) {
      let kind = 'scalar';
      const ruta = `${sig}.f${i}`;
      if (gaps.get(i) > 8) {
        kind = 'struct';
        this.structSize.set(ruta, gaps.get(i));
        this.structPos.set(ruta, lst.map(([, pos]) => pos));
      } else if (lst.every(([, , size]) => size === 4)) {
        const need = QUORUM * lst.length;
        let nStr = 0, nonempty = false;
        for (const [, pos] of lst) {
          if (this.stringOk(pos)) {
            nStr++;
            if (!nonempty && this.stringAt(this.target(pos))) nonempty = true;
          }
        }
        if (nStr >= need && nonempty) {
          kind = 'string';
          this.vecPos.set(ruta, lst.filter(([t, pos]) => this.vectorOk(t, pos)).map(([, pos]) => pos));
        } else if (lst.filter(([t, pos]) => this.tableOk(t, pos)).length >= need) {
          const tgts = lst.map(([, pos]) => this.target(pos)).filter((x) => this.isTable(x));
          if (this.sameType(tgts)) {
            kind = 'table';
            children.set(i, tgts);
          }
        } else if (lst.filter(([t, pos]) => this.vectorOk(t, pos)).length >= need) {
          const vpos = lst.filter(([t, pos]) => this.vectorOk(t, pos)).map(([, pos]) => pos);
          const [k, elems] = this.vectorKind(vpos);
          kind = k;
          if (kind === 'vtable') children.set(i, elems);
          else if (kind === 'vint') this.vecPos.set(ruta, vpos);
        }
      }
      kinds.set(i, kind);
    }
    this.schema.set(sig, kinds);
    for (const [i, child] of children) this.learn(`${sig}.f${i}`, child, depth + 1);
  }

  vectorKind(positions) {
    const elems = [];
    for (const pos of positions) {
      const [start, cnt] = this.vectorElems(pos);
      for (let k = 0; k < cnt; k++) elems.push(start + 4 + k * 4);
    }
    if (!elems.length) return ['vint', []];
    let sample = elems;
    if (elems.length > 20000) {
      const paso = div(elems.length, 20000) + 1;
      sample = elems.filter((_, k) => k % paso === 0);
    }
    const tgts = sample.map((e) => e + this.u32(e));
    const nTab = tgts.filter((x) => x < this.n && this.isTable(x)).length;
    const nStr = tgts.filter((x) => x < this.n && this.stringAt(x) !== null).length;
    if (nTab >= QUORUM * tgts.length) {
      const allT = elems.map((e) => e + this.u32(e));
      if (this.sameType(allT.filter((x) => x < this.n && this.isTable(x)))) return ['vtable', allT];
    }
    if (nStr >= QUORUM * tgts.length && tgts.some((x) => x < this.n && this.stringAt(x))) return ['vstring', []];
    return ['vint', []];
  }

  // ---- pasada 1b: structs ----
  objectStarts(roots) {
    const starts = new Set();
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
      const [sig, t] = stack.pop();
      if (seen.has(t) || !this.isTable(t)) continue;
      seen.add(t);
      starts.add(t);
      starts.add(t - this.i32(t));
      const kinds = this.schema.get(sig) || new Map();
      for (const [i, pos] of this.fields(t)) {
        const kind = kinds.get(i) || 'scalar';
        if (kind === 'scalar' || kind === 'struct') continue;
        const tgt = this.target(pos);
        if (kind === 'string') {
          if (this.stringAt(tgt) !== null) starts.add(tgt);
        } else if (kind === 'table') {
          stack.push([`${sig}.f${i}`, tgt]);
        } else if (this.vectorOk(t, pos)) {
          starts.add(tgt);
          const [start, cnt] = this.vectorElems(pos);
          for (let k = 0; k < cnt; k++) {
            const e = start + 4 + k * 4;
            const x = e + this.u32(e);
            if (kind === 'vstring') {
              if (this.stringAt(x) !== null) starts.add(x);
            } else if (kind === 'vtable') stack.push([`${sig}.f${i}`, x]);
          }
        }
      }
    }
    return [...starts].sort((a, b) => a - b);
  }

  learnStructVectors(roots, extra = []) {
    if (!this.vecPos.size) return;
    const starts = [...new Set([...this.objectStarts(roots), ...extra])].sort((a, b) => a - b);
    for (const [path, positions] of this.vecPos) {
      const vecs = [];
      for (const pos of positions) {
        const start = this.target(pos);
        const cnt = this.u32(start);
        if (cnt) {
          const k = bisectRight(starts, start);
          const nxt = k < starts.length ? starts[k] : this.n;
          vecs.push([start + 4, cnt, nxt - start - 4]);
        }
      }
      if (!vecs.length) continue;
      let menor = Infinity;
      for (const [, cnt, room] of vecs) menor = Math.min(menor, div(room, cnt));
      const size = div(menor, 4) * 4;
      if (size <= 4) continue;
      const exact = vecs.filter(([, cnt, room]) => cnt * size <= room && room < cnt * size + 8).length;
      if (exact < 2 || vecs.some(([data, cnt]) => data + cnt * size > this.n)) continue;
      let algo = false;
      fuera: for (const [data, cnt] of vecs) {
        for (let k = 0; k < cnt; k++) {
          for (let b = data + k * size + 4; b < Math.min(data + (k + 1) * size, this.n); b++) {
            if (this.d[b]) { algo = true; break fuera; }
          }
        }
      }
      if (!algo) continue;
      const corte = path.lastIndexOf('.f');
      const parent = path.slice(0, corte), field = Number(path.slice(corte + 2));
      this.schema.get(parent).set(field, 'vstruct');
      this.structSize.set(path, size);
      const ps = [];
      for (const [data, cnt] of vecs) for (let k = 0; k < cnt; k++) ps.push(data + k * size);
      this.structPos.set(path, ps);
    }
  }

  memberTypes(path) {
    if (!this.members.has(path)) {
      const size = this.structSize.get(path);
      let pos = this.structPos.get(path) || [];
      this.structPos.delete(path);
      if (pos.length > 20000) {
        const paso = div(pos.length, 20000) + 1;
        pos = pos.filter((_, k) => k % paso === 0);
      }
      const words = [];
      for (let w = 0; w < div(size, 4); w++) {
        const vals = pos.map((p) => this.u32(p + w * 4));
        const nonzero = vals.filter((v) => v);
        const high = new Set(vals.filter((v) => v >>> 16));
        if (!nonzero.length) words.push('0');
        else if (nonzero.every((v) => this.looksFloat(v))) words.push('f');
        else if (high.size >= 8 && [...high].every((v) => (v & 0xffff) < 0x1000)) words.push('HH');
        else words.push('i');
      }
      const zero = words.includes('f') && !words.includes('i') && !words.includes('HH') ? 'f' : 'i';
      let fmt = words.map((w) => (w === '0' ? zero : w)).join('');
      fmt += 'H'.repeat(div(size % 4, 2)) + 'B'.repeat(size % 2);
      this.members.set(path, fmt);
    }
    return this.members.get(path);
  }

  looksFloat(u) {
    const v = u >= 2 ** 31 ? u - 2 ** 32 : u;
    const f = comoFloat(u);
    return Math.abs(v) >= 0x30000000 && Number.isFinite(f) && Math.abs(f) > 1e-3 && Math.abs(f) < 1e6;
  }

  structAt(path, pos) {
    const fmt = this.memberTypes(path);
    const tam = { i: 4, f: 4, H: 2, B: 1 };
    let total = 0;
    for (const c of fmt) total += tam[c];
    this._rango(pos, total);
    const out = [];
    let o = pos;
    for (const c of fmt) {
      if (c === 'i') out.push(this.dv.getInt32(o, true));
      else if (c === 'f') out.push(pyRound(this.dv.getFloat32(o, true), 4));
      else if (c === 'H') out.push(this.dv.getUint16(o, true));
      else out.push(this.d[o]);
      o += tam[c];
    }
    return out;
  }

  // ---- pasada 2: decodificar ----
  decode(sig, t, depth = 0) {
    if (depth > MAX_DEPTH || !this.isTable(t)) return null;
    this.count(1);
    const kinds = this.schema.get(sig) || new Map();
    const rec = [];
    for (const [i, pos, size] of this.fields(t)) {
      const kind = kinds.get(i) || 'scalar';
      const ruta = `${sig}.f${i}`;
      let v;
      try {
        if (kind === 'string') {
          const s = this.stringAt(this.target(pos));
          v = s !== null ? s : this.scalar(pos, size);
          if (typeof s === 'string') this.count(div(s.length, 16));
        } else if (kind === 'table') {
          const tgt = this.target(pos);
          v = this.isTable(tgt) ? this.decode(ruta, tgt, depth + 1) : this.scalar(pos, size);
        } else if (kind === 'struct') {
          v = this.structAt(ruta, pos);
        } else if (kind[0] === 'v') {
          v = this.decodeVector(ruta, kind, t, pos, size, depth);
        } else {
          v = this.scalar(pos, this.widths[ruta] ?? size);
        }
      } catch (e) {
        if (!(e instanceof FueraDeRango) && !(e instanceof RangeError)) throw e;
        v = null;
      }
      rec.push([i, v]);
    }
    rec.sort((a, b) => a[0] - b[0]);
    const out = {};
    for (const [i, v] of rec) out[`f${i}`] = v;
    return out;
  }

  decodeVector(sig, kind, t, pos, size, depth) {
    if (!this.vectorOk(t, pos)) return this.scalar(pos, size);
    let [start, cnt] = this.vectorElems(pos);
    this.count(cnt);
    const elems = [];
    for (let k = 0; k < cnt; k++) elems.push(start + 4 + k * 4);
    if (kind === 'vstring') return elems.map((e) => this.stringAt(e + this.u32(e)));
    if (kind === 'vtable') return elems.map((e) => this.decode(sig, e + this.u32(e), depth + 1));
    if (kind === 'vstruct') {
      const ss = this.structSize.get(sig);
      cnt = this.u32(start);
      if (start + 4 + cnt * ss <= this.n) {
        const out = [];
        for (let k = 0; k < cnt; k++) out.push(this.structAt(sig, start + 4 + k * ss));
        return out;
      }
      cnt = Math.min(cnt, div(this.n - start - 4, 4));
    }
    this._rango(start + 4, Math.max(0, cnt) * 4);
    const out = [];
    for (let k = 0; k < cnt; k++) out.push(this.dv.getInt32(start + 4 + k * 4, true));
    return out;
  }

  records() {
    const root = this.u32(0);
    const fields = this.fields(root);
    // Tablas de master data: la raíz solo tiene la lista de registros. Otros archivos (p. ej.
    // data/animation/<unidad>.bin) tienen una raíz con más campos: se decodifica entera.
    if (fields.length === 1 && fields[0][0] === 0) {
      const [start, cnt] = this.vectorElems(fields[0][1]);
      const recs = [];
      for (let k = 0; k < cnt; k++) {
        const e = start + 4 + k * 4;
        recs.push(e + this.u32(e));
      }
      this.learn('registro', recs);
      this.learnStructVectors(recs.map((t) => ['registro', t]), [root, root - this.i32(root), start]);
      return recs.map((t) => this.decode('registro', t));
    }
    this.learn('raiz', [root]);
    this.learnStructVectors([['raiz', root]]);
    return this.decode('raiz', root);
  }
}

/** Convierte un data/*.bin (Uint8Array) con la clave XXTEA; null si es demasiado corto (como convert()). */
export function convertir(datos, clave, nombre = '') {
  if (datos.length < 16) return null;
  const base = nombre.split('/').pop();
  return new Decoder(datos, clave, ANCHOS_CONFIRMADOS[base]).records();
}
