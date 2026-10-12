import { rutaWeb } from './rutas.js';
// Personaje jugable desde la master data (D46): web/data/personajes/<id>.json, generado por
// herramientas/exportar_personajes.py. Trae unidad (.ssbp), traje, retrato del cut-in, stats,
// crecimiento, ataques normales, skills equipadas (character.f35) y alcance del arma (PROVISIONAL).
// Las sword skills de la unidad (nombres, golpes, multiplicadores) siguen en web/data/skills_<unidad>.json
// y sus cuadros de impacto se deducen de los efectos de la animación (D24, PROVISIONAL).

/** Datos del personaje `id`, o null si no está exportado (el juego usa entonces sus valores fijos). */
export async function cargarPersonaje(id) {
  try {
    const res = await fetch(rutaWeb(`/data/personajes/${encodeURIComponent(id)}.json`));
    if (!res.ok) {
      console.info(`personaje ${id} sin datos (no es jugable o faltan datos: node herramientas/generar_datos.mjs)`);
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}
