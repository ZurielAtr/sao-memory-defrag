// SHA-256 síncrono (FIPS 180-4), para buscar en la librería del juego las tablas de las claves por su huella
// (claves.js) sin llevar las claves en el código. Rápido para mensajes cortos: se llama millones de veces.

const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H0 = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
const W = new Uint32Array(64);

function bloque(h, palabra) {
  for (let i = 0; i < 16; i++) W[i] = palabra(i);
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15], b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

/** SHA-256 de bytes[ini, ini + largo) como 8 palabras (Uint32Array; se reutiliza `salida` si se pasa). */
export function sha256Palabras(bytes, ini = 0, largo = bytes.length - ini, salida = new Uint32Array(8)) {
  salida.set(H0);
  const total = largo + 9;
  const bloques = Math.ceil(total / 64);
  const byte = (j) => {
    if (j < largo) return bytes[ini + j];
    if (j === largo) return 0x80;
    const fin = bloques * 64;
    if (j >= fin - 8) {
      const bits = largo * 8; // < 2^53
      const k = fin - 1 - j; // 0 = byte menos significativo
      return k < 4 ? (bits >>> (8 * k)) & 0xff : Math.floor(bits / 2 ** 32 / 2 ** (8 * (k - 4))) & 0xff;
    }
    return 0;
  };
  for (let b = 0; b < bloques; b++) {
    const base = b * 64;
    if (base + 64 <= largo) {
      const o = ini + base;
      bloque(salida, (i) => (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3]);
    } else {
      bloque(salida, (i) => {
        const j = base + i * 4;
        return (byte(j) << 24) | (byte(j + 1) << 16) | (byte(j + 2) << 8) | byte(j + 3);
      });
    }
  }
  return salida;
}

/** Huella hexadecimal → 8 palabras. */
export function huella(hex) {
  return Uint32Array.from({ length: 8 }, (_, i) => parseInt(hex.slice(i * 8, i * 8 + 8), 16) | 0);
}

/** SHA-256 en hexadecimal (para pruebas). */
export function sha256Hex(bytes) {
  return [...sha256Palabras(bytes)].map((w) => (w >>> 0).toString(16).padStart(8, '0')).join('');
}
