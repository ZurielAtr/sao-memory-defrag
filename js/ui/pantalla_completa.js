// Pantalla completa automática sólo en dispositivos táctiles (en escritorio no cambia nada).
// - Android/Chrome y similares: Fullscreen API con el primer toque de cada página (el navegador
//   exige un gesto y la pantalla completa no sobrevive a cambiar de página).
// - iPhone: Safari no permite pantalla completa a una página; sólo abriéndola desde la pantalla de
//   inicio («Compartir → Añadir a pantalla de inicio»), con manifest.webmanifest y las metas de las páginas.

export function esTactil(w = globalThis) {
  return Boolean(w.matchMedia?.('(pointer: coarse)')?.matches);
}

export function enPantallaCompleta(doc = globalThis.document, w = globalThis) {
  return Boolean(doc?.fullscreenElement || doc?.webkitFullscreenElement
    || w.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)')?.matches || w.navigator?.standalone);
}

/** Pide pantalla completa con el primer toque. Una sola vez por página: si el jugador la cierra, no insiste. */
export function montarPantallaCompleta(doc = globalThis.document, w = globalThis) {
  if (!doc || !esTactil(w)) return false;
  const el = doc.documentElement;
  const pedir = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!pedir || enPantallaCompleta(doc, w)) return false;
  let pedido = false;
  const alTocar = (ev) => {
    if (pedido || ev.pointerType === 'mouse' || enPantallaCompleta(doc, w)) return;
    pedido = true;
    w.removeEventListener('pointerup', alTocar, true);
    try {
      Promise.resolve(pedir.call(el, { navigationUI: 'hide' })).catch(() => { /* el navegador lo rechazó */ });
    } catch { /* sin soporte real */ }
  };
  w.addEventListener('pointerup', alTocar, true);
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') montarPantallaCompleta(document, window);
