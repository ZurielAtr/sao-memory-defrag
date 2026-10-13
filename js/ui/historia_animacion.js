// D82: SpriteStudio del catálogo de diálogo. f3 selecciona recurso/pack; etiqueta nativa dead.
import {loadSSBP} from '../character.js';
import {SSRenderer,buildCharacterQuads} from '../renderer.js';
import {baseCanvas} from './pantalla.js';

export function seleccionarAnimacionHistoria(ssbp,efecto){
  const pack=ssbp.packs.find(p=>p.name===efecto.animacion);
  const animacion=pack?.anims.find(a=>a.name==='dead');
  if(!animacion?.numFrames||!(animacion.fps>0))throw Error('Animación de diálogo dead no disponible');
  return {pack,animacion};
}

export class AnimacionHistoria {
  constructor(datos,efecto,superficie){
    Object.assign(this,datos);this.efecto=efecto;this.superficie=superficie;this.tiempo=0;
    this.duracion=this.animacion.numFrames/this.animacion.fps;
  }
  actualizar(tiempo){this.tiempo=Math.max(0,tiempo);}
  get terminada(){return this.tiempo+1e-9>=this.duracion;}
  get cuadro(){return Math.min(this.animacion.numFrames-1,Math.floor(this.tiempo*this.animacion.fps));}
  dibujar(ctx){
    const {canvas,renderer}=this.superficie,c=ctx.canvas,k=baseCanvas(c);
    if(canvas.width!==c.width||canvas.height!==c.height){canvas.width=c.width;canvas.height=c.height;}
    // Copiar la escena permite aplicar ADD/MUL/SUB sobre su color real, sin perder sus modos de mezcla.
    const gl=renderer.gl;
    this.superficie.fondo??=renderer.createTexture(c);
    gl.bindTexture(gl.TEXTURE_2D,this.superficie.fondo.tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    renderer.view={zoom:1,x:0,y:0};renderer.begin();
    const color={rgba:[1,1,1,1],rate:0,func:-1};
    renderer.drawQuads([{tex:this.superficie.fondo,alpha:1,blend:0,
      pts:[[-c.width/2,c.height/2],[c.width/2,c.height/2],[-c.width/2,-c.height/2],[c.width/2,-c.height/2]],
      uvs:[[0,0],[1,0],[0,1],[1,1]],colors:[color,color,color,color]}]);
    renderer.view={zoom:k[0],x:k[4]-c.width/2,y:c.height/2-k[5]};
    renderer.drawQuads(buildCharacterQuads(this.ssbp,this.textures,this.pack,this.animacion,this.cuadro,
      {x:this.efecto.x??0,y:this.efecto.y??0,scale:1}));
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.drawImage(canvas,0,0);
  }
}

let superficie=null;
const cache=new Map();
export async function cargarAnimacionHistoria(efecto){
  superficie??=(()=>{const canvas=document.createElement('canvas');return {canvas,renderer:new SSRenderer(canvas)};})();
  const nombre=efecto.animacion,ruta=String(efecto.carpeta??'')+String(nombre??'')+'.ssbp',separador=ruta.lastIndexOf('/');
  const carpeta=ruta.slice(0,separador),archivo=ruta.slice(separador+1);
  if(separador<=0||!nombre)throw Error('Recurso de diálogo ausente');
  const clave=ruta;
  if(!cache.has(clave))cache.set(clave,(async()=>{
    const datos=await loadSSBP(superficie.renderer,carpeta,archivo);
    const seleccion=seleccionarAnimacionHistoria(datos.ssbp,efecto);
    if(!datos.textures.size)throw Error('Texturas del diálogo no disponibles');
    return {...datos,...seleccion};
  })().catch(err=>{cache.delete(clave);throw err;}));
  return new AnimacionHistoria(await cache.get(clave),efecto,superficie);
}
