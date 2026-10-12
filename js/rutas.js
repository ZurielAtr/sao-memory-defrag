// Raíz de la página, calculada desde este módulo: funciona en / y en /nombre-del-repo/.
// En Node se conserva / para las pruebas que simulan fetch.
const raiz = new URL('../', import.meta.url);
export const RAIZ_WEB = /^https?:$/.test(raiz.protocol) ? raiz.pathname : '/';

/** Ruta de recursos/datos dentro de esta instalación, incluidos query y fragmento. */
export function rutaWeb(ruta, base = RAIZ_WEB) {
  return base + ruta.replace(/^\/+/, '');
}
