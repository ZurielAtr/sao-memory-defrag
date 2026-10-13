// D85: operaciones locales con pools explícitos, resultados persistentes y tasas visibles.
export function consultarReclutamiento(master,cuenta,{banner_id,count}={}){
 const banner=master.reclutamiento().banners.find(b=>b.id===banner_id),q={banner_id,count,permitida:false,code:'banner_inexistente',motivo:'Elige un banner',coste:0,banner:null};
 const no=(code,motivo)=>Object.assign(q,{code,motivo});
 if(!banner)return q;q.banner=banner;
 if(count!==1&&count!==11)return no('cantidad_invalida','Elige un sorteo o un sorteo de once');
 if(!banner.disponible)return no('datos_incompletos','Faltan personajes de este banner en la APK importada');
 q.coste=banner.precios?.[count];
 if(!Number.isSafeInteger(q.coste)||q.coste<0)return no('datos_incompletos','No se conoce el precio de este sorteo');
 const ids=new Set();let total=0;
 for(const g of banner.grupos??[]){
  if(!Number.isSafeInteger(g.ratio)||g.ratio<=0||!g.ids?.length)return no('datos_incompletos','Las probabilidades del banner están incompletas');
  total+=g.ratio;
  for(const id of g.ids){if(ids.has(id)||master.personaje(id)?.rareza!==g.rareza)return no('datos_incompletos','Hay personajes repetidos o inválidos en el banner');ids.add(id);}
 }
 if(total!==10000)return no('datos_incompletos','Las probabilidades deben sumar el 100%');
 if(!Number.isSafeInteger(cuenta.user?.diamond)||cuenta.user.diamond<q.coste)return no('diamantes_insuficientes','No tienes suficientes diamantes');
 return Object.assign(q,{permitida:true,code:null,motivo:''});
}
export function selloReclutamiento(cuenta,q){return JSON.stringify({q,diamantes:cuenta.user.diamond,
 personajes:cuenta.characters.map(c=>[c.uid,c.character_id]),cristales:cuenta.user.hacking_crystals??0});}
export function sortearPersonaje(banner,random){
 const a=random(),b=random();if(!Number.isFinite(a)||a<0||a>=1||!Number.isFinite(b)||b<0||b>=1)throw Error('Aleatorio fuera del intervalo [0,1)');
 let acumulada=0;for(const g of banner.grupos){acumulada+=g.ratio;if(a*10000<acumulada)return g.ids[Math.floor(b*g.ids.length)];}
 throw Error('Las probabilidades del banner no cubren el sorteo');
}
export function probabilidadesBanner(banner,master){return (banner.grupos??[]).flatMap(g=>g.ids.map(id=>({id,rareza:g.rareza,
 nombre:master.personaje(id)?.nombre??String(id),porcentaje:g.ratio/100/g.ids.length})));}
