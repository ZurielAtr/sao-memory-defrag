import {decodeUserData} from '../ssbp.js';
// Obtención: f62 explícita, o selección uniforme de los tipos 30/31/32
// de la familia f27. f73/74/75 sustituyen el ID elegido por tipo (APK).
export function elegirVozGacha(ficha,catalogo,random=Math.random){
 const p=ficha?.reclutamiento;if(!p||!catalogo)return null;
 const disponible=id=>{const d=catalogo.voces?.[id];return d&&(d.ruta||d.banco);};
 if(p.vozObtencion>0&&disponible(p.vozObtencion))return p.vozObtencion;
 const familia=catalogo.familiasVoz?.[p.grupoVoz];
 const opciones=[30,31,32].flatMap(tipo=>(familia?.[tipo]??[]).filter(disponible).map(id=>({id,tipo})));
 if(!opciones.length)return null;
 const elegida=opciones[Math.min(opciones.length-1,Math.floor(random()*opciones.length))];
 const reemplazo=p.vozTipos?.[elegida.tipo];
 return reemplazo>0&&disponible(reemplazo)?reemplazo:elegida.id;
}
export function sonidosGacha(...archivos){
 const ids=new Set([11071]);
 for(const ssbp of archivos)for(const pack of ssbp.packs)for(const anim of pack.anims)
  for(let f=0;f<anim.numFrames;f++)for(const e of decodeUserData(ssbp,pack,anim,f))
   if((e.flags&8)&&/^Sound:\d+$/.test(e.str))ids.add(Number(e.str.slice(6)));
 return [...ids];
}
