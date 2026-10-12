// XXTEA (xxtea-c de Ma Bingyao, como en cocos2d-x): descifra los strings de la master data. Port de
// herramientas/textos.py (xxtea_decrypt): el largo original va en la última palabra.

const DELTA = 0x9e3779b9;

/** Descifra `data` (Uint8Array, múltiplo de 4, ≥ 8 bytes) con la clave de 16 bytes; null si no cuadra el largo. */
export function xxteaDescifrar(data, clave) {
  if (data.length < 8 || data.length % 4) return null;
  const n = data.length >>> 2;
  const v = new Uint32Array(n);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < n; i++) v[i] = dv.getUint32(i * 4, true);
  const k = clave instanceof Uint32Array ? clave : palabrasClave(clave);
  const rondas = 6 + Math.floor(52 / n);
  let s = Math.imul(rondas, DELTA) >>> 0;
  let y = v[0];
  let z;
  while (s) {
    const e = (s >>> 2) & 3;
    for (let p = n - 1; p > 0; p--) {
      z = v[p - 1];
      const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((s ^ y) + (k[(p & 3) ^ e] ^ z))) >>> 0;
      y = v[p] = (v[p] - mx) >>> 0;
    }
    z = v[n - 1];
    const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((s ^ y) + (k[e] ^ z))) >>> 0;
    y = v[0] = (v[0] - mx) >>> 0;
    s = (s - DELTA) >>> 0;
  }
  const largo = v[n - 1];
  if (largo > (n - 1) * 4 || largo < (n - 1) * 4 - 3) return null;
  return new Uint8Array(v.buffer, 0, largo);
}

/** Clave de 16 bytes → 4 palabras little-endian. */
export function palabrasClave(bytes) {
  const b = new Uint8Array(16);
  b.set(bytes.subarray ? bytes.subarray(0, 16) : bytes.slice(0, 16));
  const dv = new DataView(b.buffer);
  return Uint32Array.from([0, 1, 2, 3], (i) => dv.getUint32(i * 4, true));
}
