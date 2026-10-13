// Tamaño lógico del BattleModel: 0083c944, evento79 -> 0084182c (D75).
// Las dimensiones explícitas ya están en unidades físicas; las cajas se dividen por1.82.
import { cajasDe, escalaFisica, PIXELES_POR_UNIDAD } from './cajas.js';

export function dimensionesActor(u, eventos = u.eventosDef ?? u.eventos ?? u.pj?.eventos ?? u.eventosGeometria) {
  const anim = u.anim?.name ?? null, cuadro = u.frame ?? 0;
  const s = u._dimensionActor ??= { anim: null, ultimo: -1, caja: 0 };
  if (s.anim !== anim) { s.anim = anim; s.ultimo = -1; s.caja = 0; }
  if (cuadro < s.ultimo) s.ultimo = -1;
  for (const e of eventos?.[anim]?.geometria ?? []) {
    if (e.cuadro > s.ultimo && e.cuadro <= cuadro) s.caja = e.caja;
  }
  s.ultimo = cuadro;
  const escala = escalaFisica(u);
  const cuadros = u.ficha?.cajas?.[u.fase];
  const cajas = cuadros?.[Math.max(0, Math.min(u.cuadro, cuadros.length - 1))] ?? cajasDe(u) ?? [];
  const idCaja = u.cajaTamano ?? s.caja;
  const caja = cajas.find((c) => idCaja && c[0] === idCaja);
  const base = u.fisica?.tamano ?? u.pj?.fisica?.tamano ?? u.ficha?.fisica?.tamano ?? [0, 0];
  return {
    ancho: u.anchoFisico ?? (caja ? caja[4] / PIXELES_POR_UNIDAD : base[0]) * escala,
    alto: u.altoFisico ?? (caja ? caja[5] / PIXELES_POR_UNIDAD : base[1]) * escala,
    profundidad: u.profundidadFisica ?? (u.radio ?? 28) * escala,
  };
}

export function geometriaActor(u) {
  return { x: u.x, y: u.alt ?? u.y - (u.suelo ?? 0), z: u.z ?? 0, ...dimensionesActor(u) };
}
