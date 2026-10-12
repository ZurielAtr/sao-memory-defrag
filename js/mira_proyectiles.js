// D74: BulletCircle / BulletLineNode consumen el gestor57 del actor.
// Evidencia privada: extraido/proyectiles_apuntar_objetos_d74.c.
import { PIXELES_POR_UNIDAD } from './cajas.js';
import { imageQuad } from './renderer.js';
import { loadImage } from './character.js';
import { rutaWeb } from './rutas.js';

export const RECURSOS_MIRA = [1, 2, 3].map((n) => `images/battle/bullet_circle_${n}.png`);

// FUN_00877e2c: el recurso depende de scaleX, no de un contador de cuadros.
export function imagenCirculo57(escala) { return escala <= .7 ? 0 : escala <= .8 ? 1 : 2; }

const interpolar = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => t * (2 - t); // EaseQuadraticActionOut

/** ScaleTo de 00877b0c: introducción de .4s y ciclos de .2 + .15 + .8s. */
export function escalaCirculo57(tiempo) {
  const t = Math.max(0, tiempo);
  if (t < .4) return interpolar(.7, 1.1, easeOut(t / .4));
  const ciclo = Math.floor((t - .4) / 1.15), fase = (t - .4) - ciclo * 1.15;
  if (fase < .2) return interpolar(ciclo === 0 ? 1.1 : 2, .7, fase / .2);
  if (fase < .35) return .7;
  return interpolar(.7, 2, easeOut((fase - .35) / .8));
}

/** RotateBy del mismo constructor: +60°, después ciclos (+120°, -60°, +60°). */
export function estiloCirculo57(tiempo, rotacionInicial = 0) {
  const t = Math.max(0, tiempo);
  let rotacion;
  if (t < .4) rotacion = rotacionInicial + 60 * easeOut(t / .4);
  else {
    const ciclo = Math.floor((t - .4) / 1.15), fase = (t - .4) - ciclo * 1.15;
    const inicio = rotacionInicial + 60 + ciclo * 120;
    if (fase < .2) rotacion = inicio + 120 * fase / .2;
    else if (fase < .35) rotacion = inicio + 120 - 60 * Math.min(1, (fase - .2) / .01);
    else rotacion = inicio + 60 + 60 * easeOut((fase - .35) / .8);
  }
  return { escala: escalaCirculo57(t), rotacion, alpha: 1 };
}

// _INIT_47: reflectable naranja; no reflectable rojo. FUN_005e4450 selecciona el color.
export function colorLinea57(estado, ficha) {
  const refleja = estado?.modo === 1 || (estado?.modo !== 2 && !!ficha?.crudo?.f27);
  return refleja ? [1, .5, 0, .7] : [1, .2, .2, .7];
}

/** emisor.x/y son la raíz dibujada en unidades del port; los deltas57 son físicos. */
export function geometriaMira57(estado, emisor, { proyeccionX = 0.49512147903442383 } = {}) {
  if (!estado?.vector?.some((v) => v !== 0)) return null;
  const proyectar = ([x, y, z = 0]) => [x + z * proyeccionX, y - z * Math.SQRT1_2];
  const offset = proyectar(estado.offset ?? [0, 0, 0]);
  const vector = proyectar(estado.vector);
  const origen = [emisor.x + offset[0], emisor.y + offset[1]];
  return {
    origen, destino: [origen[0] + vector[0], origen[1] + vector[1]],
    longitud: Math.hypot(...vector), angulo: estado.angulo ?? Math.atan2(vector[1], vector[0]),
    grosor: 10 / PIXELES_POR_UNIDAD,
    circulo: !!estado.objetivo && (emisor.arma ?? emisor.pj?.arma) !== 11,
  };
}

function rotarQuad(q, origen, angulo) {
  const c = Math.cos(angulo), s = Math.sin(angulo);
  q.pts = q.pts.map(([x, y]) => {
    x -= origen[0]; y -= origen[1];
    return [origen[0] + x * c - y * s, origen[1] + x * s + y * c];
  });
  return q;
}

/** Texturas originales cargadas desde los recursos privados montados por la APK. */
export class MiraProyectiles {
  static async cargar(renderer) {
    const imagenes = await Promise.all(RECURSOS_MIRA.map((p) => loadImage(rutaWeb(`/assets/${p}`))));
    const pixel = document.createElement('canvas'); pixel.width = pixel.height = 1;
    const ctx = pixel.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1, 1);
    return new MiraProyectiles(imagenes.map((img) => renderer.createTexture(img)), renderer.createTexture(pixel));
  }

  constructor(texturas, blanca) {
    this.texturas = texturas;
    this.blanca = blanca;
    this.ocultar();
  }

  clonar() { return new MiraProyectiles(this.texturas, this.blanca); }

  ocultar() {
    this.geometria = null; this.objetivo = null; this.tiempo = 0;
    // CallFunc reinicia la escala pero no la rotación conservada por el Sprite.
    this.rotacionInicial = this.estilo?.rotacion ?? 0;
  }

  actualizar(estado, emisor, { ficha, proyeccionX } = {}) {
    const g = geometriaMira57(estado, emisor, { proyeccionX });
    if (!g) { this.ocultar(); return; }
    if (!g.circulo || estado.objetivo !== this.objetivo) {
      this.rotacionInicial = this.estilo?.rotacion ?? 0;
      this.tiempo = 0;
    }
    this.objetivo = g.circulo ? estado.objetivo : null;
    if (g.circulo) {
      // 00877f14 sólo adelanta la acción, nunca retrocede si el reloj efectivo disminuye.
      this.tiempo = Math.max(this.tiempo, (estado.tiempoObjetivo ?? 0) - (estado.ajusteTiempo ?? 0), 0);
      this.estilo = estiloCirculo57(this.tiempo, this.rotacionInicial);
    }
    this.geometria = g;
    this.colorLinea = colorLinea57(estado, ficha);
  }

  aparecer(estado, emisor, opciones) { this.ocultar(); this.actualizar(estado, emisor, opciones); }

  quads({ estilo = this.estilo, colorLinea = this.colorLinea, anclaLinea = [0, .5] } = {}) {
    const g = this.geometria;
    if (!g) return [];
    const out = [];
    if (this.blanca && colorLinea && anclaLinea) {
      const q = imageQuad(this.blanca, g.origen[0] - g.longitud * anclaLinea[0],
        g.origen[1] - g.grosor * anclaLinea[1], g.longitud, g.grosor, colorLinea[3] ?? 1);
      q.colors = Array.from({ length: 4 }, () => ({ rgba: [...colorLinea], rate: 1, func: 1 }));
      q.name = 'bullet_line';
      out.push(rotarQuad(q, g.origen, g.angulo));
    }
    if (g.circulo && estilo?.alpha > 0) {
      const tex = this.texturas[imagenCirculo57(estilo.escala)];
      if (tex) {
        const w = tex.w * estilo.escala / PIXELES_POR_UNIDAD;
        const h = tex.h * estilo.escala / PIXELES_POR_UNIDAD;
        const q = imageQuad(tex, g.destino[0] - w / 2, g.destino[1] - h / 2, w, h, estilo.alpha);
        q.name = 'bullet_circle';
        out.push(rotarQuad(q, g.destino, -estilo.rotacion * Math.PI / 180));
      }
    }
    return out;
  }
}
