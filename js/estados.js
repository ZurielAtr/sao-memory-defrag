// Estados de la unidad (aturdimiento, veneno, quemadura, reacción y derribo…) como el juego (D62).
// Descompilaciones: extraido/estados.c (y medidor_guardia.c, D57). NOTAS.md "Estados".
//
// Cada unidad tiene 25 estados con máximo, valor (medidor) y temporizador (arrays de D57: +0x7b4, +0xa0c,
// +0xc64). Cada golpe de daño resta al medidor de cada estado su campo de attack (virtual 0x458 =
// FUN_00853f14; herramientas/eventos_cuadro.py CAMPO_DE_ESTADO): 0, 0x12 y 0x13 en FUN_0084a934 y 1–0x10,
// 0x17, 0x18 (más el grupo attack.f57 con su probabilidad) en FUN_0084b830. Un medidor con máximo que queda
// en 0 dispara su estado y vuelve al máximo: 0x12 = reacción (motion damage), 0x13 = derribo (motion down),
// el resto se activa con la duración de abnormal_state (web/data/estados.json; grupo attack.f57, 0 por
// defecto). Los medidores se recuperan 2 por segundo (FUN_0084997c, con FUN_005f729c).

export const N_ESTADOS = 25;
export const ESTADO = { ATURDIDO: 0, VENENO: 1, OSCURIDAD: 2, QUEMADURA: 3, PARALISIS: 5, ESTADO_6: 6, LENTITUD: 7, GUARDIA: 0x11, REACCION: 0x12, DERRIBO: 0x13, SIN_CURACION: 0x16 };
// FUN_008528c4: estos se activan cuando la unidad sale de la reacción al golpe (+0xebc, FUN_00849e6c).
const DIFERIDOS = new Set([0, 4, 5, 6, 11, 20]);
// FUN_0084b830: estados que resta un golpe además de 0, 0x12 y 0x13 (el 0x11 lo lleva la guardia, D57).
const ANORMALES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0x17, 0x18];
// FUN_00842f84: estos siguen acumulando aunque ya estén activos.
const ACUMULAN_ACTIVOS = new Set([0xc, 0xd, 0xf, 0x17, 0x18]);
// Ticks (FUN_0084997c): veneno y quemadura quitan HP, 10 quita MP, 12 cura HP (‱ del máximo por tick).
const TICKS = { 1: -1, 3: -1, 12: 1 };

export function estadosDe(u) {
  if (!u.estados) {
    const max = Array.from({ length: N_ESTADOS }, (_, i) => u.estadosMax?.[i] ?? 0);
    u.estados = { max, valor: [...max], tiempo: new Array(N_ESTADOS).fill(0), grupo: new Array(N_ESTADOS).fill(0), ticks: new Array(N_ESTADOS).fill(0), pendiente: new Set() };
  }
  return u.estados;
}

export const activo = (u, i) => (u.estados?.tiempo[i] ?? 0) > 0; // virtual 0x3a8 (FUN_00852878)

// Parámetro `n` (1..5) del estado `i` en el grupo `grupo` (FUN_0085b708); sin él, el grupo por defecto.
export function parametro(tabla, grupo, i, n) {
  const p = tabla?.[grupo]?.[i] ?? tabla?.[0]?.[i];
  return p?.[n - 1] ?? 0;
}

// Virtual 0x3dc (FUN_00852cb4): resta al medidor (sin bajar de 0).
function restar(u, i, cantidad) {
  if (!cantidad) return;
  const e = estadosDe(u);
  e.valor[i] = Math.max(0, e.valor[i] - cantidad);
}

/**
 * Golpe de daño `g` (de eventos_cuadro: estados, anormal) recibido por `u` (FUN_0084a934 + FUN_0084b830).
 * `factor(i)` = virtual 0x454 (FUN_00853bb8: 0 en 0/0x12/0x13 si se cubrió; resistencias). Devuelve los
 * estados que dispara: { reaccion, derribo, activados: [i…] }.
 */
export function recibirGolpe(u, g, { factor = () => 1, rng = Math.random, tabla = null } = {}) {
  const e = estadosDe(u);
  const cant = (i) => (g.estados?.[i] ?? 0) * factor(i);
  if (!u.guardiaFirme) { // FUN_00849918: con la guardia firme (estado 0x15) no se acumulan
    if (!activo(u, 0)) restar(u, 0, cant(0));
    if (u.state !== 'hurt') restar(u, 0x12, cant(0x12)); // no mientras ya reacciona (motion 0x12)
    if (!activo(u, 0x13)) restar(u, 0x13, cant(0x13));
  }
  for (const i of ANORMALES) if (!activo(u, i) || ACUMULAN_ACTIVOS.has(i)) restar(u, i, cant(i));
  // Grupo attack.f57: con probabilidad f58/10000 resta f59 a cada estado del grupo.
  const [grupo = 0, prob = 0, valor = 0] = g.anormal ?? [];
  if (grupo && tabla?.[grupo]) {
    for (const i of Object.keys(tabla[grupo]).map(Number)) {
      if (Math.floor(rng() * 10000) < prob && (!activo(u, i) || ACUMULAN_ACTIVOS.has(i))) restar(u, i, factor(i) * valor);
    }
  }
  const out = { reaccion: false, derribo: false, activados: [] };
  for (let i = 0; i < N_ESTADOS; i++) {
    if (i === 0x11 || !e.max[i] || e.valor[i] > 0) continue;
    if (i === 0x12) out.reaccion = true;
    else if (i === 0x13) out.derribo = true;
    else {
      // FUN_0082bf1c: el grupo vale si incluye el estado; si no, el de por defecto.
      activar(u, i, grupo && tabla?.[grupo]?.[i] ? grupo : 0, tabla);
      out.activados.push(i);
    }
    e.valor[i] = e.max[i];
  }
  return out;
}

// Virtual 0x3b0 (FUN_008528c4): activa el estado `i` del grupo `grupo`.
export function activar(u, i, grupo = 0, tabla = null) {
  const e = estadosDe(u);
  e.grupo[i] = grupo;
  if (DIFERIDOS.has(i)) e.pendiente.add(i);
  else e.tiempo[i] = parametro(tabla, grupo, i, 1) / 1000;
  if (TICKS[i] || i === 10) e.ticks[i] = parametro(tabla, grupo, i, 2);
}

/**
 * Un paso del bucle de estados (FUN_0084997c). `corre` = FUN_005f729c (batalla en marcha con el jugador en
 * pie); `enReaccion` = la unidad está en la motion de reacción o derribo (los diferidos esperan).
 * Devuelve { empiezan: [i…] (diferidos que se activan ahora), acaban: [i…], dano, cura }.
 */
export function avanzarEstados(u, dt, { corre = true, enReaccion = false, tabla = null } = {}) {
  const e = estadosDe(u);
  const out = { empiezan: [], acaban: [], dano: 0, cura: 0 };
  if (corre) for (let i = 0; i < N_ESTADOS; i++) if (e.max[i]) e.valor[i] = Math.min(e.max[i], e.valor[i] + 2 * dt);
  for (let i = 0; i < N_ESTADOS; i++) {
    if (i === 0x14) continue;
    if (e.tiempo[i] > 0) {
      e.tiempo[i] -= dt;
      if (e.tiempo[i] <= 0) out.acaban.push(i);
    }
    if (e.pendiente.has(i) && !enReaccion) { // FUN_00849e6c
      e.pendiente.delete(i);
      e.tiempo[i] = parametro(tabla, e.grupo[i], i, 1) / 1000;
      out.empiezan.push(i);
    }
  }
  // Ticks: al acabar el intervalo, uno menos; si quedan, otra vuelta (FUN_0084997c).
  for (const [is, signo] of Object.entries(TICKS)) {
    const i = Number(is);
    if (activo(u, i) || !(e.ticks[i] > 0)) continue;
    e.ticks[i] -= 1;
    const v = Math.max(1, Math.trunc((u.maxHp ?? 0) * (parametro(tabla, e.grupo[i], i, 3) / 10000)));
    if (signo < 0) out.dano += v; else out.cura += v;
    if (e.ticks[i] > 0) e.tiempo[i] = parametro(tabla, e.grupo[i], i, 1) / 1000;
  }
  return out;
}

// D56: con el estado 7 (lentitud) la velocidad × p3/10000 (p3 = 5000 por defecto).
export function factorVelocidad(u, tabla) {
  return activo(u, ESTADO.LENTITUD) ? parametro(tabla, u.estados.grupo[ESTADO.LENTITUD], ESTADO.LENTITUD, 3) / 10000 : 1;
}

// Estado 0x16: no se puede curar (FUN_0083a2f8).
export const sinCuracion = (u) => activo(u, ESTADO.SIN_CURACION);
