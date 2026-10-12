// Solo para pruebas (D68): un "Blob" que lee un archivo del servidor local por rangos HTTP (servidor.py --apk),
// para probar el importador sin elegir el archivo a mano (el navegador integrado no admite Blobs de varios GB).
// Tiene lo que usa el importador: size, slice(ini, fin) → { arrayBuffer(), stream() }, name.

export class BlobRemoto {
  constructor(url, size, ini = 0, fin = size) {
    this.url = url;
    this.size = fin - ini;
    this._ini = ini;
    this._fin = fin;
    this.name = decodeURIComponent(url.split('/').pop());
  }

  static async abrir(url) {
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    const total = Number((r.headers.get('Content-Range') || '').split('/')[1]);
    if (!total) throw new Error(`el servidor no da el tamaño de ${url}`);
    return new BlobRemoto(url, total);
  }

  slice(a = 0, b = this.size) {
    return new BlobRemoto(this.url, this._fin - this._ini + this._ini, this._ini + a, this._ini + Math.min(b, this.size));
  }

  async arrayBuffer() {
    if (this.size <= 0) return new ArrayBuffer(0);
    const r = await fetch(this.url, { headers: { Range: `bytes=${this._ini}-${this._fin - 1}` } });
    return r.arrayBuffer();
  }

  stream() {
    // Por trozos de 16 MB, uno detrás de otro.
    const TROZO = 16 << 20;
    let pos = this._ini;
    const fin = this._fin;
    const url = this.url;
    return new ReadableStream({
      async pull(ctl) {
        if (pos >= fin) return ctl.close();
        const hasta = Math.min(fin, pos + TROZO);
        const r = await fetch(url, { headers: { Range: `bytes=${pos}-${hasta - 1}` } });
        ctl.enqueue(new Uint8Array(await r.arrayBuffer()));
        pos = hasta;
      },
    });
  }
}
