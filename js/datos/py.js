// Ayudas para portar los exportadores de Python sin cambiar sus resultados (D68): redondeo de Python
// (round, mitad al par, sobre el valor binario exacto), "verdad" de Python y división entera.

/** round(x, n) de Python: mitad al par sobre el valor exacto del double; n = 0 da un entero como round(x). */
export function pyRound(x, n = 0) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return x;
  if (n === 0) {
    const f = Math.floor(x);
    const d = x - f; // exacto
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }
  const ax = Math.abs(x);
  if (ax >= 2 ** 52) return x; // ya es entero
  // Expansión decimal exacta (un double con |x| < 2^52 tiene a lo sumo ~1074 decimales, pero los que
  // pasan de 100 están por debajo de 1e-30 y redondean a 0 sin empate posible).
  const s = ax.toFixed(100);
  const p = s.indexOf('.');
  const ent = s.slice(0, p);
  const dec = s.slice(p + 1);
  let cab = ent + dec.slice(0, n); // dígitos que se quedan
  const resto = dec.slice(n);
  const primero = resto.charCodeAt(0) - 48;
  let sube = false;
  if (primero > 5) sube = true;
  else if (primero === 5) {
    if (/[1-9]/.test(resto.slice(1))) sube = true;
    else sube = (cab.charCodeAt(cab.length - 1) - 48) % 2 === 1; // empate exacto: al par
  }
  if (sube) {
    const ds = cab.split('');
    let i = ds.length - 1;
    while (i >= 0) {
      if (ds[i] === '9') { ds[i] = '0'; i--; } else { ds[i] = String.fromCharCode(ds[i].charCodeAt(0) + 1); break; }
    }
    cab = (i < 0 ? '1' : '') + ds.join('');
  }
  const corte = cab.length - n;
  const v = parseFloat(`${cab.slice(0, corte)}.${cab.slice(corte)}`);
  return x < 0 ? -v : v;
}

/** bool(x) de Python para valores de JSON: 0, "", null, [], {} son falsos. */
export function verdad(x) {
  if (x == null || x === false || x === 0 || x === '' || Number.isNaN(x)) return false;
  if (Array.isArray(x)) return x.length > 0;
  if (typeof x === 'object' && !(x instanceof Map) && !(x instanceof Set)) return Object.keys(x).length > 0;
  if (x instanceof Map || x instanceof Set) return x.size > 0;
  if (typeof x === 'bigint') return x !== 0n;
  return true;
}

/** `a or b` de Python. */
export const o = (a, b) => (verdad(a) ? a : b);

/** a // b de Python (enteros). */
export const div = (a, b) => Math.floor(a / b);

/** dict.get(k, porDefecto) de Python sobre un objeto de JSON (falta = porDefecto, None = null; null se devuelve tal cual). */
export const get = (obj, k, porDefecto = null) => (obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : porDefecto);

/** str(v) de Python para lo que se mete en textos (None → 'None'). */
export const str = (v) => (v == null ? 'None' : v === true ? 'True' : v === false ? 'False' : String(v));

/** a == b de Python entre valores de JSON (dicts y listas por contenido). */
export function igual(a, b) {
  if (a === b) return true;
  if (typeof a === 'bigint' || typeof b === 'bigint') return Number(a) === Number(b);
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => igual(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && igual(a[k], b[k]));
}

/** json.dumps(v, ensure_ascii=False, indent=1) de Python (los float con valor entero salen sin ".0"). */
export const aJSONIndentado = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? Number(x) : x), 1);

/** isinstance(v, int) para lo que sale de la master data (un float con valor entero también cuenta). */
export const esEntero = (v) => (typeof v === 'number' && Number.isInteger(v)) || typeof v === 'bigint';

/** sorted() estable con clave (tuplas: arrays comparados elemento a elemento; null/false antes que true). */
export function ordenar(lista, clave = (x) => x) {
  const cmp = (a, b) => {
    if (Array.isArray(a)) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const c = cmp(a[i], b[i]);
        if (c) return c;
      }
      return a.length - b.length;
    }
    if (typeof a === 'boolean') a = Number(a);
    if (typeof b === 'boolean') b = Number(b);
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0; // por unidades UTF-16
    return a < b ? -1 : a > b ? 1 : 0;
  };
  return lista.map((x, i) => [clave(x), i, x]).sort((p, q) => cmp(p[0], q[0]) || p[1] - q[1]).map((p) => p[2]);
}

/** JSON con los BigInt (int64 de la master data) como números, como los escribe Python. */
export function aJSON(v) {
  return JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? Number(x) : x));
}

/** Lo que recorre `for x in v` de Python: listas, claves de un dict o caracteres de un texto (null = nada). */
export function iterar(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return [...v];
  if (typeof v === 'object') return Object.keys(v);
  throw new TypeError(`no se puede recorrer ${typeof v}`);
}
