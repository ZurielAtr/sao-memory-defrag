// D108: importación OPCIONAL del respaldo histórico de descargas (archivo de Mega enlazado por
// github.com/Nightshades1/Sword-Art-Online-MD---Asset-Unpacker, versión 1.42.93, ≈2.4 GB). El jugador lo elige en la
// portada después de importar la APK. Sólo añade lo que la APK no trae: hoy, los carteles de los banners
// (images/lottery/**). Nada se sube: se lee del archivo elegido y se descifra con la clave de recursos de la APK.
// Diseño: docs/diseno-respaldo-d93.md; alcance y límites: docs/banners-d108.md.

import { leerDirectorio, bytesEntrada, flujoEntrada, recorrerZip, contenido, rangoDatos } from './zip.js';
import { esCCZp, descifrar } from './ccz.js';

export const RESPALDO = Object.freeze({
  manifiesto: 'files/download/project.manifest',
  // SHA-256 del project.manifest 1.42.93 de ese respaldo (D93). Sólo se publica el hash, no el contenido.
  sha256: '37dbaa818b758ecfc0999a1b1bb19582c125cefc0d297dd2223644d3224eaf72',
  prefijo: 'files/download/',
});

/** Rutas que se importan del respaldo. */
export const incluirRespaldo = (ruta) => ruta.startsWith('images/lottery/') && !ruta.endsWith('/');

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Entradas del archivo si es el respaldo (tiene su project.manifest), o null. */
export async function examinarRespaldo(blob) {
  let entradas;
  try { entradas = await leerDirectorio(blob); } catch { return null; }
  return entradas.some((e) => e.nombre === RESPALDO.manifiesto) ? entradas : null;
}

/**
 * Importa del respaldo lo que falta. `existe(ruta)` dice si la ruta ya está (la APK manda siempre);
 * `ks` = keystream CCZp de la APK; `destino.escribir(ruta, bytes)`. Devuelve { archivos, bytes, paquetes }.
 */
export async function importarRespaldo({ blob, entradas, ks, existe, destino, avance = () => {}, incluir = incluirRespaldo, sha = defaultSha }) {
  const man = entradas.find((e) => e.nombre === RESPALDO.manifiesto);
  if (!man) throw new Error('el archivo no es el respaldo de descargas (falta files/download/project.manifest)');
  const huella = await sha(await bytesEntrada(blob, man));
  if (huella !== RESPALDO.sha256) throw new Error(`el respaldo no es la versión esperada (1.42.93): SHA-256 del manifiesto ${huella.slice(0, 12)}…`);
  const paquetes = entradas.filter((e) => e.nombre.startsWith(RESPALDO.prefijo) && e.nombre.endsWith('.zip'));
  const total = paquetes.reduce((s, e) => s + e.tamComp, 0) || 1;
  let hecho = 0, bytes = 0, abiertos = 0;
  const archivos = [];
  const guardar = async (ruta, datos) => {
    const out = esCCZp(datos) ? await descifrar(datos, ks) : datos;
    await destino.escribir(ruta, out);
    archivos.push(ruta); bytes += out.length;
  };
  for (const p of paquetes) {
    avance({ fase: 'respaldo', fraccion: hecho / total, archivos: archivos.length, detalle: p.nombre.slice(RESPALDO.prefijo.length) });
    if (p.metodo === 0) {
      // Paquete almacenado: su directorio se lee por rangos, sin recorrerlo entero.
      const [ini, fin] = await rangoDatos(blob, p);
      const interno = blob.slice(ini, fin);
      let lista;
      try { lista = await leerDirectorio(interno); } catch { lista = []; }
      const elegidas = lista.filter((e) => incluir(e.nombre) && !existe(e.nombre));
      if (elegidas.length) abiertos++;
      for (const e of elegidas) await guardar(e.nombre, await bytesEntrada(interno, e));
    } else if (p.metodo === 8) {
      // Paquete comprimido: hay que inflarlo en flujo para ver qué trae.
      let alguno = false;
      await recorrerZip(await flujoEntrada(blob, p), (e) => {
        if (!incluir(e.nombre) || existe(e.nombre)) return null;
        alguno = true;
        return async (comp) => guardar(e.nombre, await contenido(e, comp));
      });
      if (alguno) abiertos++;
    }
    hecho += p.tamComp;
  }
  avance({ fase: 'respaldo', fraccion: 1, archivos: archivos.length });
  return { archivos, bytes, paquetes: abiertos };
}

async function defaultSha(bytes) {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}
