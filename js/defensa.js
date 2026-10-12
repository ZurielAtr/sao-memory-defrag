// Guardia y parada (D53). Leído en el binario (NOTAS.md "Guardia y parada"):
// - Eventos por cuadro (FUN_0083f114): 15 → modo de guardia +0x1a4 (f3: 1 nada, 2 todo, 3 de frente,
//   4 de espaldas; 0 → 3; FUN_008413b4); 54 → lista de cajas de parada +0x1ac (f3 ≠ 0 agrega la caja f1,
//   0 vacía; FUN_008413cc); 93 → lista de parada automática +0x1b8 (igual; FUN_0084146c).
// - Golpe cuerpo a cuerpo (FUN_0083fbb0), en este orden: si la caja del golpe toca la lista +0x1b8 y el
//   ataque se puede parar (attack.f44), el defensor pasa a `parry` (virtual 0x78, motion 30); si toca la
//   lista +0x1ac, no hay daño y, si se puede parar, el atacante queda parado (0x50 → FUN_008395f0); si toca
//   el cuerpo y el golpe es de tipo 1, se cubre según el modo (FUN_00839484 / FUN_008394fc) y el daño se
//   multiplica por 1 − reducción (FUN_0084c8ac; reducción = f50 o f51 del personaje, f27 o f28 del
//   enemigo, / 10000, según attack.f7 sea 1–3 o 4; FUN_00827834 / FUN_00831610).
// - Medidor de guardia (D57, FUN_0084c1b0): estado 0x11 de la unidad, máximo character.f34[17] o v[27]
//   del enemigo. Cada golpe cubierto le resta attack.f23 (FUN_0084c42c; × (1 − 0x5c4: estados)); si queda > 0
//   (o el máximo es 0) se cubre; si llega a 0 se rompe: el medidor vuelve al máximo y el golpe hace el
//   daño en guardia y además el daño entero con su reacción (FUN_008389ec vuelve a llamar a 0x2c cuando
//   0x4c devuelve 0). Con el evento 15 f4 ≠ 0 (+0x1a5) no se toca el medidor.
// - Guardia firme (D58, FUN_00847450): con la motion de guardia sostenida, +0x126c suma el tiempo; al
//   llegar a define 6001 (800 ms) se activa el estado 0x15 durante define 6002 (3200 ms) y el modo pasa a
//   2 (todo). La rotura pone ese tiempo a 0. Quien sostiene la guardia pone `u.guardiaFirme`.
// - Profundidad (D58, FUN_0083fbb0): d = |z defensor − z atacante|; la parada automática y la parada
//   cuentan si d ≤ attack.f8 + radio (el radio es el f4 del evento 93/54 si no es 0, si no el del
//   defensor: character.f14 o enemy.f9); el cuerpo, si d < attack.f8 + radio. Escala de unidad 1.
// PROVISIONAL: las listas y el modo se reinician al cambiar de animación (en el juego persisten hasta
// otro evento); attack.f24 (rompe la guardia de golpe) sin exportar; sin
// los estados que bajan el gasto (0x5c4; D60: ninguna pasiva usa los tipos 0x47/0x48 de la reducción, y el
// máximo del medidor ya lleva las pasivas 0x29, pasivas.js); la z de la caja del golpe se toma
// como 0 (lo es en el 99.6 % de las cajas).
import { tocaCajas, golpeaCaja } from './cajas.js';
import { reduccionGastoMedidor } from './buffs.js';

export const MODO = { NADA: 1, TODO: 2, FRENTE: 3, ESPALDA: 4 };

function estado(u) {
  return (u.defensa ??= { anim: null, ultimo: -1, modo: MODO.NADA, sinMedidor: false, parada: new Set(), auto: new Set(),
    radioParada: 0, radioAuto: 0 });
}

// Procesa los eventos de defensa de la animación actual hasta el cuadro actual.
export function actualizarDefensa(u, eventos) {
  const d = estado(u);
  const anim = u.anim?.name;
  if (anim !== d.anim) {
    d.anim = anim;
    d.ultimo = -1;
    d.modo = MODO.NADA;
    d.sinMedidor = false;
    d.radioParada = d.radioAuto = 0;
    d.parada.clear();
    d.auto.clear();
  }
  const evs = eventos?.[anim]?.defensa;
  if (!evs) return d;
  const f = u.frame;
  if (f < d.ultimo) d.ultimo = -1; // la animación volvió a empezar (bucle)
  for (const ev of evs) {
    if (ev.cuadro <= d.ultimo || ev.cuadro > f) continue;
    if (ev.tipo === 15) {
      if (ev.valor <= 4) { d.modo = ev.valor || MODO.FRENTE; d.sinMedidor = ev.f4 !== 0; }
    } else {
      const lista = ev.tipo === 54 ? d.parada : d.auto;
      if (ev.valor) lista.add(ev.caja);
      else lista.clear();
      if (ev.tipo === 54) d.radioParada = ev.f4 ?? 0; // +0x268
      else d.radioAuto = ev.f4 ?? 0; // +0x26c
    }
  }
  d.ultimo = f;
  return d;
}

// Medidor de guardia de `u` (estado 0x11): { max, valor }; `u.medidorMax` lo pone quien crea la unidad.
export function medidorDe(u) {
  return (u.medidor ??= { max: u.medidorMax ?? 0, valor: u.medidorMax ?? 0 });
}

// FUN_0084c1b0 (parte del medidor): gasta `gasto` y dice si la guardia aguanta.
export function gastarMedidor(u, gasto) {
  const m = medidorDe(u);
  m.valor -= gasto;
  if (m.valor > 0 || m.max === 0) return true;
  m.valor = m.max; // rotura: 0x3d4(0x11, máximo)
  return false;
}

// D61: el bucle de estados (FUN_0084997c) suma 2·dt al valor de los 25 estados (también el medidor 0x11)
// mientras FUN_005f729c (la batalla sigue y algún personaje del jugador está en el campo con HP); el setter
// 0x3d4 (FUN_00852bdc) lo deja entre 0 y el máximo. PROVISIONAL: sin la excepción de la motion 0x14.
export function recuperarMedidor(u, dt) {
  const m = medidorDe(u);
  if (m.max > 0) m.valor = Math.min(m.max, m.valor + 2 * dt);
}

// FUN_008394fc: ¿el atacante está delante del defensor (según hacia donde mira)?
const deFrente = (def, atq) => Math.sign(atq.x - def.x) === def.dir || atq.x === def.x;

// Resuelve un golpe `g` (de eventos_cuadro: caja, guardia = attack.f7, parable = attack.f44) de `atacante`
// contra `defensor`. Devuelve { resultado: 'auto' | 'parada' | 'guardia' | 'rotura' | 'golpe' | null, factor }
// ('rotura' = el golpe rompió la guardia: `factor` es el daño en guardia y luego va el daño entero).
// null = la caja del golpe no toca al defensor (o faltan datos y lo decide quien llama).
export function resolverGolpe(atacante, g, defensor, { reduccion = [0, 0], sueloA = 0, sueloD = 0, choque = null } = {}) {
  const d = estado(defensor);
  const opts = { sueloA, sueloD };
  // D58: profundidad (sin attack.f8 exportado, como antes: sin comprobarla).
  const dz = Math.abs((defensor.z ?? 0) - (atacante.z ?? 0));
  const radio = defensor.radio ?? 0;
  const alcanza = (r, estricto) => g.prof == null || (estricto ? dz < g.prof + r : dz <= g.prof + r);
  let auto = false;
  const toca = (ids) => choque ? choque(ids) : tocaCajas(atacante, g.caja, defensor, ids, opts);
  if (d.auto.size && alcanza(d.radioAuto || radio) && toca(d.auto) && g.parable) auto = true;
  if (d.parada.size && alcanza(d.radioParada || radio) && toca(d.parada)) return { resultado: 'parada', factor: 0 };
  if (!alcanza(radio, true)) return { resultado: auto ? 'auto' : null, factor: 0 };
  const cuerpo = choque ? choque(null) : golpeaCaja(atacante, g.caja, defensor, opts);
  if (cuerpo === false) return { resultado: auto ? 'auto' : null, factor: 0 };
  // D61: la guardia (virtual 0x4c) solo va con los golpes de daño (attack.f2 = 1, FUN_008389ec).
  if (g.tipo != null && g.tipo !== 1) return { resultado: auto ? 'auto' : 'golpe', factor: 1, sinDatos: cuerpo === null };
  // D58: guardia firme (estado 0x15, FUN_00847450): tras 0.8 s de guardia sostenida cubre por todos lados.
  const modo = defensor.guardiaFirme ? MODO.TODO : d.modo;
  const cubre = modo === MODO.TODO
    || (modo === MODO.FRENTE && deFrente(defensor, atacante))
    || (modo === MODO.ESPALDA && !deFrente(defensor, atacante));
  if (cubre) {
    const r = (g.guardia === 4 ? reduccion[1] : g.guardia >= 1 && g.guardia <= 3 ? reduccion[0] : 0) / 10000;
    // Sin cajas (cuerpo === null) quien llama decide con el alcance aproximado: no se gasta el medidor.
    // D61: el gasto baja con la virtual 0x5c4 (buffs del stat 15; buffs.js).
    const aguanta = d.sinMedidor || cuerpo === null || gastarMedidor(defensor, (g.medidor ?? 0) * (1 - reduccionGastoMedidor(defensor)));
    return { resultado: aguanta ? 'guardia' : 'rotura', factor: Math.max(0, 1 - r), auto, sinDatos: cuerpo === null };
  }
  return { resultado: auto ? 'auto' : 'golpe', factor: 1, sinDatos: cuerpo === null };
}
