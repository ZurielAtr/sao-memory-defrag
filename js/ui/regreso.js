// Regreso del juego a la interfaz (D49): juego.html?…&volver=interfaz.html manda a la interfaz el
// resultado de quest/result en vez de mostrar el panel provisional de D45.
// PROVISIONAL: el resultado viaja en sessionStorage (es de un solo uso y de esta pestaña; la cuenta
// sigue solo en la API).

export const CLAVE_RESULTADO = 'saomd.interfaz.resultado';
const ESPERA = 1500; // ms para que se vea "¡MISIÓN COMPLETADA!" / "MISIÓN FALLIDA" antes de salir

/** Destino seguro: solo una página .html de este mismo sitio (sin esquema ni barras al inicio). */
export function destinoSeguro(volver) {
  return /^[\w-]+\.html$/.test(volver ?? '') ? volver : null;
}

export function volverAInterfaz(volver, datos) {
  const destino = destinoSeguro(volver);
  if (!destino) return;
  try {
    sessionStorage.setItem(CLAVE_RESULTADO, JSON.stringify(datos));
  } catch (e) {
    console.warn('interfaz: no se pudo guardar el resultado para la pantalla de resultados', e);
  }
  setTimeout(() => location.assign(`${destino}#resultado`), ESPERA);
}

/** Lee (y borra) el resultado que dejó el juego, o null. */
export function tomarResultado() {
  try {
    const t = sessionStorage.getItem(CLAVE_RESULTADO);
    sessionStorage.removeItem(CLAVE_RESULTADO);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}
