// Parada: FUN_008395f0 llama BattleBullet virtual0x54/FUN_008221f0 (D74).
// La bala conserva dueño y estadísticas; solo +0xdc pasa al bando del defensor.
import { parametrosSeguimiento } from './teledireccion.js';

const modoDe = (b) => b.ficha.fisica?.reflexion ?? b.ficha.crudo?.f27 ?? 0;

/** Solo tras tocar una caja de parada; la geometría la resuelve el motor. */
export function puedeReflejarBala(b, g) {
  return g.tipo === 1 && Boolean(g.parable) && b.hp > 0 && !b.muerta && !b.agotada
    && !b.sinDanioChoque && !b.reflejada && modoDe(b) !== 0;
}

/** FUN_008228d4: f19 (retroceso horizontal), mínimo 0.001, hacia fuera del defensor. */
export function direccionReflejoBala(b, defensor, g) {
  let retroceso = g.retrocesoX ?? g.crudo?.f19 ?? g.f19 ?? 0;
  if (retroceso === 0) retroceso = 0.001;
  if (b.x < defensor.x) retroceso = -retroceso;
  return retroceso < 0 ? -1 : 1;
}

/**
 * Devuelve null si no refleja: el caller aplica la respuesta nativa de daño de parada.
 * En éxito devuelve { reflejada, cortar, consumirImpacto, modo, dueno, equipoAnterior }.
 * cortar evita seguir la lista de blancos seleccionada antes de cambiar de bando.
 * consumirImpacto=false evita contar f39 como si el proyectil hubiese golpeado un cuerpo.
 * equipo es el bando de quien para, aunque no esté escrito en el objeto Character.
 */
export function reflejarBala(b, defensor, g, { equipo = defensor.equipo } = {}) {
  if (!puedeReflejarBala(b, g) || equipo == null) return null;
  const modo = modoDe(b), equipoAnterior = b.equipo;
  b.equipo = equipo;
  if (modo === 1 || modo === 2) {
    // virtual0x340 solo sustituye el objetivo +0x670; conserva su reloj +0x674.
    b.objetivoSeguimiento = modo === 2 && parametrosSeguimiento(b.ficha).giro > 0 ? b.emisor : null;
    b.vx *= 2;
    b.vy = -b.vy;
    if (modo === 2) b.vz = -b.vz;
  }
  b.dir = direccionReflejoBala(b, defensor, g);
  b.vx = Math.abs(b.vx) * b.dir;
  b.sentido = b.dir;
  b.reflejada = true;
  b.sinDanioChoque = true; // +0x69c: getter008229f0 devuelve cero contra otra bala.
  return { reflejada: true, cortar: true, consumirImpacto: false, modo, dueno: b.emisor, equipoAnterior };
}
