// Colisión entre balas: cajas de ataque activadas por evento 1 contra cuerpos del evento 3.
// La geometría usa la escala original y el movimiento relativo de ambas balas.
// HP, filtros y resolución: BattleBullet FUN_00821ca0/FUN_0082209c (Ghidra D73).
import { rectDe, seCruzan } from './cajas.js';

const escala = (b) => b.ficha.fisica?.escala ?? 1;
const altura = (b) => b.y - (b.suelo ?? 0);
const cajasDe = (b) => {
  const cuadros = b.ficha.cajas?.[b.fase];
  return cuadros?.[Math.max(0, Math.min(b.cuadro, cuadros.length - 1))] ?? [];
};

/** El evento 1 mantiene el ataque activo hasta que un evento 2 lo vacía. */
export function ataquesActivosBala(b) {
  return [...(b.activas ?? [])].flatMap(([caja, ref]) => {
    const ataque = b.ficha.ataques?.[ref];
    return ataque ? [{ ...ataque, ataque: ref, caja }] : [];
  });
}

/** Solo cuerpos activados por evento 3; no inventa una caja donde faltan datos. */
export function cuerposActivosBala(b) {
  return cajasDe(b).filter((c) => b.cuerpos?.has(c[0]));
}

export function puedenColisionarBalas(a, d, g = null) {
  if (a === d || a.muerta || d.muerta || a.agotada || d.agotada) return false;
  if (a.equipo == null || d.equipo == null) return false;
  if (g && !g.balas) return false; // attack.f34: permite BattleBullet como objetivo.
  const objetivo = g?.objetivo ?? 1;
  // FUN_0083c540, sin modo cooperativo: mismo bando o jugador(1) contra enemigo(0).
  const seleccionAliada = a.equipo === d.equipo || (a.equipo === 'jugador' && d.equipo === 'enemigo');
  if ([1, 6, 9].includes(objetivo)) { if (a.equipo === d.equipo) return false; }
  else if ([2, 7, 10].includes(objetivo)) { if (!seleccionAliada) return false; }
  else if (objetivo === 3) { if (!seleccionAliada || a.emisor === d) return false; }
  else if (objetivo === 5 || objetivo === 8) { if (a.emisor !== d) return false; }
  else if (objetivo !== 4) return false; // 11/12 dependen de identidad cooperativa y +0x635.
  // FUN_00821f64: indicador dinámico +0x6c7 y f68 (00821fd4).
  // +0x6c7 lo fija FUN_00840d58 al emitir; no corresponde a bullet.f63.
  const ignora = (b) => b.ignorarBalas || b.ficha.crudo?.f68;
  return !ignora(a) && !ignora(d);
}

function segmentoRect(x, y, dx, dy, r) {
  let desde = 0, hasta = 1;
  for (const [o, delta, min, max] of [[x, dx, r.x, r.x + r.w], [y, dy, r.y, r.y + r.h]]) {
    if (!delta) { if (o < min || o > max) return false; continue; }
    const a = (min - o) / delta, b = (max - o) / delta;
    desde = Math.max(desde, Math.min(a, b)); hasta = Math.min(hasta, Math.max(a, b));
    if (desde > hasta) return false;
  }
  return true;
}

/** Barrido de la caja de ataque contra el cuerpo, compensando el movimiento de ambos. */
export function tocaBala(a, g, d) {
  const ca = cajasDe(a), golpe = ca.find((c) => c[0] === g.caja);
  if (!golpe) return false;
  const profundidad = g.prof == null ? Infinity : g.prof * escala(a);
  // Constructor BattleModel: radio +0xd8 = 28; puede sustituirse con un radio explícito.
  // 0083fbb0 solo descarta cuando la distancia supera la suma; el borde también toca.
  if (Math.abs((a.z ?? 0) - (d.z ?? 0)) > profundidad + (d.radio ?? 28) * escala(d)) return false;
  const ra = rectDe(a, golpe, ca, { escala: escala(a), suelo: altura(a) });
  const cd = cajasDe(d);
  const daX = a.anterior ? a.x - a.anterior.x : 0;
  const daY = a.anterior ? altura(a) - a.anterior.alt : 0;
  const ddX = d.anterior ? d.x - d.anterior.x : 0;
  const ddY = d.anterior ? altura(d) - d.anterior.alt : 0;
  return cuerposActivosBala(d).some((c) => {
    const rd = rectDe(d, c, cd, { escala: escala(d), suelo: altura(d) });
    if (seCruzan(ra, rd)) return true;
    const dx = daX - ddX, dy = daY - ddY;
    return segmentoRect(ra.x + ra.w / 2 - dx, ra.y + ra.h / 2 - dy, dx, dy,
      { x: rd.x - ra.w / 2, y: rd.y - ra.h / 2, w: rd.w + ra.w, h: rd.h + ra.h });
  });
}

const pierdeHP = (b) => (b.fase === 'wait' || (b.fase === 'appear' && !b.ficha.fisica?.sinImpactoAppear));

// Getter 008229f0: para un golpe de daño entre dos balas, min(HP de ambas).
// Las balas reflejadas tienen +0x69c y anulan ese daño (el padre mantiene sinDanioChoque).
// FUN_00821ca0 incrementa el contador f39 solo contra actores, no contra otras balas.
export function danioChoqueBalas(a, d, g) {
  if (g.tipo !== 1 || a.sinDanioChoque || d.sinDanioChoque) return 0;
  return Math.max(0, Math.min(a.hp ?? 0, d.hp ?? 0));
}

/** Un contacto en el inventario común; no evalúa un segundo ataque del defensor. */
export function resolverContactoBalas(a, d, g, { agotar, calcularDanio = danioChoqueBalas, alImpacto = null } = {}) {
  const clave = `balas:${a.fase}:${g.caja}:${g.ataque}`;
  const ya = a.golpeados?.get(clave) ?? new Set();
  (a.golpeados ??= new Map()).set(clave, ya);
  if (!puedenColisionarBalas(a, d, g) || ya.has(d) || !tocaBala(a, g, d)) return null;
  ya.add(d);
  // 00821ca0 calcula el retorno antes de que 0082209c modifique al defensor.
  const calculado = calcularDanio(a, d, g);
  const da = Math.max(0, typeof calculado === 'number' ? calculado : calculado?.atacante ?? 0);
  const dd = Math.max(0, typeof calculado === 'number' ? calculado : calculado?.defensor ?? 0);
  const hpA = a.hp, hpD = d.hp;
  if (pierdeHP(d) && dd > 0) d.hp = Math.max(0, (d.hp ?? 0) - Math.trunc(dd));
  if (pierdeHP(a) && da > 0) a.hp = Math.max(0, Math.trunc((a.hp ?? 0) - da));
  if (hpD > 0 && d.hp <= 0) agotar?.(d);
  if (hpA > 0 && a.hp <= 0) agotar?.(a);
  const resultado = { atacante: a, defensor: d, golpe: g, danioAtacante: hpA - a.hp, danioDefensor: hpD - d.hp };
  alImpacto?.(resultado);
  return resultado;
}

/**
 * Resuelve ataque contra cuerpo de las balas de ambos equipos después de moverlas.
 * calcularDanio(a,d,g) puede devolver un número común o { atacante, defensor }.
 * agotar(b) conserva la transición de fase, audio y detención del motor de proyectiles.
 */
export function resolverColisionesBalas(balas, opciones = {}) {
  const resultados = [];
  for (const a of balas) {
    if (a.muerta || a.agotada) continue;
    for (const g of ataquesActivosBala(a)) {
      for (const d of balas) {
        const resultado = resolverContactoBalas(a, d, g, opciones);
        if (resultado) resultados.push(resultado);
        if (a.muerta || a.agotada) break;
      }
      if (a.muerta || a.agotada) break;
    }
  }
  return resultados;
}
