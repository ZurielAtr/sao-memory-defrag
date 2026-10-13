// D95: animaciones SpriteStudio de los nodos del Árbol (ss/others/ability_board_s/ability_board.ssbp).
// FUN_007f2e04 elige la animación por el estado del nodo (+0x288):
//   1 idle_freed/wait · 2,4 idle_liberation/wait · 3 idle_release/wait          (bucle)
//   5 release/appear_1 · 8 appear_2 · 6 appear_3 · 7,9 release_child/appear      (una vez)
// FUN_007f1f84/007f22c4/007f240c: nodo disponible → 1 (2 si tipo 9); adquirido → 3 (4 si tipo 9).
// FUN_005c9e6c: la compra normal usa el estado 5 (appear_1); al terminar, 007f3bac pasa el nodo a 3 y
// 007f3938 libera a sus hijos. appear_2/appear_3 dependen de condiciones especiales no reproducidas.
import {loadSSBP} from '../character.js';
import {SSRenderer,buildCharacterQuads} from '../renderer.js';

export const ANIM_ARBOL=Object.freeze({
  disponible:'ability_board_idle_freed/wait',
  limite:'ability_board_idle_liberation/wait',
  adquirido:'ability_board_idle_release/wait',
  liberar:'ability_board_release/appear_1',
  hijo:'ability_board_release_child/appear',
});

// 007f3938 pone en espera «libre» a los hijos al adquirir el padre, sin mirar materiales.
const CERRADO=new Set(['padre_requerido','nivel_requerido','ruptura_requerida','nodo_inexistente']);
/** Nodo abierto: no adquirido y sin bloqueo de padre/nivel/ruptura (pagar es otra cuestión). */
export const nodoAbierto=consulta=>Boolean(consulta)&&!consulta.adquirido&&!CERRADO.has(consulta.code);

/** Animación de espera de un nodo según su consulta (null = sin efecto, como el nodo bloqueado). */
export function esperaNodo(nodo,consulta){
  if(!nodo||nodo.tipo===0)return null;
  if(consulta?.adquirido)return nodo.tipo===9?ANIM_ARBOL.limite:ANIM_ARBOL.adquirido;
  if(nodoAbierto(consulta))return nodo.tipo===9?ANIM_ARBOL.limite:ANIM_ARBOL.disponible;
  return null;
}

const clip=(ssbp,ruta)=>{
  const [packName,animName]=ruta.split('/');
  const pack=ssbp.packs.find(p=>p.name===packName),animacion=pack?.anims.find(a=>a.name===animName);
  return animacion?.numFrames&&animacion.fps>0?{pack,animacion}:null;
};

/** Reloj de animaciones por nodo, independiente del dibujo para poder probarlo. */
export class RelojArbol {
  constructor(nodos){ // nodos: [{local, espera}]
    this.nodos=new Map(nodos.map(n=>[n.local,{espera:n.espera,unaVez:null,t:0}]));
  }
  /** Compra: el nodo reproduce la liberación y después sus hijos nuevos aparecen. */
  liberar(local,hijos=[]){
    const n=this.nodos.get(local);if(!n)return;
    n.unaVez={ruta:ANIM_ARBOL.liberar,t:0,alTerminar:()=>{for(const h of hijos){const x=this.nodos.get(h);if(x)x.unaVez={ruta:ANIM_ARBOL.hijo,t:0};}}};
  }
  actualizar(dt,duracion){
    for(const n of this.nodos.values()){
      n.t+=dt;
      if(n.unaVez){n.unaVez.t+=dt;if(n.unaVez.t>=duracion(n.unaVez.ruta)){const f=n.unaVez.alTerminar;n.unaVez=null;f?.();}}
    }
  }
  /** [local, ruta, segundos] de lo que se ve en cada nodo. */
  *visibles(){for(const [local,n] of this.nodos){if(n.unaVez)yield [local,n.unaVez.ruta,n.unaVez.t,false];else if(n.espera)yield [local,n.espera,n.t,true];}}
}

let superficie=null,recurso=null;

export async function cargarEfectosArbol(pantalla,nodos){
  superficie??=(()=>{const canvas=document.createElement('canvas');return {canvas,renderer:new SSRenderer(canvas)};})();
  recurso??=loadSSBP(superficie.renderer,'ss/others/ability_board_s','ability_board.ssbp').catch(e=>{recurso=null;throw e;});
  const datos=await recurso;
  return new EfectosArbol(pantalla,datos,nodos);
}

export class EfectosArbol {
  constructor(pantalla,datos,nodos){
    this.pantalla=pantalla;this.ssbp=datos.ssbp;this.textures=datos.textures;this.reloj=new RelojArbol(nodos);this.ultimo=null;
    this.clips=new Map();
  }
  clip(ruta){if(!this.clips.has(ruta))this.clips.set(ruta,clip(this.ssbp,ruta));return this.clips.get(ruta);}
  duracion(ruta){const c=this.clip(ruta);return c?c.animacion.numFrames/c.animacion.fps:0;}
  liberar(local,hijos){this.reloj.liberar(local,hijos);}
  actualizar(t){const dt=this.ultimo==null?0:Math.min(.1,Math.max(0,t-this.ultimo));this.ultimo=t;this.reloj.actualizar(dt,r=>this.duracion(r));}
  dibujar(ctx){
    const zonas=new Map(this.pantalla.zonas.map(z=>[z.n.nombre,z]));
    const quads=[];const c=ctx.canvas;
    for(const [local,ruta,t,bucle] of this.reloj.visibles()){
      const z=zonas.get(`nodo_${local}`),sel=this.clip(ruta);if(!z||!sel)continue;
      const {m}=z,cx=m[0]*72+m[2]*72+m[4],cy=m[1]*72+m[3]*72+m[5],s=Math.hypot(m[0],m[1]);
      const n=sel.animacion.numFrames,f=Math.floor(t*sel.animacion.fps),cuadro=bucle?f%n:Math.min(n-1,f);
      quads.push(...buildCharacterQuads(this.ssbp,this.textures,sel.pack,sel.animacion,cuadro,{matrix:[s,0,0,s,cx-c.width/2,c.height/2-cy],particles:true,seed:local}));
    }
    if(!quads.length)return;
    const {canvas,renderer}=superficie,gl=renderer.gl;
    if(canvas.width!==c.width||canvas.height!==c.height){canvas.width=c.width;canvas.height=c.height;}
    superficie.fondo??=renderer.createTexture(c);gl.bindTexture(gl.TEXTURE_2D,superficie.fondo.tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    renderer.view={zoom:1,x:0,y:0};renderer.begin();const blanco={rgba:[1,1,1,1],rate:0,func:-1};
    renderer.drawQuads([{tex:superficie.fondo,alpha:1,blend:0,pts:[[-c.width/2,c.height/2],[c.width/2,c.height/2],[-c.width/2,-c.height/2],[c.width/2,-c.height/2]],uvs:[[0,0],[1,0],[0,1],[1,1]],colors:[blanco,blanco,blanco,blanco]}]);
    renderer.drawQuads(quads);
    // Se llama dentro del recorte del tablero (Pantalla.alDibujar): sólo esa área recibe la copia.
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.drawImage(canvas,0,0);
  }
}
