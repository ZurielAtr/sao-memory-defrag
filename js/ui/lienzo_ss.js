// D96: composición de SpriteStudio (WebGL) sobre la interfaz 2D. Un único renderer compartido por los
// modelos de la interfaz (avatar de Town, modelos del Árbol y de Party): sus texturas viven en este contexto.
import {SSRenderer, boundsOf} from '../renderer.js';

let estado = null;
const superficie = () => estado ??= (() => {
  const canvas = document.createElement('canvas'), copia = document.createElement('canvas');
  return {canvas, copia, renderer: new SSRenderer(canvas), fondo: null};
})();

/** Renderer donde deben crearse las texturas de los modelos de la interfaz. */
export const rendererUI = () => superficie().renderer;

/** Dibuja quads (en px del lienzo) sobre lo ya dibujado, copiando sólo la región que ocupan. */
export function componerQuads(ctx, quads) {
  const c = ctx.canvas, b = boundsOf(quads);
  const rx = Math.max(0, Math.floor(b.minX) - 2), ry = Math.max(0, Math.floor(b.minY) - 2);
  const rw = Math.min(c.width, Math.ceil(b.maxX) + 2) - rx, rh = Math.min(c.height, Math.ceil(b.maxY) + 2) - ry;
  if (rw <= 0 || rh <= 0) return;
  const s = superficie(), {canvas, copia, renderer} = s, gl = renderer.gl;
  if (canvas.width !== rw || canvas.height !== rh) { canvas.width = rw; canvas.height = rh; }
  if (copia.width !== rw || copia.height !== rh) { copia.width = rw; copia.height = rh; }
  const cc = copia.getContext('2d');
  cc.clearRect(0, 0, rw, rh);
  cc.drawImage(c, rx, ry, rw, rh, 0, 0, rw, rh);
  s.fondo ??= renderer.createTexture(copia);
  gl.bindTexture(gl.TEXTURE_2D, s.fondo.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, copia);
  // Lienzo (y hacia abajo) → espacio del renderer (centrado, y hacia arriba).
  for (const q of quads) q.pts = q.pts.map(([x, y]) => [x - rx - rw / 2, rh / 2 - (y - ry)]);
  renderer.view = {zoom: 1, x: 0, y: 0};
  renderer.begin();
  const blanco = {rgba: [1, 1, 1, 1], rate: 0, func: -1};
  renderer.drawQuads([{tex: s.fondo, alpha: 1, blend: 0, pts: [[-rw / 2, rh / 2], [rw / 2, rh / 2], [-rw / 2, -rh / 2], [rw / 2, -rh / 2]],
    uvs: [[0, 0], [1, 0], [0, 1], [1, 1]], colors: [blanco, blanco, blanco, blanco]}]);
  renderer.drawQuads(quads);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(canvas, rx, ry);
}

