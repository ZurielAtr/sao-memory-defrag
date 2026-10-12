import { rutaWeb } from './rutas.js';
// Pasivas (passive_skill) como el juego (D60). Datos: web/data/pasivas.json (herramientas/exportar_pasivas.py,
// que explica cada campo) y la lista de cada personaje (personajes/<id>.json `pasivas` = character.f36).
// Descompilaciones: extraido/pasivas.c. NOTAS.md "Pasivas".
//
// El juego guarda todas las pasivas de la batalla en una lista (gestor +0x15c): una entrada por pasiva y
// objetivo (FUN_005f9a40). Cada cálculo que admite pasivas pregunta por un tipo con su valor base
// (FUN_005fa124: base + Σ (valor de cada entrada − base)); cada entrada solo cuenta si su objetivo pasa los
// filtros (+0x24), su condición se cumple ahora (+0x25), el rival del golpe en curso le vale (+0x26) y salió
// su probabilidad (+0x27) (FUN_005eaacc). El golpe en curso lo fija FUN_005fa188 antes del daño y lo borra
// FUN_005fa404 después (FUN_008389ec): así funcionan "contra enemigos de agua", "al recibir daño"…
//
// Unidades: { equipo (1 jugador, 2 enemigos), esPersonaje, lider, arma (0x430), stats.elemento (0x1dc), hp,
// maxHp, state ('stun' = motion 27) }.
// PROVISIONAL: lo que no se pudo leer (marcado abajo) hace que la pasiva no valga.

import { elementMultiplier } from './combate.js';

// Tipos que consulta el combate (efecto f1).
export const TIPO = {
  HP: 1, // FUN_005f9f5c al empezar: HP máximo
  MP: 2,
  ATAQUE: 3, // FUN_0083a7a8
  DEFENSA: 4, // thunk_FUN_0083a8dc
  CRITICO: 5, // FUN_0083a968 (probabilidad, en ‱)
  VEL_ATAQUE: 7, // FUN_0083aa48 (stat 4)
  VELOCIDAD: 8, // FUN_0083aaf0 (stat 5)
  MEDIDOR_GUARDIA: 0x29, // FUN_005f9f5c: máximo del estado 0x11 ("Guard Durability")
  DANO: 0x3e, // FUN_0083ad60: se suma (valor − base) al daño; se pregunta al defensor
  COSTE_MP: 0x3f, // FUN_00829964
  VENTANA_COMBO: 0x40, // FUN_005fccb4 (define 7 = 2000 ms)
  REDUCCION_GUARDIA: 0x47, // FUN_00827834 / FUN_00831610 (clase 1–3; 0x48 con la 4): ninguna pasiva los usa
  MP_POR_GOLPE: 0x49, // FUN_00827a54
  DANO_CRITICO: 0x4a, // FUN_0083b9bc (stat 11 = 5000 → ×1.5)
  DANO_SKILL: 0x4b, // FUN_0083b3e0
  EFECTO_BUFFS: 0x4c, // FUN_0083b624
  SOBREVIVIR: 0x50, // FUN_00839fa0: si el daño mata, el daño pasa a ser el valor (si es menor)
};

// FUN_005f9f5c: máximo de cada estado ↔ tipo de pasiva (0x3d0 / 0x3cc; D57).
export const MAXIMO_DE_ESTADO = [[0, 0x21], [1, 0x22], [2, 0x23], [3, 0x24], [4, 0x25], [5, 0x26], [7, 0x28], [0x11, 0x29], [0x16, 0x2a]];

const MOTION_ATURDIDO = 27; // motion 0x1b (D58)

// Motion actual (0xf0) si el port la sabe; undefined si no.
function motionDe(u) {
  if (u.state === 'stun') return MOTION_ATURDIDO;
  return undefined;
}

const vivo = (u) => (u.hp ?? 1) > 0 && u.alive !== false;
const enCampo = (u) => !u.enReserva; // +0x3d (el port no tiene unidades en reserva)
const hostiles = (a, b) => a !== b && a.equipo !== b.equipo; // FUN_00838fe0 (PROVISIONAL: por equipo)

// Valor de la unidad que mira cada filtro (null = sin leer: el filtro no se cumple).
const FILTRO = {
  arma: (u) => u.arma ?? 0, // 0x430: 1 espada, 2 dos espadas, 3 estoque … 11 rifle automático (character.f3)
  elemento: (u) => u.stats?.elemento ?? 1, // 0x1dc
  desconocido: () => null, // 0x42c, 0x43c, 0x440, +0x1044, +0x1048
};

// Campos de filtro de f3 / f5 (FUN_005eb980 / FUN_005e9dbc): f2 0x42c, f3 0x430, f4 0x1dc, f5 0x43c.
const FILTROS_UNIDAD = [['f2', FILTRO.desconocido], ['f3', FILTRO.arma], ['f4', FILTRO.elemento], ['f5', FILTRO.desconocido]];
// f4 / f12 (FUN_005e9e70; índice k de FUN_005ebb98): los mismos y f13 0x440, f14 +0x1044, f15 +0x1048.
const FILTROS_COND = [...FILTROS_UNIDAD, ['f13', FILTRO.desconocido], ['f14', FILTRO.desconocido], ['f15', FILTRO.desconocido]];

function pasaFiltros(t, u, filtros) {
  for (const [campo, valor] of filtros) {
    if (t?.[campo] && t[campo] !== valor(u)) return false;
  }
  return true;
}

// FUN_005ebc98: actual frente a umbral; modo 2 = actual·10000/total; comparación 1 =, 2 ≥, 3 ≤, 4 ≥ 0.
function compara(actual, total, umbral, modo, cmp) {
  let v = actual;
  if (modo === 2) v = total ? Math.trunc((actual * 10000) / total) : 0;
  else if (modo !== 1) return false;
  if (cmp === 1) return v === umbral;
  if (cmp === 2) return v >= umbral;
  if (cmp === 3) return v <= umbral;
  return modo === 1 && cmp === 4 && v >= 0;
}

export class Pasivas {
  /** tabla: web/data/pasivas.json; combo(): golpes del combo (gestor +500). */
  constructor(tabla, { rng = Math.random, combo = () => 0 } = {}) {
    this.tabla = tabla ?? {};
    this.rng = rng;
    this.combo = combo;
    this.unidades = []; // gestor +0x150
    this.entradas = []; // gestor +0x15c
  }

  /** La unidad entra en la batalla con sus pasivas (ids de passive_skill). */
  registrar(u, ids = []) {
    if (this.unidades.includes(u)) return;
    this.unidades.push(u);
    u.pasivas = ids;
    // Las pasivas de los demás que alcanzan a los de su equipo o a sus rivales (f5.f1 = 2 / 3) también le llegan.
    for (const d of this.unidades) {
      if (d === u) continue;
      for (const id of d.pasivas ?? []) {
        const reg = this.tabla[id];
        if (reg && this.puedeTener(d, reg) && this.objetivos(d, reg).includes(u)) this.crear(d, u, id, reg);
      }
    }
    for (const id of ids) this.agregar(u, id);
  }

  quitar(u) {
    this.unidades = this.unidades.filter((x) => x !== u);
    this.entradas = this.entradas.filter((p) => p.dueño !== u && p.objetivo !== u);
  }

  // FUN_005f9a40: una entrada por cada objetivo de la pasiva (si el dueño la puede tener).
  agregar(dueño, id) {
    const reg = this.tabla[id];
    if (!reg || !this.puedeTener(dueño, reg)) return;
    for (const objetivo of this.objetivos(dueño, reg)) this.crear(dueño, objetivo, id, reg);
  }

  crear(dueño, objetivo, id, reg) {
    const p = { id, reg, dueño, objetivo, rival: null, atacando: false, golpe: null, usos: 0 };
    // FUN_005e9d8c
    p.activo = pasaFiltros(reg.objetivo, objetivo, FILTROS_UNIDAD); // FUN_005e9dbc (+0x24)
    p.rivalOk = this.rivalVale(p); // +0x26
    p.probOk = this.tirarProbabilidad(p); // +0x27
    this.entradas.push(p);
  }

  // FUN_005eb980 (f3): condición para tener la pasiva.
  puedeTener(u, reg) {
    const e = reg.equipo;
    if (!e) return true;
    if (!pasaFiltros(e, u, FILTROS_UNIDAD)) return false;
    if (e.f8) return false; // solo en un evento o misión concretos (PROVISIONAL: sin eventos)
    if (e.f6) return false; // 1 tipo de evento 4, 2 multijugador (FUN_006a60d0)
    if (e.f7 === 2) return !!u.lider; // líder del grupo (FUN_005e8974)
    if (e.f7 === 1) return false; // asistencia del mismo elemento (0x624): el port no tiene asistencias
    return true;
  }

  // FUN_005e9bb8: f1 = 1 la unidad, 2 sus rivales, 3 los de su equipo (ella incluida), 4 FUN_005f7cd0 (sin leer).
  alcance(u, tipo) {
    if (tipo === 1) return [u];
    if (tipo === 2) return this.unidades.filter((v) => hostiles(u, v));
    if (tipo === 3) return this.unidades.filter((v) => v.equipo === u.equipo);
    return [];
  }

  objetivos(dueño, reg) {
    return this.alcance(dueño, reg.objetivo?.f1 ?? 0);
  }

  // FUN_005e9e70 (f4 y f12): condición en cada consulta. `evento`: 1 golpe, 2 muerte, 6 parada (sin usar aún).
  condicion(p, evento = 0) {
    const c = p.reg.cond ?? {};
    const o = p.objetivo;
    if (!vivo(o)) return false; // 0x184
    if (c.f11) return false; // 0x328(f11) (PROVISIONAL: sin leer)
    const momento = c.f12 ?? 0;
    // +0x3d = en el campo (en el port, siempre): fuera de él solo valen las de "en reserva" (f12 = 7).
    if (momento !== 7 && !enCampo(o)) return false;
    if (p.reg.tiempo?.f3 && p.reg.tiempo.f3 <= p.usos) return false; // usos como máximo (f8.f3)
    if (evento && momento !== evento) return false;
    if (!c.f1) return true;
    const lista = this.alcance(o, c.f1);
    if (!lista.length) return false;
    const alternativas = p.reg.alternativas ?? [c];
    for (const v of lista) {
      for (const [campo, valor] of FILTROS_COND) {
        if (!c[campo] || c[campo] === valor(v)) continue;
        // FUN_005ebb98: vale si alguna condición de f12 tiene ese valor en ese campo.
        if (!alternativas.some((a) => a[campo] === valor(v))) return false;
      }
      if (c.f6) {
        let actual, total;
        if (c.f6 === 1) [actual, total] = [v.hp, v.maxHp];
        else if (c.f6 === 4) [actual, total] = [lista.filter(vivo).length, lista.length];
        else if (c.f6 === 5) [actual, total] = [this.combo(), 1];
        else return false; // 2 MP (el port no tiene MP), 6 contador +0x124c
        if (!compara(actual, total, c.f7 ?? 0, c.f8 ?? 0, c.f9 ?? 0)) return false;
      }
      if (c.f10) return false;
    }
    switch (momento) {
      case 0: return true;
      case 1: return evento === 1 && p.atacando; // al golpear
      case 2: return evento === 2; // al matar
      case 4: return !!p.golpe && (p.golpe.guardia ?? 0) !== 4; // golpe que no es de clase 4
      case 5: return !!p.golpe && p.golpe.guardia === 4;
      case 6: return evento === 6; // al parar
      case 7: return !enCampo(o); // en reserva
      case 20: return !p.atacando; // al recibir (o sin golpe en curso)
      case 21: // al recibir de un rival con ventaja de elemento (0x9c > 1)
        return !p.atacando && !!p.rival && elementMultiplier(p.rival.stats?.elemento, o.stats?.elemento) > 1;
      default: return false; // 3, 8–19, 22: sin portar (8/9 marcas, 10/11 FUN_008394fc, 22 skill de aceleración)
    }
  }

  // FUN_005ea514 (f6): condición sobre el rival del golpe en curso.
  rivalVale(p) {
    const r = p.reg.rival;
    if (!r?.f1) return true;
    const v = p.rival;
    if (!v) return false;
    if (r.f1 === 1 ? v.esPersonaje : r.f1 === 3 ? !v.esPersonaje : true) return false; // 0xc(10) enemigo / 0xc(7) personaje
    if (r.f2 || r.f4 || r.f5 || r.f8 || r.f9 || r.f10) return false; // 0x1e4, +0x115c, 0x42c, marcas, estados, 0x3ac: sin leer
    if (r.f6 && r.f6 !== FILTRO.arma(v)) return false;
    if (r.f3 && r.f3 !== FILTRO.elemento(v)) return false;
    if (r.f7 && motionDe(v) !== r.f7) return false; // 0xf0: motion actual (27 aturdido)
    return true;
  }

  // FUN_005ea724 (f7): probabilidad /10000 (10000 = siempre); f7.f2 / f7.f3 ≠ 0 = nunca.
  tirarProbabilidad(p) {
    if (p.reg.probNunca) return false;
    const prob = p.reg.prob ?? 0;
    return prob === 10000 || Math.floor(this.rng() * 10000) < prob;
  }

  // FUN_005fa188 → FUN_005ea940: golpe de `atacante` a `defensor` (golpe = { guardia: attack.f7 … }).
  contexto(atacante, defensor, golpe = null) {
    for (const p of this.entradas) {
      p.rival = null;
      if (p.objetivo === atacante) { p.rival = defensor; p.atacando = true; }
      else if (p.objetivo === defensor) { p.rival = atacante; p.atacando = false; }
      else continue;
      p.golpe = golpe;
      p.rivalOk = this.rivalVale(p);
      p.probOk = this.tirarProbabilidad(p);
    }
  }

  // FUN_005fa404 → FUN_005eaaa4: fin del golpe.
  limpiar() {
    for (const p of this.entradas) {
      p.rival = null;
      p.atacando = false;
      p.golpe = null;
      p.rivalOk = this.rivalVale(p);
    }
  }

  // FUN_005fa124: base + Σ (valor de cada entrada − base); cuenta un uso en cada entrada que cambia el valor.
  consultar(u, tipo, base) {
    let total = base;
    for (const p of this.entradas) {
      const v = this.valorDe(p, u, tipo, base);
      total += v - base;
      if (v !== base) p.usos += 1;
    }
    return total;
  }

  // FUN_005eaacc + FUN_005eab60 + FUN_005eac8c.
  valorDe(p, u, tipo, base) {
    if (!p.activo || !p.rivalOk || !p.probOk || !this.condicion(p)) return base;
    let total = base;
    for (const ef of p.reg.efectos) {
      if ((ef.f1 ?? 0) !== tipo) continue;
      if (ef.f3 === 1 && u !== p.objetivo) continue;
      if (ef.f3 === 2 && (!p.rival || u !== p.rival)) continue;
      total += this.calcular(p, base, ef) - base;
    }
    return total;
  }

  // FUN_005eac8c(valor f4, unidad f5, operación f2, escala f6, invertir f7).
  calcular(p, base, ef) {
    let valor = ef.f4 ?? 0;
    const esc = ef.f6 ?? 0;
    if (esc) {
      let r = 10000;
      const o = p.objetivo;
      if (esc === 1) r = o.maxHp ? Math.trunc((o.hp * 10000) / o.maxHp) : 0;
      else if (esc === 4) {
        const n = this.pasosDeCombo(p);
        if (n < 1) return Math.max(base, 0);
        r = n * 10000;
      } // 2: MP (el port no tiene MP): sin escala
      if (ef.f7 === 2) r = 10000 - r;
      valor = Math.trunc((valor * r) / 10000);
    }
    let x = base;
    const d = ef.f5 === 2 ? (valor * base) / 10000 : ef.f5 === 1 ? valor : null;
    if (d != null) {
      if (ef.f2 === 1) x = base + d;
      else if (ef.f2 === 2) x = base - d;
      else if (ef.f2 === 3) x = d;
    }
    return x > 0 ? x : 0;
  }

  // FUN_005ebd54: escalones del combo = min(combo, f4.f7) / f8.f2, solo con f4.f6 = 5, f4.f9 = 4 y f4.f8 = 1.
  pasosDeCombo(p) {
    const c = p.reg.cond ?? {};
    const paso = p.reg.tiempo?.f2 ?? 0;
    if (c.f6 !== 5 || c.f9 !== 4 || c.f8 !== 1 || !paso) return 0;
    const n = Math.min(this.combo(), c.f7 ?? 0);
    return n < paso ? 0 : Math.floor(n / paso);
  }

  // FUN_005f9f5c (al empezar la batalla): HP máximo (tipo 1) y máximos de estado (aquí, el medidor de guardia).
  aplicarAlEmpezar(u) {
    u.maxHp = Math.trunc(this.consultar(u, TIPO.HP, u.maxHp));
    u.hp = u.maxHp; // FUN_0083c0a8: fija el máximo y llena el HP (D62)
    if (u.medidorMax) u.medidorMax = this.consultar(u, TIPO.MEDIDOR_GUARDIA, u.medidorMax);
  }

  // FUN_00839fa0: si el daño mata, una pasiva de tipo 0x50 lo puede bajar (una vez: f8.f3).
  danoFinal(defensor, dano) {
    if (dano < defensor.hp) return dano;
    const d = this.consultar(defensor, TIPO.SOBREVIVIR, defensor.hp);
    return d < defensor.hp ? d : dano;
  }
}

export async function cargarPasivas(url = rutaWeb('/data/pasivas.json')) {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}
