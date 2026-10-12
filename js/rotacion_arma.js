// D74: ajuste visual provisional del port. El ángulo viene del gestor57;
// aún no se ha confirmado una rotación adicional de huesos en la biblioteca.
export function rotacionArma57(estado, emisor) {
  if ((emisor.arma ?? emisor.pj?.arma) !== 6 || !estado?.vector?.some((v) => v !== 0)) return null;
  const delta = estado.angulo - estado.anguloInicial;
  return Number.isFinite(delta) ? Math.atan2(Math.sin(delta), Math.cos(delta)) : null;
}

// La articulación del tronco conserva unidos los brazos, manos y arma.
export function huesoRotacionArma(pack) {
  return pack.parts.some((p) => p.name === 'belly') ? 'belly' :
    pack.parts.some((p) => p.name === 'chest') ? 'chest' : null;
}
