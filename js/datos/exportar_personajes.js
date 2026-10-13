// Personajes jugables (D46): port de herramientas/exportar_personajes.py (D68, mismo resultado). Salidas:
//   personajes/<id>.json, personajes/index.json y skills_<unidad>.json. Qué es cada campo: en el .py.

import { get, o, verdad, str, ordenar, pyRound, aJSONIndentado } from './py.js';
import { eventos, normalHits, porId } from './comun.js';

export const SUPPORTED = [2, 6];
const STATS = ['hp', 'mp', 'atk', 'def', 'crit'];
const STAT_FIELDS = ['f28', 'f29', 'f30', 'f31', 'f32'];
const REACH_MELEE = 240; // PROVISIONAL (ver el .py)

const utf8 = new TextDecoder('utf-8');

/** [versión, Map(paquete → [animaciones])] leyendo solo la cabecera del .ssbp (v2 y v6). */
export function ssbpPacks(d) {
  if (!d || d.length < 4 || d[0] !== 0x53 || d[1] !== 0x53 || d[2] !== 0x50 || d[3] !== 0x42) return [null, new Map()];
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const version = dv.getUint32(4, true);
  if (!SUPPORTED.includes(version)) return [version, new Map()];
  const cstr = (p) => {
    if (!p) return '';
    let fin = p;
    while (d[fin] !== 0) {
      if (fin >= d.length) throw new Error('cadena sin terminar en el .ssbp');
      fin++;
    }
    return utf8.decode(d.subarray(p, fin));
  };
  const packsPtr = dv.getUint32(0x14, true);
  const numPacks = dv.getInt16(0x1e, true);
  const packs = new Map();
  for (let p = 0; p < numPacks; p++) {
    const base = packsPtr + p * 16;
    const animsPtr = dv.getUint32(base + 8, true);
    const numAnims = dv.getInt16(base + 14, true);
    const anims = [];
    for (let a = 0; a < numAnims; a++) anims.push(cstr(dv.getUint32(animsPtr + a * 28, true)));
    packs.set(cstr(dv.getUint32(base, true)), anims);
  }
  return [version, packs];
}

/** Id del retrato del cut-in (images/character/character_<id>.png, o la capa _1 si ese está vacío), o null. */
async function portraitId(fuente, cid) {
  const t = await fuente.tamano(`images/character/character_${cid}.png`);
  if (t !== null && t >= 2000) return cid;
  if (await fuente.existe(`images/character/character_${cid}_1.png`)) return `${cid}_1`;
  return null;
}

/** Golpes de la skill (del 01 al primer final) y datos del Switch. */
export function skillData(mid, records, attacks) {
  const base = records[0];
  const hits = [];
  for (let n = 1; n < 100; n++) {
    const a = attacks.get(Number(`3${mid}${String(n).padStart(2, '0')}`));
    if (a === undefined || get(a, 'f2') !== 1) break;
    const final = get(a, 'f10') === 1001;
    hits.push({ rate: o(get(a, 'f3'), 10000) / 10000, knock: o(get(a, 'f21'), 0), angle: o(get(a, 'f23'), 0), final });
    if (final) break;
  }
  return {
    id: base.f0, name: o(get(base, 'f2'), get(base, 'f1')), fullName: get(base, 'f1'),
    description: get(base, 'f4'), element: get(base, 'f5'), cost: get(base, 'f6'), hits,
    distancia: o(get(base, 'f18'), 0), sinDesvioZ: verdad(get(base, 'f29')),
  };
}

/**
 * Exporta los personajes. Devuelve { unidadDe: Map(id → unidad) de los que tienen ficha, usadas: Set de unidades
 * de los jugables, index }.
 */
export async function exportarPersonajes(fuente, salida) {
  const chars = await fuente.md('character');
  const units = porId(await fuente.md('unit'));
  const jobs = porId(await fuente.md('character_job'));
  const maxLv = new Map((await fuente.md('character_max_level_rarity')).map((r) => [r.f1, r.f2]));
  const attacks = porId(await fuente.md('attack'));
  const byAnim = new Map();
  for (const r of ordenar(await fuente.md('active_skill'), (r) => r.f0)) {
    const k = get(r, 'f24');
    if (!byAnim.has(k)) byAnim.set(k, []);
    byAnim.get(k).push(r);
  }
  const skillsById = new Map();
  for (const recs of byAnim.values()) for (const r of recs) skillsById.set(r.f0, r);

  const unitCache = new Map(); // unidad → [versión, skills, packs]
  const index = [];
  const unidadDe = new Map();
  const usadas = new Set();
  for (const r of chars) {
    const cid = r.f0;
    const job = jobs.get(get(r, 'f3')) ?? {};
    const entry = { id: cid, nombre: get(r, 'f2'), rareza: get(r, 'f1'), arma: get(r, 'f3'), armaNombre: get(job, 'f1'), elemento: get(r, 'f9') };
    index.push(entry);
    const unit = units.get(get(r, 'f4'));
    if (!verdad(unit)) {
      entry.estado = `sin unidad (character.f4 = ${str(get(r, 'f4'))})`;
      continue;
    }
    const pkg = unit.f3;
    entry.unidad = pkg;
    const folder = `ss/unit/${pkg}`;
    let ssbp = `${folder}/${pkg}.ssbp`;
    if (!(await fuente.existe(ssbp))) {
      const l = await fuente.listar(folder);
      const found = l ? l.files.filter((f) => f.endsWith('.ssbp')) : [];
      if (!found.length) {
        entry.estado = `sin .ssbp en ss/unit/${pkg}`;
        continue;
      }
      ssbp = `${folder}/${found[0]}`;
    }
    if (!unitCache.has(pkg)) {
      const [version, packs] = ssbpPacks(await fuente.leer(ssbp));
      const canon = ordenar([...packs].filter(([p, anims]) => p.startsWith('skill_') && /^\d+$/.test(p.slice(6)) && anims.includes(p)).map(([p]) => p));
      const skills = {};
      for (const p of canon) {
        const mid = Number(p.slice(6));
        if (byAnim.has(mid)) skills[p] = skillData(mid, byAnim.get(mid), attacks);
      }
      unitCache.set(pkg, [version, skills, packs]);
      if (SUPPORTED.includes(version)) await salida.escribir(`skills_${pkg}.json`, aJSONIndentado(skills));
    }
    const [version, skills, packs] = unitCache.get(pkg);
    entry.ssbp = version;
    if (!SUPPORTED.includes(version)) {
      entry.estado = `ssbp v${str(version)} no soportada (el lector solo entiende v2 y v6)`;
      continue;
    }
    const costume = `${str(get(r, 'f17'))}.png`;
    if (!(await fuente.existe(`${folder}/${costume}`))) {
      entry.estado = `sin traje ${costume}`;
      continue;
    }

    const equipped = [], sinPaquete = [], sinGolpes = [], ranuras = [];
    for (const sid of o(get(r, 'f35'), [])) {
      const s = skillsById.get(sid);
      if (!verdad(sid) || !verdad(s)) {
        ranuras.push(null);
        continue;
      }
      const name = `skill_${str(s.f24)}`;
      if (!packs.has(name) || !packs.get(name).includes(name)) {
        sinPaquete.push(name);
        ranuras.push(null);
      } else {
        equipped.push(name);
        ranuras.push(name);
        if (!verdad(get(skills[name] ?? {}, 'hits'))) sinGolpes.push(name);
      }
    }
    const portrait = await portraitId(fuente, cid);
    const reach = pyRound((REACH_MELEE * get(job, 'f5', 700)) / 700);
    const f34 = o(get(r, 'f34'), []);
    const data = {
      id: cid,
      nombre: get(r, 'f2'),
      rareza: get(r, 'f1'),
      arma: get(r, 'f3'),
      armaNombre: get(job, 'f1'),
      elemento: get(r, 'f9'),
      nivelMax: maxLv.get(get(r, 'f1')) ?? null,
      crecimiento: get(r, 'f8', 1),
      stats: Object.fromEntries(STATS.map((k, i) => [k, STAT_FIELDS[i]]).filter(([, f]) => f in r).map(([k, f]) => [k, r[f]])),
      precision: get(r, 'f59', 10000), evasion: get(r, 'f60', 0),
      normales: normalHits(r, attacks),
      unidad: pkg,
      unidadId: unit.f0,
      grupoVoz: get(r, 'f27'), // FUN_00829598 -> SoundManager grupo + tipo
      ssbp: version,
      traje: costume,
      retrato: portrait,
      skillsEquipadas: equipped,
      activas: [...o(get(r, 'f35'), [])],
      arbol: get(r, 'f16', 0),
      alcanceArma: get(job, 'f5'),
      alcanceNormal: reach, // PROVISIONAL
      eventos: eventos(get(r, 'f18'), attacks),
      guardia: [get(r, 'f50', 0), get(r, 'f51', 0)],
      medidor: [...f34, ...Array(18).fill(0)][17],
      radio: get(r, 'f14', 0),
      fisica: { escala: get(r, 'f37', 10000) / 10000,
        tamano: [get(unit, 'f6', 0), get(unit, 'f7', 0)] }, // 008290d8/008526a0.
      pasivas: [...o(get(r, 'f36'), [])], // D79: no comprimir huecos; ranuras reemplazan por índice.
      estadosMax: [...f34],
      velocidad: get(r, 'f11', 100) / 100,
      paso: get(r, 'f13', 0),
      salto: get(job, 'f6', 0),
      mpPorGolpe: o(get(r, 'f46', 0), 0),
      skillsRanura: ranuras,
      ss1: o(get(r, 'f45', 0), 0),
      ss3: o(get(r, 'f61', 0), 0),
      distanciaEntrada: o(get(r, 'f49', 0), 0),
    };
    await salida.escribir(`personajes/${cid}.json`, aJSONIndentado(data));
    unidadDe.set(cid, pkg);
    entry.estado = 'ok';
    usadas.add(pkg);
    if (sinPaquete.length) entry.skillsSinPaquete = sinPaquete;
    if (sinGolpes.length) entry.skillsSinGolpes = sinGolpes;
    if (!portrait) entry.sinRetrato = true;
  }
  await salida.escribir('personajes/index.json', aJSONIndentado(index));
  return { unidadDe, usadas, index };
}
