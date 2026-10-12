import { rutaWeb } from './rutas.js';
// Proyectiles de personajes y enemigos (D48/D71). Exportador JS compartido entre Node y OPFS.
// Datos: proyectiles/<personaje>.json y proyectiles_enemigos/<maestro>.json.
//
// Qué está leído y qué no:
//   - CONFIRMADO (Ghidra, D47/D51): en los eventos por cuadro (character.f18) el tipo 1 es un golpe
//     (f3 = attack.json, f1 = caja de la animación); las cajas se miden como en cajas.js (/ 1.82).
//   - CONFIRMADO (Ghidra, D71): evento 4 → virtual 0x220 → FUN_00840760; creación con el actor emisor,
//     salida /1.82 (FUN_00840664), y golpe de bala por FUN_0083fbb0 como los actores.
//   - DEDUCCIÓN (de los datos): el tipo 57 dispara la bala f3 (bullet.json) desde la caja f1 del
//     personaje (`punto`); la bala pega con el golpe (tipo 1) de sus propios eventos (bullet.f19: 'wait'
//     en vuelo, 'dead' al chocar) usando su caja de ataque; f6 = velocidad, f33 = alcance; las balas
//     también disparan balas hijas (tipos 4/57).
//   - PROVISIONAL (inventado): ver PROVISIONAL abajo (velocidad en unidades del mundo por segundo, que
//     una bala en vuelo se para en el primer enemigo, que el ancla de la bala va en el punto de salida,
//     respaldos sin cajas, duración máxima, y que la bala vuela recta hacia donde mira el personaje).
//
// juego.js solo hace:
//   const proyectiles = await Proyectiles.cargar(renderer, personajeId, { escala, suelo });
//   proyectiles.reemplaza(p)        // la animación actual dispara: no usar el golpe inventado de tryHit
//   proyectiles.update(dt, p, enemigos, (e, rate, final) => …)   // aplica el daño (computeDamage)
//   proyectiles.quads()             // para dibujar

import { loadSSBP } from './character.js';
import { buildCharacterQuads } from './renderer.js';
import { cajasDe, rectDe, seCruzan, PIXELES_POR_UNIDAD, TIPO } from './cajas.js';
import { sonidosCruzados } from './audio/eventos.js';
import { resolverGolpe } from './defensa.js';
import { enPausa, descontarPausa } from './impacto.js';

export const TIPOS_DISPARO = [4, 57]; // 4 confirmado en D71; 57 deducido de los datos

// Todo inventado: se cambia cuando se lea en el binario (lista "Revisar en Ghidra (local)" en NOTAS.md).
export const PROVISIONAL = {
  salida: [190, 290], // si el disparo no trae caja de salida: px de la animación desde el origen
  choque: 40, // sin cajas (bala o enemigo): distancia en x a la que una bala en vuelo toca a un enemigo
  radioQuieta: 120, // sin cajas: alcance del golpe de una bala que no se mueve (efectos, explosiones)
  alcance: 1400, // si la bala no trae f33
  vidaMaxima: 4, // segundos
  fps: 30,
};

const vivo = (e) => (e.alive ?? e.hp > 0) && !e.hidden && !e.enReserva && !e.saliendo;

/** Eventos de la lista (con `cuadro`) que se cruzan al pasar del cuadro `antes` (sin incluir) a `ahora`. */
export function eventosEntre(lista, antes, ahora) {
  return (lista ?? []).filter((d) => d.cuadro > antes && d.cuadro <= ahora);
}

/** Posición de salida de una bala: la caja `punto` del disparo (o la PROVISIONAL), / 1.82 como en D51. */
export function puntoSalida(p, disparo) {
  const [dx, dy] = disparo.punto ?? PROVISIONAL.salida;
  const mira = (p.dir ?? 1) * (p.artFacing ?? 1);
  // D58: la bala sale a la profundidad de quien dispara y mide su altura desde el suelo de esa z.
  return { x: p.x + (dx * mira) / PIXELES_POR_UNIDAD, y: p.y + dy / PIXELES_POR_UNIDAD, z: p.z, suelo: p.y - (p.alt ?? 0) };
}

export function crearBala(id, ficha, { x, y, dir, z = null, suelo = null }) {
  const evs = ficha.eventos ?? {};
  // DEDUCCIÓN: 'wait' es la bala en vuelo (o el efecto quieto); si solo trae 'dead', empieza ahí.
  const fase = evs.wait || ficha.velocidad ? 'wait' : evs.dead ? 'dead' : evs.ground ? 'ground' : 'wait';
  return {
    id: Number(id), ficha, x, y, dir, sentido: dir * (Math.sign(ficha.velocidad) || 1), x0: x, z, suelo,
    fase, t: 0, cuadro: -1, vida: 0, paso: 0,
    golpeados: new Map(), // attack id -> Set de enemigos ya golpeados (un golpe por enemigo y ventana)
    hechos: new Set(), // tramos de balas hijas ya disparados
    muerta: false,
  };
}

/** Cajas de la bala en su cuadro actual ([id, tipo, x, y, ancho, alto], o null sin datos). */
export function cajasBala(b, fase = b.fase, cuadro = b.cuadro) {
  const cuadros = b.ficha.cajas?.[fase];
  return cuadros?.length ? cuadros[Math.min(Math.max(0, cuadro), cuadros.length - 1)] : null;
}

/**
 * Rectángulo en el mundo de la caja `idCaja` de la bala (null sin datos), medido como cajas.js: desde la
 * caja 1 (origen) del cuadro, / 1.82, con la bala en b.x y su altura sobre el suelo. En vuelo se alarga
 * hacia atrás lo recorrido en el paso para que una bala rápida no atraviese a un enemigo entre dos cuadros.
 */
export function rectBala(b, idCaja, suelo = 0) {
  const cajas = cajasBala(b);
  const caja = cajas?.find((c) => c[0] === idCaja);
  if (!caja) return null;
  const r = rectDe({ x: b.x, dir: b.dir, artFacing: 1 }, caja, cajas, { suelo: b.y - suelo });
  if (b.paso) {
    r.w += b.paso;
    if ((b.sentido ?? b.dir) > 0) r.x -= b.paso;
  }
  return r;
}

/**
 * ¿La caja `idCaja` de la bala toca el cuerpo de `e`? null si falta algún dato (se usa el respaldo).
 * PROVISIONAL: solo en x. Con la altura, la bala del rifle (sale del cañón, a ~137 sobre el suelo) pasa
 * por encima del lobo (cuerpo hasta ~99), y en el juego le pega: o no mira la altura, o la bala apunta.
 */
export function tocaCaja(b, idCaja, e, suelo = 0, ids = null) {
  const r = rectBala(b, idCaja, b.suelo ?? suelo);
  const cd = cajasDe(e);
  const cuerpos = cd?.filter((c) => ids ? ids.has(c[0]) : c[1] === TIPO.CUERPO) ?? [];
  if (!r || !cuerpos.length) return null;
  return cuerpos.some((c) => {
    const k = rectDe(e, c, cd, { suelo: e.alt ?? 0 });
    return seCruzan(r, { ...k, y: r.y, h: r.h });
  });
}

// D71: defensa con la caja y recorrido de la bala; dirección fijada al disparar.
// Conserva el choque horizontal provisional de D48, también en las cajas de parada.
export function resolverImpactoBala(b, g, defensor) {
  const dir = b.sentido ?? b.dir;
  const atq = { x: b.x - dir * Math.max(b.paso, 0.001), dir, z: b.z };
  return resolverGolpe(atq, g, defensor, { reduccion: defensor.reduccion,
    choque: (ids) => tocaCaja(b, g.caja, defensor, b.suelo ?? 0, ids) ?? (ids ? false : true) });
}

/**
 * Avanza una bala. `numFrames(fase)` = cuadros de esa animación en su .ssbp (o null si no la tiene);
 * `toca(b, idCaja, e)` = choque por cajas (true/false, o null sin datos). Devuelve las balas hijas que
 * dispara en este paso: [{ id, x, y, dir }].
 */
export function moverBala(b, dt, foes, golpear, numFrames = () => null, toca = () => null) {
  const f = b.ficha;
  const hijas = [];
  b.vida += dt;
  const enVuelo = b.fase === 'wait' && Boolean(f.velocidad);
  b.paso = enVuelo ? Math.abs(f.velocidad) * dt : 0;
  if (enVuelo) b.x += b.paso * b.sentido;

  // Cuadro actual (el tiempo avanza después: el cuadro 0 también cuenta) y primer cuadro sin revisar.
  const n = numFrames(b.fase) ?? ultimoCuadro(f.eventos?.[b.fase]) + 1;
  let cuadro = Math.floor(b.t * PROVISIONAL.fps);
  let desdeCuadro = b.cuadro + 1;
  b.t += dt;
  if (cuadro >= n) {
    if (enVuelo) {
      cuadro %= n; // en vuelo la animación se repite
      desdeCuadro = 0;
    } else if (b.fase === 'wait' && numFrames('dead')) {
      cambiarFase(b, 'dead');
      b.t = dt;
      cuadro = desdeCuadro = 0;
    } else {
      b.muerta = true;
      return hijas;
    }
  }
  if (desdeCuadro > cuadro) desdeCuadro = cuadro;
  b.cuadro = cuadro;

  for (const [desde, hasta, tipo, ref, caja] of f.eventos?.[b.fase] ?? []) {
    if (desde > cuadro || hasta < desdeCuadro) continue; // ventana del evento fuera de los cuadros de este paso
    if (tipo === 1) {
      const ya = b.golpeados.get(ref) ?? new Set();
      b.golpeados.set(ref, ya);
      const atk = f.ataques?.[ref] ?? { mult: f.multiplicador ?? 1, final: false };
      const tocados = foes.filter((e) => {
        if (!vivo(e) || ya.has(e)) return false;
        // D58 (PROVISIONAL: como el golpe cuerpo a cuerpo, FUN_0083fbb0): |dz| < attack.f8 + radio.
        if (b.z != null && atk.prof != null && Math.abs((e.z ?? 0) - b.z) >= atk.prof + (e.radio ?? 0)) return false;
        const r = toca(b, caja, e);
        if (r !== null) return r;
        const dx = (e.x - b.x) * b.sentido;
        return enVuelo ? dx >= -PROVISIONAL.choque - b.paso && dx <= PROVISIONAL.choque : Math.abs(dx) <= PROVISIONAL.radioQuieta;
      });
      if (!tocados.length) continue;
      if (enVuelo) {
        // PROVISIONAL: la bala en vuelo se para en el primer enemigo que toca (el más atrás en su recorrido).
        const e = tocados.reduce((a, c) => ((c.x - a.x) * b.sentido < 0 ? c : a));
        ya.add(e);
        golpear(e, atk.mult, atk.final, { ...atk, caja }, b);
        cambiarFase(b, 'dead');
        if (!numFrames('dead') && !f.eventos?.dead) b.muerta = true;
        return hijas;
      }
      for (const e of tocados) {
        ya.add(e);
        golpear(e, atk.mult, atk.final, { ...atk, caja }, b);
      }
    } else if (TIPOS_DISPARO.includes(tipo)) {
      const clave = `${b.fase}:${desde}:${ref}:${caja}`;
      if (b.hechos.has(clave)) continue;
      b.hechos.add(clave);
      hijas.push({ id: ref, x: b.x, y: b.y, dir: b.dir, z: b.z, suelo: b.suelo });
    }
  }

  const alcance = f.alcance ?? PROVISIONAL.alcance;
  if ((enVuelo && Math.abs(b.x - b.x0) >= alcance) || b.vida >= PROVISIONAL.vidaMaxima) b.muerta = true;
  return hijas;
}

function cambiarFase(b, fase) {
  b.fase = fase;
  b.t = 0;
  b.cuadro = -1;
  b.paso = 0;
}

function ultimoCuadro(tramos) {
  return Math.max(9, ...(tramos ?? []).map((t) => t[1]));
}

export class Proyectiles {
  /**
   * @param {SSRenderer} renderer
   * @param {string|number} personajeId  character.f0
   * @param {object} [o]
   * @param {number} [o.escala]  escala de dibujo (la de los personajes)
   * @param {number} [o.suelo]   y del suelo del jugador (para medir alturas como cajas.js)
   */
  static async cargar(renderer, personajeId, { escala = 1, suelo = 0, enemigo = false } = {}) {
    const pr = new Proyectiles(renderer, escala, suelo);
    if (personajeId == null) return pr;
    try {
      const r = await fetch(rutaWeb(`/data/${enemigo ? 'proyectiles_enemigos' : 'proyectiles'}/${personajeId}.json`));
      if (r.ok) Object.assign(pr.datos, await r.json());
    } catch (e) {
      console.warn('proyectiles: sin datos para', personajeId, e);
    }
    // Precarga las animaciones de todas las balas que puede disparar (incluidas las hijas).
    const carpetas = new Set(Object.values(pr.datos.balas).map((f) => f.animacion).filter(Boolean));
    await Promise.all([...carpetas].map((c) => pr.cargarAnimacion(c)));
    return pr;
  }

  constructor(renderer, escala = 1, suelo = 0) {
    this.renderer = renderer;
    this.escala = escala;
    this.suelo = suelo;
    this.datos = { disparos: {}, balas: {} };
    this.anims = new Map(); // carpeta -> { ssbp, textures, porNombre: Map(nombre -> { pack, anim }) }
    this.balas = [];
    this.seguimiento = { anim: null, tiempo: 0, cuadro: -1 };
    this.disparadas = 0; // contador para depurar/pruebas
  }

  // Catálogo y texturas compartidos; balas y seguimiento independientes por actor.
  instanciar() {
    const pr = new Proyectiles(this.renderer, this.escala, this.suelo);
    pr.datos = this.datos;
    pr.anims = this.anims;
    pr.alSonido = this.alSonido;
    return pr;
  }

  reiniciar() {
    this.balas = [];
    this.seguimiento = { anim: null, tiempo: 0, cuadro: -1 };
  }

  async cargarAnimacion(carpeta) {
    try {
      const { ssbp, textures } = await loadSSBP(this.renderer, `ss/bullet/${carpeta}`);
      const porNombre = new Map();
      for (const pack of ssbp.packs) for (const anim of pack.anims) if (!porNombre.has(anim.name)) porNombre.set(anim.name, { pack, anim });
      this.anims.set(carpeta, { ssbp, textures, porNombre });
    } catch (e) {
      console.warn(`proyectiles: no se pudo cargar ss/bullet/${carpeta}`, e);
    }
  }

  /** true si la animación actual del personaje dispara (sus balas reemplazan el golpe inventado). */
  reemplaza(p) {
    return Boolean(p.anim && this.datos.disparos[p.anim.name]);
  }

  disparar(id, pos) {
    const ficha = this.datos.balas[id];
    if (!ficha) return;
    this.balas.push(crearBala(id, ficha, pos));
    this.disparadas++;
  }

  /**
   * @param {number} dt
   * @param {Character} p  el jugador (después de p.update(dt): p.frame es el cuadro actual)
   * @param {Character[]} foes
   * @param {(e, rate: number, final: boolean, atk) => void} golpear  aplica un golpe de bala (atk.tipo: D61)
   */
  update(dt, p, foes, golpear, { emitir = true } = {}) {
    if (emitir) this.seguirAnimacion(p);
    const toca = (b, caja, e) => tocaCaja(b, caja, e, this.suelo);
    for (let i = 0; i < this.balas.length; i++) {
      const b = this.balas[i];
      if (enPausa(b)) { descontarPausa(b, dt); continue; }
      const faseAntes = b.fase, tiempoAntes = b.t;
      const hijas = moverBala(b, dt, foes, golpear, (fase) => this.cuadrosDe(b, fase), toca);
      // Terminar de cruzar la fase anterior antes de emitir el cuadro cero de la nueva.
      // El choque/fin puede cambiar de fase dentro de moverBala, incluso saltando varios cuadros.
      const emitir = (fase, tiempo) => {
        const se = b.ficha.sonidos?.[fase];
        if (!se?.sonidos || !this.alSonido) return;
        const fps = se.fps ?? PROVISIONAL.fps;
        const ahora = tiempo * fps;
        const antes = b._faseAudio === fase ? b._cuadroAudio : -1;
        const n = (this.cuadrosDe(b, fase) ?? ultimoCuadro(b.ficha.eventos?.[fase]) + 1) * fps / PROVISIONAL.fps;
        for (const s of sonidosCruzados(se.sonidos, antes, ahora, n, fase === 'wait' && Boolean(b.ficha.velocidad))) this.alSonido(s.id, s.tipo);
        b._faseAudio = fase; b._cuadroAudio = ahora;
      };
      emitir(faseAntes, tiempoAntes);
      if (b.fase !== faseAntes && !b.muerta) emitir(b.fase, 0);
      for (const h of hijas) this.disparar(h.id, h);
    }
    this.balas = this.balas.filter((b) => !b.muerta);
  }

  // Dispara las balas de los eventos de la animación del personaje al pasar por sus cuadros.
  seguirAnimacion(p) {
    const s = this.seguimiento;
    if (!p.anim) return;
    if (p.anim !== s.anim || p.time < s.tiempo) {
      s.anim = p.anim;
      s.cuadro = -1;
    }
    s.tiempo = p.time;
    const disparos = this.datos.disparos[p.anim.name];
    if (!disparos || p.frame === s.cuadro) return;
    for (const d of eventosEntre(disparos, s.cuadro, p.frame)) this.disparar(d.bala, { ...puntoSalida(p, d), dir: p.dir });
    s.cuadro = p.frame;
  }

  cuadrosDe(b, fase) {
    return this.anims.get(b.ficha.animacion)?.porNombre.get(fase)?.anim.numFrames ?? null;
  }

  quads() {
    const out = [];
    for (const b of this.balas) {
      const a = this.anims.get(b.ficha.animacion);
      const e = a?.porNombre.get(b.fase);
      if (!e || b.cuadro < 0) continue;
      const cuadro = Math.min(b.cuadro, e.anim.numFrames - 1);
      // La posición de la bala es la de su caja 1 (origen), como la x lógica de un personaje es su raíz.
      const o = cajasBala(b, b.fase, cuadro)?.find((c) => c[0] === 1) ?? [1, 1, 0, 0];
      out.push(...buildCharacterQuads(a.ssbp, a.textures, e.pack, e.anim, cuadro, {
        x: b.x - (o[2] * b.dir) / PIXELES_POR_UNIDAD, y: b.y - o[3] / PIXELES_POR_UNIDAD, scale: this.escala, flipX: b.dir < 0,
      }));
    }
    return out;
  }
}
