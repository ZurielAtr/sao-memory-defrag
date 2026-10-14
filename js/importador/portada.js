// Portada del port (index.html, F7, D65, D68): aviso de proyecto no oficial, importación de la APK del jugador
// (worker trabajador.js → OPFS; sw.js sirve lo importado), regeneración de los datos y copia de la partida.

import { estado as leerEstado, borrarTodo, importacionPendiente, mismasFuentes } from './opfs.js';
import { t, texto, idioma, iniciarIdioma } from './idioma.js';

import { VERSION_DATOS } from '../datos/generar.js';

const $ = (id) => document.getElementById(id);
iniciarIdioma();
const GB = 2 ** 30;
const fmtGB = (b) => `${(b / GB).toFixed(2)} GB`;
const PARTIDA = 'saomd.'; // prefijo de la cuenta del servidor simulado (js/api/store.js)
const params = new URLSearchParams(location.search);

let trabajando = false;
addEventListener('beforeunload', (ev) => {
  if (trabajando) ev.preventDefault();
});

/** Qué falta en este navegador para importar (lista vacía = todo bien). */
function faltaSoporte() {
  const falta = [];
  if (!navigator.storage?.getDirectory) falta.push(t('almacenamiento de archivos (OPFS)', 'file storage (OPFS)'));
  if (typeof DecompressionStream !== 'function') falta.push(t('descompresión (DecompressionStream)', 'decompression (DecompressionStream)'));
  if (!('serviceWorker' in navigator)) falta.push('service workers');
  if (typeof Worker !== 'function') falta.push('workers');
  if (!isSecureContext) falta.push(t('conexión segura (https o localhost)', 'a secure connection (HTTPS or localhost)'));
  return falta;
}

async function registrarSW() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url));
  await navigator.serviceWorker.ready;
  return reg;
}

async function avisarSW() {
  const reg = await navigator.serviceWorker?.getRegistration(new URL('../../', import.meta.url));
  reg?.active?.postMessage({ tipo: 'recargar' });
}

function barra(fraccion, contenido) {
  $('progreso').hidden = false;
  $('barra').style.width = `${Math.round(fraccion * 1000) / 10}%`;
  texto('texto-progreso', contenido);
}

const fases = () => ({
  examinar: [0, 0.01, t('Leyendo el archivo…', 'Reading the file…')],
  clave: [0.01, 0.03, t('Buscando la clave en la librería del juego…', 'Finding the key in the game library…')],
  recursos: [0.03, 0.72, t('Descifrando los recursos', 'Decrypting assets')],
  datos: [0.72, 1, t('Generando los datos del juego', 'Generating game data')],
});
const pasos = () => ({
  personajes: t('personajes', 'characters'), enemigos: t('enemigos', 'enemies'), animaciones: t('animaciones', 'animations'), misiones: t('misiones', 'quests'), ia: t('IA de los enemigos', 'enemy AI'),
  combate: t('combate', 'combat'), cajas: t('cajas de colisión', 'hitboxes'), proyectiles: t('proyectiles', 'projectiles'), historias: t('diálogos', 'dialogue'), interfaz: t('interfaz', 'interface'),
  api: t('servidor simulado', 'simulated server'), pasivas: t('pasivas', 'passives'), estados: t('estados', 'status effects'), listo: t('listo', 'done'),
});

function mostrarAvance(m, soloDatos) {
  let [a, b] = fases()[m.fase] ?? [0, 1];
  if (soloDatos) [a, b] = [0, 1];
  barra(a + (b - a) * (m.fraccion ?? 0), () => {
    const descripcion = fases()[m.fase]?.[2] ?? m.fase;
    let extra = '';
    if (m.fase === 'recursos' && m.archivos) extra = `: ${m.archivos.toLocaleString(idioma)} ${t('archivos', 'files')}`;
    if (m.fase === 'datos' && m.detalle) extra = `: ${pasos()[m.detalle] ?? m.detalle}`;
    return `${descripcion}${extra} (${Math.floor((m.fraccion ?? 0) * 100)} %)`;
  });
}

// D101: en el móvil, bloquear la pantalla o cambiar de app detiene la página y corta la importación. Mientras se
// trabaja se pide mantener la pantalla encendida (Screen Wake Lock, Safari 16.4+ y Chrome) y se vuelve a pedir al volver.
let bloqueoPantalla = null;
async function mantenerPantalla(activar) {
  try {
    if (!activar) { await bloqueoPantalla?.release(); bloqueoPantalla = null; return; }
    if (!bloqueoPantalla && document.visibilityState !== 'hidden') bloqueoPantalla = await navigator.wakeLock?.request('screen') ?? null;
    bloqueoPantalla?.addEventListener?.('release', () => { bloqueoPantalla = null; });
  } catch { bloqueoPantalla = null; }
}
document.addEventListener?.('visibilitychange', () => { if (trabajando) void mantenerPantalla(true); });
let ultimoAvance = null; // fase y fracción del último aviso del worker (para explicar dónde se cortó)

/** Lanza el worker con un mensaje y espera a que acabe. */
function trabajar(mensaje) {
  if(trabajando)return Promise.reject(new Error(t('Espera a que termine la operación actual.','Wait for the current operation to finish.')));
  return new Promise((resolver, rechazar) => {
    const w = new Worker(new URL('./trabajador.js', import.meta.url), { type: 'module' });
    const t0 = performance.now();
    trabajando = true;
    ultimoAvance = null;
    void mantenerPantalla(true);
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.tipo === 'avance') { ultimoAvance = m; mostrarAvance(m, mensaje.tipo === 'regenerar'); }
      else {
        trabajando = false;
        void mantenerPantalla(false);
        w.terminate();
        if (m.tipo === 'listo') resolver({ estado: m.estado, segundos: Math.round((performance.now() - t0) / 1000) });
        else rechazar(Object.assign(new Error(m.mensaje), { nombre: m.nombre }));
      }
    };
    w.onerror = (ev) => {
      trabajando = false;
      void mantenerPantalla(false);
      w.terminate();
      rechazar(new Error(ev.message || t('error en el worker', 'worker error')));
    };
    w.postMessage(mensaje);
  });
}

function error(msg) {
  $('error').hidden = !msg;
  texto('error', msg ?? '');
}

async function pintarEstado() {
  const e = navigator.storage?.getDirectory ? await leerEstado().catch(() => null) : null;
  texto('sin-importar', () => e ? t('Volver a importar', 'Import again') : t('1. Importa tu APK', '1. Import your APK'));
  $('importado').hidden = !e;
  if (e) {
    texto('resumen', () => {
      const f = new Date(e.fecha).toLocaleString(idioma);
      const n = e.archivos.toLocaleString(idioma);
      const fuentes = e.fuentes.map((x) => x.nombre).join(', ');
      return t(`Importado el ${f}: ${n} archivos (${fmtGB(e.bytes)}) de ${fuentes}.`,
        `Imported on ${f}: ${n} files (${fmtGB(e.bytes)}) from ${fuentes}.`);
    });
  }
  const persistente = await navigator.storage?.persisted?.().catch(() => false);
  $('persistente').hidden = !e || persistente;
  return e;
}

/**
 * Espacio que el navegador deja usar a la página. Brave devuelve siempre 2 GB en storage.estimate() (protección
 * contra el fingerprinting; github.com/brave/brave-browser/issues/51704) aunque el límite real es el de Chrome: ahí
 * se usa la API antigua de Chrome si está, y si no, no se comprueba (los errores de espacio se tratan igual).
 */
async function espacioLibre() {
  const brave = await navigator.brave?.isBrave?.().catch(() => false);
  if (brave) {
    return new Promise((resolver) => {
      const viejo = navigator.webkitTemporaryStorage;
      if (!viejo?.queryUsageAndQuota) return resolver(Infinity);
      viejo.queryUsageAndQuota((uso, cuota) => resolver(cuota ? cuota - uso : Infinity), () => resolver(Infinity));
    });
  }
  const est = await navigator.storage.estimate?.().catch(() => null);
  return est?.quota ? est.quota - (est.usage ?? 0) : Infinity;
}

let forzar = false; // segundo clic tras el aviso de espacio: se intenta igual

/** Qué hacer cuando el navegador da poco espacio a la página. */
function pistaEspacio(persistente) {
  if (/firefox/i.test(navigator.userAgent) && !persistente) {
    return t('Firefox limita a 2 GB las páginas sin «almacenamiento persistente»: da ese permiso a la página (en el candado de la barra de direcciones → Permisos, o aceptando el aviso que sale al importar) y vuelve a intentarlo.', 'Firefox limits sites without persistent storage to 2 GB. Grant this permission to the site (in the address bar lock icon → Permissions, or by accepting the prompt when importing), then try again.');
  }
  if (navigator.brave) {
    return t('En Brave, prueba a desactivar los escudos (Shields) para esta página o usa Chrome o Edge. Si estás en una ventana privada, usa una normal.', 'In Brave, try turning off Shields for this site, or use Chrome or Edge. If you are in a private window, use a regular one.');
  }
  return t('Si estás en una ventana privada o de incógnito, usa una normal (ahí el espacio es muy pequeño). Si no, libera espacio en el disco. También puedes intentarlo igual: si no cabe, se avisa y se borra lo copiado.', 'If you are in a private or incognito window, use a regular one (private storage is very limited). Otherwise, free up disk space. You can also try importing anyway: if space runs out, you will see a warning and the incomplete import will be deleted.');
}

async function importar(archivos = [...$('archivo').files], urls = null) {
  error(null);
  if (urls) archivos = urls.map((u) => ({ size: 2.8 * GB, name: u }));
  if (!archivos.length) return error(() => t('Elige primero el archivo .apks (o la .apk) del juego.', 'Choose the game .apks (or .apk) file first.'));
  const falta = faltaSoporte();
  if (falta.length) return error(() => t(`Este navegador no sirve para importar: falta ${faltaSoporte().join(', ')}. Usa Chrome, Edge o Firefox de escritorio actualizados.`, `This browser cannot import files: missing ${faltaSoporte().join(', ')}. Use an up-to-date desktop version of Chrome, Edge, or Firefox.`));
  const tam = archivos.reduce((s, f) => s + f.size, 0);
  const necesario = tam * 1.4 + 0.3 * GB; // los recursos descifrados ocupan algo más que el .apks, más los datos
  // Primero el permiso de almacenamiento persistente: en Firefox, sin él, cada página tiene como mucho 2 GB.
  const persistente = await navigator.storage.persist?.().catch(() => false);
  const libre = await espacioLibre();
  // D101: al continuar la misma importación, lo ya guardado cuenta dentro del espacio: no se vuelve a comprobar.
  const pendiente = await importacionPendiente().catch(() => null);
  const continuar = Boolean(pendiente && mismasFuentes(pendiente.fuentes, archivos.map((f) => ({ nombre: f.name, bytes: f.size }))));
  if (libre < necesario && !forzar && !continuar) {
    forzar = true;
    texto('importar', () => t('Importar de todos modos', 'Import anyway'));
    return error(() => t(`El navegador solo deja usar ${fmtGB(libre)} a esta página y hacen falta unos ${fmtGB(necesario)}. ${pistaEspacio(persistente)}`, `Your browser only allows ${fmtGB(libre)} for this site, but about ${fmtGB(necesario)} is needed. ${pistaEspacio(persistente)}`));
  }
  $('importar').disabled = true;
  try {
    await registrarSW();
    const { segundos } = await trabajar(urls ? { tipo: 'importar', urls } : { tipo: 'importar', archivos });
    barra(1, () => t(`Listo en ${Math.floor(segundos / 60)} min ${segundos % 60} s.`, `Done in ${Math.floor(segundos / 60)} min ${segundos % 60} s.`));
    await avisarSW();
  } catch (e) {
    if (/quota/i.test(`${e.nombre} ${e.message}`)) {
      await borrarTodo(); // lo importado a medias no sirve: se libera el espacio
      error(() => t(`El navegador no dejó guardar más (se quedó sin espacio para esta página). ${pistaEspacio(persistente)}`, `Your browser could not save more files (this site ran out of storage space). ${pistaEspacio(persistente)}`));
    } else {
      // D101: lo ya descifrado se conserva; volver a importar el mismo archivo continúa desde ahí.
      const a = ultimoAvance, fase = a ? fases()[a.fase]?.[2] ?? a.fase : null, pct = a ? Math.floor((a.fraccion ?? 0) * 100) : 0;
      const donde = fase ? t(` (en «${fase}», ${pct} %${a.archivos ? `, ${a.archivos} archivos` : ''})`, ` (during “${fase}”, ${pct} %${a.archivos ? `, ${a.archivos} files` : ''})`) : '';
      const seguir = await importacionPendiente().catch(() => null);
      // D102: si falla la lectura del archivo elegido, en el iPhone suele ayudar tenerlo en «En mi iPhone».
      const lectura = e.nombre === 'NotReadableError' || /I\/O read/i.test(e.message);
      const consejo = lectura ? t(' El navegador no pudo leer el archivo: si está en iCloud Drive, cópialo a «En mi iPhone» (app Archivos) y elígelo desde ahí.', ' The browser could not read the file: if it is in iCloud Drive, copy it to “On My iPhone” (Files app) and choose it from there.') : '';
      error(() => t(`No se pudo importar${donde}: ${e.message}.${seguir ? ' Lo ya descifrado se ha guardado: pulsa «Importar» otra vez con el mismo archivo para continuar donde se quedó.' : ''} En el móvil, mantén la página abierta y la pantalla encendida mientras importa.`,
        `Import failed${donde}. Technical details: ${e.message}.${seguir ? ' The assets decrypted so far were kept: press “Import” again with the same file to continue where it stopped.' : ''} On a phone, keep this page open and the screen on while importing.`) + consejo);
    }
    $('progreso').hidden = true;
  } finally {
    forzar = false;
    texto('importar', () => t('Importar', 'Import'));
    $('importar').disabled = false;
    await pintarEstado();
  }
}

async function regenerar() {
  error(null);
  try {
    await registrarSW();
    const { segundos } = await trabajar({ tipo: 'regenerar' });
    barra(1, () => t(`Datos actualizados en ${segundos} s.`, `Data updated in ${segundos} s.`));
    await avisarSW();
  } catch (e) {
    error(() => t(`No se pudieron generar los datos: ${e.message}`, `Could not generate game data. Technical details: ${e.message}`));
  }
  await pintarEstado();
}

async function borrar() {
  if(trabajando)return error(()=>t('Espera a que termine la operación actual.','Wait for the current operation to finish.'));
  if (!confirm(t('¿Borrar los recursos importados de este navegador? (La partida no se borra.)', 'Delete the imported assets from this browser? (Your save will not be deleted.)'))) return;
  await borrarTodo();
  await avisarSW();
  $('progreso').hidden = true;
  await pintarEstado();
}

// ---- partida (cuenta del servidor simulado en localStorage) ----
function exportarPartida() {
  const datos = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(PARTIDA)) datos[k] = localStorage.getItem(k);
  }
  if (!Object.keys(datos).length) return error(() => t('Todavía no hay partida guardada en este navegador.', 'There is no save in this browser yet.'));
  const blob = new Blob([JSON.stringify({ juego: 'saomd-web', fecha: new Date().toISOString(), datos }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `saomd-partida-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importarPartida(file) {
  error(null);
  try {
    const j = JSON.parse(await file.text());
    if (j.juego !== 'saomd-web' || typeof j.datos !== 'object') {
      return error(() => t('No se pudo cargar la partida: no es una partida de este port.', 'Could not load the save: this is not a save from this port.'));
    }
    if (!confirm(t('¿Reemplazar la partida de este navegador por la del archivo?', 'Replace the save in this browser with the save from this file?'))) return;
    for (const k of Object.keys(localStorage)) if (k.startsWith(PARTIDA)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(j.datos)) if (k.startsWith(PARTIDA)) localStorage.setItem(k, String(v));
    $('partida-ok').hidden = false;
  } catch (e) {
    error(() => t(`No se pudo cargar la partida: ${e.message}`, `Could not load the save. Technical details: ${e.message}`));
  }
}

$('elegir-archivo').onclick = () => $('archivo').click();
$('elegir-partida').onclick = () => $('cargar-partida').click();
$('archivo').onchange = () => texto('archivos-elegidos', () => {
  const nombres = [...$('archivo').files].map((f) => f.name);
  return nombres.length ? nombres.join(', ') : t('Ningún archivo seleccionado', 'No files selected');
});
$('importar').onclick = () => importar();
$('regenerar').onclick = regenerar;
$('borrar').onclick = borrar;
$('exportar-partida').onclick = exportarPartida;
$('cargar-partida').onchange = (ev) => ev.target.files[0] && importarPartida(ev.target.files[0]);
const falta = faltaSoporte();
if (falta.length) texto('soporte', () => t(`Este navegador no puede importar: falta ${faltaSoporte().join(', ')}.`, `This browser cannot import files: missing ${faltaSoporte().join(', ')}.`));

// Para las pruebas (servidor.py --apk): __portada.importar([], ['/_apk/saomd8.apks']).
window.__portada = { importar, regenerar };

const e = await pintarEstado();
if (e && ('serviceWorker' in navigator)) await registrarSW().catch(() => null);
if (e && (e.regenerando || params.has('regenerar') || (e.version ?? 0) < VERSION_DATOS)) await regenerar();
