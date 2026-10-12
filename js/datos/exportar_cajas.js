// Cajas de colisión por cuadro (D51): port de herramientas/exportar_cajas.py (D68, mismo resultado). Salida:
// cajas/<unidad>.json = {animación: [[cajas del cuadro 0], …]}; caja = [id, tipo, x, y, ancho, alto].

import { get, o, ordenar, pyRound, aJSON, iterar } from './py.js';

const TIPOS = [1, 2, 4, 86]; // 86 = caja de la parada automática de la guardia (evento 93, D53)

const esDict = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** [id, tipo, x, y, ancho, alto] de una caja de data/animation (también la usa exportar_proyectiles). */
export const caja = (b) => [get(b, 'f0', 0), get(b, 'f8'), pyRound(get(b, 'f1', 0), 2), pyRound(get(b, 'f2', 0), 2),
  pyRound(get(b, 'f4', 1) * get(b, 'f6', 1), 2), pyRound(get(b, 'f5', 1) * get(b, 'f7', 1), 2)];

function compactar(d) {
  const out = {};
  for (const a of iterar(o(get(d, 'f3'), []))) {
    if (!esDict(a)) continue;
    const cuadros = [];
    for (const fr of ordenar(iterar(o(get(a, 'f3'), [])).filter(esDict), (x) => get(x, 'f0', 0))) {
      const vistas = new Set(), cajas = [];
      for (const b of iterar(o(get(fr, 'f2'), []))) {
        const k = get(b, 'f0', 0);
        if (vistas.has(k) || !TIPOS.includes(get(b, 'f8'))) continue;
        vistas.add(k);
        cajas.push(caja(b));
      }
      cuadros.push(cajas);
    }
    out[get(a, 'f0')] = cuadros;
  }
  return out;
}

/** usadas: unidades de los personajes jugables y de los enemigos de las misiones exportadas. */
export async function exportarCajas(fuente, salida, usadas) {
  const anim = await fuente.animaciones();
  for (const [unidad, archivo] of anim) {
    if (!usadas.has(unidad)) continue;
    const d = await fuente.md(archivo, { guardar: false });
    await salida.escribir(`cajas/${unidad}.json`, aJSON(compactar(d)));
  }
}
