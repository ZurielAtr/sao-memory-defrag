// D89: contenedores, tarjetas y controles de los CSB originales, sin sustituir la raíz.
import {Pantalla,clonar} from './pantalla.js';
import {textoMenu} from './menus_principales.js';
import {envolverTexto} from './historia_menus.js';
import {configurarPie} from './pie.js';
import {recorrer} from './csb.js';
import {montarArteGacha} from './arte_gacha.js';
const cortar=(s,n=38)=>s.length>n?s.slice(0,n-1)+'…':s;
const modoDe=o=>o.modo??(/Reclut|Banner/.test(o.titulo)?'reclutamiento':/Vender/.test(o.titulo)?'sell':/Evol/.test(o.titulo)?'evolve':/Interc/.test(o.titulo)?'exchange':'strengthen');
export function rutaOperacion(o){
 const modo=modoDe(o);
 if(modo==='reclutamiento')return 'ui/lottery/'+(o.resultados?'character_lottery_result_s':o.todos?'lottery_select_list_s':'character_lottery_s')+'.csb';
 const nombre={strengthen:'strengthening',sell:'sell',evolve:'evolution',exchange:'exchange'}[modo];
 if(!nombre)throw new Error('Operación sin pantalla original: '+modo);
 return `ui/blacksmith/blacksmith_${nombre}${o.fase==='materiales'&&['evolve','exchange'].includes(modo)?'_material':''}_s.csb`;
}
const setTexto=(p,n,t)=>{p.texto(n,t);for(const x of p.buscarTodos(n)){x.tamPropio=true;x.alineH=1;}};
function activar(b,activo=true){if(!b)return;Object.assign(b,{visible:true,tactil:activo,alpha:activo?255:135});if(b.boton)b.boton.activo=activo;}
function renombrar(p,antes,despues,activo=true,desde=p.raiz){const b=p.buscar(antes,desde);if(b){b.nombre=despues;activar(b,activo);}return b;}
function textoClaro(nombre,texto,x,y,o={}){
 const t=textoMenu(nombre,texto,x,y,o);t.color={r:35,g:62,b:72};t.contorno=null;return t;
}
export function botonOperacion(w,nombre,titulo,x,y,{ancho=334,activo=true}={}){
 const b=clonar(w.buscar('button'));Object.assign(b,{nombre,x,y,ancho,alto:90,anclaX:.5,anclaY:.5,escalaX:1,escalaY:1,visible:true});
 w.mostrar('image_icon_bg',false,b);w.mostrar('node_badge',false,b);
 b.hijos=[textoClaro(nombre+'_texto',titulo,ancho/2,45,{ancho:ancho-20,alto:84,tam:25})];activar(b,activo);return b;
}
function paginador(w,pagina,paginas,x,y){
 const p=clonar(w.pager.raiz);Object.assign(p,{nombre:'paginador_operacion',x,y});
 w.pager.buscar('number',p).texto=`${pagina+1}/${paginas}`;
 for(const[n,id,activo]of [['swipe_arrow_left','pagina_anterior',pagina>0],['swipe_arrow_right','pagina_siguiente',pagina+1<paginas]]){
  const b=w.pager.buscar(n,p);Object.assign(b,{nombre:id,tactil:activo,alpha:activo?255:100});
 }
 w.pager.mostrar('image_swipe',false,p);return p;
}
function estrellas(w,contenedor,cantidad){
 const original=clonar(w.rareza.buscar('image_rarity'));contenedor.hijos=original.hijos;
 for(let i=1;i<=6;i++){
  w.rareza.mostrar('image_star_blank_'+i,false,contenedor);
  w.rareza.mostrar('image_star_'+i,i<=cantidad,contenedor);
 }
}
function tarjetaEquipo(w,r,seleccion){
 const n=clonar(w.equipo.buscar('equipment'));n.nombre='tarjeta_'+r.id;
 const b=w.equipo.buscar('button_background_equipment',n);b.nombre='pieza_'+r.id;activar(b,r.activo!==false);
 for(const k of ['icon_equipment_in','image_bg_select','icon_gold','icon_favourite','dummy_sub_type_icon',
   'text_hp_number','text_mp_number','text_attack_number','text_defense_number','text_critical_number'])w.equipo.mostrar(k,false,n);
 w.equipo.mostrar('icon_material_select',seleccion.includes(r.id),n);
 const im=w.equipo.buscar('image_equip',n);if(r.imagen)im.imagen={path:r.imagen,plist:null,tipo:0};else im.visible=false;
 w.equipo.texto('text_equip_level_number',r.nivel??1,n);w.equipo.buscar('equipment_status',n).visible=r.nivel!=null;
 estrellas(w,w.equipo.buscar('image_rarity',n),r.rareza??0);
 n.hijos.push(textoClaro('pieza_'+r.id+'_texto',(seleccion.includes(r.id)?'✓ ':'')+cortar(r.texto,28),0,-128,{ancho:215,alto:50,tam:20}));
 if(r.activo===false)n.alpha=140;return n;
}
function tarjetaPersonaje(w,r){
 const n=clonar(w.personaje.buscar('root'));n.nombre='tarjeta_'+r.id;
 const b=w.personaje.buscar('button',n);b.nombre='pieza_'+r.id;activar(b,r.activo!==false);
 for(const k of ['cost_number','hp_number','mp_number','attack_number','defense_number','critical_number',
  'text_level','level_number','dummy_job_icon','node_light','image_assist_bg','icon_party_set','image_obtainment_bg',
  'node_sortie_time','item_status','text_assist_not_character','text_scout_completion'])w.personaje.mostrar(k,false,n);
 const im=w.personaje.buscar('image_character',n);im.imagen={path:r.imagen,plist:null,tipo:0};
 const t=w.personaje.buscar('text_name',n);Object.assign(t,{nombre:'pieza_'+r.id+'_texto',texto:cortar(r.texto,19),ancho:180,tamFuente:22,tamPropio:true});
 estrellas(w,w.personaje.buscar('image_rarity',n),r.rareza??Number((r.detalle??'').match(/★(\d)/)?.[1]??0));
 n.hijos.push(textoClaro('detalle_'+r.id,r.detalle??'',118,-22,{ancho:230,alto:38,tam:22}));return n;
}
function montarPie(p,w){const pie=clonar(configurarPie(w.pie).raiz);pie.nombre='pie_operacion';p.raiz.hijos.push(pie);}
function controlesAuxiliares(p,w,o,y){
 const c=o.controles??[];
 c.forEach((r,i)=>p.raiz.hijos.push(botonOperacion(w,r.id,r.texto,c.length===1?375:c.length===2?270+230*i:210+165*i,y,
  {ancho:c.length===1?334:c.length===2?220:160,activo:r.activo!==false})));
}
function componerEquipo(p,w,o){
 const {filas=[],pagina=0,seleccion=[],detalle='',confirmable=false,mensaje=''}=o;
 const paginas=Math.max(1,Math.ceil(filas.length/6)),pag=Math.max(0,Math.min(pagina,paginas-1));
 p.mostrar('text_note_male',false);setTexto(p,'text_note_female','Selecciona las piezas para '+o.titulo.toLowerCase());
 p.mostrar('button_sort_0',false);p.mostrar('button_view',false);p.mostrar('button_exchange_help',false);p.mostrar('image_announce_bg',false);
 p.mostrar('text_no_duplicates',false);setTexto(p,'text_no_item','No hay piezas disponibles.');p.mostrar('text_no_item',!filas.length);
 setTexto(p,'text_possession','Equipos');setTexto(p,'text_possession_number',filas.length);
 setTexto(p,'text_select_number',seleccion.filter(x=>x!=null).length);setTexto(p,'text_select_info_1','');setTexto(p,'text_select_info_2','seleccionadas');
 setTexto(p,'text_weapon','Disponibles:');setTexto(p,'text_weapon_num',filas.length);setTexto(p,'text_announce','Cuatro armas intercambiables por destino');
 setTexto(p,'text_total','Venta');setTexto(p,'text_total_sell_number',Math.max(0,-(o.col??0)));
 const lista=p.buscar('content_list');lista.hijos=[];
 filas.slice(pag*6,pag*6+6).forEach((r,i)=>{
  const n=tarjetaEquipo(w,r,seleccion);Object.assign(n,{x:125+240*(i%3),y:lista.alto-110-Math.floor(i/3)*270});lista.hijos.push(n);
 });
 // El ScrollView original recibe los elementos que en Android carga el controlador.
 lista.hijos.push(textoClaro('detalle_operacion',envolverTexto(detalle,undefined,52).join('\n'),365,250,{ancho:680,alto:180,tam:23}));
 p.raiz.hijos.push(paginador(w,pag,paginas,375,565),textoClaro('saldo_operacion',`${o.saldo??0} Col · ${seleccion.filter(x=>x!=null).length} seleccionadas`,570,1288,{ancho:300,alto:68,tam:23}));
 controlesAuxiliares(p,w,o,275);
 const cerrar=p.buscar('button_close');if(cerrar)cerrar.visible=false;
 const confirmar=renombrar(p,'button_ok','revisar_operacion',confirmable);
 if(confirmar)setTexto(p,'text_ok','Revisar');
 else{
  const modelo=clonar(w.aceptar.buscar('button_ok'));Object.assign(modelo,{nombre:'revisar_operacion',x:375,y:70});
  w.aceptar.texto('text_ok','Revisar',modelo);activar(modelo,confirmable);p.raiz.hijos.push(modelo);
 }
 if(mensaje)p.raiz.hijos.push(textoClaro('mensaje_operacion',cortar(mensaje,70),375,425,{alto:48,tam:22}));
 montarPie(p,w);return p;
}
function componerReclutamiento(p,w,o){
 const {filas=[],pagina=0,resultados=false,todos=false}=o,paginas=Math.max(1,Math.ceil(filas.length/6)),pag=Math.max(0,Math.min(pagina,paginas-1));
 p.mostrar('image_total',false);
 p.mostrar('text_header_duration',false); // fecha de ejemplo del editor; el periodo real se muestra en detalle.
 for(const[n]of recorrer(p.raiz))if(n.nombre.match(/^node_crystal|^image_.*_cp|^image_draw_.*_cp|medal_category|event_category|^button_category_(medal|event)/))n.visible=false;
 for(const k of ['image_background_medal','image_background_event','text_retry_confirm','image_lottery_retrial_background'])p.mostrar(k,false);
 const esBanner=!resultados&&!todos;let lista;
 if(esBanner){
  for(const k of ['image_title_medal','image_title_event','panel_equipment_buttons','panel_event_buttons','panel_storage_buttons',
   'button_lottery','button_crystal','button_selection','button_category_all','button_category_chara','button_category_weapon',
   'medal_category_buttons','event_category_buttons','image_background_medal','image_background_event'])p.mostrar(k,false);
  const panel=p.buscar('panel_character_buttons');for(const k of ['button_draw_medal','button_draw_crystal','button_testplay'])p.mostrar(k,false,panel);
  renombrar(p,'button_odd','ver_tasas',true,panel);
  renombrar(p,'button_draw_once',o.count===1?'revisar_operacion':'sorteo_uno',o.count!==1||o.confirmable,panel);
  renombrar(p,'button_draw_eleven',o.count===11?'revisar_operacion':'sorteo_once',o.count!==11||o.confirmable,panel);
  setTexto(p,'text_draw_once_consume_number',25);setTexto(p,'text_draw_eleven_consume_number',250);
  lista=p.buscar('page_lottery');lista.hijos=[];
  lista.hijos.push(textoMenu('titulo_operacion',o.titulo,340,806,{ancho:630,alto:70,tam:31}),
   textoMenu('nota_arte_banner','Banner histórico · arte original no disponible',340,739,{ancho:630,alto:45,tam:22}));
  renombrar(p,'button_left','pagina_anterior',true);renombrar(p,'button_right','pagina_siguiente',true);
 }else if(todos){
  p.mostrar('image_title_equipment',false);p.mostrar('button_sort',false);p.mostrar('button_draw',false);
  renombrar(p,'button_close','ver_tasas');setTexto(p,'text_close','Banner');setTexto(p,'text_select','Probabilidades individuales · S-argo');
  lista=p.buscar('panel_character_list');lista.hijos=[];
 }else{
  p.mostrar('panel_event_buttons',false);const botones=p.buscar('panel_character_buttons');
  p.mostrar('button_draw_crystal',false,botones);p.mostrar('button_draw_medal',false,botones);
  const uno=renombrar(p,'button_draw_once','volver_banner',true,botones),once=renombrar(p,'button_draw_eleven','animar_sorteo',true,botones);
  for(const[b,t]of [[uno,'Volver al banner'],[once,'Ver animación']]){
   const modelo=w.aceptar.buscar('button_sort_0');Object.assign(b,{boton:clonar(modelo.boton),scale9:clonar(modelo.scale9),ancho:modelo.ancho,alto:modelo.alto});
   b.hijos=[textoClaro(b.nombre+'_texto',t,b.ancho/2,b.alto/2,{ancho:280,alto:80,tam:27})];
  }
  lista=p.buscar('panel_character_list');lista.hijos=[];
 }
 filas.slice(pag*6,pag*6+6).forEach((r,i)=>{
  const n=tarjetaPersonaje(w,r),escala=esBanner?.83:.9;
  Object.assign(n,{x:esBanner?35+215*(i%3):22+240*(i%3),y:(esBanner?472:lista.alto-265)-Math.floor(i/3)*(esBanner?258:280),escalaX:escala,escalaY:escala});lista.hijos.push(n);
 });
 if(!esBanner)p.raiz.hijos.push(paginador(w,pag,paginas,375,todos?380:490));
 const texto=envolverTexto(o.detalle??'',undefined,58).join('\n');
 p.raiz.hijos.push(textoMenu('detalle_operacion',texto,375,esBanner?516:resultados?400:265,{ancho:680,alto:esBanner?90:100,tam:18}));
 setTexto(p,'number_gem',o.diamantes??0);p.mostrar('button_diamond_shop',false);
 p.raiz.hijos.push(textoMenu('saldo_operacion',o.saldoTexto??'',530,1280,{ancho:420,alto:70,tam:23}));
 if(o.mensaje)p.raiz.hijos.push(textoMenu('mensaje_operacion',cortar(o.mensaje,70),375,340,{alto:40,tam:21}));
 montarPie(p,w);return p;
}
export function componerOperacion(p,w,o){return modoDe(o)==='reclutamiento'?componerReclutamiento(p,w,o):componerEquipo(p,w,o);}
export async function crearPantallaOperacion(o){
 const [p,w,equipo,personaje,pager,pie,aceptar,rareza]=await Promise.all([
  Pantalla.cargar(rutaOperacion(o)),Pantalla.cargar('ui/common/common_menu_widget.csb'),
  Pantalla.cargar('ui/common/common_equipment_widget_s.csb'),Pantalla.cargar('ui/common/common_character_widget_s.csb'),
  Pantalla.cargar('ui/common/common_pager_s.csb'),Pantalla.cargar('ui/common/common_footer_menu_s.csb'),
  Pantalla.cargar('ui/blacksmith/blacksmith_evolution_material_s.csb'),Pantalla.cargar('ui/common/common_rarity_widget_s.csb')]);
 Object.assign(w,{equipo,personaje,pager,pie,aceptar,rareza});componerOperacion(p,w,o);
 if(modoDe(o)==='reclutamiento'&&!o.resultados&&!o.todos&&o.arte){
  const pagina=p.buscar('page_lottery'),hijos=pagina.hijos;pagina.hijos=[];
  // Cartel original680×850: las tarjetas del pool pertenecen a la consulta de tasas.
  if(await montarArteGacha(p,pagina,o.arte))p.mostrar('detalle_operacion',false);
  else pagina.hijos=hijos;
 }
 await p.precargar();return p;
}
export function componerConfirmacionOperacion(p,w,titulo,detalle){
 p.mostrar('image_header_tab',false);setTexto(p,'text_title',titulo);
 p.mostrar('text_attention',false);p.mostrar('text_info',false);
 const t=p.buscar('text_title');if(t)Object.assign(t,{ancho:660,tamFuente:33,tamPropio:true});
 const contenido=p.buscar('layout_contents');contenido.hijos=[textoClaro('requisitos_confirmacion',envolverTexto(detalle,undefined,46).join('\n'),375,contenido.alto/2,{alto:contenido.alto-40,tam:25})];
 renombrar(p,'button_ok','confirmar_operacion');
 if(!renombrar(p,'button_cancel','cancelar_operacion'))renombrar(p,'button_close','cancelar_operacion');
 if(p.raiz.alto===0)Object.assign(p.raiz,{x:375,y:700});return p;
}
export async function crearConfirmacionOperacion(titulo,detalle,{modo}={}){
 const nombre={strengthen:'blacksmith_strengthening_confirm_s',evolve:'blacksmith_evolution_confirm_s',sell:'blacksmith_popup_sell_confirm_s',exchange:'blacksmith_exchange_confirm_s'}[modo];
 const p=await Pantalla.cargar(nombre?`ui/blacksmith/${nombre}.csb`:'ui/common/common_popup_middle_s.csb');
 componerConfirmacionOperacion(p,null,titulo,detalle);await p.precargar();return p;
}
