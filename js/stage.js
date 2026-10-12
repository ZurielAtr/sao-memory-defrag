import { rutaWeb } from './rutas.js';
// Fondo de batalla por capas con parallax. El acomodo real de las capas está en los datos del
// juego (aún sin leer); estos valores se ajustaron a ojo comparando con el thumbnail del escenario.

import { imageQuad } from './renderer.js';
import { loadImage } from './character.js';

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
