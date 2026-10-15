// D109: cartel generado en el navegador para los banners históricos. Los carteles originales no vienen en la APK
// (el juego los descargaba de su servidor), así que se compone uno con piezas de la APK del jugador:
//  - fondo: el cielo de un escenario (images/background/NNNN/sky.png);
//  - personajes: sus ilustraciones (images/character/character_<id>.png, 1500×1500);
//  - armas: su imagen de equipo (images/equipment/thumb/512/<imagen>_thumb512.png);
//  - estrella de rareza (ss/others/common/rarity-star_s, naranja para ★6) e icono de tipo de arma (images/icon/equipment).
// La disposición imita los carteles 680×850 del juego (título arriba a la izquierda, destacados en zigzag con su
// rareza, arma y nombre), pero NO es el cartel original. Nada se publica: el lienzo vive sólo en el navegador.
import { imagen, existe, registrarImagen, fuenteTTF, pilaFuentes } from './recursos.js';

// franja: alto reservado abajo para la línea de posición y fechas que la Taberna pinta sobre el cartel.
export const CARTEL = Object.freeze({ ancho: 680, alto: 850, titulo: 168, franja: 48 });
const CIELOS = [1001, 1002, 1003, 1004, 1005, 1007, 1008, 1009, 1010, 1013, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024,
  2001, 2002, 2005, 2006, 2007, 2010, 2011, 2013, 2014, 2015, 2016, 2017, 2018, 2019];
// character.f? (tipo de arma 1–11) → icono de images/icon/equipment.
export const ICONO_ARMA = Object.freeze({ 1: 'sword', 2: 'dualblade', 3: 'finesword', 4: 'dagger', 5: 'mace', 6: 'gun', 7: 'bow', 8: 'rod',
  9: 'lance', 10: 'round_protector', 11: 'automatic_gun' });
// equipment.f2 (subtipo) → icono, para los banners de armas.
export const ICONO_SUBTIPO = Object.freeze({ 11: 'sword', 12: 'dualblade', 13: 'finesword', 14: 'dagger', 15: 'mace', 16: 'gun', 17: 'bow',
  18: 'rod', 19: 'lance', 40: 'automatic_gun', 41: 'submachine_gun' });
const FUENTE = 'fonts/SAOFont-Regular_v1.ttf';

/** Huecos de los destacados (cajas donde se encuadra cada uno), en orden de dibujo (de atrás adelante). */
export function huecosCartel(n, { ancho = CARTEL.ancho, alto = CARTEL.alto - CARTEL.franja, arriba = CARTEL.titulo } = {}) {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 40, y: arriba - 40, w: ancho - 80, h: alto - arriba + 40, columna: 0, columnas: 1 }];
  const columnas = n <= 4 ? 2 : 3, filas = Math.ceil(n / columnas);
  const fila = (alto - arriba) / filas, col = ancho / columnas;
  const h = Math.min(fila * 1.45, alto - arriba + 30), w = Math.min(col * 1.3, ancho);
  const huecos = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / columnas), c = i % columnas;
    const enFila = Math.min(columnas, n - r * columnas);
    // Zigzag como en los carteles: las filas impares se desplazan media columna; la última, centrada.
    const desplazamiento = enFila < columnas ? (columnas - enFila) * col / 2 : (r % 2 ? col * 0.18 : -col * 0.18);
    const cx = (c + 0.5) * col + desplazamiento;
    const abajo = arriba + (r + 1) * fila;
    huecos.push({ x: Math.round(cx - w / 2), y: Math.round(abajo - h), w: Math.round(w), h: Math.round(h), columna: c, columnas: enFila });
  }
  return huecos;
}

/** Caja de lo opaco de una ilustración (muestreada a 120×120) y el centro horizontal de su parte alta (la cabeza). */
function silueta(img) {
  const N = 120, c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (d[(y * N + x) * 4 + 3] > 40) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const alto = y1 - y0 + 1, limite = y0 + Math.max(4, Math.round(alto * 0.3));
  let suma = 0, cuenta = 0;
  for (let y = y0; y < limite; y++) for (let x = x0; x <= x1; x++) if (d[(y * N + x) * 4 + 3] > 120) { suma += x; cuenta++; }
  const k = img.width / N;
  return { x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: alto * k, cabeza: (cuenta ? suma / cuenta : (x0 + x1) / 2) * k };
}

/** Recorte de la ilustración para una caja: medio cuerpo con la cabeza arriba y centrada (todo el cuerpo si va sola). */
export function encuadre(s, caja, { completo = false } = {}) {
  const proporcion = caja.w / caja.h;
  let h = completo ? s.h * 1.04 : s.h * 0.62, w = h * proporcion;
  if (completo && w < s.w * 1.04) { w = s.w * 1.04; h = w / proporcion; }
  return { x: s.cabeza - w / 2, y: s.y - h * 0.04, w, h };
}

function dibujarRecorte(ctx, img, r, caja, { fundido = true } = {}) {
  // drawImage con un origen fuera de la imagen no es uniforme entre navegadores: se recorta a mano.
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(img.width, r.x + r.w), y1 = Math.min(img.height, r.y + r.h);
  if (x1 <= x0 || y1 <= y0) return;
  const kx = caja.w / r.w, ky = caja.h / r.h;
  // En un lienzo aparte para fundir el borde inferior: así el medio cuerpo no acaba en un corte recto.
  const c = document.createElement('canvas');
  c.width = Math.ceil(caja.w); c.height = Math.ceil(caja.h);
  const g = c.getContext('2d');
  g.drawImage(img, x0, y0, x1 - x0, y1 - y0, (x0 - r.x) * kx, (y0 - r.y) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
  if (fundido) {
    const m = g.createLinearGradient(0, c.height * 0.72, 0, c.height);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = m; g.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(c, caja.x, caja.y);
}

function textoContorno(ctx, texto, x, y, { tam, color = '#fff', borde = '#0b3d7a', grosor = 6, alinear = 'left', maximo = 640, familia }) {
  let t = tam;
  ctx.font = `bold ${t}px ${familia}`;
  while (t > 12 && ctx.measureText(texto).width > maximo) ctx.font = `bold ${--t}px ${familia}`;
  ctx.textAlign = alinear; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = grosor * t / tam; ctx.strokeStyle = borde; ctx.strokeText(texto, x, y);
  ctx.fillStyle = color; ctx.fillText(texto, x, y);
  return t;
}

/** Corta un nombre largo en dos líneas por la palabra más cercana al centro. */
export function lineasTitulo(nombre, max = 22) {
  if (nombre.length <= max) return [nombre];
  const espacios = [...nombre.matchAll(/[\s~・]/g)].map((m) => m.index).filter((i) => i > 0);
  if (!espacios.length) { const m = Math.ceil(nombre.length / 2); return [nombre.slice(0, m), nombre.slice(m)]; }
  const corte = espacios.reduce((a, b) => (Math.abs(b - nombre.length / 2) < Math.abs(a - nombre.length / 2) ? b : a));
  return [nombre.slice(0, corte).trim(), nombre.slice(corte).trim()];
}

let estrellas = null;
/** Estrella grande del atlas de rareza (cuadrante superior izquierdo), dorada y naranja. */
function estrella(naranja) {
  estrellas ??= (async () => {
    const recortar = async (ruta) => {
      const img = await imagen(ruta);
      if (!img) return null;
      const lado = Math.round(img.width * 0.68), c = document.createElement('canvas');
      c.width = c.height = lado;
      c.getContext('2d').drawImage(img, 0, 0, lado, lado, 0, 0, lado, lado);
      return c;
    };
    return { oro: await recortar('ss/others/common/rarity-star_s/common_rarity_atlas.png'),
      naranja: await recortar('ss/others/common/rarity-star_s/common_rarity_atlas_oran.png') };
  })();
  return estrellas.then((e) => (naranja ? e.naranja ?? e.oro : e.oro));
}

function marco(ctx, { ancho, alto }) {
  const r = 22;
  ctx.beginPath();
  ctx.roundRect(5, 5, ancho - 10, alto - 10, r);
  const g = ctx.createLinearGradient(0, 0, ancho, alto);
  g.addColorStop(0, '#e6fbff'); g.addColorStop(0.5, '#59c3ff'); g.addColorStop(1, '#1d6fd1');
  ctx.lineWidth = 10; ctx.strokeStyle = g; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
}

/**
 * Dibuja el cartel. `banner` = { id, nombre, archivo }; `piezas` = [{ ilustracion (ruta), tipo: 'personaje'|'arma',
 * rareza, icono (ruta), titulo, nombre }]; `subtitulo` = texto bajo el nombre del banner.
 */
export async function dibujarCartel(banner, piezas, subtitulo) {
  const { ancho, alto } = CARTEL;
  await fuenteTTF(FUENTE);
  const familia = pilaFuentes(FUENTE);
  const c = document.createElement('canvas');
  c.width = ancho; c.height = alto;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.beginPath(); ctx.roundRect(5, 5, ancho - 10, alto - 10, 22); ctx.clip();

  // Fondo: el cielo de un escenario elegido por el número del banner, más un halo claro al centro.
  ctx.fillStyle = '#bfefff'; ctx.fillRect(0, 0, ancho, alto);
  for (let k = 0; k < CIELOS.length; k++) {
    const ruta = `images/background/${CIELOS[(Number(banner.archivo ?? 0) + k) % CIELOS.length]}/sky.png`;
    const cielo = (await existe(ruta)) && (await imagen(ruta));
    if (!cielo) continue;
    const k2 = Math.max(ancho / cielo.width, alto / cielo.height);
    ctx.drawImage(cielo, (ancho - cielo.width * k2) / 2, (alto - cielo.height * k2) / 2, cielo.width * k2, cielo.height * k2);
    break;
  }
  const halo = ctx.createRadialGradient(ancho / 2, alto * 0.55, 40, ancho / 2, alto * 0.55, alto * 0.7);
  halo.addColorStop(0, 'rgba(255,255,255,.55)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, ancho, alto);

  // Destacados.
  const imagenes = await Promise.all(piezas.map(async (p) => ((await existe(p.ilustracion)) ? imagen(p.ilustracion) : null)));
  const visibles = piezas.map((p, i) => ({ ...p, img: imagenes[i] })).filter((p) => p.img);
  const huecos = huecosCartel(visibles.length);
  const etiquetas = [];
  visibles.forEach((p, i) => {
    const caja = huecos[i];
    if (p.tipo === 'arma') {
      // Las armas se ven enteras, giradas en diagonal como en los carteles de equipo.
      const lado = Math.min(caja.w, caja.h) * (visibles.length > 1 ? 0.7 : 0.85);
      ctx.save();
      const cx = Math.min(ancho - lado / 2 - 12, Math.max(lado / 2 + 12, caja.x + caja.w / 2));
      ctx.translate(cx, caja.y + caja.h / 2);
      ctx.rotate(-Math.PI / 4 * (i % 2 ? -0.25 : 0.25));
      ctx.shadowColor = 'rgba(40,120,255,.8)'; ctx.shadowBlur = 24;
      ctx.drawImage(p.img, -lado / 2, -lado / 2, lado, lado);
      ctx.restore();
    } else {
      const s = silueta(p.img);
      if (!s) return;
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,.95)'; ctx.shadowBlur = 10;
      dibujarRecorte(ctx, p.img, encuadre(s, caja, { completo: visibles.length === 1 }), caja, { fundido: visibles.length > 1 });
      ctx.restore();
    }
    etiquetas.push({ p, caja });
  });

  // Etiquetas (encima de todos los destacados): rareza + icono, [título] y nombre.
  for (const { p, caja } of etiquetas) {
    const derecha = caja.columnas > 1 && caja.columna === caja.columnas - 1 && caja.columna > 0;
    const xb = derecha ? Math.min(ancho - 16, caja.x + caja.w - 18) : Math.max(16, caja.x + 18);
    const yb = Math.min(alto - CARTEL.franja - 8, caja.y + caja.h - 14);
    const maximo = Math.min(300, caja.w - 20);
    const tamNombre = visibles.length > 6 ? 22 : 30, tamTitulo = visibles.length > 6 ? 15 : 19;
    textoContorno(ctx, p.nombre, xb, yb, { tam: tamNombre, color: '#ffffff', borde: '#0a4a8f', grosor: 7, alinear: derecha ? 'right' : 'left', maximo, familia });
    if (p.titulo) textoContorno(ctx, p.titulo, xb, yb - tamNombre - 2, { tam: tamTitulo, color: '#ffffff', borde: '#173a63', grosor: 5, alinear: derecha ? 'right' : 'left', maximo, familia });
    const lado = visibles.length > 6 ? 20 : 28, yEstrellas = yb - tamNombre - (p.titulo ? tamTitulo + 8 : 4) - lado;
    const est = await estrella(p.rareza >= 6);
    const icono = p.icono && (await existe(p.icono)) ? await imagen(p.icono) : null;
    const total = (icono ? lado + 6 : 0) + p.rareza * (lado - 3);
    let x = derecha ? xb - total : xb;
    if (icono) { ctx.drawImage(icono, x, yEstrellas, lado, lado); x += lado + 6; }
    for (let k = 0; k < p.rareza; k++) {
      if (est) ctx.drawImage(est, x, yEstrellas, lado, lado);
      x += lado - 3;
    }
  }

  // Título del banner y subtítulo, arriba a la izquierda.
  const lineas = lineasTitulo(banner.nombre ?? '');
  const tamTitulo = lineas.length > 1 ? 46 : 54;
  ctx.save();
  ctx.shadowColor = 'rgba(0,40,120,.6)'; ctx.shadowBlur = 12;
  lineas.forEach((l, i) => textoContorno(ctx, l, 28, 70 + i * (tamTitulo + 4), { tam: tamTitulo, color: '#ffffff', borde: '#1764c4', grosor: 10, maximo: 620, familia }));
  ctx.restore();
  if (subtitulo) textoContorno(ctx, subtitulo, 30, 70 + lineas.length * (tamTitulo + 4) + 2, { tam: 28, color: '#fff36b', borde: '#0b3d7a', grosor: 7, maximo: 620, familia });
  ctx.restore();
  marco(ctx, CARTEL);
  return c;
}

const hechos = new Map();
/**
 * Ruta del cartel de un banner: el original si está entre los recursos importados; si no, uno generado.
 * `master.personaje(id)` y `master.equipo(id)` dan los datos de los destacados.
 */
export function cartelBanner(b, master) {
  if (!b) return Promise.resolve(null);
  if (!hechos.has(b.id)) hechos.set(b.id, (async () => {
    if (b.arte && (await existe(b.arte))) return b.arte;
    const armas = b.tipo === 'arma';
    const piezas = (b.destacados ?? []).map((id) => {
      if (armas) {
        const e = master.equipo?.(id);
        if (!e) return null;
        return { tipo: 'arma', ilustracion: `images/equipment/thumb/512/${e.imagen}_thumb512.png`, rareza: e.rareza,
          icono: ICONO_SUBTIPO[e.subtipo] ? `images/icon/equipment/icon_${ICONO_SUBTIPO[e.subtipo]}.png` : null,
          titulo: null, nombre: e.nombre.replace(/\s+R\d+$/, '') };
      }
      const pj = master.personaje(id);
      if (!pj) return null;
      const m = /^\[(.+?)\]\s*(.*)$/.exec(pj.nombre ?? '');
      return { tipo: 'personaje', ilustracion: `images/character/character_${id}.png`, rareza: pj.rareza,
        icono: ICONO_ARMA[pj.arma] ? `images/icon/equipment/icon_${ICONO_ARMA[pj.arma]}.png` : null,
        titulo: m ? `[${m[1]}]` : null, nombre: m ? m[2] : pj.nombre };
    }).filter(Boolean);
    const maxima = Math.max(0, ...piezas.map((p) => p.rareza));
    const subtitulo = maxima ? (armas ? `¡Armas ★${maxima} destacadas!` : `¡Personajes ★${maxima} destacados!`) : null;
    try {
      return registrarImagen(`generado/cartel_${b.id}.png`, await dibujarCartel(b, piezas, subtitulo));
    } catch {
      return null;
    }
  })());
  return hechos.get(b.id);
}
