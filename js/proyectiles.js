import { rutaWeb } from './rutas.js';
// Proyectiles de personajes y enemigos (D48/D71/D72). Exportador compartido entre Node y OPFS.
// Datos: proyectiles/<personaje>.json y proyectiles_enemigos/<maestro>.json.
//
// Qué está leído y qué no:
//   - CONFIRMADO (Ghidra, D47/D51): en los eventos por cuadro (character.f18) el tipo 1 es un golpe
//     (f3 = attack.json, f1 = caja de la animación); las cajas se miden como en cajas.js (/ 1.82).
//   - CONFIRMADO (Ghidra, D71): evento 4 → virtual 0x220 → FUN_00840760; creación con el actor emisor,
//     salida /1.82 (FUN_00840664), y golpe de bala por FUN_0083fbb0 como los actores.
//   - CONFIRMADO (D72): velocidad/aceleración 3D, fases por f3, contador f39, vida f18, suelo f20/f26,
//     escala f21, ángulo de caja, profundidad de evento4 y posición absoluta de evento87.
//   - D73: evento57 configura apuntado, no emite otra bala. Las rutas 4/87 emiten; f22–25 teledirigen.
//     Selección por rayo y filtros/HP de choque entre balas. Gráfica del gestor57 todavía pendiente.
//   - PROVISIONAL: respaldos cuando faltan cajas y compatibilidad con catálogos anteriores a v4.
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
import { parametrosSeguimiento, orientarTeledirigida } from './teledireccion.js';
import { resolverColisionesBalas } from './colision_balas.js';
import { configurarApuntado57, actualizarApuntado57, alcanceApuntado57 } from './apuntado_proyectiles.js';
import { reflejarBala } from './reflexion_proyectiles.js';
import { nivelCargaRifle } from './carga_rifle.js';
import { rotacionArma57 } from './rotacion_arma.js';

export const TIPOS_DISPARO = [4, 57, 87];

// Respaldos sin datos y compatibilidad anterior a v4. Los catálogos actuales usan ficha.fisica.
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
  if (disparo.tipo === 87) {
    const suelo = p.suelo ?? p.y - (p.alt ?? 0);
    return { x: Math.trunc(disparo.vec2?.[0] ?? 0), y: Math.trunc(disparo.vec2?.[1] ?? 0) + suelo, z: -(disparo.f4 ?? 0), suelo };
  }
  const [dx, dy, angulo = 0] = disparo.punto ?? PROVISIONAL.salida;
  const mira = (p.dir ?? 1) * (p.artFacing ?? 1);
  const escala = p.ficha?.fisica?.escala ?? 1;
  // D58: la bala sale a la profundidad de quien dispara y mide su altura desde el suelo de esa z.
  return { x: p.x + (dx * mira * escala) / PIXELES_POR_UNIDAD, y: p.y + dy * escala / PIXELES_POR_UNIDAD,
    z: (p.z ?? 0) + (disparo.tipo === 4 ? disparo.f4 ?? 0 : 0), suelo: p.suelo ?? p.y - (p.alt ?? 0), angulo };
}

export function crearBala(id, ficha, { x, y, dir, z = null, suelo = null, angulo = 0, anguloHeredado = 0, emisor = null, objetivo = null, equipo = null, nivelCarga = 1 }) {
  const evs = ficha.eventos ?? {};
  // FUN_00821550: tipo1 appear; 2/4 wait; 3 dead; 5 ground. Respaldo para catálogos antiguos.
  const fis = ficha.fisica;
  const fase = fis ? ({ 1: 'appear', 2: 'wait', 3: 'dead', 4: 'wait', 5: 'ground' }[fis.tipo] ?? 'wait')
    : evs.wait || ficha.velocidad ? 'wait' : evs.dead ? 'dead' : evs.ground ? 'ground' : 'wait';
  let [vx, vy, vz] = fis?.velocidad ?? [ficha.velocidad ?? 0, 0, 0];
  vx *= dir;
  const anguloSalida = angulo * Math.PI / 180 + (ficha.crudo?.f46 ? anguloHeredado : 0);
  const rad = anguloSalida * dir;
  [vx, vy] = [vx * Math.cos(rad) - vy * Math.sin(rad), vy * Math.cos(rad) + vx * Math.sin(rad)];
  const offset = fis?.offset ?? [0, 0, 0];
  x += offset[0]; y += offset[1]; z = (z ?? 0) + offset[2];
  const bala = {
    id: Number(id), ficha, x, y, dir, sentido: dir * (Math.sign(ficha.velocidad) || 1), x0: x, z, suelo,
    fase, t: 0, cuadro: -1, vida: 0, paso: 0, vx, vy, vz, z0: z, impactos: 0, tiempoSuelo: 0,
    emisor, objetivo, offsetEmisor: emisor ? [x - emisor.x, z - (emisor.z ?? 0)] : null,
    hp: fis?.hp ?? ficha.crudo?.f12 ?? 0, equipo, cuerpos: new Set(), anguloSalida, nivelCarga,
    objetivoSeguimiento: parametrosSeguimiento(ficha).giro > 0 ? objetivo : null, tiempoSeguimiento: 0,
    artFacing: fis?.artFacing ?? 1,
    golpeados: new Map(), // attack id -> Set de enemigos ya golpeados (un golpe por enemigo y ventana)
    hechos: new Set(), // tramos de balas hijas ya disparados
    muerta: false, agotada: false, activas: new Map(),
  };
  apuntarBala(bala, objetivo);
  return bala;
}

// Tamaño físico actualizado desde las cajas de cuerpo; respaldo explícito mientras no se exporte +0x28.
export function centroObjetivoBala(u) {
  const cuerpos = (cajasDe(u) ?? []).filter((c) => c[1] === TIPO.CUERPO);
  const alto = u.altoFisico ?? (cuerpos.length ? Math.max(...cuerpos.map((c) => c[5])) / PIXELES_POR_UNIDAD : 0);
  return [u.x, (u.alt ?? u.y - (u.suelo ?? 0)) + alto / 2, u.z ?? 0];
}

// FUN_00840760: f34 permite orientar x/z; f35 corrige vy para llegar a media altura
// del objetivo compensando su aceleración vertical. Solo dentro de la tolerancia en grados.
export function apuntarBala(b, objetivo) {
  const fis = b.ficha.fisica;
  if (!fis || !objetivo || !vivo(objetivo)) return;
  const dx = objetivo.x - b.x, dz = (objetivo.z ?? 0) - b.z;
  if (dx * b.vx <= 0) return;
  const toleranciaZ = fis.apuntarZ * Math.PI / 180;
  const angZ = Math.atan2(dz, Math.abs(dx));
  if (fis.apuntarZ > 0 && Math.abs(angZ - Math.atan2(b.vz, Math.abs(b.vx))) < toleranciaZ) {
    const velocidad = Math.hypot(b.vx, b.vz), distancia = Math.hypot(dx, dz);
    b.vx = velocidad * dx / distancia; b.vz = velocidad * dz / distancia;
  }
  if (fis.apuntarY > 0 && b.vx) {
    const cajas = cajasDe(objetivo), cuerpos = cajas?.filter((c) => c[1] === TIPO.CUERPO) ?? [];
    const rs = cuerpos.map((c) => rectDe(objetivo, c, cajas, { suelo: objetivo.alt ?? 0 }));
    const altura = fis.apuntarSuelo ? 0 : rs.length ? (Math.min(...rs.map((r) => r.y)) + Math.max(...rs.map((r) => r.y + r.h))) / 2 : (objetivo.alt ?? 0);
    const dy = altura - (b.y - (b.suelo ?? 0));
    if (Math.abs(Math.atan2(dy, Math.abs(dx)) - Math.atan2(b.vy, Math.abs(b.vx))) < fis.apuntarY * Math.PI / 180) {
      const tiempo = Math.abs(dx / b.vx);
      b.vy = (dy - tiempo * tiempo * (fis.aceleracion?.[1] ?? 0) / 2) / tiempo;
    }
  }
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
  const r = rectDe(b, caja, cajas, { suelo: b.y - suelo, escala: b.ficha.fisica?.escala ?? 1 });
  if (b.paso && !b.ficha.fisica) {
    r.w += b.paso;
    if ((b.sentido ?? b.dir) > 0) r.x -= b.paso;
  }
  return r;
}

/**
 * ¿La caja `idCaja` de la bala toca el cuerpo de `e`? null si falta algún dato (se usa el respaldo).
 * D72: intersección en x/altura, igual que FUN_0083fbb0. El barrido del port evita atravesar cuerpos
 * entre pasos; usa el segmento real, sin ampliar toda una diagonal a un rectángulo.
 */
export function tocaCaja(b, idCaja, e, suelo = 0, ids = null) {
  const r = rectBala(b, idCaja, b.suelo ?? suelo);
  const cd = cajasDe(e);
  const cuerpos = cd?.filter((c) => ids ? ids.has(c[0]) : c[1] === TIPO.CUERPO) ?? [];
  if (!r || !cuerpos.length) return null;
  return cuerpos.some((c) => {
    const k = rectDe(e, c, cd, { suelo: e.alt ?? 0 });
    if (seCruzan(r, k)) return true;
    if (!b.anterior) return false;
    return segmentoRect(b.anterior.x - b.x + r.x + r.w / 2,
      b.anterior.alt - (b.y - (b.suelo ?? suelo)) + r.y + r.h / 2,
      r.x + r.w / 2, r.y + r.h / 2, { x: k.x - r.w / 2, y: k.y - r.h / 2, w: k.w + r.w, h: k.h + r.h });
  });
}

// La caja de parada suele sobresalir del cuerpo: puede interceptar antes de que lo toque.
export function tocaDefensasBala(b, caja, e, suelo = 0) {
  const g = b.ficha.ataques?.[b.activas.get(caja) ?? b.ficha.ataque] ?? {};
  const d = e.defensa;
  const profundidad = g.prof == null ? Infinity : g.prof * (b.ficha.fisica?.escala ?? 1);
  const dz = Math.abs((e.z ?? 0) - (b.z ?? 0));
  if (d?.parada?.size && dz <= profundidad + (d.radioParada || e.radio || 0) &&
      tocaCaja(b, caja, e, suelo, d.parada)) return true;
  if (g.parable && d?.auto?.size && dz <= profundidad + (d.radioAuto || e.radio || 0) &&
      tocaCaja(b, caja, e, suelo, d.auto)) return true;
  if (dz >= profundidad + (e.radio ?? 0)) return false;
  return tocaCaja(b, caja, e, suelo);
}

function segmentoRect(x0, y0, x1, y1, r) {
  let desde = 0, hasta = 1;
  for (const [origen, delta, min, max] of [[x0, x1 - x0, r.x, r.x + r.w], [y0, y1 - y0, r.y, r.y + r.h]]) {
    if (!delta) { if (origen < min || origen > max) return false; continue; }
    const a = (min - origen) / delta, b = (max - origen) / delta;
    desde = Math.max(desde, Math.min(a, b)); hasta = Math.min(hasta, Math.max(a, b));
    if (desde > hasta) return false;
  }
  return true;
}

// D71: defensa con la caja y recorrido de la bala; dirección fijada al disparar.
// D72: cuerpo y parada comprueban también altura.
export function resolverImpactoBala(b, g, defensor) {
  const dir = b.sentido ?? b.dir;
  const atq = { x: b.x - dir * Math.max(b.paso, 0.001), dir, z: b.z };
  return resolverGolpe(atq, { ...g, prof: g.prof == null ? g.prof : g.prof * (b.ficha.fisica?.escala ?? 1) }, defensor, { reduccion: defensor.reduccion,
    choque: (ids) => tocaCaja(b, g.caja, defensor, b.suelo ?? 0, ids) ?? (ids ? false : true) });
}

// 008395f0 -> 008221f0: la parada puede reflejar o restar HP; no mata siempre la bala.
export function responderParadaBala(b, defensor, g, opciones = {}) {
  const reflejo = reflejarBala(b, defensor, g, opciones);
  if (reflejo) return reflejo;
  if (g.tipo === 1 && g.parable && b.hp > 0 && !b.muerta && !b.agotada &&
      (b.fase === 'wait' || (b.fase === 'appear' && !b.ficha.fisica?.sinImpactoAppear))) {
    // Getter308 de BattleBullet devuelve10 contra actores; getter310 base del actor =1.
    b.hp = Math.max(0, b.hp - 10);
    if (!b.hp) agotarBala(b);
  }
  return { cortar: true, consumirImpacto: false, reflejada: false };
}

/**
 * Avanza una bala. `numFrames(fase)` = cuadros de esa animación en su .ssbp (o null si no la tiene);
 * `toca(b, idCaja, e)` = choque por cajas (true/false, o null sin datos). Devuelve las balas hijas que
 * dispara en este paso: [{ id, x, y, dir }].
 */
export function moverBala(b, dt, foes, golpear, numFrames = () => null, toca = () => null) {
  if (b.ficha.fisica) return moverBalaOriginal(b, dt, foes, golpear, numFrames, toca);
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
        const respuesta = golpear(e, atk.mult, atk.final, { ...atk, caja }, b);
        if (respuesta?.cortar || respuesta?.consumirImpacto === false) return hijas;
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

// D72: FUN_00823260 integra p += v·dt + a·dt²/2, v += a·dt. FUN_00821240/008236fc
// resuelven alcance, suelo y fases; FUN_00821ffc cuenta impactos, sin limitar siempre al primer cuerpo.
function moverBalaOriginal(b, dt, foes, golpear, numFrames, toca) {
  const f = b.ficha, fis = f.fisica, hijas = [];
  if (b.fase === 'appear' && numFrames('appear') == null && !f.eventos?.appear) cambiarFase(b, 'wait');
  if (b.agotada && b.fase === 'wait') cambiarFase(b, 'dead');
  b.anterior = { x: b.x, alt: b.y - (b.suelo ?? 0) };
  b.vida += dt;
  if (!b.agotada) {
    const sigue = orientarTeledirigida(b, dt, centroObjetivoBala);
    const [ax = 0, ay = 0, az = 0] = fis.aceleracion ?? [];
    // Con objetivo, 00823260 delega al integrador del actor (gravedad inicial de bala = 0).
    // La aceleración ya se incorporó al orientar; no se suma por segunda vez.
    b.x += b.vx * dt + (sigue ? 0 : ax * b.dir * dt * dt / 2);
    b.y += b.vy * dt + (sigue ? 0 : ay * dt * dt / 2);
    b.z += b.vz * dt + (sigue ? 0 : az * dt * dt / 2);
    if (!sigue) { b.vx += ax * b.dir * dt; b.vy = Math.max(-1980, b.vy + ay * dt); b.vz += az * dt; }
    if (!sigue && fis.seguimiento === 2 && b.emisor) {
      b.x = b.emisor.x + b.offsetEmisor[0]; b.z = (b.emisor.z ?? 0) + b.offsetEmisor[1];
    }
    if (b.y <= (b.suelo ?? 0)) {
      b.y = b.suelo ?? 0;
      if (b.vy <= 0) {
        if (fis.pararEnSuelo) b.vx = b.vy = b.vz = 0;
        if (fis.tiempoSuelo > 0 && (b.tiempoSuelo += dt) >= fis.tiempoSuelo) b.muerta = true;
        if (b.fase === 'wait' && fis.suelo) cambiarFase(b, 'ground');
      }
    }
    if (f.alcance > 0 && Math.hypot(b.x - b.x0, b.z - b.z0) > f.alcance) agotarBala(b, fis.borrarAlAlcance ? 'disappear' : 'dead');
    if (fis.vida > 0 && b.vida > fis.vida) agotarBala(b);
  }
  b.paso = Math.abs(b.x - b.anterior.x);
  b.sentido = Math.sign(b.vx) || b.sentido;
  if (b.muerta) return hijas;
  const fps = f.sonidos?.[b.fase]?.fps ?? PROVISIONAL.fps;
  const n = numFrames(b.fase) ?? ultimoCuadro(f.eventos?.[b.fase]) + 1;
  let cuadro = Math.floor((b.t + dt) * fps + 1e-9);
  let desde = b.cuadro + 1;
  if (desde >= n) {
    const paso = b.paso;
    if (b.fase === 'appear') cambiarFase(b, 'wait');
    else if (b.fase === 'wait' || (b.fase === 'ground' && fis.tiempoSuelo > 0)) cambiarFase(b, b.fase);
    else { b.muerta = true; return hijas; }
    b.paso = paso;
    dt = 0; cuadro = 0; desde = 0; // conservar el recorrido de este paso al entrar/repetir fase
  }
  cuadro = Math.min(cuadro, n - 1); b.t += dt; b.cuadro = cuadro;
  for (const ev of f.funcionales?.[b.fase] ?? []) {
    if (ev.cuadro < desde || ev.cuadro > cuadro) continue;
    if (ev.tipo === 10) { b.vx = (ev.vec2?.[0] ?? 0) * b.dir; b.vy = ev.vec2?.[1] ?? 0; b.vz = 0; }
    if (ev.tipo === 1) b.activas.set(ev.caja, ev.f3);
    if (ev.tipo === 2) { b.activas.clear(); b.golpeados.clear(); }
    if (ev.tipo === 3) b.cuerpos.add(ev.caja);
  }
  const fase = b.fase;
  for (const [inicio, fin, tipo, ref, caja, f4 = 0, vec2] of f.eventos?.[fase] ?? []) {
    if (inicio > cuadro || fin < Math.min(desde, cuadro)) continue;
    if (tipo === 1) {
      if (f.funcionales?.[fase] && b.activas.get(caja) !== ref) continue;
      const clave = `${fase}:${inicio}:${ref}:${caja}`;
      const ya = b.golpeados.get(clave) ?? new Set(); b.golpeados.set(clave, ya);
      const atk = f.ataques?.[ref] ?? { mult: f.multiplicador ?? 1 };
      const tocados = foes.filter((e) => {
        if (!vivo(e) || ya.has(e)) return false;
        const radio = Math.max(e.radio ?? 0, e.defensa?.parada?.size ? e.defensa.radioParada ?? e.radio ?? 0 : 0,
          atk.parable && e.defensa?.auto?.size ? e.defensa.radioAuto ?? e.radio ?? 0 : 0);
        if (atk.prof != null && Math.abs((e.z ?? 0) - b.z) > atk.prof * (fis.escala ?? 1) + radio) return false;
        const choque = toca(b, caja, e);
        if (choque !== null) return choque;
        return Math.abs(e.x - b.x) <= PROVISIONAL.choque + b.paso;
      }).sort((a, c) => (a.x - c.x) * b.sentido);
      for (const e of tocados) {
        ya.add(e);
        const respuesta = golpear(e, atk.mult, atk.final, { ...atk, caja }, b);
        if (respuesta?.cortar) break;
        if (b.muerta) break;
        if (respuesta?.consumirImpacto !== false && fis.impactos > 0 && (fase === 'wait' || (fase === 'appear' && !fis.sinImpactoAppear))) {
          b.impactos++;
          if (b.impactos >= fis.impactos) { agotarBala(b); break; }
        }
      }
    } else if (TIPOS_DISPARO.includes(tipo)) {
      const clave = `${fase}:${inicio}:${ref}:${caja}:${f4}`;
      if (b.hechos.has(clave)) continue; b.hechos.add(clave);
      const cajas = cajasBala(b, fase, inicio) ?? [];
      const salida = cajas.find((c) => c[0] === caja), origen = cajas.find((c) => c[0] === 1) ?? [1, 1, 0, 0];
      const punto = salida ? [salida[2] - origen[2], salida[3] - origen[3], salida[6] ?? 0] : null;
      if (tipo === 57) continue; // El gestor 57 pertenece al actor; no es una emisión de bala hija.
      hijas.push({ id: ref, ...puntoSalida(b, { tipo, punto, f4, vec2 }), dir: b.dir, anguloHeredado: b.anguloSalida, emisor: b.emisor, objetivo: b.objetivo });
    }
  }
  return hijas;
}

function agotarBala(b, fase = 'dead') {
  b.agotada = true;
  b.hp = 0;
  if (b.ficha.fisica.pararAlMorir) b.vx = b.vy = b.vz = 0;
  if (b.fase === 'appear' && b.ficha.fisica.sinImpactoAppear) return;
  if (!['ground', 'dead', 'disappear'].includes(b.fase)) cambiarFase(b, fase);
}

function cambiarFase(b, fase) {
  b.fase = fase;
  b.t = 0;
  b.cuadro = -1;
  b.paso = 0;
  b.hechos.clear();
  b.activas?.clear();
  b.cuerpos?.clear();
}

export function colisionarProyectiles(gestores) {
  return resolverColisionesBalas(gestores.flatMap((pr) => pr.balas).filter((b) => !enPausa(b)), { agotar: agotarBala });
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
    pr.equipo = enemigo ? 'enemigo' : 'jugador';
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
    pr.limites = this.limites;
    pr.sueloDe = this.sueloDe;
    pr.equipo = this.equipo;
    return pr;
  }

  reiniciar() {
    this.balas = [];
    this.seguimiento = { anim: null, tiempo: 0, cuadro: -1 };
    this.apuntado = null;
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

  // BattleCharacter 0082790c: el rifle (arma6) conserva la preparación al terminar;
  // la liberación usa la animación que contiene el evento4, no el evento57 de preparar.
  preparaApuntado(p) {
    const disparos = this.datos.disparos[p.anim?.name] ?? [];
    return (p.arma ?? p.pj?.arma) === 6 && disparos.some((d) => d.tipo === 57) &&
      !disparos.some((d) => d.tipo === 4 || d.tipo === 87);
  }

  disparar(id, pos) {
    const ficha = this.datos.balas[id];
    if (!ficha) return;
    this.balas.push(crearBala(id, ficha, { ...pos, equipo: pos.equipo ?? this.equipo }));
    this.disparadas++;
  }

  /**
   * @param {number} dt
   * @param {Character} p  el jugador (después de p.update(dt): p.frame es el cuadro actual)
   * @param {Character[]} foes
   * @param {(e, rate: number, final: boolean, atk) => void} golpear  aplica un golpe de bala (atk.tipo: D61)
   */
  update(dt, p, foes, golpear, { emitir = true, objetivosBala = null } = {}) {
    if (emitir) this.seguirAnimacion(p, foes, enPausa(p) ? 0 : dt);
    const toca = (b, caja, e) => tocaDefensasBala(b, caja, e, b.suelo ?? this.suelo);
    const existentes = this.balas.length;
    for (let i = 0; i < existentes; i++) {
      const b = this.balas[i];
      if (enPausa(b)) { descontarPausa(b, dt); continue; }
      const faseAntes = b.fase, tiempoAntes = b.t;
      const blancos = objetivosBala ? objetivosBala(b) : foes;
      const hijas = moverBala(b, dt, blancos, golpear, (fase) => this.cuadrosDe(b, fase), toca);
      if (this.sueloDe) {
        const suelo = this.sueloDe(b.z);
        b.y += suelo - (b.suelo ?? suelo); b.suelo = suelo;
      }
      const limites = this.limites?.();
      if (limites && ((b.x < limites.xMin && b.vx < 0) || (b.x > limites.xMax && b.vx > 0) ||
        ((b.z < limites.zMin || b.z > limites.zMax) && b.y <= (b.suelo ?? 0)))) b.muerta = true;
      // Terminar de cruzar la fase anterior antes de emitir el cuadro cero de la nueva.
      // El choque/fin puede cambiar de fase dentro de moverBala, incluso saltando varios cuadros.
      const emitir = (fase, tiempo) => {
        const se = b.ficha.sonidos?.[fase];
        if (!se?.sonidos || !this.alSonido) return;
        const fps = se.fps ?? PROVISIONAL.fps;
        const ahora = tiempo * fps;
        const antes = b._faseAudio === fase ? b._cuadroAudio : -1;
        const n = (this.cuadrosDe(b, fase) ?? ultimoCuadro(b.ficha.eventos?.[fase]) + 1) * fps / PROVISIONAL.fps;
        for (const s of sonidosCruzados(se.sonidos, antes, ahora, n, fase === 'wait' && (Boolean(b.ficha.fisica) || Boolean(b.ficha.velocidad)))) this.alSonido(s.id, s.tipo);
        b._faseAudio = fase; b._cuadroAudio = ahora;
      };
      emitir(faseAntes, tiempoAntes);
      if (b.fase !== faseAntes && !b.muerta) emitir(b.fase, 0);
      for (const h of hijas) this.disparar(h.id, { ...h, equipo: b.equipo });
    }
    this.balas = this.balas.filter((b) => !b.muerta);
  }

  // Dispara las balas de los eventos de la animación del personaje al pasar por sus cuadros.
  seguirAnimacion(p, foes = [], dt = 0) {
    const s = this.seguimiento;
    if (!p.anim) return;
    if (p.anim !== s.anim || p.time < s.tiempo) {
      s.anim = p.anim;
      s.cuadro = -1;
    }
    s.tiempo = p.time;
    const disparos = this.datos.disparos[p.anim.name];
    const vivos = foes.filter(vivo);
    const objetivo = vivos.filter((e) => (e.x - p.x) * p.dir > 0)
      .sort((a, b) => Math.hypot(a.x - p.x, (a.z ?? 0) - (p.z ?? 0)) - Math.hypot(b.x - p.x, (b.z ?? 0) - (p.z ?? 0)))[0];
    if (['wait', 'run', 'dead', 'hurt'].includes(p.anim.name)) this.apuntado = null;
    for (const d of eventosEntre(disparos, s.cuadro, p.frame)) {
      const salida = puntoSalida(p, d);
      if (d.tipo === 57) this.apuntado = configurarApuntado57(d, p, salida, this.apuntado);
      else {
        const nivelCarga = nivelCargaRifle(this.apuntado?.tiempoObjetivo ?? 0, {
          arma: p.arma ?? p.pj?.arma, motion: p.state === 'skill' ? 10 : 9,
          ajusteTiempo: this.apuntado?.ajusteTiempo ?? 0,
        });
        this.disparar(d.bala, { ...salida, dir: p.dir, emisor: p, objetivo, nivelCarga });
        this.apuntado = null;
      }
    }
    if (this.apuntado) actualizarApuntado57(this.apuntado, { x: p.x, y: p.alt ?? p.y - (p.suelo ?? 0), z: p.z }, vivos, {
      ficha: this.datos.balas[this.apuntado.bala], alcance: alcanceApuntado57(disparos, this.datos.balas),
      geometria: geometriaObjetivoBala, preferido: objetivo, dt, conservarTiempo: p.state === 'attack' || p.state === 'skill',
    });
    p.apuntado57 = this.apuntado;
    // Mantener la orientación durante la salida; quitarla al dejar el ataque.
    if (this.apuntado) p.rotacionArma57 = rotacionArma57(this.apuntado, p);
    else if (p.state !== 'attack') p.rotacionArma57 = null;
    p.nivelCargaRifle = nivelCargaRifle(this.apuntado?.tiempoObjetivo ?? 0, {
      arma: p.arma ?? p.pj?.arma, motion: p.state === 'skill' ? 10 : 9,
      ajusteTiempo: this.apuntado?.ajusteTiempo ?? 0,
    });
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
      const escala = b.ficha.fisica?.escala ?? 1, mira = b.dir * b.artFacing;
      const qs = buildCharacterQuads(a.ssbp, a.textures, e.pack, e.anim, cuadro, {
        x: b.x - (o[2] * mira * escala) / PIXELES_POR_UNIDAD, y: b.y - o[3] * escala / PIXELES_POR_UNIDAD,
        scale: this.escala * escala, flipX: mira < 0,
      });
      if (b.ficha.fisica?.orientarVelocidad && (b.vx || b.vy)) {
        const angulo = Math.atan2(b.vy, b.vx * b.dir) * b.dir;
        const c = Math.cos(angulo), s = Math.sin(angulo);
        for (const q of qs) for (const pt of q.pts) {
          const x = pt[0] - b.x, y = pt[1] - b.y;
          pt[0] = b.x + x * c - y * s; pt[1] = b.y + x * s + y * c;
        }
      }
      out.push(...qs);
    }
    return out;
  }
}

// Respaldo acotado para el tamaño del actor: el original actualiza +0x24/+0x28 desde cajas.
function geometriaObjetivoBala(u) {
  const cajas = (cajasDe(u) ?? []).filter((c) => c[1] === TIPO.CUERPO);
  return { x: u.x, y: u.alt ?? u.y - (u.suelo ?? 0), z: u.z ?? 0,
    ancho: u.anchoFisico ?? (cajas.length ? Math.max(...cajas.map((c) => c[4])) / PIXELES_POR_UNIDAD : 0),
    alto: u.altoFisico ?? (cajas.length ? Math.max(...cajas.map((c) => c[5])) / PIXELES_POR_UNIDAD : 0),
    profundidad: u.profundidadFisica ?? u.radio ?? 28 };
}
