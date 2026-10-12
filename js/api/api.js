// Capa de API del juego (F3, D41).
//
// El cliente (pantallas, combate) solo habla con `api.request(ruta, params)`, igual que el juego
// original habla con su servidor a través de `l_client::BaseDriver` (RealDriver = HTTP,
// DummyDriver = offline; ver NOTAS.md). Aquí el "driver" es un backend intercambiable:
//   - LocalBackend (local_backend.js): estado en el navegador. Es el que se usa ahora (R8, D32).
//   - HttpBackend (http_backend.js): mismo contrato contra un servidor real, para más adelante.
//
// Contrato de un backend: `async handle(ruta, params) -> respuesta` donde la respuesta es un objeto
// JSON. Con éxito trae `data` (sobre confirmado: quest/start offline responde {"data": {...}}) o es
// `{}` (cuerpo vacío del DummyDriver). Con error trae `error: {code, message}` (PROVISIONAL: formato
// propio, el del servidor original no se conoce).

export class ApiError extends Error {
  constructor(code, message, route) {
    super(`${route}: ${message} (${code})`);
    this.name = 'ApiError';
    this.code = code;
    this.route = route;
  }
}

export class Api {
  /** @param {{handle: (route: string, params: object) => Promise<object>}} backend */
  constructor(backend, { onResponse = null } = {}) {
    if (!backend || typeof backend.handle !== 'function') {
      throw new TypeError('backend sin método handle(ruta, params)');
    }
    this.backend = backend;
    this.onResponse = onResponse; // depuración: (ruta, params, respuesta) => void
  }

  /** Cambia de backend sin tocar al cliente (p. ej. LocalBackend -> HttpBackend). */
  setBackend(backend) {
    this.backend = backend;
  }

  async request(route, params = {}) {
    if (typeof route !== 'string' || !/^[a-z0-9_\-/]+$/.test(route)) {
      throw new ApiError('ruta_invalida', `ruta inválida ${JSON.stringify(route)}`, String(route));
    }
    // Copia: el backend nunca ve (ni modifica) objetos del cliente, como pasaría por la red.
    const body = JSON.parse(JSON.stringify(params ?? {}));
    const res = await this.backend.handle(route, body);
    if (this.onResponse) this.onResponse(route, body, res);
    if (res && res.error) {
      throw new ApiError(res.error.code ?? 'error', res.error.message ?? 'error del servidor', route);
    }
    return res ?? {};
  }
}
