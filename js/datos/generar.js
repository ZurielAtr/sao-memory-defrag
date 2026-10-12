// Genera todos los datos del juego web (lo que va en web/data) a partir de los recursos descifrados (D68). Lo usan
// herramientas/generar_datos.mjs (Node, desde extraido/descifrado) y el importador del navegador (OPFS).
// Mismo orden que los exportadores de Python: personajes → misiones → IA → cajas → proyectiles → el resto.

import { exportarPersonajes } from './exportar_personajes.js';
import { exportarMisiones } from './exportar_mision.js';
import { exportarIA } from './exportar_ia.js';
import { exportarCajas } from './exportar_cajas.js';
import { exportarProyectiles } from './exportar_proyectiles.js';
import { exportarHistorias, exportarInterfaz, exportarApi, exportarPasivas, exportarEstados, exportarCombate } from './exportar_varios.js';
import { enemigosStats } from './comun.js';
import { aJSON } from './py.js';
import { exportarAudio } from './exportar_audio.js';

/** Versión del formato de los datos generados: subirla cuando cambie un exportador obliga a regenerarlos. */
export const VERSION_DATOS = 4;

// Pasos con su peso aproximado (para la barra de progreso).
const PASOS = [
  ['personajes', 8], ['enemigos', 10], ['animaciones', 25], ['misiones', 20], ['ia', 2], ['combate', 1], ['cajas', 5],
  ['proyectiles', 12], ['historias', 12], ['interfaz', 2], ['api', 2], ['pasivas', 1], ['estados', 1], ['audio', 2],
];
const TOTAL = PASOS.reduce((s, [, p]) => s + p, 0);

/**
 * fuente: Fuente (fuente.js); salida: { escribir(ruta, texto), vaciar?(dir) } con rutas relativas a data/.
 * avance(fracción, paso) informa del progreso.
 */
export async function generarDatos(fuente, salida, avance = () => {}) {
  let hecho = 0;
  const paso = (nombre) => {
    const peso = PASOS.find(([n]) => n === nombre)[1];
    const base = hecho;
    hecho += peso;
    avance(base / TOTAL, nombre);
    return (f) => avance((base + peso * f) / TOTAL, nombre);
  };

  paso('personajes');
  const pj = await exportarPersonajes(fuente, salida);
  paso('enemigos');
  const stats = await enemigosStats(fuente);
  await fuente.enemigos();
  await fuente.animaciones(paso('animaciones'));
  const resumen = await exportarMisiones(fuente, salida, stats, paso('misiones'));
  paso('ia');
  await exportarIA(fuente, salida, stats, resumen);
  paso('combate');
  await exportarCombate(fuente, salida, stats);
  fuente.soltar(); // los enemigos y las tablas de las misiones ya no hacen falta
  paso('cajas');
  await exportarCajas(fuente, salida, new Set([...pj.usadas, ...resumen.unidades]));
  await exportarProyectiles(fuente, salida, pj.unidadDe, paso('proyectiles'));
  fuente.soltar();
  paso('historias');
  await exportarHistorias(fuente, salida);
  fuente.soltar();
  paso('interfaz');
  await exportarInterfaz(fuente, salida);
  paso('api');
  await exportarApi(fuente, salida);
  paso('pasivas');
  await exportarPasivas(fuente, salida);
  paso('estados');
  await exportarEstados(fuente, salida);
  fuente.soltar();
  paso('audio');
  await exportarAudio(fuente, salida);
  await salida.escribir('version.json', aJSON({ version: VERSION_DATOS }));
  avance(1, 'listo');
}
