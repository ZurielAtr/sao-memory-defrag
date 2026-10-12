// Importador (F7, D65, D68): lee el saomd8.apks (SAO MD Revival) o una .apk del juego que elige el jugador, saca las
// claves de su librería, descifra los recursos (assets/en) y los entrega a `destino`. Todo pasa en el equipo del
// jugador: nada se sube a ningún sitio. Hace lo mismo que herramientas/descifrar_todo.py (si un archivo está en
// varias fuentes gana la última: la APK oficial antes que los packs de Revival 1, 2 y 3).
//
// destino: { escribir(ruta, bytes) async, borrar?(ruta) async } con rutas relativas a la carpeta de recursos.
// avance({ fase, fraccion, archivos, detalle }) informa del progreso.

import { leerDirectorio, flujoEntrada, bytesEntrada, recorrerZip, contenido } from './zip.js';
import { sacarClaves } from './claves.js';
import { keystream, esCCZp, descifrar } from './ccz.js';

const LIB = 'lib/armeabi-v7a/libcocos2dcpp.so';
const SPLIT_LIB = 'split_config.armeabi_v7a.apk';
const ASSETS = 'assets/en/';

/** Qué trae cada archivo elegido: { blob, nombre, tipo: 'apks' | 'apk', entradas, apks: [entradas .apk de dentro] }. */
export async function examinar(blob, nombre = '') {
  const entradas = await leerDirectorio(blob);
  const apks = entradas.filter((e) => e.nombre.endsWith('.apk'));
  if (apks.length) return { blob, nombre, tipo: 'apks', entradas, apks };
  if (entradas.some((e) => e.nombre.startsWith(ASSETS) || e.nombre === LIB)) return { blob, nombre, tipo: 'apk', entradas, apks: [] };
  throw new Error(`${nombre || 'el archivo'} no parece una APK de SAO Memory Defrag`);
}

/** La librería de armeabi-v7a (Uint8Array) de alguna de las fuentes, o null. */
async function buscarLib(fuentes) {
  for (const f of fuentes) {
    if (f.tipo === 'apk') {
      const e = f.entradas.find((x) => x.nombre === LIB);
      if (e) return bytesEntrada(f.blob, e);
    } else {
      const split = f.apks.find((x) => x.nombre === SPLIT_LIB) ?? f.apks.find((x) => x.nombre === 'base.apk');
      if (!split) continue;
      let lib = null;
      await recorrerZip(await flujoEntrada(f.blob, split), (e) => {
        if (e.nombre !== LIB) return null;
        return async (comp) => { lib = await contenido(e, comp); return undefined; };
      });
      if (lib) return lib;
    }
  }
  return null;
}

/**
 * Importa. archivos: [{ blob (File/Blob), nombre }]. Devuelve { claves, archivos: [rutas escritas], bytes }.
 * `saltar(ruta)` (opcional) evita reescribir lo que ya está (para seguir una importación cortada).
 */
export async function importar({ archivos, destino, avance = () => {}, saltar = null }) {
  avance({ fase: 'examinar', fraccion: 0 });
  const fuentes = [];
  for (const a of archivos) fuentes.push(await examinar(a.blob, a.nombre));
  // Orden de descifrar_todo.py: la APK oficial antes que los packs de Revival (gana la última).
  fuentes.sort((x, y) => (x.tipo === y.tipo ? 0 : x.tipo === 'apk' ? -1 : 1));

  avance({ fase: 'clave', fraccion: 0 });
  const lib = await buscarLib(fuentes);
  if (!lib) throw new Error('no se encontró la librería del juego (lib/armeabi-v7a/libcocos2dcpp.so)');
  const claves = sacarClaves(lib, (f) => avance({ fase: 'clave', fraccion: f }));
  const ks = keystream(claves.ccz);

  // Total de bytes a recorrer (para el progreso): entradas assets/en de las .apk y las .apk de dentro del .apks.
  const partes = [];
  for (const f of fuentes) {
    if (f.tipo === 'apk') partes.push({ f, entradas: f.entradas.filter((e) => e.nombre.startsWith(ASSETS) && !e.nombre.endsWith('/')) });
    else for (const e of [...f.apks].sort((a, b) => (a.nombre < b.nombre ? -1 : 1))) if (!e.nombre.startsWith('split_config.')) partes.push({ f, apk: e });
  }
  const total = partes.reduce((s, p) => s + (p.apk ? p.apk.tam : p.entradas.reduce((t, e) => t + e.tam, 0)), 0) || 1;
  let hecho = 0;

  const escritas = new Map(); // ruta en minúsculas → ruta (como descifrar_todo.py: gana la última)
  let bytes = 0;
  const guardar = async (nombre, datos) => {
    const ruta = nombre.slice(ASSETS.length);
    const clave = ruta.toLowerCase();
    const antes = escritas.get(clave);
    if (antes !== undefined && antes !== ruta) await destino.borrar?.(antes);
    escritas.set(clave, ruta);
    if (saltar && (await saltar(ruta))) return;
    const out = esCCZp(datos) ? await descifrar(datos, ks) : datos;
    bytes += out.length;
    await destino.escribir(ruta, out);
  };
  const informar = (detalle) => avance({ fase: 'recursos', fraccion: Math.min(1, hecho / total), archivos: escritas.size, detalle });

  for (const p of partes) {
    if (!p.apk) {
      for (const e of p.entradas) {
        await guardar(e.nombre, await bytesEntrada(p.f.blob, e));
        hecho += e.tam;
        if (escritas.size % 50 === 0) informar(e.nombre);
      }
      continue;
    }
    let base = hecho;
    // Progreso por bytes leídos del flujo descomprimido de la APK de dentro.
    const contador = new TransformStream({
      transform(chunk, ctl) {
        base += chunk.length;
        hecho = base;
        ctl.enqueue(chunk);
      },
    });
    await recorrerZip((await flujoEntrada(p.f.blob, p.apk)).pipeThrough(contador), (e) => {
      if (!e.nombre.startsWith(ASSETS) || e.nombre.endsWith('/')) return null;
      return async (comp) => {
        await guardar(e.nombre, await contenido(e, comp));
        if (escritas.size % 50 === 0) informar(e.nombre);
      };
    });
  }
  informar('');
  return { claves, archivos: [...escritas.values()], bytes };
}
