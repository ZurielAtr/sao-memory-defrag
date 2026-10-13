// Arma del inventario de la cuenta (D76). La asignación por UID es del backend
// simulado; categoría/subtipo vienen de equipment y character_job.f12.
import { growthCurve } from './combate.js';
export const RANURAS_EQUIPO = Object.freeze({ weapon: 'weapon_uid', armor: 'armor_uid', accessory: 'accessory_uid' });
const categorias = { weapon: 1, armor: 2, accessory: 3 };
export function armaCompatible(personaje, arma) {
  return arma?.tipo === 1 && personaje?.subtipoArma > 0 && arma.subtipo === personaje.subtipoArma;
}

export function equipoCompatible(personaje, equipo, ranura) {
  if (!personaje || !Object.hasOwn(RANURAS_EQUIPO, ranura) || equipo?.tipo !== categorias[ranura]) return false;
  if (ranura === 'weapon') return armaCompatible(personaje, equipo);
  if (ranura === 'accessory') return equipo.subtipo === 31;
  // Regla conservadora derivada del catálogo:21 común,22/23 según género.
  // La comparación completa del cliente nativo todavía no está localizada.
  return equipo.subtipo === 21 || ([1, 2].includes(personaje.genero) && equipo.subtipo === 21 + personaje.genero);
}

/** Resuelve una asignación real; referencias ausentes, ajenas o incompatibles no equipan nada. */
export function armaDeCuenta(cuenta, personaje, master) {
  return equipoDeCuenta(cuenta, personaje, master, 'weapon');
}

export function equipoDeCuenta(cuenta, personaje, master, ranura) {
  if (!Object.hasOwn(RANURAS_EQUIPO, ranura)) return null;
  const campo = RANURAS_EQUIPO[ranura], uid = personaje?.[campo];
  if (!Number.isSafeInteger(uid) || uid <= 0 || !cuenta || !master) return null;
  if (!cuenta.characters.some((c) => c.uid === personaje.uid && c.character_id === personaje.character_id && c[campo] === uid)) return null;
  const instancia = cuenta.equipment?.find((e) => e.uid === uid);
  const ficha = instancia && master.equipo(instancia.equipment_id);
  if (!equipoCompatible(master.personaje(personaje.character_id), ficha, ranura)) return null;
  const referencias = cuenta.characters.flatMap((c) => Object.values(RANURAS_EQUIPO).map((f) => c[f]));
  if (referencias.filter((ref) => ref === uid).length !== 1) return null;
  return { ...ficha, uid, equipment_id: instancia.equipment_id, nivel: instancia.level ?? 1 };
}

export const equiposDeCuenta = (cuenta, personaje, master) => Object.keys(RANURAS_EQUIPO)
  .map((r) => equipoDeCuenta(cuenta, personaje, master, r)).filter(Boolean);

export function statsArma(arma, nivel = arma?.nivel ?? 1) {
  if (!arma?.stats) return {};
  const max = Math.max(1, arma.nivelMax ?? 1);
  const lv = Math.max(1, Math.min(Number.isSafeInteger(nivel) ? nivel : 1, max));
  return Object.fromEntries(Object.entries(arma.stats).map(([k, [a, b]]) =>
    [k, max === 1 ? a : growthCurve(a, b, 1, max, lv, arma.crecimiento ?? 1)]));
}

/** 00692ec4/0067b9c0: sumar por pieza; afinidad ×1.2f solo para stats >=1. */
export function sumarStatsArma(base, arma) {
  const out = { ...base };
  const afin = arma && base.elemento === arma.elemento;
  for (const [k, n] of Object.entries(statsArma(arma))) {
    const valor = afin && n >= 1 ? Math.trunc(Math.fround(Math.fround(n) * Math.fround(1.2))) : n;
    out[k] = (out[k] ?? 0) + valor;
  }
  return out;
}

export const statsEquipo = statsArma;
export const sumarStatsEquipo = (base, equipos = []) => equipos.reduce(sumarStatsArma, { ...base });

// D77,006954b4→00827ee4→0070507c: f20 de cada pieza, sin filtro por nivel.
// La selección propia del personaje (0069539c) sigue provisional en el port.
export const pasivasConArma = (personaje, arma) => pasivasConEquipo(personaje, arma ? [arma] : []);
export const pasivasConEquipo = (personaje, equipos = []) => [...(personaje?.pasivas ?? []),
  ...equipos.flatMap((e) => e.pasivas ?? [])];
