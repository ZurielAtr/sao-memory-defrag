import { rutaWeb } from '../rutas.js';
// Comprobación al abrir una página del juego (D68): ¿hay datos? En local los sirve herramientas/servidor.py; en la
// página pública, el service worker (sw.js) desde lo que importó el jugador. Si no hay datos (o son de una versión
// anterior de los exportadores), manda a la portada (index.html), que importa o regenera. Se importa la primera en
// el módulo de entrada de cada página: el resto espera a que termine.

import { VERSION_DATOS } from '../datos/generar.js';

const PORTADA = new URL('../../index.html', import.meta.url);
const parar = () => new Promise(() => {});

async function versionDatos() {
  try {
    const r = await fetch(rutaWeb('/data/version.json'), { cache: 'no-store' });
    if (!r.ok) return null;
    return { version: (await r.json()).version ?? 0, opfs: r.headers.get('X-SAOMD') === 'opfs' };
  } catch {
    return null;
  }
}

let v = await versionDatos();
if (!v && 'serviceWorker' in navigator && !navigator.serviceWorker.controller) {
  // Página abierta sin el service worker (primera visita o recarga forzada): si ya estaba instalado, se espera a
  // que tome el control y se recarga una vez.
  const reg = await navigator.serviceWorker.getRegistration(new URL('../../', import.meta.url));
  if (reg && !sessionStorage.getItem('saomd.recargado')) {
    sessionStorage.setItem('saomd.recargado', '1');
    await navigator.serviceWorker.ready;
    location.reload();
    await parar();
  }
}
sessionStorage.removeItem('saomd.recargado');
if (!v) {
  location.replace(PORTADA);
  await parar();
} else if (v.version < VERSION_DATOS) {
  if (v.opfs) {
    location.replace(`${PORTADA}?regenerar=1`);
    await parar();
  }
  console.warn(`web/data es de la versión ${v.version} y el juego espera la ${VERSION_DATOS}: node herramientas/generar_datos.mjs`);
}
