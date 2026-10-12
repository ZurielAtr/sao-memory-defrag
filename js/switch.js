// Switch: cambio de personaje como el juego. Descompilaciones: extraido/switch.c. NOTAS.md "Switch".
//
// - Botón (ControllerFooterWidget, FUN_008fcac0 / FUN_008f9850 / FUN_008fa5d0): se puede cambiar a un
//   personaje que no está en el campo y no ha caído, con la batalla en marcha y la espera del widget (+0x248)
//   a 0; cada cambio la pone a 0.2 s. El que sale hace la motion 0x19 (`back_step` hacia atrás a la velocidad
//   del paso), deja de poder ser objetivo (+0x1271) y desaparece al acabar (SwitchedUnitDisappearingEvent).
// - El que entra (FUN_005e69bc) toma la posición del que sale (en el suelo), su objetivo (+0x34), su lado
//   (FUN_0083c354) y sus buffs (0x45c), y busca una skill de entrada:
//     0x5f4 (FUN_00827570): el objetivo vale si está incapacitado (0x154 del objetivo) o si su hueco en x
//       (|dx| − ancho/2, ≥ 0; FUN_00827450) es ≤ character.f49 (700 en todos);
//     0x5f8 (FUN_00827728): con el objetivo incapacitado, la SS3 (character.f61) si se puede usar
//       (0x41c = FUN_0085378c: hay skill, coste ≤ MP y sin el estado 0xb); si no, la SS1 (character.f45);
//     sin MP para ella: aviso (FUN_005fa95c(0x13)) y entra sin skill.
// - Llegada: punto = objetivo ∓ (active_skill.f18 + ancho/2) por el lado del que mira (o la posición del que
//   sale, sin skill); sale de punto + (∓300, 0, ±100) (por detrás; 0 en z con active_skill.f29; en la mitad
//   cercana del campo, 100 más cerca, y en la del fondo, 100 más al fondo: FUN_00df1200(+0x168)) con velocidad √(2·1980·d) hacia el punto en cada eje (el rozamiento
//   de 1980/s², movimiento.js, lo deja parado justo en él); evento FUN_006a8e60 con la ranura → motion 0x18.
// - 0x154 (FUN_00858ea0) = incapacitado: motions 0x1f/0x25, estados 0 (aturdido), 5 (parálisis) o 6, y marcas
//   +0xebc/+0xec1/+0xec2/+0x1270. El manual: «al parar y cambiar sale la SS3; sin MP, la SS1».

import { FRENADO } from './movimiento.js';

export const ESPERA_CAMBIO = 0.2; // widget+0x248 = 0x3e4ccccd (FUN_008fcac0)
export const DESVIO = { x: 300, z: 100 }; // FUN_00df57e8(&v, 300, 0, 100) en FUN_005e69bc
export const DISTANCIA_ENTRADA = 700; // character.f49 (todos)

/**
 * ¿Se puede cambiar al miembro `entra`? (FUN_008f9850 + FUN_008fa5d0)
 * @param {object} o  { activo, espera, enMarcha }
 */
export function puedeCambiar(entra, { activo, espera = 0, enMarcha = true } = {}) {
  return Boolean(entra) && entra !== activo && entra.enReserva && !entra.saliendo && entra.hp > 0 && espera <= 0 && enMarcha;
}

/**
 * Skill de entrada (0x5f4 + 0x5f8 + 0x41c). Devuelve { skill, sinMp } con `skill` el nombre de la animación o
 * null; `sinMp` = la había pero no hay MP (aviso 0x13).
 * @param {object} entra  { x, entrada: { ss1, ss3, distancia } }
 * @param {object|null} objetivo  el del que sale
 * @param {object} f  { incapacitado(u), ancho(u), coste(skill), mp, bloqueada }
 */
export function skillDeEntrada(entra, objetivo, f) {
  const e = entra.entrada ?? {};
  if (!objetivo || !(objetivo.hp > 0)) return { skill: null, sinMp: false };
  const incap = Boolean(f.incapacitado(objetivo));
  if (!incap) {
    const hueco = Math.max(0, Math.abs(objetivo.x - entra.x) - f.ancho(objetivo) / 2);
    if (hueco > (e.distancia || DISTANCIA_ENTRADA)) return { skill: null, sinMp: false };
  }
  const usable = (s) => Boolean(s) && !f.bloqueada && f.coste(s) <= f.mp;
  const skill = incap && usable(e.ss3) ? e.ss3 : e.ss1;
  if (!skill) return { skill: null, sinMp: false };
  if (usable(skill)) return { skill, sinMp: false };
  return { skill: null, sinMp: f.coste(skill) > f.mp };
}

// Velocidad de un eje para recorrer `d` frenando a `a` hasta parar justo al final (√(2·a·n·d), n = d/|d|).
export function velocidadLlegada(dx, dz, a = FRENADO) {
  const l = Math.hypot(dx, dz);
  if (!l) return [0, 0];
  const vx = Math.sqrt(2 * a * Math.abs((dx / l) * dx));
  const vz = Math.sqrt(2 * a * Math.abs((dz / l) * dz));
  return [dx > 0 ? -vx : vx, dz > 0 ? -vz : vz]; // hacia el punto (si d > 0, la salida está más allá)
}

/**
 * Llegada del que entra (FUN_005e69bc). `dir` = hacia donde mira el que sale (1 derecha).
 * @param {object} o  { sale: {x, z}, objetivo, skill: {distancia, sinDesvioZ} | null, dir, ancho(u), profundidad }
 * @returns {{ llegada: {x, z}, salida: {x, z}, vx: number, vz: number }}
 */
export function llegada({ sale, objetivo = null, skill = null, dir = 1, ancho = () => 0, profundidad = null }) {
  let lx = sale.x, lz = sale.z ?? 0;
  if (skill && objetivo) {
    lx = objetivo.x - dir * ((skill.distancia ?? 0) + ancho(objetivo) * 0.5);
    lz = objetivo.z ?? 0;
  }
  // z del juego = −profundidad: +100 en z (mitad cercana) es 100 más cerca; «z < mitad» (mitad del fondo) lo
  // invierte: sale 100 más al fondo. PROVISIONAL: que +0x168 sea el campo y FUN_00df1200 su mitad; sin campo
  // (modo de prueba), la mitad cercana.
  let dz = skill?.sinDesvioZ ? 0 : DESVIO.z;
  if (profundidad == null || lz < profundidad / 2) dz = -dz;
  let sx = lx - dir * DESVIO.x, sz = lz + dz;
  if (profundidad != null) sz = Math.max(0, Math.min(profundidad, sz)); // PROVISIONAL: dentro del campo
  const [vx, vz] = velocidadLlegada(sx - lx, sz - lz);
  return { llegada: { x: lx, z: lz }, salida: { x: sx, z: sz }, vx, vz };
}
