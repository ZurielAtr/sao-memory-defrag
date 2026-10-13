import { rutaWeb } from '../rutas.js';
// Dibujo de un .csb en un <canvas> 2D (D49), como lo pondría cocos2d-x: cada nodo se coloca con
// posición · rotación · escala · (−ancla × tamaño) respecto de su padre, con y hacia arriba; los hijos
// se dibujan después que el padre (orden por zOrder). Ver NOTAS.md, "Interfaz F2".
//
// PROVISIONAL (aproximaciones al motor): la opacidad se hereda siempre (en cocos, solo en los widgets
// con cascadeOpacity), el color no se hereda, las listas no se reacomodan solas (se acomodan con
// `apilar`), los Text sin tamaño propio toman el de su texto medido con la fuente del navegador, los
// sliders no se dibujan y la rotación ignora el sesgo (rotationSkewY).

import { leerCSB, recorrer } from './csb.js';
import { textura, fuenteBitmap, fuenteTTF, pilaFuentes } from './recursos.js';
import { imagenGamma } from './historia_gamma.js';

export const DISENO = { ancho: 750, alto: 1334 }; // tamaño de diseño de las pantallas (raíz de los .csb)

// Textos de la interfaz (D54): web/data/ui_textos.json = {ruta del .csb: {nombre de nodo: [texto, tamaño]}}
// (ui_file.json + ui_text.json, herramientas/exportar_interfaz.py). DEDUCCIÓN: el juego los pone por
// nombre de nodo (los .csb no marcan isLocalized); sin tabla quedan los textos de ejemplo del editor.
let tablaTextos = null;
export function textosUI() {
  tablaTextos ??= (typeof fetch === 'function' ? fetch(rutaWeb('/data/ui_textos.json')).then((r) => (r.ok ? r.json() : {})) : Promise.resolve({}))
    .catch(() => ({}));
  return tablaTextos;
}

/** Pone los textos de la tabla de un .csb en los nodos de texto con ese nombre. */
export function aplicarTextos(raiz, tabla) {
  if (!tabla) return 0;
  let n = 0;
  for (const [nodo] of recorrer(raiz)) {
    const t = tabla[nodo.nombre];
    if (!t || !('texto' in nodo)) continue;
    nodo.texto = t[0];
    if (t[1]) nodo.tamFuente = t[1];
    n++;
  }
  return n;
}

// ---------- matrices 2D [a, b, c, d, e, f] (como canvas: x' = a·x + c·y + e, y' = b·x + d·y + f) ----------
export const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const trasladar = (x, y) => [1, 0, 0, 1, x, y];
export function invertir(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
export const aplicar = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Matriz local del nodo (en el espacio de su padre), con el tamaño efectivo (w, h). */
const WIDGETS = new Set(['Button', 'CheckBox', 'ImageView', 'Text', 'TextField', 'TextBMFont', 'TextAtlas',
  'LoadingBar', 'Slider', 'Panel', 'ScrollView', 'PageView', 'ListView']);
const esWidget = (n) => WIDGETS.has(n.clase);
export function matrizLocal(n, w, h) {
  const t = (-(n.rotX ?? 0) * Math.PI) / 180; // cocos: grados en sentido horario
  const c = Math.cos(t), s = Math.sin(t);
  // Cocos 3.7 Widget::setFlippedX/Y altera la escala del nodo completo, no sólo su textura.
  // Sprite conserva su reflejo de textura (sin reflejar hijos).
  const sx = n.escalaX * (esWidget(n) && n.flipX ? -1 : 1);
  const sy = n.escalaY * (esWidget(n) && n.flipY ? -1 : 1);
  const r = [c * sx, s * sx, -s * sy, c * sy, n.x, n.y];
  return mul(r, trasladar(-n.anclaX * w, -n.anclaY * h));
}

// Recursos ya cargados (síncronos para dibujar).
const listos = new Map();
const claveRec = (r) => (r ? `${r.plist ?? ''}|${r.path}` : '');
const tex = (r) => (r ? listos.get(claveRec(r)) ?? null : null);

const medidor = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

function teñida(img, color) {
  if (!color || (color.r === 255 && color.g === 255 && color.b === 255)) return img;
  img.__tintes ??= new Map();
  const k = `${color.r},${color.g},${color.b}`;
  if (!img.__tintes.has(k)) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = `rgb(${k})`;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, 0, 0);
    img.__tintes.set(k, c);
  }
  return img.__tintes.get(k);
}

const rgb = (c, a = 1) => `rgba(${c?.r ?? 255},${c?.g ?? 255},${c?.b ?? 255},${a})`;

/** Arrastre/rueda de listas; el árbol utiliza ambos ejes (dirección 3). */
export function desplazarLista(n, dx, dy, desde = null) {
  const dir = n.interior?.direccion;
  const y = desde?.y ?? n._desplaz ?? 0, x = desde?.x ?? n._desplazX ?? 0;
  if (dir === 2) n._desplaz = Math.max(0, Math.min(n._max ?? 0, y + dx));
  else {
    n._desplaz = Math.max(0, Math.min(n._max ?? 0, y + dy));
    if (dir === 3) n._desplazX = Math.max(0, Math.min(n._maxX ?? 0, x + dx));
  }
}

export class Pantalla {
  /** Carga /assets/<ruta> (.csb) y sus recursos. */
  static async cargar(ruta) {
    const r = await fetch(rutaWeb(`/assets/${ruta.split('/').map(encodeURIComponent).join('/')}`));
    if (!r.ok) throw new Error(`no se pudo cargar ${ruta} (${r.status})`);
    const p = new Pantalla(leerCSB(await r.arrayBuffer()), ruta);
    aplicarTextos(p.raiz, (await textosUI())[ruta]);
    await p.precargar();
    return p;
  }

  constructor(datos, ruta = '') {
    this.ruta = ruta;
    this.datos = datos;
    this.raiz = datos.raiz;
    this.zonas = []; // nodos interactivos del último dibujo: { n, m (matriz a pantalla), w, h }
  }

  get ancho() {
    return this.raiz.ancho || DISENO.ancho;
  }

  get alto() {
    return this.raiz.alto || DISENO.alto;
  }

  /** Carga texturas, fuentes .ttf y .fnt de un subárbol (por defecto, toda la pantalla). */
  async precargar(nodo = this.raiz) {
    const tareas = [];
    for (const [n] of recorrer(nodo)) {
      const recs = [n.imagen, n.boton?.normal, n.boton?.pulsado, n.boton?.desactivado, n.casilla?.fondo, n.casilla?.marca];
      if (n.clase === 'TextBMFont') {
        recs.length = 0;
        if (n.imagen?.path) tareas.push(fuenteBitmap(n.imagen.path).then((f) => listos.set(`fnt|${n.imagen.path}`, f)));
      }
      for (const r of recs) if (r?.path) tareas.push(textura(r).then((t) => listos.set(claveRec(r), t)));
      if ((n.clase === 'Text' || n.clase === 'Button' || n.clase === 'TextField') && (n.fuente || n.texto)) {
        tareas.push(fuenteTTF(n.fuente));
      }
    }
    await Promise.all(tareas);
  }

  buscar(nombre, desde = this.raiz) {
    for (const [n] of recorrer(desde)) if (n.nombre === nombre) return n;
    return null;
  }

  buscarTodos(nombre, desde = this.raiz) {
    const out = [];
    for (const [n] of recorrer(desde)) if (n.nombre === nombre) out.push(n);
    return out;
  }

  /** Pone visible/oculto a todos los nodos con ese nombre. */
  mostrar(nombre, visible = true, desde = this.raiz) {
    for (const n of this.buscarTodos(nombre, desde)) n.visible = visible;
  }

  /** Cambia el texto de todos los nodos con ese nombre. */
  texto(nombre, valor, desde = this.raiz) {
    for (const n of this.buscarTodos(nombre, desde)) n.texto = String(valor);
  }

  /** Tamaño efectivo del nodo (como el contentSize de cocos). */
  tamano(n) {
    const t = tex(n.imagen ?? n.boton?.normal ?? n.casilla?.fondo);
    if (n.clase === 'Sprite' && t) return [t.width, t.height];
    if ((n.clase === 'ImageView' || n.clase === 'Button') && t && !n.scale9 && (n.ignorarTam || !n.ancho || !n.alto)) {
      return [t.width, t.height];
    }
    if (n.clase === 'Text' && !n.tamPropio && medidor) {
      medidor.font = `${n.tamFuente || 20}px ${pilaFuentes(n.fuente)}`;
      const lineas = String(n.texto ?? '').split('\n');
      const w = Math.max(...lineas.map((l) => medidor.measureText(l).width));
      return [Math.ceil(w), Math.ceil((n.tamFuente || 20) * 1.2 * lineas.length)];
    }
    if (n.clase === 'TextBMFont') {
      const f = listos.get(`fnt|${n.imagen?.path}`);
      if (f) return [anchoBitmap(f, n.texto ?? ''), f.alto];
    }
    return [n.ancho, n.alto];
  }

  /**
   * Dibuja la pantalla. `base` = matriz del espacio de diseño (y hacia arriba) al canvas.
   * @param {CanvasRenderingContext2D} ctx
   */
  dibujar(ctx, base) {
    this.zonas = [];
    this.dibujarNodo(ctx, this.raiz, base, 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  dibujarNodo(ctx, n, padre, alfaPadre, recortes = []) {
    if (!n.visible) return;
    const [w, h] = this.tamano(n);
    const m = mul(padre, matrizLocal(n, w, h));
    const alfa = alfaPadre * (n.alpha / 255);
    ctx.globalAlpha = alfa;
    this.dibujarPropio(ctx, n, m, w, h, alfa);
    if (n.clase === 'Button' || n.clase === 'CheckBox' || n.tactil || n.interior || n.clase === 'PageView') {
      this.zonas.push({ n, m, w, h, recortes });
    }
    let hijos = [...n.hijos].sort((a, b) => a.zOrder - b.zOrder);
    let mh = m;
    if (n.interior) {
      // ScrollView/ListView: los hijos van en el contenedor interior, alineado arriba (o a la izquierda).
      const ih = n.interior.alto || h, iw = n.interior.ancho || w;
      const d = n._desplaz ?? 0;
      mh = n.interior.direccion === 2 ? mul(m, trasladar(-d, 0))
        : mul(m, trasladar(n.interior.direccion === 3 ? -(n._desplazX ?? 0) : 0, h - ih + d));
      n._max = Math.max(0, n.interior.direccion === 2 ? iw - w : ih - h);
      n._maxX = Math.max(0, iw - w);
    }
    if (n.clase === 'PageView') hijos = hijos.slice(n._pagina ?? 0, (n._pagina ?? 0) + 1);
    const recorta = n.panel?.recorte || n.interior;
    if (recorta) {
      ctx.save();
      ctx.setTransform(...m);
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
    }
    const recortesHijos = recorta ? [...recortes, { m, w, h }] : recortes;
    const alfaHijos=n.cascadaAlpha===false?alfaPadre:alfa;
    for (const hijo of hijos) this.dibujarNodo(ctx, hijo, mh, alfaHijos, recortesHijos);
    if (recorta) ctx.restore();
  }

  // Imagen que llena el rectángulo (0,0)-(w,h) del nodo (y hacia arriba).
  imagenEn(ctx, img, m, w, h, n) {
    if (!img || w <= 0 || h <= 0) return;
    const fx = !esWidget(n) && n.flipX ? -1 : 1, fy = !esWidget(n) && n.flipY ? -1 : 1;
    ctx.setTransform(...mul(m, [fx, 0, 0, -fy, fx < 0 ? w : 0, fy < 0 ? 0 : h]));
    const t = imagenGamma(teñida(img, n.color), n.gamma ?? 1);
    if (n.scale9) this.nueve(ctx, t, w, h, n.scale9.insets);
    else if (n.cubrir) {
      // Llena el hueco sin deformar: recorta el centro de la imagen a la proporción del nodo (no es de cocos;
      // lo usa la interfaz para poner imágenes de otro tamaño en los huecos de ejemplo).
      const k = Math.max(w / t.width, h / t.height);
      const sw = w / k, sh = h / k;
      ctx.drawImage(t, (t.width - sw) / 2, n.cubrir === 'arriba' ? 0 : (t.height - sh) / 2, sw, sh, 0, 0, w, h);
    } else ctx.drawImage(t, 0, 0, w, h);
  }

  // Scale9: las esquinas a tamaño real, los bordes y el centro estirados. capInsets desde arriba a la izquierda.
  nueve(ctx, img, w, h, ins) {
    const iw = img.width, ih = img.height;
    let { x = 0, y = 0, width: cw = 0, height: ch = 0 } = ins ?? {};
    if (!cw || !ch) { x = iw / 3; y = ih / 3; cw = iw / 3; ch = ih / 3; }
    const sx = [0, x, x + cw, iw], sy = [0, y, y + ch, ih];
    const dx = [0, Math.min(x, w / 2), Math.max(w - (iw - x - cw), w / 2), w];
    const dy = [0, Math.min(y, h / 2), Math.max(h - (ih - y - ch), h / 2), h];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const sw = sx[i + 1] - sx[i], sh = sy[j + 1] - sy[j], dw = dx[i + 1] - dx[i], dh = dy[j + 1] - dy[j];
        if (sw > 0 && sh > 0 && dw > 0 && dh > 0) ctx.drawImage(img, sx[i], sy[j], sw, sh, dx[i], dy[j], dw, dh);
      }
    }
  }

  dibujarPropio(ctx, n, m, w, h, alfa) {
    switch (n.clase) {
      case 'Sprite':
      case 'ImageView':
        this.imagenEn(ctx, tex(n.imagen), m, w, h, n);
        break;
      case 'Button': {
        const b = n.boton ?? {};
        const img = (n._pulsado && tex(b.pulsado)) || (b.activo === false && tex(b.desactivado)) || tex(b.normal);
        this.imagenEn(ctx, img, m, w, h, n);
        if (n.texto) this.textoEn(ctx, { ...n, color: n.colorTexto, alineH: 1, alineV: 1, tamPropio: true }, m, w, h);
        break;
      }
      case 'CheckBox':
        this.imagenEn(ctx, tex(n.casilla?.fondo), m, w, h, n);
        if (n.casilla?.marcada) this.imagenEn(ctx, tex(n.casilla?.marca), m, w, h, n);
        break;
      case 'LoadingBar': {
        const img = tex(n.imagen);
        const p = Math.max(0, Math.min(100, n.porcentaje ?? 100)) / 100;
        if (!img || p <= 0) break;
        ctx.setTransform(...mul(m, [1, 0, 0, -1, 0, h]));
        const t = teñida(img, n.color);
        if (n.direccion === 1) ctx.drawImage(t, img.width * (1 - p), 0, img.width * p, img.height, w * (1 - p), 0, w * p, h);
        else ctx.drawImage(t, 0, 0, img.width * p, img.height, 0, 0, w * p, h);
        break;
      }
      case 'Text':
      case 'TextField':
        this.textoEn(ctx, n, m, w, h);
        break;
      case 'TextBMFont':
        this.bitmapEn(ctx, n, m, h);
        break;
      default:
        if (n.panel) this.fondoPanel(ctx, n, m, w, h, alfa);
        if (n.imagen && (n.panel || n.interior)) this.imagenEn(ctx, tex(n.imagen), m, w, h, n);
    }
  }

  fondoPanel(ctx, n, m, w, h, alfa) {
    const p = n.panel;
    if (!p.tipoColor) return; // 0 = sin color
    ctx.setTransform(...m);
    ctx.globalAlpha = alfa * ((p.opacidad ?? 255) / 255);
    if (p.tipoColor === 2) {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, rgb(p.inicio));
      g.addColorStop(1, rgb(p.fin));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = rgb(p.color);
    }
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = alfa;
  }

  textoEn(ctx, n, m, w, h) {
    const lineas = String(n.texto ?? '').split('\n');
    if (!lineas.join('')) return;
    const tam = n.tamFuente || 20;
    const alto = tam * 1.2;
    ctx.setTransform(...mul(m, [1, 0, 0, -1, 0, h]));
    ctx.font = `${tam}px ${pilaFuentes(n.fuente)}`;
    ctx.textAlign = ['left', 'center', 'right'][n.alineH ?? 0] ?? 'left';
    ctx.textBaseline = 'middle';
    const x = n.alineH === 1 ? w / 2 : n.alineH === 2 ? w : 0;
    const total = alto * lineas.length;
    const y0 = n.tamPropio ? [0, (h - total) / 2, h - total][n.alineV ?? 0] ?? 0 : (h - total) / 2;
    if (n.sombra) {
      ctx.shadowColor = rgb(n.sombra.color, (n.sombra.color?.a ?? 255) / 255);
      ctx.shadowOffsetX = n.sombra.x;
      ctx.shadowOffsetY = -n.sombra.y;
    }
    lineas.forEach((l, i) => {
      const y = y0 + alto * (i + 0.5);
      if (n.contorno) {
        ctx.lineWidth = (n.contorno.tam ?? 1) * 2;
        ctx.strokeStyle = rgb(n.contorno.color);
        ctx.lineJoin = 'round';
        ctx.strokeText(l, x, y);
      }
      ctx.fillStyle = rgb(n.color);
      ctx.fillText(l, x, y);
    });
    ctx.shadowColor = 'transparent';
  }

  bitmapEn(ctx, n, m, h) {
    const f = listos.get(`fnt|${n.imagen?.path}`);
    if (!f) return;
    ctx.setTransform(...mul(m, [1, 0, 0, -1, 0, h]));
    let x = 0;
    for (const ch of String(n.texto ?? '')) {
      const g = f.chars[ch.codePointAt(0)];
      if (!g) continue;
      const img = f.imgs[g.page ?? 0];
      if (img && g.width && g.height) ctx.drawImage(teñida(img, n.color), g.x, g.y, g.width, g.height, x + g.xoffset, g.yoffset, g.width, g.height);
      x += g.xadvance;
    }
  }

  /** Nodo interactivo más arriba bajo el punto (x, y) del canvas, o null. */
  nodoEn(x, y, filtro = () => true) {
    for (let i = this.zonas.length - 1; i >= 0; i--) {
      const z = this.zonas[i];
      if (z.recortes?.some((r) => {
        const inv = invertir(r.m); if (!inv) return true;
        const [cx, cy] = aplicar(inv, x, y);
        return cx < 0 || cy < 0 || cx > r.w || cy > r.h;
      })) continue;
      const inv = invertir(z.m);
      if (!inv) continue;
      const [lx, ly] = aplicar(inv, x, y);
      if (lx >= 0 && ly >= 0 && lx <= z.w && ly <= z.h && filtro(z.n)) return z.n;
    }
    return null;
  }
}

function anchoBitmap(f, texto) {
  let x = 0;
  for (const ch of String(texto)) x += f.chars[ch.codePointAt(0)]?.xadvance ?? 0;
  return x;
}

/** Copia profunda de un subárbol (para repetir un widget en una lista). */
export const clonar = (n) => structuredClone(n);

/**
 * Coloca `items` en la lista (ListView/ScrollView) de arriba abajo con `margen`, como doLayout de
 * ListView, y ajusta el tamaño interior. Cada item es un nodo ya clonado (se reemplazan los hijos).
 */
export function apilar(lista, items, tamItem, margen = 0) {
  const [iw, ih] = tamItem;
  const alto = Math.max(lista.alto, items.length * ih + Math.max(0, items.length - 1) * margen);
  items.forEach((it, i) => {
    it.x = lista.ancho / 2 - iw / 2 + it.anclaX * iw;
    it.y = alto - i * (ih + margen) - ih + it.anclaY * ih;
  });
  lista.hijos = items;
  lista.interior = { ancho: lista.ancho, alto, direccion: 1 };
  lista._desplaz = 0;
}

/** Base para dibujar el diseño (750×1334, y hacia arriba) centrado y ajustado en un canvas. */
export function baseCanvas(canvas, ancho = DISENO.ancho, alto = DISENO.alto) {
  const k = Math.min(canvas.width / ancho, canvas.height / alto);
  const ox = (canvas.width - ancho * k) / 2, oy = (canvas.height - alto * k) / 2;
  return [k, 0, 0, -k, ox, canvas.height - oy];
}

export { leerCSB };
