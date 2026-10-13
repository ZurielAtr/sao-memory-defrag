// Solo la portada: no cambia el idioma ni el almacenamiento de la partida.
export const CLAVE_IDIOMA = 'saomd-portada-language';
export let idioma = 'en';
const enlaces = new Map();

export function t(es, en) { return idioma === 'es' ? es : en; }

// Conserva la función para poder traducir también mensajes ya visibles sin recargar.
export function texto(id, contenido, atributo = 'textContent') {
  const nodo = document.getElementById(id);
  const pintar = () => { nodo[atributo] = typeof contenido === 'function' ? contenido() : contenido; };
  enlaces.set(`${id}:${atributo}`, pintar);
  pintar();
}

export function cambiarIdioma(valor) {
  idioma = valor === 'es' ? 'es' : 'en';
  document.documentElement.lang = idioma;
  document.title = t('SAO MD · Port no oficial', 'SAO MD · Unofficial browser port');
  document.querySelectorAll('[data-es]').forEach((nodo) => {
    // Ambos fragmentos son contenido estático del HTML, nunca archivos del usuario.
    nodo.dataset.en ??= nodo.innerHTML;
    nodo.innerHTML = nodo.dataset[idioma];
  });
  document.querySelectorAll('[data-title-es]').forEach((nodo) => {
    nodo.dataset.titleEn ??= nodo.title;
    nodo.title = idioma === 'es' ? nodo.dataset.titleEs : nodo.dataset.titleEn;
  });
  document.getElementById('idioma').value = idioma;
  for (const pintar of enlaces.values()) pintar();
  try { localStorage.setItem(CLAVE_IDIOMA, idioma); } catch { /* Preferencia opcional. */ }
}

export function iniciarIdioma() {
  let guardado;
  try { guardado = localStorage.getItem(CLAVE_IDIOMA); } catch { /* Inglés por defecto. */ }
  cambiarIdioma(guardado);
  document.getElementById('idioma').addEventListener('change', (ev) => cambiarIdioma(ev.target.value));
}
