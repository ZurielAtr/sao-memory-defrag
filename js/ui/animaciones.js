// Preferencia de animaciones (D91). El juego original no tiene modo de movimiento reducido:
// por defecto se reproducen completas. «sistema» sigue prefers-reduced-motion del navegador.
// Se guarda en el navegador, como el volumen; no forma parte de la cuenta (schema5).
export const CLAVE_ANIMACIONES = 'saomd.animaciones.v1';
export const MODOS_ANIMACION = Object.freeze(['completas', 'reducidas', 'sistema']);
export const MODO_INICIAL = 'completas';

const almacenGlobal = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const sistemaReduce = () => { try { return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { return false; } };

export function crearPreferenciaAnimaciones({ almacen = almacenGlobal(), sistema = sistemaReduce } = {}) {
  let modo = MODO_INICIAL;
  try { const v = JSON.parse(almacen?.getItem(CLAVE_ANIMACIONES) ?? 'null')?.modo; if (MODOS_ANIMACION.includes(v)) modo = v; } catch { /* preferencia dañada */ }
  const oyentes = new Set();
  return {
    get modo() { return modo; },
    /** true cuando hay que omitir introducciones, sacudidas y desplazamientos. */
    reducido() { return modo === 'reducidas' || (modo === 'sistema' && sistema()); },
    ajustar(nuevo) {
      if (!MODOS_ANIMACION.includes(nuevo) || nuevo === modo) return modo;
      modo = nuevo;
      try { almacen?.setItem(CLAVE_ANIMACIONES, JSON.stringify({ modo })); } catch { /* almacenamiento opcional */ }
      for (const f of oyentes) try { f(modo); } catch { /* oyente opcional */ }
      return modo;
    },
    alCambiar(f) { oyentes.add(f); return () => oyentes.delete(f); },
  };
}

export const animaciones = crearPreferenciaAnimaciones();
export const movimientoReducido = () => animaciones.reducido();
