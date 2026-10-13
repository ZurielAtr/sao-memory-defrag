// D81–D83: contratos en docs/dialogos-{efectos,animaciones,sacudidas,gamma-transiciones}-d*.md. Reloj RAF.
const FUNDIDOS = {
  2:['#000',255,0,1],3:['#000',0,255,1],4:['#fff',255,0,1],5:['#fff',0,255,1],
  6:['#000',127,0,.3],7:['#000',0,127,.3],8:['#000',255,0,1],9:['#000',0,255,1],
  10:['#fff',255,0,1],11:['#fff',0,255,1],13:['#000',255,255,1],
  14:['#fff',255,255,1],15:['#000',127,127,1],
};
const CONSERVAR = new Set([3,5,7,13,14,15]);
// Vectores/easing confirmados; acumulación relativa del port pendiente de comparar con Android.
const MOVIMIENTOS = {
  1:[[-30,.15],[30,.15]],2:[[-10,.08],[50,.12],[-50,.12],[50,.12],[-50,.12],[10,.08]],
  3:[[-12,1/15],[60,.1],[-60,.1],[12,1/15]],
};
// Shake::update usa tiempo normalizado, 2π float32 y fase en radianes.
const DOS_PI=6.2831854820251465;
export function sacudida(t,amplitud,frecuencia,fase=0,amortiguar=true){
  return amplitud*(amortiguar?1-t:1)*(amortiguar?Math.cos:Math.sin)(DOS_PI*frecuencia*t+fase);
}

/** Efectos por ID del catálogo; un código no implementado nunca inventa un fundido. */
export class EfectosHistoria {
  constructor(catalogo={}, {cargarAnimacion=null,reducirMovimiento=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false}={}) { this.catalogo=catalogo;this.cargarAnimacion=cargarAnimacion;this.reducirMovimiento=reducirMovimiento;this.capas=new Map();this.tareas=[];this.movimientos=new Map();this.pendientes=new Set();this.gammaFondo=1;this.sacudidaFondo=null; }
  get ocupado(){return this.tareas.length>0;}
  esperar(segundos){
    if(!(segundos>0))return Promise.resolve();
    return new Promise(resolver=>this.tareas.push({total:segundos,t:0,resolver}));
  }
  ejecutar(ids,fase='antes') {
    const promesas=[];
    for(const id of ids.filter(id=>id>0)){
      const efecto=this.catalogo[id],f=FUNDIDOS[efecto?.tipo];
      if(efecto?.tipo===0)continue;
      if(efecto?.tipo===16 || efecto?.tipo===17){this.gammaFondo=efecto.tipo===16?2.5:1;continue;}
      if(efecto?.tipo===12){
        this.sacudidaFondo={t:0};
        promesas.push(this.esperar(1));continue;
      }
      if(efecto?.tipo===1&&this.cargarAnimacion){
        const capa={visible:true,animacion:null};this.capas.set(efecto.modo===2?0:21,capa);
        promesas.push(new Promise(resolver=>{
          const tarea={tipo:1,capa,cargando:true,t:0,resolver};this.tareas.push(tarea);
          void Promise.resolve().then(()=>this.cargarAnimacion(efecto)).then(animacion=>{
            if(!this.tareas.includes(tarea))return;
            if(!Number.isFinite(animacion.duracion)||animacion.duracion<=0)throw Error('Duración SS inválida');
            Object.assign(tarea,{animacion,cargando:false,total:animacion.duracion});capa.animacion=animacion;
          }).catch(()=>{
            if(!this.tareas.includes(tarea))return;
            // Robustez local: recurso incompatible libera el avance en lugar de esperar sin fin.
            this.pendientes.add(`${id}:SS`);this.finalizar(tarea);
          });
        }));continue;
      }
      if(!f){this.pendientes.add(`${id}:${efecto?.tipo??'ausente'}`);continue;}
      const [color,inicio,fin,duracion]=f,tag=efecto.modo===2?0:21;
      const capa={color,alpha:inicio,visible:true};this.capas.set(tag,capa);
      promesas.push(new Promise(resolver=>this.tareas.push({capa,tipo:efecto.tipo,inicio,fin,duracion,
        espera:fase==='antes'?.3:0,total:duracion+.3,t:0,resolver})));
    }
    return Promise.all(promesas);
  }
  mover(hueco,tipo=0) {
    if(tipo===4&&this.movimientos.get(hueco)?.tipo===4)return;
    this.movimientos.delete(hueco);
    if(tipo===0)return;
    if(tipo===4){this.movimientos.set(hueco,{tipo,t:0,dx:0,dy:0});return;}
    const pasos=MOVIMIENTOS[tipo];
    if(!pasos){this.pendientes.add(`personaje:${tipo}`);return;}
    this.movimientos.set(hueco,{pasos,t:0,dy:0});
  }
  desplazamiento(hueco){return this.reducirMovimiento()?0:this.movimientos.get(hueco)?.dy??0;}
  desplazamientoX(hueco){return this.reducirMovimiento()?0:this.movimientos.get(hueco)?.dx??0;}
  desplazamientoFondo(){
    if(!this.sacudidaFondo||this.reducirMovimiento())return [0,0];
    const t=Math.min(1,this.sacudidaFondo.t/.4);
    return [sacudida(t,60,6),sacudida(t,40,4,1)];
  }
  finalizar(tarea){
    if(tarea.capa)tarea.capa.visible=CONSERVAR.has(tarea.tipo);
    this.tareas.splice(this.tareas.indexOf(tarea),1);tarea.resolver();
  }
  actualizar(dt) {
    dt=Math.max(0,dt);
    if(this.sacudidaFondo){this.sacudidaFondo.t+=dt;if(this.sacudidaFondo.t+1e-9>=.4)this.sacudidaFondo=null;}
    for(const tarea of [...this.tareas]){
      if(tarea.cargando)continue;
      tarea.t+=dt;
      if(tarea.animacion)tarea.animacion.actualizar(tarea.t);
      else if(tarea.capa){
        const f=Math.max(0,Math.min(1,(tarea.t-tarea.espera)/tarea.duracion));
        tarea.capa.alpha=tarea.inicio+(tarea.fin-tarea.inicio)*f*f; // EaseIn(2)
      }
      if(tarea.t+1e-9>=tarea.total){
        this.finalizar(tarea);
      }
    }
    for(const [h,m] of this.movimientos){
      if(m.tipo===4){m.t+=dt;m.dx=sacudida((m.t%.1)/.1,4,1,0,false);continue;}
      m.t+=dt;let restante=m.t-.3,y=0;
      if(restante>0)for(const [dy,duracion] of m.pasos){
        const f=Math.min(1,Math.max(0,restante/duracion)),ease=f<.5?2*f*f:1-2*(1-f)*(1-f);
        y+=dy*ease;restante-=duracion;if(restante<=0)break;
      }
      m.dy=y;
      if(m.t+1e-9>=.3+m.pasos.reduce((a,p)=>a+p[1],0))this.movimientos.delete(h);
    }
  }
  dibujar(ctx){
    // Composición del port: capas de color sobre el diálogo, en orden de tag.
    ctx.setTransform(1,0,0,1,0,0);
    for(const [,c] of [...this.capas].sort(([a],[b])=>a-b))if(c.visible){
      if(c.animacion)c.animacion.dibujar(ctx);
      else if(c.color){ctx.globalAlpha=c.alpha/255;ctx.fillStyle=c.color;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);}
    }
    ctx.globalAlpha=1;
  }
  cancelar(){for(const t of this.tareas)t.resolver();this.tareas=[];this.movimientos.clear();this.capas.clear();this.gammaFondo=1;this.sacudidaFondo=null;}
}
