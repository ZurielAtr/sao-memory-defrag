// D84: pantallas originales; composición y capacidades locales descritas en docs/menus-principales-d84.md.
import {Pantalla,clonar,aplicar} from './pantalla.js';
import {envolverTexto} from './historia_menus.js';

export const DESTINOS_FOOTER=Object.freeze({button_home_town:'town',button_home_shop:'taberna',
  button_home_blacksmith:'upgrade',button_coop_party:'multi'});
export const DESTINOS_TOWN=Object.freeze([
 ['quest','Misiones','misiones'],['questboard','Multi','multi'],['scout','Taberna','taberna'],['base','Equipo','equipo'],
 ['training','Entrenamiento',null],['diamonds','Diamantes',null],['blacksmith','Upgrade','upgrade'],['weaponshop','Tienda de armas',null],
]);
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
function acceso(plantilla,nombre,titulo,x,y,{pendiente=false}={}){
 const b=clonar(plantilla.buscar('button'));Object.assign(b,{nombre,x,y,alpha:pendiente?170:255});
 plantilla.mostrar('image_icon_bg',false,b);plantilla.mostrar('node_badge',false,b);
 const t=plantilla.buscar('text_title',b);Object.assign(t,{texto:titulo,x:167,ancho:300,tamFuente:28,tamPropio:true,alineH:1,
  color:{r:35,g:62,b:72},contorno:null});
 return b;
}

export function componerTown(p,plantilla){
 Object.assign(p.raiz,{ancho:750,alto:1334});
 p.raiz.hijos=[textoMenu('titulo_town','Town · Partida local',375,1240,{alto:70,tam:42}),
  textoMenu('estado_town','Accesos de la ciudad\nLas funciones online requieren servidor.',375,1130,{alto:90}),
  ...DESTINOS_TOWN.map(([id,titulo,destino],i)=>acceso(plantilla,'town_'+id,titulo,i%2?566:183,1000-Math.floor(i/2)*150,{pendiente:!destino})),
  textoMenu('nota_town','Equipo, progreso y materiales\nse conservan en esta partida.',375,335,{alto:100})];
 return p;
}

export function componerTaberna(p,plantilla,cuenta,categoria='all',banners=[]){
 if(!['all','chara','weapon'].includes(categoria))categoria='all';
 const botones=['all','chara','weapon'].map(k=>clonar(p.buscar('button_category_'+k)));
 // Variantes, banners y cantidades del editor no constituyen ofertas ni saldos del jugador.
 for(const n of ['image_lottery','image_total','button_lottery','button_crystal','button_selection',
  'image_background_diamond_need','image_background_medal','image_background_event','image_title_medal','image_title_event'])p.mostrar(n,false);
 p.buscar('layout_contents').hijos=[];
 const nombres={all:'Todos',chara:'Personajes',weapon:'Equipo'};
 botones.forEach((b,i)=>{
  const k=['all','chara','weapon'][i];Object.assign(b,{x:125+i*250,y:1155,anclaX:.5,anclaY:.5,alto:90,alpha:k===categoria?255:170});
  b.hijos=[textoMenu('tab_'+k,nombres[k],b.ancho/2,b.alto/2,{ancho:b.ancho-20,alto:50,tam:28})];
 });
 const personajes=cuenta?.characters?.length??0,piezas=cuenta?.equipment?.length??0;
 const pjs=`${personajes} ${personajes===1?'personaje':'personajes'}`,eq=`${piezas} ${piezas===1?'pieza':'piezas'}`;
 const conteo=categoria==='chara'?`${pjs} en tu partida`:categoria==='weapon'?`${eq} en tu inventario`:`${pjs} · ${eq}`;
 p.raiz.hijos.push(...botones,
  textoMenu('estado_taberna','Taberna · Reclutamiento',375,1020,{alto:70,tam:38}),
  textoMenu('ofertas_taberna','No hay ofertas de reclutamiento disponibles.\nLos sorteos y sus condiciones están pendientes.',375,845,{alto:150}),
  textoMenu('inventario_taberna',conteo,375,675,{alto:60,tam:30}),
  acceso(plantilla,'consultar_taberna',categoria==='chara'?'Tus personajes':'Gestionar equipo',375,550),
  textoMenu('nota_taberna','Consultar tu colección no consume diamantes\nni entrega personajes o equipo nuevos.',375,395,{alto:100}));
 if(banners.length&&categoria!=='weapon'){
  p.texto('ofertas_taberna','Banners históricos · grupos de Fanadata');p.buscar('ofertas_taberna').y=930;p.buscar('ofertas_taberna').alto=60;
  p.buscar('inventario_taberna').y=365;p.buscar('consultar_taberna').y=270;p.buscar('nota_taberna').y=170;
  p.texto('nota_taberna','Probabilidades y condiciones visibles en cada banner.\nReconstrucción comunitaria · partida local.');
  banners.slice(0,3).forEach((b,i)=>{const n=acceso(plantilla,'banner_'+b.id,b.nombre,375,815-i*145);n.ancho=650;
   const t=plantilla.buscar('text_title',n);Object.assign(t,{x:325,ancho:620});p.raiz.hijos.push(n);});
 }
 return p;
}

export function componerUpgrade(p,plantilla,cuenta){
 for(const n of ['image_dummy_character','panel_character_face','blooming','image_sale_bg'])p.mostrar(n,false);
 const t=p.buscar('text_commont');Object.assign(t,textoMenu('text_commont',
  `Upgrade · Herrería\n${cuenta?.equipment?.length??0} piezas en tu inventario\nSelecciona una operación para revisar sus requisitos.`,375,970,{ancho:660,alto:170,tam:30}));
 for(const n of ['button_progress','button_forge','button_sell','button_exchange']){
  const b=p.buscar(n);b.alpha=255;b.escalaX=b.escalaY=.83;
 }
 p.raiz.hijos.push(acceso(plantilla,'upgrade_arbol','Árbol',183,720),acceso(plantilla,'upgrade_ranuras','Ranuras',566,720),
  textoMenu('nota_upgrade','Árbol y ranuras usan tus materiales,\nrequisitos y mejoras guardadas.',375,575,{alto:100}));
 return p;
}

export function componerMulti(p,plantilla){
 for(const n of ['button_eventsbanner','button_left','button_right','text_remaining_time'])p.mostrar(n,false);
 p.texto('text_party_edit','Equipo local');
 for(const n of ['button_party_search','button_friend_search','button_numbersearch','button_matching'])p.buscar(n).alpha=170;
 p.raiz.hijos.push(textoMenu('estado_multi','Multi · Sin servidor',375,1230,{alto:70,tam:40}),
  textoMenu('nota_multi','Puedes preparar tu equipo y jugar solo.\nLas salas, amigos e invitaciones online\nrequieren un servidor.',375,1040,{alto:150}),
  acceso(plantilla,'multi_solo','Misiones en solitario',375,900));
 return p;
}

export async function crearMenuPrincipal(nombre,{cuenta,categoria='all',banners=[]}={}){
 const rutas={town:'ui/common/common_menu_other_s.csb',taberna:'ui/lottery/character_lottery_s.csb',
  upgrade:'ui/blacksmith/blacksmith_s.csb',multi:'ui/quest_board/quest_board_top_s.csb'};
 if(!rutas[nombre])throw Error('Menú desconocido');
 const [p,w]=await Promise.all([Pantalla.cargar(rutas[nombre]),Pantalla.cargar('ui/common/common_menu_widget.csb')]);
 ({town:()=>componerTown(p,w),taberna:()=>componerTaberna(p,w,cuenta,categoria,banners),
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
export function objetivosMenu(capas,acciones){
 let desde=0;capas.forEach((c,i)=>{if(c.velo)desde=i+1;});
 const vistos=new Set();return capas.slice(desde).flatMap(c=>c.pantalla?.zonas??[])
  .filter(z=>{if(!(z.n.nombre in acciones)||vistos.has(z.n.nombre))return false;vistos.add(z.n.nombre);return true;})
  .sort((a,b)=>{const [ax,ay]=aplicar(a.m,a.w/2,a.h/2),[bx,by]=aplicar(b.m,b.w/2,b.h/2);return Math.abs(ay-by)>20?ay-by:ax-bx;});
}
