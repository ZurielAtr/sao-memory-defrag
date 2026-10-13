// D84: pantallas originales; composición y capacidades locales descritas en docs/menus-principales-d84.md.
import {Pantalla,clonar,aplicar} from './pantalla.js';
import {envolverTexto} from './historia_menus.js';
import {imagen} from './recursos.js';

export const DESTINOS_FOOTER=Object.freeze({button_home_town:'town',button_home_shop:'taberna',
  button_home_blacksmith:'upgrade',button_coop_party:'multi'});
export const DESTINOS_TOWN=Object.freeze([
 ['quest','Misiones','misiones'],['questboard','Multi','multi'],['scout','Taberna','taberna'],['base','Equipo','equipo'],
 ['training','Entrenamiento',null],['diamonds','Diamantes',null],['blacksmith','Upgrade','upgrade'],['weaponshop','Tienda de armas',null],
]);
export const DESTINOS_MENU_ORIGINAL=Object.freeze([
 ['announce','Avisos','icon_announce'],['notification','Notificaciones','icon_notification'],
 ['item','Objetos','icon_itemstrage'],['gift_box','Regalos','icon_giftbox'],
 ['exchangeshop','Intercambio','icon_exchangeshop'],['mission','Misiones','icon_mission'],
 ['status','Estado','icon_status'],['others','Otros','icon_other'],
 ['guild','Gremio','icon_guild'],['friend','Amigos','icon_friendlist'],
].map(([tipo,titulo,icono])=>Object.freeze({tipo,titulo,icono,boton:'menu_'+tipo,nodo:'node_'+tipo})));
export const PENDIENTES_MENU=Object.freeze({
 training:['Entrenamiento','El entrenamiento de personajes todavía está pendiente. Puedes usar el árbol y las ranuras desde Equipo o Upgrade.'],
 diamonds:['Diamantes','La compra de diamantes no está disponible. Tu saldo guardado se conserva.'],
 weaponshop:['Tienda de armas','Las ofertas y compras de esta tienda todavía están pendientes. Puedes gestionar las piezas que ya tienes desde Equipo.'],
 button_party_search:['Buscar grupo','Buscar jugadores y grupos necesita un servidor de multijugador. Puedes preparar tu equipo local y jugar misiones en solitario.'],
 button_friend_search:['Buscar amigos','La lista de amigos y sus invitaciones necesitan un servidor. No hay jugadores remotos conectados a esta partida local.'],
 button_numbersearch:['Buscar sala','No hay salas online ni números de sala disponibles sin servidor.'],
 button_matching:['Emparejamiento','El emparejamiento online necesita un servidor. Por ahora puedes jugar en solitario.'],
});

const base={visible:true,alpha:255,x:0,y:0,ancho:0,alto:0,anclaX:.5,anclaY:.5,escalaX:1,escalaY:1,
 rotX:0,rotY:0,zOrder:10,color:{r:255,g:255,b:255},flipX:false,flipY:false,hijos:[]};
export const textoMenu=(nombre,texto,x,y,{ancho=670,alto=120,tam=28}={})=>({...base,clase:'Text',nombre,texto,x,y,ancho,alto,
 fuente:'fonts/SAOFont-Regular_v1.ttf',tamFuente:tam,tamPropio:true,alineH:1,alineV:1,hijos:[],
 contorno:{color:{r:0,g:0,b:0},tam:1}});
export function componerTown(p,plantilla,town=null,tamanos={}){
 // TownLayer no tiene un CSB raíz. La ciudad se compone con background.f8;
 // MENU es su pantalla propia: estos destinos no son los objetos de la ciudad.
 const menu=p.raiz;menu.nombre='menu_town';
 for(const d of DESTINOS_MENU_ORIGINAL){
  const slot=p.buscar(d.nodo),boton=clonar(plantilla.buscar('button'));
  boton.nombre=d.boton;plantilla.texto('text_title',d.titulo,boton);
  plantilla.buscar('image_icon',boton).imagen={path:`ui/common/common_menu/${d.icono}.png`,plist:'ui/common/common_menu.plist',tipo:1};
  plantilla.mostrar('node_badge',false,boton);slot.hijos=[boton];
 }
 p.destinosMenuOriginal=DESTINOS_MENU_ORIGINAL;
 const ciudad=componerCiudadTown(town,tamanos);
 if(!ciudad){p.townOriginal=false;return p;}
 menu.visible=false;menu.zOrder=50;
 p.raiz={...base,clase:'Node',nombre:'town',ancho:750,alto:1334,anclaX:0,anclaY:0,hijos:[ciudad,menu]};
 p.townOriginal=true;p.puntosTown=town.patrones;
 return p;
}

/** Capas de la ciudad, compartidas por Town y Home; sin panel ni retrato añadido. */
export function componerCiudadTown(town,tamanos={}){
 if(!town?.fondo?.datos?.f8)return null;
 const bg=town.fondo.datos,escala=Math.max(bg.f6??.5,Math.min(bg.f7??1,bg.f5??.8));
 // Vista inicial local fija: Android sigue al actor y elige un punto aleatorio
 // de entrada. No atribuir esta cámara fija (x=1000) al cliente original.
 const camara=1000,tx=375-camara*escala;
 const ciudad={...base,clase:'Node',nombre:'ciudad_town',anclaX:0,anclaY:0,x:tx,escalaX:escala,escalaY:escala,zOrder:0,hijos:[]};
 for(const l of bg.f8){
  if(l.f3!==2||!l.f2)continue;
  const ruta=`images/background/${l.f16}/${l.f2}`,tam=tamanos[ruta];
  if(!tam?.width||!tam?.height)continue;
  const sx=l.f13??1,sy=l.f14??1,ancho=tam.width,alto=tam.height;
  const origenX=l.f7??0,origenY=l.f8??0;
  // Native 008185cc: anclas f5/f6, escala f13/f14 y zOrder f4.
  // 0081e5e0: posición de paralaje respecto al desplazamiento de la raíz.
  const x=origenX+(tx/escala)*((l.f9??1)-1),y=origenY;
  const repite=l.f11===3,periodo=Math.abs(ancho*sx)||1;
  const inicio=repite?Math.floor(((-tx/escala)-x)/periodo)-1:0;
  const fin=repite?Math.ceil(((750-tx)/escala-x)/periodo)+1:0;
  for(let k=inicio;k<=fin;k++)ciudad.hijos.push({...base,clase:'Sprite',nombre:`town_capa_${l.f1}_${k}`,
   imagen:{path:ruta,plist:null,tipo:0},ancho,alto,x:x+k*periodo,y,anclaX:l.f5??0,anclaY:l.f6??0,
   escalaX:sx,escalaY:sy,zOrder:l.f4??0,hijos:[],_capaNativa:l.f1});
 }
 return ciudad;
}

async function tamanosCiudad(town){
 const tamanos={};
 await Promise.all([...new Set((town?.fondo?.datos?.f8??[]).filter(l=>l.f3===2&&l.f2).map(l=>`images/background/${l.f16}/${l.f2}`))]
  .map(async ruta=>{const img=await imagen(ruta);if(img)tamanos[ruta]=img;}));
 return tamanos;
}

export async function crearCiudadTown({town}={}){
 const ciudad=componerCiudadTown(town,await tamanosCiudad(town));
 if(!ciudad)return null;
 const p=new Pantalla({raiz:{...base,clase:'Node',nombre:'ciudad_home',anclaX:0,anclaY:0,ancho:750,alto:1334,hijos:[ciudad]}});
 await p.precargar();return p;
}

export function componerTaberna(p,plantilla,cuenta,categoria='all',banners=[],indice=0){
 if(!['all','chara','weapon'].includes(categoria))categoria='all';
 // Conservar la jerarquía, anclas, escala y controles de character_lottery_s.
 // Sus cuatro variantes son plantillas, no cuatro ofertas simultáneas.
 for(const n of ['image_lottery','image_total','button_lottery','button_crystal','button_selection',
  'image_background_medal','image_background_event','image_title_medal','image_title_event',
  'node_button_medal_3','node_button_medal_4','node_button_event','panel_pageview_lottery',
  'image_time_bg_1','image_time_bg_2','text_header_duration'])p.mostrar(n,false);
 const disponibles=categoria==='weapon'?[]:banners.slice(0,3);
 p.totalBanners=disponibles.length;
 p.indiceBanner=Math.min(Math.max(0,Math.trunc(indice)||0),Math.max(0,disponibles.length-1));
 p.bannerActual=disponibles[p.indiceBanner]??null;
 const nombres={all:'Todos',chara:'Personajes',weapon:'Equipo'};
 for(const k of ['all','chara','weapon']){
  const b=p.buscar('button_category_'+k);b.alpha=k===categoria?255:170;
  p.texto('text_'+k,nombres[k]+` (${k==='weapon'?0:disponibles.length})`);
  p.mostrar('image_new',false,b);
 }
 const panel=p.buscar(categoria==='weapon'?'panel_equipment_buttons':'panel_character_buttons');
 for(const n of ['panel_character_buttons','panel_equipment_buttons','panel_event_buttons','panel_storage_buttons'])p.mostrar(n,n===panel.nombre);
 for(const n of ['button_draw_medal','button_draw_crystal','image_draw_once_cp','image_draw_eleven_cp'])p.mostrar(n,false,panel);
 const consultar=p.buscar(categoria==='weapon'?'button_odd':'button_testplay',panel);
 consultar.nombre='consultar_taberna';
 p.texto(categoria==='weapon'?'text_odd_2':'text_testplay',categoria==='chara'?'Tus personajes':'Gestionar equipo',consultar);
 const odd=categoria==='weapon'?null:p.buscar('button_odd',panel);
 if(odd){odd.visible=!!p.bannerActual;if(p.bannerActual)odd.nombre='banner_'+p.bannerActual.id;}
 // El catálogo comunitario no guarda el arte de estos banners históricos.
 // No mostrar la imagen de prueba del editor ni asignarle un banner ajeno.
 const pagina=p.buscar('page_lottery');pagina.imagen=null;
 for(const n of ['node_crystal_info_max','node_crystal_info','node_crystal','image_plus','image_info_max'])p.mostrar(n,false,pagina);
 const b=p.bannerActual;
 pagina.hijos.push(textoMenu('ofertas_taberna',b?b.nombre:'No hay banners disponibles',340,610,{ancho:620,alto:100,tam:42}),
  textoMenu('nota_taberna',b?`Archivo histórico · ${p.indiceBanner+1}/${disponibles.length}\n${b.inicio} — ${b.fin}\nReconstrucción comunitaria\nConsulta condiciones antes de reclutar.`:'Puedes consultar tu colección.\nNo hay sorteos de equipo disponibles.',340,430,{ancho:620,alto:220,tam:28}));
 for(const [nombre,count]of [['button_draw_once',1],['button_draw_eleven',11]]){
  const boton=p.buscar(nombre,panel);boton.visible=!!b;
  if(b){boton.nombre=count===1?'taberna_uno':'taberna_once';p.texto('text_draw_'+(count===1?'once':'eleven')+'_consume_number',b.precios[count],boton);}
 }
 p.texto('number_gem',cuenta?.user?.diamond??0);
 p.buscar('button_diamond_shop').nombre='diamonds';
 const ultimo=p.buscar('button_crystal');ultimo.visible=true;ultimo.nombre='ultimo_sorteo';
 p.mostrar('image_baloon',false,ultimo);
 // La consulta guardada es una función local; usar el marco sin texto del CSB
 // evita superponer una etiqueta a la imagen impresa «Crystal Scout».
 const marco=p.buscar('button_odd',p.buscar('panel_equipment_buttons'))??consultar;
 ultimo.boton=clonar(marco.boton);ultimo.scale9=clonar(marco.scale9);
 if(ultimo.scale9)ultimo.scale9.tam={width:ultimo.ancho,height:ultimo.alto};
 ultimo.hijos.push(textoMenu('texto_ultimo_sorteo','Último sorteo',ultimo.ancho/2,ultimo.alto/2,{ancho:210,alto:44,tam:22}));
 p.mostrar('button_left',disponibles.length>1&&p.indiceBanner>0);
 p.mostrar('button_right',disponibles.length>1&&p.indiceBanner<disponibles.length-1);
 return p;
}

export function componerUpgrade(p,plantilla,cuenta){
 for(const n of ['image_dummy_character','panel_character_face','image_sale_bg'])p.mostrar(n,false);
 p.texto('text_commont','Bienvenido a la\nherrería de Lisbeth');
 // 00b61c34 sustituye el título genérico por este frame cuando presenta Lisbeth.
 const titulo=p.buscar('image_title');titulo.clase='Sprite';titulo.ancho=254;titulo.alto=52;
 titulo.imagen={path:'ui/blacksmith_s/tittle_lisdeths_smith_shop.png',plist:'ui/blacksmith/blacksmith_s.plist',tipo:1};
 // tips_blacksmith.f0=2 -> image910070105: cuerpo/rostro originales de
 // Lisbeth, con la posición de capa de adventure_story_character_position.
 // El anclaje de la escena se conserva en node_character_blacksmith.
 const personaje=p.buscar('node_character_blacksmith');
 personaje.hijos.push({...base,clase:'Sprite',nombre:'personaje_blacksmith',
  imagen:{path:'images/story/character/1007_lisbeth_tutorial/body/01_ep7_normal2.png',plist:null,tipo:0},
  ancho:611,alto:1005,anclaX:.5,anclaY:0,zOrder:0,hijos:[{...base,clase:'Sprite',nombre:'rostro_blacksmith',
   imagen:{path:'images/story/character/1007_lisbeth_tutorial/face/05_normal.png',plist:null,tipo:0},
   x:344.5,y:837.5,ancho:201,alto:201,zOrder:1,hijos:[]}]});
 return p;
}

export function componerMulti(p,plantilla){
 for(const n of ['button_eventsbanner','button_left','button_right','text_remaining_time'])p.mostrar(n,false);
 p.raiz.hijos.push(textoMenu('estado_multi','No hay eventos cooperativos disponibles.\nLas salas y búsquedas requieren un servidor.',375,1068,{ancho:600,alto:170,tam:28}));
 return p;
}

export async function crearMenuPrincipal(nombre,{cuenta,categoria='all',banners=[],indice=0,town=null}={}){
 const rutas={town:'ui/common/common_menu_other_s.csb',taberna:'ui/lottery/character_lottery_s.csb',
  upgrade:'ui/blacksmith/blacksmith_s.csb',multi:'ui/quest_board/quest_board_top_s.csb'};
 if(!rutas[nombre])throw Error('Menú desconocido');
 const [p,w]=await Promise.all([Pantalla.cargar(rutas[nombre]),Pantalla.cargar('ui/common/common_menu_widget.csb')]);
 const tamanos=nombre==='town'?await tamanosCiudad(town):{};
 ({town:()=>componerTown(p,w,town,tamanos),taberna:()=>componerTaberna(p,w,cuenta,categoria,banners,indice),
  upgrade:()=>componerUpgrade(p,w,cuenta),multi:()=>componerMulti(p,w)})[nombre]();
 await p.precargar();return p;
}

export async function crearAvisoPrincipal(titulo,mensaje){
 const p=await Pantalla.cargar('ui/common/common_popup_middle_s.csb');
 p.mostrar('image_header_tab',false);p.mostrar('button_ok',false);p.texto('text_title',titulo);
 Object.assign(p.buscar('text_title'),{ancho:660,tamFuente:34,tamPropio:true});
 const lineas=envolverTexto(mensaje,undefined,43);
 p.buscar('layout_contents').hijos=[textoMenu('mensaje_principal',lineas.join('\n'),375,360,{ancho:650,alto:280,tam:28})];
 const b=p.buscar('button_close');b.x=375;
 b.hijos.push(textoMenu('volver_aviso','Volver',64,-8,{ancho:180,alto:40,tam:26}));
 Object.assign(p.raiz,{x:375,y:700});await p.precargar();return p;
}

/** Orden visual de controles disponibles; un velo impide enfocar capas inferiores. */
export function zonaVisible(z){
 const rect=({m,w,h})=>{
  const puntos=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>aplicar(m,x,y));
  return [Math.min(...puntos.map(p=>p[0])),Math.min(...puntos.map(p=>p[1])),Math.max(...puntos.map(p=>p[0])),Math.max(...puntos.map(p=>p[1]))];
 };
 const r=rect(z);
 return !(z.recortes??[]).some(c=>{const p=rect(c);return r[0]>=p[2]||r[2]<=p[0]||r[1]>=p[3]||r[3]<=p[1];});
}
export function objetivosMenu(capas,acciones){
 let desde=0;capas.forEach((c,i)=>{if(c.velo)desde=i+1;});
 const vistos=new Set();return capas.slice(desde).flatMap(c=>c.pantalla?.zonas??[])
  .filter(z=>{if(!(z.n.nombre in acciones)||vistos.has(z.n.nombre)||!zonaVisible(z))return false;vistos.add(z.n.nombre);return true;})
  .sort((a,b)=>{const [ax,ay]=aplicar(a.m,a.w/2,a.h/2),[bx,by]=aplicar(b.m,b.w/2,b.h/2);return Math.abs(ay-by)>20?ay-by:ax-bx;});
}
