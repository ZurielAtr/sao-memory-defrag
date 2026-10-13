import { rutaWeb } from './rutas.js';
// Cajas de colisión por cuadro (D51): web/data/cajas/<unidad>.json (herramientas/exportar_cajas.py).
// Cálculo del juego (NOTAS.md "Cajas de colisión"): la caja se mide desde la caja 1 (origen) del mismo
// cuadro (FUN_005e1990), se refleja si la unidad mira al otro lado, su rectángulo va centrado con
// ancho f4·f6 y alto f5·f7 × escala de la unidad (FUN_0083c9cc) y todo se divide por 1.82 antes de
// sumar la posición de la unidad (FUN_0083caf0). Choque = Rect::intersectsRect (FUN_00df1270).

export const PIXELES_POR_UNIDAD = 1.82; // DAT_0083cac0
export const TIPO = { ORIGEN: 1, ATAQUE: 2, CUERPO: 4 };

const cache = new Map();

// Escala lógica del modelo (+0x164); no es el zoom ni la escala de dibujo del renderer.
export const escalaFisica = (u) => u.fisica?.escala ?? u.pj?.fisica?.escala ?? u.ficha?.fisica?.escala ?? 1;

export function cargarCajas(unidad) {
  if (!cache.has(unidad)) {
    cache.set(unidad, fetch(rutaWeb(`/data/cajas/${unidad}.json`)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(unidad);
}

// Cajas del cuadro actual de la animación de `u` (null si no hay datos para esa animación).
export function cajasDe(u) {
  const cuadros = u.cajas?.[u.anim?.name];
  if (!cuadros?.length) return null;
  return cuadros[Math.min(u.frame, cuadros.length - 1)] ?? null;
}

// Rectángulo en el mundo de una caja [id, tipo, x, y, ancho, alto] de la unidad `u`.
// `mira` = signo de x hacia donde mira el arte (dir · artFacing); `suelo` = altura de la unidad sobre el suelo.
export function rectDe(u, caja, cajas, { escala = escalaFisica(u), suelo = 0 } = {}) {
  const origen = cajas.find((c) => c[0] === 1) ?? [1, 1, 0, 0, 1, 1];
  const mira = (u.dir ?? 1) * (u.artFacing ?? 1);
  const cx = u.x + ((caja[2] - origen[2]) * escala * mira) / PIXELES_POR_UNIDAD;
  const cy = suelo + ((caja[3] - origen[3]) * escala) / PIXELES_POR_UNIDAD;
  const w = (caja[4] * escala) / PIXELES_POR_UNIDAD, h = (caja[5] * escala) / PIXELES_POR_UNIDAD;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// Ancho del cuerpo de `u` en el cuadro actual (la caja de cuerpo más ancha), o `porDefecto` sin datos.
// PROVISIONAL: el juego usa el tamaño de la unidad (+0x24 · escala, FUN_00827450).
export function anchoCuerpo(u, porDefecto = 100) {
  const cuerpos = (cajasDe(u) ?? []).filter((c) => c[1] === TIPO.CUERPO);
  if (!cuerpos.length) return porDefecto;
  return Math.max(...cuerpos.map((c) => c[4])) / PIXELES_POR_UNIDAD;
}

export const seCruzan = (a, b) => !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);

// ¿La caja de ataque `idCaja` de `atacante` toca alguna de las cajas `ids` (por id) de `defensor`?
// null si faltan datos. Para las listas de parada de D53 (cajas por id, de cualquier tipo).
export function tocaCajas(atacante, idCaja, defensor, ids, { sueloA = 0, sueloD = 0 } = {}) {
  const ca = cajasDe(atacante), cd = cajasDe(defensor);
  if (!ca || !cd || !ids.size) return null;
  const golpe = ca.find((c) => c[0] === idCaja);
  const objetivo = cd.filter((c) => ids.has(c[0]));
  if (!golpe || !objetivo.length) return null;
  const r = rectDe(atacante, golpe, ca, { suelo: sueloA });
  return objetivo.some((c) => seCruzan(r, rectDe(defensor, c, cd, { suelo: sueloD })));
}

// ¿La caja de ataque `idCaja` de `atacante` toca alguna caja de cuerpo de `defensor`?
// Devuelve null si falta algún dato (para usar el alcance aproximado de antes).
export function golpeaCaja(atacante, idCaja, defensor, { sueloA = 0, sueloD = 0 } = {}) {
  const ca = cajasDe(atacante), cd = cajasDe(defensor);
  if (!ca || !cd) return null;
  const golpe = ca.find((c) => c[0] === idCaja);
  const cuerpos = cd.filter((c) => c[1] === TIPO.CUERPO);
  if (!golpe || !cuerpos.length) return null;
  const r = rectDe(atacante, golpe, ca, { suelo: sueloA });
  return cuerpos.some((c) => seCruzan(r, rectDe(defensor, c, cd, { suelo: sueloD })));
}
