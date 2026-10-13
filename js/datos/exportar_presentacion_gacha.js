// D90: campos de Character usados por FUN_009c4894 y FUN_009c6f04.
// Sólo metadatos del recurso importado; voces/imágenes siguen en los assets del jugador.
export async function presentacionPersonajeGacha(fuente, personaje) {
  const id = personaje.f0;
  const base = `images/character/character_${id}.png`;
  let retrato = id;
  const tamano = await fuente.tamano(base);
  if ((tamano === null || tamano < 2000) && await fuente.existe(`images/character/character_${id}_1.png`)) retrato = `${id}_1`;
  return { grupoVoz:personaje.f27 ?? 0, vozObtencion:personaje.f62 ?? 0,
    vozTipos:{30:personaje.f73 ?? 0,31:personaje.f74 ?? 0,32:personaje.f75 ?? 0},
    musica:personaje.f81 ?? 0,retrato };
}
