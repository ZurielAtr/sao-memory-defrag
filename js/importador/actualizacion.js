// Marca durable antes de reemplazar datos: una interrupción conserva recursos y permite reintentar.
export async function actualizarImportacion(estado,{version,generar,escribir,ahora=()=>new Date().toISOString()}){
  const pendiente={...estado,regenerando:{version,fecha:ahora()}};
  await escribir(pendiente);
  await generar();
  const final={...pendiente,version,regenerado:ahora()};delete final.regenerando;
  await escribir(final);
  return final;
}
