// D85: vistas previas puras. Reglas nativas y política de persistencia en docs/operaciones-d85.md.
import {RANURAS_EQUIPO,equipoCompatible,statsEquipo} from './equipo.js';
const entero=n=>Number.isSafeInteger(n)&&n>=0;
export const MODOS_EQUIPO=Object.freeze(['strengthen','evolve','sell','exchange']);
export const TITULOS_EQUIPO={strengthen:'Fortalecer',evolve:'Evolucionar',sell:'Vender',exchange:'Intercambiar'};
export function equipado(cuenta,uid){return (cuenta.characters??[]).some(c=>Object.values(RANURAS_EQUIPO).some(f=>c[f]===uid));}
export function materialesCuenta(cuenta){return Array.isArray(cuenta.items)?Object.fromEntries(cuenta.items.map(r=>[r.item_id,r.count])):(cuenta.items??{});}
export function precioVentaEquipo(ficha,nivel){
 if(!entero(ficha?.precioVenta)||!entero(nivel)||nivel<1)return null;
 // 00615234: aritmética float32 y floor; no redondear al entero más cercano.
 return Math.max(0,Math.floor(Math.fround(Math.fround(ficha.precioVenta)+Math.fround(Math.fround(ficha.precioVenta*(nivel-1))*Math.fround(.05)))));
}
export function normalizarOperacion(modo,p={}){
 if(modo==='strengthen')return {equipment_uid:p.equipment_uid,level:p.level};
 if(modo==='evolve')return {equipment_uid:p.equipment_uid,material_uids:Array.isArray(p.material_uids)?[...p.material_uids].sort((a,b)=>a-b):[]};
 if(modo==='sell')return {equipment_uids:Array.isArray(p.equipment_uids)?[...p.equipment_uids].sort((a,b)=>a-b):[]};
 if(modo==='exchange')return {equipment_id:p.equipment_id,material_uids:Array.isArray(p.material_uids)?[...p.material_uids].sort((a,b)=>a-b):[]};
 return {};
}
export function consultarOperacion(master,cuenta,modo,p={},ahora=Date.now()){
 const params=normalizarOperacion(modo,p),cat=master.data.operaciones??{},items=materialesCuenta(cuenta);
 const q={modo,params,permitida:false,code:'operacion_invalida',motivo:'Operación desconocida',col:0,materiales:[],consumir:[],recibir:[],destino:null,nivel:null};
 const rechazar=(code,motivo)=>Object.assign(q,{code,motivo});
 const obtener=uid=>(cuenta.equipment??[]).find(e=>e.uid===uid);
 const pieza=obtener(params.equipment_uid),ficha=pieza&&master.equipo(pieza.equipment_id);
 const seleccion=modo==='sell'?params.equipment_uids:params.material_uids;
 if(!MODOS_EQUIPO.includes(modo))return q;
 if(modo==='strengthen'||modo==='evolve'){
  if(!entero(params.equipment_uid)||params.equipment_uid===0||!pieza||!ficha)return rechazar('equipo_ajeno','Selecciona una pieza de tu inventario');
  if(!entero(pieza.level)||pieza.level<1||pieza.level>ficha.nivelMax)return rechazar('nivel_invalido','El nivel de esta pieza no es válido');
  q.origen={...pieza};q.destino=pieza.equipment_id;
 }
 if(modo==='strengthen'){
  if(!entero(params.level)||params.level<=pieza.level||params.level>ficha.nivelMax)return rechazar('nivel_invalido','Elige un nivel mayor al actual y dentro del máximo');
  q.nivel=params.level;
  const precios=cat.fortalecerPrecios?.[ficha.rareza],materiales=cat.fortalecerMateriales?.[ficha.grupoFortalecer]??[];
  if(!precios)return rechazar('datos_incompletos','Faltan las tablas de fortalecimiento de esta pieza');
  const coste={};
  for(let n=pieza.level+1;n<=params.level;n++){
   if(!entero(precios[n]))return rechazar('datos_incompletos',`Falta el precio para el nivel ${n}`);
   q.col+=precios[n];
   for(const r of materiales.filter(r=>r.nivel===n)){
    if(!entero(r.cantidad)||r.cantidad===0||!master.objeto(r.id))return rechazar('datos_incompletos','Hay un material de mejora desconocido');
    coste[r.id]=(coste[r.id]??0)+r.cantidad;
   }
  }
  q.materiales=Object.entries(coste).map(([id,cantidad])=>({id:Number(id),cantidad}));
  const segundos=Math.floor(ahora/1000),camp=(cat.campanas??[]).find(r=>r.inicio<=segundos&&(r.fin===0||segundos<=r.fin));
  q.factorCampana=camp?camp.factor/10000:1;
  if(!Number.isFinite(q.factorCampana)||q.factorCampana<0)return rechazar('datos_incompletos','La campaña de mejora contiene un coste inválido');
  q.col=Math.trunc(q.col*q.factorCampana);
 }else if(modo==='evolve'){
  const destino=master.equipo(ficha.evolucion);
  if(!destino||ficha.rareza>=ficha.rarezaMax)return rechazar('sin_evolucion','Esta pieza no tiene una evolución disponible');
  q.destino=ficha.evolucion;q.nivel=1;
  if(pieza.level!==ficha.nivelMax)return rechazar('nivel_insuficiente','Fortalece primero la pieza hasta su nivel máximo');
  const regla=cat.evolucion?.[ficha.rareza];
  if(!regla||!entero(regla.col)||!entero(regla.copias))return rechazar('datos_incompletos','Faltan los requisitos de evolución');
  q.col=regla.col;q.copias=regla.copias;
  if(seleccion.length!==regla.copias)return rechazar('copias_insuficientes',`Selecciona ${regla.copias} copias adicionales de la misma pieza`);
  for(const c of cuenta.characters??[])for(const [slot,field]of Object.entries(RANURAS_EQUIPO)){
   if(c[field]===pieza.uid&&!equipoCompatible(master.personaje(c.character_id),destino,slot))return rechazar('equipo_incompatible','La evolución no es compatible con el personaje que tiene equipada esta pieza');
  }
 }else if(modo==='sell'){
  if(!seleccion.length||seleccion.length>100)return rechazar('seleccion_invalida','Selecciona entre 1 y 100 piezas');
 }else{
  const destino=master.equipo(params.equipment_id),oferta=cat.intercambio?.find(r=>r.id===params.equipment_id);
  if(!destino||!oferta)return rechazar('destino_invalido','Selecciona un destino del catálogo de intercambio');
  q.destino=params.equipment_id;q.nivel=1;
  if(cuenta.equipment_exchanged_ids?.includes(params.equipment_id))return rechazar('intercambio_repetido','Esta arma ya se intercambió en tu partida');
  if(seleccion.length!==4)return rechazar('copias_insuficientes','Selecciona cuatro armas de rareza 4 o superior');
 }
 if(seleccion){
  if(new Set(seleccion).size!==seleccion.length)return rechazar('seleccion_repetida','Una pieza no puede usarse dos veces');
  for(const uid of seleccion){
   const e=obtener(uid),m=e&&master.equipo(e.equipment_id);
   if(!entero(uid)||uid===0||!e||!m)return rechazar('equipo_ajeno','Hay una pieza que no pertenece a tu inventario');
   if(uid===params.equipment_uid)return rechazar('material_invalido','La pieza que evoluciona no puede consumirse como material');
   if(e.locked||e.protected||e.is_locked||e.favorite)return rechazar('equipo_protegido','Hay una pieza protegida en la selección');
   if(equipado(cuenta,uid))return rechazar('equipo_en_uso','Retira del personaje el equipo que quieres consumir');
   if(modo==='evolve'&&e.equipment_id!==pieza.equipment_id)return rechazar('material_invalido','La evolución requiere copias de la misma pieza');
   if(modo==='exchange'&&(m.tipo!==1||!m.intercambiable||e.equipment_id===q.destino||e.equipment_id===master.equipo(q.destino).evolucion))return rechazar('material_invalido','Selecciona armas intercambiables distintas del destino y su evolución');
   if(modo==='exchange'&&m.rareza>=5){
    const id=cat.intercambio.find(r=>r.id===q.destino).lingote;
    if(!master.objeto(id))return rechazar('datos_incompletos','Falta el material de compensación del intercambio');
    const recibido=q.recibir.find(r=>r.id===id);if(recibido)recibido.cantidad++;else q.recibir.push({id,cantidad:1});
   }
   if(modo==='sell'){
    const precio=precioVentaEquipo(m,e.level);
    if(precio===null||e.level>m.nivelMax)return rechazar('datos_incompletos','Falta el precio o el nivel de una pieza no es válido');
    q.col-=precio;
   }
   q.consumir.push(uid);
  }
 }
 if(!entero(Math.abs(q.col))||!entero(cuenta.user?.col)||cuenta.user.col<q.col)return rechazar('col_insuficiente','No tienes suficiente Col');
 for(const r of q.materiales)if(!entero(items[r.id]??0)||(items[r.id]??0)<r.cantidad)return rechazar('materiales_insuficientes','No tienes suficientes materiales');
 if(ficha)q.stats={antes:statsEquipo(ficha,pieza.level),despues:statsEquipo(master.equipo(q.destino),q.nivel)};
 return Object.assign(q,{permitida:true,code:null,motivo:''});
}

/** Sello local exacto: cambios de coste, saldo, asignación o piezas requieren nueva confirmación. */
export function selloOperacion(cuenta,q){
 const uids=new Set([q.params.equipment_uid,...q.consumir]);
 return JSON.stringify({q,col:cuenta.user.col,items:q.materiales.map(r=>[r.id,materialesCuenta(cuenta)[r.id]??0]),
  piezas:(cuenta.equipment??[]).filter(e=>uids.has(e.uid)),
  asignaciones:(cuenta.characters??[]).map(c=>[c.uid,...Object.values(RANURAS_EQUIPO).map(f=>c[f]??null)]),
  intercambios:cuenta.equipment_exchanged_ids??[]});
}
