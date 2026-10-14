// D95: animaciones SpriteStudio de los nodos del Árbol (ss/others/ability_board_s/ability_board.ssbp).
// FUN_007f2e04 elige la animación por el estado del nodo (+0x288):
//   1 idle_freed/wait · 2,4 idle_liberation/wait · 3 idle_release/wait          (bucle)
//   5 release/appear_1 · 8 appear_2 · 6 appear_3 · 7,9 release_child/appear      (una vez)
// FUN_007f1f84/007f22c4/007f240c: nodo disponible → 1 (2 si tipo 9); adquirido → 3 (4 si tipo 9).
// FUN_005c9e6c: la compra normal usa el estado 5 (appear_1); al terminar, 007f3bac pasa el nodo a 3 y
// 007f3938 libera a sus hijos. appear_2/appear_3 dependen de condiciones especiales no reproducidas.
import {loadSSBP} from '../character.js';
import {SSRenderer,buildCharacterQuads} from '../renderer.js';
import {aplicar} from './pantalla.js';
import {animar} from './acciones.js';

export const ANIM_ARBOL=Object.freeze({
  disponible:'ability_board_idle_freed/wait',
  limite:'ability_board_idle_liberation/wait',
  adquirido:'ability_board_idle_release/wait',
  liberar:'ability_board_release/appear_1',
  hijo:'ability_board_release_child/appear',
  // D100: 005c9e6c usa appear_3 (estado 6, FUN_007f397c) al liberar un nodo de límite (tipo 9).
  liberarLimite:'ability_board_release/appear_3',
  subida:'ability_board_up/appear', // FUN_007f77d8
  aprender:'ability_board_learn/appear', // FUN_007f9044
  efecto:'ability_board_effect/appear', // FUN_007f9c8c
});

/** D100: animación de liberación según el tipo del nodo comprado (FUN_005c9e6c). */
export const liberacionNodo=tipo=>tipo===9?ANIM_ARBOL.liberarLimite:ANIM_ARBOL.liberar;

// FUN_007f77d8: estadísticas 1–5 (tabla 0x0143eb34: hp, mp, attack, defense, critical) cuyo texto
// text_{0}_number cuenta del valor anterior al nuevo en 0.6667 s (0x3f2aaaab) con ability_board_up/appear.
export const SUBIDA_ESTADO=2/3;
export const ESTADOS_SUBIDA=Object.freeze([['hp','hp'],['mp','mp'],['attack','atk'],['defense','def'],['critical','crit']]);
/** Estadísticas que suben de `antes` a `despues` ({hp, mp, atk, def, crit}). */
export const subidasEstado=(antes={},despues={})=>ESTADOS_SUBIDA
  .filter(([,c])=>Number(despues[c])>Number(antes[c]))
  .map(([estado,campo])=>({estado,campo,desde:Number(antes[campo]),hasta:Number(despues[campo])}));

// FUN_007f9044: por cada una de las tres skills activas cuyo nivel sube, si pasa a 1 se reproduce
// ability_board_learn/appear en su fila; si no, su texto «Lv{0}» empieza a escala 1.5 y vuelve a 1.1 con
// EaseBackOut en 0.5 s, y al terminar (FUN_007f9c8c) reproduce learn/appear y ability_board_effect/appear.
export const ESCALA_SKILL=Object.freeze({inicial:1.5,final:1.1,duracion:.5});
export const cambiosSkills=(antes=[],despues=[])=>despues.slice(0,3).flatMap((nivel,i)=>
  nivel>(antes[i]??0)?[{fila:i+1,nivel,tipo:nivel===1?'aprender':'subir'}]:[]);


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
  liberar(local,hijos=[],ruta=ANIM_ARBOL.liberar,alTerminar=null){
    const n=this.nodos.get(local);if(!n)return;
    n.unaVez={ruta,t:0,alTerminar:()=>{for(const h of hijos){const x=this.nodos.get(h);if(x)x.unaVez={ruta:ANIM_ARBOL.hijo,t:0};}alTerminar?.();}};
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
    this.sobre=[]; // D100: animaciones sobre nodos del panel de estado { nodo, ruta, t, alTerminar }
    this.contadores=[]; // textos que cuentan { nodo, desde, hasta, t }
  }
  clip(ruta){if(!this.clips.has(ruta))this.clips.set(ruta,clip(this.ssbp,ruta));return this.clips.get(ruta);}
  duracion(ruta){const c=this.clip(ruta);return c?c.animacion.numFrames/c.animacion.fps:0;}
  liberar(local,hijos,{ruta=ANIM_ARBOL.liberar,alTerminar=null}={}){this.reloj.liberar(local,hijos,ruta,alTerminar);}
  /** Reproduce `ruta` una vez centrada en el nodo de la interfaz (se dibuja tras él). */
  sobreNodo(nodo,ruta,{alTerminar=null}={}){
    if(!nodo||!this.clip(ruta)){alTerminar?.();return;}
    this.sobre.push({nodo,ruta,t:0,alTerminar});
    if(!nodo._efectosArbol){
      nodo._efectosArbol=true;const previo=nodo.alDibujar;
      nodo.alDibujar=(ctx,p,m)=>{previo?.(ctx,p,m);this.dibujarSobre(ctx,p,nodo,m);};
    }
  }
  /** El texto del nodo cuenta de `desde` a `hasta` en `duracion` segundos (FUN_007f7eb0). */
  contar(nodo,desde,hasta,duracion=SUBIDA_ESTADO){
    if(!nodo)return;nodo.texto=String(desde);this.contadores.push({nodo,desde,hasta,duracion,t:0});
  }
  /** FUN_007f77d8 y FUN_007f9044 tras una compra: estadísticas y skills del panel de estado. */
  animarEstado(p,{antes,despues,skillsAntes,skillsDespues}){
    for(const s of subidasEstado(antes,despues)){
      const n=p.buscar(`text_${s.estado}_number`);this.contar(n,s.desde,s.hasta);this.sobreNodo(n,ANIM_ARBOL.subida);
    }
    const cambios=cambiosSkills(skillsAntes,skillsDespues);
    for(const c of cambios){
      if(c.tipo==='aprender'){this.sobreNodo(p.buscar(`text_active_skill_${c.fila}`),ANIM_ARBOL.aprender);continue;}
      const n=p.buscar(`skill_number_${c.fila}`);if(!n)continue;
      n.escalaX=n.escalaY=ESCALA_SKILL.inicial;
      animar(n,{escalaX:ESCALA_SKILL.final,escalaY:ESCALA_SKILL.final},ESCALA_SKILL.duracion,{curva:'reboteSalida',alTerminar:()=>{
        this.sobreNodo(n,ANIM_ARBOL.aprender,{alTerminar:()=>{n.escalaX=n.escalaY=1;}});this.sobreNodo(n,ANIM_ARBOL.efecto);
      }});
    }
    return cambios.length>0;
  }
  /** D97: hay una liberación en curso (el cliente bloquea los toques del tablero hasta terminarla). */
  ocupado(){for(const n of this.reloj.nodos.values())if(n.unaVez)return true;return false;}
  actualizar(t){
    const dt=this.ultimo==null?0:Math.min(.1,Math.max(0,t-this.ultimo));this.ultimo=t;this.reloj.actualizar(dt,r=>this.duracion(r));
    for(const c of this.contadores){c.t+=dt;c.nodo.texto=String(Math.round(c.desde+(c.hasta-c.desde)*Math.min(1,c.t/c.duracion)));}
    this.contadores=this.contadores.filter(c=>c.t<c.duracion);
    for(const s of this.sobre)s.t+=dt;
    const terminados=this.sobre.filter(s=>s.t>=this.duracion(s.ruta));
    this.sobre=this.sobre.filter(s=>s.t<this.duracion(s.ruta));
    for(const s of terminados)s.alTerminar?.();
  }
  dibujarSobre(ctx,p,nodo,m){
    const [w,h]=p.tamano(nodo),[cx,cy]=aplicar(m,w/2,h/2),k=Math.hypot(m[0],m[1])/(nodo.escalaX||1); // el efecto no crece con el texto
    const c=ctx.canvas,quads=[];
    for(const s of this.sobre){
      if(s.nodo!==nodo)continue;const sel=this.clip(s.ruta);
      const cuadro=Math.min(sel.animacion.numFrames-1,Math.floor(s.t*sel.animacion.fps));
      quads.push(...buildCharacterQuads(this.ssbp,this.textures,sel.pack,sel.animacion,cuadro,{matrix:[k,0,0,k,cx-c.width/2,c.height/2-cy],particles:true}));
    }
    this.componer(ctx,quads);
  }
  dibujar(ctx){
    const zonas=new Map(this.pantalla.zonas.map(z=>[z.n.nombre,z]));
    const quads=[];const c=ctx.canvas;
    for(const [local,ruta,t,bucle] of this.reloj.visibles()){
      const z=zonas.get(`nodo_${local}`),sel=this.clip(ruta);if(!z||!sel)continue;
      const {m}=z,cx=m[0]*72+m[2]*72+m[4],cy=m[1]*72+m[3]*72+m[5],s=Math.hypot(m[0],m[1]);
      const n=sel.animacion.numFrames,f=Math.floor(t*sel.animacion.fps),cuadro=bucle?f%n:Math.min(n-1,f);
      quads.push(...buildCharacterQuads(this.ssbp,this.textures,sel.pack,sel.animacion,cuadro,{matrix:[s,0,0,s,cx-c.width/2,c.height/2-cy],particles:true,seed:local}));
    }
    this.componer(ctx,quads);
  }
  componer(ctx,quads){
    if(!quads.length)return;
    const c=ctx.canvas,{canvas,renderer}=superficie,gl=renderer.gl;
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
