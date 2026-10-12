// IA de los enemigos (D47): port de la máquina de estados del binario (FUN_00801f24 y vecinas).
// Datos: web/data/ia/<patrón>.json (herramientas/exportar_ia.py; se unen con ia_datos.js, D55). Detalle en NOTAS.md "IA de los enemigos".
//
// Ciclo (estado del controlador, ctrl[7]):
//   0 elegir objetivo (FUN_00802a90) → 1 si hay, 2 si no
//   1/2 elegir acción con disparadores de clase 1 (con objetivo) o 4 (sin objetivo) (FUN_008075f8)
//   3 iniciar la acción (FUN_00802bdc) · 4 ejecutarla (FUN_00802ca8; fin en FUN_00807a34)
//   5 terminada (FUN_00802dec): continuación (clase 2, total fijo 100) o vuelta a 0
//   8 llegó al destino (clase 3) · 12 tiempo límite agotado
// Lo que no está leído o se simplificó lleva PROVISIONAL.

// _INIT_42 (0x015a29d0): clase de ataque (acción.f20) → [motion, índice].
const MOTION_DE_ATAQUE = new Map([
  [1, [1, 0]],
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((k, i) => [k, [9, i]]), // attack_1..9 (ranuras 0..8)
  ...[11, 12, 13, 14, 15, 16, 17, 18, 19].map((k, i) => [k, [10, i]]), // ranuras 9..17
  [20, [5, 0]], [21, [6, 0]], [22, [7, 0]], [23, [8, 0]], [25, [12, 0]], [26, [15, 0]],
  [31, [30, 0]], [33, [25, 0]], [34, [10, 2]], [36, [10, 0]],
]);
// Clases de ataque con manejo propio (D59; FUN_00808134): 24, 27 y 30 no cambian de motion al empezar
// (FUN_00808488) y se llevan cada cuadro desde FUN_008084b8; 28 → FUN_0080bd20, 29 → FUN_0080c068,
// 32/35 → FUN_0080becc. NOTAS.md "IA de los enemigos" → "Ataques especiales".
const CLASES_ESPECIALES = new Set([24, 27, 28, 29, 30, 32, 35]);
const CARGA_MINIMA = 0.6; // DAT_00848900 (FUN_00848880: la carga dura max(acción.f41, 0.6) s)
const REPETIR_CADA = 0.05; // DAT_00808a4c (clase 30)
const DISTANCIA_PASO = 100; // DAT_0080c8b4 (FUN_0080c708 sin acción.f33)
const DISTANCIA_CANDIDATO = 300; // DAT_0080a1e0 (FUN_0080a03c sin acción.f27)
// _INIT_42 (0x015a29dc): acción.f32 (animación al moverse; 1 por defecto) → motion.
const MOTION_AL_MOVERSE = new Map([[1, 2], [2, 4], [3, 3]]);
// _INIT_44: motion → índice de animación (FUN_0084f384). < 44: unit_animation_name de la unidad;
// ≥ 46: ranuras del enemigo (enemy.f14) desde la 0 (FUN_00831dcc).
const INDICE_DE_MOTION = new Map([
  [1, 1], [2, 4], [3, 5], [4, 6], [5, 8], [6, 11], [7, 14], [8, 18], [9, 46], [10, 55], [11, 44],
  [12, 20], [13, 23], [14, 24], [15, 64], [18, 26], [19, 28], [20, 28], [21, 32], [22, 34], [23, 33],
  [24, 38], [25, 11], [27, 35], [28, 36], [29, 7], [30, 42], [31, 27], [32, 6], [33, 6], [34, 26],
  [35, 28], [36, 43], [37, 27],
]);
// FUN_00806b7c: ángulos de dispersión por acción.f11 (2..10), en grados.
const ANGULOS = [[-45, 45], [135, 225], [-45, -135], [45, 135], [90, -90], [90, 270], [0, -180], [0, 180], [0, 360]];

// Velocidades al caminar y correr (dash) (D56, FUN_0084f384: DAT_008512f0 = 248, DAT_0085019c = 495),
// × la velocidad de la unidad (stat 5: v[8] / 100 del enemigo) × modo.f2.
export const VELOCIDAD_CAMINAR = 248;
export const VELOCIDAD_CORRER = 495;
const LLEGADA = 8; // distancia a la que un punto de la ruta cuenta como alcanzado (PROVISIONAL)

export function animacionDeMotion(motion, indice, nombres) {
  const i = INDICE_DE_MOTION.get(motion);
  if (i == null) return null;
  if (i >= 46) return nombres.ranuras[i - 46 + indice] ?? null;
  // "step#1" = variante; si no existe se usa el nombre sin "#n" (FUN_008530b8).
  return (nombres.nombresBase[i] || '').split('#')[0] || null;
}

const azar = (a, b, rng) => a + (b - a) * rng(); // FUN_008af5b8
const azarEntero = (a, b, rng) => Math.min(a, b) + Math.floor(rng() * (Math.abs(b - a) + 1)); // FUN_008af410

export class IAEnemigo {
  // datos = IA unida de web/data/ia/ (ia_datos.js); ia/modo = f5/f6 de la colocación; maestro = id del enemigo maestro.
  constructor(datos, { ia, modo, maestro }, enemigo, { rng = Math.random } = {}) {
    const entrada = datos.entradas[ia];
    this.patron = datos.patrones[entrada.f1];
    this.ia = ia;
    this.modo = modo;
    this.radio = entrada.f3 ?? 0;
    this.nombres = datos.enemigos[maestro] ?? { nombresBase: [], ranuras: [] };
    this.e = enemigo;
    this.rng = rng;
    this.acciones = new Map(this.patron.acciones.map((a) => [a.f0, a]));
    this.datosModo = this.patron.modos.find((m) => m.f0 === modo) ?? {};
    // FUN_00801d28: stat 5 (velocidad del enemigo, D56) × modo.f2
    this.velocidad = (this.nombres.velocidad ?? 1) * (this.datosModo.f2 ?? 1);
    this.casa = { x: enemigo.x, z: enemigo.z }; // ctrl[0x10..0x12]: posición al crearse
    this.usos = new Map(); // [modo, clase, acción] → { veces, enfriamiento, usado } (FUN_00809b24)
    this.estado = 0;
    this.accion = null;
    this.objetivo = null; // ctrl[0xc]
    this.objetivoAtaque = null; // ctrl[0xe] (FUN_008076e4); se conserva entre acciones
    this.anterior = null; // ctrl[0xf]: el objetivo de ataque anterior
    this.odio = new Map(); // +0x13b0 del enemigo: unidad → odio (FUN_00833368, D63)
    this.cortada = false; // ctrl+0x69e: la fase 2 se cortó entre acción.f37 y f38 (D63)
    this.siguiente = 0; // ctrl+0x960: acción encadenada (acción.f4)
    this.continuacion = false; // ctrl[0xb]
  }

  // Se llama cada cuadro solo mientras el enemigo está libre (FUN_00801f24 sale si 0x5b4 != 1).
  update(dt, ctx) {
    this.ctx = ctx;
    if (dt > 0) {
      for (const u of this.usos.values()) { u.enfriamiento = Math.max(0, u.enfriamiento - dt); u.usado = false; }
    }
    for (let n = 0; n < 60; n++) {
      if (!this.paso(dt)) break;
      dt = 0; // las transiciones encadenadas del mismo cuadro corren con dt = 0 (llamada recursiva)
    }
  }

  // Un paso de la máquina. Devuelve true si cambió de estado y hay que seguir en este cuadro.
  paso(dt) {
    switch (this.estado) {
      case 0: // FUN_00802a90
        this.objetivo = this.buscarObjetivo();
        return this.cambiar(this.objetivo ? 1 : 2);
      case 1: return this.cambiar(this.elegir(1));
      case 2: return this.cambiar(this.elegir(4));
      case 3: return this.cambiar(this.iniciar());
      case 4: return this.ejecutar(dt);
      case 5: return this.terminar();
      case 8: return this.cambiar(this.elegir(3)); // llegó al destino (FUN_008075f8(ctrl, 3))
      default: // 12 (tiempo agotado) y los no portados: se suelta la acción
        this.ponerAccion(null);
        return this.cambiar(0);
    }
  }

  cambiar(estado) {
    this.estado = estado;
    return true;
  }

  // FUN_00806fd4 + FUN_00807520: rivales a distancia ≤ radio (entrada.f3, 3D); el más cercano.
  // PROVISIONAL: los filtros del modo (f10/f11/f12, FUN_0080723c) no se aplican.
  buscarObjetivo() {
    const e = this.e;
    let mejor = null, d2Mejor = Infinity;
    for (const r of this.ctx.rivales) {
      if (!(r.hp > 0)) continue;
      const dx = r.x - e.x, dz = (r.z ?? 0) - (e.z ?? 0);
      const d2 = dx * dx + dz * dz;
      if (d2 <= this.radio * this.radio && d2 < d2Mejor) { mejor = r; d2Mejor = d2; }
    }
    return mejor;
  }

  // FUN_008075f8 + FUN_00804c20: devuelve 3 si eligió acción, 0 si no.
  elegir(clase) {
    if (this.siguiente && (clase === 1 || clase === 4)) return this.ponerAccion(this.siguiente, false);
    const e = this.e;
    // FUN_00809c84: posición del objetivo relativa, con x positiva = delante del enemigo.
    const rel = this.objetivo ? { x: (this.objetivo.x - e.x) * e.dir, z: (this.objetivo.z ?? 0) - (e.z ?? 0) } : { x: 0, z: 0 };
    const vida = e.maxHp ? (e.hp / e.maxHp) * 100 : 100; // PROVISIONAL: +0x2a8 tomado como % de vida
    const lado = (s, v) => s === 1 || (s === 2 && v > 0) || (s === 3 && v < 0);
    const cand = [];
    let total = 0;
    for (const t of this.patron.disparadores) {
      if (t.f2 !== clase || (t.f1 && t.f1 !== this.modo) || (t.f0 && t.f0 !== this.ia)) continue;
      if (this.objetivo && t.f16 != null && t.f16 !== 1) continue; // PROVISIONAL: estado del objetivo (FUN_00804ff8)
      if (!lado(t.f18, rel.x) || !lado(t.f19, rel.z)) continue;
      if (!this.disponible(t)) continue;
      if (t.f3 > 0 && Math.abs(rel.x) < t.f3) continue;
      if (t.f4 > 0 && Math.abs(rel.x) > t.f4) continue;
      if (t.f5 > 0 && Math.abs(rel.z) < t.f5) continue;
      if (t.f6 > 0 && Math.abs(rel.z) > t.f6) continue;
      if (t.f12 && vida < t.f12) continue;
      if (t.f13 && t.f13 < vida) continue;
      cand.push(t);
      total += t.f7;
    }
    if (clase === 2) total = 100; // la continuación puede no ocurrir
    const r = azarEntero(0, total, this.rng);
    let acum = 0, elegido = null;
    for (const t of cand) { acum += t.f7; if (acum >= r) { elegido = t; break; } }
    if (!elegido) { this.ponerAccion(null); return 0; }
    const u = this.uso(elegido);
    u.veces++;
    u.enfriamiento = elegido.f9 ?? 0;
    u.usado = true;
    return this.ponerAccion(elegido.f10, clase === 2);
  }

  uso(t) {
    const k = `${t.f1 ?? 0}|${t.f2}|${t.f10}`;
    if (!this.usos.has(k)) this.usos.set(k, { veces: 0, enfriamiento: 0, usado: false });
    return this.usos.get(k);
  }

  // FUN_0080501c
  disponible(t) {
    const u = this.uso(t);
    if (u.usado || !t.f7) return false;
    if (t.f8 === 1) return true;
    if (t.f8 === 3) return u.enfriamiento === 0;
    if (t.f8 === 2) return u.veces === 0;
    return false;
  }

  // FUN_00808a60 (con id) / FUN_0080555c (null): fija la acción; 3 = iniciarla. Soltarla (null) no
  // borra la encadenada (ctrl+0x960): se hace al volver a elegir con clase 1 o 4.
  ponerAccion(id, continuacion = false) {
    if (id == null) { this.accion = null; this.continuacion = false; return 0; }
    this.continuacion = continuacion;
    this.accion = this.acciones.get(id) ?? null;
    if (!this.accion) { this.siguiente = 0; return 0; }
    if (!this.accion.f50) this.siguiente = this.accion.f4 ?? 0;
    return 3;
  }

  // FUN_00802bdc: 4 = en curso; 0 = no se pudo.
  iniciar() {
    const a = this.accion;
    this.tiempo = 0; // ctrl[0x18]
    this.llego = false; // +0x69a
    this.fase = 0; // ctrl[8]: 1 moviéndose/acercándose, 2 atacando
    this.tFase2 = 0; // ctrl+0x6a0: tiempo en la fase 2
    if (a.f1 === 1) {
      this.espera = azar(a.f5 ?? 0, a.f6 ?? 0, this.rng); // FUN_00806ef4
      return 4;
    }
    if (a.f1 >= 2 && a.f1 <= 4) {
      // FUN_00802bdc: atacar (4) necesita objetivo de ataque (FUN_008076e4 = 1) y MP para la skill
      // (FUN_0080794c; los enemigos no gastan: virtual 0x414 = 0); moverse (2, 3) sigue sin él.
      if (!this.elegirObjetivoAtaque(a) && a.f1 === 4) return 0;
      const ref = this.referencia(a);
      if (ref === undefined) return 0;
      this.ref = ref;
      if (!this.construirRuta(a)) return 0;
      this.fase = 1;
      return 4;
    }
    return 0;
  }

  // FUN_008076e4 (D63): objetivo del ataque (ctrl[0xe]) según acción.f22. false = no hay a quién (no cambia).
  // 0/1 = ninguno (se ataca donde está); 2/3/8/9 = uno de los candidatos (FUN_00809d74; con f23 se queda el
  // anterior si sigue entre ellos); 4 = el objetivo (ctrl[0xc]; con f23, el anterior si es de su equipo).
  elegirObjetivoAtaque(a) {
    if (this.objetivoAtaque) this.anterior = this.objetivoAtaque;
    const f22 = a.f22 ?? 0, prev = this.anterior;
    let t = null;
    switch (f22) {
      case 0: case 1: break;
      case 2: case 3: case 8: case 9: {
        const c = this.candidatos(a);
        if (!c.length) return false;
        t = a.f23 && prev && c.includes(prev) ? prev : this.seleccionar(c, f22);
        break;
      }
      case 4: { // FUN_0080a78c
        const o = this.objetivo;
        if (a.f23 && prev && prev.hp > 0 && !prev.enReserva && o && o.hp > 0 && prev.equipo === o.equipo) t = prev;
        else if (o && o !== this.e && this.valido(o)) t = o;
        else return false;
        break;
      }
      default: // PROVISIONAL: 5, 6, 7 y 10 (líder, aliados, el jugador); ninguna acción exportada los usa
        t = this.objetivo;
    }
    this.objetivoAtaque = t;
    return true;
  }

  // FUN_0080a4f0: vivo, en el campo (+0x3d) y sin la marca +0x1271 (sin leer). PROVISIONAL: la zona
  // (+0x650 = colocación.f22, FUN_00838fe0 con FUN_0073594c) no se compara.
  valido(u) {
    return Boolean(u) && u.hp > 0 && !u.enReserva;
  }

  // FUN_00809e54: unidades del campo (menos él) que pasan el filtro de equipo (f24, FUN_0080a370) y de vida
  // (f25/f26, FUN_0080a400); con f22 = 3, además a distancia ≤ f27 (300 sin él; FUN_0080a03c).
  candidatos(a) {
    const e = this.e, out = [];
    const yo = e.equipo ?? 2;
    for (const u of this.ctx.unidades ?? this.ctx.rivales) {
      if (u === e || !this.valido(u)) continue;
      const el = u.equipo ?? 1;
      const f24 = a.f24 ?? 0;
      const equipo = f24 <= 1 || (f24 === 2 && el === 1) || (f24 === 3 && el === 2) || (f24 === 4 && yo === el) ||
        (f24 === 5 && (yo !== 1 || el !== 0) && yo !== el);
      if (!equipo) continue;
      const f25 = a.f25 ?? 0;
      if (f25 > 2 || (f25 === 2 && !(u.hp / u.maxHp <= (a.f26 ?? 0) / 100))) continue;
      if (a.f22 === 3) {
        const r = a.f27 ?? DISTANCIA_CANDIDATO;
        const dx = u.x - e.x, dy = (u.alt ?? 0) - (e.alt ?? 0), dz = (u.z ?? 0) - (e.z ?? 0);
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
      }
      out.push(u);
    }
    return out;
  }

  // FUN_00809ed0: 8 y 9 = el de más odio (al azar entre los empatados; FUN_008097b4, FUN_0080a1e8); el resto,
  // uno al azar.
  seleccionar(c, f22) {
    let lista = c;
    if (f22 === 8 || f22 === 9) {
      let max = 0;
      lista = [];
      for (const u of c) {
        const v = this.odioDe(u);
        if (v < max) continue;
        if (v > max) { max = v; lista = []; }
        lista.push(u);
      }
    }
    return lista.length ? lista[azarEntero(0, lista.length - 1, this.rng)] : null;
  }

  // Odio (FUN_00710864 lo lee; FUN_008334c8 → FUN_00833368 lo suma y lo deja en ≥ 0).
  odioDe(u) {
    return this.odio.get(u) ?? 0;
  }

  sumarOdio(u, v) {
    if (v) this.odio.set(u, Math.max(0, this.odioDe(u) + v));
  }

  // FUN_00805698: unidad de referencia según f8 (forma de moverse) y f9.
  referencia(a) {
    const f8 = a.f8 ?? 0;
    if ([1, 4, 5, 6, 7, 9].includes(f8) || !f8) return null;
    if (![2, 3, 8, 10, 11].includes(f8)) return undefined;
    switch (a.f9) {
      case 4: return this.objetivo ?? undefined;
      case 5: return this.e;
      case 2: return this.objetivoAtaque ?? undefined; // ctrl[0xe]
      default: return this.objetivo ?? undefined; // PROVISIONAL: 3, 6, 7, 8 (aliados, líder…)
    }
  }

  // FUN_008058bc
  construirRuta(a) {
    const e = this.e;
    this.punto = 0;
    switch (a.f8) {
      case 2: // FUN_008059cc (PROVISIONAL: sin el reparto entre aliados de FUN_008069b8)
        this.ruta = [this.limitar(this.dispersar(this.destino(a), a))];
        return true;
      case 3: { // FUN_00805ac8: el punto opuesto al destino (alejarse)
        const d = this.destino(a);
        let p = { x: 2 * e.x - d.x, z: 2 * e.z - d.z };
        if (d.x === e.x) p = { x: (this.ctx.ancho ?? 0) / 2, z: e.z };
        this.ruta = [this.limitar(this.dispersar(p, a))];
        return true;
      }
      case 6: // FUN_00805f84: volver a la posición inicial
        this.ruta = [this.limitar(this.dispersar(this.casa, a))];
        return true;
      case 1:
        this.ruta = [];
        return true;
      default: // PROVISIONAL: 4, 5 (rutas), 7–11 sin portar → como 2
        this.ruta = [this.limitar(this.dispersar(this.destino(a), a))];
        return true;
    }
  }

  // FUN_0080378c: referencia + desplazamiento (acción.f10).
  destino(a) {
    const e = this.e, r = this.ref ?? e;
    const off = a.f10 ?? [0, 0, 0];
    let ox = off[0], oz = off[2] ?? 0; // misma z interna que la posición (Vec3(f2, f3, -f4))
    if ([2, 4, 6, 7, 8].includes(a.f9)) {
      if (r.x - e.x < 0) ox = -ox; // del lado del enemigo
      if ((r.z ?? 0) - (e.z ?? 0) < 0) oz = -oz;
    } else if (a.f9 === 3) {
      if (r.dir < 0) ox = -ox;
    } else if (a.f9 !== 5) {
      ox = 0; oz = 0;
    }
    return { x: r.x + ox, z: (r.z ?? 0) + oz };
  }

  // FUN_00806b7c: dispersión aleatoria (f11 clase de ángulo, f12 radio).
  dispersar(p, a) {
    if (!a.f11 || a.f11 === 1 || a.f11 > 10) return p;
    const [lo, hi] = ANGULOS[a.f11 - 2];
    const ang = azar(lo, hi, this.rng) * 0.01745329238474369;
    let r = azar(0, a.f12 ?? 0, this.rng);
    if (this.e.dir < 0) r = -r;
    return { x: p.x + r * Math.cos(ang), z: p.z + r * Math.sin(ang) };
  }

  // FUN_008051e0: dentro del campo, rebotando en los bordes (z sin límites: PROVISIONAL).
  limitar(p) {
    const w = this.ctx.ancho;
    if (w == null) return p;
    let x = p.x;
    if (x < 0) x = -x;
    else if (x > w) x = w - (x - w);
    return { x: Math.max(0, Math.min(w, x)), z: p.z };
  }

  // FUN_00802ca8
  ejecutar(dt) {
    const fin = this.comprobarFin();
    if (fin !== 4) return this.cambiar(fin);
    const a = this.accion;
    if (a.f1 === 1) {
      this.espera = Math.max(0, this.espera - dt); // FUN_00807cdc
      this.ctx.esperar(this.e);
    } else if (a.f1 === 2 || a.f1 === 3) {
      this.mover(dt);
    } else if (a.f1 === 4) {
      if (this.fase === 1) {
        if (this.enAlcance(a) || this.llego) {
          if (CLASES_ESPECIALES.has(a.f20)) { // D59
            this.especial = { fase: 0, t: 0, veces: 0 };
            this.fase = 2;
            this.tFase2 = 0;
            this.pasoEspecial(0);
            return true;
          }
          this.especial = null;
          const m = MOTION_DE_ATAQUE.get(a.f20 ?? 0);
          if (m && this.dar(m[0], this.direccion(a), m[1])) {
            this.fase = 2;
            this.tFase2 = 0;
            return true;
          }
          return this.cambiar(0); // animación inexistente
        }
        this.mover(dt);
      } else if (this.fase === 2) {
        if (this.especial) this.pasoEspecial(dt);
        this.tFase2 += dt; // ctrl+0x6a0 (FUN_00802ca8)
      }
    }
    this.tiempo += dt;
    return false;
  }

  // FUN_00807a34: 4 = seguir; otro = nuevo estado.
  comprobarFin() {
    const a = this.accion;
    if (!a) return 5;
    switch (a.f1) {
      case 1: if (this.espera === 0) return 5; break;
      case 2: if ((a.f7 ?? 0) <= this.tiempo) return 5; break;
      case 3: if (this.punto >= this.ruta.length) return 5; break;
      case 4:
        if (this.fase === 2 && this.ctx.ataqueTerminado(this.e) && (!this.especial || this.especial.fase === 0xff)) return 5;
        break;
      default: return 5;
    }
    // D63: en la fase 2 con acción.f36, entre f37 y f38 s (+0x6a0) se corta y sigue con la acción f36.
    if (this.fase === 2 && a.f36 && (a.f37 ?? 0) < this.tFase2 && this.tFase2 < (a.f38 ?? 0)) {
      this.cortada = true;
      return 5;
    }
    if ((a.f1 === 2 || a.f1 === 3) && this.llego) return 8;
    // D63: en la fase 1, la referencia (ctrl[0xd]) o el objetivo de ataque ya no valen → 9 / 10 (se suelta).
    if (this.fase === 1 && this.ref && this.ref !== this.e && !this.valido(this.ref)) {
      this.objetivoAtaque = this.anterior = null;
      return 9;
    }
    if (this.fase === 1 && this.objetivoAtaque && !this.valido(this.objetivoAtaque)) {
      this.objetivoAtaque = this.anterior = null;
      return 10;
    }
    if (a.f7 && this.fase !== 2 && a.f7 <= this.tiempo) return 12;
    return 4;
  }

  // FUN_00802dec. PROVISIONAL: las acciones f45/f46 (marcas +0x978/+0x979 sin leer) no se portan.
  terminar() {
    const a = this.accion;
    if (this.cortada && a?.f36) { // D63
      this.cortada = false;
      return this.cambiar(this.ponerAccion(a.f36, this.continuacion));
    }
    this.cortada = false;
    if (!this.continuacion && this.objetivo) return this.cambiar(this.elegir(2));
    this.ponerAccion(null);
    return this.cambiar(0);
  }

  // FUN_0080a930: distancia por eje entre la caja mínima (f28) y la máxima (f29).
  enAlcance(a) {
    const t = this.objetivoAtaque;
    if (!t || (a.f22 ?? 0) === 1) return true; // sin objetivo de ataque: se ataca ya (r4 = 1)
    const d = [Math.abs(t.x - this.e.x), 0, Math.abs((t.z ?? 0) - (this.e.z ?? 0))];
    const min = a.f28 ?? [0, 0, 0], max = a.f29 ?? [0, 0, 0];
    return d.every((v, i) => v >= (min[i] ?? 0) && v <= (max[i] ?? 0));
  }

  animacionDeAtaque(a) {
    const m = MOTION_DE_ATAQUE.get(a.f20 ?? 0);
    return m ? animacionDeMotion(m[0], m[1], this.nombres) : null;
  }

  // Pide la motion `motion` (índice de ranura `indice`) con la dirección `dir` = [x, z] (virtual 0x38c).
  dar(motion, dir, indice = 0) {
    const anim = animacionDeMotion(motion, indice, this.nombres);
    return Boolean(anim && this.ctx.atacar(this.e, anim, this.objetivoAtaque, { motion, dir }));
  }

  // FUN_0080c22c: dirección del ataque = (±1 hacia el objetivo, o hacia donde mira sin objetivo; al revés con
  // la clase 21) girada acción.f21 grados. [x, z] (el juego usa Vec3(x, 0, −y); aquí z = −z del juego = y).
  direccion(a) {
    const t = this.objetivoAtaque;
    let x = t ? (t.x - this.e.x < 0 ? -1 : 1) : (this.e.dir < 0 ? -1 : 1);
    if (a.f20 === 21) x = -x;
    const ang = (a.f21 ?? 0) * 0.01745329238474369; // DAT_0080c348
    return [x * Math.cos(ang), x * Math.sin(ang)];
  }

  // FUN_0080c708: si dar el paso (distancia acción.f33, 100 sin ella) saca del campo en x, se invierte x.
  enCampo(dir, a) {
    const w = this.ctx.ancho, n = Math.hypot(dir[0], dir[1]);
    if (w == null || !n) return dir;
    const x = this.e.x + ((a.f33 || DISTANCIA_PASO) * dir[0]) / n;
    return x < 0 || x > w ? [-dir[0], dir[1]] : dir;
  }

  // Paso adelante (5) si la dirección va hacia donde mira; si no, paso atrás (6) (FUN_0080bd20, FUN_0080becc).
  darPaso(dir) {
    return this.dar(Math.sign(dir[0]) === (this.e.dir < 0 ? -1 : 1) || !dir[0] ? 5 : 6, dir);
  }

  // FUN_008084b8 y las de cada clase: se llama cada cuadro mientras dura el ataque especial.
  // PROVISIONAL: lo que no se pudo leer está marcado en NOTAS.md.
  pasoEspecial(dt) {
    const s = this.especial, a = this.accion, e = this.e, t = this.objetivoAtaque;
    const libre = this.ctx.ataqueTerminado(e);
    const prof = this.ctx.profundidad;
    switch (a.f20) {
      case 24: // FUN_008084f8: paso hacia la profundidad del objetivo (± 4 radios, hacia el centro) y luego
        // otro hasta su x (rodearlo; los anchos +0x66c.f6 de las dos unidades no están leídos: 0).
        if (s.fase === 0) {
          const dir = t
            ? [t.x - e.x, t.z + (prof != null && t.z > prof / 2 ? -4 : 4) * (t.radio ?? 0) - e.z]
            : this.direccion(a);
          if (this.dar(5, dir)) s.fase = 1;
        } else if (s.fase === 1 && libre) {
          if (this.dar(5, t ? [t.x - e.x, t.z - e.z] : this.direccion(a))) s.fase = 0xff;
        }
        break;
      case 27: // FUN_008087dc: carga (motion 13) max(f41, 0.6) s y suelta (motion 14)
        if (s.fase === 0) {
          if (this.dar(13, this.direccion(a))) s.fase = 1;
        } else if (s.fase === 1) {
          s.t += dt;
          if (s.t >= Math.max(a.f41 ?? 0, CARGA_MINIMA)) {
            if (this.dar(14, this.direccion(a))) s.fase = 0xff;
          } else if (libre) {
            this.dar(13, this.direccion(a)); // la animación de carga se repite mientras dura
          }
        }
        break;
      case 28: { // FUN_0080bd20 / FUN_0080c5dc: paso para apartarse en z (hacia el centro del campo)
        if (s.fase !== 0) break;
        let dir = this.direccion(a);
        if (prof != null && Math.sign(dir[1]) === Math.sign(e.z - prof / 2)) dir = [dir[0], -dir[1]];
        if (this.darPaso(this.enCampo(dir, a))) s.fase = 0xff;
        break;
      }
      case 29: // FUN_0080c068: salto (motion 7) hacia su posición inicial (PROVISIONAL: salto en el sitio)
        if (s.fase === 0 && this.dar(7, [0, 0])) s.fase = 0xff;
        break;
      case 30: // FUN_008088a8: el ataque de la ranura 0, acción.f43 veces seguidas
        s.t += dt;
        if (s.fase === 0) {
          if (this.dar(9, this.direccion(a), 0)) { s.fase = 1; s.veces = 1; s.t = 0; }
        } else if (s.fase === 1 && libre) {
          if (s.veces < (a.f43 ?? 1) && s.t >= REPETIR_CADA && this.dar(9, this.direccion(a), 0)) { s.veces++; s.t = 0; }
          else if (s.veces >= (a.f43 ?? 1)) s.fase = 0xff;
        }
        break;
      case 32: case 35: { // FUN_0080becc: paso hacia el centro del campo
        if (s.fase !== 0) break;
        const cx = (this.ctx.ancho ?? e.x * 2) / 2, cz = prof != null ? prof / 2 : e.z;
        if (this.darPaso(this.enCampo([cx - e.x, cz - e.z], a))) s.fase = 0xff;
        break;
      }
      default:
        s.fase = 0xff;
    }
    // Si la motion no se pudo dar (falta la animación), no se queda colgado.
    if (s.fase !== 0xff && libre && s.fase === 0) s.fallos = (s.fallos ?? 0) + 1;
    if ((s.fallos ?? 0) > 2) s.fase = 0xff;
  }

  // FUN_00807d88 (simplificada): avanza por la ruta con la animación de acción.f32.
  mover(dt) {
    const e = this.e, p = this.ruta[this.punto];
    if (!p) { this.llego = true; this.ctx.esperar(e); return; }
    const motion = MOTION_AL_MOVERSE.get(this.accion.f32 ?? 1) ?? 2;
    const vel = (motion === 4 ? VELOCIDAD_CORRER : VELOCIDAD_CAMINAR) * this.velocidad;
    const dx = p.x - e.x, dz = p.z - (e.z ?? 0);
    const d = Math.hypot(dx, dz);
    if (d <= LLEGADA) {
      this.punto++;
      if (this.punto >= this.ruta.length) { this.llego = true; this.ctx.esperar(e); }
      return;
    }
    const k = Math.min(1, (vel * dt) / d);
    // PROVISIONAL: al alejarse (f8 = 3) sigue mirando al objetivo.
    const mira = this.accion.f8 === 3 && this.objetivo ? Math.sign(this.objetivo.x - e.x) : Math.sign(dx);
    this.ctx.mover(e, dx * k, dz * k, animacionDeMotion(motion, 0, this.nombres) ?? 'walk', mira);
  }
}
