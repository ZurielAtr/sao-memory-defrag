// D89: selección de categoría y lista de equipo desde sus escenas Cocos originales.
import {Pantalla,clonar} from './pantalla.js';
import {textoMenu} from './menus_principales.js';
const RANURAS={weapon:['Arma','Armas','weapon'],armor:['Armadura','Armaduras','armor'],accessory:['Accesorio','Accesorios','accessory']};
const recurso=path=>({path,plist:null,tipo:0});
const cortar=(s,n=26)=>s.length>n?s.slice(0,n-1)+'…':s;
function texto(nombre,s,x,y,{ancho=174,alto=48,tam=20}={}){
 const t=textoMenu(nombre,s,x,y,{ancho,alto,tam});t.color={r:35,g:62,b:72};t.contorno=null;return t;
}
function rareza(p,n,w,cantidad=0){
 n.hijos=clonar(w.buscar('image_rarity')).hijos;
 for(let i=1;i<=6;i++){p.mostrar('image_star_blank_'+i,false,n);p.mostrar('image_star_'+i,i<=cantidad,n);}
}
export async function plantillasInventario(){
 const [equipo,categoria,estrellas]=await Promise.all([
  Pantalla.cargar('ui/common/common_equipment_widget_s.csb'),Pantalla.cargar('ui/equip/equip_category_widget_s.csb'),
  Pantalla.cargar('ui/common/common_rarity_widget_s.csb')]);return {equipo,categoria,estrellas};
}
function piezaInventario(p,w,e,i){
 const n=clonar(w.equipo.buscar('equipment'));n.nombre='pieza_inventario_'+i;
 const b=p.buscar('button_background_equipment',n);Object.assign(b,{nombre:'elegir_arma_'+i,tactil:!e.dueno,alpha:e.dueno?150:255});b.boton.activo=!e.dueno;
 for(const k of ['icon_gold','icon_favourite','icon_material_select','dummy_sub_type_icon','text_hp_number','text_mp_number',
  'text_attack_number','text_defense_number','text_critical_number','image_bg_select'])p.mostrar(k,false,n);
 p.mostrar('icon_equipment_in',!!e.actual||!!e.dueno,n);p.mostrar('image_equipment_in_character',false,n);
 p.texto('text_equipment_in',e.actual?'Equip':'Usado',n);
 const frame=p.buscar('Image_frame',n);if(e.actual)frame.imagen=clonar(w.categoria.buscar('higlight_selected').imagen);
 const im=p.buscar('image_equip',n);im.visible=!!e.imagen;if(e.imagen)im.imagen=recurso(e.imagen);
 const sinPieza=e.uid==null;p.mostrar('equipment_status',!sinPieza,n);p.texto('text_equip_level_number',e.nivel??1,n);
 rareza(p,p.buscar('image_rarity',n),w.estrellas,e.rareza);
 n.hijos.push(texto('nombre_inventario_'+i,cortar(e.nombre??'Sin equipo'),0,-128));
 const estadisticas=typeof e.stats==='string'?e.stats:Object.entries(e.stats??{}).filter(([,v])=>v).map(([k,v])=>`${k.toUpperCase()} ${v}`).join(' · ');
 n.hijos.push(texto('stats_inventario_'+i,sinPieza?'Retirar equipo':cortar(estadisticas,46),0,-178,{alto:48,tam:17}));
 if(sinPieza)n.hijos.push(texto('retirar_inventario','Retirar',0,0,{ancho:150,alto:80,tam:25}));return n;
}
export async function componerListaEquipo(p,{piezas=[],categoria='weapon',pjNombre='',mensaje=''},plantillas=null){
 const w=plantillas??await plantillasInventario(),ranura=RANURAS[categoria];if(!ranura)throw new Error('Categoría de equipo desconocida');
 for(const k of ['image_body_material','image_header_material','image_footer_material','layout_contents_material','image_note','button_sort'])p.mostrar(k,false);
 p.texto('text_possession_equipment',ranura[1]);p.texto('possession_equipment_number',piezas.filter(e=>e.uid!=null).length);p.texto('text_close','Volver');
 const lista=p.buscar('equipment_list'),filas=Math.ceil(piezas.length/4),alto=Math.max(lista.alto,filas*290+40);
 lista.hijos=piezas.map((e,i)=>{const n=piezaInventario(p,w,e,i);Object.assign(n,{x:91+182*(i%4),y:alto-120-Math.floor(i/4)*290});return n;});
 lista.interior={...lista.interior,ancho:lista.ancho,alto,direccion:1};
 if(mensaje)p.raiz.hijos.push(texto('mensaje_inventario',mensaje,375,1200,{ancho:690,alto:70,tam:23}));
 return p;
}
export function componerCategoriasEquipo(p,{pjNombre='',imagenPersonaje=null,nivel=null,rareza:grado=0,stats=null,categorias={},cantidad=0,mensaje=''},w){
 p.mostrar('button_sort',false);p.mostrar('panel_switch',false);p.mostrar('status_passive_skill_node',false);p.mostrar('image_sao_status',false);
 p.mostrar('image_arrow_status',false);p.mostrar('dummy_job_icon',false);
 p.texto('text_character_name',pjNombre);p.texto('text_possession','Equipos');p.texto('text_possession_number',cantidad);p.texto('level_number',nivel??'');
 p.mostrar('text_level',nivel!=null);p.mostrar('level_number',nivel!=null);
 for(const [n,campo]of [['hp','hp'],['mp','mp'],['attack','atk'],['defense','def'],['critical','crit']]){
  p.texto(n+'_number',stats?.[campo]??'—');p.mostrar(n+'_number_after',false);
 }
 const retrato=p.buscar('dummy_character');retrato.visible=!!imagenPersonaje;
 if(imagenPersonaje){retrato.imagen=recurso(imagenPersonaje);retrato.alto=retrato.ancho;}
 const grupo=p.buscar('character_status_info');for(const n of p.buscarTodos('image_rarity',grupo))rareza(p,n,w.estrellas,grado);
 Object.entries(RANURAS).forEach(([tipo,[titulo,,sufijo]],i)=>{
  const ancla=p.buscar('button_select_equip_'+(i+1)),n=clonar(w.categoria.raiz),e=categorias[tipo];
  n.nombre='categoria_equipo_'+tipo;ancla.hijos=[n];
  const b=p.buscar('button_select_equip',n);Object.assign(b,{nombre:'categoria_'+tipo,tactil:true});
  p.mostrar('button_remove_equip',false,n);p.mostrar('higlight_selected',false,n);p.mostrar('image_background_gray',false,n);p.mostrar('dummy_sub_type_icon',false,n);
  for(const campo of ['weapon','armor','accessory'])p.mostrar('text_button_select_'+campo,campo===sufijo&&!e,n);
  p.texto('text_button_select_'+sufijo,titulo,n);const im=p.buscar('dummy_equip_image',n);im.visible=!!e?.imagen;if(e?.imagen)im.imagen=recurso(e.imagen);
  p.mostrar('image_title_background',!!e,n);p.texto('text_lv',e?'Lv '+(e.nivel??1):'',n);
  rareza(p,p.buscar('image_rarity',n),w.estrellas,e?.rareza);
 });
 // La lista inferior no simula equipo ajeno ni muestra datos de muestra. Cada tarjeta
 // abre la lista compatible de su categoría mediante las acciones del controlador.
 const lista=p.buscar('equipment_list');lista.hijos=[];
 lista.hijos.push(texto('ayuda_categorias',mensaje||'Elige arma, armadura o accesorio para cambiar su equipo.',lista.ancho/2,lista.alto/2,{ancho:680,alto:120,tam:25}));
 p.texto('text_button_ok','Listo');p.texto('text_button_close','Volver');return p;
}
export async function crearCategoriasEquipo(o){
 const [p,w]=await Promise.all([Pantalla.cargar('ui/equip/equip_select_s.csb'),plantillasInventario()]);
 componerCategoriasEquipo(p,o,w);await p.precargar();return p;
}
