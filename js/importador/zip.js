// Lector de ZIP para el importador (D68): el .apks (o una .apk) que elige el jugador es un ZIP de varios GB.
//   - leerDirectorio(blob): directorio central (también ZIP64), sin cargar el archivo en memoria.
//   - flujoEntrada / bytesEntrada: una entrada (guardada o deflate) por partes o entera.
//   - recorrerZip(flujo, alEntrar): las APK de dentro del .apks van comprimidas (deflate), así que no se pueden
//     leer a saltos: se recorren en orden por sus cabeceras locales mientras se descomprimen. Sus tamaños vienen
//     en la cabecera local aunque usen descriptor de datos (bit 3), como en el saomd8.apks de Revival.
// Funciona igual en el navegador y en Node (Blob, ReadableStream y DecompressionStream).

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_FIN = 0x06054b50;
const SIG_FIN64 = 0x06064b50;
const SIG_LOCALIZADOR64 = 0x07064b50;
const SIG_DESCRIPTOR = 0x08074b50;

const utf8 = new TextDecoder('utf-8');
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 2 ** 32;

// D101/D102: en el iPhone la lectura del archivo elegido falla a veces («The I/O read operation failed»,
// NotReadableError). Cada lectura es un trozo nuevo del archivo y se reintenta con espera creciente.
export const REINTENTOS_LECTURA = 6;
export const TROZO_FLUJO = 4 * 2 ** 20;
const lecturaTransitoria = (e) => ['NotReadableError', 'UnknownError'].includes(e?.name) || /I\/O read|transient|connection is lost/i.test(e?.message ?? '');

export async function trozo(blob, ini, fin, espera = (ms) => new Promise((r) => setTimeout(r, ms))) {
  for (let i = 0; ; i++) {
    try {
      const b = new Uint8Array(await blob.slice(ini, fin).arrayBuffer());
      // D105: una lectura corta (menos bytes de los pedidos, sin error) se trata como fallo pasajero y se repite.
      const esperado = Math.max(0, Math.min(fin, blob.size ?? fin) - ini);
      if (b.length !== esperado) throw Object.assign(new Error(`lectura corta: ${b.length} de ${esperado} bytes en la posición ${ini}`), { name: 'NotReadableError' });
      return b;
    } catch (e) {
      if (i >= REINTENTOS_LECTURA || !lecturaTransitoria(e)) throw e;
      await espera(500 * (i + 1));
    }
  }
}

/** D102: flujo de [ini, fin) del archivo leído en trozos de TROZO_FLUJO con reintentos (en vez de Blob.stream()). */
export function flujoRango(blob, ini, fin, opciones = {}) {
  let pos = ini;
  const tam = opciones.trozo ?? TROZO_FLUJO;
  return new ReadableStream({
    async pull(ctl) {
      if (pos >= fin) { ctl.close(); return; }
      const hasta = Math.min(fin, pos + tam);
      ctl.enqueue(await trozo(blob, pos, hasta, opciones.espera));
      pos = hasta;
    },
  });
}

/** Campo extra ZIP64 (0x0001): reemplaza los valores que valen 0xFFFFFFFF, en orden. */
function zip64(extra, valores) {
  let o = 0;
  while (o + 4 <= extra.length) {
    const id = u16(extra, o), n = u16(extra, o + 2);
    if (id === 0x0001) {
      let p = o + 4;
      return valores.map((v) => {
        if (v !== 0xffffffff) return v;
        const r = u64(extra, p);
        p += 8;
        return r;
      });
    }
    o += 4 + n;
  }
  return valores;
}

/** Entradas del directorio central: [{ nombre, metodo, flags, tamComp, tam, offsetLocal }]. */
export async function leerDirectorio(blob) {
  const cola = Math.min(blob.size, 22 + 65535 + 20);
  const fin = await trozo(blob, blob.size - cola, blob.size);
  let e = -1;
  for (let i = fin.length - 22; i >= 0; i--) if (u32(fin, i) === SIG_FIN) { e = i; break; }
  if (e < 0) throw new Error('no es un archivo ZIP (APK) válido');
  let total = u16(fin, e + 10);
  let tamDir = u32(fin, e + 12);
  let iniDir = u32(fin, e + 16);
  if (e >= 20 && u32(fin, e - 20) === SIG_LOCALIZADOR64) {
    const pos64 = u64(fin, e - 20 + 8);
    const f64 = await trozo(blob, pos64, pos64 + 56);
    if (u32(f64, 0) === SIG_FIN64) {
      total = u64(f64, 32);
      tamDir = u64(f64, 40);
      iniDir = u64(f64, 48);
    }
  }
  const dir = await trozo(blob, iniDir, iniDir + tamDir);
  const out = [];
  let o = 0;
  for (let k = 0; k < total && o + 46 <= dir.length; k++) {
    if (u32(dir, o) !== SIG_CENTRAL) throw new Error('directorio del ZIP dañado');
    const flags = u16(dir, o + 8), metodo = u16(dir, o + 10);
    const nl = u16(dir, o + 28), el = u16(dir, o + 30), cl = u16(dir, o + 32);
    const nombre = utf8.decode(dir.subarray(o + 46, o + 46 + nl));
    const extra = dir.subarray(o + 46 + nl, o + 46 + nl + el);
    const [tam, tamComp, offsetLocal] = zip64(extra, [u32(dir, o + 24), u32(dir, o + 20), u32(dir, o + 42)]);
    out.push({ nombre, metodo, flags, tamComp, tam, offsetLocal });
    o += 46 + nl + el + cl;
  }
  return out;
}

/** [inicio, fin) de los datos comprimidos de una entrada (lee su cabecera local). */
export async function rangoDatos(blob, e) {
  const h = await trozo(blob, e.offsetLocal, e.offsetLocal + 30);
  if (u32(h, 0) !== SIG_LOCAL) throw new Error(`cabecera local dañada: ${e.nombre}`);
  const ini = e.offsetLocal + 30 + u16(h, 26) + u16(h, 28);
  return [ini, ini + e.tamComp];
}

/** Flujo (ReadableStream) con el contenido descomprimido de una entrada. */
export async function flujoEntrada(blob, e) {
  const [ini, fin] = await rangoDatos(blob, e);
  const crudo = flujoRango(blob, ini, fin);
  if (e.metodo === 0) return crudo;
  if (e.metodo === 8) return crudo.pipeThrough(new DecompressionStream('deflate-raw'));
  throw new Error(`método de compresión ${e.metodo} no soportado (${e.nombre})`);
}

/** Contenido de una entrada entera (Uint8Array). */
export async function bytesEntrada(blob, e) {
  return juntar(await flujoEntrada(blob, e));
}

/** Descomprime deflate crudo (o zlib con formato = 'deflate'). */
// D104: sin Blob ni Response. Chrome en Android reserva poco espacio para Blobs y una importación crea
// decenas de miles; al llenarse, la lectura fallaba con un «Failed to fetch» que ocultaba el error real.
export async function inflar(bytes, formato = 'deflate-raw') {
  const ds = new DecompressionStream(formato);
  const escritor = ds.writable.getWriter();
  const escrito = escritor.write(bytes).then(() => escritor.close());
  escrito.catch(() => { /* el mismo error llega por la lectura */ });
  const salida = await juntar(ds.readable);
  await escrito;
  return salida;
}

/** Lee un ReadableStream entero en un Uint8Array, con su error original si falla. */
export async function juntar(flujo) {
  const r = flujo.getReader();
  const trozos = [];
  let total = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    trozos.push(value); total += value.length;
  }
  if (trozos.length === 1) return trozos[0];
  const out = new Uint8Array(total);
  let o = 0;
  for (const t of trozos) { out.set(t, o); o += t.length; }
  return out;
}

/** Lee un ReadableStream de bytes por cantidades exactas. */
class Lector {
  constructor(flujo) {
    this.r = flujo.getReader();
    this.trozos = [];
    this.disponible = 0;
    this.fin = false;
    this.leidos = 0; // bytes consumidos del flujo
  }

  async _llenar(n) {
    while (this.disponible < n && !this.fin) {
      const { value, done } = await this.r.read();
      if (done) this.fin = true;
      else if (value.length) {
        this.trozos.push(value);
        this.disponible += value.length;
      }
    }
  }

  /** Exactamente n bytes (menos solo al final del flujo). */
  async leer(n) {
    await this._llenar(n);
    n = Math.min(n, this.disponible);
    const out = new Uint8Array(n);
    let p = 0;
    while (p < n) {
      const t = this.trozos[0];
      const k = Math.min(t.length, n - p);
      out.set(k === t.length ? t : t.subarray(0, k), p);
      p += k;
      if (k === t.length) this.trozos.shift();
      else this.trozos[0] = t.subarray(k);
    }
    this.disponible -= n;
    this.leidos += n;
    return out;
  }

  async saltar(n) {
    while (n > 0) {
      await this._llenar(1);
      if (!this.disponible) return;
      const t = this.trozos[0];
      const k = Math.min(t.length, n);
      if (k === t.length) this.trozos.shift();
      else this.trozos[0] = t.subarray(k);
      this.disponible -= k;
      this.leidos += k;
      n -= k;
    }
  }

  cancelar() {
    this.r.cancel().catch(() => {});
  }
}

/**
 * Recorre en orden las entradas de un ZIP que llega como flujo. alEntrar(entrada) decide qué hacer con cada una:
 * devuelve una función async (bytesComprimidos) => void para leerla, o null para saltarla. Si devuelve false se
 * deja de leer. entrada = { nombre, metodo, flags, tamComp, tam, indice }.
 */
export async function recorrerZip(flujo, alEntrar) {
  const L = new Lector(flujo);
  for (let indice = 0; ; indice++) {
    const cab = await L.leer(30);
    if (cab.length < 30 || u32(cab, 0) !== SIG_LOCAL) break; // directorio central: fin de los archivos
    const flags = u16(cab, 6), metodo = u16(cab, 8);
    const nl = u16(cab, 26), el = u16(cab, 28);
    const nombre = utf8.decode(await L.leer(nl));
    const extra = await L.leer(el);
    let [tam, tamComp] = zip64(extra, [u32(cab, 22), u32(cab, 18)]);
    if (flags & 8 && tamComp === 0 && metodo !== 0) throw new Error(`entrada sin tamaño en la cabecera local: ${nombre}`);
    const e = { nombre, metodo, flags, tamComp, tam, indice };
    const accion = await alEntrar(e);
    if (accion === false) {
      L.cancelar();
      return;
    }
    if (accion) {
      const datos = await L.leer(tamComp);
      // D105: el flujo terminó antes de tiempo (antes acababa como «Compressed input was truncated»).
      if (datos.length < tamComp) throw new Error(`el paquete se acaba a mitad de ${nombre} (${datos.length} de ${tamComp} bytes)`);
      await accion(datos);
    }
    else await L.saltar(tamComp);
    if (flags & 8) {
      // Descriptor de datos: [firma] crc, tamaños (4 + 4, u 8 + 8 en ZIP64).
      const d = await L.leer(4);
      const conFirma = u32(d, 0) === SIG_DESCRIPTOR;
      const zip64Datos = tamComp >= 0xffffffff || tam >= 0xffffffff;
      await L.saltar((conFirma ? 4 : 0) + (zip64Datos ? 16 : 8));
    }
  }
}

/** Contenido de una entrada leída con recorrerZip (bytes comprimidos → bytes). */
export async function contenido(e, comprimidos) {
  if (e.metodo === 0) return comprimidos;
  if (e.metodo === 8) return inflar(comprimidos);
  throw new Error(`método de compresión ${e.metodo} no soportado (${e.nombre})`);
}
