import { rutaWeb } from '../rutas.js';
// Flujo de la interfaz F2 (D49 + D54), con los .csb originales:
//   inicio (title.csb) → home (common_home_user_status_s.csb + common_footer_menu_s.csb) → mapa del
//   mundo y dificultad (quest_world_select.csb) → capítulos (quest_chapter_select.csb +
//   quest_chapter_select_widget_s.csb) → lista de misiones (quest_list_select_s.csb +
//   quest_select_button_s.csb; pulsación larga = detalle, quest_quest_detail_s.csb) → preparación
//   (quest_party_confirmation_s.csb; "Edit" = equipo, party_select_s.csb +
//   party_select_character_widget_s.csb + character_list_s.csb) → juego.html?…&volver=interfaz.html →
//   resultados (result_clear_background_1_s.csb y _2_s.csb) con los datos de quest/result.
// La cuenta va por la API (web/js/api: user/register, user/all, user/quest); el juego hace quest/start y
// quest/result (progreso.js, D45). Datos de mundos, capítulos y misiones: web/data/interfaz.json; textos
// de la interfaz: web/data/ui_textos.json (herramientas/exportar_interfaz.py). Ver NOTAS.md, "Interfaz F2".
//
// PROVISIONAL: qué .csb es cada pantalla y qué hace cada botón (por nombres de archivo y de nodos), qué
// nodos se ocultan (los .csb guardan todas las variantes visibles, como en el editor), fondos de home y
// menús, el parpadeo de "Link Start", el orden del carrusel de capítulos y que no hay
// transiciones.

import '../importador/comprobar.js'; // D68: sin datos (página pública sin importar) manda a la portada
import { Pantalla, baseCanvas, clonar, apilar, DISENO, desplazarLista } from './pantalla.js';
import { configurarPie } from './pie.js';
import { recorrer } from './csb.js';
import { imagen, fuenteTTF } from './recursos.js';
import { crearApiLocal } from '../api/index.js';
import { characterStats } from '../combate.js';
import { RANURAS_EQUIPO, equipoCompatible, equipoDeCuenta, equiposDeCuenta, sumarStatsEquipo, statsEquipo } from '../equipo.js';
import { tomarResultado } from './regreso.js';
import { audio } from '../audio/index.js';
import { montarAjustes } from '../audio/ajustes.js';
import { crearPantallaHabilidades } from './habilidades.js';
import { rutaRetratoEquipo } from './composicion_habilidades.js';
import { crearCategoriasEquipo, componerListaEquipo } from './inventario_equipo.js';
import { existe } from './recursos.js';
import { sumarStatsArbol } from '../habilidades.js';
import { clavesDisponibles, estadoMision, estadoCapitulo } from './disponibilidad_misiones.js';
import {DESTINOS_FOOTER,PENDIENTES_MENU,crearMenuPrincipal,crearCiudadTown,crearAvisoPrincipal,objetivosMenu} from './menus_principales.js';
import {consultarOperacion,TITULOS_EQUIPO,equipado} from '../operaciones_equipo.js';
import {crearPantallaOperacion,crearConfirmacionOperacion} from './operaciones.js';
import {consultarReclutamiento,probabilidadesBanner} from '../reclutamiento.js';
import {cargarAnimacionReclutamiento,controlesResultado} from './reclutamiento_animacion.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const FUENTE = 'fonts/SAOFont-Regular_v1.ttf';
const FONDO_TITULO = 'images/title/title.png';
const FONDO_MENU = 'images/ui_background/bg_ui_015.jpg';
const FONDO_HOME = 'images/ui_background/bg_ui_017.jpg'; // PROVISIONAL
const FONDO_MUNDO = (id) => `images/quest/world/background/${id}.jpg`; // world.f0 (DEDUCCIÓN por el nombre)
const IMAGEN_CAPITULO = (id) => `images/quest/chapter/list/chapter_list_${id}.png`; // chapter.f0
const MINIATURA = (id) => `images/unit/thumbnail/256/thumbnail_${id}.png`;
const ELEMENTOS = [null, 'unattributed', 'fire', 'water', 'wind', 'light', 'dark', 'earth']; // NOTAS "Elementos"
const NOMBRE_INICIAL = 'Kirito';
const LARGO = 0.5; // s de pulsación para el detalle (la lista dice "mantén pulsado")

const estado = {
  pantalla: null, // nombre de la pantalla actual (para pruebas)
  capas: [], // [{ img } | { pantalla } | { velo }] de abajo arriba
  acciones: {}, // nombre de nodo → (nodo) => void
  largas: {}, // nombre de nodo → (nodo) => void, con pulsación larga
  alTocarFondo: null,
  cada: null, // (t) => void antes de dibujar (animaciones)
  dificultad: 1,
  mundo: 1001,
  capitulo: null,
  personaje: 0, // índice en cuenta.characters
  grupo: [null, null], // Switch: índices en cuenta.characters de los puestos 2 y 3 del equipo (null = vacío)
  api: null,
  cuenta: null,
  quests: [],
  disponibles: null,
  datos: null, // web/data/interfaz.json
  indice: [], // web/data/misiones/index.json
  indicePorId: new Map(),
  errores: 0,
  volverEquipo: null,
  aperturaPrincipal: 0,
  foco: null,
  teclado: false,
};
window.__interfaz = estado;

// ---------- datos y cuenta (API) ----------
async function cargarDatos() {
  if (estado.datos) return;
  const leer = (u, def) => fetch(u).then((r) => (r.ok ? r.json() : def)).catch(() => def);
  [estado.datos, estado.indice] = await Promise.all([
    leer(rutaWeb('/data/interfaz.json'), { mundos: [], capitulos: {}, misiones: {}, skills: {} }),
    leer(rutaWeb('/data/misiones/index.json'), []),
  ]);
  estado.indicePorId = new Map(estado.indice.map(m=>[m.id,m]));
}

async function cargarCuenta() {
  estado.api ??= await crearApiLocal();
  try {
    estado.cuenta = (await estado.api.request('user/all')).data;
  } catch (e) {
    if (e.code !== 'sin_cuenta') throw e;
    await estado.api.request('user/register', { name: NOMBRE_INICIAL });
    estado.cuenta = (await estado.api.request('user/all')).data;
  }
  const progreso = (await estado.api.request('user/quest')).data;
  estado.quests = progreso.quests ?? [];
  estado.disponibles = clavesDisponibles(progreso.available);
  return estado.cuenta;
}

const master = () => estado.api?.backend?.master;
const nombrePersonaje = (id) => master()?.personaje(id)?.nombre ?? String(id);
const progresoDe = (id, dif) => estado.quests.find((q) => q.quest_id === Number(id) && q.difficulty === Number(dif));
const infoMision = (id) => estado.datos?.misiones?.[id] ?? null;
const personajes = () => estado.cuenta?.characters ?? [];
const personajeActual = () => personajes()[estado.personaje % Math.max(1, personajes().length)] ?? null;
// Personaje del puesto k (0–2) del equipo; los puestos 2 y 3 no repiten al del 1.
const miembroEn = (k) => {
  if (k === 0) return personajeActual();
  const c = personajes()[estado.grupo[k - 1]] ?? null;
  return c && c !== personajeActual() ? c : null;
};
const idsGrupo = () => [0, 1, 2].map(miembroEn).filter(Boolean).map((c) => c.character_id);
// Misiones exportadas (index.json) con la dificultad elegida, opcionalmente de un capítulo.
const misionesJugables = (capitulo = null) => estado.indice.filter((m) => m.dificultades?.[estado.dificultad]
  && (capitulo == null || infoMision(m.id)?.capitulo === capitulo));
const consultaMision = (m) => estadoMision(m, estado.dificultad, estado.disponibles, estado.indicePorId);

const fichas = new Map();
function fichaPersonaje(id) {
  if (!fichas.has(id)) fichas.set(id, fetch(rutaWeb(`/data/personajes/${id}.json`)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return fichas.get(id);
}

// ---------- nodos creados aquí ----------
const base = { visible: true, alpha: 255, escalaX: 1, escalaY: 1, rotX: 0, rotY: 0, zOrder: 0, tag: 0, actionTag: 0,
  color: { r: 255, g: 255, b: 255 }, flipX: false, flipY: false, hijos: [] };
const nodoImagen = (nombre, path, x, y, w, h, extra = {}) => ({ ...base, clase: 'ImageView', nombre, x, y, ancho: w, alto: h,
  anclaX: 0.5, anclaY: 0.5, imagen: { path, plist: null, tipo: 0 }, hijos: [], ...extra });
const nodoTexto = (nombre, texto, x, y, tam, color = { r: 255, g: 255, b: 255 }, extra = {}) => ({ ...base, clase: 'Text', nombre, x, y,
  ancho: 0, alto: 0, anclaX: 0.5, anclaY: 0.5, texto, tamFuente: tam, fuente: FUENTE, color, alineH: 1, alineV: 1,
  tamPropio: false, contorno: { color: { r: 0, g: 0, b: 0 }, tam: 2 }, hijos: [], ...extra });
// Imagen cuadrada (1500×1500, images/character) ajustada a un hueco de w×h desde arriba.
const ilustracion = (nombre, id, x, y, lado) => nodoImagen(nombre, `images/character/character_${id}.png`, x, y, lado, lado, { anclaY: 1 });

/** Cambia la imagen de un nodo a un archivo suelto (tipo 0). */
function ponerImagen(n, path) {
  if (n) n.imagen = { path, plist: null, tipo: 0 };
}

// ---------- escena y dibujo ----------
async function fondo(ruta) {
  return { img: await imagen(ruta) };
}

function escena(nombre, capas, acciones = {}, { alTocarFondo = null, cada = null, largas = {},teclado=['home','town','taberna','upgrade','multi','aviso-principal'].includes(nombre) } = {}) {
  Object.assign(estado, { pantalla: nombre, capas, acciones, alTocarFondo, cada, largas,teclado,foco:null });
  canvas.tabIndex=0;canvas.setAttribute('aria-label',`SAO MD · ${nombre}`);
  audio.escena(nombre);
  if (!nombre.startsWith('resultado')) void audio.contexto(nombre === 'titulo' ? 'titulo' : ['home','town','taberna','multi','reclutamiento','animacion-reclutamiento','confirmar-reclutamiento'].includes(nombre) ? 'home' : ['upgrade','equipo', 'armas', 'personajes', 'preparacion'].includes(nombre) ? 'equipo' : 'misiones');
  document.title = `SAO MD · ${nombre}`;
}

function dibujar(t) {
  // El siguiente cuadro se pide primero: un error al dibujar no debe parar el bucle (D54: el lienzo dejaba
  // de adaptarse a la ventana porque el bucle se cortaba).
  requestAnimationFrame(dibujar);
  try {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * devicePixelRatio)), h = Math.max(1, Math.round(r.height * devicePixelRatio));
    if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    estado.cada?.(t / 1000);
    const b = baseCanvas(canvas);
    for (const c of estado.capas) {
      if (c.img) {
        // Imagen de fondo de 1024×1334 centrada en el diseño de 750 de ancho.
        const iw = c.img.width * (DISENO.alto / c.img.height);
        ctx.setTransform(b[0], 0, 0, -b[3], b[4], b[5] + b[3] * DISENO.alto);
        ctx.drawImage(c.img, (DISENO.ancho - iw) / 2, 0, iw, DISENO.alto);
      } else if (c.animacion) {
        c.animacion.dibujar(ctx);
      } else if (c.velo) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = c.velo;
        ctx.fillRect(0, 0, w, h);
      } else {
        c.pantalla.dibujar(ctx, c.base ? c.base(b) : b);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const foco=estado.foco&&objetivosMenu(estado.capas,estado.acciones).find(z=>z.n.nombre===estado.foco);
    if(foco){ctx.save();ctx.setTransform(...foco.m);ctx.strokeStyle='#82d4e7';ctx.lineWidth=4/b[0];ctx.strokeRect(0,0,foco.w,foco.h);ctx.restore();}
  } catch (e) {
    if (estado.errores++ < 3) console.error('interfaz: error al dibujar', e);
  }
}

// Nodo con acción bajo el punto (de la capa de más arriba hacia abajo; un velo tapa lo de debajo).
function nodoBajo(x, y, filtro) {
  for (let i = estado.capas.length - 1; i >= 0; i--) {
    if (estado.capas[i].velo) return null;
    const p = estado.capas[i].pantalla;
    const n = p?.nodoEn(x, y, filtro);
    if (n) return n;
  }
  return null;
}

let toque = null;
const punto = (ev) => {
  const r = canvas.getBoundingClientRect();
  return [(ev.clientX - r.left) * canvas.width / r.width, (ev.clientY - r.top) * canvas.height / r.height];
};
canvas.addEventListener('pointerdown', (ev) => {
  estado.foco=null;canvas.focus({preventScroll:true});
  const [x, y] = punto(ev);
  const n = nodoBajo(x, y, (z) => z.nombre in estado.acciones || z.nombre in estado.largas);
  const lista = nodoBajo(x, y, (z) => z.interior);
  toque = { n, lista, x, y, d0: lista?._desplaz ?? 0, dx0: lista?._desplazX ?? 0, arrastre: false, t0: performance.now(), largo: false };
  if (n) n._pulsado = true;
  if (n && n.nombre in estado.largas) {
    const t = toque;
    setTimeout(() => {
      if (toque !== t || t.arrastre) return;
      t.largo = true;
      n._pulsado = false;
      estado.largas[n.nombre](n);
    }, LARGO * 1000);
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!toque?.lista) return;
  const [x, y] = punto(ev);
  const dy = y - toque.y;
  const dx = x - toque.x, dir = toque.lista.interior?.direccion;
  if (Math.abs(dir === 2 ? dx : dy) > 12 * devicePixelRatio || (dir === 3 && Math.abs(dx) > 12 * devicePixelRatio)) toque.arrastre = true;
  if (toque.arrastre) {
    const k = baseCanvas(canvas)[0];
    desplazarLista(toque.lista, -dx / k, dy / k, { x: toque.dx0, y: toque.d0 });
    if (toque.n) toque.n._pulsado = false;
  }
});
canvas.addEventListener('pointerup', () => {
  const t = toque;
  toque = null;
  if (!t) return;
  if (t.n) t.n._pulsado = false;
  if (t.arrastre || t.largo) return;
  if (t.n) {
    void audio.contexto(/cancel|return|cerrar|close/.test(t.n.nombre) ? 'cancelar' : /confirm|start|next/.test(t.n.nombre) ? 'confirmar' : 'seleccionar');
    estado.acciones[t.n.nombre]?.(t.n);
  } else estado.alTocarFondo?.();
});
canvas.addEventListener('wheel', (ev) => {
  const [x, y] = punto(ev);
  const lista = nodoBajo(x, y, (z) => z.interior);
  if (!lista) return;
  ev.preventDefault();
  desplazarLista(lista, lista.interior?.direccion === 2 || ev.shiftKey ? ev.deltaY : ev.deltaX, ev.shiftKey ? 0 : ev.deltaY);
}, { passive: false });
addEventListener('keydown', (ev) => {
  if(ev.ctrlKey||ev.metaKey||ev.altKey||ev.target.closest?.('[data-audio-ui]'))return;
  if(![canvas,document.body,document.documentElement].includes(ev.target))return;
  if (ev.key === 'Escape') {ev.preventDefault();(estado.acciones.button_next_cerrar ?? estado.acciones.button_footer_return ?? estado.acciones.button_close)?.();return;}
  if(estado.pantalla==='titulo'&&['Enter',' '].includes(ev.key)){ev.preventDefault();estado.alTocarFondo?.();return;}
  if(!estado.teclado)return;
  const objetivos=objetivosMenu(estado.capas,estado.acciones);
  if(['Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)&&objetivos.length){
    ev.preventDefault();canvas.focus({preventScroll:true});
    const atras=ev.shiftKey||['ArrowLeft','ArrowUp'].includes(ev.key),i=objetivos.findIndex(z=>z.n.nombre===estado.foco);
    estado.foco=objetivos[i<0?(atras?objetivos.length-1:0):(i+(atras?-1:1)+objetivos.length)%objetivos.length].n.nombre;
  }else if(['Enter',' '].includes(ev.key)&&estado.foco){ev.preventDefault();const n=objetivos.find(z=>z.n.nombre===estado.foco)?.n;if(n)estado.acciones[n.nombre]?.(n);}
  else if(['PageUp','PageDown'].includes(ev.key)){const lista=estado.capas.flatMap(c=>c.pantalla?.zonas??[]).find(z=>z.n.interior)?.n;if(lista){ev.preventDefault();desplazarLista(lista,0,ev.key==='PageUp'?-500:500);}}
});

// Pie común: conserva el ancla reflejada del CSB y la altura recuperada del código Android.
async function pie({ menu = false, volver = true } = {}) {
  const p = await Pantalla.cargar('ui/common/common_footer_menu_s.csb');
  return configurarPie(p, { menu, volver });
}

// ---------- pantallas ----------
async function titulo() {
  const [bg, p] = await Promise.all([fondo(FONDO_TITULO), Pantalla.cargar('ui/title/title.csb')]);
  p.mostrar('button_google', false); // sin Google Play Games
  p.mostrar('button_support', false); // soporte: no aplica sin servidor
  const link = p.buscar('link_start');
  escena('titulo', [bg, { pantalla: p }], {}, {
    alTocarFondo: () => cargarCuenta().then(home),
    cada: (t) => { link.alpha = Math.round(255 * (0.65 + 0.35 * Math.sin(t * 3))); }, // PROVISIONAL
  });
}

async function home() {
  const ticket=++estado.aperturaPrincipal;estado.volverEquipo=null;
  const [ciudad, barra, p] = await Promise.all([crearCiudadTown({town:master()?.data.town}), Pantalla.cargar('ui/common/common_home_user_status_s.csb'), pie({ menu: true, volver: false })]);
  const bg=ciudad?{pantalla:ciudad}:await fondo(FONDO_HOME);
  const u = estado.cuenta?.user ?? {};
  barra.texto('text_user_name', u.name ?? '');
  barra.texto('text_diamond', u.diamond ?? 0);
  barra.texto('rank_number', '1'); // PROVISIONAL: sin tabla de rango de jugador (D41)
  const gauge = barra.buscar('rank_gauge');
  if (gauge) gauge.porcentaje = 0;
  await barra.precargar();
  if(ticket!==estado.aperturaPrincipal)return;
  escena('home', [bg, { pantalla: barra }, { pantalla: p }], {
    ...accionesHome(),
  });
}

function accionesHome(){
  return {button_home_quest:()=>mundo(),button_home_party:()=>equipo(null,null),button_diamond_shop:()=>avisoPrincipal(...PENDIENTES_MENU.diamonds),
    ...Object.fromEntries(Object.entries(DESTINOS_FOOTER).map(([boton,nombre])=>[boton,()=>menuPrincipal(nombre)]))};
}

async function avisoPrincipal(titulo,mensaje){
  estado.aperturaPrincipal++;
  const anterior={pantalla:estado.pantalla,capas:estado.capas,acciones:estado.acciones,cada:estado.cada,foco:estado.foco,teclado:estado.teclado};
  const p=await crearAvisoPrincipal(titulo,mensaje);
  const volver=()=>{escena(anterior.pantalla,anterior.capas,anterior.acciones,{cada:anterior.cada,teclado:anterior.teclado});estado.foco=anterior.foco;};
  escena('aviso-principal',[...anterior.capas,{velo:'rgba(0,0,0,.8)'},{pantalla:p}],{button_close:volver,button_footer_return:volver});
}

async function menuPrincipal(nombre,categoria='all',indice=0){
  const ticket=++estado.aperturaPrincipal;
  await cargarCuenta();
  const [p,vuelta]=await Promise.all([crearMenuPrincipal(nombre,{cuenta:estado.cuenta,categoria,indice,banners:master().reclutamiento().banners,town:master().data.town}),pie()]);
  if(nombre==='town')vuelta.mostrar('button_footer_menu',true);
  if(ticket!==estado.aperturaPrincipal)return;
  const abrirEquipo=()=>equipo(null,()=>menuPrincipal(nombre,categoria,indice));
  const pendiente=k=>()=>avisoPrincipal(...PENDIENTES_MENU[k]);
  const acciones={button_footer_return:()=>home()};
  if(nombre==='town')acciones.button_footer_menu=()=>{const menu=p.buscar('menu_town');p.mostrar('menu_town',!menu.visible);};
  if(nombre==='town')for(const d of p.destinosMenuOriginal??[]){
    const mensajes={announce:'Los avisos del servicio original todavía no están disponibles.',notification:'No hay notificaciones del servicio original en esta partida local.',item:'El almacén de objetos todavía está pendiente. Los materiales guardados se muestran al adquirir mejoras.',gift_box:'La bandeja de regalos todavía está pendiente.',exchangeshop:'La tienda de intercambio de este menú todavía está pendiente.',mission:'Las tareas y recompensas de este menú todavía están pendientes.',status:'El estado de usuario completo todavía está pendiente.',others:'Las opciones originales de este submenú todavía están pendientes.',guild:'Los gremios todavía están pendientes.',friend:'La lista de amigos todavía está pendiente.'};
    acciones[d.boton]=()=>avisoPrincipal(d.titulo,mensajes[d.tipo]);
  }
  if(nombre==='taberna'){
    acciones.diamonds=pendiente('diamonds');
    for(const k of ['all','chara','weapon'])acciones['button_category_'+k]=()=>menuPrincipal('taberna',k);
    acciones.consultar_taberna=categoria==='chara'?()=>listaPersonajes(null,0,{volver:()=>menuPrincipal(nombre,categoria),seleccionar:false}):abrirEquipo;
    if(categoria!=='weapon')for(const b of master().reclutamiento().banners)acciones['banner_'+b.id]=()=>reclutamiento(b.id);
    acciones.button_left=()=>menuPrincipal('taberna',categoria,Math.max(0,p.indiceBanner-1));
    acciones.button_right=()=>menuPrincipal('taberna',categoria,Math.min(p.totalBanners-1,p.indiceBanner+1));
    if(p.bannerActual)for(const [accion,count]of [['taberna_uno',1],['taberna_once',11]])acciones[accion]=()=>reclutamiento(p.bannerActual.id,{pagina:0,count,todos:false,mensaje:'',resultados:null});
    if(categoria!=='weapon')acciones.ultimo_sorteo=async()=>{
      const r=(await estado.api.request('lottery/last-result')).data;
      if(!r)return avisoPrincipal('Último sorteo','Todavía no hay un resultado guardado en tu partida.');
      return reclutamiento(r.banner_id,{pagina:0,count:r.count,todos:false,mensaje:'Resultado guardado · consultar no consume diamantes',resultados:r.results});
    };
  }
  if(nombre==='upgrade'){
    for(const [k,modo]of Object.entries({button_forge:'strengthen',button_progress:'evolve',button_sell:'sell',button_exchange:'exchange'}))acciones[k]=()=>operacionEquipo(modo);
    acciones.button_party_organization=abrirEquipo;
    acciones.button_equipment_list=()=>{estado.volverEquipo=()=>menuPrincipal(nombre);return listaEquipo(null,0);};
    const abrirHabilidad=modo=>{estado.volverEquipo=()=>menuPrincipal(nombre);return habilidades(null,0,modo);};
    acciones.upgrade_arbol=()=>abrirHabilidad('arbol');acciones.upgrade_ranuras=()=>abrirHabilidad('ranuras');
  }
  if(nombre==='multi'){
    acciones.button_party_edit=abrirEquipo;acciones.multi_solo=()=>mundo();
    for(const k of ['button_party_search','button_friend_search','button_numbersearch','button_matching'])acciones[k]=pendiente(k);
  }
  const bg=await fondo(nombre==='town'?FONDO_HOME:FONDO_MENU);
  if(ticket!==estado.aperturaPrincipal)return;
  escena(nombre,[bg,{pantalla:p},{pantalla:vuelta}],acciones);
}

async function operacionEquipo(modo,o={pagina:0,fase:modo==='exchange'?'destinos':'base',uids:[],uid:null,nivel:null,destino:null,mensaje:''}){
 const ticket=++estado.aperturaPrincipal;await cargarCuenta();
 if(ticket!==estado.aperturaPrincipal)return;
 const cat=master(),cuenta=estado.cuenta,base=cuenta.equipment.find(e=>e.uid===o.uid),ficha=base&&cat.equipo(base.equipment_id);
 const params=modo==='strengthen'?{equipment_uid:o.uid,level:o.nivel}:modo==='evolve'?{equipment_uid:o.uid,material_uids:o.uids}:
  modo==='sell'?{equipment_uids:o.uids}:{equipment_id:o.destino,material_uids:o.uids};
 const q=consultarOperacion(cat,cuenta,modo,params);
 let filas,controles=[];
 const protegida=e=>equipado(cuenta,e.uid)||e.favorite||e.locked||e.protected||e.is_locked;
 const nombre=e=>`${cat.equipo(e.equipment_id)?.nombre??e.equipment_id} · Lv${e.level} · #${e.uid}`;
 if(o.fase==='destinos'){
  filas=(cat.operaciones().intercambio??[]).filter(r=>cat.equipo(r.id)).map(r=>({id:r.id,texto:cat.equipo(r.id).nombre,activo:!cuenta.equipment_exchanged_ids?.includes(r.id)}));
 }else{
  let propias=cuenta.equipment;
  if(o.fase==='materiales'&&modo==='evolve')propias=propias.filter(e=>e.uid!==o.uid&&e.equipment_id===base?.equipment_id);
  if(o.fase==='materiales'&&modo==='exchange')propias=propias.filter(e=>{const m=cat.equipo(e.equipment_id),d=cat.equipo(o.destino);return m?.tipo===1&&m.intercambiable&&e.equipment_id!==o.destino&&e.equipment_id!==d?.evolucion;});
  filas=propias.map(e=>({id:e.uid,texto:(protegida(e)&& (modo==='sell'||o.fase==='materiales')?'En uso/protegida · ':'')+nombre(e),activo:!((modo==='sell'||o.fase==='materiales')&&protegida(e))}));
 }
 filas=filas.map(r=>{
  const e=o.fase==='destinos'?null:cuenta.equipment.find(e=>e.uid===r.id);
  const f=cat.equipo(e?.equipment_id??r.id);
  return {...r,nivel:e?.level??1,rareza:f?.rareza??0,imagen:f?.imagen?`images/equipment/thumb/256/${f.imagen}_thumb256.png`:null};
 });
 const abrir=cambios=>operacionEquipo(modo,{...o,...cambios,mensaje:''});
 const acciones={button_footer_return:()=>menuPrincipal('upgrade'),pagina_anterior:()=>abrir({pagina:Math.max(0,o.pagina-1)}),pagina_siguiente:()=>abrir({pagina:Math.min(Math.ceil(filas.length/6)-1,o.pagina+1)})};
 for(const r of filas)if(r.activo!==false)acciones['pieza_'+r.id]=()=>{
  if(o.fase==='destinos')return abrir({destino:r.id,fase:'materiales',uids:[],pagina:0});
  if(modo==='sell'||o.fase==='materiales')return abrir({uids:o.uids.includes(r.id)?o.uids.filter(id=>id!==r.id):[...o.uids,r.id]});
  const e=cuenta.equipment.find(e=>e.uid===r.id);return abrir({uid:r.id,nivel:Math.min(e.level+1,cat.equipo(e.equipment_id).nivelMax),uids:[]});
 };
 if(modo==='strengthen'&&base){
  controles=[{id:'nivel_uno',texto:`Lv${Math.min(base.level+1,ficha.nivelMax)}`},{id:'nivel_cinco',texto:`Lv${Math.min(base.level+5,ficha.nivelMax)}`},{id:'nivel_maximo',texto:`Máx. Lv${ficha.nivelMax}`}];
  acciones.nivel_uno=()=>abrir({nivel:Math.min(base.level+1,ficha.nivelMax)});acciones.nivel_cinco=()=>abrir({nivel:Math.min(base.level+5,ficha.nivelMax)});acciones.nivel_maximo=()=>abrir({nivel:ficha.nivelMax});
 }
 if(modo==='evolve'&&base){controles=[{id:'elegir_copias',texto:o.fase==='materiales'?'Cambiar pieza':'Elegir copias'}];acciones.elegir_copias=()=>abrir({fase:o.fase==='materiales'?'base':'materiales',pagina:0});}
 if(modo==='exchange'&&o.destino){controles=[{id:'elegir_destino',texto:'Cambiar destino'}];acciones.elegir_destino=()=>abrir({fase:'destinos',pagina:0,uids:[]});}
 const detalles=q.destino?cat.equipo(q.destino):null;
 let detalle=modo==='exchange'?`Catálogo histórico · ${detalles?.nombre??'Elige el arma que recibirás'}\nCuatro armas intercambiables · una vez por destino`:
  modo==='sell'?`${o.uids.length} piezas · recibirás ${Math.max(0,-q.col)} Col`:base?`${ficha.nombre}\n${modo==='strengthen'?`Lv${base.level} → ${o.nivel}`:`Evolución → ${detalles?.nombre??'sin destino'} · Lv1`}`:'Selecciona una pieza';
 if(q.col>0)detalle+=`\nCoste: ${q.col} Col${q.factorCampana<1?' · campaña '+Math.round((1-q.factorCampana)*100)+'%':''}`;
 if(q.materiales.length)detalle+='\n'+q.materiales.map(r=>`${cat.objeto(r.id)?.nombre??r.id} ×${r.cantidad}`).join(' · ');
 if(q.copias)detalle+=`\nCopias adicionales: ${o.uids.length}/${q.copias}`;
 if(!q.permitida)detalle+='\n'+q.motivo;
 const p=await crearPantallaOperacion({modo,fase:o.fase,col:q.col,titulo:TITULOS_EQUIPO[modo]+(o.fase==='materiales'?' · Materiales':''),saldo:cuenta.user.col,filas,pagina:o.pagina,
  seleccion:modo==='sell'||o.fase==='materiales'?o.uids:o.fase==='destinos'?[o.destino]:[o.uid],detalle,controles,confirmable:q.permitida,mensaje:o.mensaje});
 if(q.permitida)acciones.revisar_operacion=async()=>{
  const confirmTicket=++estado.aperturaPrincipal;
  const anterior={capas:estado.capas,acciones:estado.acciones},consulta=(await estado.api.request('equipment/quote',{mode:modo,...params})).data;
  if(!consulta.permitida)return operacionEquipo(modo,{...o,mensaje:consulta.motivo});
  const consumidos=consulta.consumir.length?`Se consumirán ${consulta.consumir.length} piezas.\n`:'';
  const stats=consulta.stats?Object.keys(consulta.stats.antes).filter(k=>consulta.stats.antes[k]!==consulta.stats.despues[k]).slice(0,3)
   .map(k=>`${k.toUpperCase()} ${consulta.stats.antes[k]}→${consulta.stats.despues[k]}`).join(' · '):'';
  const premios=consulta.recibir.map(r=>`${cat.objeto(r.id)?.nombre??r.id} ×${r.cantidad}`).join(' · ');
  const resumen=`${detalle}\n${stats?stats+'\n':''}${premios?'Recibirás '+premios+'\n':''}${consumidos}Al confirmar se guardarán los cambios.`,popup=await crearConfirmacionOperacion(TITULOS_EQUIPO[modo],resumen,{modo});
  if(confirmTicket!==estado.aperturaPrincipal)return;
  let ocupada=false;
  const cancelar=()=>{if(!ocupada)escena('operacion-equipo',anterior.capas,anterior.acciones,{teclado:true});};
  escena('confirmar-equipo',[...anterior.capas,{velo:'rgba(0,0,0,.82)'},{pantalla:popup}],{cancelar_operacion:cancelar,button_footer_return:cancelar,confirmar_operacion:async()=>{
   if(ocupada)return;ocupada=true;popup.buscar('confirmar_operacion').alpha=135;
   try{await estado.api.request('equipment/'+modo,{...params,quote:consulta.quote});await cargarCuenta();
    await operacionEquipo(modo,{...o,uids:[],uid:modo==='sell'?null:o.uid,nivel:modo==='strengthen'?Math.min((o.nivel??0)+1,ficha.nivelMax):o.nivel,mensaje:'Cambios guardados en tu partida'});
   }catch(e){await operacionEquipo(modo,{...o,mensaje:e.message});}
  }},{teclado:true});
 };
 const bg=await fondo(FONDO_MENU);if(ticket!==estado.aperturaPrincipal)return;
 escena('operacion-equipo',[bg,{pantalla:p}],acciones,{teclado:true});
}

async function reclutamiento(id,o={pagina:0,count:1,todos:false,mensaje:'',resultados:null}){
 const ticket=++estado.aperturaPrincipal;await cargarCuenta();if(ticket!==estado.aperturaPrincipal)return;
 const cat=master(),cuenta=estado.cuenta,q=consultarReclutamiento(cat,cuenta,{banner_id:id,count:o.count}),b=q.banner;
 if(!b)return avisoPrincipal('Reclutamiento',q.motivo);
 const probabilidades=probabilidadesBanner(b,cat).sort((a,z)=>z.rareza-a.rareza||a.id-z.id);
 const visibles=o.resultados??(o.todos?probabilidades:probabilidades.filter(r=>r.rareza===4));
 const filas=visibles.map((r,i)=>({id:o.resultados?i:r.id,rareza:o.resultados?cat.personaje(r.character_id).rareza:r.rareza,imagen:MINIATURA(o.resultados?r.character_id:r.id),texto:o.resultados?nombrePersonaje(r.character_id):r.nombre,
  detalle:o.resultados?r.duplicate?'Repetido · +'+r.hacking_crystals+' cristales':'Nuevo · ★'+cat.personaje(r.character_id).rareza:
   `★${r.rareza} · ${r.porcentaje.toFixed(3)}%`}));
 const abrir=cambios=>reclutamiento(id,{...o,...cambios,mensaje:''});
 const acciones={button_footer_return:()=>menuPrincipal('taberna','chara'),pagina_anterior:()=>abrir({pagina:Math.max(0,o.pagina-1)}),pagina_siguiente:()=>abrir({pagina:Math.min(Math.ceil(filas.length/6)-1,o.pagina+1)})};
 if(!o.resultados)for(const r of visibles)acciones['pieza_'+r.id]=()=>avisoPrincipal(nombrePersonaje(r.id),
  `Probabilidad individual: ${r.porcentaje.toFixed(6)}%.\nRareza: ${r.rareza}.\nEl personaje se elige por sorteo dentro de este banner.\nPool: Fanadata. Tasas: reconstrucción S-argo.`);
 const detalle=o.resultados?`Resultados guardados · ${b.nombre}\nLos repetidos se convierten en cristales.\nPuedes consultar tu colección desde la Taberna.`:
  `Pool: Fanadata · tasas/coste: S-argo\nHistórico ${b.inicio} — ${b.fin}\n★4: 4% · ★3: 25% · ★2: 71%\n${o.count} ${o.count===1?'sorteo':'sorteos'}: ${b.precios[o.count]} diamantes${q.permitida?'':'\n'+q.motivo}`;
 const controles=o.resultados?[{id:'volver_banner',texto:'Volver al banner'},{id:'animar_sorteo',texto:'Ver animación'}]:[{id:'sorteo_uno',texto:'×1 · 25 MD'},{id:'sorteo_once',texto:'×11 · 250 MD'},{id:'ver_tasas',texto:o.todos?'Destacados':'Todas las tasas'}];
 acciones.sorteo_uno=()=>abrir({count:1});acciones.sorteo_once=()=>abrir({count:11});acciones.ver_tasas=()=>abrir({todos:!o.todos,pagina:0});acciones.volver_banner=()=>abrir({resultados:null,pagina:0});
 if(o.resultados)acciones.animar_sorteo=()=>reproducirResultados(id,o,o.resultados);
 const p=await crearPantallaOperacion({modo:'reclutamiento',resultados:Boolean(o.resultados),todos:o.todos,count:o.count,diamantes:cuenta.user.diamond,titulo:o.resultados?'Resultado · Reclutamiento':b.nombre,saldoTexto:`${cuenta.user.diamond} diamantes · ${cuenta.user.hacking_crystals??0} cristales`,filas,pagina:o.pagina,
  detalle,controles,confirmable:q.permitida&&!o.resultados,confirmarTexto:'Reclutar ×'+o.count,mensaje:o.mensaje});
 if(q.permitida&&!o.resultados)acciones.revisar_operacion=async()=>{
  const confirmTicket=++estado.aperturaPrincipal;
  const anterior={capas:estado.capas,acciones:estado.acciones};
  const consulta=(await estado.api.request('lottery/quote',{banner_id:id,count:o.count})).data;
  if(!consulta.permitida)return abrir({mensaje:consulta.motivo});
  const popup=await crearConfirmacionOperacion('Reclutar ×'+o.count,
   `${b.nombre}\nReconstrucción comunitaria\n${o.count} sorteos · ${consulta.coste} diamantes\n★4 4% · ★3 25% · ★2 71%\nRepetidos ★2/3/4: 1/2/50 cristales.\nPool: Fanadata · reglas: S-argo.`);
  if(confirmTicket!==estado.aperturaPrincipal)return;let ocupada=false;
  const cancelar=()=>{if(!ocupada)escena('reclutamiento',anterior.capas,anterior.acciones,{teclado:true});};
  escena('confirmar-reclutamiento',[...anterior.capas,{velo:'rgba(0,0,0,.82)'},{pantalla:popup}],{cancelar_operacion:cancelar,button_footer_return:cancelar,confirmar_operacion:async()=>{
   if(ocupada)return;ocupada=true;popup.buscar('confirmar_operacion').alpha=135;
   try{const r=(await estado.api.request('lottery/draw',{banner_id:id,count:o.count,quote:consulta.quote})).data;
    await reproducirResultados(id,o,r.results);
   }catch(e){await reclutamiento(id,{...o,mensaje:e.message});}
  }},{teclado:true});
 };
 const bg=await fondo(FONDO_MENU);if(ticket!==estado.aperturaPrincipal)return;
 escena('reclutamiento',[bg,{pantalla:p}],acciones,{teclado:true});
}

async function reproducirResultados(id,o,resultados,indice=0){
 const ticket=++estado.aperturaPrincipal;await cargarCuenta();if(ticket!==estado.aperturaPrincipal)return;
 const lista=mensaje=>reclutamiento(id,{...o,pagina:0,resultados,mensaje});
 const resultado=resultados[indice];if(!resultado)return lista('Resultados guardados en tu partida');
 try{
  const preferencia=window.matchMedia?.('(prefers-reduced-motion: reduce)'),reducida=preferencia?.matches??false;
  const [animacion,p]=await Promise.all([cargarAnimacionReclutamiento(resultado,master(),{reducida}),controlesResultado(indice,resultados.length)]);
  if(ticket!==estado.aperturaPrincipal)return;let cambiando=false,inicio=null,tiempo=0;
  const actualizar=t=>{
   if(inicio!==null&&document.visibilityState!=='hidden')tiempo+=Math.max(0,Math.min(t-inicio,.1));inicio=t;animacion.actualizar(tiempo);if(preferencia?.matches)animacion.revelar();
   p.texto('nombre_resultado',animacion.revelada?nombrePersonaje(resultado.character_id):'');
   p.texto('estado_resultado',animacion.revelada?`★${master().personaje(resultado.character_id).rareza} · ${resultado.duplicate?'Repetido · +'+resultado.hacking_crystals+' cristales':'Nuevo personaje'}`:'');
   p.texto('siguiente_resultado_texto',animacion.revelada?indice+1<resultados.length?'Siguiente':'Terminar':'Mostrar resultado');
  };
  const terminar=()=>{if(cambiando)return;cambiando=true;return lista('Resultado guardado en tu partida');};
  escena('animacion-reclutamiento',[{velo:'#000'},{animacion},{pantalla:p}],{
   button_footer_return:terminar,lista_resultados:terminar,siguiente_resultado:()=>{
    if(cambiando)return;if(!animacion.revelada){animacion.revelar();actualizar(inicio??0);return;}
    cambiando=true;return indice+1<resultados.length?reproducirResultados(id,o,resultados,indice+1):lista('Resultado guardado en tu partida');
   },
  },{teclado:true,cada:actualizar});
  estado.foco='siguiente_resultado';
 }catch(e){if(ticket===estado.aperturaPrincipal)return lista('Animación no disponible; tu sorteo ya está guardado');}
}

async function mundo() {
  estado.aperturaPrincipal++;
  await cargarDatos();
  const p = await Pantalla.cargar('ui/quest/quest_world_select.csb');
  const [bg, vuelta] = await Promise.all([fondo(FONDO_MUNDO(estado.mundo)), pie()]);
  const pintar = () => { for (let i = 1; i <= 3; i++) p.mostrar(`button_difficulty_${i}`, i === estado.dificultad); };
  pintar();
  p.mostrar('icon_new_event', false);
  // Mundos 1–3 = world.json 1001–1003; candado si no hay misiones exportadas de ese mundo.
  const mundos = (estado.datos.mundos ?? []).map((w) => w.id);
  const conMisiones = (id) => estado.indice.some((m) => infoMision(m.id)?.mundo === id);
  mundos.forEach((id, i) => {
    p.mostrar(`image_world_lock_${i + 1}`, !conMisiones(id));
    if (estado.datos.mundos[i]?.corto) p.texto(`text_world_${i + 1}`, estado.datos.mundos[i].corto);
  });
  const cambiar = () => { estado.dificultad = (estado.dificultad % 3) + 1; pintar(); };
  const elegir = (i) => () => {
    const id = mundos[i];
    if (!id || !conMisiones(id)) return;
    estado.mundo = id;
    capitulos();
  };
  escena('mundo', [bg, { pantalla: p }, { pantalla: vuelta }], {
    button_difficulty_1: cambiar, button_difficulty_2: cambiar, button_difficulty_3: cambiar,
    button_world_1: elegir(0), button_world_2: elegir(1), button_world_3: elegir(2),
    button_footer_return: () => home(),
  });
}

async function capitulos() {
  await Promise.all([cargarDatos(), cargarCuenta()]);
  const caps = Object.entries(estado.datos.capitulos ?? {}).map(([id, c]) => ({ id: Number(id), ...c }))
    .filter((c) => c.mundo === estado.mundo).sort((a, b) => a.numero - b.numero);
  if (!caps.length) return mundo();
  const [p, widget, bg, vuelta] = await Promise.all([Pantalla.cargar('ui/quest/quest_chapter_select.csb'),
    Pantalla.cargar('ui/quest/quest_chapter_select_widget_s.csb'), fondo(FONDO_MUNDO(estado.mundo)), pie()]);
  p.mostrar('image_background', false); // el fondo del mundo va como capa
  let i = Math.max(0, caps.findIndex((c) => c.id === estado.capitulo));
  if (!caps[i] || !misionesJugables(caps[i].id).length) i = Math.max(0, caps.findIndex((c) => misionesJugables(c.id).length));
  const moldeFicha = widget.buscar('list_base');
  const centro = p.buscar('item_5');
  const pintar = async () => {
    // Carrusel (PROVISIONAL: orden deducido de las posiciones): item_5 en el centro; item_6..10 los
    // siguientes (arriba a la derecha), item_4..0 los anteriores.
    for (let k = 0; k <= 10; k++) {
      const n = p.buscar(`item_${k}`);
      const c = caps[i + k - 5];
      n.visible = Boolean(c) && k !== 5;
      n.tactil = Boolean(c);
      n._capitulo = c;
      if (c) ponerImagen(n, IMAGEN_CAPITULO(c.id));
    }
    // El del centro, con la ficha del capítulo (número, título, completadas/total).
    const c = caps[i];
    const f = clonar(moldeFicha);
    Object.assign(f, { nombre: 'capitulo_centro', x: centro.x, y: centro.y, _capitulo: c });
    widget.mostrar('node_campaign', false, f);
    widget.mostrar('image_mission', false, f);
    ponerImagen(widget.buscar('image_thumbnail', f), IMAGEN_CAPITULO(c.id));
    widget.texto('label_headline', c.etiqueta ?? `#${c.numero}`, f);
    widget.texto('label_name', c.titulo ?? '', f);
    const todas = Object.entries(estado.datos.misiones).filter(([, q]) => q.capitulo === c.id);
    const hechas = todas.filter(([id]) => progresoDe(id, estado.dificultad)?.clear_count).length;
    widget.texto('text_clear_num', hechas, f);
    widget.texto('text_total_num', `/${todas.length}`, f);
    const contenido = estadoCapitulo(misionesJugables(c.id), estado.dificultad, estado.disponibles, estado.indicePorId);
    widget.mostrar('image_unlock', !contenido.disponible, f);
    if (!contenido.disponible) widget.texto('text_unlock_condition', contenido.motivo, f);
    const lista = p.buscar('list_base');
    lista.hijos = [...lista.hijos.filter((h) => h.nombre !== 'capitulo_centro'), f];
    estado.capitulo = c.id;
    await p.precargar(lista);
  };
  await pintar();
  const mover = (d) => () => { if (caps[i + d]) { i += d; pintar(); } };
  const tocarItem = (n) => {
    const k = caps.indexOf(n._capitulo);
    if (k >= 0 && k !== i) { i = k; pintar(); }
  };
  const acciones = {
    button_arrow_up: mover(1), button_arrow_down: mover(-1),
    capitulo_centro: (n) => { if (misionesJugables(n._capitulo.id).length) lista(n._capitulo.id); },
    button_footer_return: () => mundo(),
  };
  for (let k = 0; k <= 10; k++) acciones[`item_${k}`] = tocarItem;
  escena('capitulos', [bg, { pantalla: p }, { pantalla: vuelta }], acciones);
}

// Oculta lo que el widget de misión trae para otros modos (incursión, gremio, eventos, desbloqueo…).
const OCULTOS_MISION = ['image_intruder', 'image_gold_storage', 'image_storage_base', 'image_current_base',
  'image_raid_accesskey', 'image_accesskey', 'image_bonus_time', 'image_multi_recommend', 'bonus_mission_status',
  'node_quest_group', 'image_unlock', 'image_coming_soon', 'image_campaign', 'node_boss_lv', 'text_quest_title_raid',
  'text_chapter', 'panel_trophies', 'image_rank', 'dummy_job_icon', 'text_non_level'];

async function lista(capitulo = estado.capitulo) {
  await Promise.all([cargarDatos(), cargarCuenta()]);
  estado.capitulo = capitulo;
  const [bg, p, widget, vuelta] = await Promise.all([
    fondo(FONDO_MENU), Pantalla.cargar('ui/quest/quest_list_select_s.csb'),
    Pantalla.cargar('ui/quest/quest_select_button_s.csb'), pie({ menu: true }),
  ]);
  const dif = String(estado.dificultad);
  const plantilla = widget.buscar('quest_select_button');
  const items = misionesJugables(capitulo).map((m) => {
    const it = clonar(plantilla);
    for (const n of OCULTOS_MISION) widget.mostrar(n, false, it);
    const prog = progresoDe(m.id, dif);
    const acceso = consultaMision(m);
    widget.mostrar('image_complete', Boolean(prog?.clear_count), it);
    widget.mostrar('image_new', acceso.iniciar && !prog?.clear_count, it);
    widget.texto('text_quest_number', m.etiqueta ?? '', it);
    widget.texto('text_quest_title', m.nombre ?? '', it);
    widget.texto('text_level', m.dificultades[dif].nivelRecomendado ?? '--', it);
    widget.mostrar('text_level', !acceso.historia, it);
    widget.mostrar('text_enemy', !acceso.historia, it);
    widget.mostrar('text_non_level', acceso.historia, it);
    if (acceso.historia) widget.texto('text_non_level', 'Historia', it);
    widget.mostrar('image_unlock', !acceso.iniciar, it);
    if (!acceso.iniciar) {
      widget.mostrar('basic_quest_info', false, it);
      widget.mostrar('image_unlock_condition', false, it);
      widget.mostrar('text_unlock_condition', false, it);
      const lineas = acceso.motivo.match(/.{1,43}(?:\s|$)|\S+/g) ?? [acceso.motivo];
      widget.texto('text_release_conditions', `${acceso.soportada ? 'Bloqueada' : 'Contenido pendiente'}\n${lineas.map(s=>s.trim()).join('\n')}`, it);
      const t = widget.buscar('text_release_conditions', it); if (t) t.tamFuente = 24;
    }
    it._mision = m;
    return it;
  });
  const lv = p.buscar('quest_select');
  apilar(lv, items, [plantilla.ancho, plantilla.alto], 14);
  if (!items.length) p.texto('text_quest_detail', `Sin misiones exportadas en la dificultad ${dif}`);
  await p.precargar(lv);
  const capas = [bg, { pantalla: p }, { pantalla: vuelta }];
  escena('lista', capas, {
    quest_select_button: (n) => consultaMision(n._mision).iniciar ? preparacion(n._mision) : detalle(n._mision, capas),
    button_footer_return: () => (capitulo == null ? mundo() : capitulos()),
    ...accionesHome(),
  }, { largas: { quest_select_button: (n) => detalle(n._mision, capas) } });
}

// Detalle de una misión (pulsación larga en la lista): jefe, drops y recompensas por completar.
async function detalle(m, debajo) {
  const dif = String(estado.dificultad);
  const [p, molde, datos] = await Promise.all([Pantalla.cargar('ui/quest/quest_quest_detail_s.csb'),
    Pantalla.cargar('ui/result/result_list_reward.csb'),
    fetch(rutaWeb(`/data/misiones/${m.id}.json`)).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  // Jefe de la dificultad elegida (stage f14 = 2, D43).
  let jefe = null;
  for (const sc of datos?.escenarios ?? []) {
    for (const e of sc.enemigos ?? []) if (e.jefe && String(e.dificultad ?? 1) === dif) jefe ??= e;
  }
  const ficha = jefe ? datos.enemigos?.[jefe.maestro] : null;
  p.texto('text_boss_name', ficha?.nombre ?? '—');
  p.texto('text_boss_level_number', jefe?.nivel ?? '??');
  const icono = p.buscar('image_boss_attribute_icon');
  if (ficha && ELEMENTOS[ficha.elemento]) ponerImagen(icono, `images/icon/attribute/icon_attribute_${ELEMENTOS[ficha.elemento]}.png`);
  else if (icono) icono.visible = false;
  // Miniatura de la misión (quest.f9) en lugar del retrato del jefe (PROVISIONAL).
  const foto = p.buscar('dummy_area_boss');
  const info = infoMision(m.id);
  if (foto && info?.miniatura) {
    ponerImagen(foto, `images/background/thumbnail/${info.miniatura}.jpg`);
    Object.assign(foto, { ancho: 600, alto: 240, cubrir: true });
  } else if (foto) foto.visible = false;
  for (const n of ['button_arrow_1', 'button_arrow_2', 'image_swipe_1']) p.mostrar(n, false);
  // Pestaña 1: drops de la dificultad (api_master, D45); pestaña 2: recompensas al completar.
  const mm = master()?.mision(m.id);
  const textos = new Set();
  for (const d of mm?.drops?.[dif] ?? []) {
    for (const grupo of master()?.drop(d) ?? []) {
      for (const e of grupo) for (const r of master()?.recompensa(e.recompensa) ?? []) textos.add(r.texto ?? `${r.tipo}:${r.id}`);
    }
  }
  const r = mm?.dificultades?.[dif] ?? {};
  const acceso = consultaMision(m);
  const lineas = [acceso.iniciar ? acceso.historia ? 'Historia disponible' : 'Misión disponible' : acceso.motivo,
    info?.condicion ? `Condición: ${info.condicion}` : null, `Col +${r.col ?? 0}`, `EXP de jugador +${r.expJugador ?? 0}`,
    `EXP de personaje +${r.expPersonaje ?? 0}`, ...(info?.descripcion ? info.descripcion.split('\n') : [])].filter(Boolean);
  const fila = (t, i) => {
    const it = clonar(molde.raiz);
    molde.texto('text_list_reward', t, it);
    const plato = molde.buscar('image_plate_bg', it);
    if (plato) { plato.ancho = 640; plato.scale9 = { insets: null }; }
    Object.assign(it, { anclaX: 0, anclaY: 0, ancho: 700, alto: 44, nombre: `fila_${i}` });
    for (const h of it.hijos) { h.x += 350; h.y += 22; }
    return it;
  };
  const drops = p.buscar('drop_item_list_view');
  const premios = p.buscar('quest_clear_item_list_view');
  apilar(drops, [...textos].map(fila), [700, 44], 6);
  apilar(premios, lineas.map(fila), [700, 44], 6);
  let tab = 1;
  const pestaña = (t) => {
    tab = t;
    p.mostrar('node_drop_item', tab === 1);
    p.mostrar('node_quest_clear_item', tab === 2);
    p.mostrar('image_tab_selected_background_1', tab === 1);
    p.mostrar('image_tab_selected_background_2', tab === 2);
  };
  pestaña(acceso.iniciar ? 1 : 2);
  await p.precargar();
  // La ventana (750×1260) se dibuja centrada en el alto del diseño.
  const centrar = (b) => [b[0], b[1], b[2], b[3], b[4], b[5] + b[3] * ((DISENO.alto - p.alto) / 2)];
  const cerrar = () => escena('lista', debajo, prev.acciones, { largas: prev.largas });
  const prev = { acciones: estado.acciones, largas: estado.largas };
  escena('detalle', [...debajo, { velo: 'rgba(0,0,0,.6)' }, { pantalla: p, base: centrar }], {
    tab_button_1: () => pestaña(1), tab_button_2: () => pestaña(2),
    button_next: cerrar, button_next_cerrar: cerrar,
  });
}

async function preparacion(m) {
  await Promise.all([cargarDatos(), cargarCuenta()]);
  if (!consultaMision(m).iniciar) return lista();
  const [bg, p, vuelta] = await Promise.all([fondo(FONDO_MENU), Pantalla.cargar('ui/quest/quest_party_confirmation_s.csb'), pie()]);
  const dif = String(estado.dificultad);
  const info = infoMision(m.id);
  p.texto('text_quest_title', m.nombre ?? '');
  p.texto('text_quest_short_name', `[${m.etiqueta ?? m.id}]`);
  p.texto('text_level', m.dificultades?.[dif]?.nivelRecomendado ?? '--');
  p.texto('text_mission', info?.condicion ?? '');
  p.mostrar('text_mission', Boolean(info?.condicion));
  p.mostrar('text_mission_title', Boolean(info?.condicion));
  for (const n of ['text_non_level', 'image_accesskey_needed_base',
    'text_bonusmission_title', 'image_rank_1', 'image_rank_2', 'image_rank_3', 'line_3',
    'button_arrow_assist_1', 'button_arrow_assist_2', 'background_bace_party', 'background_boost', 'image_campaign',
    'node_button_condition', 'dummy_1']) p.mostrar(n, false);
  const placa = p.buscar('image_difficulty_ultimate_2');
  if (placa?.imagen) placa.imagen = { ...placa.imagen, path: `ui/quest/quest_supporter/image_quest_level_${dif}.png` };
  if (placa) await p.precargar(placa);

  // Equipo: un personaje de la cuenta (PROVISIONAL: el juego web lleva uno; las flechas lo cambian).
  const hueco = p.buscar('dummy');
  const pintar = async () => {
    const c = personajeActual();
    hueco.hijos = c ? [
      nodoImagen('party_thumbnail', MINIATURA(c.character_id), hueco.ancho / 2, hueco.alto / 2 + 30, 256, 256),
      nodoTexto('party_name', nombrePersonaje(c.character_id), hueco.ancho / 2, 40, 30),
      nodoTexto('party_level', `Lv ${c.level}`, hueco.ancho / 2 + 110, hueco.alto / 2 - 70, 34, { r: 255, g: 210, b: 90 }),
    ] : [nodoTexto('party_name', 'Sin personajes en la cuenta', hueco.ancho / 2, hueco.alto / 2, 30)];
    await p.precargar(hueco);
  };
  await pintar();
  const n = Math.max(1, personajes().length);
  const mover = (d) => () => { estado.personaje = (estado.personaje + d + n) % n; pintar(); };
  if (consultaMision(m).historia) {
    p.texto('text_departures', 'Leer');
    p.texto('text_enemy', 'Historia'); p.texto('text_level', '');
  }
  escena('preparacion', [bg, { pantalla: p }, { pantalla: vuelta }], {
    button_arrow_1: mover(-1), button_arrow_2: mover(1),
    button_main_0: () => equipo(m),
    button_main: async () => {
      await cargarCuenta();
      if (consultaMision(m).iniciar) jugar(m.id, idsGrupo());
      else await lista();
    },
    button_footer_return: () => lista(),
  });
}

// Equipo (party_select_s): 3 huecos con party_select_character_widget_s; el 1.º es el personaje elegido y el 2.º
// y el 3.º los del Switch (tocar un hueco abre la lista para ese puesto).
async function equipo(m,volver=estado.volverEquipo) {
  const ticket=++estado.aperturaPrincipal;estado.volverEquipo=m?null:volver;
  const [p, widget, vuelta, estrellas] = await Promise.all([Pantalla.cargar('ui/party/party_select_s.csb'),
    Pantalla.cargar('ui/party/party_select_character_widget_s.csb'), pie(), Pantalla.cargar('ui/common/common_rarity_widget_s.csb')]);
  for (const nombre of ['button_auto_edit', 'button_character_list_1', 'button_character_item_1', 'button_character_item',
    'button_return_quest_board', 'button_party_edit_quest_board', 'text_party_number', 'image_plate_title_effect',
    'text_title_effect', 'text_effect', 'Image_3', 'button_switch']) p.mostrar(nombre, false);
  const panel = p.buscar('dummy_character_select');
  panel.ancho = 720; // PROVISIONAL: los 3 huecos (240 de ancho) uno al lado del otro
  const miembros = [0, 1, 2].map(miembroEn);
  const fichasEquipo = await Promise.all(miembros.map((c) => (c ? fichaPersonaje(c.character_id) : null)));
  const huecos = await Promise.all([0, 1, 2].map(async (k) => {
    const w = clonar(widget.raiz);
    w.nombre = `hueco_${k}`;
    w.x = k * 240;
    w.tactil = true;
    const c = miembros[k], ficha = fichasEquipo[k];
    const lleno = c && ficha;
    widget.mostrar('background_not_character', !lleno, w);
    widget.mostrar('background_character', Boolean(lleno), w);
    widget.mostrar('icon_leader', Boolean(lleno) && k === 0, w);
    widget.mostrar('character_widget_1', false, w);
    widget.mostrar('node_sub_status', false, w); // variante de expedición del editor, sin estado local equivalente.
    widget.mostrar('text_cost', false, w);
    widget.mostrar('cost_number', false, w); // no sustituir el coste nativo aún sin identificar por la rareza.
    widget.mostrar('node_assist_character_thumbnail', false, w);
    widget.mostrar('dummy_character', false, w);
    widget.mostrar('image_used_event', false, w);
    widget.mostrar('image_used_event_1', false, w); // no hay expediciones/eventos remotos en el backend local.
    // Variantes duplicadas de armas y las funciones todavía pendientes.
    for (const [nodo] of recorrer(w)) if (/^button_(arms|ability|slot_skill|color)/.test(nodo.nombre)) nodo.visible = false;
    if (lleno) {
      const rareza = widget.buscar('image_rarity', w);
      rareza.hijos = clonar(estrellas.buscar('image_rarity')).hijos;
      for (let i = 1; i <= 6; i++) {
        estrellas.mostrar('image_star_blank_' + i, false, rareza);
        estrellas.mostrar('image_star_' + i, i <= ficha.rareza, rareza);
      }
      const botonArma = widget.buscar('button_arms_edit', w);
      if (botonArma) { botonArma.visible = true; botonArma.nombre = `arma_${k}`; }
      widget.texto('text_arms_edit', 'Equipo', w);
      for (const [nombre, etiqueta, destino] of [['ability', 'Árbol', 'habilidades'], ['slot_skill', 'Ranuras', 'ranuras']]) {
        const b = widget.buscar(`button_${nombre}_edit`, w);
        if (b) { b.visible = true; b.nombre = `${destino}_${k}`; }
        widget.texto(`text_${nombre}_edit`, etiqueta, w);
      }
      const st = sumarStatsEquipo(sumarStatsArbol(characterStats({ personajes: { [c.character_id]: ficha } }, c.character_id, c.level), ficha, c, master().habilidades()),
        equiposDeCuenta(estado.cuenta, c, master()));
      widget.texto('text_character_name', nombrePersonaje(c.character_id).replace(/^\[[^\]]*\]\s*/, ''), w);
      widget.texto('level_number', c.level, w);
      widget.texto('hp_number', st.hp, w);
      widget.texto('mp_number', st.mp, w);
      widget.texto('attack_number', st.atk, w);
      widget.texto('defense_number', st.def, w);
      widget.texto('critical_number', st.crit, w);
      ponerImagen(widget.buscar('dummy_job_icon', w), `images/icon/character/icon_job_${ficha.arma}.png`);
      const fig = widget.buscar('image_party_character', w);
      if (fig) {
        // Algunas fichas importadas tienen el PNG base vacío y el dibujo en _1,
        // igual que el retrato de Ranuras/cut-in resuelto por el exportador.
        const retrato = rutaRetratoEquipo(ficha.retrato ?? c.character_id);
        ponerImagen(fig, await existe(retrato) ? retrato : 'images/character/party/no_image.png');
        // Conservar 252×834, ancla y posición originales del CSB.
        delete fig.cubrir;
      }
    }
    const fondoHueco=widget.buscar(lleno?'background_character':'background_not_character',w);
    fondoHueco.nombre=`hueco_${k}`;fondoHueco.tactil=true;
    return w;
  }));
  panel.hijos = [...panel.hijos.filter((h) => !h.nombre.startsWith('background_character_')), ...huecos];
  panel.panel = { ...(panel.panel ?? {}), recorte: true };
  await p.precargar(panel);
  if(ticket!==estado.aperturaPrincipal)return;
  const n = Math.max(1, personajes().length);
  const mover = (d) => () => { estado.personaje = (estado.personaje + d + n) % n; equipo(m); };
  escena('equipo', [{ pantalla: p }, { pantalla: vuelta }], {
    hueco_0: () => listaPersonajes(m, 0), hueco_1: () => listaPersonajes(m, 1), hueco_2: () => listaPersonajes(m, 2),
    button_left_arrow: mover(-1), button_right_arrow: mover(1),
    button_character_list: () => listaPersonajes(m),
    button_party_edit: () => listaPersonajes(m),
    arma_0: () => listaArmas(m, 0), arma_1: () => listaArmas(m, 1), arma_2: () => listaArmas(m, 2),
    habilidades_0: () => habilidades(m, 0), habilidades_1: () => habilidades(m, 1), habilidades_2: () => habilidades(m, 2),
    ranuras_0: () => habilidades(m, 0, 'ranuras'), ranuras_1: () => habilidades(m, 1, 'ranuras'), ranuras_2: () => habilidades(m, 2, 'ranuras'),
    button_footer_return: () => (m ? preparacion(m) : estado.volverEquipo ? estado.volverEquipo() : home()),
  });
}

const opcionesEquipo = {
  weapon: { nombre: 'Arma', plural: 'Armas', sin: 'Sin arma', stats: ['atk', 'crit'] },
  armor: { nombre: 'Armadura', plural: 'Armaduras', sin: 'Sin armadura', stats: ['hp', 'def'] },
  accessory: { nombre: 'Accesorio', plural: 'Accesorios', sin: 'Sin accesorio', stats: ['hp', 'mp', 'atk', 'def', 'crit'] },
};
const listaArmas = (m, k = 0) => listaEquipo(m, k);

async function habilidades(m, k = 0, modo = 'arbol', seleccionado = null, elegido = null, mensaje = '') {
  const ticket = ++estado.aperturaPrincipal;
  await cargarCuenta();
  const c = miembroEn(k); if (!c) return equipo(m);
  const catalogo = master(), pj = catalogo.personaje(c.character_id);
  const ficha = await fichaPersonaje(c.character_id);
  const stats = sumarStatsEquipo(sumarStatsArbol(characterStats({personajes:{[c.character_id]:ficha}},c.character_id,c.level),ficha,c,catalogo.habilidades()),equiposDeCuenta(estado.cuenta,c,catalogo));
  const [bg, vuelta] = await Promise.all([fondo(FONDO_MENU), pie()]);
  let comprando = false;
  const { pantalla, acciones } = await crearPantallaHabilidades({ personaje: pj, instancia: c,
    catalogo: catalogo.habilidades(), cuenta: estado.cuenta, master: catalogo, modo, seleccionado, elegido, mensaje, stats, retrato:ficha.retrato,
    volver: () => equipo(m), abrir: (modo, n = null, e = null) => habilidades(m, k, modo, n, e),
    comprar: async (modo, n, consulta, e) => {
      if (comprando) return; comprando = true;
      const boton = pantalla.buscar('comprar_habilidad'); if (boton) { boton.alpha = 130; boton.tactil = false; }
      pantalla.texto('motivo_habilidad', 'Guardando mejora…');
      try {
        const params = modo === 'arbol' ? { character_uid: c.uid, local_node_id: n,
          direction: consulta.direccion, choose_master_item_id: consulta.material,use_hacking_crystals:e?.cristales===true }
          : { character_uid: c.uid, slot: n, expected_level: consulta.nivel, choose_master_item_id: e };
        await estado.api.request(modo === 'arbol' ? 'character/ability-board' : 'character/slot-skill', params);
        if (ticket !== estado.aperturaPrincipal) return;
        await habilidades(m, k, modo, n, null, 'Mejora guardada');
      } catch (err) { if (ticket === estado.aperturaPrincipal) await habilidades(m, k, modo, n, e, err.message); }
    },
  });
  if (ticket !== estado.aperturaPrincipal) return;
  escena('habilidades', [bg, { pantalla }, { pantalla: vuelta }], acciones,{teclado:true});
}

// D77: lista y botones originales; asignaciones/acciones son del backend local.
async function listaEquipo(m, k = 0, ranura = null, mensaje = '') {
  const ticket=++estado.aperturaPrincipal;
  await cargarCuenta();
  const c = miembroEn(k); if (!c) return equipo(m);
  const catalogo = master(), pj = catalogo.personaje(c.character_id), ficha = await fichaPersonaje(c.character_id);
  const rutaPieza = f => f?.imagen ? `images/equipment/thumb/256/${f.imagen}_thumb256.png` : null;
  const categorias = Object.fromEntries(Object.keys(opcionesEquipo).map(r => {
    const e = equipoDeCuenta(estado.cuenta, c, catalogo, r);
    return [r, e ? { nivel:e.nivel ?? 0, rareza:e.rareza ?? 0, imagen:rutaPieza(e) } : null];
  }));
  const bg = await fondo(FONDO_MENU);
  if (!ranura) {
    const stats = sumarStatsEquipo(sumarStatsArbol(characterStats({personajes:{[c.character_id]:ficha}},c.character_id,c.level),ficha,c,catalogo.habilidades()),equiposDeCuenta(estado.cuenta,c,catalogo));
    const p = await crearCategoriasEquipo({pjNombre:nombrePersonaje(c.character_id),imagenPersonaje:MINIATURA(c.character_id),nivel:c.level,rareza:pj.rareza,stats,categorias,cantidad:estado.cuenta.equipment.length,mensaje});
    const volver = () => equipo(m);
    if(ticket!==estado.aperturaPrincipal)return;
    escena('categorias-equipo',[bg,{pantalla:p}],{
      button_close:volver,button_ok:volver,button_footer_return:volver,
      ...Object.fromEntries(Object.keys(opcionesEquipo).map(r=>['categoria_'+r,()=>listaEquipo(m,k,r)])),
    },{teclado:true});
    return;
  }
  const p = await Pantalla.cargar('ui/equip/equip_list_s.csb');
  const opcion = opcionesEquipo[ranura], campo = RANURAS_EQUIPO[ranura];
  const armas = estado.cuenta.equipment.filter(e=>equipoCompatible(pj,catalogo.equipo(e.equipment_id),ranura));
  const filas = [{uid:null},...armas];
  const piezas = filas.map(e=>{
    const f = e.uid == null ? null : catalogo.equipo(e.equipment_id);
    const dueno = e.uid == null ? null : estado.cuenta.characters.find(x=>Object.entries(RANURAS_EQUIPO).some(([r,field])=>x[field]===e.uid&&(x.uid!==c.uid||r!==ranura)));
    const st = f ? statsEquipo(f,e.level??1) : null;
    return {uid:e.uid,nombre:f?.nombre??opcion.sin,nivel:e.level??0,rareza:f?.rareza??0,imagen:rutaPieza(f),stats:st??{},actual:(c[campo]??null)===e.uid,dueno:!!dueno};
  });
  await componerListaEquipo(p,{piezas,categoria:ranura,pjNombre:nombrePersonaje(c.character_id),mensaje});
  await p.precargar();
  let guardando = false;
  const acciones = {button_close:()=>listaEquipo(m,k),button_footer_return:()=>listaEquipo(m,k)};
  piezas.forEach((pieza,i)=>{if(pieza.dueno)return;
    acciones['elegir_arma_'+i] = async()=>{
      if(guardando)return;guardando=true;
      try {await estado.api.request('character/equipment',{character_uid:c.uid,slot:ranura,equipment_uid:pieza.uid});if(ticket!==estado.aperturaPrincipal)return;await cargarCuenta();await equipo(m);}
      catch(err){if(ticket===estado.aperturaPrincipal)await listaEquipo(m,k,ranura,err.message);}
    };
  });
  if(ticket!==estado.aperturaPrincipal)return;
  escena('armas',[bg,{pantalla:p}],acciones,{teclado:true});
}

// Personajes de la cuenta (character_list_s): miniaturas; tocar una la pone en el puesto `k` del equipo (en los
// puestos 2 y 3, tocar la que ya está lo deja vacío).
async function listaPersonajes(m, k = 0,{volver=null,seleccionar=true}={}) {
  estado.aperturaPrincipal++;
  const [bg, p] = await Promise.all([fondo(FONDO_MENU), Pantalla.cargar('ui/party/character_list_s.csb')]);
  p.mostrar('button_sort_0', false);
  p.texto('possession_character_number', personajes().length);
  const sv = p.buscar('background_character_list');
  const lado = 170, por = 4;
  const items = personajes().map((c, i) => ({
    ...nodoImagen(`personaje_${i}`, MINIATURA(c.character_id), 0, 0, lado, lado), tactil: seleccionar, _indice: i,
    hijos: [nodoTexto('texto_nivel', `Lv ${c.level}`, lado / 2, 16, 26)],
  }));
  // Rejilla de 4 por fila, de arriba abajo.
  const filas = Math.ceil(items.length / por);
  const alto = Math.max(sv.alto, filas * (lado + 12));
  items.forEach((it, i) => { it.x = 12 + (i % por) * (lado + 10) + lado / 2; it.y = alto - Math.floor(i / por) * (lado + 12) - lado / 2; });
  sv.hijos = items;
  sv.interior = { ancho: sv.ancho, alto, direccion: 1 };
  await p.precargar(sv);
  const acciones = { button_close: volver??(()=>equipo(m)) };
  if(seleccionar)items.forEach((it) => {
    acciones[it.nombre] = () => {
      const i = it._indice;
      if (k === 0) estado.personaje = i;
      else estado.grupo[k - 1] = estado.grupo[k - 1] === i ? null : i;
      // Un personaje va en un solo puesto.
      estado.grupo = estado.grupo.map((g, j) => (g === i && j !== k - 1 ? null : g));
      equipo(m);
    };
  });
  escena('personajes', [bg, { pantalla: p }], acciones,{teclado:!seleccionar});
}

function jugar(mision, ids = []) {
  const q = new URLSearchParams({ mision, dificultad: estado.dificultad, volver: 'interfaz.html' });
  if (ids[0]) q.set('pjid', ids[0]);
  if (ids.length > 1) q.set('grupo', ids.join(',')); // Switch
  estado.saliendo = `juego.html?${q}`;
  location.assign(estado.saliendo);
}

const mmss = (s) => (s == null ? '--:--' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

async function resultado(r) {
  estado.dificultad = Number(r.dificultad) || 1;
  const [bg, p, plantillaPremio] = await Promise.all([fondo(FONDO_MENU), Pantalla.cargar('ui/result/result_clear_background_1_s.csb'),
    Pantalla.cargar('ui/result/result_list_reward.csb')]);
  const gano = Boolean(r.cleared);
  p.mostrar('image_result_font_questclear', gano);
  const derrota = p.buscar('image_result_font_failure');
  derrota.visible = !gano;
  if (derrota.imagen) derrota.imagen = { ...derrota.imagen, path: 'ui/result/score_s/image_youlose.png' }; // PROVISIONAL
  for (const n of ['text_time_left', 'image_rank', 'image_clear_rank', 'text_bonus_mission', 'scores']) p.mostrar(n, false);
  p.mostrar('background_treasure_info', !gano); // mensaje de derrota del propio .csb
  p.mostrar('image_clear_time', gano);
  p.mostrar('text_clear_time_number', gano);
  p.texto('text_clear_time_number', mmss(r.tiempo));
  const premios = r.rewards ?? { col: 0, drops: [] };
  p.texto('text_gold_number', premios.col ?? 0);
  p.texto('text_items_number', (premios.drops ?? []).reduce((a, d) => a + (d.cantidad ?? 1), 0));
  const lv = p.buscar('item_list');
  const molde = plantillaPremio.raiz;
  const items = (premios.drops ?? []).map((d) => {
    const it = clonar(molde);
    plantillaPremio.texto('text_list_reward', `${d.texto ?? `${d.tipo}:${d.id}`}`, it);
    const fondoPremio = plantillaPremio.buscar('image_plate_bg', it);
    if (fondoPremio) { fondoPremio.ancho = 600; fondoPremio.scale9 = { insets: null }; }
    Object.assign(it, { anclaX: 0, anclaY: 0, ancho: 728, alto: 44 });
    for (const h of it.hijos) { h.x += 364; h.y += 22; }
    return it;
  });
  apilar(lv, items, [728, 44], 6);
  p.mostrar('text_no_reward', !items.length);
  await p.precargar(); // también la imagen de derrota cambiada arriba
  escena('resultado', [bg, { pantalla: p }], { button_next: () => resultado2(r) });
  void audio.contexto(gano ? 'victoria' : 'derrota');
}

async function resultado2(r) {
  const [bg, p] = await Promise.all([fondo(FONDO_MENU), Pantalla.cargar('ui/result/result_clear_background_2_s.csb')]);
  const premios = r.rewards ?? {};
  for (const n of ['image_clear_rank', 'text_bonus', 'image_rank_bonus', 'rank_up', 'rank_up_bonus', 'button_close']) p.mostrar(n, false);
  p.mostrar('image_result_font_questclear', Boolean(r.cleared));
  p.texto('text_quest_exp_number', premios.exp_character ?? 0);
  p.texto('text_rank_exp_number', premios.exp_user ?? 0);
  p.texto('text_rank_number', '--'); // PROVISIONAL: sin tabla de rango de jugador (D41)
  p.texto('text_exp_number', r.user?.exp ?? 0);
  p.mostrar('text_exp_after', false);
  // Personajes del equipo en los huecos 1–3.
  const chars = r.characters ?? [];
  for (let i = 1; i <= 3; i++) {
    const hueco = p.buscar(`result_levelup_background_${i}`);
    const c = chars[i - 1];
    hueco.visible = Boolean(c);
    if (!c) continue;
    const subio = c.level_up > 0;
    p.mostrar('levelup', subio, hueco);
    if (subio) {
      p.texto('text_levelup', `Lv UP! ${nombrePersonaje(c.character_id).replace(/^\[[^\]]*\]\s*/, '')}`, hueco);
      p.texto('text_prev_level', c.level - c.level_up, hueco);
      p.texto('text_next_level', c.level, hueco);
    }
    p.texto('text_level_number', c.level, hueco);
    p.texto('text_exp_number', c.exp ?? 0, hueco);
    p.texto('text_exp_number_max', '--', hueco); // PROVISIONAL
    const fig = p.buscar('dummy_character', hueco);
    if (fig) {
      fig.clase = 'ImageView';
      ponerImagen(fig, MINIATURA(c.character_id));
      Object.assign(fig, { ancho: 200, alto: 200, anclaY: 0, y: -130 });
    }
  }
  p.mostrar('button_play_again', true);
  await p.precargar();
  estado.capitulo ??= infoMision(r.mision)?.capitulo ?? null;
  escena('resultado2', [bg, { pantalla: p }], {
    button_next: () => cargarCuenta().then(() => lista(infoMision(r.mision)?.capitulo ?? null)),
    button_play_again: () => jugar(r.mision, r.grupo ? String(r.grupo).split(',') : [r.personaje].filter(Boolean)),
  });
}

// ---------- arranque ----------
async function iniciar() {
  montarAjustes();
  await fuenteTTF(FUENTE);
  requestAnimationFrame(dibujar);
  const r = location.hash === '#resultado' ? tomarResultado() : null;
  history.replaceState(null, '', location.pathname);
  if (r) {
    await Promise.all([cargarCuenta(), cargarDatos()]);
    await resultado(r);
  } else {
    await titulo();
  }
  document.getElementById('carga')?.remove();
}

// Para depurar y para las pruebas: los nodos de una pantalla.
estado.nodos = (nombre) => estado.capas.flatMap((c) => (c.pantalla ? [...recorrer(c.pantalla.raiz)].map(([n]) => n) : []))
  .filter((n) => n.nombre === nombre);

iniciar().catch((e) => {
  console.error(e);
  const c = document.getElementById('carga');
  if (c) c.textContent = `Error: ${e.message}`;
});
