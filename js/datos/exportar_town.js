// Town no tiene un CSB raíz: el cliente compone background y town_object_pattern.
// Se conservan los campos nativos (incluidos signos, capas vacías y orden) para que
// el compositor pueda aplicar los contratos confirmados sin perder información.
// No se eligen eventos históricos ni se generan residentes/salas de servidor.
export async function catalogoTown(fuente) {
  const backgrounds = await fuente.md('town_background') ?? [];
  const predeterminado = backgrounds.find((r) => r.f0 === 1);
  const fondo = predeterminado
    ? (await fuente.md('background') ?? []).find((r) => r.f0 === predeterminado.f1)
    : null;
  return {
    fondo: fondo ? { id: fondo.f0, datos: fondo } : null,
    objetos: await fuente.md('town_object') ?? [],
    patrones: await fuente.md('town_object_pattern') ?? [],
    botones: await fuente.md('town_object_button') ?? [],
  };
}
