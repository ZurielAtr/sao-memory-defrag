// D95: popups de los menús con la apertura/cierre de BaseCommonPopupUI.
// MenuWindowUI, CommonPopupUI y MenuPopupUI heredan sus virtuales +0x354/+0x358/+0x35c/+0x370–0x378
// (00a44900/00a44b40/00a44eac…) sin redefinirlos: es la misma transición que D83 ya reproduce en los
// diálogos (TransicionDialogo). Los nodos ausentes en un CSB (p. ej. image_body en el MENU) no se animan.
import {TransicionDialogo} from './historia_transiciones.js';

export class PopupAnimado {
  /**
   * @param {object} pantalla  Pantalla del popup.
   * @param {object} acciones  Acciones del popup; sólo responden con el popup abierto.
   * @param {object} opciones  cerrar: nombres que cierran con animación; alCerrar: se llama al terminar.
   */
  constructor(pantalla,acciones={},{cerrar=[],alCerrar=()=>{},alfaVelo=205/255,reducirMovimiento}={}){
    this.transicion=new TransicionDialogo(pantalla,reducirMovimiento?{reducirMovimiento}:{});
    this.alfaVelo=alfaVelo;this.alCerrar=alCerrar;this.pendiente=false;this.ultimo=null;
    const proteger=f=>(...a)=>this.transicion.interactiva?f(...a):undefined;
    this.acciones=Object.fromEntries(Object.entries(acciones).map(([k,f])=>[k,proteger(f)]));
    for(const k of cerrar)this.acciones[k]=()=>this.cerrar();
  }
  /** Inicia el cierre animado; alCerrar se ejecuta una vez al terminar. */
  cerrar(){
    if(!this.transicion.interactiva)return false;
    this.pendiente=true;this.transicion.cerrar();return true;
  }
  /** Color del velo: BaseCommonPopupUI oscurece a 205/255 en 0.1 s y lo retira al cerrar. */
  get velo(){return `rgba(0,0,0,${(this.alfaVelo*this.transicion.oscurecedor/(205/255)).toFixed(3)})`;}
  /** Avance por reloj absoluto en segundos (bucle de dibujo). */
  cada(t){
    const dt=this.ultimo==null?0:Math.min(.1,Math.max(0,t-this.ultimo));this.ultimo=t;
    this.transicion.actualizar(dt);
    if(this.pendiente&&this.transicion.cerrada){this.pendiente=false;this.alCerrar();}
  }
}
