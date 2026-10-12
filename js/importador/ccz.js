// Descifrado de los recursos CCZp de Cocos2d-x (ZipUtils::decodeEncodedPvr + inflateCCZBuffer), port de
// herramientas/ccz.py (D68): keystream de 1024 palabras (6 rondas tipo XXTEA con la clave de claves.js), XOR de
// las primeras 512 palabras desde el byte 12 y luego 1 de cada 64; el resultado es un CCZ normal (largo
// big-endian en el byte 12 y zlib desde el 16).

import { inflar } from './zip.js';

const ENCLEN = 1024;
const SECURELEN = 512;
const DISTANCE = 64;
const DELTA = 0x9e3779b9;

/** Keystream de 1024 palabras a partir de las 4 partes de la clave (Uint32Array(4)). */
export function keystream(partes) {
  const key = new Uint32Array(ENCLEN);
  let s = 0;
  let z = key[ENCLEN - 1];
  for (let r = 0; r < 6; r++) {
    s = (s + DELTA) >>> 0;
    const e = (s >>> 2) & 3;
    for (let p = 0; p < ENCLEN - 1; p++) {
      const y = key[p + 1];
      const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((s ^ y) + (partes[(p & 3) ^ e] ^ z))) >>> 0;
      key[p] = (key[p] + mx) >>> 0;
      z = key[p];
    }
    const y = key[0];
    const p = ENCLEN - 1;
    const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((s ^ y) + (partes[(p & 3) ^ e] ^ z))) >>> 0;
    key[p] = (key[p] + mx) >>> 0;
    z = key[p];
  }
  return key;
}

/** ¿Empieza por "CCZp"? */
export const esCCZp = (b) => b.length >= 16 && b[0] === 0x43 && b[1] === 0x43 && b[2] === 0x5a && b[3] === 0x70;

/** Descifra y descomprime un CCZp (Uint8Array; se modifica en el sitio). */
export async function descifrar(buf, ks) {
  if (!esCCZp(buf)) throw new Error('no es CCZp');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const nwords = (buf.length - 12) >>> 2;
  let b = 0;
  let i = 0;
  for (; i < nwords && i < SECURELEN; i++) {
    dv.setUint32(12 + i * 4, dv.getUint32(12 + i * 4, true) ^ ks[b], true);
    b = (b + 1) % ENCLEN;
  }
  for (; i < nwords; i += DISTANCE) {
    dv.setUint32(12 + i * 4, dv.getUint32(12 + i * 4, true) ^ ks[b], true);
    b = (b + 1) % ENCLEN;
  }
  const tam = dv.getUint32(12, false);
  const out = await inflar(buf.subarray(16), 'deflate');
  if (out.length !== tam) throw new Error(`tamaño inesperado: ${out.length} != ${tam}`);
  return out;
}
