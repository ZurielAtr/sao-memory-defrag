// D95: acciones de nodos al estilo cocos2d (MoveTo/FadeTo/ScaleTo con su easing) para la interfaz.
// Avanzan con el bucle de dibujo (actualizarAcciones) y respetan el ajuste de animaciones (D91).
import {movimientoReducido} from './animaciones.js';

export const CURVAS=Object.freeze({
  lineal:t=>t,
  // EaseQuadraticActionOut / In (cocos2d-x 3.x)
  cuadraticaSalida:t=>-t*(t-2),
  cuadraticaEntrada:t=>t*t,
  // EaseBackOut (cocos2d-x 3.x, sobrepaso 1.70158)
  reboteSalida:t=>{const s=1.70158,u=t-1;return u*u*((s+1)*u+s)+1;},
});

const activas=new Set();

/** Lleva propiedades numéricas de un nodo a sus valores finales en `duracion` segundos. */
export function animar(nodo,destino,duracion,{curva='lineal',alTerminar=null,reducirMovimiento=movimientoReducido}={}){
  for(const a of activas)if(a.nodo===nodo)for(const k of Object.keys(destino))delete a.desde[k];
  const a={nodo,destino,duracion:Math.max(0,duracion),t:0,curva:CURVAS[curva]??CURVAS.lineal,alTerminar,
    desde:Object.fromEntries(Object.keys(destino).map(k=>[k,nodo[k]]))};
  if(reducirMovimiento()||a.duracion===0){terminar(a);return a;}
  activas.add(a);return a;
}

function terminar(a){
  for(const k of Object.keys(a.desde))a.nodo[k]=a.destino[k];
  activas.delete(a);a.alTerminar?.();
}

/** Avanza todas las acciones activas `dt` segundos. */
export function actualizarAcciones(dt){
  for(const a of [...activas]){
    a.t+=Math.max(0,dt);
    const f=a.duracion?Math.min(1,a.t/a.duracion):1,c=a.curva(f);
    for(const k of Object.keys(a.desde))a.nodo[k]=a.desde[k]+(a.destino[k]-a.desde[k])*c;
    if(f>=1)terminar(a);
  }
}

export const accionesActivas=()=>activas.size;
export function detenerAcciones(nodo=null){for(const a of [...activas])if(!nodo||a.nodo===nodo)activas.delete(a);}
