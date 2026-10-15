import { rutaWeb } from '../rutas.js';
// Recursos de la interfaz (D49): imágenes sueltas, sprite frames de .plist (TexturePacker / cocos2d),
// fuentes bitmap .fnt (BMFont, texto) y fuentes .ttf. Todo sale de /assets/ (extraido/descifrado).
// Solo se piden archivos que existen (listado de la carpeta con /api/ls): los .csb nombran recursos de
// prueba que no vinieron en el juego (p. ej. test/item_sample.png) y un 404 ensucia la consola.

const url = (ruta) => rutaWeb(`/assets/${ruta.split('/').map(encodeURIComponent).join('/')}`);

const carpetas = new Map(); // carpeta -> Promise<{dirs: Set, files: Set}> (null si no existe)
function listado(carpeta) {
  if (!carpetas.has(carpeta)) {
    carpetas.set(carpeta, (async () => {
      // Se baja desde la raíz: /api/ls de una carpeta que no existe da 404 (y ensucia la consola).
      const i = carpeta.lastIndexOf('/');
      if (carpeta) {
        const padre = await listado(i < 0 ? '' : carpeta.slice(0, i));
        if (!padre?.dirs.has(carpeta.slice(i + 1))) return null;
      }
      try {
        const r = await fetch(rutaWeb(`/api/ls?path=${encodeURIComponent(carpeta)}`));
        const d = r.ok ? await r.json() : {};
        return { dirs: new Set(d.dirs ?? []), files: new Set(d.files ?? []) };
      } catch {
        return null;
      }
    })());
  }
  return carpetas.get(carpeta);
}

export async function existe(ruta) {
  if (!ruta) return false;
  const i = ruta.lastIndexOf('/');
  return Boolean((await listado(i < 0 ? '' : ruta.slice(0, i)))?.files.has(ruta.slice(i + 1)));
}

function cargarImagen(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const imagenes = new Map();
/** Imagen suelta (o null si no existe). */
export function imagen(ruta) {
  if (!imagenes.has(ruta)) imagenes.set(ruta, existe(ruta).then((ok) => (ok ? cargarImagen(url(ruta)) : null)));
  return imagenes.get(ruta);
}
/** D109: registra una imagen hecha en el navegador (p. ej. un cartel generado) bajo una ruta virtual. */
export function registrarImagen(ruta, lienzo) {
  imagenes.set(ruta, Promise.resolve(lienzo));
  return ruta;
}

// ---------- .plist (XML de Apple) ----------
/** Parser mínimo de plist XML → objeto JS (dict, array, string, integer, real, true, false). */
export function leerPlist(xml) {
  const tokens = xml.replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '').match(/<[^>]+>|[^<]+/g) ?? [];
  let i = 0;
  const sig = () => tokens[i++];
  const texto = (etiqueta) => {
    let t = '';
    let tok;
    while ((tok = sig()) !== undefined && tok !== `</${etiqueta}>`) t += tok;
    return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  };
  const valor = (tok) => {
    if (tok === '<dict>') {
      const o = {};
      for (;;) {
        let t = sig();
        while (t !== undefined && !t.trim()) t = sig();
        if (t === undefined || t === '</dict>') return o;
        const clave = texto('key');
        let v = sig();
        while (v !== undefined && !v.trim()) v = sig();
        o[clave] = valor(v);
      }
    }
    if (tok === '<dict/>') return {};
    if (tok === '<array>') {
      const a = [];
      for (;;) {
        let t = sig();
        while (t !== undefined && !t.trim()) t = sig();
        if (t === undefined || t === '</array>') return a;
        a.push(valor(t));
      }
    }
    if (tok === '<string>') return texto('string');
    if (tok === '<string/>') return '';
    if (tok === '<integer>') return parseInt(texto('integer'), 10);
    if (tok === '<real>') return parseFloat(texto('real'));
    if (tok === '<true/>' || tok === '<true />') return true;
    if (tok === '<false/>' || tok === '<false />') return false;
    return null;
  };
  let t = sig();
  while (t !== undefined && t !== '<dict>' && t !== '<array>') t = sig();
  return t === undefined ? null : valor(t);
}

const nums = (s) => (String(s).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

/**
 * Frames de un plist de sprites: { nombre: {x, y, w, h, rotado, ox, oy, sw, sh} } y la textura.
 * Formatos 2 (frame/offset/rotated/sourceSize) y 3 (textureRect/spriteOffset/textureRotated/spriteSourceSize).
 */
export function framesDePlist(plist) {
  const out = {};
  for (const [nombre, f] of Object.entries(plist?.frames ?? {})) {
    const rect = nums(f.frame ?? f.textureRect ?? '');
    const off = nums(f.offset ?? f.spriteOffset ?? '{0,0}');
    const src = nums(f.sourceSize ?? f.spriteSourceSize ?? '');
    const [x, y, w, h] = rect;
    out[nombre] = { x, y, w, h, rotado: Boolean(f.rotated ?? f.textureRotated), ox: off[0] ?? 0, oy: off[1] ?? 0,
      sw: src[0] ?? w, sh: src[1] ?? h };
  }
  const meta = plist?.metadata ?? {};
  return { frames: out, textura: meta.realTextureFileName ?? meta.textureFileName ?? null };
}

const plists = new Map();
/** Atlas de un .plist: { frames, img } (o null). */
export function atlas(rutaPlist) {
  if (!plists.has(rutaPlist)) {
    plists.set(rutaPlist, (async () => {
      if (!(await existe(rutaPlist))) return null;
      const xml = await (await fetch(url(rutaPlist))).text();
      const { frames, textura } = framesDePlist(leerPlist(xml));
      const dir = rutaPlist.slice(0, rutaPlist.lastIndexOf('/') + 1);
      const png = dir + (textura ?? rutaPlist.slice(dir.length).replace(/\.plist$/, '.png'));
      const img = await imagen(png);
      return img ? { frames, img } : null;
    })());
  }
  return plists.get(rutaPlist);
}

// Un frame recortado a su tamaño original (sourceSize), ya derecho si venía rotado en el atlas.
function recortar(img, f) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(f.sw));
  c.height = Math.max(1, Math.round(f.sh));
  const ctx = c.getContext('2d');
  // offset de cocos: del centro del recorte al centro del original, con y hacia arriba.
  const dx = (f.sw - f.w) / 2 + f.ox;
  const dy = (f.sh - f.h) / 2 - f.oy;
  if (f.rotado) {
    // TexturePacker gira el frame 90° a la derecha; aquí se gira 90° a la izquierda.
    ctx.translate(dx, dy + f.h);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, f.x, f.y, f.h, f.w, 0, 0, f.h, f.w);
  } else {
    ctx.drawImage(img, f.x, f.y, f.w, f.h, dx, dy, f.w, f.h);
  }
  return c;
}

const texturas = new Map();
/**
 * Textura de un recurso de .csb {path, plist, tipo}: canvas/imagen del tamaño original, o null.
 * tipo 1 = sprite frame del plist; tipo 0 = archivo suelto (y si no, se busca igual en el plist).
 */
export function textura(rec) {
  if (!rec?.path) return Promise.resolve(null);
  const clave = `${rec.plist ?? ''}|${rec.path}`;
  if (!texturas.has(clave)) {
    texturas.set(clave, (async () => {
      if (rec.plist) {
        const a = await atlas(rec.plist);
        const f = a?.frames[rec.path];
        if (f) return recortar(a.img, f);
      }
      return imagen(rec.path);
    })());
  }
  return texturas.get(clave);
}

// ---------- .fnt (BMFont en texto) ----------
export function leerFnt(txt) {
  const fuente = { alto: 0, base: 0, paginas: {}, chars: {}, kerning: {} };
  for (const linea of txt.split(/\r?\n/)) {
    const [tipo, ...resto] = linea.trim().split(/\s+/);
    const a = {};
    for (const m of resto.join(' ').matchAll(/(\w+)=("([^"]*)"|\S+)/g)) a[m[1]] = m[3] ?? Number(m[2]);
    if (tipo === 'common') Object.assign(fuente, { alto: a.lineHeight, base: a.base });
    else if (tipo === 'page') fuente.paginas[a.id] = a.file;
    else if (tipo === 'char') fuente.chars[a.id] = a;
    else if (tipo === 'kerning') fuente.kerning[`${a.first},${a.second}`] = a.amount;
  }
  return fuente;
}

const fnts = new Map();
/** Fuente bitmap: { alto, base, chars, imgs: {pagina: img} } o null. */
export function fuenteBitmap(ruta) {
  if (!fnts.has(ruta)) {
    fnts.set(ruta, (async () => {
      if (!(await existe(ruta))) return null;
      const f = leerFnt(await (await fetch(url(ruta))).text());
      const dir = ruta.slice(0, ruta.lastIndexOf('/') + 1);
      f.imgs = {};
      for (const [id, archivo] of Object.entries(f.paginas)) f.imgs[id] = await imagen(dir + archivo);
      return f;
    })());
  }
  return fnts.get(ruta);
}

// ---------- .ttf ----------
const RESPALDO_JA = 'fonts/DFP-KaKouGothic-W5.ttf'; // con caracteres japoneses (SAOFont solo trae latinos)
const familias = new Map();
export const familia = (ruta) => (ruta ?? '').split('/').pop().replace(/\.(ttf|otf)$/i, '');

/** Carga una .ttf como FontFace (familia = nombre del archivo) y devuelve la pila CSS a usar. */
export async function fuenteTTF(ruta) {
  const rutas = [ruta, RESPALDO_JA].filter((r) => r && /\.(ttf|otf)$/i.test(r));
  for (const r of rutas) {
    if (!familias.has(r)) {
      familias.set(r, (async () => {
        if (!(await existe(r)) || typeof FontFace === 'undefined') return false;
        try {
          const ff = new FontFace(familia(r), `url(${url(r)})`);
          document.fonts.add(await ff.load());
          return true;
        } catch {
          return false;
        }
      })());
    }
    await familias.get(r);
  }
  return pilaFuentes(ruta);
}

export function pilaFuentes(ruta) {
  const f = familia(ruta);
  return `${f ? `"${f}", ` : ''}"${familia(RESPALDO_JA)}", sans-serif`;
}
