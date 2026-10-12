// Proyectiles (D48): port de herramientas/exportar_proyectiles.py (D68, mismo resultado). Salida:
// proyectiles/<id>.json = { disparos: {animación: [...]}, balas: {id: ficha} } para todos los personajes.
// Qué es cada campo (y qué es DEDUCCIÓN): en el .py.

import { get, o, verdad, ordenar, pyRound, aJSON, iterar } from './py.js';
import { TIPOS_BUFF, buffDe, estadosDe, porId, eventos } from './comun.js';
import { ssbpPacks, SUPPORTED } from './exportar_personajes.js';
import { caja } from './exportar_cajas.js';

const TIPOS_DISPARO = [4, 57]; // DEDUCCIÓN
const CRUDOS = ['f3', 'f7', 'f10', 'f12', 'f13', 'f21', 'f34', 'f35', 'f41', 'f47', 'f48', 'f49', 'f61', 'f65'];
const esDict = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
// Campos de una caja que usan punto() y caja(): se guarda solo eso (las animaciones ocupan mucho).
const CAMPOS_CAJA = ['f0', 'f1', 'f2', 'f4', 'f5', 'f6', 'f7', 'f8'];
const compacta = (c) => (esDict(c) ? Object.fromEntries(CAMPOS_CAJA.filter((k) => k in c).map((k) => [k, c[k]])) : c);

/** data/animation por unidad o bala, leído al pedirlo: Map(animación → Map(cuadro → [cajas])). */
class Animaciones {
  constructor(fuente, archivos) {
    this.fuente = fuente;
    this.archivos = archivos;
    this.cache = new Map();
  }

  async de(nombre) {
    if (!this.cache.has(nombre)) {
      const out = new Map();
      const f = this.archivos.get(nombre);
      const d = f ? await this.fuente.md(f, { guardar: false }) : {};
      for (const a of iterar(o(get(d, 'f3'), []))) {
        if (!esDict(a)) continue;
        const cuadros = new Map();
        for (const fr of iterar(o(get(a, 'f3'), []))) if (esDict(fr)) cuadros.set(get(fr, 'f0', 0), iterar(o(get(fr, 'f2'), [])).map(compacta));
        out.set(get(a, 'f0'), cuadros);
      }
      this.cache.set(nombre, out);
    }
    return this.cache.get(nombre);
  }
}

/** [dx, dy] de la caja `salida` respecto de la caja 1 (origen) del cuadro, o null. */
function punto(cajas, salida) {
  const porIdC = new Map();
  for (const c of cajas) porIdC.set(get(c, 'f0', 0), c);
  if (!porIdC.has(salida)) return null;
  const or = porIdC.get(1) ?? {}, s = porIdC.get(salida);
  return [pyRound(get(s, 'f1', 0) - get(or, 'f1', 0), 1), pyRound(get(s, 'f2', 0) - get(or, 'f2', 0), 1)];
}

/** [[cuadro, evento]] de una entrada de eventos por cuadro, por cuadro. */
function eventosDe(anim) {
  const out = [];
  for (const fr of o(get(anim, 'f3'), [])) for (const ev of o(get(fr, 'f1'), [])) out.push([get(fr, 'f0', 0), ev]);
  return ordenar(out, (x) => x[0]);
}

/** Tramos [desde, hasta, tipo, id, caja] de golpes (tipo 1) y disparos de balas hijas (4/57). */
function tramos(anim, attacks, bullets) {
  const out = [];
  for (const [cuadro, ev] of eventosDe(anim)) {
    const tipo = get(ev, 'f2'), ref = get(ev, 'f3');
    if (!((tipo === 1 && attacks.has(ref)) || (TIPOS_DISPARO.includes(tipo) && bullets.has(ref)))) continue;
    const clave = [tipo, ref, get(ev, 'f1')];
    const prev = out.find((t) => t[2] === clave[0] && t[3] === clave[1] && t[4] === clave[2] && cuadro - 1 <= t[1] && t[1] <= cuadro);
    if (prev && tipo === 1) prev[1] = cuadro;
    else out.push([cuadro, cuadro, ...clave]);
  }
  return out;
}

async function fichaBala(fuente, b, attacks, bullets, anims) {
  const golpes = new Map();
  const evs = new Map();
  for (const anim of o(get(b, 'f19'), [])) {
    const t = tramos(anim, attacks, bullets);
    if (t.length) evs.set(get(anim, 'f0'), t);
    for (const x of t) {
      if (x[2] === 1 && !golpes.has(x[3])) {
        const a = attacks.get(x[3]);
        const g = { mult: o(get(a, 'f3'), 0) / 10000, final: get(a, 'f10') === 1001, prof: o(get(a, 'f8', 0), 0), tipo: o(get(a, 'f2', 0), 0) };
        if (TIPOS_BUFF.includes(g.tipo)) g.buff = buffDe(a);
        const [est, anormal] = estadosDe(a);
        if (verdad(est)) g.estados = est;
        if (anormal) g.anormal = anormal;
        golpes.set(x[3], g);
      }
    }
  }
  const vuelo = (evs.get('wait') ?? []).filter((x) => x[2] === 1).map((x) => x[3]);
  const ataque = vuelo.length ? vuelo[0] : golpes.size ? golpes.keys().next().value : null;

  const cajas = new Map();
  let propias = null; // se lee al hacer falta (mismo resultado que leerla siempre)
  for (const [nombre, t] of evs) {
    const ids = new Set([...t.filter((x) => x[2] === 1).map((x) => x[4]), 1]);
    if (ids.size <= 1) continue;
    propias ??= await anims.de(get(b, 'f2'));
    const cuadros = propias.get(nombre) ?? new Map();
    if (ids.size > 1 && cuadros.size) {
      const n = Math.max(...cuadros.keys()) + 1;
      const lista = [];
      for (let i = 0; i < n; i++) lista.push((cuadros.get(i) ?? []).filter((c) => ids.has(get(c, 'f0', 0))).map(caja));
      cajas.set(nombre, lista);
    }
  }

  let version = null;
  const f2 = get(b, 'f2');
  if (verdad(f2)) {
    const l = await fuente.listar(`ss/bullet/${f2}`);
    const ssbp = l ? l.files.filter((f) => f.endsWith('.ssbp')) : [];
    if (ssbp.length) version = ssbpPacks(await fuente.leer(`ss/bullet/${f2}/${ssbp[0]}`))[0];
  }
  const ficha = { animacion: SUPPORTED.includes(version) ? f2 : null };
  if (version !== null && !SUPPORTED.includes(version)) ficha.sinDibujo = `${b.f2} (ssbp v${version})`;
  Object.assign(ficha, {
    sonidos: eventos(get(b, 'f19'), attacks),
    velocidad: get(b, 'f6'),
    alcance: get(b, 'f33'),
    ataque,
    multiplicador: verdad(ataque) ? golpes.get(ataque).mult : null,
    ataques: Object.fromEntries(golpes),
    eventos: Object.fromEntries(evs),
    cajas: Object.fromEntries(cajas),
    crudo: Object.fromEntries(CRUDOS.filter((k) => k in b).map((k) => [k, b[k]])),
  });
  return ficha;
}

const hijas = (ficha) => Object.values(ficha.eventos).flatMap((t) => t.filter((x) => TIPOS_DISPARO.includes(x[2])).map((x) => x[3]));

/** unidadDe: Map(id de personaje → unidad) de los que tienen ficha (exportarPersonajes). */
export async function exportarProyectiles(fuente, salida, unidadDe, avance = null) {
  const chars = await fuente.md('character');
  const bullets = porId(await fuente.md('bullet'));
  const attacks = porId(await fuente.md('attack'));
  const anims = new Animaciones(fuente, await fuente.animaciones());
  const fichas = new Map();
  let i = 0;
  for (const r of chars) {
    avance?.(++i / chars.length);
    let unidad = null; // animaciones de la unidad: solo si dispara
    const disparos = {};
    const balas = new Map();
    for (const anim of o(get(r, 'f18'), [])) {
      const name = get(anim, 'f0');
      const lista = [];
      for (const [cuadro, ev] of eventosDe(anim)) {
        if (!TIPOS_DISPARO.includes(get(ev, 'f2')) || !verdad(get(ev, 'f3'))) continue;
        const bid = ev.f3;
        if (!bullets.has(bid)) continue;
        unidad ??= await anims.de(unidadDe.get(r.f0) ?? null);
        const pt = punto((unidad.get(name) ?? new Map()).get(cuadro) ?? [], get(ev, 'f1'));
        lista.push({ cuadro, tipo: ev.f2, bala: bid, salida: get(ev, 'f1'), punto: pt, f4: get(ev, 'f4') });
        const pendientes = [bid];
        while (pendientes.length) {
          const x = pendientes.pop();
          if (!balas.has(x)) {
            if (!fichas.has(x)) fichas.set(x, await fichaBala(fuente, bullets.get(x), attacks, bullets, anims));
            balas.set(x, fichas.get(x));
            pendientes.push(...hijas(balas.get(x)));
          }
        }
      }
      if (lista.length) disparos[name] = lista;
    }
    await salida.escribir(`proyectiles/${r.f0}.json`, aJSON({ disparos, balas: Object.fromEntries(balas) }));
  }
}
