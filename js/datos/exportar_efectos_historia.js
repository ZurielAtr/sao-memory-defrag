// D81: f16/f17 referencian esta tabla; no son códigos de efecto directamente.
export async function exportarEfectosHistoria(fuente,salida){
  const out={};
  for(const r of await fuente.md('adventure_story_effect')??[]){
    if(!Number.isInteger(r.f0)||r.f0<=0)continue;
    out[r.f0]={tipo:r.f1??0,carpeta:r.f2??null,animacion:r.f3??null,modo:r.f4??0,x:r.f5??0,y:r.f6??0};
  }
  await salida.escribir('historias/efectos.json',JSON.stringify(out));
}
