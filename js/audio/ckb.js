/* Lector CKB v2 y adaptación JavaScript del decodificador Cricket Audio.
 * Fuente: https://github.com/sjmerel/ck (src/ck/audio/{adpcm,sampleinfo}.cpp).
 * Esta versión modificada valida límites y entrega canales Float32 separados.
 * Cricket Audio, Copyright (c) 2012 Steven Merel — licencia zlib:
 *
 * This software is provided 'as-is', without any express or implied warranty.
 * In no event will the authors be held liable for any damages arising from the
 * use of this software.
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it freely,
 * subject to the following restrictions:
 * 1. The origin of this software must not be misrepresented; you must not claim
 * that you wrote the original software. If you use this software in a product,
 * an acknowledgment in the product documentation would be appreciated but is
 * not required.
 * 2. Altered source versions must be plainly marked as such, and must not be
 * misrepresented as being the original software.
 * 3. This notice may not be removed or altered from any source distribution.
 */

const CABECERA = 72, ENTRADA = 72;
const MAX_MUESTRAS = 65536;
// Límite por decodificación, independiente del presupuesto de la caché.
const MAX_PCM_BYTES = 128 * 1024 * 1024;
const COEFICIENTES = [[256, 0], [512, -256], [0, 0], [192, 64], [240, 0], [460, -208], [392, -232]];
const ADAPTACION = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];
const texto = new TextDecoder('utf-8', { fatal: true });

function fallo(mensaje) { throw new Error(`CKB: ${mensaje}`); }
function vista(bytes) {
  if (bytes instanceof ArrayBuffer) return new DataView(bytes);
  if (ArrayBuffer.isView(bytes)) return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  fallo('se esperaba un ArrayBuffer o una vista de bytes');
}
function rango(v, offset, tamano) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(tamano) || offset < 0 || tamano < 0 || offset > v.byteLength - tamano)
    fallo('datos truncados o rango fuera del banco');
}
function nombre(v, offset) {
  const bytes = new Uint8Array(v.buffer, v.byteOffset + offset, 32);
  const fin = bytes.indexOf(0);
  if (fin < 0) fallo('nombre sin terminador');
  return texto.decode(bytes.subarray(0, fin));
}
function entero(valor, min, max, campo) {
  if (!Number.isSafeInteger(valor) || valor < min || valor > max) fallo(`${campo} inválido`);
}
function validarMuestra(v, m) {
  if (!m || typeof m !== 'object') fallo('muestra inválida');
  entero(m.formato, 0, 3, 'formato no compatible');
  entero(m.canales, 1, 2, 'número de canales');
  entero(m.frecuencia, 1, 65535, 'frecuencia');
  entero(m.bloques, 1, 0x7fffffff, 'número de bloques');
  entero(m.bytesBloque, 1, 65535, 'tamaño de bloque');
  entero(m.cuadrosBloque, 1, 65535, 'cuadros por bloque');
  rango(v, m.offset, m.tamano);
  if (m.tamano !== m.bloques * m.bytesBloque) fallo('tamaño y bloques no coinciden');
  if (m.formato === 2) {
    // Cricket fija 36 cuadros en subbloques de 24 bytes por canal.
    if (m.bytesBloque !== 24 * m.canales || m.cuadrosBloque !== 36) fallo('geometría ADPCM no compatible');
  } else {
    const bytesPCM = [2, 1, 0, 4][m.formato];
    if (m.bytesBloque !== m.cuadrosBloque * m.canales * bytesPCM) fallo('geometría PCM inválida');
  }
  const cuadros = m.bloques * m.cuadrosBloque;
  entero(m.loopInicio, 0, cuadros, 'inicio del bucle');
  entero(m.loopFin, m.loopInicio, cuadros, 'fin del bucle');
  entero(m.loopCount, -1, 32767, 'repeticiones');
  if (m.loopCount !== 0 && m.loopInicio === m.loopFin) fallo('bucle vacío');
  return cuadros;
}

/** Metadatos sin decodificar PCM. Offsets relativos a la vista recibida;
 * volumen/pan conservan las unidades enteras originales, bucles en cuadros. */
export function leerBanco(bytes) {
  const v = vista(bytes);
  rango(v, 0, CABECERA);
  if (v.getUint32(0, false) !== 0x636b6d6b) fallo('firma inválida');
  if (v.getUint32(8, true) !== 1 || v.getUint32(12, true) !== 2) fallo('tipo o versión no compatible');
  const cantidad = v.getUint32(56, true);
  if (cantidad > MAX_MUESTRAS || v.getUint32(60, true) !== cantidad || v.getUint32(64, true) !== 1 || v.getUint32(68, true) !== 1)
    fallo('tabla de muestras inválida');
  rango(v, CABECERA, cantidad * ENTRADA);
  let offset = CABECERA + cantidad * ENTRADA;
  const muestras = [];
  for (let i = 0; i < cantidad; i++) {
    const p = CABECERA + i * ENTRADA;
    const m = {
      nombre: nombre(v, p), offset, tamano: v.getUint32(p + 60, true),
      formato: v.getUint8(p + 32), canales: v.getUint8(p + 33), frecuencia: v.getUint16(p + 34, true),
      bloques: v.getInt32(p + 36, true), bytesBloque: v.getUint16(p + 40, true), cuadrosBloque: v.getUint16(p + 42, true),
      volumen: v.getUint16(p + 44, true), pan: v.getInt16(p + 46, true),
      loopInicio: v.getUint32(p + 48, true), loopFin: v.getUint32(p + 52, true), loopCount: v.getInt16(p + 56, true),
    };
    if (m.loopFin === 0xffffffff) m.loopFin = m.bloques * m.cuadrosBloque;
    validarMuestra(v, m);
    muestras.push(m);
    offset += m.tamano;
  }
  if (offset !== v.byteLength) fallo('bytes sobrantes después de las muestras');
  return { nombre: nombre(v, 16), muestras };
}

/** Decodifica una muestra completa. No aplica volumen, panorámica ni bucles. */
export function decodificarMuestra(bytes, muestra) {
  const v = vista(bytes), m = muestra;
  const cuadros = validarMuestra(v, m);
  if (cuadros * m.canales * 4 > MAX_PCM_BYTES) fallo('PCM excede el límite de 128 MiB');
  // Valida todos los encabezados ADPCM antes de reservar la salida.
  if (m.formato === 2) {
    for (let p = m.offset; p < m.offset + m.tamano; p += 24) {
      if (v.getUint8(p) >= COEFICIENTES.length || v.getInt16(p + 1, true) < 16) fallo('predictor o delta ADPCM inválido');
    }
  }
  const canales = Array.from({ length: m.canales }, () => new Float32Array(cuadros));
  if (m.formato === 2) {
    for (let bloque = 0; bloque < m.bloques; bloque++) {
      for (let c = 0; c < m.canales; c++) {
        const p = m.offset + bloque * m.bytesBloque + c * 24;
        const destino = canales[c], inicio = bloque * 36;
        const [a, b] = COEFICIENTES[v.getUint8(p)];
        let delta = v.getInt16(p + 1, true), anterior2 = v.getInt16(p + 3, true), anterior = v.getInt16(p + 5, true);
        destino[inicio] = anterior2 / 32768;
        destino[inicio + 1] = anterior / 32768;
        for (let i = 2; i < 36; i++) {
          const nibble = (v.getUint8(p + 7 + ((i - 2) >> 1)) >> ((i & 1) * 4)) & 15;
          // División C++ hacia cero, no desplazamiento aritmético para negativos.
          const prediccion = Math.trunc((anterior * a + anterior2 * b) / 256);
          const valor = Math.max(-32768, Math.min(32767, prediccion + (nibble < 8 ? nibble : nibble - 16) * delta));
          destino[inicio + i] = valor / 32768;
          // Cricket estrecha delta a int16 ANTES de imponer el mínimo de 16.
          delta = Math.max(16, (Math.trunc(delta * ADAPTACION[nibble] / 256) << 16) >> 16);
          anterior2 = anterior;
          anterior = valor;
        }
      }
    }
  } else {
    const paso = [2, 1, 0, 4][m.formato];
    let p = m.offset;
    for (let i = 0; i < cuadros; i++) for (let c = 0; c < m.canales; c++, p += paso) {
      const valor = m.formato === 0 ? v.getInt16(p, true) / 32768 : m.formato === 1 ? v.getInt8(p) / 128 : v.getFloat32(p, true);
      if (!Number.isFinite(valor)) fallo('muestra PCM no finita');
      canales[c][i] = valor;
    }
  }
  return { canales, frecuencia: m.frecuencia, loopInicio: m.loopInicio, loopFin: m.loopFin, loopCount: m.loopCount };
}
