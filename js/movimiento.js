// Movimiento por velocidad (D58). Leído en el binario (NOTAS.md "Impulsos, rozamiento y profundidad"):
// - Cada cambio de motion fija la velocidad de la unidad (+0x84) según la motion (FUN_0084f384: caminar,
//   correr, paso, salto…; las demás, 0) y activa el rozamiento (+0xf57 = 1, +0x3d6 = 1).
// - El evento 10 (FUN_00840fbc) cambia esa velocidad en mitad de la animación; dura hasta otro evento 10
//   o el siguiente cambio de motion.
// - Cada cuadro (FUN_00848e2c → FUN_008497f0, por eje x y z): si la velocidad pasa de la objetivo, frena
//   a 1980/s² (DAT_00849370) en la dirección del movimiento hasta llegar a ella; si no, sigue igual.
//   Objetivo: en el suelo, la de la motion (caminar/correr: dirección · 248/495 · velocidad; el resto 0);
//   en el aire, 264 (DAT_0084937c) en la dirección del movimiento.

export const FRENADO = 1980;
export const VELOCIDAD_AIRE = 264;

// FUN_008497f0: avanza un eje `dt` segundos con aceleración `a` hasta la velocidad `objetivo`.
// Devuelve [desplazamiento, velocidad nueva].
export function integrarEje(v, a, objetivo, dt) {
  if (!a) return [v * dt, v];
  const nv = v + a * dt;
  if ((v > 0 && nv < objetivo) || (v < 0 && nv > objetivo)) {
    const t = (objetivo - v) / a; // llega a la objetivo a mitad del paso
    return [(dt - t) * objetivo + t * v + 0.5 * a * t * t, objetivo];
  }
  return [v * dt + 0.5 * a * dt * dt, nv];
}

// Aplica la velocidad horizontal (u.vx, u.vz) de la unidad `u` con el rozamiento del juego.
// `objetivo` = [x, z] de la motion en el suelo (por defecto, parada); en el aire, 264 en la dirección.
export function moverConVelocidad(u, dt, { enAire = false, objetivo = [0, 0] } = {}) {
  const vx = u.vx ?? 0, vz = u.vz ?? 0;
  if (!vx && !vz) return;
  const n = Math.hypot(vx, vz);
  const t = enAire ? [(vx / n) * VELOCIDAD_AIRE, (vz / n) * VELOCIDAD_AIRE] : objetivo;
  const ax = (-vx / n) * FRENADO, az = (-vz / n) * FRENADO;
  const [dx, nvx] = Math.abs(t[0]) < Math.abs(vx) ? integrarEje(vx, ax, t[0], dt) : [vx * dt, vx];
  const [dz, nvz] = Math.abs(t[1]) < Math.abs(vz) ? integrarEje(vz, az, t[1], dt) : [vz * dt, vz];
  u.x += dx;
  u.z = (u.z ?? 0) + dz;
  u.vx = nvx;
  u.vz = nvz;
}

// Giro hacia el objetivo (+0x1dc = 1 desde FUN_00836f44; objetivo +0x34). Desplazamiento o velocidad (dx, dz)
// de `u` que va hacia delante: si el objetivo está delante y el ángulo de (|tx|, tz) con el eje x es menor que
// `maxAng`, se reorienta hacia él conservando la longitud (FUN_0083e330 con la raíz, maxAng = 45°;
// FUN_00840fbc con el evento 10, maxAng = f4 grados). Devuelve [dx, dz] (los mismos si no gira).
export const GIRO_RAIZ = Math.PI / 4; // DAT_0083e6a8
export function orientar(u, objetivo, dx, dz, maxAng) {
  if (!objetivo || !maxAng || (!dx && !dz)) return [dx, dz];
  const tx = objetivo.x - u.x, tz = (objetivo.z ?? 0) - (u.z ?? 0);
  if ((tx > 0 && dx < 0) || (tx < 0 && dx > 0) || !tx) return [dx, dz]; // se aleja del objetivo o no hay x
  if (Math.abs(Math.atan2(tz, Math.abs(tx))) >= maxAng) return [dx, dz];
  const n = Math.hypot(tx, tz), l = Math.hypot(dx, dz);
  return [(l * tx) / n, (l * tz) / n];
}
