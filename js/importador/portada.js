// Portada del port (index.html, F7, D65, D68): aviso de proyecto no oficial, importación de la APK del jugador
// (worker trabajador.js → OPFS; sw.js sirve lo importado), regeneración de los datos y copia de la partida.

import { estado as leerEstado, borrarTodo } from './opfs.js';
import { VERSION_DATOS } from '../datos/generar.js';

const $ = (id) => document.getElementById(id);
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
  if (!navigator.storage?.getDirectory) falta.push('almacenamiento de archivos (OPFS)');
  if (typeof DecompressionStream !== 'function') falta.push('descompresión (DecompressionStream)');
  if (!('serviceWorker' in navigator)) falta.push('service workers');
  if (typeof Worker !== 'function') falta.push('workers');
  if (!isSecureContext) falta.push('conexión segura (https o localhost)');
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

function barra(fraccion, texto) {
  $('progreso').hidden = false;
  $('barra').style.width = `${Math.round(fraccion * 1000) / 10}%`;
  $('texto-progreso').textContent = texto;
}

const FASES = {
  examinar: [0, 0.01, 'Leyendo el archivo…'],
  clave: [0.01, 0.03, 'Buscando la clave en la librería del juego…'],
  recursos: [0.03, 0.72, 'Descifrando los recursos'],
  datos: [0.72, 1, 'Generando los datos del juego'],
};
const PASOS = {
  personajes: 'personajes', enemigos: 'enemigos', animaciones: 'animaciones', misiones: 'misiones', ia: 'IA de los enemigos',
  combate: 'combate', cajas: 'cajas de colisión', proyectiles: 'proyectiles', historias: 'diálogos', interfaz: 'interfaz',
  api: 'servidor simulado', pasivas: 'pasivas', estados: 'estados', listo: 'listo',
};

function mostrarAvance(m, soloDatos) {
  let [a, b, texto] = FASES[m.fase] ?? [0, 1, m.fase];
  if (soloDatos) [a, b] = [0, 1];
  let extra = '';
  if (m.fase === 'recursos' && m.archivos) extra = `: ${m.archivos.toLocaleString('es')} archivos`;
  if (m.fase === 'datos' && m.detalle) extra = `: ${PASOS[m.detalle] ?? m.detalle}`;
  barra(a + (b - a) * (m.fraccion ?? 0), `${texto}${extra} (${Math.floor((m.fraccion ?? 0) * 100)} %)`);
}

/** Lanza el worker con un mensaje y espera a que acabe. */
function trabajar(mensaje) {
  return new Promise((resolver, rechazar) => {
    const w = new Worker(new URL('./trabajador.js', import.meta.url), { type: 'module' });
    const t0 = performance.now();
    trabajando = true;
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.tipo === 'avance') mostrarAvance(m, mensaje.tipo === 'regenerar');
      else {
        trabajando = false;
        w.terminate();
        if (m.tipo === 'listo') resolver({ estado: m.estado, segundos: Math.round((performance.now() - t0) / 1000) });
        else rechazar(Object.assign(new Error(m.mensaje), { nombre: m.nombre }));
      }
    };
    w.onerror = (ev) => {
      trabajando = false;
      w.terminate();
      rechazar(new Error(ev.message || 'error en el worker'));
    };
    w.postMessage(mensaje);
  });
}

function error(msg) {
  $('error').hidden = !msg;
  $('error').textContent = msg ?? '';
}

async function pintarEstado() {
  const e = navigator.storage?.getDirectory ? await leerEstado().catch(() => null) : null;
  $('sin-importar').textContent = e ? 'Volver a importar' : '1. Importa tu APK';
  $('importado').hidden = !e;
  if (e) {
    const f = new Date(e.fecha).toLocaleString('es');
    $('resumen').textContent = `Importado el ${f}: ${e.archivos.toLocaleString('es')} archivos (${fmtGB(e.bytes)}) de ${e.fuentes.map((x) => x.nombre).join(', ')}.`;
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
    return 'Firefox limita a 2 GB las páginas sin «almacenamiento persistente»: da ese permiso a la página (en el candado de la barra de direcciones → Permisos, o aceptando el aviso que sale al importar) y vuelve a intentarlo.';
  }
  if (navigator.brave) {
    return 'En Brave, prueba a desactivar los escudos (Shields) para esta página o usa Chrome o Edge. Si estás en una ventana privada, usa una normal.';
  }
  return 'Si estás en una ventana privada o de incógnito, usa una normal (ahí el espacio es muy pequeño). Si no, libera espacio en el disco. También puedes intentarlo igual: si no cabe, se avisa y se borra lo copiado.';
}

async function importar(archivos = [...$('archivo').files], urls = null) {
  error(null);
  if (urls) archivos = urls.map((u) => ({ size: 2.8 * GB, name: u }));
  if (!archivos.length) return error('Elige primero el archivo .apks (o la .apk) del juego.');
  const falta = faltaSoporte();
  if (falta.length) return error(`Este navegador no sirve para importar: falta ${falta.join(', ')}. Usa Chrome, Edge o Firefox de escritorio actualizados.`);
  const tam = archivos.reduce((s, f) => s + f.size, 0);
  const necesario = tam * 1.4 + 0.3 * GB; // los recursos descifrados ocupan algo más que el .apks, más los datos
  // Primero el permiso de almacenamiento persistente: en Firefox, sin él, cada página tiene como mucho 2 GB.
  const persistente = await navigator.storage.persist?.().catch(() => false);
  const libre = await espacioLibre();
  if (libre < necesario && !forzar) {
    forzar = true;
    $('importar').textContent = 'Importar de todos modos';
    return error(`El navegador solo deja usar ${fmtGB(libre)} a esta página y hacen falta unos ${fmtGB(necesario)}. ${pistaEspacio(persistente)}`);
  }
  $('importar').disabled = true;
  try {
    await registrarSW();
    const { segundos } = await trabajar(urls ? { tipo: 'importar', urls } : { tipo: 'importar', archivos });
    barra(1, `Listo en ${Math.floor(segundos / 60)} min ${segundos % 60} s.`);
    await avisarSW();
  } catch (e) {
    if (/quota/i.test(`${e.nombre} ${e.message}`)) {
      await borrarTodo(); // lo importado a medias no sirve: se libera el espacio
      error(`El navegador no dejó guardar más (se quedó sin espacio para esta página). ${pistaEspacio(persistente)}`);
    } else error(`No se pudo importar: ${e.message}`);
    $('progreso').hidden = true;
  } finally {
    forzar = false;
    $('importar').textContent = 'Importar';
    $('importar').disabled = false;
    await pintarEstado();
  }
}

async function regenerar() {
  error(null);
  try {
    await registrarSW();
    const { segundos } = await trabajar({ tipo: 'regenerar' });
    barra(1, `Datos actualizados en ${segundos} s.`);
    await avisarSW();
  } catch (e) {
    error(`No se pudieron generar los datos: ${e.message}`);
  }
  await pintarEstado();
}

async function borrar() {
  if (!confirm('¿Borrar los recursos importados de este navegador? (La partida no se borra.)')) return;
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
  if (!Object.keys(datos).length) return error('Todavía no hay partida guardada en este navegador.');
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
    if (j.juego !== 'saomd-web' || typeof j.datos !== 'object') throw new Error('no es una partida de este port');
    if (!confirm('¿Reemplazar la partida de este navegador por la del archivo?')) return;
    for (const k of Object.keys(localStorage)) if (k.startsWith(PARTIDA)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(j.datos)) if (k.startsWith(PARTIDA)) localStorage.setItem(k, String(v));
    $('partida-ok').hidden = false;
  } catch (e) {
    error(`No se pudo cargar la partida: ${e.message}`);
  }
}

$('importar').onclick = () => importar();
$('regenerar').onclick = regenerar;
$('borrar').onclick = borrar;
$('exportar-partida').onclick = exportarPartida;
$('cargar-partida').onchange = (ev) => ev.target.files[0] && importarPartida(ev.target.files[0]);
const falta = faltaSoporte();
if (falta.length) $('soporte').textContent = `Este navegador no puede importar: falta ${falta.join(', ')}.`;

// Para las pruebas (servidor.py --apk): __portada.importar([], ['/_apk/saomd8.apks']).
window.__portada = { importar, regenerar };

const e = await pintarEstado();
if (e && ('serviceWorker' in navigator)) await registrarSW().catch(() => null);
if (e && (params.has('regenerar') || (e.version ?? 0) < VERSION_DATOS)) await regenerar();
