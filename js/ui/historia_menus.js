// D81: composición de menús con los CSB del jugador. Colocación del port.
import {Pantalla,clonar} from './pantalla.js';
import {pilaFuentes} from './recursos.js';

/** Sólo lo visitado; la línea en curso conserva exactamente el texto mostrado. */
export function registroVisible(registro, indice, mostrado) {
  return (registro ?? []).filter(r=>r.indice<=indice).map(r=>({...r,
    texto:r.indice===indice?r.texto.slice(0,Math.floor(mostrado)):r.texto}));
}

export function envolverTexto(texto, medir=s=>[...s].length, ancho=54) {
  const lineas=[];
  for(const parrafo of String(texto).split('\n')){
    let actual='';
    for(const palabra of parrafo.split(/\s+/).filter(Boolean)){
      if(actual&&medir(`${actual} ${palabra}`)>ancho){lineas.push(actual);actual='';}
      if(medir(palabra)>ancho){
        for(const c of palabra){if(actual&&medir(actual+c)>ancho){lineas.push(actual);actual='';}actual+=c;}
      }else actual+=`${actual?' ':''}${palabra}`;
    }
    lineas.push(actual);
  }
  return lineas;
}

export function rellenarRegistro(p,log,entradas) {
  const contenido=p.buscar('layout_contents'),lista=log.buscar('list_view_log'),molde=log.buscar('panel_log');
  p.texto('text_title','Registro de diálogos');p.texto('text_button_close','Volver');
  p.buscar('text_title').ancho=660;
  const fuente=log.buscar('text_talk'),medidor=typeof document==='undefined'?null:document.createElement('canvas').getContext('2d');
  if(medidor)medidor.font=`24px ${pilaFuentes(fuente.fuente)}`;
  const filas=entradas.map((r,i)=>{
    const n=clonar(molde),t=log.buscar('text_talk',n),nombre=log.buscar('text_character_name',n);
    const lineas=envolverTexto(r.texto,medidor?s=>medidor.measureText(s).width:undefined,medidor?558:54);
    const alto=Math.max(140,lineas.length*30+70);
    Object.assign(n,{alto,nombre:`registro_${i}`,anclaX:0,anclaY:0});
    Object.assign(nombre,{texto:r.nombre||'—',y:alto-17,anclaY:.5,ancho:580});
    Object.assign(t,{texto:lineas.join('\n'),x:118,y:alto-45,anclaX:0,anclaY:1,
      ancho:558,alto:lineas.length*30+8,tamFuente:24,tamPropio:true,alineH:0,alineV:0});
    const globo=log.buscar('image_balloon',n);Object.assign(globo,{y:alto-35,alto:alto-43,anclaY:1});
    // No se usa la miniatura de ejemplo del editor como retrato de otro personaje.
    log.mostrar('background_character',false,n);
    const voz=log.buscar('button_voice',n);
    Object.assign(voz,{nombre:`registro_voz_${i}`,x:51,y:alto/2,ancho:86,alto:86,visible:r.voz>0,_voz:r.voz});
    return n;
  });
  const alto=Math.max(778,filas.reduce((a,n)=>a+n.alto+8,0));let y=alto;
  for(const n of filas){y-=n.alto;n.x=0;n.y=y;y-=8;}
  Object.assign(lista,{x:10,y:90,anclaX:0,anclaY:0,hijos:filas,
    interior:{ancho:728,alto,direccion:1},_desplaz:Math.max(0,alto-lista.alto)});
  contenido.hijos=[lista];
  // El popup tiene origen central en el editor, sin tamaño propio.
  Object.assign(p.raiz,{x:375,y:650});
  return p;
}

export async function crearRegistro(entradas) {
  const [p,log]=await Promise.all([Pantalla.cargar('ui/common/common_popup_s.csb'),
    Pantalla.cargar('ui/adventure_story/adventure_story_log.csb')]);
  rellenarRegistro(p,log,entradas);await p.precargar();return p;
}

/** Confirmación del port; no se atribuye al callback Skip original. */
export async function crearSalto() {
  const p=await Pantalla.cargar('ui/common/common_popup_middle_s.csb');
  p.mostrar('image_header_tab',false);p.texto('text_title','¿Saltar la historia?');
  const titulo=p.buscar('text_title');Object.assign(titulo,{ancho:660,tamPropio:true,tamFuente:36});
  const contenido=p.buscar('layout_contents'),texto=clonar(titulo);
  Object.assign(texto,{nombre:'texto_salto',texto:'Terminarás este diálogo.\nPuedes seguir leyendo antes de continuar.',x:375,y:350,
    ancho:640,alto:170,tamFuente:30,tamPropio:true});contenido.hijos=[texto];
  for(const [boton,nombre] of [['button_close','Seguir leyendo'],['button_ok','Saltar']]){
    const label=clonar(titulo);Object.assign(label,{nombre:`texto_${boton}`,texto:nombre,x:64,y:-8,
      ancho:280,alto:40,tamFuente:24,tamPropio:true,alineH:1});p.buscar(boton).hijos.push(label);
  }
  Object.assign(p.raiz,{x:375,y:700});await p.precargar();return p;
}
