// Inventario espacial compartido por actores y balas (005fbef4/005fbc9c/005fbbe4).
// El llamador conserva el orden de registro de sus listas; cada banda lo invierte.
import { dimensionesActor } from './dimensiones_actor.js';

export function bandasContactos(anchoCampo) {
  const w = Math.trunc(anchoCampo);
  if (!Number.isFinite(w) || w <= 0) throw new RangeError('Ancho físico del campo inválido');
  const bandas = [];
  if (w > 219) {
    let factor = 1;
    do {
      const ancho = 110 * factor;
      for (let min = 0; min < w; min += ancho) {
        bandas.push({ min, max: min + ancho, centro: min + Math.trunc(ancho / 2), ancho });
      }
      factor *= 2;
    } while (factor < Math.trunc(w / 110));
  }
  bandas.push({ min: 0, max: w, centro: Math.trunc(w / 2), ancho: w });
  return bandas;
}

export function crearInventarioContactos(unidades, anchoCampo) {
  const bandas = bandasContactos(anchoCampo), w = Math.trunc(anchoCampo);
  const listas = bandas.map(() => []);
  for (const u of unidades) {
    const { ancho } = dimensionesActor(u);
    const min = Math.max(0, Math.trunc(u.x - ancho));
    const max = Math.min(w - 1, Math.trunc(u.x + ancho));
    let indice = bandas.findIndex((b) => b.min <= min && max < b.max);
    if (indice < 0) indice = 0; // 005fbc9c, sin intervalo que lo contenga.
    listas[indice].unshift(u); // next+0x194 = cabeza anterior.
  }
  return {
    bandas,
    consultar(desde, hasta) {
      const min = Math.max(0, Math.trunc(desde)), max = Math.min(w - 1, Math.trunc(hasta));
      const centro = Math.trunc(min + (max - min) * .5);
      return bandas.flatMap((b, i) => Math.abs(centro - b.centro) < Math.trunc((b.ancho + max - min) / 2)
        ? listas[i] : []);
    },
  };
}
