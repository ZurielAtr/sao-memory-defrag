// D86/D90: SpriteStudio original y secuencia de presentación contrastada con la APK.
import {loadSSBP} from '../character.js';
import {SSRenderer,buildCharacterQuads,imageQuad} from '../renderer.js';
import {decodeFrame,decodeUserData} from '../ssbp.js';
import {baseCanvas,Pantalla} from './pantalla.js';
import {imagen,pilaFuentes,fuenteTTF} from './recursos.js';
import {rutaWeb} from '../rutas.js';

export function seleccionarResultado(ssbp,rareza){
 // FUN_009c4894: R1/2 → 1, R3 → 2, R4 → 3, R5 → 4, R6 → 5. Los recursos de Revival no tienen scene3/appear_5 y sí
 // appear_6a/6b: para R6 se usa appear_6a (D108, PROVISIONAL; la librería 3.0.2 es anterior a esos recursos).
 const nombre={1:'appear_1',2:'appear_1',3:'appear_2',4:'appear_3',5:'appear_4',6:'appear_6a'}[rareza];
 const pack=ssbp.packs.find(p=>p.name==='character_lottery_scene3'),animacion=pack?.anims.find(a=>a.name===nombre);
 if(!animacion?.numFrames||!(animacion.fps>0))throw Error('Animación de resultado no disponible para esta rareza');
 const indice=pack.parts.findIndex(p=>p.name==='character');let primero=null,mostrar=null;
 for(let f=0;f<animacion.numFrames;f++){
  const s=decodeFrame(ssbp,pack,animacion,f).find(s=>s.partIndex===indice);
  if(s?.visible&&s.opacity>0)primero??=f;
  if(s?.visible&&s.opacity>=250&&s.scaleX>=.8&&s.scaleX<=1.05)mostrar=f;
 }
 if(primero===null||mostrar===null)throw Error('El resultado no tiene un retrato visible');
 return {pack,animacion,primero,mostrar};
}
export class AnimacionReclutamiento {
 constructor(datos,{reducida=false}={}){Object.assign(this,datos);this.tiempo=reducida?(this.mostrar+1)/this.animacion.fps:0;}
 get cuadro(){return Math.min(this.mostrar,Math.max(0,Math.floor(this.tiempo*this.animacion.fps)));}
 get revelada(){return this.cuadro>=this.mostrar;}
 actualizar(t){this.tiempo=Math.max(this.tiempo,Math.max(0,t));}
 revelar(){this.tiempo=(this.mostrar+1)/this.animacion.fps;}
 dibujar(ctx){
  const {canvas,renderer}=this.superficie,c=ctx.canvas,k=baseCanvas(c);
  if(canvas.width!==c.width||canvas.height!==c.height){canvas.width=c.width;canvas.height=c.height;}
  const gl=renderer.gl;this.superficie.fondo??=renderer.createTexture(c);gl.bindTexture(gl.TEXTURE_2D,this.superficie.fondo.tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
  renderer.view={zoom:1,x:0,y:0};renderer.begin();const color={rgba:[1,1,1,1],rate:0,func:-1};
  renderer.drawQuads([{tex:this.superficie.fondo,alpha:1,blend:0,pts:[[-c.width/2,c.height/2],[c.width/2,c.height/2],[-c.width/2,-c.height/2],[c.width/2,-c.height/2]],uvs:[[0,0],[1,0],[0,1],[1,1]],colors:[color,color,color,color]}]);
  renderer.view={zoom:k[0],x:k[4]+375*k[0]-c.width/2,y:c.height/2-(k[5]+667*k[3])};
  renderer.drawQuads(buildCharacterQuads(this.ssbp,this.textures,this.pack,this.animacion,this.cuadro,{hidden:new Set(['sign','sign_mask'])}));
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.drawImage(canvas,0,0);
 }
}
let superficie=null,recurso=null;const retratos=new Map();
export async function cargarAnimacionReclutamiento(resultado,master,{reducida=false}={}){
 superficie??=(()=>{const canvas=document.createElement('canvas');return {canvas,renderer:new SSRenderer(canvas)};})();
 recurso??=loadSSBP(superficie.renderer,'ss/others/character_lottery_s','character_lottery.ssbp').catch(e=>{recurso=null;throw e;});
 const datos=await recurso,rareza=master.personaje(resultado.character_id)?.rareza,seleccion=seleccionarResultado(datos.ssbp,rareza);
 const map=datos.ssbp.cellMaps.findIndex(m=>m.name==='result');if(map<0)throw Error('Mapa del retrato ausente');
 const id=resultado.character_id;
 if(!retratos.has(id)){
  const img=await imagen(`images/character/character_${id}.png`)??await imagen(`images/unit/thumbnail/256/thumbnail_${id}.png`);
  if(!img)throw Error('Retrato del personaje no disponible');
  const foto=document.createElement('canvas');foto.width=foto.height=1500;const ctx=foto.getContext('2d'),escala=Math.min(1500/img.width,1500/img.height);
  ctx.drawImage(img,(1500-img.width*escala)/2,(1500-img.height*escala)/2,img.width*escala,img.height*escala);
  retratos.set(id,superficie.renderer.createTexture(foto));
  if(retratos.size>3){const vieja=retratos.keys().next().value;superficie.renderer.gl.deleteTexture(retratos.get(vieja).tex);retratos.delete(vieja);}
 }
 const textures=new Map(datos.textures);textures.set(map,retratos.get(id));
 return new AnimacionReclutamiento({...datos,...seleccion,textures,superficie},{reducida});
}
export async function controlesResultado(indice,total){
 const p=await Pantalla.cargar('ui/common/common_skip_widget_s.csb'),skip=p.buscar('button_skip');
 // FUN_009c3500: W/2-85, 50-H/2 en coordenadas centradas.
 // Trasladado al diseño original 750×1334: esquina inferior derecha.
 Object.assign(skip,{nombre:'lista_resultados',x:665,y:50});
 const tap={...structuredClone(p.raiz),nombre:'siguiente_resultado',clase:'Panel',x:0,y:0,ancho:750,alto:1334,
  anclaX:0,anclaY:0,escalaX:1,escalaY:1,visible:true,alpha:255,tactil:true,hijos:[]};
 Object.assign(p.raiz,{x:0,y:0,ancho:750,alto:1334,anclaX:0,anclaY:0,hijos:[tap,skip]});
 await p.precargar();return p;
}

const pesos=(opciones,random)=>{const n=random();let acumulado=0;for(const [valor,peso]of opciones){acumulado+=peso;if(n<acumulado)return valor;}return opciones.at(-1)[0];};
/** FUN_009c3fac: define10001 activa por fecha;10002 da el porcentaje global. */
export function seleccionarEscenarioALO(regla,{ahora=Date.now()/1000,forzarSAO=false,random=Math.random}={}){
 if(forzarSAO||!regla?.activada||!Number.isFinite(regla.inicio)||ahora<regla.inicio)return false;
 return Math.floor(random()*100)<Math.max(0,Math.min(1,regla.probabilidad??0))*100;
}
const clip=(ssbp,packNombre,animNombre)=>{
 const pack=ssbp.packs.find(p=>p.name===packNombre),animacion=pack?.anims.find(a=>a.name===animNombre);
 if(!animacion)throw Error(`Animación original ausente: ${packNombre}/${animNombre}`);
 return {pack,animacion};
};
/** Variantes de FUN_009c46b4/009c4814/009c49cc; no modifican el sorteo guardado. */
export function seleccionarIntroducciones(ssbp,rareza,{alo=false,random=Math.random}={}){
 if(![2,3,4,5,6].includes(rareza))throw Error('Presentación original sólo disponible para R2–R6');
 // D108: FUN_009c46b4 (con +0x2f8 < 6): R4/R5 → appear_2 (80 %) o 1; R6 → appear_3 (80 %) o 2. Argo y escena 2 de
 // R5/R6 siguen las de R4 (PROVISIONAL: FUN_009c4738 no distingue más allá de R4 salvo el tipo 8).
 const r4=Math.min(rareza,4);
 const argo=r4===2?1:r4===3?pesos([[1,.5],[2,.5]],random):pesos([[1,.1],[2,.4],[3,.5]],random);
 const primera=rareza>=6?pesos([[2,.2],[3,.8]],random):rareza>=4?pesos([[1,.2],[2,.8]],random):1;
 const segunda=r4===2?1:r4===3?pesos([[1,.5],[2,.5]],random):primera>=2?3:pesos([[2,.3],[3,.7]],random);
 const sufijo=alo?'_alo':'';
 return {argo,primera,segunda,clips:[clip(ssbp,'character_lottery_scene1'+sufijo,'appear_'+primera),clip(ssbp,'character_lottery_scene2'+sufijo,'appear_'+segunda)]};
}

/** Reloj de presentación sin backend ni escrituras de partida. */
export class PresentacionReclutamiento {
 constructor(datos,{banner=null,reducida=false,onEvento=()=>{},random=Math.random,ahora,forzarSAO=false}={}){
  Object.assign(this,datos);this.onEvento=onEvento;this.banner=banner;this.reducida=reducida;
  this.indice=0;this.fase='introduccion1';this.tiempo=0;this.reloj=0;this.generacion=0;this.descartada=false;
  this.maxRareza=Math.max(...this.resultados.map(r=>this.master.personaje(r.character_id)?.rareza??0));
  this.alo=datos.alo??seleccionarEscenarioALO(this.master.reclutamiento?.()?.introduccionALO,{random,ahora,forzarSAO});
  this.intro=datos.intro??seleccionarIntroducciones(this.ssbp,this.maxRareza,{alo:this.alo,random});
  this.seed=Math.floor(random()*0xffffffff)>>>0;
  this.emitir({tipo:'musica',id:1010});this.iniciarClip(this.intro.clips[0]);
  if(reducida){this.fase='resultado';this.iniciarResultado();this.mostrarEstatico();}
 }
 get resultado(){return this.resultados[this.indice]??null;}
 get ficha(){return this.master.personaje(this.resultado?.character_id);}
 get rareza(){return this.ficha?.rareza??0;}
 get terminada(){return this.fase==='final';}
 get habilitarAvance(){return this.fase==='resultado'&&this.avancePermitido&&!this.vozPendiente;}
 get revelada(){return this.fase==='resultado'&&this.nombreVisible;}
 get cuadro(){return Math.max(0,Math.min(this.animacion.numFrames-1,Math.floor(this.tiempo*this.animacion.fps+1e-7)));}
 emitir(evento){try{return this.onEvento(evento);}catch{return undefined;}}
 iniciarClip(sel){
  Object.assign(this,sel);this.tiempo=0;this.ultimoEvento=-1;this.avancePermitido=false;this.nombreVisible=false;
  this.poseEstatica=null;
  this.rarityVisible=false;this.newVisible=false;this.symbolVisible=false;this.vozPendiente=false;this.generacion++;
  this.gateVisible=false;this.backVisible=false;this.gateStart=null;this.eventFrames=new Map();this.adjuntoEventos=new Map();
  for(let f=0;f<this.animacion.numFrames;f++)for(const e of decodeUserData(this.ssbp,this.pack,this.animacion,f))if(e.flags&1)this.eventFrames.set(e.integer,f);
  this.eventosHasta(0);
 }
 iniciarResultado(){
  this.fase='resultado';this.iniciarClip(seleccionarResultado(this.ssbp,this.rareza));
 }
 eventosHasta(frame){
  for(let f=this.ultimoEvento+1;f<=frame;f++){
   for(const e of decodeUserData(this.ssbp,this.pack,this.animacion,f))this.evento(e);
   this.eventosAdjuntos(f);
  }
  this.ultimoEvento=Math.max(this.ultimoEvento,frame);
 }
 evento(e){
  if(e.flags&8){const id=Number(e.str.split(':').at(-1));if(/^Sound:/i.test(e.str)&&id>0)this.emitir({tipo:'se',id});}
  if(this.fase!=='resultado'||!(e.flags&1))return;
  if(e.integer===1){this.gateVisible=true;this.gateStart=e.frameNo;}
  if(e.integer===2){this.rarityVisible=false;this.backVisible=false;this.nombreVisible=false;this.newVisible=false;this.symbolVisible=false;}
  if(e.integer===3){
   this.nombreVisible=true;this.rarityVisible=true;this.backVisible=true;const generation=this.generacion;
   const voz=this.emitir({tipo:'voz',personaje:this.resultado.character_id,rareza:this.rareza,ficha:this.ficha});
   if(voz?.then){this.vozPendiente=true;Promise.resolve(voz).catch(()=>{}).then(()=>{
    if(!this.descartada&&generation===this.generacion)this.vozPendiente=false;
   });}
  }
  if(e.integer===4){this.newVisible=!this.resultado.duplicate;this.symbolVisible=!!this.resultado.duplicate;}
  if(e.integer===5)this.avancePermitido=true;
 }
 eventosAdjuntos(frame){
  if(this.fase!=='resultado')return;
  const data=this.adjuntos?.get('gate');
  if(data&&this.gateVisible){
   const sel=clip(data.ssbp,'gate','appear_'+(this.rareza-1)),f=Math.min(sel.animacion.numFrames-1,frame-this.gateStart);
   const last=this.adjuntoEventos.get('gate')??-1;
   for(let n=last+1;n<=f;n++)for(const e of decodeUserData(data.ssbp,sel.pack,sel.animacion,n)){
    if(e.flags&8)this.evento(e);
    if((e.flags&1)&&e.integer===1&&this.ficha?.reclutamiento?.musica>0)this.emitir({tipo:'musica',id:this.ficha.reclutamiento.musica});
   }
   this.adjuntoEventos.set('gate',f);
  }
  if(this.symbolVisible&&!this.adjuntoEventos.has('symbol')){
   this.adjuntoEventos.set('symbol',0);this.emitir({tipo:'se',id:11071});
  }
 }
 siguienteFase(){
  if(this.fase==='introduccion1'){this.fase='introduccion2';this.iniciarClip(this.intro.clips[1]);}
  else if(this.fase==='introduccion2')this.iniciarResultado();
  else if(this.fase==='resultado'){
   if(this.indice+1<this.resultados.length){this.indice++;this.iniciarResultado();if(this.reducida)this.mostrarEstatico();}
   else this.saltar();
  }
 }
 actualizar(t){
  if(this.descartada||this.terminada)return;
  let dt=Math.max(0,t-this.reloj);this.reloj=Math.max(this.reloj,t);
  for(let guard=0;guard<16;guard++){
   const limite=this.fase==='resultado'?(this.eventFrames.get(5)??this.mostrar)/this.animacion.fps:this.animacion.numFrames/this.animacion.fps;
   const usado=Math.min(dt,Math.max(0,limite-this.tiempo));this.tiempo+=usado;dt-=usado;
   this.eventosHasta(this.cuadro);
   if(this.fase==='resultado'){
    // El original avanza tras EVT5 y la finalización de la voz. Con movimiento
    // reducido se conserva una pose y el avance explícito para poder leerla.
    if(this.habilitarAvance&&!this.reducida){this.siguienteFase();if(this.terminada)return;}
    else return;
   }else if(this.tiempo>=limite-1e-7)this.siguienteFase();else return;
   if(dt<=0)return;
  }
 }
 mostrarEstatico(){
  const final=this.eventFrames.get(5)??this.mostrar;this.eventosHasta(final);
  if(this.poseEstatica===null){
   let frame=final;
   // R4 oculta los pivotes justo en EVT5: la adaptación de movimiento reducido
   // conserva el último cuadro completo anterior, no una pose sin rótulos.
   for(;frame>(this.eventFrames.get(3)??0);frame--){
    const estados=decodeFrame(this.ssbp,this.pack,this.animacion,frame);
    if(['name_pivot','rarity_pivot'].every(n=>estados.some(s=>this.pack.parts[s.partIndex].name===n&&s.visible&&s.opacity>0)))break;
   }
   this.poseEstatica=frame;
  }
  this.tiempo=this.poseEstatica/this.animacion.fps;this.avancePermitido=true;
 }
 revelar(){
  if(this.terminada||this.descartada)return;
  if(this.fase!=='resultado'){this.eventosHasta(this.animacion.numFrames-1);this.siguienteFase();return;}
  if(this.reducida){this.mostrarEstatico();return;}
  if(this.gateStart===null)return;
  // D108: sin cuadro de salto conocido para R5/R6, el toque lleva a la revelación del personaje.
  const endpoint=this.gateStart+({2:79,3:159,4:239}[this.rareza]??Math.max(0,this.mostrar-this.gateStart));
  if(this.cuadro<endpoint){this.tiempo=endpoint/this.animacion.fps;this.eventosHasta(endpoint);}
 }
 avanzar(){
  if(this.fase==='resultado'&&this.avancePermitido){
   if(this.vozPendiente)this.emitir({tipo:'detenerVoz'});
   this.siguienteFase();
  }else this.revelar();
 }
 saltar(){this.fase='final';this.generacion++;this.vozPendiente=false;}
 dispose(){
  if(this.descartada)return;this.descartada=true;this.generacion++;this.vozPendiente=false;
  if(this.superficie){for(const t of this.stills??[])if(t)this.superficie.renderer.deleteTexture(t);
   for(const t of this.textos?.values()??[])this.superficie.renderer.deleteTexture(t);
   for(const t of this.numeros?.values()??[])this.superficie.renderer.deleteTexture(t);
   if(this.textoArgo)this.superficie.renderer.deleteTexture(this.textoArgo);}
 }
 dibujar(ctx){dibujarPresentacion(this,ctx);}
}

const attachments=new Map();
async function recursoAdjunto(nombre){
 if(!attachments.has(nombre))attachments.set(nombre,loadSSBP(superficie.renderer,`ss/others/common/${nombre}_s`).catch(e=>{attachments.delete(nombre);throw e;}));
 return attachments.get(nombre);
}
async function texturaRetrato(renderer,id){
 if(!retratos.has(id)){
  const img=await imagen(`images/character/character_${id}.png`);
  if(!img)throw Error(`Retrato original ausente: ${id}`);
  retratos.set(id,renderer.createTexture(img));
  if(retratos.size>32){const viejo=retratos.keys().next().value;renderer.deleteTexture(retratos.get(viejo));retratos.delete(viejo);}
 }
 return retratos.get(id);
}
// D91: contenido histórico de images/lottery/still/1–3 (descarga diferida, ausente de las APK).
// Las mismas imágenes vienen en la APK como stills de historia; still_01_aincrad sólo a 750×422.
// Equivalentes visuales (otra compresión JPEG), no los bytes descargados por el juego.
const C=n=>`images/quest/chapter/still/${1000+Number(n.slice(6,8))}/${n}.jpg`;
export const STILLS_GACHA_APK=Object.freeze({
 1:['images/story/still/still_01_aincrad.jpg',...['still_01_red_robe','still_02_kobold_mode_change','still_03_pub_cheers','still_07_xrphan_dive',
  'still_09_gleam_eyes_breath','still_12_scavenge_toad','still_13_kirito_block','still_15_link_start'].map(C)],
 2:['still_02_agil_introduction','still_03_message_sachi','still_04_flower_garden','still_04_kirito_ikemen','still_05_asuna_sleep','still_07_sword_break',
  'still_08_kuradeel_armblast','still_09_asuna_jitome','still_09_wwfm','still_10_heathcliff_holy_sword','still_11_yui_wakeup','still_17_suguha_shy',
  'still_18_oberon_smile2'].map(C),
 3:['still_03_sachi_bed_in','still_04_puneuma','still_04_sirika_skirt','still_07_lisbeth_hand','still_07_lisbeth_hug','still_09_asuna_dash',
  'still_09_kirito_dualsword','still_10_asuna_propose','still_12_yui_smile','still_13_klein_agil','still_15_kirito_smile','still_16_yui_pixie',
  'still_17_leafa_remember','still_19_leafa_ok'].map(C),
});
/** Rutas de la carpeta histórica si se añadió el paquete; si no, sus equivalentes de la APK. */
export async function rutasStillsGacha(variante,listar){
 const folder=`images/lottery/still/${variante}`;
 let archivos=[];try{archivos=(await listar(folder)).filter(f=>/\.jpe?g$/i.test(f));}catch{}
 return archivos.length?archivos.map(f=>`${folder}/${f}`):[...(STILLS_GACHA_APK[variante]??[])];
}
const listarCarpeta=async folder=>{
 const respuesta=await fetch(rutaWeb(`/api/ls?path=${encodeURIComponent(folder)}`));
 return respuesta.ok?(await respuesta.json()).files??[]:[];
};
async function stillsOriginales(variante,renderer,random){
 try{
  const rutas=elegirStillsGacha(await rutasStillsGacha(variante,listarCarpeta),random);
  return Promise.all(rutas.map(async ruta=>{
   const img=await imagen(ruta);if(!img)return null;
   // El frame original mide256×144: mostrar la imagen completa, también si el
   // asset histórico viene con resolución mayor que la plantilla embebida.
   const c=document.createElement('canvas');c.width=256;c.height=144;c.getContext('2d').drawImage(img,0,0,256,144);
   return renderer.createTexture(c);
  }));
 }catch{return [];}
}
/** FUN_009c64e4: repetir el listado hasta7, barajar y tomar las primeras7. */
export function elegirStillsGacha(archivos,random=Math.random){
 const originales=archivos.filter(f=>/\.jpe?g$/i.test(f));if(!originales.length)return [];
 const lista=[...originales];while(lista.length<7)lista.push(...originales);
 for(let i=lista.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[lista[i],lista[j]]=[lista[j],lista[i]];}
 return lista.slice(0,7);
}

export async function cargarPresentacionReclutamiento(resultados,master,opciones={}){
 if(!resultados.length)throw Error('No hay resultados guardados para presentar');
 superficie??=(()=>{const canvas=document.createElement('canvas');return{canvas,renderer:new SSRenderer(canvas)};})();
 recurso??=loadSSBP(superficie.renderer,'ss/others/character_lottery_s','character_lottery.ssbp').catch(e=>{recurso=null;throw e;});
 const datos=await recurso;
 const nombres=['gate','back_light','name_back','new_icon','character_argo'];
 const adjuntos=new Map(await Promise.all(nombres.map(async n=>[n,await recursoAdjunto(n)])));
 if(!attachments.has('rarity'))attachments.set('rarity',loadSSBP(superficie.renderer,'ss/others/common/rarity-star_s','common_rarity.ssbp').catch(e=>{attachments.delete('rarity');throw e;}));
 adjuntos.set('rarity',await attachments.get('rarity'));
 // D108: FUN_009c4894 usa common_rarity_atlas_oran para los personajes R6.
 if(!attachments.has('rarity_oran'))attachments.set('rarity_oran',loadSSBP(superficie.renderer,'ss/others/common/rarity-star_s','common_rarity.ssbp',
  (m,i,file)=>file==='common_rarity_atlas.png'?rutaWeb('/assets/ss/others/common/rarity-star_s/common_rarity_atlas_oran.png'):null).catch(e=>{attachments.delete('rarity_oran');throw e;}));
 adjuntos.set('rarity_oran',await attachments.get('rarity_oran').catch(()=>null));
 const portraits=new Map(await Promise.all([...new Set(resultados.map(r=>r.character_id))].map(async id=>{
  const ficha=master.personaje(id),retrato=ficha?.reclutamiento?.retrato??id;
  return[id,await texturaRetrato(superficie.renderer,retrato)];
 })));
 const maxRareza=Math.max(...resultados.map(r=>master.personaje(r.character_id)?.rareza??0));
 const random=opciones.random??Math.random,alo=seleccionarEscenarioALO(master.reclutamiento?.()?.introduccionALO,{random,ahora:opciones.ahora,forzarSAO:opciones.forzarSAO});
 const intro=seleccionarIntroducciones(datos.ssbp,maxRareza,{alo,random});
 const stills=await stillsOriginales(intro.segunda,superficie.renderer,random);
 const presentacion=new PresentacionReclutamiento({...datos,superficie,adjuntos,portraits,master,resultados,stills,intro,alo},opciones);
 await cargarTextosPresentacion(presentacion);
 return presentacion;
}

function textoTexture(renderer,texto,tam=32,{color='white',borde=null}={}){
 const lines=String(texto).split('\n'),c=document.createElement('canvas');c.width=1000;c.height=Math.max(100,lines.length*(tam+8));const x=c.getContext('2d');
 x.font=`${tam}px ${pilaFuentes('SAOFont-Regular_v1.ttf')}`;x.textAlign='center';x.textBaseline='middle';x.fillStyle='white';
 x.fillStyle=color;x.strokeStyle=borde??color;x.lineWidth=2;
 lines.forEach((line,i)=>{const y=c.height/2+(i-(lines.length-1)/2)*(tam+8);if(borde)x.strokeText(line,500,y);x.fillText(line,500,y);});
 return renderer.createTexture(c);
}
async function cargarTextosPresentacion(p){
 await fuenteTTF('fonts/SAOFont-Regular_v1.ttf');
 p.textos=new Map();p.numeros=new Map();
 for(const id of new Set(p.resultados.map(r=>r.character_id))){const f=p.master.personaje(id);
  p.textos.set(id,textoTexture(p.superficie.renderer,f.nombre??String(id)));
 }
 for(const r of p.resultados)if(r.duplicate&&!p.numeros.has(r.hacking_crystals))p.numeros.set(r.hacking_crystals,textoTexture(p.superficie.renderer,String(r.hacking_crystals??0),46,{borde:'#434343'}));
 const mensaje=p.master.reclutamiento?.()?.textosArgo?.[101500+p.intro.argo+(p.resultados.length>1?3:0)];
 if(mensaje)p.textoArgo=textoTexture(p.superficie.renderer,mensaje,46,{color:'rgb(60,45,26)'});
}

function dibujarPresentacion(p,ctx){
 if(p.terminada)return;
 const {canvas,renderer}=p.superficie,c=ctx.canvas,k=baseCanvas(c);
 if(canvas.width!==c.width||canvas.height!==c.height){canvas.width=c.width;canvas.height=c.height;}
 renderer.view={zoom:k[0],x:k[4]+375*k[0]-c.width/2,y:c.height/2-(k[5]+667*k[3])};renderer.begin();
 const tx=new Map(p.textures);
 if(p.fase==='resultado')tx.set(p.ssbp.cellMaps.findIndex(m=>m.name==='result'),p.portraits.get(p.resultado.character_id));
 if(p.fase==='introduccion2')for(let i=0;i<p.stills.length;i++)if(p.stills[i])tx.set(p.ssbp.cellMaps.findIndex(m=>m.name==='still_'+(i+1)),p.stills[i]);
 const attachment=(key,packName,animName,frame,matrix,alpha,loop=false,extra={})=>{
  const data=p.adjuntos.get(key);if(!data)return[];
  const sel=clip(data.ssbp,packName,animName),f=loop?Math.floor(frame)%sel.animacion.numFrames:Math.min(sel.animacion.numFrames-1,Math.max(0,Math.floor(frame)));
  return buildCharacterQuads(data.ssbp,data.textures,sel.pack,sel.animacion,f,{matrix,alpha,seed:p.seed,
   particles:true,instances:true,effectFrame:frame,instanceFrame:frame,...extra});
 };
 const at=n=>p.eventFrames.get(n)??0;
 const result=p.fase==='resultado',nameFrame=Math.max(0,p.cuadro-at(3));
 const quads=buildCharacterQuads(p.ssbp,tx,p.pack,p.animacion,p.cuadro,{hidden:new Set(['sign','sign_mask']),
  particles:true,instances:true,seed:p.seed,effectFrame:p.tiempo*p.animacion.fps,
  attachments:({part,matrix,alpha})=>{
   const n=part.name;
   if(n==='message_pivot'&&p.fase==='introduccion1'&&p.textoArgo){
    const text=p.textoArgo,q=imageQuad(text,-text.w*.45,-text.h*.45,text.w*.9,text.h*.9,alpha);
    q.pts=q.pts.map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);return[q];
   }
   if(n==='argo_pivot'&&p.fase==='introduccion1')return attachment('character_argo','character_argo'+(p.alo?'_alo':''),
    (p.cuadro<11?'appear_':'wait_')+p.intro.argo,p.cuadro<11?p.cuadro:p.cuadro-11,matrix,alpha,true);
   if(!result)return[];
   if(n==='gate_pivot'&&p.gateVisible)return attachment('gate','gate','appear_'+(p.rareza-1),p.cuadro-at(1),matrix,alpha);
   if(n==='back_effect_pivot'&&p.backVisible)return attachment('back_light','back_light','type_'+Math.min(3,p.rareza-1),nameFrame,matrix,alpha); // FUN_009c4894: type_{índice}, máximo 3
   if(n==='rarity_pivot'&&p.rarityVisible)return attachment(p.rareza>=6&&p.adjuntos.get('rarity_oran')?'rarity_oran':'rarity','common_rarity','rarity_'+p.rareza,nameFrame,matrix,alpha);
   if(n==='name_pivot'&&p.nombreVisible){
    const text=p.textos.get(p.resultado.character_id);
    return attachment('name_back','name_back','appear',nameFrame,matrix,alpha,false,{attachments:({part,matrix,alpha})=>{
     if(part.name!=='text_pivot'||!text)return[];
     const item=imageQuad(text,-500,-50,1000,100,alpha);item.pts=item.pts.map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);return[item];
    }});
   }
   if(n==='new-icon_pivot'&&p.newVisible)return attachment('new_icon','new_icon','appear',p.cuadro-at(4),matrix,alpha);
   if(n==='symbol_pivot'&&p.symbolVisible){const sel=clip(p.ssbp,'character_lottery_symbol',p.resultados.length>1?'appear_multiple':'appear_single');
    return buildCharacterQuads(p.ssbp,tx,sel.pack,sel.animacion,Math.min(sel.animacion.numFrames-1,Math.max(0,p.cuadro-at(4))),{matrix,alpha,particles:true,seed:p.seed,
     attachments:({part,matrix,alpha})=>{const tex=p.numeros?.get(p.resultado.hacking_crystals);if(part.name!=='num_text_pivot'||!tex)return[];
      const q=imageQuad(tex,-500,-50,1000,100,alpha);q.pts=q.pts.map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);return[q];}});}
   return[];
  }});
 renderer.drawQuads(quads);ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.drawImage(canvas,0,0);
}
