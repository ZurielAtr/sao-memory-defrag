// D89: FUN_005c79d0, constantes ARMv7 005c822c/005c8b9c/005c8ba0.
// Las posiciones son del tablero nativo, antes de centrar y escalar su contenedor.
export function posicionNodo(local) {
  const fila = Math.ceil(local / 11);
  return [(fila % 2 ? 216 : 72) + (local % 11 === 0 ? 2880 : (local % 11 - 1) * 288),
    (fila - 1) * 144 + 72];
}

/** FUN_008a3c7c: ilustración estrecha propia de Party; no recortar el retrato 1500². */
export function rutaRetratoEquipo(id, variante = 0) {
  return `images/character/party/party_${id}${variante ? `_${variante}` : ''}.png`;
}

export function limitesTablero(nodos) {
  const puntos = nodos.map(n => posicionNodo(n.local));
  if (!puntos.length) return { x: 0, y: 0, ancho: 750, alto: 768 };
  const x = Math.min(...puntos.map(p => p[0])) - 84;
  const y = Math.min(...puntos.map(p => p[1])) - 72;
  return { x, y, ancho: Math.max(...puntos.map(p => p[0])) + 84 - x,
    alto: Math.max(...puntos.map(p => p[1])) + 72 - y };
}
