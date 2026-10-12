// Cuadros absolutos, intervalo (antes, ahora]. Al iniciar usar antes=-1 para incluir el cuadro cero.
export function sonidosCruzados(lista, antes, ahora, duracion, loop = false) {
  if (!lista?.length || !Number.isFinite(antes) || !Number.isFinite(ahora) || ahora <= antes || !(duracion > 0)) return [];
  const out = [];
  const desde = loop ? Math.max(0, Math.floor(Math.max(0, antes) / duracion)) : 0;
  const hasta = loop ? Math.floor(ahora / duracion) : 0;
  for (let vuelta = desde; vuelta <= hasta; vuelta++) {
    for (const e of lista) {
      const f = e.cuadro + vuelta * duracion;
      if (e.cuadro >= 0 && e.cuadro < duracion && f > antes && f <= ahora) out.push(e);
    }
  }
  return out;
}
