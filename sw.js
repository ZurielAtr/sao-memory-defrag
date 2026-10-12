// Service worker del port (D68): cuando el jugador importó su APK (index.html), sirve los recursos y los datos del
// juego desde el almacenamiento del navegador (OPFS, carpeta saomd; ver js/importador/opfs.js) en las mismas rutas
// que el servidor local (herramientas/servidor.py), así el juego no cambia:
//   /assets/<ruta>   recursos descifrados (sin distinguir mayúsculas, como en Windows)
//   /data/<ruta>     datos generados
//   /api/ls?path=    contenido de una carpeta de los recursos
// Sin importación, deja pasar las peticiones (el servidor local responde como siempre).
// Script clásico (sin import): los service workers de módulo aún no van en todos los navegadores.

const RAIZ = 'saomd';
const BASE_WEB = new URL('./', self.location.href).pathname;
let cargado = null;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));
self.addEventListener('message', (ev) => {
  if (ev.data && ev.data.tipo === 'recargar') cargado = null;
});

async function hijo(dir, nombre, tipo) {
  try {
    return tipo === 'dir' ? await dir.getDirectoryHandle(nombre) : await dir.getFileHandle(nombre);
  } catch {
    return null;
  }
}

/** Archivo (File) en `ruta` dentro de la carpeta `dir`, o null. */
async function archivo(dir, ruta) {
  const partes = ruta.split('/').filter(Boolean);
  for (const p of partes.slice(0, -1)) {
    dir = await hijo(dir, p, 'dir');
    if (!dir) return null;
  }
  const h = partes.length ? await hijo(dir, partes[partes.length - 1], 'file') : null;
  return h ? h.getFile() : null;
}

/** Lo importado: estado, índice de recursos y carpetas; null si no hay importación completa. */
function cargar() {
  cargado ??= (async () => {
    const raiz = await navigator.storage.getDirectory();
    const base = await hijo(raiz, RAIZ, 'dir');
    if (!base) return null;
    const est = await archivo(base, 'estado.json');
    if (!est) return null;
    const ind = await archivo(base, 'indice.json');
    const archivos = new Map();
    const carpetas = new Map([['', { dirs: new Map(), files: new Map() }]]);
    for (const [ruta] of ind ? JSON.parse(await ind.text()) : []) {
      archivos.set(ruta.toLowerCase(), ruta);
      const partes = ruta.split('/');
      let dir = '';
      for (let i = 0; i < partes.length - 1; i++) {
        const l = partes[i].toLowerCase();
        const sub = dir ? `${dir}/${l}` : l;
        carpetas.get(dir).dirs.set(l, partes[i]);
        if (!carpetas.has(sub)) carpetas.set(sub, { dirs: new Map(), files: new Map() });
        dir = sub;
      }
      const n = partes[partes.length - 1];
      carpetas.get(dir).files.set(n.toLowerCase(), n);
    }
    return {
      estado: JSON.parse(await est.text()),
      archivos,
      carpetas,
      recursos: await hijo(base, 'descifrado', 'dir'),
      datos: await hijo(base, 'data', 'dir'),
    };
  })().catch(() => null);
  return cargado;
}

const TIPOS = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', json: 'application/json; charset=utf-8',
  plist: 'application/xml', xml: 'application/xml', txt: 'text/plain; charset=utf-8', fnt: 'text/plain; charset=utf-8',
  ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm',
};
const tipoDe = (nombre) => TIPOS[nombre.slice(nombre.lastIndexOf('.') + 1).toLowerCase()] || 'application/octet-stream';
const noHay = () => new Response('', { status: 404 });
const porNombre = (a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);

async function responder(req, url, tipo, ruta) {
  const c = await cargar();
  if (!c) return fetch(req);
  if (tipo === 'ls') {
    const dir = (url.searchParams.get('path') || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    const d = c.carpetas.get(dir);
    if (!d) return noHay();
    const cuerpo = JSON.stringify({ dirs: [...d.dirs.values()].sort(porNombre), files: [...d.files.values()].sort(porNombre) });
    return new Response(cuerpo, { headers: { 'Content-Type': 'application/json', 'X-SAOMD': 'opfs' } });
  }
  let f = null;
  if (tipo === 'assets') {
    const real = c.archivos.get(ruta.toLowerCase());
    if (real && c.recursos) f = await archivo(c.recursos, real);
  } else if (c.datos) f = await archivo(c.datos, ruta);
  if (!f) return noHay();
  return new Response(f, { headers: { 'Content-Type': tipoDe(f.name), 'Content-Length': String(f.size), 'X-SAOMD': 'opfs' } });
}

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (url.origin !== self.location.origin || ev.request.method !== 'GET') return;
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return;
  }
  if (!p.startsWith(BASE_WEB)) return;
  p = '/' + p.slice(BASE_WEB.length);
  let tipo = null, ruta = '';
  if (p.startsWith('/assets/')) [tipo, ruta] = ['assets', p.slice(8)];
  else if (p.startsWith('/data/')) [tipo, ruta] = ['data', p.slice(6)];
  else if (p === '/api/ls') tipo = 'ls';
  else return;
  ev.respondWith(responder(ev.request, url, tipo, ruta));
});
