// D96: Town con el avatar propio (decisión del usuario del 2026-10-13: sin jugadores simulados).
// Contratos del cliente 3.0.2 (docs/town-avatar-d96.md):
//  - Town es un vestíbulo online (TownScene); cada jugador es un MemberObject, subclase de
//    CharacterObject (la misma clase que los personajes de combate): unidad SSBP y traje del personaje.
//  - FUN_007dc1cc añade el miembro propio al suelo (Ground, `AddMemberToGroundEvent`) y el fondo lo
//    sigue (vtable +0x2d4). FUN_007dc8a8 elige la entrada: x al azar en [100, 1300] y z al azar entre
//    −0.05·x y 0.0916667·x − 230 (DAT_007dc938…944).
//  - Coordenadas del mundo en unidades de combate. FUN_0081cd48 proyecta un miembro en el fondo como
//    ((x + z·A)·1.82, (y − z·0.7071)·1.82) (DAT_0081cf30/34); el constructor de Town (FUN_007df5bc)
//    pone A = 0 (FUN_0089e6cc). FUN_007dc1cc limita el mundo a background.f2/1.82 de ancho y
//    background.f3/0.7071/1.82 de profundidad: el fondo de la plaza queda a f3 = 350 px.
//  - El suelo es la capa sin imagen de background.f8 (f3=1: y=160, zOrder 11) con sombras
//    `images/battle/shadow.png` (FUN_0081d7b8). El arte del personaje mide 1/1.82 unidades por píxel
//    (como en combate), así que en el fondo se ve a escala 1.
//  - FUN_0081cd48: una capa con f17 < 1 baja su opacidad 5·60 por segundo hasta f17·255 mientras el
//    rectángulo de un miembro la cruza, y la recupera al salir (columnas delanteras, f17 = 0.5).
// Sin servidor no hay otros jugadores, chat ni gestos remotos.
import {Character} from '../character.js';
import {SSRenderer, boundsOf} from '../renderer.js';
import {aplicar, invertir, mul} from './pantalla.js';
import {imagen} from './recursos.js';

export const TOWN_AVATAR = Object.freeze({
  coseno: 0.70710677,          // DAT_007dc690 / DAT_0081cf30
  pixelesPorUnidad: 1.82,      // DAT_007dc694 / DAT_0081cf34
  desvanecer: 5 * 60,          // FUN_0081cd48: opacidad (0–255) por segundo
  entrada: Object.freeze({xMin: 100, xMax: 1300, a: -0.05, b: 0.09166667, c: 0, d: -230}), // FUN_007dc8a8
  // CharacterObject: caminar 248 × velocidad del personaje (FUN_0084f384, mismo valor que en combate).
  velocidad: 248,
  // PROVISIONAL: ancho de la sombra como en combate (220 px de arte), alfa 0.6.
  sombra: Object.freeze({ancho: 220, alfa: 0.6}),
  llegada: 2,                  // unidades: distancia a la que se considera alcanzado el destino
});

/** Punto de entrada de FUN_007dc8a8. `azar` devuelve [0, 1). */
export function puntoEntrada(azar = Math.random) {
  const {xMin, xMax, a, b, c, d} = TOWN_AVATAR.entrada;
  const x = xMin + azar() * (xMax - xMin);
  const z1 = x * a + c, z2 = x * b + d;
  return {x, z: z1 + azar() * (z2 - z1)};
}

/** Límites del suelo (FUN_007dc1cc): x en [0, ancho/1.82], z en [−profundidad/cos 45°/1.82, 0]. */
export function limitesSuelo(ancho = 2500, profundidad = 350) {
  const k = TOWN_AVATAR.pixelesPorUnidad;
  return {xMin: 0, xMax: ancho / k, zMin: -profundidad / TOWN_AVATAR.coseno / k, zMax: 0};
}

const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
export function dentroSuelo(p, lim) {
  return {x: limitar(p.x, lim.xMin, lim.xMax), z: limitar(p.z, lim.zMin, lim.zMax)};
}

/** Posición (unidades del mundo, y hacia arriba) de un punto (x, z); el nodo del suelo escala ×1.82. */
export const proyectar = (x, z) => [x, -z * TOWN_AVATAR.coseno];
/** Inversa de proyectar: punto del nodo del suelo → (x, z) del mundo. */
export const desproyectar = (gx, gy) => ({x: gx, z: -gy / TOWN_AVATAR.coseno});

/** Estado lógico del avatar: posición, destino, orientación y animación (sin dibujo, para pruebas). */
export class MovimientoTown {
  constructor(inicio, limites, {velocidad = 1} = {}) {
    this.limites = limites;
    Object.assign(this, dentroSuelo(inicio, limites));
    this.destino = null;
    this.dir = 1;
    this.velocidad = TOWN_AVATAR.velocidad * (velocidad || 1);
  }
  get caminando() { return Boolean(this.destino); }
  get animacion() { return this.destino ? 'walk' : 'wait'; }
  ir(destino) {
    const d = dentroSuelo(destino, this.limites);
    if (Math.hypot(d.x - this.x, d.z - this.z) <= TOWN_AVATAR.llegada) { this.destino = null; return; }
    this.destino = d;
    if (Math.abs(d.x - this.x) > 1e-6) this.dir = d.x > this.x ? 1 : -1;
  }
  actualizar(dt) {
    if (!this.destino || !(dt > 0)) return;
    const dx = this.destino.x - this.x, dz = this.destino.z - this.z, dist = Math.hypot(dx, dz), paso = this.velocidad * dt;
    if (paso >= dist) { this.x = this.destino.x; this.z = this.destino.z; this.destino = null; return; }
    this.x += dx / dist * paso; this.z += dz / dist * paso;
  }
}

let superficie = null;
const superficieTown = () => superficie ??= (() => {
  const canvas = document.createElement('canvas'), copia = document.createElement('canvas');
  return {canvas, copia, renderer: new SSRenderer(canvas), fondo: null};
})();

/** Carga la unidad del personaje (Character de combate) para dibujarla en Town. */
export async function cargarAvatarTown({unidad, traje} = {}) {
  if (!unidad) return null;
  const {renderer} = superficieTown();
  const ch = await Character.load(renderer, unidad, {scale: 1 / TOWN_AVATAR.pixelesPorUnidad, costume: traje ?? undefined});
  ch.play('wait', {loop: true});
  return ch;
}

/**
 * Avatar en el suelo de la ciudad. `ciudad` es el nodo de componerCiudadTown; se le añade el nodo
 * del suelo con su zOrder original y se mueve la cámara antes de dibujar las capas.
 */
export class AvatarTown {
  constructor(ciudad, {inicio = puntoEntrada(), velocidad = 1, moverCamara, reloj = () => performance.now() / 1000} = {}) {
    this.ciudad = ciudad;
    this.mov = new MovimientoTown(inicio, limitesSuelo(ciudad._ancho, ciudad._profundidad), {velocidad});
    this.personaje = null;
    this.sombra = null;
    this.matriz = null;
    this.reloj = reloj;
    this.ultimo = null;
    this.moverCamara = moverCamara;
    const s = ciudad._suelo ?? {x: 0, y: 0, zOrder: 0};
    this.suelo = {visible: true, alpha: 255, clase: 'Node', nombre: 'town_suelo', x: s.x, y: s.y, ancho: 0, alto: 0,
      anclaX: 0, anclaY: 0, escalaX: TOWN_AVATAR.pixelesPorUnidad, escalaY: TOWN_AVATAR.pixelesPorUnidad,
      rotX: 0, rotY: 0, zOrder: s.zOrder, hijos: [],
      _sueloTown: true, alDibujar: (ctx, _p, m) => this.dibujar(ctx, m)};
    ciudad.hijos.push(this.suelo);
    ciudad.antesDeDibujar = () => this.actualizar();
    this.actualizarCamara();
  }
  ponerPersonaje(ch) { this.personaje = ch; if (ch) ch.play(this.mov.animacion, {loop: true}); }
  ponerSombra(img) { this.sombra = img; }
  actualizarCamara() { this.moverCamara?.(this.ciudad, this.suelo.x + this.mov.x * TOWN_AVATAR.pixelesPorUnidad); }
  actualizar() {
    const t = this.reloj(), dt = this.ultimo == null ? 0 : Math.min(.1, Math.max(0, t - this.ultimo));
    this.ultimo = t;
    this.mov.actualizar(dt);
    const ch = this.personaje;
    if (ch) {
      ch.play(this.mov.animacion, {loop: true});
      ch.face(this.mov.dir);
      ch.update(dt);
    }
    this.actualizarCamara();
    desvanecerCapas(this.ciudad.hijos, this.rectangulo(), dt);
  }
  /** Rectángulo del miembro en el fondo como en FUN_0081cd48 (sin el desplazamiento del nodo del suelo). */
  rectangulo() {
    const k = TOWN_AVATAR.pixelesPorUnidad, t = this.tamano;
    if (!t) return null;
    const [x, y] = proyectar(this.mov.x, this.mov.z);
    return {x: (x - t.ancho / 2) * k, y: y * k, ancho: t.ancho * k, alto: t.alto * k};
  }
  /** Toque en coordenadas del lienzo: devuelve true si se aceptó un destino en el suelo. */
  tocar(px, py) {
    const inv = this.matriz && invertir(this.matriz);
    if (!inv) return false;
    const [gx, gy] = aplicar(inv, px, py);
    this.mov.ir(desproyectar(gx, gy));
    return true;
  }
  dibujar(ctx, m) {
    this.matriz = m;
    const [gx, gy] = proyectar(this.mov.x, this.mov.z);
    if (this.sombra) {
      const w = TOWN_AVATAR.sombra.ancho / TOWN_AVATAR.pixelesPorUnidad, h = this.sombra.height / this.sombra.width * w;
      ctx.setTransform(...mul(m, [1, 0, 0, -1, gx - w / 2, gy + h / 2]));
      ctx.globalAlpha *= TOWN_AVATAR.sombra.alfa;
      ctx.drawImage(this.sombra, 0, 0, w, h);
    }
    const ch = this.personaje;
    if (!ch?.anim) return;
    ch.x = 0; ch.y = 0;
    const quads = ch.quads();
    // PROVISIONAL: tamaño del miembro (+0x24/+0x28, no leído) = caja del dibujo actual.
    if (quads.length) { const b = boundsOf(quads); this.tamano = {ancho: b.maxX - b.minX, alto: b.maxY - b.minY}; }
    for (const q of quads) q.pts = q.pts.map(([x, y]) => aplicar(m, gx + x, gy + y));
    if (!quads.length) return;
    componerQuads(ctx, quads);
  }
}

/** Caja de un sprite (unidades de su padre) con ancla y escala, incluida la escala negativa. */
export function cajaSprite(n) {
  const xs = [(0 - n.anclaX) * n.ancho * n.escalaX, (1 - n.anclaX) * n.ancho * n.escalaX];
  const ys = [(0 - n.anclaY) * n.alto * n.escalaY, (1 - n.anclaY) * n.alto * n.escalaY];
  return {x: n.x + Math.min(...xs), y: n.y + Math.min(...ys), ancho: Math.abs(xs[1] - xs[0]), alto: Math.abs(ys[1] - ys[0])};
}
const cruzan = (a, b) => a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;

/** FUN_0081cd48: capas con f17 < 1 se aclaran mientras el miembro queda detrás y vuelven a 255. */
export function desvanecerCapas(capas, rect, dt) {
  const paso = Math.trunc(dt * TOWN_AVATAR.desvanecer);
  for (const n of capas) {
    if (n._transparencia == null) continue;
    const minimo = Math.trunc(n._transparencia * 255);
    n.alpha = rect && cruzan(cajaSprite(n), rect) ? Math.max(minimo, n.alpha - paso) : Math.min(255, n.alpha + paso);
  }
}

/** Dibuja quads (en px del lienzo) sobre lo ya dibujado, copiando sólo la región que ocupan. */
function componerQuads(ctx, quads) {
  const c = ctx.canvas, b = boundsOf(quads);
  const rx = Math.max(0, Math.floor(b.minX) - 2), ry = Math.max(0, Math.floor(b.minY) - 2);
  const rw = Math.min(c.width, Math.ceil(b.maxX) + 2) - rx, rh = Math.min(c.height, Math.ceil(b.maxY) + 2) - ry;
  if (rw <= 0 || rh <= 0) return;
  const s = superficieTown(), {canvas, copia, renderer} = s, gl = renderer.gl;
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

/** Sombra de los personajes del suelo (FUN_0081d7b8). */
export const cargarSombraTown = () => imagen('images/battle/shadow.png');
