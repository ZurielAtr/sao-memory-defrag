import { rutaWeb } from './rutas.js';
// Carga de la IA de los enemigos (D55): herramientas/exportar_ia.py la divide por patrón en
// web/data/ia/<patrón>.json ({entradas, patrones, enemigos}) con un índice web/data/ia/index.json
// ({id de IA: patrón}). Aquí se cargan solo los patrones que usa la misión y se unen en el mismo
// objeto que antes era web/data/ia.json (D47), el que espera IAEnemigo (ia.js).

/** Une partes {entradas, patrones, enemigos} en un solo objeto. */
export function unirIA(partes) {
  const out = { entradas: {}, patrones: {}, enemigos: {} };
  for (const p of partes) {
    if (!p) continue;
    Object.assign(out.entradas, p.entradas);
    Object.assign(out.patrones, p.patrones);
    Object.assign(out.enemigos, p.enemigos);
  }
  return out;
}

/** Patrones que necesita la misión (IA `ia` de sus enemigos colocados) según el índice. */
export function patronesDeMision(mision, indice) {
  const ids = new Set();
  for (const sc of mision.escenarios ?? []) {
    for (const e of sc.enemigos ?? []) {
      const p = indice[e.ia];
      if (p != null) ids.add(p);
    }
  }
  return [...ids];
}

/** IA de la misión (o null si no hay datos). `base` = carpeta de la IA servida. */
export async function cargarIA(mision, { base = rutaWeb('/data/ia'), fetchFn = globalThis.fetch } = {}) {
  const leer = (url) => fetchFn(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const indice = await leer(`${base}/index.json`);
  if (!indice) return null;
  const partes = await Promise.all(patronesDeMision(mision, indice).map((p) => leer(`${base}/${p}.json`)));
  return unirIA(partes);
}
