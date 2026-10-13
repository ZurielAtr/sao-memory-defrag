// Arma del inventario de la cuenta (D76). La asignación por UID es del backend
// simulado; categoría/subtipo vienen de equipment y character_job.f12.
import { growthCurve } from './combate.js';
export function armaCompatible(personaje, arma) {
  return arma?.tipo === 1 && personaje?.subtipoArma > 0 && arma.subtipo === personaje.subtipoArma;
}

/** Resuelve una asignación real; referencias ausentes, ajenas o incompatibles no equipan nada. */
export function armaDeCuenta(cuenta, personaje, master) {
  const uid = personaje?.weapon_uid;
  if (!Number.isSafeInteger(uid) || uid <= 0 || !cuenta || !master) return null;
  if (!cuenta.characters.some((c) => c.uid === personaje.uid && c.character_id === personaje.character_id && c.weapon_uid === uid)) return null;
  const instancia = cuenta.equipment?.find((e) => e.uid === uid);
  const ficha = instancia && master.equipo(instancia.equipment_id);
  if (!armaCompatible(master.personaje(personaje.character_id), ficha)) return null;
  if (cuenta.characters.filter((c) => c.weapon_uid === uid).length !== 1) return null;
  return { ...ficha, uid, equipment_id: instancia.equipment_id, nivel: instancia.level ?? 1 };
}

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

// Selección PROVISIONAL: el nativo recibe passive_skill_ids preparados por el
// servidor. f20 conserva candidatos; desbloqueo por nivel todavía sin confirmar.
export const pasivasConArma = (personaje, arma) => [...(personaje?.pasivas ?? []), ...(arma?.pasivas ?? [])];
