// IA de los enemigos (D47, D55): port de herramientas/exportar_ia.py (D68, mismo resultado). Salidas: ia/<patrón>.json
// e ia/index.json, solo de las IA que usan las misiones exportadas. Qué es cada campo: en el .py.

import { get, o, ordenar, aJSON } from './py.js';
import { eventos, porId } from './comun.js';

// Campos mal decodificados por el conversor (vectores de basura): se omiten.
const BASURA = { entrada: ['f2'], accion: ['f39'], disparador: ['f11'], modo: ['f5'] };

/** Máximo del medidor de los 25 estados de un enemigo (D62, FUN_0082d184). */
function estadosMax(v) {
  const m = Array(25).fill(0);
  m.splice(0, 8, ...v.slice(19, 27));
  m[0x11] = v[27];
  m[0x12] = v[17];
  m[0x13] = v[18];
  return m;
}

const limpio = (rec, tipo) => Object.fromEntries(Object.entries(rec).filter(([k]) => !BASURA[tipo].includes(k)));

/** resumen: lo que devuelve exportarMisiones (usadas, maestros, pares). */
export async function exportarIA(fuente, salida, stats, resumen) {
  const ai = await fuente.md('ai');
  const entradas = porId(ai.f0);
  const patrones = porId(ai.f1);
  const enemies = await fuente.enemigos();
  const nombres = new Map((await fuente.md('unit_animation_name')).map((r) => [r.f0, r.f1]));
  const attacks = porId(await fuente.md('attack'));
  const usadas = ordenar([...resumen.usadas]);

  const outEntradas = new Map(), outPatrones = new Map(), outEnemigos = new Map();
  for (const aid of usadas) {
    const e = entradas.get(aid);
    if (e === undefined) continue;
    outEntradas.set(aid, limpio(e, 'entrada'));
    const p = patrones.get(e.f1);
    if (outPatrones.has(e.f1)) continue;
    outPatrones.set(e.f1, {
      acciones: (get(p, 'f1', []) ?? []).map((a) => limpio(a, 'accion')),
      modos: (get(p, 'f2', []) ?? []).map((m) => limpio(m, 'modo')),
      disparadores: (get(p, 'f3', []) ?? []).filter((t) => { const f0 = get(t, 'f0', 0); return f0 === 0 || resumen.usadas.has(f0); }).map((t) => limpio(t, 'disparador')),
    });
  }
  for (const mid of ordenar([...resumen.maestros])) {
    const r = enemies.get(mid);
    const fila = (stats[String(mid)] ?? [])[0];
    const v = (n) => [...(fila ? fila.v : []), ...Array(n).fill(0)];
    outEnemigos.set(mid, {
      nombresBase: nombres.has(get(r, 'f3')) ? nombres.get(get(r, 'f3')) : [],
      ranuras: get(r, 'f14', []),
      eventos: eventos(get(r, 'f13'), attacks),
      guardia: [get(r, 'f27', 0), get(r, 'f28', 0)],
      velocidad: o((fila ? fila.v : Array(9).fill(0))[8] / 100, 1),
      medidor: v(28)[27],
      radio: get(r, 'f9', 0),
      estadosMax: estadosMax(v(28)),
      paso: v(15)[13],
      salto: v(15)[14],
    });
  }

  // División por patrón (D55).
  const partes = new Map();
  for (const [aid, e] of outEntradas) {
    if (!partes.has(e.f1)) partes.set(e.f1, { entradas: {}, patrones: { [e.f1]: outPatrones.get(e.f1) }, enemigos: {} });
    partes.get(e.f1).entradas[aid] = e;
  }
  for (const [aid, mid] of resumen.pares.values()) {
    const e = outEntradas.get(aid);
    if (e !== undefined && outEnemigos.has(mid)) partes.get(e.f1).enemigos[mid] = outEnemigos.get(mid);
  }
  await salida.vaciar?.('ia');
  for (const [pid, parte] of partes) await salida.escribir(`ia/${pid}.json`, aJSON(parte));
  await salida.escribir('ia/index.json', aJSON(Object.fromEntries([...outEntradas].map(([aid, e]) => [aid, e.f1]))));
}
