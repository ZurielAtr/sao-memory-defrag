// Backend HTTP (F3, D41): mismo contrato que LocalBackend, para conectar un servidor real (R8).
//
// PROVISIONAL: el juego original usaba su propio protocolo (RealDriver; cabeceras, firma y
// cifrado sin estudiar). Esto define el protocolo de NUESTRO futuro servidor:
//   POST <baseUrl>/<ruta>   cuerpo JSON = params   respuesta JSON = {data} | {} | {error: {code, message}}
// La sesión va en la cabecera `Authorization: Bearer <token>` si se configura uno.

export class HttpBackend {
  constructor({ baseUrl, fetch: fetchFn = globalThis.fetch, token = null } = {}) {
    if (!baseUrl) throw new TypeError('HttpBackend necesita baseUrl');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetch = fetchFn;
    this.token = token;
  }

  async handle(route, params) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/${route}`, {
        method: 'POST', headers, body: JSON.stringify(params ?? {}),
      });
    } catch (e) {
      return { error: { code: 'red', message: `sin conexión: ${e.message}` } };
    }
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return { error: { code: 'respuesta_invalida', message: `HTTP ${res.status}: no es JSON` } };
    }
    if (!res.ok && !body.error) {
      return { error: { code: `http_${res.status}`, message: `HTTP ${res.status}` } };
    }
    return body;
  }
}
