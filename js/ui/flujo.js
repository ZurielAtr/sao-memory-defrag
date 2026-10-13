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
// menús, el parpadeo de "Link Start", la posición del botón de volver (en el .csb está fuera de
// pantalla: entra con una animación de código), el orden del carrusel de capítulos y que no hay
// transiciones.

import '../importador/comprobar.js'; // D68: sin datos (página pública sin importar) manda a la portada
import { Pantalla, baseCanvas, clonar, apilar, DISENO } from './pantalla.js';
import { recorrer } from './csb.js';
import { imagen, fuenteTTF } from './recursos.js';
import { crearApiLocal } from '../api/index.js';
import { characterStats } from '../combate.js';
import { RANURAS_EQUIPO, equipoCompatible, equipoDeCuenta, equiposDeCuenta, sumarStatsEquipo, statsEquipo } from '../equipo.js';
import { tomarResultado } from './regreso.js';
import { audio } from '../audio/index.js';
import { montarAjustes } from '../audio/ajustes.js';

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
  datos: null, // web/data/interfaz.json
  indice: [], // web/data/misiones/index.json
  errores: 0,
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
  estado.quests = (await estado.api.request('user/quest')).data.quests ?? [];
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

function escena(nombre, capas, acciones = {}, { alTocarFondo = null, cada = null, largas = {} } = {}) {
  Object.assign(estado, { pantalla: nombre, capas, acciones, alTocarFondo, cada, largas });
  audio.escena(nombre);
  if (!nombre.startsWith('resultado')) void audio.contexto(nombre === 'titulo' ? 'titulo' : nombre === 'home' ? 'home' : ['equipo', 'armas', 'personajes', 'preparacion'].includes(nombre) ? 'equipo' : 'misiones');
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
      } else if (c.velo) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = c.velo;
        ctx.fillRect(0, 0, w, h);
      } else {
        c.pantalla.dibujar(ctx, c.base ? c.base(b) : b);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
  return [(ev.clientX - r.left) * devicePixelRatio, (ev.clientY - r.top) * devicePixelRatio];
};
canvas.addEventListener('pointerdown', (ev) => {
  const [x, y] = punto(ev);
  const n = nodoBajo(x, y, (z) => z.nombre in estado.acciones || z.nombre in estado.largas);
  const lista = nodoBajo(x, y, (z) => z.interior);
  toque = { n, lista, x, y, d0: lista?._desplaz ?? 0, arrastre: false, t0: performance.now(), largo: false };
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
  const [, y] = punto(ev);
  const dy = y - toque.y;
  if (Math.abs(dy) > 12 * devicePixelRatio) toque.arrastre = true;
  if (toque.arrastre) {
    const k = baseCanvas(canvas)[0];
    toque.lista._desplaz = Math.max(0, Math.min(toque.lista._max ?? 0, toque.d0 + dy / k));
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
  lista._desplaz = Math.max(0, Math.min(lista._max ?? 0, (lista._desplaz ?? 0) + ev.deltaY));
}, { passive: false });
addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') (estado.acciones.button_next_cerrar ?? estado.acciones.button_footer_return)?.();
});

// Pie común (PROVISIONAL: en el .csb el botón de volver está en x = 0 con ancla 1, fuera de pantalla;
// aquí se pone a la vista). `menu`: con la barra y los botones de home.
async function pie({ menu = false, volver = true } = {}) {
  const p = await Pantalla.cargar('ui/common/common_footer_menu_s.csb');
  // footer_grd: degradado teñido de negro que tapa los botones (¿fundido al abrir el menú?).
  for (const n of ['button_footer_talk', 'button_town_history', 'button_footer_menu', 'image_new_lottery_icon', 'image_new_event_icon', 'footer_grd']) {
    p.mostrar(n, false);
  }
  if (!menu) for (const n of ['footermenu_left', 'buttons']) p.mostrar(n, false);
  p.mostrar('button_footer_return', volver);
  p.buscar('button_footer_return').x = 173;
  return p;
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
  const c = personajeActual();
  const ficha = c ? await fichaPersonaje(c.character_id) : null;
  const [bg, barra, p] = await Promise.all([fondo(FONDO_HOME), Pantalla.cargar('ui/common/common_home_user_status_s.csb'), pie({ menu: true, volver: false })]);
  const u = estado.cuenta?.user ?? {};
  barra.texto('text_user_name', u.name ?? '');
  barra.texto('text_diamond', u.diamond ?? 0);
  barra.texto('rank_number', '1'); // PROVISIONAL: sin tabla de rango de jugador (D41)
  const gauge = barra.buscar('rank_gauge');
  if (gauge) gauge.porcentaje = 0;
  // Líder del equipo en el centro (PROVISIONAL: en el juego es un personaje animado en la ciudad).
  if (ficha) barra.raiz.hijos.unshift(ilustracion('home_leader', ficha.retrato, 375, 1180, 1000));
  await barra.precargar();
  escena('home', [bg, { pantalla: barra }, { pantalla: p }], {
    button_home_quest: () => mundo(),
    button_home_party: () => equipo(null),
  });
}

async function mundo() {
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
  // El botón de volver va arriba a la izquierda: abajo taparía los botones de mundo.
  const volver = vuelta.buscar('button_footer_return');
  volver.y = 1000;
  escena('mundo', [bg, { pantalla: p }, { pantalla: vuelta }], {
    button_difficulty_1: cambiar, button_difficulty_2: cambiar, button_difficulty_3: cambiar,
    button_world_1: elegir(0), button_world_2: elegir(1), button_world_3: elegir(2),
    button_footer_return: () => home(),
  });
}

async function capitulos() {
  await cargarDatos();
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
    const jugable = misionesJugables(c.id).length > 0;
    widget.mostrar('image_unlock', !jugable, f); // sin misiones exportadas: bloqueado (PROVISIONAL)
    if (!jugable) widget.texto('text_unlock_condition', 'Sin misiones exportadas', f);
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
  await cargarDatos();
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
    widget.mostrar('image_complete', Boolean(prog?.clear_count), it);
    widget.mostrar('image_new', !prog?.clear_count, it);
    widget.texto('text_quest_number', m.etiqueta ?? '', it);
    widget.texto('text_quest_title', m.nombre ?? '', it);
    widget.texto('text_level', m.dificultades[dif].nivelRecomendado ?? '--', it);
    it._mision = m;
    return it;
  });
  const lv = p.buscar('quest_select');
  apilar(lv, items, [plantilla.ancho, plantilla.alto], 14);
  if (!items.length) p.texto('text_quest_detail', `Sin misiones exportadas en la dificultad ${dif}`);
  await p.precargar(lv);
  const capas = [bg, { pantalla: p }, { pantalla: vuelta }];
  escena('lista', capas, {
    quest_select_button: (n) => preparacion(n._mision),
    button_footer_return: () => (capitulo == null ? mundo() : capitulos()),
    button_home_quest: () => mundo(),
    button_home_party: () => equipo(null),
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
  const lineas = [info?.condicion ? `Condición: ${info.condicion}` : null, `Col +${r.col ?? 0}`, `EXP de jugador +${r.expJugador ?? 0}`,
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
  pestaña(1);
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
  await cargarDatos();
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
  escena('preparacion', [bg, { pantalla: p }, { pantalla: vuelta }], {
    button_arrow_1: mover(-1), button_arrow_2: mover(1),
    button_main_0: () => equipo(m),
    button_main: () => jugar(m.id, idsGrupo()),
    button_footer_return: () => lista(),
  });
}

// Equipo (party_select_s): 3 huecos con party_select_character_widget_s; el 1.º es el personaje elegido y el 2.º
// y el 3.º los del Switch (tocar un hueco abre la lista para ese puesto).
async function equipo(m) {
  const [p, widget, vuelta] = await Promise.all([Pantalla.cargar('ui/party/party_select_s.csb'),
    Pantalla.cargar('ui/party/party_select_character_widget_s.csb'), pie()]);
  for (const nombre of ['button_auto_edit', 'button_character_list_1', 'button_character_item_1', 'button_character_item',
    'button_return_quest_board', 'button_party_edit_quest_board', 'text_party_number', 'image_plate_title_effect',
    'text_title_effect', 'text_effect', 'Image_3', 'button_switch']) p.mostrar(nombre, false);
  const panel = p.buscar('dummy_character_select');
  panel.ancho = 720; // PROVISIONAL: los 3 huecos (240 de ancho) uno al lado del otro
  const miembros = [0, 1, 2].map(miembroEn);
  const fichasEquipo = await Promise.all(miembros.map((c) => (c ? fichaPersonaje(c.character_id) : null)));
  const huecos = [0, 1, 2].map((k) => {
    const w = clonar(widget.raiz);
    w.nombre = `hueco_${k}`;
    w.x = k * 240;
    w.tactil = true;
    const c = miembros[k], ficha = fichasEquipo[k];
    const lleno = c && ficha;
    widget.mostrar('background_not_character', !lleno, w);
    widget.mostrar('background_character', Boolean(lleno), w);
    widget.mostrar('character_widget_1', false, w);
    widget.mostrar('node_assist_character_thumbnail', false, w);
    widget.mostrar('dummy_character', false, w);
    // Variantes duplicadas de armas y las funciones todavía pendientes.
    for (const [nodo] of recorrer(w)) if (/^button_(arms|ability|slot_skill|color)/.test(nodo.nombre)) nodo.visible = false;
    if (lleno) {
      const botonArma = widget.buscar('button_arms_edit', w);
      if (botonArma) { botonArma.visible = true; botonArma.nombre = `arma_${k}`; }
      widget.texto('text_arms_edit', 'Equipo', w);
      const st = sumarStatsEquipo(characterStats({ personajes: { [c.character_id]: ficha } }, c.character_id, c.level),
        equiposDeCuenta(estado.cuenta, c, master()));
      widget.texto('text_character_name', nombrePersonaje(c.character_id).replace(/^\[[^\]]*\]\s*/, ''), w);
      widget.texto('level_number', c.level, w);
      widget.texto('hp_number', st.hp, w);
      widget.texto('mp_number', st.mp, w);
      widget.texto('attack_number', st.atk, w);
      widget.texto('defense_number', st.def, w);
      widget.texto('critical_number', st.crit, w);
      widget.texto('cost_number', ficha.rareza ?? '', w); // PROVISIONAL: coste sin leer
      ponerImagen(widget.buscar('dummy_job_icon', w), `images/icon/character/icon_job_${ficha.arma}.png`);
      const fig = widget.buscar('image_party_character', w);
      if (fig) { ponerImagen(fig, `images/character/character_${ficha.retrato}.png`); Object.assign(fig, { ancho: 240, alto: 834, cubrir: 'arriba' }); }
    }
    return w;
  });
  panel.hijos = [...panel.hijos.filter((h) => !h.nombre.startsWith('background_character_')), ...huecos];
  panel.panel = { ...(panel.panel ?? {}), recorte: true };
  await p.precargar(panel);
  const n = Math.max(1, personajes().length);
  const mover = (d) => () => { estado.personaje = (estado.personaje + d + n) % n; equipo(m); };
  escena('equipo', [{ pantalla: p }, { pantalla: vuelta }], {
    hueco_0: () => listaPersonajes(m, 0), hueco_1: () => listaPersonajes(m, 1), hueco_2: () => listaPersonajes(m, 2),
    button_left_arrow: mover(-1), button_right_arrow: mover(1),
    button_character_list: () => listaPersonajes(m),
    button_party_edit: () => listaPersonajes(m),
    arma_0: () => listaArmas(m, 0), arma_1: () => listaArmas(m, 1), arma_2: () => listaArmas(m, 2),
    button_footer_return: () => (m ? preparacion(m) : home()),
  });
}

const opcionesEquipo = {
  weapon: { nombre: 'Arma', plural: 'Armas', sin: 'Sin arma', stats: ['atk', 'crit'] },
  armor: { nombre: 'Armadura', plural: 'Armaduras', sin: 'Sin armadura', stats: ['hp', 'def'] },
  accessory: { nombre: 'Accesorio', plural: 'Accesorios', sin: 'Sin accesorio', stats: ['hp', 'mp', 'atk', 'def', 'crit'] },
};
const listaArmas = (m, k = 0) => listaEquipo(m, k, 'weapon');

// D77: lista y botones originales; asignaciones/acciones son del backend local.
async function listaEquipo(m, k = 0, ranura = 'weapon', mensaje = '') {
  await cargarCuenta();
  const c = miembroEn(k); if (!c) return equipo(m);
  const [bg, p] = await Promise.all([fondo(FONDO_MENU), Pantalla.cargar('ui/equip/equip_list_s.csb')]);
  for (const n of ['image_body_material', 'image_header_material', 'image_footer_material', 'layout_contents_material',
    'image_note', 'button_sort', 'background_title']) p.mostrar(n, false);
  const opcion = opcionesEquipo[ranura], campo = RANURAS_EQUIPO[ranura];
  p.texto('text_possession_equipment', opcion.plural);
  const catalogo = master(), pj = catalogo.personaje(c.character_id);
  const armas = estado.cuenta.equipment.filter((e) => equipoCompatible(pj, catalogo.equipo(e.equipment_id), ranura));
  p.texto('possession_equipment_number', armas.length);
  p.raiz.hijos.push(nodoTexto('titulo_armas', `Equipo · ${nombrePersonaje(c.character_id).replace(/^\[[^\]]*\]\s*/, '')}`, 375, 1320, 30));
  const equipada = equipoDeCuenta(estado.cuenta, c, catalogo, ranura);
  const aviso = mensaje || (armas.length ? `Actual: ${equipada?.nombre ?? opcion.sin}` : `No tienes ${opcion.plural.toLowerCase()} compatibles. Obtén equipo en las misiones.`);
  p.raiz.hijos.push(nodoTexto('estado_armas', aviso, 375, 1190, 25,
    mensaje ? { r: 255, g: 180, b: 160 } : { r: 210, g: 225, b: 240 },
    { ancho: 710, alto: 70, tamPropio: true }));
  const sv = p.buscar('equipment_list'), filas = [{ uid: null }, ...armas];
  const alto = Math.max(sv.alto, filas.length * 116);
  const acciones = { button_close: () => equipo(m), button_footer_return: () => equipo(m) };
  Object.entries(opcionesEquipo).forEach(([r, o], i) => {
    const tab = clonar(p.buscar('button_sort'));
    Object.assign(tab, { nombre: `categoria_${r}`, visible: true, tactil: true, x: 130 + 245 * i, y: 1261,
      ancho: 230, alto: 60, anclaX: .5, anclaY: .5, escalaX: 1, escalaY: 1, zOrder: 10 });
    tab.hijos = [nodoTexto(`texto_${r}`, o.nombre, 115, 30, 26,
      r === ranura ? {r:110,g:230,b:255} : {r:245,g:245,b:250})];
    p.raiz.hijos.push(tab); acciones[tab.nombre] = () => listaEquipo(m, k, r);
  });
  let guardando = false;
  sv.hijos = filas.map((e, i) => {
    const f = e.uid == null ? null : catalogo.equipo(e.equipment_id);
    const dueño = e.uid == null ? null : estado.cuenta.characters.find((x) => Object.entries(RANURAS_EQUIPO)
      .some(([r, campo]) => x[campo] === e.uid && (x.uid !== c.uid || r !== ranura)));
    const actual = (c[campo] ?? null) === e.uid;
    const nombre = e.uid == null ? opcion.sin : f.nombre;
    const st = f ? statsEquipo(f, e.level ?? 1) : null;
    const stats = st ? opcion.stats.filter((s) => st[s]).map((s) => `${s.toUpperCase()} ${st[s]}`).join(' · ') : '';
    const detalle = e.uid == null ? 'Retirar esta pieza del equipo' : `Lv ${e.level ?? 1} · R${f.rareza} · ${stats || 'Sin estadísticas'}${actual ? ' · Equipado' : dueño ? ' · En uso' : ''}`;
    const n = { ...base, clase: 'Panel', nombre: `elegir_arma_${i}`, x: 10, y: alto - (i + 1) * 116,
      ancho: 700, alto: 108, anclaX: 0, anclaY: 0, tactil: !dueño,
      panel: { tipoColor: 1, color: actual ? { r: 35, g: 78, b: 98 } : { r: 25, g: 32, b: 45 }, opacidad: 235 },
      hijos: [nodoTexto('nombre_arma', nombre, 18, 73, 27, { r: 245, g: 245, b: 250 },
        { ancho: 664, alto: 38, tamPropio: true, anclaX: 0, alineH: 0 }),
      nodoTexto('detalle_arma', detalle, 18, 30, 22, { r: 160, g: 195, b: 210 },
        { ancho: 664, alto: 30, tamPropio: true, anclaX: 0, alineH: 0 })] };
    if (!dueño) acciones[n.nombre] = async () => {
      if (guardando) return; guardando = true;
      try {
        await estado.api.request('character/equipment', { character_uid: c.uid, slot: ranura, equipment_uid: e.uid });
        await cargarCuenta(); await equipo(m);
      } catch (err) { await listaEquipo(m, k, ranura, err.message); }
    };
    return n;
  });
  sv.interior = { ancho: sv.ancho, alto, direccion: 1 };
  await p.precargar();
  escena('armas', [bg, { pantalla: p }], acciones);
}

// Personajes de la cuenta (character_list_s): miniaturas; tocar una la pone en el puesto `k` del equipo (en los
// puestos 2 y 3, tocar la que ya está lo deja vacío).
async function listaPersonajes(m, k = 0) {
  const [bg, p] = await Promise.all([fondo(FONDO_MENU), Pantalla.cargar('ui/party/character_list_s.csb')]);
  p.mostrar('button_sort_0', false);
  p.texto('possession_character_number', personajes().length);
  const sv = p.buscar('background_character_list');
  const lado = 170, por = 4;
  const items = personajes().map((c, i) => ({
    ...nodoImagen(`personaje_${i}`, MINIATURA(c.character_id), 0, 0, lado, lado), tactil: true, _indice: i,
    hijos: [nodoTexto('texto_nivel', `Lv ${c.level}`, lado / 2, 16, 26)],
  }));
  // Rejilla de 4 por fila, de arriba abajo.
  const filas = Math.ceil(items.length / por);
  const alto = Math.max(sv.alto, filas * (lado + 12));
  items.forEach((it, i) => { it.x = 12 + (i % por) * (lado + 10) + lado / 2; it.y = alto - Math.floor(i / por) * (lado + 12) - lado / 2; });
  sv.hijos = items;
  sv.interior = { ancho: sv.ancho, alto, direccion: 1 };
  await p.precargar(sv);
  const acciones = { button_close: () => equipo(m) };
  items.forEach((it) => {
    acciones[it.nombre] = () => {
      const i = it._indice;
      if (k === 0) estado.personaje = i;
      else estado.grupo[k - 1] = estado.grupo[k - 1] === i ? null : i;
      // Un personaje va en un solo puesto.
      estado.grupo = estado.grupo.map((g, j) => (g === i && j !== k - 1 ? null : g));
      equipo(m);
    };
  });
  escena('personajes', [bg, { pantalla: p }], acciones);
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
