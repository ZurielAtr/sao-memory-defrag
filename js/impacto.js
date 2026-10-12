// Pausa de impacto (D57). Leído en el binario (NOTAS.md "Medidor de guardia y pausa de impacto"):
// - Al aplicar un golpe (FUN_008389ec) el atacante se para attack.f25 s y el defensor attack.f26 s
//   (f32 / f33 si el defensor está en el estado 0x13), × 1/(n+1) con n = veces que ese ataque ya pegó,
//   × ajuste global 8 / 10000 (1). Virtual 0x180 → 0x17c → FUN_0083c60c (+0x138); solo sube, nunca baja.
//   El defensor no se para si FUN_008498b0 (estados que no se interrumpen) salvo con attack.f64.
// - Parada (FUN_008395f0): 0.4 s a los dos.
// - Mientras dura, la animación va a velocidad 0 (FUN_0084f2b8) y la unidad no se mueve (FUN_0083c72c,
//   FUN_00848e2c); se descuenta en la actualización de la unidad (FUN_008377d8).
// PROVISIONAL: n = objetivos que ese ataque ya golpeó en la animación (el contador del juego, +0x188,
// sin leer); sin el estado 0x13 ni FUN_008498b0; pausa de las balas del jugador pendiente.
// D71: las balas enemigas aplican pausa a la bala y al defensor, sin parar al emisor (provisional).

export const PAUSA_PARADA = 0.4; // 0x3ecccccd

export function pausar(u, t) {
  if (t > 0 && !(u.pausa >= t)) u.pausa = t;
}

export const enPausa = (u) => u.pausa > 0;

export function descontarPausa(u, dt) {
  if (u.pausa > 0) u.pausa = Math.max(0, u.pausa - dt);
}

// Pausas de un golpe `g` (eventos_cuadro: pausa = [f25, f26, f32, f33]) que ya pegó `n` veces.
export function pausaDeGolpe(atacante, defensor, g, n = 0) {
  const [atq = 0, def = 0] = g.pausa ?? [];
  const f = 1 / (n + 1);
  pausar(atacante, atq * f);
  pausar(defensor, def * f);
}
