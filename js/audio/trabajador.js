import { rutaWeb } from '../rutas.js';
import { leerBanco, decodificarMuestra } from './ckb.js';

const cache = new Map();
let bytes = 0;
async function banco(ruta) {
  if (cache.has(ruta)) { const b = cache.get(ruta); cache.delete(ruta); cache.set(ruta, b); return b; }
  const r = await fetch(rutaWeb(`/assets/${ruta}`));
  if (!r.ok) throw new Error(`banco ${ruta}: HTTP ${r.status}`);
  const datos = new Uint8Array(await r.arrayBuffer());
  const b = { datos, indice: leerBanco(datos) };
  cache.set(ruta, b); bytes += datos.byteLength;
  for (const [k, v] of cache) {
    if (bytes <= 64 * 1024 ** 2 || k === ruta) break;
    cache.delete(k); bytes -= v.datos.byteLength;
  }
  return b;
}
// Serializado: evita descargar el mismo banco varias veces en un golpe con muchos efectos.
let cola = Promise.resolve();
onmessage = ({ data: { id, ruta, nombre } }) => {
  cola = cola.then(async () => {
    try {
      const b = await banco(ruta);
      const m = b.indice.muestras.find((x) => x.nombre === nombre);
      if (!m) throw new Error(`muestra ausente: ${nombre}`);
      const pcm = decodificarMuestra(b.datos, m);
      postMessage({ id, pcm }, pcm.canales.map((c) => c.buffer));
    } catch (e) { postMessage({ id, error: e.message }); }
  });
};
