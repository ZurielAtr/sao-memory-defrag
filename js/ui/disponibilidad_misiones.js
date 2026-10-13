// D80: presentación de contenido y progreso. La disponibilidad procede de
// user/quest.available; quest_appearance sigue siendo la deducción local de D55.
const MOTIVOS = {
  ssbp_v3: 'Las animaciones de esta misión aún no están disponibles',
  sorteo: 'El modo de esta misión está pendiente de implementar',
  sin_enemigos: 'Esta misión aún no tiene un recorrido jugable',
  sin_maestro: 'Faltan datos necesarios para jugar esta misión',
};

export function clavesDisponibles(filas) {
  return Array.isArray(filas) ? new Set(filas.map(r=>`${r.quest_id}:${r.difficulty}`)) : null;
}

export function estadoMision(m, dificultad, disponibles, indice = new Map()) {
  const ficha = m?.dificultades?.[dificultad];
  if (!ficha) return { iniciar: false, soportada: false, motivo: 'Esta dificultad no está disponible' };
  const motivos = Array.isArray(m.motivos) ? m.motivos : [];
  const historia = m.tipo === 'Story' && motivos.every(r=>r==='solo_historia');
  const soportada = m.jugable === true || historia;
  const desbloqueada = disponibles?.has(`${m.id}:${dificultad}`) ?? false;
  const req = ficha.requiere;
  let motivo = '';
  if (!soportada) motivo = MOTIVOS[Object.keys(MOTIVOS).find(r=>motivos.includes(r))] ?? 'Este contenido está pendiente de implementar';
  else if (!disponibles) motivo = 'No se pudo consultar el progreso de la partida';
  else if (!desbloqueada) {
    const previo = indice.get(req?.[0]);
    motivo = req ? `Completa ${previo?.etiqueta ?? `la misión ${req[0]}`} en dificultad ${req[1]}` : 'Esta misión todavía está bloqueada';
  }
  return { iniciar: soportada && desbloqueada, soportada, desbloqueada, historia, motivo, requisito: req ?? null };
}

export function estadoCapitulo(misiones, dificultad, disponibles, indice) {
  if (!misiones.length) return { abrir: false, motivo: 'No hay misiones en esta dificultad' };
  const estados = misiones.map(m=>estadoMision(m,dificultad,disponibles,indice));
  return { abrir: true, disponible: estados.some(r=>r.iniciar),
    motivo: estados.some(r=>r.iniciar) ? '' : estados.find(r=>r.soportada)?.motivo ?? estados[0].motivo };
}
