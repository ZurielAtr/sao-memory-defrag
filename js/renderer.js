// Renderizador WebGL de animaciones SpriteStudio 5 (formato del juego, ver ssbp.js).
// Replica SS5PlayerForCocos2d-x: matriz de cada parte = padre * T(x,y) * Rz * S(sx,sy),
// ancla según pivote de la celda + pivote animado, deformación de vértices, mezcla de
// color por vértice y modos de fusión por parte. Coordenadas del mundo con Y hacia arriba.

import { decodeFrame, PART_FLAG, PART_TYPE, BLEND } from './ssbp.js';
import { buildEffectQuads, effectStartFrames } from './ssbp_effects.js';

export const POSITION_SCALE = 0.1; // el juego guarda posiciones en décimas de píxel

const VS = `
attribute vec2 aPos;
attribute vec2 aUv;
attribute vec4 aColor;
attribute vec2 aBlend; // x = rate, y = función (0 mix, 1 mul, 2 add, 3 sub, -1 sin mezcla)
attribute float aAlpha;
uniform vec4 uView; // escala x/y, desplazamiento x/y en clip space
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vBlend;
varying float vAlpha;
void main() {
  vUv = aUv; vColor = aColor; vBlend = aBlend; vAlpha = aAlpha;
  gl_Position = vec4(aPos * uView.xy + uView.zw, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vBlend;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uTex, vUv);
  vec3 c = t.rgb;
  float rate = vBlend.x;
  if (vBlend.y > -0.5) {
    if (vBlend.y < 0.5) c = mix(c, vColor.rgb, rate);
    else if (vBlend.y < 1.5) c = c * mix(vec3(1.0), vColor.rgb, rate);
    else if (vBlend.y < 2.5) c = c + vColor.rgb * rate;
    else c = c - vColor.rgb * rate;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), t.a * vAlpha);
}`;

const FLOATS_PER_VERTEX = 11; // pos2 uv2 color4 blend2 alpha1
const NO_COLOR = { rgba: [1, 1, 1, 1], rate: 0, func: -1 };

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// Afín 2D: [a, b, c, d, e, f] con x' = a x + c y + e, y' = b x + d y + f.
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function localMatrix(s) {
  const r = (s.rotZ * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos * s.scaleX, sin * s.scaleX, -sin * s.scaleY, cos * s.scaleY, s.x * POSITION_SCALE, s.y * POSITION_SCALE];
}

// Quads de un cuadro de animación. `textures` mapea índice de cellMap -> textura.
// opts: x, y (posición en el mundo), scale, flipX, alpha, hidden (Set de nombres de parte).
export function partMatrices(ssbp, pack, anim, frameNo, opts = {}, states = decodeFrame(ssbp, pack, anim, frameNo)) {
  const byPart = new Array(pack.parts.length);
  for (const s of states) byPart[s.partIndex] = s;

  const sc = opts.scale ?? 1;
  const base = opts.matrix ?? [opts.flipX ? -sc : sc, 0, 0, sc, opts.x ?? 0, opts.y ?? 0];
  const mats = new Array(pack.parts.length);
  for (let i = 0; i < pack.parts.length; i++) {
    const s = byPart[i];
    const part = pack.parts[i];
    const parent = part.parent >= 0 ? mats[part.parent] : base;
    const ajuste = opts.rotaciones?.get(part.name) ?? 0;
    mats[i] = s ? mul(parent, localMatrix(ajuste ? { ...s, rotZ: s.rotZ + ajuste } : s)) : parent;
  }

  return mats;
}

export function buildCharacterQuads(ssbp, textures, pack, anim, frameNo, opts = {}) {
  const states = decodeFrame(ssbp, pack, anim, frameNo);
  const mats = partMatrices(ssbp, pack, anim, frameNo, opts, states);
  const globalAlpha = opts.alpha ?? 1;
  const quads = [];
  for (const s of states) {
    const part = pack.parts[s.partIndex];
    if (!s.visible || s.opacity <= 0) continue;
    if (opts.hidden?.has(part.name)) continue;
    if (opts.attachments) quads.push(...(opts.attachments({ part, state:s, matrix:mats[s.partIndex],
      alpha:globalAlpha * s.opacity / 255, frameNo }) ?? []));
    if (part.type === PART_TYPE.EFFECT && (opts.effects || opts.particles)) {
      const effect = ssbp.effects?.find(e => e.name === part.effectName);
      if (effect) {
        const start = effectStartFrames(ssbp, pack, anim).get(s.partIndex) ?? 0;
        const extra = buildEffectQuads(ssbp, textures, effect, (opts.effectFrame ?? frameNo) - start,
          { matrix: mats[s.partIndex], alpha: globalAlpha * s.opacity / 255, seed: opts.seed ?? 1, name: part.name });
        quads.push(...extra);
      }
      // Permite integración de otro reproductor sin perder el orden entre partes normales.
      if (typeof opts.effects === 'function') quads.push(...(opts.effects({ ssbp, textures, pack, anim, frameNo, part, state: s,
        matrix: mats[s.partIndex], alpha: globalAlpha * s.opacity / 255 }) ?? []));
      continue;
    }
    if (part.type === PART_TYPE.INSTANCE && opts.instances && (opts.depth ?? 0) < 8) {
      const slash = part.refName.lastIndexOf('/');
      const targetPack = slash < 0 ? pack : ssbp.packs.find(p => p.name === part.refName.slice(0, slash));
      const targetAnim = targetPack?.anims.find(a => a.name === part.refName.slice(slash + 1));
      if (targetAnim) {
        const ref = s.instance, start = ref.start, end = ref.end ?? targetAnim.numFrames - 1;
        const length = end - start + 1;
        const clock = ref.flags & 8 ? opts.instanceFrame ?? opts.effectFrame ?? frameNo : frameNo;
        let f = Math.floor((clock - ref.keyframe) * ref.speed);
        if (f >= 0 && length > 0) {
          const reverse = !!(ref.flags & 2), pingpong = !!(ref.flags & 4), infinite = !!(ref.flags & 1);
          const cycles = pingpong ? length * 2 : length;
          if (!infinite) f = Math.min(f, cycles * Math.max(1, ref.loops) - 1);
          f %= cycles;
          if (pingpong && f >= length) f = cycles - 1 - f;
          if (reverse) f = length - 1 - f;
          quads.push(...buildCharacterQuads(ssbp, textures, targetPack, targetAnim, start + f,
            { ...opts, matrix: mats[s.partIndex], alpha: globalAlpha * s.opacity / 255,
              effectFrame: start + f, depth: (opts.depth ?? 0) + 1 }));
        }
      }
      continue;
    }
    if (part.type !== PART_TYPE.NORMAL || s.cellIndex < 0) continue;
    const cell = ssbp.cells[s.cellIndex];
    if (!cell) continue;
    const tex = textures.get(cell.map);
    if (!tex) continue;

    const w = cell.w;
    const h = cell.h;
    let cpx = cell.pivotX;
    let cpy = cell.pivotY;
    if (s.flipX) cpx = -cpx;
    if (s.flipY) cpy = -cpy;
    const ax = s.pivotX + cpx + 0.5;
    const ay = 1 - (-s.pivotY + cpy + 0.5); // como el reproductor de cocos

    let x0 = -ax * w;
    let x1 = (1 - ax) * w;
    let y0 = -ay * h;
    let y1 = (1 - ay) * h;
    if (s.flags & PART_FLAG.SIZE_X) {
      const c = (x0 + x1) / 2;
      x0 = c - s.sizeX / 2;
      x1 = c + s.sizeX / 2;
    }
    if (s.flags & PART_FLAG.SIZE_Y) {
      const c = (y0 + y1) / 2;
      y0 = c - s.sizeY / 2;
      y1 = c + s.sizeY / 2;
    }
    // Esquinas: LT, RT, LB, RB
    const corners = [[x0, y1], [x1, y1], [x0, y0], [x1, y0]];
    if (s.vt) {
      for (let v = 0; v < 4; v++) {
        corners[v][0] += s.vt[v * 2];
        corners[v][1] += s.vt[v * 2 + 1];
      }
    }
    let u0 = cell.x / tex.w;
    let u1 = (cell.x + w) / tex.w;
    let v0 = cell.y / tex.h;
    let v1 = (cell.y + h) / tex.h;
    if (s.flipX) [u0, u1] = [u1, u0];
    if (s.flipY) [v0, v1] = [v1, v0];

    const m = mats[s.partIndex];
    const colors = [0, 1, 2, 3].map((v) => {
      const cc = s.color?.colors[v];
      if (!cc) return NO_COLOR;
      const argb = cc.argb >>> 0;
      return {
        rgba: [((argb >> 16) & 255) / 255, ((argb >> 8) & 255) / 255, (argb & 255) / 255, ((argb >>> 24) & 255) / 255],
        rate: cc.rate,
        func: s.color.func,
      };
    });
    quads.push({
      tex,
      blend: part.blend,
      pts: corners.map(([x, y]) => apply(m, x, y)),
      uvs: [[u0, v0], [u1, v0], [u0, v1], [u1, v1]],
      colors,
      alpha: (s.opacity / 255) * globalAlpha,
      name: part.name,
    });
  }
  return quads;
}

// Imagen completa como quad, con la esquina inferior izquierda en (x, y).
export function imageQuad(tex, x, y, w = tex.w, h = tex.h, alpha = 1, blend = BLEND.MIX) {
  return {
    tex,
    blend,
    pts: [[x, y + h], [x + w, y + h], [x, y], [x + w, y]],
    uvs: [[0, 0], [1, 0], [0, 1], [1, 1]],
    colors: [NO_COLOR, NO_COLOR, NO_COLOR, NO_COLOR],
    alpha,
  };
}

export function boundsOf(quads) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of quads) {
    for (const [x, y] of q.pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

export class SSRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false, antialias: true });
    if (!gl) throw new Error('WebGL no disponible');
    this.gl = gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aUv: gl.getAttribLocation(prog, 'aUv'),
      aColor: gl.getAttribLocation(prog, 'aColor'),
      aBlend: gl.getAttribLocation(prog, 'aBlend'),
      aAlpha: gl.getAttribLocation(prog, 'aAlpha'),
      uView: gl.getUniformLocation(prog, 'uView'),
      uTex: gl.getUniformLocation(prog, 'uTex'),
    };
    this.buf = gl.createBuffer();
    // Cámara: zoom (px de pantalla por unidad) y desplazamiento en px de pantalla.
    this.view = { zoom: 1, x: 0, y: 0 };
  }

  // Centra la cámara en (cx, cy) del mundo con el zoom dado.
  lookAt(cx, cy, zoom = this.view.zoom) {
    this.view.zoom = zoom;
    this.view.x = -cx * zoom;
    this.view.y = -cy * zoom;
  }

  // Convierte coordenadas del mundo a px CSS del canvas (para HUD en 2D).
  worldToScreen(x, y) {
    const { width, height } = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    return [(width / 2 + x * this.view.zoom + this.view.x) / dpr, (height / 2 - (y * this.view.zoom + this.view.y)) / dpr];
  }

  createTexture(image, { repeat = false } = {}) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tex, w: image.naturalWidth || image.width, h: image.naturalHeight || image.height };
  }

  deleteTexture(t) {
    if (t) this.gl.deleteTexture(t.tex);
  }

  begin(background = [0, 0, 0, 1]) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    gl.clearColor(...background);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  drawQuads(quads) {
    if (!quads.length) return;
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.useProgram(this.prog);
    gl.enable(gl.BLEND);
    const z = this.view.zoom;
    gl.uniform4f(this.loc.uView, (2 * z) / width, (2 * z) / height, (2 * this.view.x) / width, (2 * this.view.y) / height);
    gl.uniform1i(this.loc.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);

    const data = new Float32Array(quads.length * 6 * FLOATS_PER_VERTEX);
    let o = 0;
    for (const q of quads) {
      for (const v of [0, 1, 2, 1, 3, 2]) {
        const c = q.colors[v];
        data[o++] = q.pts[v][0]; data[o++] = q.pts[v][1];
        data[o++] = q.uvs[v][0]; data[o++] = q.uvs[v][1];
        data[o++] = c.rgba[0]; data[o++] = c.rgba[1]; data[o++] = c.rgba[2]; data[o++] = c.rgba[3];
        data[o++] = c.rate; data[o++] = c.func; data[o++] = q.alpha;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    const stride = FLOATS_PER_VERTEX * 4;
    const attr = (loc, size, off) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off * 4);
    };
    attr(this.loc.aPos, 2, 0);
    attr(this.loc.aUv, 2, 2);
    attr(this.loc.aColor, 4, 4);
    attr(this.loc.aBlend, 2, 8);
    attr(this.loc.aAlpha, 1, 10);

    for (let i = 0; i < quads.length; i++) {
      const q = quads[i];
      switch (q.blend) {
        case BLEND.ADD: gl.blendFunc(gl.SRC_ALPHA, gl.ONE); break;
        case BLEND.MUL: gl.blendFunc(gl.ZERO, gl.SRC_COLOR); break;
        case BLEND.SUB: gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR); break;
        default: gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.bindTexture(gl.TEXTURE_2D, q.tex.tex);
      gl.drawArrays(gl.TRIANGLES, i * 6, 6);
    }
  }
}
