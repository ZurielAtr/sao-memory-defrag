// D97: modelo 2D del personaje en los menús (CharacterAnimationWidget, FUN_00648bb0).
// FUN_008bcaf0 carga la unidad SSBP y el traje del personaje, reproduce `wait` en bucle y fija el
// tamaño del widget en unit.f6/f7 × 1.82 (DAT_008bd6b8). Cada pantalla escala ese tamaño a un hueco
// del CSB: el Árbol (FUN_007f423c) a 2.5 × la altura de image_icon y Party (FUN_00b76c4c) a
// 0.33 × la altura de background_character. Ver docs/arbol-zoom-modelos-d97.md.
import {Character} from '../character.js';
import {aplicar} from './pantalla.js';
import {rendererUI, componerQuads} from './lienzo_ss.js';

export const PIXELES_POR_UNIDAD = 1.82; // DAT_008bd6b8
const cargas = new Map();

/** Alto base del widget en píxeles: unit.f7 × 1.82 (ficha.fisica.tamano = [f6, f7]). */
export const altoBaseModelo = (ficha) => (ficha?.fisica?.tamano?.[1] || 165) * PIXELES_POR_UNIDAD;
/** Escala para que el alto base ocupe `alto` píxeles del CSB. */
export const escalaModelo = (ficha, alto) => alto / altoBaseModelo(ficha);

function cargarUnidad(unidad, traje) {
  const clave = `${unidad}|${traje ?? ''}`;
  if (!cargas.has(clave)) cargas.set(clave, Character.load(rendererUI(), unidad, {scale: 1, costume: traje ?? undefined})
    .catch((e) => { cargas.delete(clave); throw e; }));
  return cargas.get(clave);
}

/**
 * Nodo de la interfaz con el modelo: los pies en (x, y) del padre; `alto` en píxeles del CSB.
 * El modelo aparece al cargarse (cargarModelo); hasta entonces el nodo no dibuja nada.
 */
export function nodoModelo(nombre, {x = 0, y = 0, alto, zOrder = 0, reloj = () => performance.now() / 1000} = {}) {
  const nodo = {visible: true, alpha: 255, clase: 'Node', nombre, x, y, ancho: 0, alto: 0, anclaX: 0, anclaY: 0,
    escalaX: 1, escalaY: 1, rotX: 0, rotY: 0, zOrder, hijos: [], _modelo: {alto, ch: null, escala: 1, ultimo: null}};
  nodo.alDibujar = (ctx, _p, m) => dibujarModelo(nodo, ctx, m, reloj);
  return nodo;
}

/** Carga la unidad y el traje de la ficha (data/personajes/<id>.json) en el nodo. */
export async function cargarModelo(nodo, ficha) {
  if (!ficha?.unidad) return null;
  const base = await cargarUnidad(ficha.unidad, ficha.traje);
  const ch = new Character(base.ssbp, base.mainPack, base.textures, {scale: 1});
  ch.unit = base.unit;
  if (!ch.play('wait', {loop: true})) return null;
  Object.assign(nodo._modelo, {ch, escala: escalaModelo(ficha, nodo._modelo.alto)});
  return ch;
}

function dibujarModelo(nodo, ctx, m, reloj) {
  const mod = nodo._modelo, ch = mod.ch;
  if (!ch) return;
  const t = reloj(), dt = mod.ultimo == null ? 0 : Math.min(.1, Math.max(0, t - mod.ultimo));
  mod.ultimo = t;
  ch.update(dt);
  ch.x = 0; ch.y = 0;
  const k = mod.escala, quads = ch.quads();
  for (const q of quads) q.pts = q.pts.map(([x, y]) => aplicar(m, x * k, y * k));
  if (quads.length) componerQuads(ctx, quads);
}
