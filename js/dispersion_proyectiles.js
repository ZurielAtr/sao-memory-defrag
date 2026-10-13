// D75, ARMv7 0082aefc/0085671c: corrección del punto de salida por el primer arma
// equipada y bullet.f61. El nombre histórico «dispersión» NO implica azar ni giro.
// 00699818 lee equipment.f26; el pseudocódigo de los cos/sin confunde registros.

export const SALIDA_ARMA = Object.freeze({
  pixelesPorUnidad: 1.8200000524520874,
  radianesPorGrado: -0.01745329238474369,
  pi: 3.1415927410125732,
});

const f32 = Math.fround;

/** Corrección en coordenadas del mundo. ancho y factorX son caja.f4 y caja.f6. */
export function desplazamientoSalidaArma({ ancho, factorX = 1, angulo = 0, escala = 1,
  mira = 1, correccionSalida = 0 }) {
  if (![ancho, factorX, angulo, escala, mira, correccionSalida].every(Number.isFinite)) return [0, 0];
  // Orden de las instrucciones VFP: factorX/1.82, ancho, escala, mitad, coeficiente del equipo.
  let mitad = f32(f32(f32(f32(factorX) / SALIDA_ARMA.pixelesPorUnidad) * f32(ancho)) * f32(escala));
  mitad = f32(mitad * .5);
  const coeficiente = f32(f32(f32(correccionSalida) / -10000) + 1);
  const distancia = f32(coeficiente * mitad);
  let rad = f32(f32(angulo) * SALIDA_ARMA.radianesPorGrado);
  if (mira < 0) rad = f32(SALIDA_ARMA.pi - rad);
  return [f32(-distancia * f32(Math.cos(rad))), f32(-distancia * f32(Math.sin(rad)))];
}

/**
 * Corrige una salida sin modificar actor, evento ni ficha. armaEquipada debe ser
 * un equipo REAL (getter nativo 0x624), no la clase p.arma ni el bando p.equipo.
 * cajaSalida conserva {ancho: f4, factorX: f6, angulo: f3} antes de compactar cajas.
 * Sin equipo, f61 o metadatos, conserva la salida; no inventa ancho ni equipo.
 */
export function aplicarDispersionArma(pos, p, disparo, ficha, { armaEquipada = p.armaEquipada } = {}) {
  const caja = disparo.cajaSalida;
  if (disparo.tipo !== 4 || !p.esPersonaje || !armaEquipada || !ficha?.crudo?.f61 || !caja) return pos;
  const correccionSalida = armaEquipada.correccionSalida ?? armaEquipada.f26 ?? 0;
  const [dx, dy] = desplazamientoSalidaArma({ ...caja, correccionSalida,
    escala: p.fisica?.escala ?? p.pj?.fisica?.escala ?? p.ficha?.fisica?.escala ?? 1,
    mira: (p.dir ?? 1) * (p.artFacing ?? 1) });
  if (dx === 0 && dy === 0) return pos;
  return { ...pos, x: pos.x + dx, y: pos.y + dy };
}
