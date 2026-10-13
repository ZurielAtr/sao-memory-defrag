// Exportadores pequeños, port de herramientas/exportar_{historias,interfaz,api,pasivas,estados,combate}.py (D68,
// mismo resultado). Qué es cada campo: en cada .py.

import { get, o, verdad, esEntero, igual, ordenar, aJSON, aJSONIndentado } from './py.js';
import { normalHits, porId, porNivel } from './comun.js';
import { Decoder } from './master_data.js';
import { catalogoEquipo } from './exportar_equipo.js';

const esDict = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// ---- exportar_historias.py (D67): historias/<id>.json, historias/misiones.json, historias/posiciones.json ----
const NOMBRES = { f2: 'linea', f5: 'nombre', f6: 'texto', f8: 'posicion', f10: 'fondo', f12: 'objeto', f14: 'still',
  f16: 'efectoAntes', f17: 'efectoDespues', f25: 'voz', f26: 'sonido', f27: 'sonido2', f28: 'musica', f29: 'volumenMusica',
  f30: 'musica2', f31: 'volumenMusica2' }; // f27/f30 posteriores; f31 conservado por compatibilidad, uso sin confirmar
const DESCARTAR = ['f0', 'f1', 'f3', 'f11', 'f33'];
const POR_DEFECTO = { f7: 1, f9: 1, f15: 1, f19: 0, f29: 10000, f31: 10000 };
const CAPAS = [['f2', 'cuerpo', 'body'], ['f3', 'cara', 'face'], ['f4', 'accesorio', 'option'], ['f5', 'pelo', 'hair']];

async function capas(fuente, r) {
  const carpeta = r.f1;
  const out = { carpeta };
  for (const [campo, sub, dir] of CAPAS) {
    const nombre = get(r, campo);
    if (verdad(nombre) && (await fuente.existe(`images/story/character/${carpeta}/${dir}/${nombre}.png`))) out[sub] = nombre;
  }
  if (verdad(get(r, 'f6'))) out.dx = r.f6;
  if (verdad(get(r, 'f7'))) out.dy = r.f7;
  return out;
}

export async function exportarHistorias(fuente, salida) {
  const imagenes = porId(await fuente.md('adventure_story_character_image'));
  const historias = new Map();
  for (const s of await fuente.md('adventure_story_content')) {
    for (const p of s.f1) {
      for (const e of Array.isArray(get(p, 'f1')) ? p.f1 : [p]) {
        const hid = get(e, 'f0');
        if (!esEntero(hid)) continue; // ids de más de 1e9 mal convertidos a float (historias de eventos)
        if (!historias.has(hid)) historias.set(hid, []);
        historias.get(hid).push(e);
      }
    }
  }
  fuente.olvidar('adventure_story_content');
  for (const [hid, entradas] of historias) {
    const lineas = [];
    for (const e of ordenar(entradas, (x) => get(x, 'f2', 0))) {
      const ob = {};
      for (const [k, v] of Object.entries(e)) {
        if (DESCARTAR.includes(k) || (k in POR_DEFECTO && POR_DEFECTO[k] === v)) continue;
        ob[NOMBRES[k] ?? k] = v;
      }
      const pj = get(e, 'f3');
      if (esEntero(pj) && pj > 100) {
        if (imagenes.has(pj)) ob.personaje = await capas(fuente, imagenes.get(pj));
      } else if (pj !== null) ob.f3 = pj;
      if (lineas.length && lineas[lineas.length - 1].linea === get(ob, 'linea')) lineas[lineas.length - 1].entradas.push(ob);
      else lineas.push({ linea: get(ob, 'linea'), entradas: [ob] });
    }
    for (const ln of lineas) for (const ob of ln.entradas) delete ob.linea;
    await salida.escribir(`historias/${hid}.json`, aJSON({ id: hid, lineas }));
  }

  const misiones = {};
  for (const r of await fuente.md('adventure_quest_story')) {
    for (const e of r.f1) {
      const k = String(e.f2);
      (misiones[k] ??= []).push({
        id: e.f0, momento: get(e, 'f3'), escenario: get(e, 'f4'), zona: get(e, 'f1'), resumen: get(e, 'f6'),
        f5: get(e, 'f5'), f7: get(e, 'f7'), existe: historias.has(e.f0),
      });
    }
  }
  await salida.escribir('historias/misiones.json', aJSON(misiones));

  const posiciones = {};
  for (const r of await fuente.md('adventure_story_character_position')) {
    const cap = {};
    for (const i of [5, 8, 11, 14]) {
      if (get(r, `f${i}`) !== null && get(r, `f${i + 1}`) !== null) cap[String(r[`f${i}`])] = [get(r, `f${i + 1}`), get(r, `f${i + 2}`)];
    }
    posiciones[r.f0] = { ancho: get(r, 'f1'), alto: get(r, 'f2'), capas: cap };
  }
  await salida.escribir('historias/posiciones.json', aJSON(posiciones));
}

// ---- exportar_interfaz.py (D54): ui_textos.json e interfaz.json ----
const MUNDOS_HISTORIA = [1001, 1002, 1003]; // SAO, ALO, GGO

export async function exportarInterfaz(fuente, salida) {
  const archivos = new Map(), tablas = new Map();
  for (const f of ['ui_file', 'preload_ui_file']) for (const r of await fuente.md(f)) if (verdad(get(r, 'f0'))) archivos.set(r.f0, r.f1);
  for (const f of ['ui_text', 'preload_ui_text']) for (const r of await fuente.md(f)) tablas.set(r.f0, o(get(r, 'f1'), []));
  const ui = {};
  for (const [i, filas] of tablas) {
    const ruta = archivos.get(i);
    if (!verdad(ruta)) continue;
    const t = {};
    for (const x of filas) if (verdad(get(x, 'f1'))) t[x.f1] = [get(x, 'f2', ''), get(x, 'f3')];
    ui[ruta] = t;
  }
  await salida.escribir('ui_textos.json', aJSON(ui));

  const quests = (await fuente.md('quest')).f0.filter((q) => MUNDOS_HISTORIA.includes(get(q, 'f0')));
  const mundoDe = new Map(quests.map((q) => [q.f4, q.f0]));
  const capitulos = {};
  for (const c of await fuente.md('chapter')) {
    if (mundoDe.has(c.f0)) capitulos[c.f0] = { numero: get(c, 'f1'), etiqueta: get(c, 'f2'), titulo: get(c, 'f3'), mundo: mundoDe.get(c.f0) };
  }
  const datos = {
    mundos: (await fuente.md('world')).filter((w) => MUNDOS_HISTORIA.includes(get(w, 'f0'))).map((w) => ({ id: w.f0, nombre: get(w, 'f1'), corto: get(w, 'f3') })),
    capitulos,
    misiones: Object.fromEntries(quests.map((q) => [q.f3, { mundo: q.f0, capitulo: q.f4, numero: get(q, 'f2'), tipo: get(q, 'f8'),
      miniatura: get(q, 'f9'), condicion: get(q, 'f10'), descripcion: o(get(q, 'f19'), '') }])),
    skills: Object.fromEntries((await fuente.md('active_skill')).filter((s) => verdad(get(s, 'f8'))).map((s) => [s.f0, s.f8])),
  };
  await salida.escribir('interfaz.json', aJSON(datos));
}

// ---- exportar_api.py (F3, D41): api_master.json ----
export async function exportarApi(fuente, salida) {
  const characters = {};
  const jobs = porId(await fuente.md('character_job'));
  for (const r of await fuente.md('character')) characters[r.f0] = { nombre: get(r, 'f2'), rareza: get(r, 'f1'), arma: get(r, 'f3'),
    subtipoArma: get(jobs.get(get(r, 'f3')) ?? {}, 'f12', 0), elemento: get(r, 'f9'), genero: get(r, 'f10', 0) };
  const levels = ordenar(await fuente.md('character_level'), (r) => r.f0);
  const expLevel = levels.map((r) => get(r, 'f2', 0));
  const maxLevel = {};
  for (const r of await fuente.md('character_max_level_rarity')) maxLevel[r.f1] = r.f2;
  const items = {};
  for (const r of await fuente.md('item')) items[r.f0] = { nombre: get(r, 'f4'), tipo: get(r, 'f2') };
  const equipment = await catalogoEquipo(fuente);

  const quests = new Map();
  for (const r of (await fuente.md('quest')).f0) {
    quests.set(r.f3, { capitulo: get(r, 'f4'), nombre: get(r, 'f6'), etiqueta: get(r, 'f7'), dificultades: new Map(), drops: new Map() });
  }
  for (const r of await fuente.md('quest_level')) {
    const q = quests.get(r.f0);
    if (q === undefined) continue;
    for (const lv of r.f1) {
      q.dificultades.set(lv.f1, { nivelRecomendado: get(lv, 'f6'), expJugador: get(lv, 'f9', 0), expPersonaje: get(lv, 'f10', 0), col: get(lv, 'f11', 0) });
    }
  }
  for (const a of await fuente.md('quest_appearance')) {
    const dif = quests.get(a.f1)?.dificultades.get(a.f2);
    if (dif !== undefined) dif.requiere = get(a, 'f3') === 1 && verdad(get(a, 'f4')) ? [a.f4, get(a, 'f5', 1)] : null;
  }
  const dropsAll = porId(await fuente.md('drop'));
  const usedDrops = new Set();
  for (const mission of (await fuente.md('stage')).f1) {
    const q = quests.get(mission.f0);
    if (q === undefined) continue;
    for (const scene of o(get(mission, 'f1'), [])) {
      for (const enemy of o(get(scene, 'f9'), [])) {
        const d = get(enemy, 'f9');
        if (dropsAll.has(d)) {
          const k = get(enemy, 'f1', 1);
          if (!q.drops.has(k)) q.drops.set(k, []);
          q.drops.get(k).push(d);
          usedDrops.add(d);
        }
      }
    }
  }
  const misiones = {};
  for (const [k, v] of quests) {
    if (!v.dificultades.size) continue;
    misiones[k] = { ...v, dificultades: Object.fromEntries(v.dificultades), drops: Object.fromEntries(v.drops) };
  }
  const drops = {};
  const usedRewards = new Set();
  for (const d of ordenar([...usedDrops])) {
    const groups = [];
    for (const g of dropsAll.get(d).f1) {
      const entries = g.f1.map((e) => ({ recompensa: e.f2, prob: get(e, 'f3', 0) }));
      for (const e of entries) usedRewards.add(e.recompensa);
      groups.push(entries);
    }
    drops[d] = groups;
  }
  const rewards = {};
  for (const r of await fuente.md('reward_content')) {
    if (usedRewards.has(r.f0)) rewards[r.f0] = r.f1.map((x) => ({ tipo: get(x, 'f2'), id: get(x, 'f3'), cantidad: get(x, 'f6', 1), texto: get(x, 'f4') }));
  }
  const data = {
    _nota: 'Generado por web/js/datos/exportar_varios.js (exportarApi); campos PROVISIONALES en NOTAS.md (F3).',
    personajes: characters, expNivel: expLevel, nivelMaximo: maxLevel, objetos: items, equipos: equipment,
    misiones, drops, recompensas: rewards,
  };
  await salida.escribir('api_master.json', aJSON(data));
}

// ---- exportar_pasivas.py (D60): pasivas.json ----
function sinId(t) {
  if (!esDict(t)) return null;
  const r = Object.fromEntries(Object.entries(t).filter(([k, v]) => k !== 'f0' && v !== null && v !== 0 && v !== false));
  return verdad(r) ? r : null;
}

export async function exportarPasivas(fuente, salida) {
  const out = {};
  for (const p of await fuente.md('passive_skill')) {
    const reg = { nombre: get(p, 'f1', ''), texto: get(p, 'f2', '') };
    for (const [campo, nombre] of [['f3', 'equipo'], ['f4', 'cond'], ['f5', 'objetivo'], ['f6', 'rival'], ['f8', 'tiempo']]) {
      const v = sinId(get(p, campo));
      if (verdad(v)) reg[nombre] = v;
    }
    const alt = o(get(p, 'f12'), []).map((c) => o(sinId(c), {}));
    if (alt.length > 1 || (alt.length && !igual(alt[0], get(reg, 'cond', {})))) reg.alternativas = alt;
    const prob = o(get(p, 'f7'), {});
    reg.prob = get(prob, 'f1', 0);
    if (verdad(get(prob, 'f2')) || verdad(get(prob, 'f3'))) reg.probNunca = true;
    reg.efectos = o(get(p, 'f10'), []).map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'f0')));
    out[String(p.f0)] = reg;
  }
  await salida.escribir('pasivas.json', aJSON(out));
}

// ---- exportar_estados.py (D62): estados.json ----
export async function exportarEstados(fuente, salida) {
  const out = {};
  for (const r of await fuente.md('abnormal_state')) {
    const grupo = (out[String(get(r, 'f0', 0))] ??= {});
    for (const sub of o(get(r, 'f1'), [])) {
      for (const p of o(get(sub, 'f1'), [])) {
        if (!esDict(p) || !verdad(get(p, 'f2'))) continue;
        const params = (grupo[String(get(p, 'f1', 0))] ??= [0, 0, 0, 0, 0]);
        if (p.f2 >= 1 && p.f2 <= 5) params[p.f2 - 1] = get(p, 'f3', 0);
      }
    }
  }
  await salida.escribir('estados.json', aJSON(out));
}

// ---- exportar_combate.py: combate.json (personajes y enemigo de prueba, los de siempre) ----
const STATS = ['hp', 'mp', 'atk', 'def', 'crit'];
const STAT_FIELDS = [28, 29, 30, 31, 32];
export const COMBATE_PJ = [34001, 13002, 11001];
export const COMBATE_ENEMIGOS = [1030001];

/** {id: {stat: [nivel 1, nivel máximo, tope]}} leído directamente de character.bin. */
async function statStructs(fuente) {
  const data = await fuente.leer('data/character.bin');
  const d = new Decoder(data, fuente.clave);
  const [[, vpos]] = d.fields(d.u32(0));
  const [start, cnt] = d.vectorElems(vpos);
  const out = new Map();
  for (let k = 0; k < cnt; k++) {
    const e = start + 4 + k * 4;
    const t = e + d.u32(e);
    const f = new Map(d.fields(t).map(([i, pos]) => [i, pos]));
    const st = {};
    STATS.forEach((name, j) => {
      const i = STAT_FIELDS[j];
      if (f.has(i)) st[name] = [d.i32(f.get(i)), d.i32(f.get(i) + 4), d.i32(f.get(i) + 8)];
    });
    out.set(d.i32(f.get(0)), st);
  }
  return out;
}

export async function exportarCombate(fuente, salida, stats, pjs = COMBATE_PJ, enemigosIds = COMBATE_ENEMIGOS) {
  const chars = porId(await fuente.md('character'));
  const maxLv = new Map((await fuente.md('character_max_level_rarity')).map((r) => [r.f1, r.f2]));
  const attacks = porId(await fuente.md('attack'));
  const structs = await statStructs(fuente);
  const out = { personajes: {}, enemigos: {} };
  for (const cid of pjs) {
    const r = chars.get(cid);
    out.personajes[cid] = {
      nombre: r.f2, rareza: r.f1, arma: r.f3, elemento: r.f9, nivelMax: maxLv.get(r.f1) ?? null,
      crecimiento: get(r, 'f8', 1), stats: structs.get(cid), normales: normalHits(r, attacks),
      precision: get(r, 'f59', 10000), evasion: get(r, 'f60', 0),
    };
  }
  const enemies = await fuente.enemigos();
  for (const eid of enemigosIds) {
    const r = enemies.get(eid);
    out.enemigos[eid] = { nombre: get(r, 'f1'), elemento: get(r, 'f5', 1), normales: normalHits(r, attacks, 'f13'), porNivel: porNivel(stats[String(eid)]) };
  }
  await salida.escribir('combate.json', aJSONIndentado(out));
}
