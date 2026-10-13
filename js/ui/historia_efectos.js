// D81: contratos nativos en docs/dialogos-efectos-d81.md. El reloj usa el RAF del diálogo.
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

/** Efectos por ID del catálogo; un código no implementado nunca inventa un fundido. */
export class EfectosHistoria {
  constructor(catalogo={}) { this.catalogo=catalogo;this.capas=new Map();this.tareas=[];this.movimientos=new Map();this.pendientes=new Set(); }
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
      if(!f){this.pendientes.add(`${id}:${efecto?.tipo??'ausente'}`);continue;}
      const [color,inicio,fin,duracion]=f,tag=efecto.modo===2?0:21;
      const capa={color,alpha:inicio,visible:true};this.capas.set(tag,capa);
      promesas.push(new Promise(resolver=>this.tareas.push({capa,tipo:efecto.tipo,inicio,fin,duracion,
        espera:fase==='antes'?.3:0,total:duracion+.3,t:0,resolver})));
    }
    return Promise.all(promesas);
  }
  mover(hueco,tipo=0) {
    this.movimientos.delete(hueco);
    if(tipo===0)return;
    const pasos=MOVIMIENTOS[tipo];
    if(!pasos){this.pendientes.add(`personaje:${tipo}`);return;}
    this.movimientos.set(hueco,{pasos,t:0,dy:0});
  }
  desplazamiento(hueco){return this.movimientos.get(hueco)?.dy??0;}
  actualizar(dt) {
    dt=Math.max(0,dt);
    for(const tarea of [...this.tareas]){
      tarea.t+=dt;
      if(tarea.capa){
        const f=Math.max(0,Math.min(1,(tarea.t-tarea.espera)/tarea.duracion));
        tarea.capa.alpha=tarea.inicio+(tarea.fin-tarea.inicio)*f*f; // EaseIn(2)
      }
      if(tarea.t+1e-9>=tarea.total){
        if(tarea.capa)tarea.capa.visible=CONSERVAR.has(tarea.tipo);
        this.tareas.splice(this.tareas.indexOf(tarea),1);tarea.resolver();
      }
    }
    for(const [h,m] of this.movimientos){
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
      ctx.globalAlpha=c.alpha/255;ctx.fillStyle=c.color;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
    }
    ctx.globalAlpha=1;
  }
  cancelar(){for(const t of this.tareas)t.resolver();this.tareas=[];this.movimientos.clear();this.capas.clear();}
}
