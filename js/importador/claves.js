// Claves del juego sacadas de la librería del jugador (libcocos2dcpp.so, armeabi-v7a), sin llevarlas en el código
// (D65, D68). Port de herramientas/sacar_clave.py y textos.py (sacar_clave), pero sin direcciones fijas: la
// librería de Revival (saomd8.apks) es otra compilación que la 3.0.2 analizada en Ghidra (las mismas tablas,
// 0x7d0 bytes antes), así que las tablas se buscan por su huella SHA-256 (que no permite reconstruirlas).
//
//   CCZp (recursos, ZipUtils::setPvrEncryptionKeyPart en AppDelegate::applicationDidFinishLaunching,
//     FUN_005afc58): clave[i] = tabla[i] ^ 10·(i+1) ^ 0xCDE9538D, tabla de 4 palabras.
//   XXTEA (strings de la master data, FUN_005c35a0): clave[i] = t2[t1[i] ^ 0xEA] ^ 0x21 (i = 0..15), t1 de 16 bytes
//     y t2 de 256. En las dos librerías conocidas t1 y t2 están 0x50 y 0xc9b bytes después de la tabla CCZp.

import { sha256Palabras, huella } from './sha256.js';

const H_CCZ = huella('1d5ed472e1a41f4cdb4e6e759f87ed8c6986bb13f649650dbf01c2acbcaf9179');
const H_T1 = huella('ef30ddf0aecdf85078e07035f06bdb5c94adce36eb9f340fedddd3b49d828cb4');
const H_T2 = huella('551a12a3b14ac40107bc204e6788231dd589aabafa8a234d81307a606b32c080');
const T1_DESDE_CCZ = 0x50;
const T2_DESDE_CCZ = 0xc9b;

const igual = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7];

/** Primera posición (múltiplo de `paso`) donde bytes[o, o + largo) tiene la huella `h`, o -1. */
function buscar(lib, h, largo, paso, avance) {
  const tmp = new Uint32Array(8);
  const fin = lib.length - largo;
  for (let o = 0; o <= fin; o += paso) {
    if (avance && (o & 0xfffff) < paso) avance(o / fin);
    if (igual(sha256Palabras(lib, o, largo, tmp), h)) return o;
  }
  return -1;
}

const coincide = (lib, o, largo, h) => o >= 0 && o + largo <= lib.length && igual(sha256Palabras(lib, o, largo), h);

/**
 * Busca las claves en la librería (Uint8Array). Devuelve { ccz: Uint32Array(4), xxtea: Uint8Array(16), posicion }.
 * Lanza un error si no es la librería de SAO Memory Defrag. `avance(fracción)` informa del progreso.
 */
export function sacarClaves(lib, avance = null) {
  if (!(lib[0] === 0x7f && lib[1] === 0x45 && lib[2] === 0x4c && lib[3] === 0x46 && lib[4] === 1)) {
    throw new Error('la librería no es un ELF de 32 bits (hace falta la de armeabi-v7a)');
  }
  const o = buscar(lib, H_CCZ, 16, 4, avance);
  if (o < 0) throw new Error('no se encontró la clave de los recursos: ¿es la librería de SAO Memory Defrag?');
  const dv = new DataView(lib.buffer, lib.byteOffset, lib.byteLength);
  const ccz = Uint32Array.from([0, 1, 2, 3], (i) => (dv.getUint32(o + i * 4, true) ^ (10 * (i + 1)) ^ 0xcde9538d) >>> 0);

  let t1 = o + T1_DESDE_CCZ;
  if (!coincide(lib, t1, 16, H_T1)) t1 = buscar(lib, H_T1, 16, 1);
  let t2 = o + T2_DESDE_CCZ;
  if (!coincide(lib, t2, 256, H_T2)) t2 = buscar(lib, H_T2, 256, 1);
  if (t1 < 0 || t2 < 0) throw new Error('no se encontró la clave de la master data');
  const xxtea = Uint8Array.from({ length: 16 }, (_, i) => lib[t2 + (lib[t1 + i] ^ 0xea)] ^ 0x21);
  return { ccz, xxtea, posicion: o };
}
