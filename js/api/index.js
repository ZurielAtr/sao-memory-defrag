// Punto de entrada de la API para el juego en el navegador (F3, D41).
//
//   import { crearApiLocal } from './api/index.js';
//   const api = await crearApiLocal();
//   try { await api.request('user/all'); } catch (e) { if (e.code === 'sin_cuenta') await api.request('user/register', { name: 'Kirito' }); }
//
// Para un servidor real (más adelante): `api.setBackend(new HttpBackend({ baseUrl }))`.

import { Api, ApiError } from './api.js';
import { LocalBackend, SCHEMA_VERSION } from './local_backend.js';
import { HttpBackend } from './http_backend.js';
import { Master, loadMaster } from './master.js';
import { LocalStorageStore, MemoryStore } from './store.js';

export { Api, ApiError, LocalBackend, HttpBackend, Master, loadMaster, LocalStorageStore, MemoryStore, SCHEMA_VERSION };

/** API con LocalBackend: master data de `masterUrl` y cuenta en localStorage (o en memoria si no hay). */
export async function crearApiLocal({ masterUrl = 'data/api_master.json', cuenta = 'cuenta' } = {}) {
  const master = await loadMaster(masterUrl);
  let store;
  try {
    store = new LocalStorageStore();
  } catch {
    store = new MemoryStore();
  }
  return new Api(new LocalBackend({ master, store, cuenta }));
}
