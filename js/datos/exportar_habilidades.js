// D79: catálogo de habilidades. No constituye progreso de una cuenta.
import { id32 } from '../habilidades.js';
import { skillData } from './exportar_personajes.js';
import { porId } from './comun.js';

export async function catalogoHabilidades(fuente) {
  const ranuras = {}, fichas = {}, activas = {};
  for (const g of await fuente.md('character_slot_skill') ?? []) {
    ranuras[g.f0] = (g.f1 ?? []).map((r) => ({ ranura: r.f2, id: id32(r.f3), maximo: r.f4 ?? 0 }));
  }
  for (const g of await fuente.md('slot_skill') ?? []) {
    const id = id32(g.f0), niveles = fichas[id] = {};
    for (const r of g.f1 ?? []) niveles[r.f1] = {
      nombre: r.f2 ?? '', texto: r.f3 ?? '', icono: r.f8 ?? '',
      pasivaPos: r.f4 ?? 0, pasiva: id32(r.f5 ?? 0), activaPos: r.f6 ?? 0, activa: id32(r.f7 ?? 0),
      costes: (r.f10 ?? []).map((c) => ({ id: c.f3 ?? 0, cantidad: c.f4 ?? 0, alternativa: c.f5 ?? 0 })),
      requisitos: [{ tipo: r.f11 ?? 0, valor: r.f12 ?? 0 }, { tipo: r.f13 ?? 0, valor: r.f14 ?? 0 }],
      categoria: r.f16 ?? 0, asistenciaDatos: { f15: r.f15 ?? 0, f17: r.f17 ?? 0 },
    };
  }
  const attacks = porId(await fuente.md('attack'));
  for (const r of await fuente.md('active_skill') ?? []) {
    activas[id32(r.f0)] = { ...skillData(r.f24, [r], attacks), animacion: `skill_${r.f24}` };
  }
  const filasPasivas = await fuente.md('passive_skill') ?? [];
  const pasivas = new Set(filasPasivas.map(r=>id32(r.f0)));
  const nombresPasivas = Object.fromEntries(filasPasivas.map(r=>[id32(r.f0),r.f1??'']));
  for (const grupo of Object.values(fichas)) for (const f of Object.values(grupo)) {
    if ((f.pasiva > 0 && !pasivas.has(f.pasiva)) || (f.activa > 0 && !activas[f.activa])) f.efectoPendiente = true;
  }
  const arboles = {}, valores = {}, costesNodos = {}, costesLiberacion = {}, costesLimite = {};
  const nombres = { 0: 'Inicio', 1: 'HP', 2: 'MP', 3: 'ATK', 4: 'DEF', 5: 'CRIT',
    9: 'Ruptura de límite', 10: 'Crecimiento de límite', 11: 'Habilidad activa', 12: 'Pasiva' };
  for (const g of await fuente.md('ability_board_node') ?? []) {
    const nodos = arboles[g.f0] = (g.f1 ?? []).map((n) => ({ id: n.f0, local: n.f2,
      padre: n.f3 ?? 0, tipo: n.f4 ?? 0, nivel: n.f5 ?? 1, nombre: nombres[n.f4 ?? 0] ?? 'Nodo',
      etiqueta: ({ 11: 'SS', 12: 'BS', 9: 'Lím.', 10: '+' })[n.f4] ?? nombres[n.f4 ?? 0] }));
    // Contrato del servidor local PROVISIONAL: el cliente recibe skill_slot del
    // servidor. No hay asignación de ranuras en ability_board_node. Ver diseño D79.
    const habilidades = nodos.filter(n=>n.tipo===11).sort((a,b)=>a.nivel-b.nivel || a.local-b.local);
    const politica = [{ ranura: 1, nivel: 2 }, { ranura: 3, nivel: 1 }, { ranura: 2, nivel: 2 }, { ranura: 3, nivel: 2 }];
    if (habilidades.length === 4) habilidades.forEach((n,i)=>{ n.habilidad = politica[i]; });
    nodos.filter(n=>n.tipo===12).sort((a,b)=>a.nivel-b.nivel || a.local-b.local)
      .forEach((n,i)=>{ n.habilidad = { ranura: i + 1, estado: 1 }; });
  }
  for (const g of await fuente.md('ability_board_normal_node') ?? []) {
    valores[g.f0] = Object.fromEntries((g.f1 ?? []).map((r) => [r.f1, r.f2 ?? 0]));
  }
  for (const g of await fuente.md('ability_board_necessary_item') ?? []) {
    costesNodos[g.f0] = (g.f1 ?? []).map((r) => ({ id: r.f2 ?? 0, cantidad: r.f3 ?? 0 }));
    costesLimite[g.f0] = (g.f1 ?? []).flatMap((r) => [r.f5, r.f2, r.f4].filter(id=>id>0)
      .map(id=>({ id, cantidad: r.f3 ?? 0, alternativa: 1 })));
  }
  for (const g of await fuente.md('ability_board_release_level_necessary_item_2') ?? []) {
    costesLiberacion[g.f0] = (g.f1 ?? []).map((r) => ({ nivel: r.f2, id: r.f3 ?? 0, cantidad: r.f4 ?? 0 }));
  }
  const tasasLimite = Object.fromEntries((await fuente.md('ability_board_limit_break_item_amount_rate') ?? []).map(r=>[r.f0,r.f1]));
  const gruposCrecimiento = Object.fromEntries((await fuente.md('ability_board') ?? []).map(r=>[r.f0,r.f1]));
  const crecimientos = {}, costesCrecimiento = {};
  for (const g of await fuente.md('ability_board_limit_break_growth_node') ?? []) crecimientos[g.f0] = Object.fromEntries((g.f1 ?? [])
    .map(r=>[r.f1, { ruptura: r.f2, valores: Array.from({length:6},(_,i)=>r[`f${i+3}`] ?? 0) }]));
  for (const g of await fuente.md('ability_board_limit_break_growth_node_item') ?? []) {
    const grupo = costesCrecimiento[g.f0] = {};
    for (const r of g.f1 ?? []) (grupo[r.f2] ??= []).push({ id: r.f3 ?? 0, cantidad: r.f4 ?? 0 });
  }
  return { ranuras, fichas, activas, nombresPasivas, arboles, valores, costesNodos, costesLiberacion,
    costesLimite, tasasLimite, gruposCrecimiento, crecimientos, costesCrecimiento };
}
