// Estadísticas y daño con datos reales (web/data/combate.json, generado por
// herramientas/exportar_combate.py). Ver NOTAS.md, secciones "Modo offline, driver y estadísticas"
// y "Fórmula de daño (binario)".
//
// - Personajes: character.f28–f32 son structs (nivel 1, nivel máximo, tope tras ruptura de límite);
//   el valor a cada nivel sale de growthCurve, copia de FUN_0089d65c (llamada desde FUN_0067bbb0).
// - Enemigos: tabla por nivel de enemy.f16; se interpola linealmente igual que el juego
//   (FUN_0082d184): truncado a entero y nunca negativo.
// - Daño: copia de FUN_0083ad60 (D42), con pasivas (D60, pasivas.js). Faltan los modificadores que
//   dependen de buffs y del tipo de ataque (attack.f7) contra enemigos concretos.

const STATS = ['hp', 'mp', 'atk', 'def', 'crit'];

// Valores por defecto de base_status_list (constructor FUN_00836f44) que el juego no cambia para
// personajes ni enemigos normales: ventaja / desventaja de elemento (stats 9 y 10) y daño crítico
// (stat 11: 5000 -> 5000/10000 + 1 = ×1.5).
import { terminoBuff, STAT } from './buffs.js';

export const ELEM_ADVANTAGE = 1.5;
export const ELEM_DISADVANTAGE = 0.75;
export const CRIT_MULT = 5000 / 10000 + 1;
// Variación aleatoria del daño: entero entre round(total·0.95) y round(total·1.05).
const RNG_MIN = 0.95;
const RNG_MAX = 1.05;

// Elementos (orden de las cadenas en la lib: unattributed, fire, water, wind, light, dark, earth).
// Personaje: character.f9; enemigo: enemy.f5.
export const ELEMENTO = { SIN: 1, FUEGO: 2, AGUA: 3, VIENTO: 4, LUZ: 5, OSCURIDAD: 6, TIERRA: 7 };
// FUN_0083b33c: fuego > viento > tierra > agua > fuego; luz y oscuridad, ventaja mutua.
const VENTAJA = { 2: 4, 3: 2, 4: 7, 7: 3, 5: 6, 6: 5 };
const DESVENTAJA = { 2: 3, 3: 7, 4: 2, 7: 4 };

export function elementMultiplier(attackerElem, defenderElem) {
  if (VENTAJA[attackerElem] === defenderElem) return ELEM_ADVANTAGE;
  if (DESVENTAJA[attackerElem] === defenderElem) return ELEM_DISADVANTAGE;
  return 1;
}

export async function loadCombatData(url = 'data/combate.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// Exponente según el tipo de crecimiento (tabla en 0x012db3a8): 1 lineal, 2 rápido al inicio,
// 3 lento al inicio. Todos los personajes de la master data usan el tipo 1.
const GROWTH_EXP = { 1: 1.0, 2: 2.0, 3: 0.5 };

// FUN_0089d65c(a, b, desde, hasta, nivel, tipo): valor `a` en el nivel `desde` y `b` en `hasta`.
export function growthCurve(a, b, from, to, level, type) {
  let d = b - a;
  const n = to - from;
  const x = level - from;
  let off = 0;
  if (!(d < n || type === 1)) {
    d -= n;
    off = x;
  }
  const e = GROWTH_EXP[type] ?? 1.0;
  return Math.floor(off + a + d * Math.pow(x / n, 1 / e));
}

// Tope tras la ruptura de límite: deducido de los datos (nivel máximo + 20; los structs crecen al
// mismo ritmo hasta ahí), sin confirmar en el binario.
export const LIMIT_BREAK_LEVELS = 20;

export function characterStats(data, id, level = 1) {
  const c = data.personajes[id];
  if (!c) throw new Error(`personaje ${id} no exportado`);
  const max = c.nivelMax;
  const cap = max + LIMIT_BREAK_LEVELS;
  const lv = Math.max(1, Math.min(level, cap));
  const out = { nombre: c.nombre, elemento: c.elemento, nivel: lv };
  for (const k of STATS) {
    const [a, b, top] = c.stats[k];
    // Igual que FUN_0067bbb0: hasta el máximo usa el tipo del personaje; por encima, lineal.
    out[k] = lv <= max ? growthCurve(a, b, 1, max, lv, c.crecimiento) : growthCurve(b, top, max, cap, lv, 1);
  }
  return out;
}

export function enemyStats(data, id, level) {
  const e = data.enemigos[id];
  if (!e) throw new Error(`enemigo ${id} no exportado`);
  const rows = e.porNivel;
  let lo = rows[0];
  for (const r of rows) {
    if (r[0] > level) break;
    lo = r;
  }
  let hi = rows[rows.length - 1];
  for (const r of rows) {
    if (r[0] >= level) { hi = r; break; }
  }
  const f = hi[0] === lo[0] ? 0 : (level - lo[0]) / (hi[0] - lo[0]);
  const out = { nombre: e.nombre, elemento: e.elemento ?? 1, nivel: level };
  STATS.forEach((k, i) => {
    out[k] = Math.max(0, Math.trunc(lo[i + 1] + f * (hi[i + 1] - lo[i + 1])));
  });
  return out;
}

// Probabilidad de crítico: stat 2 = CRIT / 100 (FUN_00827cf4 personajes, FUN_0082ce90 enemigos) y el
// tiro es aleatorio·100 < stat 2 (FUN_0083ad60 / FUN_008af678), o sea CRIT / 10000.
export function critChance(crit) {
  return crit / 100 / 100;
}

/**
 * Daño de un golpe (FUN_0083ad60, D42).
 *   base  = max(ATK/2 − DEF/4, 0)
 *   total = base + base·(elemento − 1)          (los modificadores se suman sobre la base)
 *   total ·= attack.f3 / 10000                  (`rate`)
 *   daño  = entero al azar en [round(total·0.95), round(total·1.05)] / attack.f4 (`hits`)
 *   crítico: ·1.5; mínimo 1 si el golpe tiene multiplicador; el HP baja la parte entera.
 * Atacante/defensor: { atk, def, crit, elemento }.
 * Pasivas (D60, web/js/pasivas.js): `pasivas` con las unidades `atacante` y `defensor` (el golpe en curso ya
 * fijado con pasivas.contexto) y `skill` si el golpe es de una sword skill:
 *   ATK  += pas(atacante, 3, ATK) − ATK          (FUN_0083a7a8)
 *   DEF  += pas(defensor, 4, DEF) − DEF          (FUN_0083a8dc)
 *   total += pas(defensor, 0x3e, base) − base    (se pregunta al defensor: "más daño contra…" lleva f3 = 2)
 *   total += base·(m − 1), m = 1 + (pas(atacante, 0x4b, 10000) − 10000)/10000 con skill (FUN_0083b3e0)
 *   crítico: probabilidad pas(atacante, 5, CRIT); multiplicador pas(atacante, 0x4a, 5000)/10000 + 1.
 * Buffs (D61, web/js/buffs.js): cada stat suma terminoBuff (FUN_0083a870) de la unidad.
 */
export function computeDamage(attacker, defender, { rate = 1, hits = 1, rng = Math.random, pasivas = null, atacante = null, defensor = null, skill = false } = {}) {
  if (!(rate > 0)) return { dmg: 0, crit: false };
  const pas = (u, tipo, v) => (pasivas && u ? pasivas.consultar(u, tipo, v) : v);
  // D61: los buffs suman rand(0.95, 1.05)·(a + b − 2)·base a cada stat (FUN_0083a870; ATK también el 13).
  const buf = (u, v, stat) => terminoBuff(u, v, stat, rng);
  const atk = pas(atacante, 3, attacker.atk) + buf(atacante, attacker.atk, STAT.ATAQUE) + buf(atacante, attacker.atk, STAT.ATAQUE_EXTRA);
  const def = pas(defensor, 4, defender.def) + buf(defensor, defender.def, STAT.DEFENSA);
  const base = Math.max(atk * 0.5 - def * 0.25, 0);
  let total = base;
  const elem = elementMultiplier(attacker.elemento, defender.elemento);
  if (elem !== 1) total += base * (elem - 1);
  total += pas(defensor, 0x3e, base) - base;
  if (skill) total += base * ((pas(atacante, 0x4b, 10000) - 10000) / 10000);
  total *= rate;
  const lo = Math.round(total * RNG_MIN);
  const hi = Math.round(total * RNG_MAX);
  let dmg = lo + Math.floor(rng() * (hi - lo + 1));
  const crit = rng() < critChance(pas(atacante, 5, attacker.crit ?? 0) + buf(atacante, attacker.crit ?? 0, STAT.CRITICO));
  dmg /= hits;
  if (crit) dmg *= (pas(atacante, 0x4a, 5000) + buf(atacante, 5000, STAT.DANO_CRITICO)) / 10000 + 1;
  return { dmg: Math.trunc(Math.max(dmg, 1)), crit };
}
