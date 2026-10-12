// MP del personaje como el juego (D64). Descompilaciones: extraido/mp.c. NOTAS.md "MP".
//
// - Máximo: stat MP (character.f29) con las pasivas de tipo 2 al empezar (FUN_005f9f5c → virtual 0x364, que
//   además llena el MP salvo con la marca de la misión de evento event.f20, FUN_0084f128: sin portar).
// - Coste de una skill (virtual 0x414 = FUN_00829964): active_skill.f6 + (pasivas 0x3f − f6). Los factores de
//   define 5 / 4005 / 4006 valen 10000 (×1) y la tabla charge_skill solo cuenta con carga (sin portar).
// - Al empezar la skill (motion 10, FUN_0084f384) se resta el coste (virtual 0x35c, entre 0 y el máximo).
// - Cada golpe de un ataque normal (attack.f1 = 1) de un personaje que acierta a un enemigo da
//   max(1, máximo × FUN_00827a54) (FUN_0070bd6c), con FUN_00827a54 = ⌊⌊pas(0x49, ⌊f46⌋)⌋ · gestor+0x2a4⌋ / 10000
//   (character.f46 = +0x13e4 · 10000; gestor+0x2a4 = 1.0, FUN_005f70a0). Las skills (f1 = 2) no dan MP.
// Los enemigos no gastan MP (0x414 = 0).

import { TIPO } from './pasivas.js';

const consultar = (pasivas, u, tipo, base) => (pasivas ? pasivas.consultar(u, tipo, base) : base);

// Máximo con las pasivas y MP lleno (FUN_005f9f5c + FUN_0084f128).
export function iniciarMp(u, base, pasivas = null) {
  u.maxMp = Math.trunc(consultar(pasivas, u, TIPO.MP, base));
  u.mp = u.maxMp;
}

// Virtual 0x35c → 0x358 (FUN_0084f0ec): entre 0 y el máximo.
export function ponerMp(u, v) {
  u.mp = Math.max(0, Math.min(u.maxMp ?? 0, Math.trunc(v)));
}

// FUN_00829964: coste de la skill de coste base `f6` (active_skill.f6).
export function costeSkill(u, f6, pasivas = null) {
  const base = f6 ?? 0;
  return Math.trunc(base + (consultar(pasivas, u, TIPO.COSTE_MP, base) - base));
}

export const puedePagar = (u, coste) => (u.mp ?? 0) >= coste;

// FUN_0084f384 (motion 10): MP − coste.
export function pagarSkill(u, coste) {
  ponerMp(u, (u.mp ?? 0) - coste);
}

// FUN_0070bd6c: MP que da un golpe normal que acierta. `golpe.clase` = attack.f1 (1 normal, 2 skill).
export function mpDelGolpe(u, golpe, pasivas = null) {
  if (!golpe || golpe.clase === 2 || golpe.clase == null) return 0;
  const f = Math.trunc(Math.trunc(consultar(pasivas, u, TIPO.MP_POR_GOLPE, Math.trunc(u.mpPorGolpe ?? 0))) * 1.0) / 10000;
  return Math.max(1, (u.maxMp ?? 0) * f);
}

export function ganarMpPorGolpe(u, golpe, pasivas = null) {
  const g = mpDelGolpe(u, golpe, pasivas);
  if (!g) return 0;
  const antes = u.mp ?? 0;
  ponerMp(u, antes + g);
  return u.mp - antes;
}
