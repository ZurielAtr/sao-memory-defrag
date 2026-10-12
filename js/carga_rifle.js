// D74: BattleCharacter::virtual2c8 (FUN_00827078). El resultado también se copia a bala+0x69d.
// Estos valores son literales del ejecutable; no vienen de character ni seleccionan otra bala.
const f32 = Math.fround;
export const CARGA_RIFLE = Object.freeze({
  inicio: 0.550000011920929, // DAT_00827120
  periodo: 1.1500000953674316, // DAT_00827128
  ventana: 0.30000001192092896, // DAT_0082712c
});

/** Nivel 1/2/3 del rifle original, con sus ventanas periódicas (no carga acumulativa).
 * tiempoObjetivo = gestor57+0x24 (actor+0x314), en segundos.
 * ajusteTiempo = gestor57+0x28 (actor+0x318), inicialmente cero; origen posterior pendiente.
 * motion es el estado lógico actor+0x6b8, no el índice de animación actor+0x6cc.
 * Motion 10 (skill) y las armas distintas de 6 siempre devuelven 1.
 */
export function nivelCargaRifle(tiempoObjetivo, { ajusteTiempo = 0, motion = 9, arma = 6 } = {}) {
  if (arma !== 6 || motion === 10) return 1;
  const t = Math.max(0, f32(f32(tiempoObjetivo) - f32(ajusteTiempo)));
  if (!(t >= CARGA_RIFLE.inicio)) return 1;
  // Reproduce la aritmética float32 y conversión a entero ARM en los límites de las ventanas.
  const desdeInicio = f32(t - CARGA_RIFLE.inicio);
  const ciclos = Math.trunc(f32(desdeInicio / CARGA_RIFLE.periodo));
  const fase = f32(desdeInicio - f32(f32(ciclos) * CARGA_RIFLE.periodo));
  if (fase < CARGA_RIFLE.ventana) return 3;
  return f32(fase - CARGA_RIFLE.ventana) < CARGA_RIFLE.ventana ? 2 : 1;
}

/** Sumas a los getters de la bala, después de pasivas/buffs y del clamp de su valor base.
 * FUN_00820ff0: nivel2 resta 10000 a precisión (stat6, escala 0..10000).
 * FUN_00821018: nivel3 suma 10000 al getter de crítico porcentual (stat2, CRIT/100).
 * Para rng en 0..1 se añade critPorcentaje/100 DESPUÉS del cálculo de pasivas/buffs.
 * No modifica ATK, rate, velocidad, dibujo ni el id de bala. La tirada de precisión solo se
 * usa para attack.f2==1 (FUN_00839ae4); no convierte todos los golpes de nivel2 en misses.
 */
export function bonosCargaRifle(nivel = 1) {
  return { precision: nivel === 2 ? -10000 : 0, critPorcentaje: nivel === 3 ? 10000 : 0 };
}

// _INIT_44: core9→46+combo y core15→64+combo. Conservar la familia al liberar.
export function animacionAtaqueRifle(p, n) {
  const aire = (p.arma ?? p.pj?.arma) === 6 &&
    ((p.alt ?? 0) > 0 || p.anim?.name.startsWith('air_attack_')) && p.has(`air_attack_${n}`);
  return `${aire ? 'air_attack' : 'attack'}_${n}`;
}
