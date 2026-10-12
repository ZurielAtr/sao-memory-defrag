// Frecuencia ORIGINAL: decodeAudioData devuelve PCM remuestreado a AudioContext.
// Los puntos de bucle expresados en cuadros del archivo necesitan esta frecuencia.
// Formato: https://xiph.org/vorbis/doc/Vorbis_I_spec.html (4.2.2 y apéndice A)
// y https://xiph.org/ogg/doc/framing.html. Sin dependencias ni decodificación OGG.

/** Lee el paquete de identificación de la primera página Ogg/Vorbis.
 * Devuelve null en archivos ajenos/truncados. No escanea firmas dentro de audio;
 * no verifica CRC ni paquetes posteriores: eso corresponde al decodificador.
 * El primer paquete Vorbis está solo y completo en su página BOS (apéndice A).
 */
export function frecuenciaVorbis(bytes) {
  let v;
  if (bytes instanceof ArrayBuffer) v = new DataView(bytes);
  else if (ArrayBuffer.isView(bytes)) v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  else return null;
  if (v.byteLength < 28 || v.getUint32(0, false) !== 0x4f676753 || v.getUint8(4) !== 0) return null;
  // BOS obligatorio; ni continuación ni flags reservados en la primera página.
  if (v.getUint8(5) !== 2 || v.getUint32(18, true) !== 0) return null;
  const segmentos = v.getUint8(26), inicio = 27 + segmentos;
  if (!segmentos || inicio > v.byteLength) return null;
  let tamano = 0;
  for (let i = 0; i < segmentos; i++) {
    const n = v.getUint8(27 + i);
    tamano += n;
    // Un solo paquete completo, evitando interpretar el siguiente como cabecera.
    if ((i < segmentos - 1 && n !== 255) || (i === segmentos - 1 && n === 255)) return null;
  }
  if (tamano < 30 || tamano > v.byteLength - inicio) return null;
  if (v.getUint8(inicio) !== 1 || v.getUint32(inicio + 1, false) !== 0x766f7262 || v.getUint16(inicio + 5, false) !== 0x6973) return null;
  if (v.getUint32(inicio + 7, true) !== 0 || v.getUint8(inicio + 11) === 0) return null;
  const frecuencia = v.getUint32(inicio + 12, true);
  const tamanos = v.getUint8(inicio + 28), pequeno = tamanos & 15, grande = tamanos >> 4;
  if (!frecuencia || pequeno < 6 || grande > 13 || pequeno > grande || !(v.getUint8(inicio + 29) & 1)) return null;
  return frecuencia;
}
