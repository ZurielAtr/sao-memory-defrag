// Lector de .ssbp (SpriteStudio 5) tal como los usa SAO Memory Defrag.
//
// Fuentes del formato:
//  - Oficial v4: SpriteStudio5-SDK/Build/Converter/main.cpp y SS5PlayerForCocos2d-x (SS5PlayerData.h).
//  - Variantes del juego (v2 y v6): ssbp2ssae.py v1.1.1 de Albireo, encontrado entre los assets
//    de Revival, y verificado contra los .ssce/.ssae fuente de chara_44_dualblade_w.
//
// Diferencias con el oficial: posiciones y cellIndex son s16; Cell sin UV (v2) o partido en
// dos tablas con valores s16 ofuscados (v6: valor = crudo - llave); datos iniciales de 80/88 bytes.

export const PART_FLAG = {
  INVISIBLE: 1 << 0,
  FLIP_H: 1 << 1,
  FLIP_V: 1 << 2,
  CELL_INDEX: 1 << 3,
  POSITION_X: 1 << 4,
  POSITION_Y: 1 << 5,
  POSITION_Z: 1 << 6,
  PIVOT_X: 1 << 7,
  PIVOT_Y: 1 << 8,
  ROTATION_X: 1 << 9,
  ROTATION_Y: 1 << 10,
  ROTATION_Z: 1 << 11,
  SCALE_X: 1 << 12,
  SCALE_Y: 1 << 13,
  OPACITY: 1 << 14,
  COLOR_BLEND: 1 << 15,
  VERTEX_TRANSFORM: 1 << 16,
  SIZE_X: 1 << 17,
  SIZE_Y: 1 << 18,
  U_MOVE: 1 << 19,
  V_MOVE: 1 << 20,
  UV_ROTATION: 1 << 21,
  U_SCALE: 1 << 22,
  V_SCALE: 1 << 23,
  BOUNDINGRADIUS: 1 << 24,
  INSTANCE_KEYFRAME: 1 << 25,
  INSTANCE_START: 1 << 26,
  INSTANCE_END: 1 << 27,
  INSTANCE_SPEED: 1 << 28,
  INSTANCE_LOOP: 1 << 29,
  INSTANCE_LOOP_FLG: 1 << 30,
};

export const PART_TYPE = { NULL: 0, NORMAL: 1, TEXT: 2, INSTANCE: 3, EFFECT: 4 };
export const BLEND = { MIX: 0, MUL: 1, ADD: 2, SUB: 3 };

const VERTEX_FLAG = { LT: 1, RT: 2, LB: 4, RB: 8, ONE: 16 };

class Bin {
  constructor(buffer) {
    this.v = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
  }
  u16(o) { return this.v.getUint16(o, true); }
  s16(o) { return this.v.getInt16(o, true); }
  u32(o) { return this.v.getUint32(o, true); }
  s32(o) { return this.v.getInt32(o, true); }
  f32(o) { return this.v.getFloat32(o, true); }
  // s16 ofuscado de la v6: crudo - llave, con vuelta en 16 bits.
  s16k(o, k) {
    let r = this.s16(o) - k;
    if (r < -32768) r += 65536;
    return r;
  }
  str(ptr) {
    if (!ptr) return '';
    if (ptr >= this.bytes.length) throw new Error('Puntero de cadena ssbp fuera del archivo');
    let end = ptr;
    while (end < this.bytes.length && this.bytes[end]) end++;
    return new TextDecoder().decode(this.bytes.subarray(ptr, end));
  }
}

export function parseSSBP(buffer) {
  const b = new Bin(buffer);
  if (new TextDecoder().decode(b.bytes.subarray(0, 4)) !== 'SSPB') throw new Error('No es un .ssbp');
  const version = b.u32(4);
  if (version !== 2 && version !== 6) {
    throw new Error(`Versión de ssbp ${version} no soportada todavía (solo 2 y 6)`);
  }
  const v6 = version === 6;

  // Celdas y mapas de celdas (texturas).
  const cellsPtr = b.u32(0x10);
  const numCells = b.s16(0x1c);
  const cellsGeomPtr = v6 ? b.u32(0x24) : 0;
  const cellStride = v6 ? 12 : 28;
  const cellMaps = [];
  const cellMapByPtr = new Map();
  const cells = [];
  for (let i = 0; i < numCells; i++) {
    const cp = cellsPtr + i * cellStride;
    const mapPtr = b.u32(cp + 4);
    if (!cellMapByPtr.has(mapPtr)) {
      cellMapByPtr.set(mapPtr, cellMaps.length);
      cellMaps.push({
        name: b.str(b.u32(mapPtr)),
        imagePath: b.str(b.u32(mapPtr + 4)),
        index: b.s16(mapPtr + 8),
        wrapMode: b.s16(mapPtr + 10),
        filterMode: b.s16(mapPtr + 12),
      });
    }
    const cell = { name: b.str(b.u32(cp)), map: cellMapByPtr.get(mapPtr), index: i };
    if (v6) {
      const gp = cellsGeomPtr + i * 20;
      const k = b.u16(gp + 0x10);
      cell.x = b.s16k(gp, k);
      cell.y = b.s16k(gp + 2, k);
      cell.w = b.s16k(gp + 4, k);
      cell.h = b.s16k(gp + 6, k);
      cell.pivotX = b.f32(gp + 8);
      cell.pivotY = b.f32(gp + 12);
    } else {
      cell.x = b.s16(cp + 0x0a);
      cell.y = b.s16(cp + 0x0c);
      cell.w = b.s16(cp + 0x0e);
      cell.h = b.s16(cp + 0x10);
      cell.pivotX = b.f32(cp + 0x14);
      cell.pivotY = b.f32(cp + 0x18);
    }
    cells.push(cell);
  }

  // Paquetes de animación: partes + animaciones.
  const packsPtr = b.u32(0x14);
  const numPacks = b.s16(0x1e);
  const initStride = v6 ? 88 : 80;
  const packs = [];
  for (let p = 0; p < numPacks; p++) {
    const pp = packsPtr + p * 16;
    const partsPtr = b.u32(pp + 4);
    const animsPtr = b.u32(pp + 8);
    const numParts = b.s16(pp + 12);
    const numAnims = b.s16(pp + 14);
    const parts = [];
    for (let i = 0; i < numParts; i++) {
      const o = partsPtr + i * 24;
      parts.push({
        name: b.str(b.u32(o)),
        index: b.s16(o + 4),
        parent: b.s16(o + 6),
        type: b.s16(o + 8),
        boundsType: b.s16(o + 10),
        blend: b.s16(o + 12),
        refName: b.str(b.u32(o + 16)),
        effectName: b.str(b.u32(o + 20)),
      });
    }
    const anims = [];
    for (let a = 0; a < numAnims; a++) {
      const o = animsPtr + a * 28;
      const numFrames = b.s16(o + 0x14);
      const defaultPtr = b.u32(o + 4);
      const framesPtr = b.u32(o + 8);
      const initial = [];
      for (let i = 0; i < numParts; i++) {
        const d = defaultPtr + i * initStride;
        const k0 = v6 ? b.u16(d + 0x50) : 0;
        const k1 = v6 ? b.u16(d + 0x54) : 0;
        initial.push({
          index: b.s16(d),
          flags: b.u32(d + 4),
          cellIndex: b.s16k(d + 0x08, k0),
          x: b.s16k(d + 0x0a, k1),
          y: b.s16k(d + 0x0c, k0),
          z: b.s16k(d + 0x0e, k1),
          opacity: b.s16k(d + 0x10, k0),
          pivotX: b.f32(d + 0x14),
          pivotY: b.f32(d + 0x18),
          rotX: b.f32(d + 0x1c),
          rotY: b.f32(d + 0x20),
          rotZ: b.f32(d + 0x24),
          scaleX: b.f32(d + 0x28),
          scaleY: b.f32(d + 0x2c),
          sizeX: b.f32(d + 0x30),
          sizeY: b.f32(d + 0x34),
        });
      }
      const frameOffsets = [];
      for (let f = 0; f < numFrames; f++) frameOffsets.push(b.u32(framesPtr + f * 4));
      const userDataPtr = b.u32(o + 12);
      const labelPtr = b.u32(o + 16);
      const labels = [];
      for (let l = 0; labelPtr && l < b.s16(o + 24); l++) {
        const lp = b.u32(labelPtr + l * 4);
        if (lp) labels.push({ name: b.str(b.u32(lp)), frameNo: b.u16(lp + 4) });
      }
      anims.push({
        name: b.str(b.u32(o)),
        numFrames,
        fps: b.s16(o + 0x16) || 30,
        initial,
        frameOffsets,
        userDataPtr,
        labels,
      });
    }
    packs.push({ name: b.str(b.u32(pp)), parts, anims });
  }

  // La variante v2 del juego tiene EffectFile de 16 bytes (sin layoutScale del SDK v4).
  const effects = [];
  if (!v6) {
    const effectsPtr = b.u32(24), count = b.s16(32);
    for (let e = 0; effectsPtr && e < count; e++) {
      const ep = effectsPtr + e * 16;
      const nodes = [];
      for (let n = 0; n < b.s16(ep + 10); n++) {
        const np = b.u32(ep + 12) + n * 16;
        const commands = [];
        for (let c = 0; c < b.s16(np + 10); c++) {
          const cp = b.u32(b.u32(np + 12) + c * 4);
          commands.push(readEffectCommand(b, cp));
        }
        nodes.push({ index: b.s16(np), parent: b.s16(np + 2), type: b.s16(np + 4),
          cellIndex: b.s16(np + 6), blend: b.s16(np + 8), commands });
      }
      effects.push({ name: b.str(b.u32(ep)), fps: b.s16(ep + 4), lockSeed: !!b.s16(ep + 6),
        seed: b.s16(ep + 8), nodes });
    }
  }
  return { version, cellMaps, cells, packs, effects, _bin: b };
}

// Comandos SS5PlayerData.h; únicamente los campos realmente presentes, sin leer el
// comando siguiente. Los tipos desconocidos quedan identificados, no se inventa su efecto.
const EFFECT_FIELDS = {
  1: ['i:priority','i:maximumParticle','i:attimeCreate','i:interval','i:lifetime',
    'f:speedMin','f:speedMax','i:lifespanMin','i:lifespanMax','f:angle','f:angleVariance'],
  2: ['i:seed'], 3: ['i:delay'], 4: ['f:x','f:y'],
  5: ['f:xMin','f:xMax','f:yMin','f:yMax'],
  6: ['f:min','f:max','f:addMin','f:addMax'],
  7: ['f:factor','f:endLife'], 8: ['f:min','f:max'], 9: ['f:min','f:max'],
  10: ['u:min','u:max'], 11: ['u:min','u:max'], 12: ['f:start','f:end'],
  13: ['f:xMin','f:xMax','f:yMin','f:yMax','f:factorMin','f:factorMax'],
  14: ['f:xMin','f:xMax','f:yMin','f:yMax','f:factorMin','f:factorMax'],
  15: ['f:x','f:y','f:power'], 16: ['f:rotation'], 17: ['i:flag'],
};
function readEffectCommand(b, p) {
  const type = b.s32(p), out = { type, supported: !!EFFECT_FIELDS[type] };
  for (const field of EFFECT_FIELDS[type] ?? []) {
    p += 4;
    const [kind, name] = field.split(':');
    out[name] = kind === 'f' ? b.f32(p) : kind === 'u' ? b.u32(p) : b.s32(p);
  }
  return out;
}

export function decodeUserData(ssbp, pack, anim, frameNo) {
  if (!anim.userDataPtr || frameNo < 0 || frameNo >= anim.numFrames) return [];
  const b = ssbp._bin;
  let p = b.u32(anim.userDataPtr + Math.floor(frameNo) * 4);
  if (!p) return [];
  const count = b.u16(p); p += 2;
  const out = [];
  const int = () => { const v = b.s32(p); p += 4; return v; };
  for (let i = 0; i < count; i++) {
    const flags = b.u16(p), partIndex = b.u16(p + 2); p += 4;
    if (!pack.parts[partIndex] || flags & ~15) throw new Error('UserData ssbp inválido');
    const data = { flags, partIndex, partName: pack.parts[partIndex].name, frameNo,
      integer: 0, rect: null, point: null, str: '', string: '', strSize: 0 };
    if (flags & 1) data.integer = int();
    if (flags & 2) data.rect = [int(), int(), int(), int()];
    if (flags & 4) data.point = [int(), int()];
    if (flags & 8) {
      data.strSize = b.u16(p); p += 2;
      data.str = data.string = b.str(int());
    }
    out.push(data);
  }
  return out;
}

// Decodifica el estado de todas las partes en un cuadro. Devuelve la lista en orden de dibujo.
export function decodeFrame(ssbp, pack, anim, frameNo) {
  const b = ssbp._bin;
  let pos = anim.frameOffsets[frameNo];
  const rd16 = () => { const v = b.s16(pos); pos += 2; return v; };
  const rdU16 = () => { const v = b.u16(pos); pos += 2; return v; };
  const rd32 = () => { const v = b.u32(pos); pos += 4; return v; };
  const rdF = () => { const v = b.f32(pos); pos += 4; return v; };
  const F = PART_FLAG;

  const out = [];
  for (let i = 0; i < pack.parts.length; i++) {
    const partIndex = rd16();
    const init = anim.initial[partIndex];
    const flags = rd32();
    const s = {
      partIndex,
      order: i,
      flags,
      cellIndex: flags & F.CELL_INDEX ? rd16() : init.cellIndex,
      x: flags & F.POSITION_X ? rd16() : init.x,
      y: flags & F.POSITION_Y ? rd16() : init.y,
      z: flags & F.POSITION_Z ? rd16() : init.z,
      pivotX: flags & F.PIVOT_X ? rdF() : init.pivotX,
      pivotY: flags & F.PIVOT_Y ? rdF() : init.pivotY,
      rotX: flags & F.ROTATION_X ? rdF() : init.rotX,
      rotY: flags & F.ROTATION_Y ? rdF() : init.rotY,
      rotZ: flags & F.ROTATION_Z ? rdF() : init.rotZ,
      scaleX: flags & F.SCALE_X ? rdF() : init.scaleX,
      scaleY: flags & F.SCALE_Y ? rdF() : init.scaleY,
      opacity: flags & F.OPACITY ? rd16() : init.opacity,
      sizeX: flags & F.SIZE_X ? rdF() : init.sizeX,
      sizeY: flags & F.SIZE_Y ? rdF() : init.sizeY,
      flipX: !!(flags & F.FLIP_H),
      flipY: !!(flags & F.FLIP_V),
      visible: !(flags & F.INVISIBLE),
      vt: null,
      color: null,
    };
    // Atributos de UV y radio: se leen para avanzar el cursor; el visor no los usa todavía.
    if (flags & F.U_MOVE) rdF();
    if (flags & F.V_MOVE) rdF();
    if (flags & F.UV_ROTATION) rdF();
    if (flags & F.U_SCALE) rdF();
    if (flags & F.V_SCALE) rdF();
    if (flags & F.BOUNDINGRADIUS) rdF();

    if (flags & F.VERTEX_TRANSFORM) {
      const vf = rdU16();
      const vt = [0, 0, 0, 0, 0, 0, 0, 0]; // lt, rt, lb, rb (x, y)
      for (let v = 0; v < 4; v++) {
        if (vf & (1 << v)) {
          vt[v * 2] = rd16();
          vt[v * 2 + 1] = rd16();
        }
      }
      s.vt = vt;
    }
    if (flags & F.COLOR_BLEND) {
      const typeAndFlags = rdU16();
      const cbFlags = (typeAndFlags >> 8) & 0xff;
      const colors = [];
      if (cbFlags & VERTEX_FLAG.ONE) {
        const rate = rdF();
        const c = rd32();
        for (let v = 0; v < 4; v++) colors.push({ rate, argb: c });
      } else {
        for (let v = 0; v < 4; v++) {
          if (cbFlags & (1 << v)) colors.push({ rate: rdF(), argb: rd32() });
          else colors.push(null);
        }
      }
      s.color = { func: typeAndFlags & 0xff, colors };
    }
    s.instance = {
      keyframe: flags & F.INSTANCE_KEYFRAME ? rd16() : 0,
      start: flags & F.INSTANCE_START ? rd16() : 0,
      end: flags & F.INSTANCE_END ? rd16() : null,
      speed: flags & F.INSTANCE_SPEED ? rdF() : 1,
      loops: flags & F.INSTANCE_LOOP ? rd16() : 1,
      flags: flags & F.INSTANCE_LOOP_FLG ? rd16() : 0,
    };
    out.push(s);
  }
  return out;
}
