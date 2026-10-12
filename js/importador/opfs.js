// Almacenamiento del navegador para el importador (D68): Origin Private File System (OPFS), privado de la página y
// del navegador del jugador. Estructura:
//   saomd/descifrado/…   recursos descifrados (lo que en local es extraido/descifrado)
//   saomd/data/…         datos del juego generados (lo que en local es web/data)
//   saomd/indice.json    [[ruta, tamaño]] de los recursos (búsqueda sin distinguir mayúsculas, como en Windows)
//   saomd/estado.json    { version, archivos, bytes, fecha, fuentes, claveDatos } (claveDatos: la de la master data
//                        sacada de la librería del jugador, para regenerar los datos sin volver a pedir la APK)
// El service worker (web/sw.js) sirve /assets/ y /data/ desde aquí.

export const RAIZ = 'saomd';

/** Índice de los recursos sin distinguir mayúsculas: tamaños y contenido de cada carpeta. */
export class Indice {
  constructor(entradas = []) {
    this.archivos = new Map(); // ruta en minúsculas → [ruta, tamaño]
    this.carpetas = new Map(); // carpeta en minúsculas → { nombre, dirs: Map, files: Map }
    this.carpetas.set('', { nombre: '', dirs: new Map(), files: new Map() });
    for (const [ruta, tam] of entradas) this.agregar(ruta, tam);
  }

  agregar(ruta, tam) {
    const lower = ruta.toLowerCase();
    this.archivos.set(lower, [ruta, tam]);
    const partes = ruta.split('/');
    let dir = '';
    for (let i = 0; i < partes.length - 1; i++) {
      const sub = dir ? `${dir}/${partes[i].toLowerCase()}` : partes[i].toLowerCase();
      const c = this.carpetas.get(dir);
      if (!c.dirs.has(partes[i].toLowerCase())) c.dirs.set(partes[i].toLowerCase(), partes[i]);
      if (!this.carpetas.has(sub)) this.carpetas.set(sub, { nombre: partes[i], dirs: new Map(), files: new Map() });
      dir = sub;
    }
    this.carpetas.get(dir).files.set(partes[partes.length - 1].toLowerCase(), partes[partes.length - 1]);
  }

  quitar(ruta) {
    const lower = ruta.toLowerCase();
    if (!this.archivos.delete(lower)) return;
    const k = lower.lastIndexOf('/');
    this.carpetas.get(k < 0 ? '' : lower.slice(0, k))?.files.delete(lower.slice(k + 1));
  }

  /** [ruta real, tamaño] o null. */
  buscar(ruta) {
    return this.archivos.get(ruta.replace(/^\/+|\/+$/g, '').toLowerCase()) ?? null;
  }

  /** { dirs, files } con los nombres reales, o null si no es una carpeta. */
  listar(dir) {
    const c = this.carpetas.get(dir.replace(/^\/+|\/+$/g, '').toLowerCase());
    return c ? { dirs: [...c.dirs.values()], files: [...c.files.values()] } : null;
  }

  aJSON() {
    return JSON.stringify([...this.archivos.values()]);
  }
}

/** Carpeta saomd de OPFS (o la subcarpeta `ruta`), creándola si `crear`. null si no existe. */
export async function carpeta(ruta = '', crear = false) {
  let d = await navigator.storage.getDirectory();
  for (const parte of [RAIZ, ...ruta.split('/').filter(Boolean)]) {
    try {
      d = await d.getDirectoryHandle(parte, { create: crear });
    } catch {
      return null;
    }
  }
  return d;
}

/** Escribe archivos en una carpeta de OPFS, guardando los manejadores de las subcarpetas. */
export class Escritor {
  constructor(base) {
    this.base = base;
    this.dirs = new Map([['', base]]);
  }

  async _dir(ruta) {
    if (this.dirs.has(ruta)) return this.dirs.get(ruta);
    const k = ruta.lastIndexOf('/');
    const padre = await this._dir(k < 0 ? '' : ruta.slice(0, k));
    const d = await padre.getDirectoryHandle(ruta.slice(k + 1), { create: true });
    this.dirs.set(ruta, d);
    return d;
  }

  async escribir(ruta, datos) {
    const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos;
    const k = ruta.lastIndexOf('/');
    const dir = await this._dir(k < 0 ? '' : ruta.slice(0, k));
    const fh = await dir.getFileHandle(ruta.slice(k + 1), { create: true });
    if (typeof fh.createSyncAccessHandle === 'function') {
      // En un worker: escritura síncrona, la más rápida (y la única en Safari).
      const h = await fh.createSyncAccessHandle();
      try {
        h.truncate(0);
        h.write(bytes, { at: 0 });
        h.flush();
      } finally {
        h.close();
      }
    } else {
      const w = await fh.createWritable();
      await w.write(bytes);
      await w.close();
    }
  }

  async borrar(ruta) {
    const k = ruta.lastIndexOf('/');
    try {
      const dir = await this._dir(k < 0 ? '' : ruta.slice(0, k));
      await dir.removeEntry(ruta.slice(k + 1));
    } catch { /* no estaba */ }
  }

  /** Borra los .json de una subcarpeta (salida.vaciar de generar.js). */
  async vaciar(dir) {
    const d = await this._dir(dir);
    const nombres = [];
    for await (const [n, h] of d.entries()) if (h.kind === 'file' && n.endsWith('.json')) nombres.push(n);
    for (const n of nombres) await d.removeEntry(n);
  }
}

/** Contenido de un archivo de OPFS (Uint8Array) o null. */
export async function leer(base, ruta) {
  let d = base;
  const partes = ruta.split('/').filter(Boolean);
  try {
    for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p);
    const f = await (await d.getFileHandle(partes[partes.length - 1])).getFile();
    return new Uint8Array(await f.arrayBuffer());
  } catch {
    return null;
  }
}

/** Almacén de web/js/datos/fuente.js sobre los recursos importados (lecturas de OPFS, tamaños y carpetas del índice). */
export function almacenOPFS(baseRecursos, indice) {
  return {
    async leer(ruta) {
      const e = indice.buscar(ruta);
      return e ? leer(baseRecursos, e[0]) : null;
    },
    async tamano(ruta) {
      const e = indice.buscar(ruta);
      return e ? e[1] : null;
    },
    async listar(dir) {
      return indice.listar(dir);
    },
  };
}

/** Estado de la importación (saomd/estado.json) o null si no hay nada importado. */
export async function estado() {
  const base = await carpeta();
  if (!base) return null;
  const b = await leer(base, 'estado.json');
  if (!b) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b));
  } catch {
    return null;
  }
}

/** Borra todo lo importado. */
export async function borrarTodo() {
  const raiz = await navigator.storage.getDirectory();
  try {
    await raiz.removeEntry(RAIZ, { recursive: true });
  } catch { /* no había nada */ }
}
