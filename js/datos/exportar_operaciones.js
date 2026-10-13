// D85: tablas de Herrería; getters/filtros documentados en docs/*-nativo-d85.md.
export async function catalogoOperaciones(fuente){
 const fortalecerPrecios={},fortalecerMateriales={},evolucion={};
 for(const g of await fuente.md('equipment_strengthen_price')??[])fortalecerPrecios[g.f0]=Object.fromEntries((g.f1??[]).map(r=>[r.f0,r.f2??0]));
 for(const g of await fuente.md('equipment_strengthen_item')??[])fortalecerMateriales[g.f0]=(g.f1??[]).map(r=>({nivel:r.f2,id:r.f3,cantidad:r.f4??0}));
 for(const r of await fuente.md('equipment_evolve_price')??[])evolucion[r.f0]={col:r.f1,copias:r.f0};
 const campanas=(await fuente.md('equipment_strengthen_campaign')??[]).map(r=>({factor:r.f1??0,inicio:r.f4??0,fin:r.f5??0}));
 const intercambio=(await fuente.md('equipment_exchange')??[]).map(r=>({id:r.f0,lingote:r.f1,inicio:r.f2??0,fin:r.f3??0}));
 return {fortalecerPrecios,fortalecerMateriales,evolucion,campanas,intercambio};
}
