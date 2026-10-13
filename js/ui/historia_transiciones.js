// D83: fases de BaseCommonPopupUI adaptadas a los popups recompuestos del port.
// Ver docs/dialogos-gamma-transiciones-d83.md; no hay timelines en estos CSB.
import {movimientoReducido} from './animaciones.js';
const limite=t=>Math.max(0,Math.min(1,t));
const salida=t=>1-(1-limite(t))**2;
const propiedades=['alto','escalaX','escalaY','alpha','y','visible','cascadaAlpha'];
const guardar=n=>Object.fromEntries(propiedades.map(k=>[k,n[k]]));

export class TransicionDialogo {
  constructor(p,{reducirMovimiento=movimientoReducido}={}){
    this.p=p;this.reducirMovimiento=reducirMovimiento;this.estado='abriendo';this.t=0;
    this.cuerpo=p.buscar('image_body');this.cabecera=p.buscar('image_header');
    this.pie=p.buscar('image_footer')??p.buscar('image_fotter');this.contenido=p.buscar('layout_contents');
    this.nodos=[this.cuerpo,this.cabecera,this.pie,this.contenido].filter(Boolean);
    this.bases=new Map(this.nodos.map(n=>[n,guardar(n)]));this.actualizar(0);
  }
  get interactiva(){return this.estado==='abierto';}
  get cerrada(){return this.estado==='cerrado';}
  get oscurecedor(){
    if(this.estado==='cerrado')return 0;
    if(this.estado==='cerrando')return this.sombraInicio*(1-limite(this.t/.18));
    return 205*limite(this.t/.1)/255;
  }
  restaurar(){for(const [n,b] of this.bases)Object.assign(n,b);}
  cerrar(){
    if(this.estado==='cerrando'||this.cerrada)return;
    this.sombraInicio=this.oscurecedor;this.inicios=new Map(this.nodos.map(n=>[n,guardar(n)]));
    this.estado='cerrando';this.t=0;this.actualizar(0);
  }
  actualizar(dt){
    if(this.interactiva||this.cerrada)return;
    this.t+=Math.max(0,dt);
    if(this.reducirMovimiento())this.t=this.estado==='cerrando'?.18:.35;
    if(this.estado==='abriendo'){
      if(this.t+1e-9>=.35){this.restaurar();this.estado='abierto';return;}
      const {cuerpo:b,cabecera:h,pie:f,contenido:c}=this;
      if(b){const s=this.bases.get(b);Object.assign(b,{alto:s.alto*salida((this.t-.15)/.2),
        escalaX:s.escalaX*(.5+.5*limite(this.t/.1)),escalaY:s.escalaY*(.5+.5*limite(this.t/.1)),
        alpha:s.alpha*limite((this.t-.15)/.2),cascadaAlpha:false});}
      if(h){const s=this.bases.get(h);h.alpha=255*limite(this.t/.1);h.y=s.y*salida((this.t-.15)/.2);}
      if(f)f.alpha=255*limite(this.t/.1);
      if(c){c.visible=this.bases.get(c).visible&&this.t>=.25;c.alpha=255*limite((this.t-.25)/.1);}
    }else{
      const t=limite((this.t-.1)/.1),b=this.cuerpo,c=this.contenido;
      if(b){const s=this.inicios.get(b);b.escalaX=s.escalaX*(1-salida(t));b.escalaY=s.escalaY+(1-s.escalaY)*salida(t);b.alpha=s.alpha*(1-t);b.cascadaAlpha=true;}
      if(c)c.alpha=this.inicios.get(c).alpha*(1-t);
      if(this.t+1e-9>=.18){this.restaurar();this.estado='cerrado';}
    }
  }
}
