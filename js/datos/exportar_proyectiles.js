// Proyectiles (D48/D71): exportador compartido entre Node y el importador OPFS. Salida:
// proyectiles/<id>.json = { disparos: {animación: [...]}, balas: {id: ficha} } para todos los personajes.
// proyectiles_enemigos/<id>.json: mismo formato, desde enemy.f13, con defensa/estados de attack.
// Física y rutas 4/57/87: Ghidra D72; los demás campos se conservan para investigar.

import { get, o, verdad, ordenar, pyRound, aJSON, iterar } from './py.js';
import { TIPOS_BUFF, buffDe, estadosDe, porId, eventos } from './comun.js';
import { ssbpPacks, SUPPORTED } from './exportar_personajes.js';
import { caja } from './exportar_cajas.js';

const TIPOS_DISPARO = [4, 57, 87];
const esDict = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
// Campos de una caja que usan punto() y caja(): se guarda solo eso (las animaciones ocupan mucho).
const CAMPOS_CAJA = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];
const compacta = (c) => (esDict(c) ? Object.fromEntries(CAMPOS_CAJA.filter((k) => k in c).map((k) => [k, c[k]])) : c);

/** f5 contiene dos float32, incluidos los valores de 64 bits leídos como BigInt por el decoder. */
function vec2(v) {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setBigInt64(0, BigInt(v ?? 0), true);
  return [buf.getFloat32(0, true), buf.getFloat32(4, true)];
}

function cajaBala(b) {
  const out = caja(b);
  if (get(b, 'f3', 0)) out.push(b.f3);
  return out;
}

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

/** [dx, dy, ángulo opcional] de la caja de salida respecto del origen del cuadro. */
function punto(cajas, salida) {
  const porIdC = new Map();
  for (const c of cajas) porIdC.set(get(c, 'f0', 0), c);
  if (!porIdC.has(salida)) return null;
  const or = porIdC.get(1) ?? {}, s = porIdC.get(salida);
  const out = [pyRound(get(s, 'f1', 0) - get(or, 'f1', 0), 1), pyRound(get(s, 'f2', 0) - get(or, 'f2', 0), 1)];
  if (get(s, 'f3', 0)) out.push(s.f3);
  return out;
}

/** [[cuadro, evento]] de una entrada de eventos por cuadro, por cuadro. */
function eventosDe(anim) {
  const out = [];
  for (const fr of o(get(anim, 'f3'), [])) for (const ev of o(get(fr, 'f1'), [])) out.push([get(fr, 'f0', 0), ev]);
  return ordenar(out, (x) => x[0]);
}

/** Tramos [desde,hasta,tipo,id,caja[,f4[,vec2]]] de golpes y disparos de balas hijas. */
function tramos(anim, attacks, bullets) {
  const out = [];
  for (const [cuadro, ev] of eventosDe(anim)) {
    const tipo = get(ev, 'f2'), ref = get(ev, 'f3');
    if (!((tipo === 1 && attacks.has(ref)) || (TIPOS_DISPARO.includes(tipo) && bullets.has(ref)))) continue;
    const clave = [tipo, ref, get(ev, 'f1')];
    const prev = out.find((t) => t[2] === clave[0] && t[3] === clave[1] && t[4] === clave[2] && cuadro - 1 <= t[1] && t[1] <= cuadro);
    if (prev && tipo === 1) prev[1] = cuadro;
    else {
      const tramo = [cuadro, cuadro, ...clave];
      if (TIPOS_DISPARO.includes(tipo)) tramo.push(get(ev, 'f4', 0));
      if (tipo === 87) tramo.push(vec2(get(ev, 'f5', 0)));
      out.push(tramo);
    }
  }
  return out;
}

async function fichaBala(fuente, b, attacks, bullets, anims) {
  const golpes = new Map();
  const evs = new Map();
  const funcionales = {};
  for (const anim of o(get(b, 'f19'), [])) {
    const t = tramos(anim, attacks, bullets);
    if (t.length) evs.set(get(anim, 'f0'), t);
    funcionales[get(anim, 'f0')] = eventosDe(anim).map(([cuadro, ev]) => {
      const out = { cuadro, tipo: get(ev, 'f2', 0), caja: get(ev, 'f1', 0), f3: get(ev, 'f3', 0), f4: get(ev, 'f4', 0) };
      if (get(ev, 'f5') != null) out.f5 = typeof ev.f5 === 'bigint' ? ev.f5.toString() : ev.f5;
      if (out.tipo === 10 || out.tipo === 87) out.vec2 = vec2(get(ev, 'f5', 0));
      return out;
    });
    for (const x of t) {
      if (x[2] === 1 && !golpes.has(x[3])) {
        const a = attacks.get(x[3]);
        const g = { mult: o(get(a, 'f3'), 0) / 10000, final: get(a, 'f10') === 1001, prof: o(get(a, 'f8', 0), 0), tipo: o(get(a, 'f2', 0), 0),
          ataque: x[3], guardia: get(a, 'f7', 0), parable: verdad(get(a, 'f44')), medidor: o(get(a, 'f23', 0), 0),
          pausa: ['f25', 'f26', 'f32', 'f33'].map((k) => o(get(a, k, 0), 0)), clase: get(a, 'f1', 0), odio: get(a, 'f61', 0) };
        g.balas = verdad(get(a, 'f34')); g.objetivo = get(a, 'f5', 0);
        if (g.tipo === 2 || g.tipo === 10) g.cura = { tope: o(get(a, 'f46', 0), 0), div: o(get(a, 'f4', 1), 1) };
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
  for (const [nombre, listaEventos] of Object.entries(funcionales)) {
    const ids = new Set([1, ...listaEventos.map((ev) => ev.caja).filter((id) => id !== 0)]);
    if (ids.size <= 1) continue;
    propias ??= await anims.de(get(b, 'f2'));
    const cuadros = propias.get(nombre) ?? new Map();
    if (ids.size > 1 && cuadros.size) {
      const n = Math.max(...cuadros.keys()) + 1;
      const lista = [];
      for (let i = 0; i < n; i++) lista.push((cuadros.get(i) ?? []).filter((c) => ids.has(get(c, 'f0', 0))).map(cajaBala));
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
    funcionales,
    cajas: Object.fromEntries(cajas),
    fisica: {
      velocidad: ['f6', 'f7', 'f8'].map((k) => get(b, k, 0)),
      aceleracion: ['f9', 'f10', 'f11'].map((k) => get(b, k, 0)),
      tipo: get(b, 'f3', 0), pararAlMorir: verdad(get(b, 'f15')), pararEnSuelo: verdad(get(b, 'f16')),
      orientarVelocidad: verdad(get(b, 'f17')), vida: get(b, 'f18', 0) / 1000, tiempoSuelo: get(b, 'f20', 0) / 1000,
      escala: get(b, 'f21', 100) / 100, suelo: verdad(get(b, 'f26')), impactos: get(b, 'f39', 0),
      borrarAlAlcance: verdad(get(b, 'f45')), apuntarZ: get(b, 'f34', 0), apuntarY: get(b, 'f35', 0),
      apuntarSuelo: verdad(get(b, 'f51')),
      seguimiento: get(b, 'f37', 0),
      hp: get(b, 'f12', 0),
      teledireccion: { giro: get(b, 'f22', 0), tolerancia: get(b, 'f23', 0), radio: get(b, 'f24', 0), tiempo: get(b, 'f25', 0) / 1000 },
      artFacing: get(b, 'f55', 2) === 1 ? -1 : 1, sinImpactoAppear: verdad(get(b, 'f56')),
      offset: ['f58', 'f59', 'f60'].map((k) => get(b, k, 0)),
    },
    // Valores originales sin atribuir significado a f12/f13/f14 ni a los campos aún no leídos.
    crudo: Object.fromEntries(Object.entries(b).filter(([k]) => /^f\d+$/.test(k) && !['f0', 'f1', 'f2', 'f19'].includes(k))),
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
  const units = porId(await fuente.md('unit'));
  const enemies = [...(await fuente.enemigos()).values()];
  const actores = [
    ...chars.map((r) => ({ r, campo: 'f18', unidad: unidadDe.get(r.f0), carpeta: 'proyectiles' })),
    ...enemies.map((r) => ({ r, campo: 'f13', unidad: get(units.get(r.f3) ?? {}, 'f3'), carpeta: 'proyectiles_enemigos' })),
  ];
  const fichas = new Map();
  let i = 0;
  for (const { r, campo, unidad: nombreUnidad, carpeta } of actores) {
    avance?.(++i / actores.length);
    let unidad = null; // animaciones de la unidad: solo si dispara
    const disparos = {};
    const balas = new Map();
    for (const anim of o(get(r, campo), [])) {
      const name = get(anim, 'f0');
      const lista = [];
      for (const [cuadro, ev] of eventosDe(anim)) {
        if (!TIPOS_DISPARO.includes(get(ev, 'f2')) || !verdad(get(ev, 'f3'))) continue;
        const bid = ev.f3;
        if (!bullets.has(bid)) continue;
        unidad ??= await anims.de(nombreUnidad ?? null);
        const pt = punto((unidad.get(name) ?? new Map()).get(cuadro) ?? [], get(ev, 'f1'));
        const disparo = { cuadro, tipo: ev.f2, bala: bid, salida: get(ev, 'f1'), punto: pt, f4: get(ev, 'f4') };
        if (ev.f2 === 87) disparo.vec2 = vec2(get(ev, 'f5', 0));
        lista.push(disparo);
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
    await salida.escribir(`${carpeta}/${r.f0}.json`, aJSON({ disparos, balas: Object.fromEntries(balas) }));
  }
}
