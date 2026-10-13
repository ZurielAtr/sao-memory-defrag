// D82: AdventureLayer busca resumen principal de quest y después historia de personaje.
export function metadataHistorias(quests,personajes){
  const out={};
  for(const [grupos,principal] of [[quests,true],[personajes,false]])for(const grupo of grupos??[])for(const r of grupo.f1??[]){
    if(!Number.isInteger(r.f0)||r.f0<=0)continue;
    if(out[r.f0]){out[r.f0].permitirSalto ||= !!r[principal?'f5':'f4'];continue;}
    out[r.f0]={titulo:r.f1??'',resumen:r[principal?'f6':'f5']??'',permitirSalto:!!r[principal?'f5':'f4']};
  }
  return out;
}
