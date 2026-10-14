// Misiones (D43, D49, D55): port de herramientas/exportar_mision.py --todas (D68, mismo resultado). Salidas:
// misiones/<id>.json y misiones/index.json. Qué es cada campo: en el .py.

import { get, o, verdad, ordenar, aJSON } from './py.js';
import { normalHits, porId, porNivel, eventos } from './comun.js';

const CAMPOS = [['f0', 'id'], ['f1', 'dificultad'], ['f5', 'ia'], ['f6', 'modoIa'], ['f7', 'maestro'], ['f8', 'lado'],
  ['f9', 'drop'], ['f10', 'equipo'], ['f11', 'grupo'], ['f12', 'lider'], ['f13', 'nivel']];
const NOMBRES_CAMPO = new Set(CAMPOS.map(([f]) => f));
const CAMPOS_PUERTA = [['f0', 'id'], ['f1', 'x'], ['f2', 'y'], ['f3', 'z'], ['f4', 'estado'], ['f5', 'destino'], ['f6', 'lado'], ['f7', 'f7']];
const OTROS_ESCENARIO = ['f3', 'f4', 'f6', 'f7', 'f8', 'f13', 'f23', 'f28'];

/** Master data que usa la exportación, cargada una vez (clase Datos del .py). */
export async function cargarDatos(fuente, stats) {
  const d = {
    fuente,
    stage: porId((await fuente.md('stage')).f1),
    quests: porId((await fuente.md('quest')).f0, 'f3'),
    levels: new Map((await fuente.md('quest_level')).map((r) => [r.f0, r.f1])),
    backgrounds: new Map((await fuente.md('background')).map((b) => [get(b, 'f0'), b])),
    units: porId(await fuente.md('unit')),
    attacks: porId(await fuente.md('attack')),
    capitulos: porId(await fuente.md('chapter')),
    requiere: new Map(),
    enemies: await fuente.enemigos(),
    stats,
    conAnimation: new Set((await fuente.animaciones()).keys()),
    versiones: new Map(),
  };
  for (const a of await fuente.md('quest_appearance')) {
    const req = get(a, 'f3') === 1 && verdad(get(a, 'f4')) ? [a.f4, get(a, 'f5', 1)] : null;
    d.requiere.set(`${a.f1}|${a.f2}`, req);
  }
  return d;
}

/** Versión del .ssbp de la unidad (el primero por nombre); null sin archivo. */
async function version(d, unidad) {
  if (!d.versiones.has(unidad)) {
    let v = null;
    const l = await d.fuente.listar(`ss/unit/${unidad}`);
    if (l) {
      for (const f of ordenar(l.files)) {
        if (f.endsWith('.ssbp')) {
          const b = (await d.fuente.leer(`ss/unit/${unidad}/${f}`)).subarray(4, 8);
          v = b.reduce((acc, x, i) => acc + x * 2 ** (8 * i), 0);
          break;
        }
      }
    }
    d.versiones.set(unidad, v);
  }
  return d.versiones.get(unidad);
}

/** D106: escala mínima (f18), máxima (f19) y por defecto (f22) del escenario; null sin ninguna. */
function camaraEscenario(sc) {
  const c = { min: get(sc, 'f18', 0), max: get(sc, 'f19', 0), base: get(sc, 'f22', 0) };
  for (const k of Object.keys(c)) if (!(typeof c[k] === 'number' && c[k] > 0)) delete c[k];
  return Object.keys(c).length ? c : null;
}

/** D106: fondo de combate (background.json) tal como lo monta FieldHorizontal (FUN_00818308/008185cc). */
export function fondoCombate(bg) {
  const capas = [];
  for (const l of o(get(bg, 'f8'), [])) {
    const tipo = get(l, 'f3', 0);
    if (tipo !== 1 && tipo !== 2) continue; // FUN_00818308: 1 = campo, 2 = imagen (no hay tipo 3)
    capas.push({
      tipo, orden: get(l, 'f1', 0), archivo: get(l, 'f2', '') || null, carpeta: get(l, 'f16', null),
      z: get(l, 'f4', 0), ancla: [get(l, 'f5', 0), get(l, 'f6', 0)], pos: [get(l, 'f7', 0), get(l, 'f8', 0)],
      paralaje: [get(l, 'f9', 1), get(l, 'f10', 1)], modo: get(l, 'f11', 0), mosaico: get(l, 'f12', 0),
      escala: [get(l, 'f13', 1), get(l, 'f14', 1)], negro: verdad(get(l, 'f15', 0)),
    });
  }
  return {
    ancho: get(bg, 'f2', 0), profundidad: get(bg, 'f3', 0), alto: get(bg, 'f4', 0),
    escala: get(bg, 'f5', 1), escalaMin: get(bg, 'f6', 1), escalaMax: get(bg, 'f7', 1), capas,
  };
}

/** Arma la misión qid (objeto) o null si no está en stage. */
export async function exportarMision(d, qid) {
  const mission = d.stage.get(qid);
  if (mission === undefined) return null;
  const q = d.quests.get(qid) ?? {};
  const escenariosM = o(get(mission, 'f1'), []);
  const meta = escenariosM.find((sc) => verdad(get(sc, 'f5')));
  const dificultades = new Map();
  for (const lv of d.levels.get(qid) ?? []) dificultades.set(lv.f1, { nivelRecomendado: get(lv, 'f6') });
  const out = {
    id: qid,
    nombre: get(q, 'f6'),
    etiqueta: get(q, 'f7'),
    mundo: get(q, 'f0'),
    capitulo: get(q, 'f4'),
    tipo: get(q, 'f8'),
    primerEscenario: get(mission, 'f2'),
    escenarioInicial: get(mission, 'f2'),
    escenarioMeta: meta ? meta.f0 : null,
    dificultades: null,
    escenarios: [],
    enemigos: {},
  };
  const enemigos = new Map();
  const motivos = new Set(), avisos = new Set();
  for (const sc of escenariosM) {
    if (verdad(get(sc, 'f24')) && verdad(get(sc, 'f25'))) motivos.add('sorteo');
    const bg = d.backgrounds.get(get(sc, 'f2')) ?? {};
    const folders = new Set(o(get(bg, 'f8'), []).map((layer) => get(layer, 'f16')).filter((x) => verdad(x)));
    const placed = [];
    for (const e of o(get(sc, 'f9'), [])) {
      const mid = get(e, 'f7');
      if (!d.enemies.has(mid) || !(String(mid) in d.stats)) {
        motivos.add('sin_maestro');
        continue;
      }
      const p = {};
      for (const [f, name] of CAMPOS) if (get(e, f) !== null) p[name] = e[f];
      p.x = get(e, 'f2', 0);
      p.y = get(e, 'f3', 0);
      p.z = get(e, 'f4', 0);
      p.jefe = get(e, 'f14') === 2;
      p.otros = Object.fromEntries(Object.entries(e).filter(([k]) => !NOMBRES_CAMPO.has(k) && !['f2', 'f3', 'f4', 'f14'].includes(k)));
      placed.push(p);
      if (enemigos.has(mid)) continue;
      const r = d.enemies.get(mid);
      const unit = get(d.units.get(get(r, 'f3')) ?? {}, 'f3');
      let costume = o(get(r, 'f15'), [null])[0];
      costume = verdad(costume) ? `${costume}.png` : null;
      if (verdad(unit) && costume && !(await d.fuente.existe(`ss/unit/${unit}/${costume}`))) costume = null;
      if (!verdad(unit)) motivos.add('sin_unidad');
      else {
        const v = await version(d, unit);
        if (v === null) motivos.add('sin_ssbp');
        else if (v !== 2 && v !== 6) motivos.add(`ssbp_v${v}`);
        if (!d.conAnimation.has(unit)) avisos.add('sin_animation');
      }
      enemigos.set(mid, {
        nombre: get(r, 'f1'),
        elemento: get(r, 'f5', 1),
        unidad: unit,
        fisica: { escala: get(r, 'f12', 100) / 100,
          tamano: [get(d.units.get(get(r, 'f3')) ?? {}, 'f6', 0), get(d.units.get(get(r, 'f3')) ?? {}, 'f7', 0)] },
        radio: get(r, 'f9', 0),
        eventosGeometria: Object.fromEntries(Object.entries(eventos(get(r, 'f13'), d.attacks))
          .filter(([, e]) => e.geometria).map(([n, e]) => [n, { geometria: e.geometria }])),
        traje: costume,
        normales: normalHits(r, d.attacks, 'f13'),
        porNivel: porNivel(d.stats[String(mid)]),
      });
    }
    out.escenarios.push({
      id: sc.f0,
      meta: verdad(get(sc, 'f5')),
      puertas: o(get(sc, 'f10'), []).map((g) => Object.fromEntries(CAMPOS_PUERTA.map(([f, name]) => [name, get(g, f, ['x', 'y', 'z'].includes(name) ? 0 : null)]))),
      apariciones: o(get(sc, 'f11'), []),
      otros: Object.fromEntries(Object.entries(sc).filter(([k]) => OTROS_ESCENARIO.includes(k))),
      fondo: {
        id: get(sc, 'f2'),
        carpeta: folders.size ? ordenar([...folders])[0] : null,
        ancho: get(bg, 'f2'),
        profundidad: get(bg, 'f3'),
        // D106: zoom de la cámara del escenario; 0 o ausente = el del fondo (FUN_008171ac/0081720c/008173fc).
        camara: camaraEscenario(sc),
      },
      enemigos: placed,
    });
  }
  for (const [dif, info] of dificultades) {
    let n = 0;
    for (const sc of out.escenarios) for (const e of sc.enemigos) if (get(e, 'dificultad', 1) === dif && get(e, 'equipo', 2) === 2) n++;
    info.enemigos = n;
    info.requiere = d.requiere.has(`${qid}|${dif}`) ? d.requiere.get(`${qid}|${dif}`) : null;
  }
  out.dificultades = Object.fromEntries(dificultades);
  out.enemigos = Object.fromEntries(enemigos);
  if (!out.escenarios.some((sc) => sc.enemigos.length)) {
    motivos.add(String(o(out.tipo, '')).toLowerCase() === 'story' ? 'solo_historia' : 'sin_enemigos');
  }
  const esc = out.escenarios;
  if (esc.length > 1 && !motivos.has('sin_enemigos') && !motivos.has('solo_historia')) {
    const ids = esc.map((sc) => sc.id);
    const metaId = o(out.escenarioMeta, ids[ids.length - 1]);
    const ini = ids.includes(out.escenarioInicial) ? out.escenarioInicial : ids[0];
    const vistos = new Set([ini]);
    const pila = [ini];
    let auto = false;
    while (pila.length) {
      const sc = esc[ids.indexOf(pila.pop())];
      let salidas = sc.puertas.filter((g) => get(g, 'lado') !== 1 && ids.includes(get(g, 'destino'))).map((g) => g.destino);
      if (!salidas.length && ids.indexOf(sc.id) + 1 < ids.length) {
        salidas = [ids[ids.indexOf(sc.id) + 1]];
        auto = true;
      }
      for (const x of salidas) {
        if (!vistos.has(x)) {
          vistos.add(x);
          pila.push(x);
        }
      }
    }
    if (!vistos.has(metaId)) motivos.add('meta_inalcanzable');
    else if (auto) avisos.add('sin_puertas');
  }
  out.jugable = motivos.size === 0;
  out.motivos = ordenar([...motivos]);
  out.avisos = ordenar([...avisos]);
  return out;
}

/** Entrada del índice (escribir_indice del .py) de una misión ya exportada. */
function entradaIndice(d, m) {
  const cap = d.capitulos.get(m.capitulo) ?? {};
  const q = d.quests.get(m.id) ?? {};
  return {
    id: m.id, etiqueta: m.etiqueta, nombre: m.nombre, dificultades: JSON.parse(aJSON(m.dificultades)),
    mundo: m.mundo, capitulo: m.capitulo, capituloNumero: get(cap, 'f1'),
    numero: get(q, 'f2'), tipo: m.tipo, condicion: get(q, 'f10'),
    jugable: m.jugable, motivos: m.motivos, avisos: m.avisos,
  };
}

/**
 * Exporta todas las misiones de stage (--todas) y el índice. Devuelve lo que necesitan exportar_ia y
 * exportar_cajas: { maestros: Set, usadas: Set de IA, pares: [[ia, maestro]], unidades: Set }.
 */
export async function exportarMisiones(fuente, salida, stats, avance = null) {
  const d = await cargarDatos(fuente, stats);
  const ids = ordenar([...d.stage.keys()]);
  const indice = [];
  const resumen = { maestros: new Set(), usadas: new Set(), pares: new Map(), unidades: new Set() };
  const fondos = new Set();
  let i = 0;
  for (const qid of ids) {
    const m = await exportarMision(d, qid);
    avance?.(++i / ids.length);
    if (!m) continue;
    await salida.escribir(`misiones/${qid}.json`, aJSON(m));
    indice.push(entradaIndice(d, m));
    for (const [k, en] of Object.entries(m.enemigos)) {
      resumen.maestros.add(Number(k));
      if (verdad(en.unidad)) resumen.unidades.add(en.unidad);
    }
    for (const sc of m.escenarios) {
      if (sc.fondo?.id != null) fondos.add(sc.fondo.id);
      for (const e of sc.enemigos) {
        // Como exportar_ia.py: solo IA enteras (algunas colocaciones traen f5 mal decodificado como float).
        if (Number.isInteger(e.ia) && e.ia) {
          resumen.usadas.add(e.ia);
          resumen.pares.set(`${e.ia}|${get(e, 'maestro')}`, [e.ia, get(e, 'maestro')]);
        }
      }
    }
  }
  const orden = ordenar(indice, (e) => [e.mundo == null, o(e.mundo, 0), o(e.capituloNumero, 0), o(e.numero, 0), e.id]);
  orden.forEach((e, k) => { e.orden = k; });
  await salida.escribir('misiones/index.json', aJSON(orden));
  // D106: fondos de combate usados por las misiones (capas, paralaje y zoom de la cámara).
  const salidaFondos = {};
  for (const id of ordenar([...fondos])) if (d.backgrounds.has(id)) salidaFondos[id] = fondoCombate(d.backgrounds.get(id));
  await salida.escribir('fondos.json', aJSON(salidaFondos));
  return resumen;
}
