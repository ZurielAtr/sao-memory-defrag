// Equipo del inventario: asignación por UID del backend local; categorías y
// compatibilidad del filtro nativo00b6d120→007724ec→0089d72c (D78).
import { growthCurve } from './combate.js';
export const RANURAS_EQUIPO = Object.freeze({ weapon: 'weapon_uid', armor: 'armor_uid', accessory: 'accessory_uid' });
const categorias = { weapon: 1, armor: 2, accessory: 3 };
export function armaCompatible(personaje, arma) {
  return !!personaje && arma?.tipo === 1 && subtipoCompatible(personaje, arma.subtipo);
}

function subtipoCompatible(personaje, subtipo) {
  if (subtipo === 21) return true;
  if (subtipo === 22) return personaje.genero === 1;
  if (subtipo === 23) return personaje.genero === 2;
  const job = personaje.arma;
  if (Number.isInteger(job) && job >= 1 && job <= 9) return subtipo === job + 10;
  if (job === 10) return subtipo === 11;
  return job === 11 && (subtipo === 40 || subtipo === 41);
}

export function equipoCompatible(personaje, equipo, ranura) {
  if (!personaje || !Object.hasOwn(RANURAS_EQUIPO, ranura) || equipo?.tipo !== categorias[ranura]) return false;
  if (ranura === 'weapon') return armaCompatible(personaje, equipo);
  // 007724ec añade categoría3 directamente; no aplica filtro de subtipo.
  if (ranura === 'accessory') return true;
  return subtipoCompatible(personaje, equipo.subtipo);
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
// D78: ctor00604728 inicializa estados0; JSON00693ebc/00693898 modifica
// la primera ranura del ID. Repetir el ID sobrescribe su estado, no otra ranura.
export function pasivasDelPersonaje(personaje, instancia) {
  const ids = (personaje?.pasivas ?? []).slice(0, 3), estados = ids.map(() => 0);
  for (const r of Array.isArray(instancia?.passive_skill) ? instancia.passive_skill : []) {
    if (!Number.isSafeInteger(r?.master_passive_skill_id) || r.master_passive_skill_id <= 0
      || !Number.isInteger(r.status) || r.status < -2147483648 || r.status > 2147483647) continue;
    const i = ids.indexOf(r.master_passive_skill_id);
    if (i >= 0) estados[i] = r.status;
  }
  return ids.filter((id, i) => id > 0 && estados[i] !== 0);
}

export const pasivasConArma = (personaje, arma, instancia) => pasivasConEquipo(personaje, arma ? [arma] : [], instancia);
export const pasivasConEquipo = (personaje, equipos = [], instancia) => [...pasivasDelPersonaje(personaje, instancia),
  ...equipos.flatMap((e) => e.pasivas ?? [])];
