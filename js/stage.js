import { rutaWeb } from './rutas.js';
// Fondo de batalla por capas con parallax. El acomodo real de las capas está en los datos del
// juego (aún sin leer); estos valores se ajustaron a ojo comparando con el thumbnail del escenario.

import { imageQuad } from './renderer.js';
import { loadImage } from './character.js';
import { CAMPO, CamaraCampo, spritesFondo, posicionParalaje, rectSprite } from './campo.js';

// p = factor de parallax (1 = se mueve con el suelo), y = borde inferior en el mundo,
// every/at = si la capa no se repite pegada sino cada `every` unidades empezando en `at`.
export const STAGES = {
  2006: {
    name: 'Bosque de baobabs',
    sky: [0.62, 0.8, 0.9, 1],
    back: [
      { file: 'sky.png', p: 0.05, y: 120 },
      { file: 'forest2.png', p: 0.2, y: 250 },
      { file: 'wood3.png', p: 0.35, y: 230, every: 2400, at: 250 },
      { file: 'wood1.png', p: 0.35, y: 230, every: 2400, at: 1150 },
      { file: 'wood2.png', p: 0.35, y: 210, every: 2400, at: 1800 },
      { file: 'forest1.png', p: 0.6, y: 175 },
      { file: 'belt1.png', p: 1, y: 0 },
    ],
    front: [
      { file: 'front.png', p: 1.12, y: -165 },
      { file: 'forefront.png', p: 1.3, y: -140 },
    ],
  },
};

export class Stage {
  static async load(renderer, id) {
    const def = STAGES[id];
    const dir = rutaWeb(`/assets/images/background/${id}/`);
    const load = async (layers) => Promise.all(layers.map(async (l) => ({
      ...l,
      tex: renderer.createTexture(await loadImage(dir + l.file)),
    })));
    return new Stage(def, await load(def.back), await load(def.front));
  }

  constructor(def, back, front) {
    this.def = def;
    this.back = back;
    this.front = front;
  }

  // Quads de una lista de capas para la cámara en camX con media anchura visible halfW.
  layerQuads(layers, camX, halfW) {
    const quads = [];
    for (const l of layers) {
      const period = l.every ?? l.tex.w;
      const at = l.at ?? 0;
      const center = camX * l.p; // coordenada de la capa en el centro de la pantalla
      const first = Math.floor((center - halfW - l.tex.w - at) / period);
      const last = Math.ceil((center + halfW - at) / period);
      for (let k = first; k <= last; k++) {
        const lx = k * period + at;
        // -1 px de solape para que no se vean costuras entre mosaicos.
        quads.push(imageQuad(l.tex, lx + camX * (1 - l.p), l.y, l.tex.w + (l.every ? 0 : 1), l.tex.h));
      }
    }
    return quads;
  }
}

/** D106: fondo de combate con las capas de background.json (data/fondos.json) y la cámara de FieldHorizontal.
 *  Sustituye a Stage (capas acomodadas a ojo) cuando el escenario tiene fondo. */
export class FondoBatalla {
  static async load(renderer, fondo, camara = null, cache = new Map()) {
    const rutas = new Set();
    for (const c of fondo.capas ?? []) {
      if (c.tipo === 2 && c.archivo && c.carpeta) rutas.add(`images/background/${c.carpeta}/${c.archivo}`);
      if (c.negro) rutas.add(CAMPO.negro);
    }
    const texturas = new Map();
    await Promise.all([...rutas].map(async (ruta) => {
      if (!cache.has(ruta)) cache.set(ruta, loadImage(rutaWeb(`/assets/${ruta}`)).then((img) => renderer.createTexture(img)).catch(() => null));
      const t = await cache.get(ruta);
      if (t) texturas.set(ruta, t);
    }));
    const tamanos = Object.fromEntries([...texturas].map(([r, t]) => [r, { w: t.w, h: t.h }]));
    const camaraCampo = new CamaraCampo(fondo, camara);
    return new FondoBatalla(fondo, camaraCampo, spritesFondo(fondo, tamanos, camaraCampo.g), texturas);
  }

  constructor(fondo, camara, sprites, texturas) {
    this.fondo = fondo;
    this.camara = camara;
    this.sprites = sprites;
    this.texturas = texturas;
    this.def = { sky: [0, 0, 0, 1] }; // fuera del fondo: negro (color de borrado)
  }

  /** Quads en unidades del mundo: {atras, delante} del campo (las unidades van entre ambas, en el zOrder del campo).
   *  `suelo` = y del mundo de la línea delantera del campo (z = 0). */
  quads(suelo) {
    const cam = this.camara.actual;
    const atras = [], delante = [];
    if (!cam) return { atras, delante };
    const par = this.camara.paralaje(cam), P = CAMPO.pixelesPorUnidad, [mx, my] = [CAMPO.pantalla[0] / 2, CAMPO.pantalla[1] / 2];
    // Centro de la pantalla = punto de la cámara: mundo (cam.x/1.82, suelo + cam.y/1.82).
    const cx = cam.x / P, cy = suelo + cam.y / P, k = cam.s * P;
    let lista = atras;
    for (const sp of this.sprites) {
      if (sp.campo) { lista = delante; continue; }
      const t = this.texturas.get(sp.ruta);
      if (!t) continue;
      const [lx, ly] = posicionParalaje(sp, par, cam.s, this.camara.g.p240);
      const r = rectSprite(sp, t, lx, ly);
      const [sx, sy] = this.camara.aPantalla(r.x, r.y, cam, par);
      const q = imageQuad(t, cx + (sx - mx) / k, cy + (sy - my) / k, r.w / P, r.h / P);
      if (sp.volteo[0]) q.uvs = q.uvs.map(([u, v]) => [1 - u, v]);
      if (sp.volteo[1]) q.uvs = q.uvs.map(([u, v]) => [u, 1 - v]);
      lista.push(q);
    }
    return { atras, delante };
  }
}
