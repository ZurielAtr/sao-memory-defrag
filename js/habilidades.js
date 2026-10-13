// D79: progreso de habilidades por instancia. Los contratos de compra del
// backend local son propios; selectores/reemplazos se documentan en docs/*d79.md.
const entero = (n) => Number.isSafeInteger(n) && n >= 0;
const lista = (x) => Array.isArray(x) ? x : [];
export const id32 = (n) => Number.isInteger(n) && n >= -2147483648 && n <= 4294967295 ? n >>> 0 : 0;

/** Ficha adquirida, siempre limitada a la oferta de este personaje. */
export function ranurasAdquiridas(personaje, instancia, catalogo) {
  const ofertas = catalogo?.ranuras?.[personaje?.id ?? instancia?.character_id] ?? [];
  return lista(instancia?.slot_skill).flatMap((r) => {
    const id = id32(r?.master_slot_skill_id);
    const oferta = ofertas.find((o) => o.ranura === r?.slot && o.id === id);
    const nivel = r?.level;
    if (!oferta || !entero(nivel) || nivel === 0 || nivel > oferta.maximo) return [];
    const ficha = catalogo?.fichas?.[id]?.[nivel];
    return ficha ? [{ ...ficha, id, nivel, ranura: r.slot }] : [];
  });
}

/** 00693898 y 00693368: registros primero; reemplazos por posición después. */
export function estadoHabilidades(personaje, instancia, catalogo) {
  const pasivas = lista(personaje?.pasivas).slice(0, 3).map((id) => ({ id: id32(id), estado: 0 }));
  const activas = lista(personaje?.activas).map((id) => ({ id: id32(id), nivel: 0 }));
  for (const r of lista(instancia?.passive_skill)) {
    const id = id32(r?.master_passive_skill_id), p = pasivas.find((p) => id > 0 && p.id === id);
    if (p && Number.isInteger(r.status) && r.status >= -2147483648 && r.status <= 2147483647) p.estado = r.status;
  }
  for (const r of lista(instancia?.active_skill)) {
    const id = id32(r?.master_active_skill_id), a = activas.find((a) => id > 0 && a.id === id);
    if (a && entero(r.level)) a.nivel = r.level;
  }
  const ranuras = ranurasAdquiridas(personaje, instancia, catalogo);
  const extras = [];
  for (const r of ranuras) {
    if (r.pasivaPos > 0 && r.pasivaPos <= pasivas.length && r.pasiva > 0) {
      pasivas[r.pasivaPos - 1] = { id: r.pasiva, estado: 2 };
    } else if (r.pasivaPos === 0 && r.pasiva > 0) extras.push(r.pasiva);
    if (r.activaPos > 0 && r.activaPos <= activas.length && r.activa > 0) {
      activas[r.activaPos - 1] = { ...activas[r.activaPos - 1], id: r.activa };
    }
  }
  return { pasivas, activas, extras, ranuras };
}

/** Una animación puede tener varias fichas con costes distintos: seleccionar por ID. */
export function activasParaCombate(personaje, instancia, catalogo) {
  const e = estadoHabilidades(personaje, instancia, catalogo);
  const fichas = e.activas.map((a) => a.nivel > 0 ? catalogo?.activas?.[a.id] ?? null : null);
  return { ranuras: fichas.map((f) => f?.animacion ?? null),
    nombres: fichas.filter(Boolean).map((f) => f.animacion),
    datos: Object.fromEntries(fichas.filter(Boolean).map((f) => [f.animacion, { ...f }])) };
}

/** Agrupa materiales antes de comprobar existencias; rechaza costes inválidos. */
export function agruparCostes(filas) {
  const out = new Map();
  for (const r of lista(filas)) {
    if (!entero(r?.id) || !entero(r?.cantidad) || (r.cantidad > 0 && r.id === 0)) return null;
    if (r.cantidad === 0) continue;
    const n = (out.get(r.id) ?? 0) + r.cantidad;
    if (!entero(n)) return null;
    out.set(r.id, n);
  }
  return [...out].map(([id, cantidad]) => ({ id, cantidad }));
}

export function inventarioMateriales(cuenta) {
  return Array.isArray(cuenta?.items) ? Object.fromEntries(cuenta.items.map((r) => [r.item_id, r.count])) : cuenta?.items ?? {};
}

const bloqueo = (code, motivo, extra = {}) => ({ disponible: false, code, motivo, costes: [], ...extra });
export function comprobarMateriales(cuenta, filas) {
  const costes = agruparCostes(filas);
  if (!costes) return bloqueo('coste_invalido', 'El coste de esta mejora no está disponible');
  const items = inventarioMateriales(cuenta);
  const faltan = costes.filter((r) => !entero(items[r.id] ?? 0) || (items[r.id] ?? 0) < r.cantidad);
  return faltan.length ? bloqueo('materiales_insuficientes', 'Faltan materiales', { costes, faltan })
    : { disponible: true, costes, motivo: '' };
}

/** 00b427f4: ambos pares AND, límite roto/rareza y habilidad base desbloqueada. */
export function costesRanura(ficha, elegido = null) {
  const filas = lista(ficha?.costes), opciones = filas.filter((r) => r.alternativa === 1);
  if (filas.some((r) => r.alternativa != null && r.alternativa !== 0 && r.alternativa !== 1)) {
    return bloqueo('coste_invalido', 'Tipo de coste pendiente de implementar');
  }
  if (opciones.length && !opciones.some((r) => r.id === elegido)) {
    return bloqueo('material_a_elegir', 'Elige uno de los materiales alternativos', { opciones });
  }
  if (!opciones.length && elegido != null) return bloqueo('material_invalido', 'Esta mejora no permite elegir material');
  return { disponible: true, opciones, costes: filas.filter((r) => r.alternativa !== 1 || r.id === elegido) };
}

export function consultarRanura(personaje, instancia, catalogo, cuenta, slot, elegido = null) {
  const oferta = (catalogo?.ranuras?.[personaje?.id ?? instancia?.character_id] ?? []).find((o) => o.ranura === slot);
  if (!oferta) return bloqueo('ranura_inexistente', 'Esta ranura no está disponible para el personaje');
  const actual = lista(instancia?.slot_skill).find((r) => r?.slot === slot);
  if (actual && id32(actual.master_slot_skill_id) !== oferta.id) return bloqueo('ranura_invalida', 'La ranura guardada no coincide con el personaje');
  const nivel = actual?.level ?? 0;
  if (!entero(nivel)) return bloqueo('ranura_invalida', 'Nivel de ranura inválido');
  if (nivel >= oferta.maximo) return bloqueo('ranura_maxima', 'La ranura ya tiene el nivel máximo', { oferta, nivel });
  const siguiente = catalogo?.fichas?.[oferta.id]?.[nivel + 1];
  if (!siguiente) return bloqueo('nivel_inexistente', 'No hay ficha para el siguiente nivel', { oferta, nivel });
  const extra = { oferta, nivel, siguiente, costes: agruparCostes(siguiente.costes) ?? [] };
  if (siguiente.efectoPendiente) return bloqueo('efecto_inexistente', 'Faltan datos del efecto de esta habilidad', extra);
  if (siguiente.asistenciaDatos?.f15 || siguiente.asistenciaDatos?.f17) {
    return bloqueo('asistencia_pendiente', 'El sistema de asistencia de esta habilidad está pendiente', extra);
  }
  for (const r of siguiente.requisitos ?? []) {
    if (r.tipo === 1 && (instancia?.unlocked_limit_break_node_count ?? 0) < r.valor) {
      return bloqueo('limite_requerido', `Requiere ${r.valor} nodos de límite desbloqueados`, extra);
    }
    if (r.tipo === 2 && (personaje?.rareza ?? 0) < r.valor) return bloqueo('rareza_requerida', `Requiere rareza ${r.valor}`, extra);
    if (r.tipo !== 0 && r.tipo !== 1 && r.tipo !== 2) return bloqueo('requisito_desconocido', 'Requisito de ranura pendiente de implementar', extra);
  }
  const estado = estadoHabilidades(personaje, instancia, catalogo);
  if (siguiente.pasivaPos > 0 && !estado.pasivas[siguiente.pasivaPos - 1]?.estado) {
    return bloqueo('pasiva_bloqueada', 'Desbloquea primero la pasiva correspondiente en el árbol', extra);
  }
  if (siguiente.activaPos > 0 && !(estado.activas[siguiente.activaPos - 1]?.nivel >= 2)) {
    return bloqueo('activa_bloqueada', 'Desbloquea primero el nivel 2 de la habilidad activa en el árbol', extra);
  }
  const seleccion = costesRanura(siguiente, elegido);
  if (!seleccion.disponible) return { ...extra, ...seleccion };
  return { ...extra, opciones: seleccion.opciones, ...comprobarMateriales(cuenta, seleccion.costes) };
}

const STATS_NODO = { 1: 'hp', 2: 'mp', 3: 'atk', 4: 'def', 5: 'crit' };

export function nodosDelPersonaje(personaje, catalogo) {
  return (catalogo?.arboles?.[personaje?.arbol] ?? []).map((n) => {
    const valor = catalogo?.valores?.[personaje.id]?.[n.id];
    let descripcion = `Requiere nivel ${n.nivel}`;
    if (STATS_NODO[n.tipo] && Number.isFinite(valor)) descripcion = `${n.nombre} +${valor} · ${descripcion}`;
    if (n.tipo === 11 && n.habilidad) descripcion = `Activa ${n.habilidad.ranura} · nivel ${n.habilidad.nivel} · ${descripcion}`;
    if (n.tipo === 12 && n.habilidad) descripcion = `Pasiva ${n.habilidad.ranura} · ${descripcion}`;
    return { ...n, valor, descripcion };
  });
}

export const DIRECCIONES_LIMITE = [{ id: 1, nombre: 'HP' }, { id: 2, nombre: 'MP' },
  { id: 3, nombre: 'ATK' }, { id: 4, nombre: 'DEF' }, { id: 5, nombre: 'CRIT' }];

export function costeLimite(base, tasa) {
  return Math.floor(Math.fround(Math.fround(base) * Math.fround(tasa)));
}

export function consultarNodo(personaje, instancia, catalogo, cuenta, local, seleccion = {}) {
  const nodos = nodosDelPersonaje(personaje, catalogo), nodo = nodos.find(n=>n.local===local);
  if (!nodo) return bloqueo('nodo_inexistente', 'Este nodo no pertenece al árbol del personaje');
  const extra = { nodo };
  if (nodo.tipo === 0 || lista(instancia?.ability_board).includes(local)) {
    return bloqueo('nodo_adquirido', 'Nodo desbloqueado', { ...extra, adquirido: true });
  }
  if (!entero(instancia?.level) || instancia.level < nodo.nivel) return bloqueo('nivel_requerido', `Requiere nivel ${nodo.nivel}`, extra);
  const padre = nodos.find(n=>n.local===nodo.padre);
  if (nodo.padre && (!padre || (padre.tipo !== 0 && !lista(instancia?.ability_board).includes(nodo.padre)))) {
    return bloqueo('padre_requerido', `Desbloquea primero el nodo anterior (${nodo.padre})`, extra);
  }
  if (nodo.tipo === 9) {
    const filas = catalogo?.costesLimite?.[nodo.id];
    if (!Array.isArray(filas) || !filas.length) return bloqueo('coste_inexistente', 'No hay materiales para esta ruptura', extra);
    const tasa = catalogo?.tasasLimite?.[personaje.rareza] ?? 1;
    const opciones = [...new Map(filas.map(r=>[r.id, { ...r, cantidad: costeLimite(r.cantidad, tasa) }])).values()];
    if (!DIRECCIONES_LIMITE.some(d=>d.id===seleccion?.direccion)) {
      return bloqueo('direccion_requerida', 'Elige la estadística de crecimiento de esta rama', { ...extra, opciones, direcciones: DIRECCIONES_LIMITE });
    }
    const material = seleccion?.material ?? (opciones.length === 1 ? opciones[0].id : null);
    const eleccion = costesRanura({ costes: opciones }, material);
    if (!eleccion.disponible) return { ...extra, ...eleccion, direcciones: DIRECCIONES_LIMITE };
    return { ...extra, opciones, direccion: seleccion.direccion, material, liberacion: instancia.unlocked_ability_release_level ?? 1,
      direcciones: DIRECCIONES_LIMITE, ...comprobarMateriales(cuenta, eleccion.costes) };
  }
  if (nodo.tipo === 10) {
    const ficha = catalogo?.crecimientos?.[personaje.id]?.[nodo.id];
    if (!ficha) return bloqueo('crecimiento_inexistente', 'No hay datos de crecimiento para este personaje', extra);
    const ruptura = nodos.find(n=>n.id===ficha?.ruptura);
    if (!ruptura || !lista(instancia?.ability_board).includes(ruptura.local)) return bloqueo('ruptura_requerida', 'Desbloquea primero la ruptura de esta rama', extra);
    const direccion = lista(instancia?.selected_limit_break_direction).find(r=>r.local_node_id===ruptura.local)?.selected_direction;
    if (!DIRECCIONES_LIMITE.some(d=>d.id===direccion)) return bloqueo('direccion_invalida', 'La rama no tiene una dirección de crecimiento válida', extra);
    const costes = catalogo?.costesCrecimiento?.[catalogo?.gruposCrecimiento?.[personaje.arbol]]?.[direccion];
    if (!Array.isArray(costes)) return bloqueo('coste_inexistente', 'No hay costes de crecimiento para esta dirección', extra);
    const valor = ficha.valores[direccion - 1];
    if (!entero(valor)) return bloqueo('valor_inexistente', 'No hay valor de crecimiento para esta dirección', extra);
    return { ...extra, direccion, valor, liberacion: instancia.unlocked_ability_release_level ?? 1, ...comprobarMateriales(cuenta, costes) };
  }
  if (STATS_NODO[nodo.tipo] && !Number.isSafeInteger(nodo.valor)) return bloqueo('valor_inexistente', 'No hay valor de mejora para este personaje', extra);
  if (nodo.tipo === 11 && !(personaje.activas?.[nodo.habilidad?.ranura - 1] > 0)) return bloqueo('activa_inexistente', 'El personaje no tiene esa habilidad activa', extra);
  if (nodo.tipo === 12 && !(personaje.pasivas?.[nodo.habilidad?.ranura - 1] > 0)) return bloqueo('pasiva_inexistente', 'El personaje no tiene esa pasiva', extra);
  if (![1,2,3,4,5,11,12].includes(nodo.tipo)) return bloqueo('tipo_pendiente', 'Tipo de nodo pendiente de implementar', extra);
  const costesNodo = catalogo?.costesNodos?.[nodo.id];
  if (!Array.isArray(costesNodo)) return bloqueo('coste_inexistente', 'No hay coste para este nodo', extra);
  const actual = instancia?.unlocked_ability_release_level ?? 1;
  const liberacion = Math.max(actual, nodo.nivel);
  let costesNivel = [];
  if (liberacion > actual) {
    const filas = catalogo?.costesLiberacion?.[personaje.arbol];
    if (!Array.isArray(filas) || !filas.some(r=>r.nivel===liberacion)) return bloqueo('liberacion_inexistente', 'No hay coste para liberar este nivel', extra);
    for (let nivel = (actual === 1 ? 0 : actual) + 10; nivel <= liberacion; nivel += 10) {
      const fila = filas.find(r=>r.nivel===nivel);
      if (!fila) return bloqueo('liberacion_inexistente', 'Falta un coste intermedio de liberación', extra);
      costesNivel.push({ id: fila.id, cantidad: fila.cantidad });
    }
  }
  return { ...extra, liberacion, costesNivel, ...comprobarMateriales(cuenta, [...costesNodo, ...costesNivel]) };
}

/** Bonos adquiridos por nodo global; deduplicar progreso para no sumar dos veces. */
export function sumarStatsArbol(base, personaje, instancia, catalogo) {
  const out = { ...base }, adquiridos = new Set(lista(instancia?.ability_board));
  for (const n of nodosDelPersonaje(personaje, catalogo)) {
    const stat = STATS_NODO[n.tipo];
    if (adquiridos.has(n.local) && stat && Number.isSafeInteger(n.valor)) out[stat] = (out[stat] ?? 0) + n.valor;
    if (adquiridos.has(n.local) && n.tipo === 10) {
      const r = lista(instancia?.growth_nodes).find(r=>r.growth_node_id===n.id);
      const stat = STATS_NODO[r?.node_type], valor = catalogo?.crecimientos?.[personaje.id]?.[n.id]?.valores[r?.node_type-1];
      if (stat && Number.isSafeInteger(valor)) out[stat] = (out[stat] ?? 0) + valor;
    }
  }
  return out;
}
