// Partículas SS5 v2. Parámetros del archivo; ecuaciones, patrón de emisión y
// xorshift32 del SDK oficial ssplayer_effect2.cpp / xorshift32.h.
// https://github.com/SpriteStudio/ssbpLib (MIT):
// Copyright (c) Web Technology Corp.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
import { decodeFrame, PART_TYPE, BLEND } from './ssbp.js';

const MAGIC = 7573;
const models = new WeakMap(), starts = new WeakMap();
const lerp = (a, b, t) => a + (b - a) * t;
const radians = n => n * Math.PI / 180;
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export function ss5Random(seed) {
  let y = seed >>> 0;
  const uint = () => { y ^= y << 13; y ^= y >>> 17; y ^= y << 15; return y >>> 0; };
  return { uint, float: () => (uint() >>> 9) / 8388608 };
}

// La variante v2 no guarda effect-keyframes. El reproductor inicia el efecto
// al activar su parte; precalculamos esos puntos desde la visibilidad nativa.
export function effectStartFrames(ssbp, pack, anim) {
  if (starts.has(anim)) return starts.get(anim);
  const result = new Map();
  const count = pack.parts.filter(p => p.type === PART_TYPE.EFFECT).length;
  if (count) for (let f = 0; f < anim.numFrames; f++) {
    for (const s of decodeFrame(ssbp, pack, anim, f)) {
      if (pack.parts[s.partIndex].type === PART_TYPE.EFFECT && s.visible && s.opacity > 0 && !result.has(s.partIndex)) result.set(s.partIndex, f);
    }
  }
  starts.set(anim, result);
  return result;
}

function emitter(node, effect, seed) {
  const commands = new Map(node.commands.map(c => [c.type, c]));
  const basic = commands.get(1);
  // Fallar cerrado: un efecto desconocido no se reemplaza por partículas inventadas.
  if (!basic || node.commands.some(c => ![1,2,3,4,5,6,8,10,12,13,14,16,17].includes(c.type))) return null;
  const override = commands.get(2);
  const emitterSeed = override ? override.seed + MAGIC : effect.lockSeed ? (effect.seed + 1) * MAGIC : Math.imul(seed, MAGIC);
  const random = ss5Random(emitterSeed);
  const max = Math.max(0, Math.min(10000, basic.maximumParticle));
  const emit = Math.max(1, basic.attimeCreate), delay = commands.get(3)?.delay ?? 0;
  const cycle = Math.floor(max * basic.interval / emit + .5);
  const pattern = Array.from({ length: Math.max(64, max * 8) }, () => {
    const life = Math.trunc(lerp(basic.lifespanMin, basic.lifespanMax, random.float()));
    return { life, cycle: Math.max(cycle, life) };
  });
  const seedsRandom = ss5Random(emitterSeed);
  return { node, commands, basic, emitterSeed, pattern,
    seeds: Array.from({ length: max * 3 }, () => seedsRandom.uint()),
    offsets: Array.from({ length: max }, (_, i) => delay + Math.floor(i / emit) * basic.interval),
    life: basic.lifetime + delay, infinite: commands.has(17) };
}
function modelFor(effect, seed) {
  let cache = models.get(effect);
  if (!cache) models.set(effect, cache = new Map());
  const key = effect.lockSeed ? effect.seed : seed;
  if (cache.has(key)) return cache.get(key);
  const out = effect.nodes.filter(n => n.type === 1).map(n => emitter(n, effect, seed)).filter(Boolean);
  out.sort((a, b) => a.basic.priority - b.basic.priority || a.node.index - b.node.index);
  for (const e of out) {
    const parent = effect.nodes[e.node.parent];
    e.parent = parent?.type === 2 ? out.find(v => v.node.index === parent.parent) : null;
  }
  // La semilla puede variar entre sorteos; acotar la caché sin alterar el estado.
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}

function schedule(e, time, slide = 0) {
  const out = [];
  for (let i = 0; i < e.offsets.length; i++) {
    const p = e.pattern[(i + slide * MAGIC) % e.pattern.length];
    const t = Math.trunc(time - e.offsets[i]);
    if (!p.cycle || t < 0) continue;
    const cycle = Math.trunc(t / p.cycle), start = cycle * p.cycle + e.offsets[i], end = start + p.life;
    if (!e.infinite && start >= e.life) continue;
    out.push({ slot: i, id: i + cycle, start, end, alive: start <= time && end > time });
  }
  return out;
}
function particle(e, slot, time, parentId = 0, position = [0, 0], recalc = false) {
  const c = e.commands, b = e.basic, t = time - slot.start, life = slot.end - slot.start;
  const ratio = t / life;
  const r = ss5Random((e.seeds[slot.id % e.seeds.length] + e.emitterSeed + parentId) >>> 0);
  const range = (min, max) => lerp(min, max, r.float());
  const rad = radians(b.angle + 90) + radians(b.angleVariance) * (r.float() - .5);
  const speed = range(b.speedMin, b.speedMax);
  let x = Math.cos(rad) * speed * t, y = Math.sin(rad) * speed * t;
  if (c.has(8)) {
    const trans = c.get(8), add = range(trans.min, trans.max) / life;
    x = Math.cos(rad) * (add * t + speed) * (t + 1) / 2;
    y = Math.sin(rad) * (add * t + speed) * (t + 1) / 2;
  }
  if (c.has(4)) { x += .5 * c.get(4).x * t * t; y += .5 * c.get(4).y * t * t; }
  if (c.has(5)) {
    const v = c.get(5); x += range(v.xMin, v.xMax); y += range(v.yMin, v.yMax);
  }
  x += position[0]; y += position[1];
  let rotation = 0;
  if (c.has(6)) { const v = c.get(6); rotation = range(v.min, v.max) + range(v.addMin, v.addMax) * t; }
  let rgba = [1, 1, 1, 1];
  if (c.has(10)) {
    const v = c.get(10), channels = [24,16,8,0].map(shift => {
      const a = (v.min >>> shift) & 255, b = (v.max >>> shift) & 255;
      return Math.trunc(range(Math.min(a,b), Math.max(a,b))) / 255;
    });
    rgba = [channels[1],channels[2],channels[3],channels[0]];
  }
  if (c.has(12)) {
    const { start, end } = c.get(12), per = ratio * 100;
    if (per < start) rgba[3] *= per / start;
    else if (per > end) rgba[3] *= Math.max(0, 1 - (per - end) / (100 - end));
  }
  let sx = 1, sy = 1, factor = 1;
  if (c.has(13)) {
    const v = c.get(13); sx = range(v.xMin, v.xMax); sy = range(v.yMin, v.yMax); factor = range(v.factorMin, v.factorMax);
  }
  if (c.has(14)) {
    const v = c.get(14); sx = lerp(sx, range(v.xMin, v.xMax), ratio); sy = lerp(sy, range(v.yMin, v.yMax), ratio);
    factor = lerp(factor, range(v.factorMin, v.factorMax), ratio);
  }
  sx *= factor; sy *= factor;
  if (c.has(16) && !recalc) {
    const next = particle(e, slot, time + 1, parentId, position, true);
    rotation += Math.atan2(y - next.y, x - next.x) * 180 / Math.PI + 90 + c.get(16).rotation;
  }
  return { x, y, rotation, sx, sy, rgba };
}

export function buildEffectQuads(ssbp, textures, effect, frameNo, opts = {}) {
  if (frameNo < 0) return [];
  const model = modelFor(effect, opts.seed ?? 1), out = [];
  const base = opts.matrix ?? [1,0,0,1,0,0], alpha = opts.alpha ?? 1;
  const emit = (e, time, parent = null) => {
    const cell = ssbp.cells[e.node.cellIndex], tex = cell && textures.get(cell.map);
    if (!cell || !tex) return;
    for (const slot of schedule(e, time, parent?.slot ?? 0)) {
      if (!slot.alive) continue;
      const position = parent ? particle(e.parent, parent, slot.start + parent.start) : { x:0,y:0 };
      const p = particle(e, slot, time, parent?.slot ?? 0, [position.x, position.y]);
      if (p.rgba[3] <= 0) continue;
      const rad = radians(p.rotation), cs = Math.cos(rad), sn = Math.sin(rad);
      const x0 = (-.5 - cell.pivotX) * cell.w, x1 = (.5 - cell.pivotX) * cell.w;
      const y0 = (-.5 + cell.pivotY) * cell.h, y1 = (.5 + cell.pivotY) * cell.h;
      const pts = [[x0,y1],[x1,y1],[x0,y0],[x1,y0]].map(([x,y]) => apply(base,
        p.x + cs * x * p.sx - sn * y * p.sy, p.y + sn * x * p.sx + cs * y * p.sy));
      const u0 = cell.x / tex.w, u1 = (cell.x + cell.w) / tex.w, v0 = cell.y / tex.h, v1 = (cell.y + cell.h) / tex.h;
      const color = { rgba: p.rgba, rate: 1, func: BLEND.MUL };
      out.push({ tex, pts, uvs: [[u0,v0],[u1,v0],[u0,v1],[u1,v1]],
        colors: [color,color,color,color], blend: e.node.blend === 0 ? BLEND.MIX : BLEND.ADD,
        alpha: alpha * p.rgba[3], name: `${opts.name ?? effect.name}:${e.node.index}:${slot.slot}` });
    }
  };
  for (const e of model) {
    if (e.parent) for (const parent of schedule(e.parent, frameNo)) emit(e, frameNo - parent.start, parent);
    else emit(e, frameNo);
  }
  return out;
}
