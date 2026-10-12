// Buffs de stats como el juego (D61). Descompilaciones: extraido/buffs.c. NOTAS.md "Buffs".
//
// Los golpes que no hacen daño (attack.f2 ≠ 1; FUN_008389ec) con tipo 3, 8 o 12 suben o bajan stats de
// personajes y con 4 o 9 de enemigos (virtual 0x40 → FUN_0083a488 → BuffEvent → mensaje 0xd/0x19 →
// FUN_0070f5f0). Cada unidad tiene dos contenedores (+0x324 tipos 3/8/12, +0x4ac tipos 4/9) de 16 stats
// × 3 huecos con valor y tiempo restante (FUN_0083c1fc / FUN_0083c224); los tipos 6 y 7 vacían un stat
// (FUN_0083c204 / FUN_0083c22c). Cada stat de la unidad suma rand(0.95, 1.05)·(a + b − 2)·base, con a y b
// el multiplicador de cada contenedor (FUN_0083a870).
// Datos de cada golpe (herramientas/eventos_cuadro.py): tipo = attack.f2 y buff = {stat f6, valor f3/10000,
// duracion f35, alcance f5}.

export const STATS_BUFF = 16;
export const STAT = { ATAQUE: 0, DEFENSA: 1, CRITICO: 2, VEL_ATAQUE: 4, VELOCIDAD: 5, EVASION: 7, DANO_CRITICO: 11, ATAQUE_EXTRA: 13, GASTO_MEDIDOR: 15 };
export const TIPOS_PERSONAJE = new Set([3, 8, 12]); // FUN_0083a5c0
export const TIPOS_ENEMIGO = new Set([4, 9]); // FUN_0083a5dc
const CANCELAR = { 6: 'propios', 7: 'ajenos' };
// Stats 14 y 15 se suman tal cual (FUN_005e3554 / FUN_005e3504; DAT_005e35d4 = DAT_005e353c = 0).
const SUMADO = (stat) => (stat & 0xfe) === 0xe;

// Contenedor (+0x324 o +0x4ac): valor en +4 + stat·0xc + hueco·4, tiempo en +0xc4 + lo mismo.
export class Contenedor {
  constructor() {
    this.valor = new Array(STATS_BUFF * 3).fill(0);
    this.tiempo = new Array(STATS_BUFF * 3).fill(0);
  }

  // FUN_0083c1fc / FUN_0083c224.
  poner(stat, valor, duracion, hueco = 0) {
    if (!(stat >= 0 && stat < STATS_BUFF)) return;
    this.valor[stat * 3 + hueco] = valor;
    this.tiempo[stat * 3 + hueco] = duracion;
  }

  // FUN_0083c204 / FUN_0083c22c.
  vaciar(stat) {
    for (let h = 0; h < 3; h++) this.valor[stat * 3 + h] = this.tiempo[stat * 3 + h] = 0;
  }

  // FUN_005e3504: valor de un hueco activo (1, o 0 en los stats 14/15, si no está activo).
  hueco(stat, h = 0) {
    const i = stat * 3 + h;
    return this.tiempo[i] > 0 ? this.valor[i] : SUMADO(stat) ? 0 : 1;
  }

  // FUN_005e3554: 1 + Σ (valor − 1) de los huecos activos (stats 14/15: Σ valor).
  multiplicador(stat) {
    let m = SUMADO(stat) ? 0 : 1;
    for (let h = 0; h < 3; h++) m += SUMADO(stat) ? this.hueco(stat, h) : this.hueco(stat, h) - 1;
    return m;
  }

  // FUN_005e36e4: el hueco 1 cuenta con el reloj global (dtGlobal) y los demás con el de la unidad.
  avanzar(dt, dtGlobal = dt) {
    let activo = false;
    for (let i = 0; i < this.tiempo.length; i++) {
      if (this.tiempo[i] > 0) {
        this.tiempo[i] -= i % 3 === 1 ? dtGlobal : dt;
        activo = true;
      }
    }
    return activo;
  }

  activos() {
    const out = [];
    for (let s = 0; s < STATS_BUFF; s++) for (let h = 0; h < 3; h++) if (this.tiempo[s * 3 + h] > 0) out.push({ stat: s, hueco: h, valor: this.valor[s * 3 + h], tiempo: this.tiempo[s * 3 + h] });
    return out;
  }
}

export function buffsDe(u) {
  u.buffs ??= { propios: new Contenedor(), ajenos: new Contenedor() };
  return u.buffs;
}

// Switch (FUN_005e69bc): el que entra recibe los buffs del que sale (virtual 0x45c por cada uno).
export function pasarBuffs(de, a) {
  if (!de?.buffs) return;
  const b = buffsDe(a);
  for (const k of ['propios', 'ajenos']) for (const x of de.buffs[k].activos()) b[k].poner(x.stat, x.valor, x.tiempo, x.hueco);
}

// FUN_0083a870: lo que suman los buffs al stat `stat` de base `base`.
export function terminoBuff(u, base, stat, rng = Math.random) {
  if (!u?.buffs) return 0;
  const a = u.buffs.propios.multiplicador(stat), b = u.buffs.ajenos.multiplicador(stat);
  if (a + b - 2 === 0) return 0;
  return (0.95 + rng() * 0.1) * (a + b - 2) * base; // FUN_008af5b8(0.95, 1.05)
}

// Virtual 0x5c4 del personaje (FUN_0082b128): reducción del gasto del medidor de guardia = el mayor de los
// huecos 0 y 1 del stat 15 (y de FUN_0085a604, estados 0xd/0x17/0x18: sin portar), nunca menos de 0.
export function reduccionGastoMedidor(u) {
  if (!u?.buffs || !u.esPersonaje) return 0;
  const c = u.buffs.propios;
  return Math.max(0, c.hueco(STAT.GASTO_MEDIDOR, 0), c.hueco(STAT.GASTO_MEDIDOR, 1));
}

// FUN_0083b6f8 (virtual 0xb8): valor que deja el golpe `g` de `atacante` en `objetivo`. `efecto` = virtual
// 0xb0 del atacante (FUN_0083b624: 1 sin skill activa; con ella, 1 + pasivas 0x4c).
export function valorBuff(objetivo, atacante, g, efecto = 1) {
  const b = g.buff ?? {};
  const v = b.valor ?? 0; // attack.f3 / 10000 (DAT_0083b804 = 0 sin el campo)
  const e = Math.max(efecto, 1);
  let x = v >= 1 ? v * e : v / e;
  if (SUMADO(b.stat ?? 0)) x = v;
  if (g.tipo === 8 || g.tipo === 9) {
    const c = buffsDe(objetivo)[g.tipo === 8 ? 'propios' : 'ajenos'];
    return x - 1 + c.hueco(b.stat ?? 0, 0); // se acumula con lo que ya tenía el hueco 0
  }
  return x;
}

/**
 * Aplica el golpe `g` (tipo 3/4/6/7/8/9/12) de `atacante` a `objetivo` (FUN_0070f5f0, mensajes 0xd/0x19).
 * Devuelve true si cambió algo. Solo vale para la clase que corresponde (personaje 3/8/12, enemigo 4/9).
 */
export function aplicarBuff(objetivo, atacante, g, efecto = 1) {
  const b = g.buff ?? {};
  const stat = b.stat ?? 0;
  if (CANCELAR[g.tipo]) {
    buffsDe(objetivo)[CANCELAR[g.tipo]].vaciar(stat);
    return true;
  }
  const paraPersonaje = TIPOS_PERSONAJE.has(g.tipo);
  if (!paraPersonaje && !TIPOS_ENEMIGO.has(g.tipo)) return false;
  if (paraPersonaje !== !!objetivo.esPersonaje) return false; // FUN_00700edc: 0xc(7) / 0xc(10)
  const valor = valorBuff(objetivo, atacante, g, efecto);
  const c = buffsDe(objetivo)[paraPersonaje ? 'propios' : 'ajenos'];
  c.poner(stat, valor, b.duracion ?? 0, g.tipo === 12 ? 1 : 0);
  return true;
}

export const esBuff = (g) => TIPOS_PERSONAJE.has(g?.tipo) || TIPOS_ENEMIGO.has(g?.tipo) || !!CANCELAR[g?.tipo];
