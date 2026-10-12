// Partes comunes de los exportadores (D68): herramientas/eventos_cuadro.py, normal_hits() de exportar_combate.py y
// enemigos_stats.py, con los mismos resultados. Los comentarios de qué es cada campo están en los .py.

import { Decoder } from './master_data.js';
import { get, o, verdad, esEntero, ordenar } from './py.js';

// D61: attack.f2 = tipo de golpe; solo el tipo 1 hace daño. Buffs: 3/4/6/7/8/9/12.
export const TIPOS_BUFF = [3, 4, 6, 7, 8, 9, 12];

// D62: lo que cada golpe resta al medidor de cada estado (virtual 0x458 = FUN_00853f14): estado -> campo.
export const CAMPO_DE_ESTADO = [[0, 'f11'], [1, 'f15'], [2, 'f13'], [3, 'f17'], [4, 'f12'], [5, 'f16'], [6, 'f14'],
  [7, 'f18'], [8, 'f40'], [9, 'f41'], [10, 'f42'], [11, 'f43'], [12, 'f47'], [13, 'f48'], [14, 'f49'], [15, 'f50'],
  [16, 'f51'], [0x12, 'f9'], [0x13, 'f10'], [0x14, 'f53'], [0x17, 'f48'], [0x18, 'f48']];

/** [{estado: cantidad}, anormal [f57, f58, f59] | null] del golpe. */
export function estadosDe(a) {
  const est = {};
  for (const [i, c] of CAMPO_DE_ESTADO) if (verdad(get(a, c))) est[String(i)] = a[c];
  const anormal = verdad(get(a, 'f57')) ? [a.f57, o(get(a, 'f58', 0), 0), o(get(a, 'f59', 0), 0)] : null;
  return [est, anormal];
}

/** Buff de un golpe: stat f6, valor f3/10000, duración f35, alcance f5. */
export function buffDe(a) {
  return { stat: o(get(a, 'f6', 0), 0), valor: o(get(a, 'f3'), 0) / 10000, duracion: o(get(a, 'f35', 0), 0), alcance: o(get(a, 'f5', 0), 0) };
}

const buf8 = new DataView(new ArrayBuffer(8));
/** struct.unpack("<ff", struct.pack("<q", v)). */
function dosFloats(v) {
  buf8.setBigInt64(0, BigInt(v ?? 0), true);
  return [buf8.getFloat32(0, true), buf8.getFloat32(4, true)];
}

/** {animación: {fps, golpes, impulsos[, defensa]}} (eventos_cuadro.eventos); attacks: Map id → registro. */
export function eventos(animaciones, attacks, solo = null) {
  const out = {};
  for (const an of animaciones || []) {
    const name = get(an, 'f0');
    if (typeof name !== 'string' || (solo && !solo(name))) continue;
    const golpes = [], impulsos = [], defensa = [], sonidos = [];
    const abiertos = new Map();
    for (const fr of ordenar(o(get(an, 'f3'), []), (x) => get(x, 'f0', 0))) {
      const cuadro = get(fr, 'f0', 0);
      for (const ev of o(get(fr, 'f1'), [])) {
        const t = get(ev, 'f2');
        if (t === 1 && verdad(get(ev, 'f3'))) {
          const clave = `${ev.f3}|${get(ev, 'f1', 0)}`;
          let v = abiertos.get(clave);
          if (v && v.hasta >= cuadro - 1) {
            v.hasta = cuadro;
            continue;
          }
          const a = attacks.get(ev.f3) ?? {};
          v = {
            ataque: ev.f3, desde: cuadro, hasta: cuadro, caja: get(ev, 'f1', 0),
            mult: get(a, 'f3', 10000) / 10000, final: get(a, 'f10') === 1001,
            guardia: get(a, 'f7', 0), parable: verdad(get(a, 'f44')),
            medidor: o(get(a, 'f23', 0), 0), prof: o(get(a, 'f8', 0), 0),
            pausa: ['f25', 'f26', 'f32', 'f33'].map((k) => o(get(a, k, 0), 0)),
            tipo: o(get(a, 'f2', 0), 0),
          };
          if (v.tipo === 2 || v.tipo === 10) v.cura = { tope: o(get(a, 'f46', 0), 0), div: o(get(a, 'f4', 1), 1) };
          if (TIPOS_BUFF.includes(v.tipo)) v.buff = buffDe(a);
          const [est, anormal] = estadosDe(a);
          if (verdad(est)) v.estados = est;
          if (anormal) v.anormal = anormal;
          if (verdad(get(a, 'f1'))) v.clase = a.f1;
          if (verdad(get(a, 'f61'))) v.odio = a.f61;
          abiertos.set(clave, v);
          golpes.push(v);
        } else if ([5, 65, 116].includes(t) && verdad(get(ev, 'f3'))) {
          // 5 SE; 65 voz por grupo/tipo; 116 voz sólo del activo (FUN_0082a3b4).
          sonidos.push({ cuadro, id: ev.f3, tipo: t });
        } else if (t === 10) {
          const [vx, vy] = dosFloats(get(ev, 'f5', 0));
          impulsos.push({ cuadro, vx, vy, giro: get(ev, 'f4', 0) });
        } else if (t === 15 || t === 54 || t === 93) {
          defensa.push({ cuadro, tipo: t, caja: get(ev, 'f1', 0), valor: get(ev, 'f3', 0), f4: get(ev, 'f4', 0) });
        }
      }
    }
    if (golpes.length || impulsos.length || defensa.length || sonidos.length) {
      out[name] = { fps: get(an, 'f2', 30), golpes, impulsos };
      if (defensa.length) out[name].defensa = defensa;
      if (sonidos.length) out[name].sonidos = sonidos;
    }
  }
  return out;
}

/**
 * Multiplicador de cada golpe de los ataques normales (normal_hits de exportar_combate.py): animaciones
 * attack_* y jump_attack de character.f18 (enemigos: f13) → ids de attack con f2 == 1 → f3 / 10000.
 */
export function normalHits(char, attacks, field = 'f18') {
  const ids = (v, out) => {
    if (Array.isArray(v)) for (const x of v) ids(x, out);
    else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) ids(x, out);
    else if (esEntero(v) && get(attacks.get(v) ?? {}, 'f2') === 1) out.push(v);
  };
  const result = {};
  for (const anim of o(get(char, field), [])) {
    const name = get(anim, 'f0');
    if (typeof name !== 'string' || !(name.startsWith('attack_') || name === 'jump_attack')) continue;
    const found = [];
    ids(anim, found);
    if (found.length) result[name] = [...new Set(found)].map((i) => get(attacks.get(i), 'f3', 0) / 10000);
  }
  return result;
}

/** Map id → registro de una tabla de master data (lista de registros con f0). */
export const porId = (recs, campo = 'f0') => new Map((recs || []).map((r) => [r[campo], r]));

/**
 * Tabla de estadísticas por nivel de cada enemigo (enemigos_stats.py): enemy.f16 es una lista de structs de 128
 * bytes [u16 nivel, u16 extra, 31 x u32]. {id (texto): [{nivel, extra, v}]}.
 */
export async function enemigosStats(fuente) {
  const l = await fuente.listar('data/enemies');
  const nombres = ordenar((l?.files ?? []).filter((f) => f.endsWith('.bin'))); // sorted(os.listdir)
  const out = {};
  for (const f of nombres) {
    const data = await fuente.leer(`data/enemies/${f}`);
    const d = new Decoder(data, fuente.clave);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const root = d.u32(0);
    const [[, vpos]] = d.fields(root);
    const [start, cnt] = d.vectorElems(vpos);
    for (let k = 0; k < cnt; k++) {
      const e = start + 4 + k * 4;
      const t = e + d.u32(e);
      const fields = new Map(d.fields(t).map(([i, pos]) => [i, pos]));
      const id = fields.has(0) ? d.i32(fields.get(0)) : null;
      if (!fields.has(16)) continue;
      const vstart = fields.get(16) + d.u32(fields.get(16));
      const n = d.u32(vstart);
      const rows = [];
      for (let j = 0; j < n; j++) {
        const base = vstart + 4 + j * 128;
        const v = [];
        for (let w = 0; w < 31; w++) v.push(dv.getUint32(base + 4 + w * 4, true));
        rows.push({ nivel: dv.getUint16(base, true), extra: dv.getUint16(base + 2, true), v });
      }
      out[String(id)] = rows;
    }
  }
  return out;
}

/** [nivel, HP, MP, ATK, DEF, CRIT, precisión, evasión] por fila (como combate.json). */
export const porNivel = (filas) => filas.map((row) => [row.nivel, ...row.v.slice(1, 6), row.v[15] ?? 10000, row.v[16] ?? 0]);
