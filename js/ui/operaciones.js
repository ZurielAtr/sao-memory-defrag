// D85: composición sobre las pantallas y botones originales de Herrería.
import {Pantalla,clonar} from './pantalla.js';
import {textoMenu} from './menus_principales.js';
import {envolverTexto} from './historia_menus.js';
const cortar=(s,n=38)=>s.length>n?s.slice(0,n-1)+'…':s;
export function botonOperacion(w,nombre,titulo,x,y,{ancho=334,activo=true}={}){
 const b=clonar(w.buscar('button'));Object.assign(b,{nombre,x,y,ancho,alto:90,anclaX:.5,anclaY:.5,escalaX:1,escalaY:1,visible:true,tactil:activo,alpha:activo?255:135});
 w.mostrar('image_icon_bg',false,b);w.mostrar('node_badge',false,b);
 b.hijos=[textoMenu(nombre+'_texto',titulo,ancho/2,45,{ancho:ancho-20,alto:84,tam:25})];
 Object.assign(b.hijos[0],{contorno:null,color:{r:35,g:62,b:72}});return b;
}
export function componerOperacion(p,w,{titulo,saldo,saldoTexto=null,filas=[],pagina=0,seleccion=[],detalle='',controles=[],confirmable=false,confirmarTexto='Revisar y confirmar',mensaje=''}){
 Object.assign(p.raiz,{ancho:750,alto:1334,x:0,y:0});
 const paginas=Math.max(1,Math.ceil(filas.length/6));pagina=Math.max(0,Math.min(pagina,paginas-1));
 p.raiz.hijos=[textoMenu('titulo_operacion',titulo,375,1260,{alto:60,tam:36}),
  textoMenu('saldo_operacion',saldoTexto??`${saldo??0} Col · ${seleccion.filter(x=>x!=null).length} seleccionadas`,375,1190,{alto:45,tam:26})];
 filas.slice(pagina*6,pagina*6+6).forEach((r,i)=>{
  const b=botonOperacion(w,'pieza_'+r.id,(seleccion.includes(r.id)?'✓ ':'')+cortar(r.texto),375,1110-i*90,{ancho:680,activo:r.activo!==false});
  b.alto=86;b.hijos[0].y=43;b.hijos[0].alto=84;
  if(r.detalle)b.hijos[0].texto=cortar(r.texto,r.imagen?32:38)+'\n'+r.detalle;
  if(r.imagen){Object.assign(b.hijos[0],{x:380,ancho:580,tamFuente:24});
   b.hijos.push({...textoMenu('foto_'+r.id,'',50,43,{ancho:70,alto:70}),clase:'ImageView',imagen:{path:r.imagen,plist:null,tipo:0},hijos:[]});}
  p.raiz.hijos.push(b);
 });
 if(!filas.length)p.raiz.hijos.push(textoMenu('sin_piezas','No hay piezas disponibles para esta selección.',375,930,{alto:180}));
 p.raiz.hijos.push(botonOperacion(w,'pagina_anterior','Anterior',183,530,{activo:pagina>0}),
  botonOperacion(w,'pagina_siguiente',`Siguiente · ${pagina+1}/${paginas}`,566,530,{activo:pagina+1<paginas}),
  textoMenu('detalle_operacion',envolverTexto(detalle,undefined,46).join('\n'),375,408,{alto:150,tam:24}),
  ...controles.map((c,i)=>botonOperacion(w,c.id,c.texto,controles.length===1?375:controles.length===2?183+383*i:125+250*i,280,{ancho:controles.length===1?500:controles.length===2?334:228,activo:c.activo!==false})),
  botonOperacion(w,'revisar_operacion',confirmarTexto,375,180,{ancho:500,activo:confirmable}),
  botonOperacion(w,'button_footer_return','Volver',375,70,{ancho:334}));
 if(mensaje)p.raiz.hijos.push(textoMenu('mensaje_operacion',cortar(mensaje,70),375,600,{alto:38,tam:21}));
 return p;
}
export async function crearPantallaOperacion(o){
 const [p,w]=await Promise.all([Pantalla.cargar('ui/blacksmith/blacksmith_s.csb'),Pantalla.cargar('ui/common/common_menu_widget.csb')]);
 componerOperacion(p,w,o);await p.precargar();return p;
}
export function componerConfirmacionOperacion(p,w,titulo,detalle){
 p.mostrar('image_header_tab',false);p.mostrar('button_ok',false);p.mostrar('button_close',false);
 p.texto('text_title',titulo);Object.assign(p.buscar('text_title'),{ancho:660,tamFuente:33,tamPropio:true});
 p.buscar('layout_contents').hijos=[textoMenu('requisitos_confirmacion',envolverTexto(detalle,undefined,42).join('\n'),375,350,{alto:250,tam:25})];
 const body=p.buscar('image_body');Object.assign(body,{clase:'Panel',alpha:255,color:{r:35,g:45,b:60},panel:{tipoColor:1,color:{r:18,g:30,b:46},opacidad:255,recorte:false}});
 p.raiz.hijos.unshift({...textoMenu('fondo_confirmacion','',-375,-450,{ancho:750,alto:900}),clase:'Panel',anclaX:0,anclaY:0,zOrder:-1,
  panel:{tipoColor:1,color:{r:18,g:30,b:46},opacidad:255,recorte:false},hijos:[]});
 body.hijos.push(botonOperacion(w,'cancelar_operacion','Cancelar',183,75),botonOperacion(w,'confirmar_operacion','Confirmar',566,75));
 Object.assign(p.raiz,{x:375,y:700});return p;
}
export async function crearConfirmacionOperacion(titulo,detalle){
 const [p,w]=await Promise.all([Pantalla.cargar('ui/common/common_popup_middle_s.csb'),Pantalla.cargar('ui/common/common_menu_widget.csb')]);
 componerConfirmacionOperacion(p,w,titulo,detalle);await p.precargar();return p;
}
