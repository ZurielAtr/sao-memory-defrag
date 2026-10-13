// D86: resultados SpriteStudio oficiales R2/R3/R4. Sin partículas tipo4 ni eventos audio aún.
import {loadSSBP} from '../character.js';
import {SSRenderer,buildCharacterQuads} from '../renderer.js';
import {decodeFrame} from '../ssbp.js';
import {baseCanvas,Pantalla} from './pantalla.js';
import {imagen} from './recursos.js';
import {textoMenu} from './menus_principales.js';
import {botonOperacion} from './operaciones.js';

export function seleccionarResultado(ssbp,rareza){
 const nombre={2:'appear_1',3:'appear_2',4:'appear_3'}[rareza];
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
 const [p,w]=await Promise.all([Pantalla.cargar('ui/lottery/character_lottery_s.csb'),Pantalla.cargar('ui/common/common_menu_widget.csb')]);
 Object.assign(p.raiz,{x:0,y:0,ancho:750,alto:1334});
 p.raiz.hijos=[textoMenu('progreso_resultado',`Reclutamiento · ${indice+1}/${total}`,375,1240,{alto:70,tam:34}),
  textoMenu('nombre_resultado','',375,350,{alto:130,tam:34}),textoMenu('estado_resultado','',375,260,{alto:65,tam:28}),
  botonOperacion(w,'siguiente_resultado','Mostrar resultado',183,120),botonOperacion(w,'lista_resultados','Ver lista',566,120)];
 await p.precargar();return p;
}
