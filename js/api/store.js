// Almacenes para el estado del LocalBackend (F3, D41). Interfaz asíncrona para poder cambiar a
// IndexedDB sin tocar el backend: `get(clave) -> string|null`, `set(clave, texto)`, `remove(clave)`.

/** En memoria: pruebas en node y modo "sin guardar". */
export class MemoryStore {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  async get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  async set(key, value) { this.map.set(key, String(value)); }
  async remove(key) { this.map.delete(key); }
}

/** localStorage del navegador (≈5 MB por origen; la cuenta ocupa unos KB). */
export class LocalStorageStore {
  constructor(storage = globalThis.localStorage, prefix = 'saomd.') {
    if (!storage) throw new Error('localStorage no disponible');
    this.storage = storage;
    this.prefix = prefix;
  }
  async get(key) { return this.storage.getItem(this.prefix + key); }
  async set(key, value) { this.storage.setItem(this.prefix + key, String(value)); }
  async remove(key) { this.storage.removeItem(this.prefix + key); }
}
