// Acceso a los recursos descifrados (los de extraido/descifrado) para los exportadores (D68), igual en Node
// (herramientas/generar_datos.mjs) que en el navegador (importador: OPFS). Lo que en los exportadores de Python
// era `load("x.json")` de extraido/master_data aquí es `md("x")`: se convierte data/x.bin al pedirlo.
//
// Un "almacén" da tres funciones asíncronas sobre rutas relativas con '/' (sin distinguir mayúsculas, como el
// disco de Windows donde se generaban los datos):
//   leer(ruta) → Uint8Array | null · tamano(ruta) → bytes | null · listar(dir) → { dirs, files } | null

import { convertir } from './master_data.js';
import { ordenar } from './py.js';

// Campos de enemy que usan los exportadores (misiones, IA, combate): nombre, unidad, elemento, radio, animaciones
// con sus eventos, ranuras de ataque, traje y reducción en guardia.
const CAMPOS_ENEMIGO = ['f0', 'f1', 'f3', 'f5', 'f9', 'f13', 'f14', 'f15', 'f27', 'f28'];

/** Orden de os.listdir en NTFS (Windows): por nombre en mayúsculas. */
export const ordenNTFS = (nombres) => ordenar(nombres, (n) => n.toUpperCase());

export class Fuente {
  /** almacen: { leer, tamano, listar }; claveXXTEA: 16 bytes (claves.js). */
  constructor(almacen, claveXXTEA) {
    this.a = almacen;
    this.clave = claveXXTEA;
    this.cache = new Map();
    this._animaciones = null;
  }

  leer(ruta) { return this.a.leer(ruta); }
  tamano(ruta) { return this.a.tamano(ruta); }
  async existe(ruta) { return (await this.a.tamano(ruta)) !== null; }
  /** os.listdir (orden de NTFS); null si no es una carpeta. */
  async listar(dir) {
    const l = await this.a.listar(dir);
    return l && { dirs: ordenNTFS(l.dirs), files: ordenNTFS(l.files) };
  }
  async esCarpeta(dir) { return (await this.a.listar(dir)) !== null; }

  /** Master data `nombre` (sin .bin ni .json; p. ej. 'character' o 'enemies/enemy_1'); null si no se puede convertir. */
  async md(nombre, { guardar = true } = {}) {
    nombre = nombre.replace(/\.(json|bin)$/, '');
    if (this.cache.has(nombre)) return this.cache.get(nombre);
    const datos = await this.leer(`data/${nombre}.bin`);
    let v = null;
    if (datos) {
      try {
        v = convertir(datos, this.clave, `${nombre}.bin`);
      } catch {
        v = null; // como master_data.py: el archivo que falla no se escribe
      }
    }
    if (guardar) this.cache.set(nombre, v);
    return v;
  }

  /** Suelta de la memoria una tabla ya usada. */
  olvidar(nombre) { this.cache.delete(nombre.replace(/\.(json|bin)$/, '')); }

  /** Archivos de master data de una carpeta (enemies, animation) en el orden de os.listdir, sin extensión. */
  async archivosMd(dir) {
    const l = await this.listar(`data/${dir}`);
    return (l?.files ?? []).filter((f) => f.endsWith('.bin')).map((f) => `${dir}/${f.slice(0, -4)}`);
  }

  /**
   * Todos los registros de data/enemies (como `for f in os.listdir(MD/enemies)`): Map id → registro, solo con los
   * campos que usan los exportadores (CAMPOS_ENEMIGO; la tabla por nivel f16 la lee enemigosStats).
   */
  async enemigos() {
    if (!this._enemigos) {
      const out = new Map();
      for (const n of await this.archivosMd('enemies')) {
        const recs = await this.md(n, { guardar: false });
        if (!Array.isArray(recs)) continue;
        for (const r of recs) {
          const slim = {};
          for (const k of CAMPOS_ENEMIGO) if (r && k in r) slim[k] = r[k];
          out.set(r?.f0, slim);
        }
      }
      this._enemigos = out;
    }
    return this._enemigos;
  }

  /** Suelta las tablas guardadas y los enemigos. */
  soltar() {
    this.cache.clear();
    this._enemigos = null;
  }

  /** data/animation: Map unidad o bala (f2) → nombre del archivo (glob de MD/animation, el último gana). */
  async animaciones(avance = null) {
    if (!this._animaciones) {
      const out = new Map();
      const archivos = await this.archivosMd('animation');
      let i = 0;
      for (const n of archivos) {
        const d = await this.md(n, { guardar: false });
        if (d && !Array.isArray(d) && d.f2) out.set(d.f2, n);
        avance?.(++i / archivos.length);
      }
      this._animaciones = out;
    }
    return this._animaciones;
  }
}
