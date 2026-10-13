// D85: reconstrucción comunitaria, NO payload oficial del servidor.
// Pools contrastados con saomd.fanadata.com/banners/1, /2, /3 el2026-10-13.
// Tasas/costes de S-argo/new_Settings.xml y CharacterScout.java. Ver docs/reclutamiento-d85.md.
export const BANNERS_TEMPRANOS=Object.freeze([
 {id:'archivo-start-dash',nombre:'Start Dash',archivo:1,arte:'images/lottery/001/20011_scout_top.png',banner:'images/lottery/001/20011_scout_banner.png',inicio:'2017-01-24',fin:'2017-02-18',destacados:[14001,24001,24002,24003,24004,34001,64001,84001,84002,94001,104001,124001,164001]},
 {id:'archivo-alo-reborn',nombre:'Alfheim Online Reborn',archivo:2,arte:'images/lottery/002/20021_scout_top.png',banner:'images/lottery/002/20021_scout_banner.png',inicio:'2017-01-31',fin:'2017-02-18',destacados:[34002,84003,104002,144001,164002]},
 {id:'archivo-wind-jp',nombre:'Viento · Japón',archivo:3,arte:'images/lottery/003/20031_scout_top.png',banner:'images/lottery/003/20031_scout_banner.png',inicio:'2016-09-30',fin:'2016-10-06',destacados:[24005,64002,84004,104003,164004]},
]);
export async function catalogoReclutamiento(fuente,personajes){
 const archivo=(await fuente.md('banner')??[]).map(r=>({id:r.f0,imagen:r.f1,categoria:r.f3,referencia:r.f4}));
 const comunes=Object.entries(personajes).filter(([id,r])=>Number(id)<8000000&&(r.rareza===2||r.rareza===3));
 const banners=BANNERS_TEMPRANOS.map(b=>{
  const grupos=[{rareza:2,ratio:7100,ids:comunes.filter(([,r])=>r.rareza===2).map(([id])=>Number(id))},
   {rareza:3,ratio:2500,ids:comunes.filter(([,r])=>r.rareza===3).map(([id])=>Number(id))},{rareza:4,ratio:400,ids:[...b.destacados]}];
  const completo=grupos.every(g=>g.ids.length>0&&g.ids.every(id=>personajes[id]?.rareza===g.rareza));
  return {id:b.id,nombre:b.nombre,archivo:b.archivo,arte:b.arte,banner:b.banner,inicio:b.inicio,fin:b.fin,reconstruido:true,procedencia:'Fanadata · grupos de personajes',fuente:'https://saomd.fanadata.com/banners/'+b.archivo,
   nota:'Pool destacado: Fanadata. Tasas, coste y repetidos: modelo comunitario S-argo; Fanadata no publica estas reglas. Fechas históricas de distintas regiones.',
   disponible:completo,grupos,precios:{1:25,11:250},duplicados:{2:1,3:2,4:50}};
 });
 const textosArgo=Object.fromEntries((await fuente.md('localization_info')??[]).filter(r=>r.f0>=101501&&r.f0<=101506).map(r=>[r.f0,r.f1]));
 const defines=await fuente.md('define')??[],activacion=defines.find(r=>r.f0===10001),probabilidad=defines.find(r=>r.f0===10002);
 const introduccionALO={activada:activacion?.f1===1,inicio:activacion?.f2??null,probabilidad:(probabilidad?.f1??0)/10000};
 return {banners,archivo,textosArgo,introduccionALO};
}
