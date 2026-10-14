// D98: estado del personaje (Party → tocar una ranura llena) y su popup «Character Info».
// FUN_00b77c40: el toque terminado (tipo 2) sobre la ranura emite ShowCharacterProfileEvent; la escena
// (FUN_005b63a8) abre la capa de estado con UIFile 50027 (common_party_character_status_s, FUN_00ba0004).
// Con la variante ver2 se usan las pestañas Status/Ability/Skill Slot/Assist Slot y la barra
// tab_button_bar_new (Sword Skill/Battle Skill/Equip/Profile); cada botón de esa barra (FUN_00ba6f38)
// emite showCharacterDetailEventName con su índice: popup UIFile 600028 con las páginas de 600027.
// Ver docs/menu-estado-d98.md.
import { clonar } from './pantalla.js';
import { recorrer } from './csb.js';
import { envolverTexto } from './historia_menus.js';

export const PESTANAS_ESTADO = Object.freeze([
  { clave: 'status', nodo: 'tab_status', panel: 'character_status_tab_1' },
  { clave: 'ability', nodo: 'tab_ability', panel: 'character_ability_tab_1' },
  { clave: 'skill_slot', nodo: 'tab_ability_skill_slot', panel: 'character_skill_slot_tab' },
  { clave: 'assist_slot', nodo: 'tab_ability_assist_slot', panel: 'character_assist_slot_tab' },
]);
// Orden de tab_button_bar_new y de las pestañas del popup (tab_button_{1..4} → página 1..4).
export const PAGINAS_INFO = Object.freeze([
  { clave: 'sword', tab: 'tab_swordskill', pagina: 'page_1' },
  { clave: 'battle', tab: 'tab_battleskill', pagina: 'page_2' },
  { clave: 'equip', tab: 'tab_equip', pagina: 'page_3' },
  { clave: 'profile', tab: 'tab_profile', pagina: 'page_4' },
]);

const imagen = (path) => ({ path, plist: null, tipo: 0 });
const textoEn = (p, nombre, valor, desde) => { for (const n of p.buscarTodos(nombre, desde)) n.texto = String(valor); };
const nombreSinTitulo = (nombre) => String(nombre ?? '').replace(/^\[[^\]]*\]\s*/, '');
const titulo = (nombre) => String(nombre ?? '').match(/^\[([^\]]*)\]/)?.[1] ?? '';

/** Estrellas de rareza (common_rarity_widget_s) dentro de un nodo image_rarity. */
export function ponerRareza(nodo, estrellas, rareza) {
  if (!nodo || !estrellas) return;
  nodo.hijos = clonar(estrellas.buscar('image_rarity')).hijos;
  for (let i = 1; i <= 6; i++) {
    estrellas.mostrar('image_star_blank_' + i, false, nodo);
    estrellas.mostrar('image_star_' + i, i <= rareza, nodo);
  }
}

/**
 * Compone la capa de estado. `datos`: { nombre, rareza, retrato, arma, nivel, exp: [actual, siguiente],
 * stats, pasivas: [nombres], ranuras: [{icono, nivel}], pestana }.
 */
export function componerEstadoPersonaje(p, estrellas, datos) {
  // Variante ver2 (FUN_00ba0004 con +0x619): ocultar la disposición antigua y las variantes _1.
  for (const n of ['tab_button_bar', 'character_status_new', 'node_slot_skills', 'character_ability', 'general_info_bar_1',
    'button_arms_edit_1', 'button_arms_not_edit_1', 'button_ability_edit_1', 'button_slot_skill_edit_1',
    'button_arms_not_edit', 'node_switch_status', 'button_scroll_left', 'button_scroll_right', 'button_left', 'button_right',
    'button_bgm', 'button_zoom_in_bgm', 'button_zoom_out_bgm', 'change_illustration_node', 'button_voice']) p.mostrar(n, false);
  p.mostrar('character_status_ver2', true);
  const carta = p.buscar('image_character_card');
  if (carta) { carta.imagen = imagen(`images/character/character_${datos.retrato}.png`); carta.cubrir = true; }
  const barra = p.buscar('general_info_bar');
  textoEn(p, 'text_character_name', nombreSinTitulo(datos.nombre), barra);
  ponerRareza(p.buscar('image_rarity', barra), estrellas, datos.rareza);
  // Pestañas: tab_normal visible salvo en la elegida, que muestra tab_select.
  for (const t of PESTANAS_ESTADO) {
    const nodo = p.buscar(t.nodo), activa = t.clave === datos.pestana;
    if (!nodo) continue;
    for (const [n] of recorrer(nodo)) {
      if (n.nombre === 'tab_normal') { n.visible = !activa; n.nombre = `pestana_${t.clave}`; }
      else if (n.nombre === 'tab_select') n.visible = activa;
    }
    p.mostrar(t.panel, activa, p.buscar('character_status_ver2'));
  }
  // Status: nivel, experiencia, arma y estadísticas.
  const st = p.buscar('character_status_tab_1', p.buscar('character_status_ver2'));
  textoEn(p, 'level_number', datos.nivel, st);
  const [exp, sig] = datos.exp ?? [0, 0];
  const barraExp = p.buscar('lv_gage_content', st); if (barraExp) barraExp.porcentaje = sig > 0 ? Math.min(100, 100 * exp / sig) : 100;
  const icono = p.buscar('dummy_job_icon', st); if (icono) icono.imagen = imagen(`images/icon/character/icon_job_${datos.arma}.png`);
  textoEn(p, 'text_job_name', datos.armaNombre ?? '', st);
  for (const [nodo, campo] of [['hp_number', 'hp'], ['mp_number', 'mp'], ['attack_number', 'atk'], ['defense_number', 'def'], ['critical_number', 'crit']])
    textoEn(p, nodo, datos.stats?.[campo] ?? '—', st);
  // El coste nativo no está identificado: no se inventa (igual que en Party, D89).
  p.mostrar('text_cost', false, st);
  // Ability: nombres de las pasivas del personaje (text_ability_1..6).
  const ab = p.buscar('character_ability_tab_1');
  for (let i = 1; i <= 6; i++) textoEn(p, `text_ability_${i}`, datos.pasivas?.[i - 1] ?? '', ab);
  // Skill Slot: iconos de las ranuras adquiridas en node_skill_1..14.
  const rs = p.buscar('character_skill_slot_tab');
  for (let i = 1; i <= 14; i++) {
    const hueco = p.buscar(`node_skill_${i}`, rs), r = datos.ranuras?.[i - 1];
    if (hueco) hueco.hijos = r ? [{ visible: true, alpha: r.nivel ? 255 : 110, clase: 'ImageView', nombre: `ranura_${i}`, x: 0, y: 0, ancho: 64, alto: 64,
      anclaX: .5, anclaY: .5, escalaX: 1, escalaY: 1, rotX: 0, rotY: 0, zOrder: 0, hijos: [], imagen: imagen(`images/slot_skill/icon/${r.icono}.png`) }] : [];
  }
  // Assist Slot: sin asistencias en la partida local (pendiente, D79).
  const asist = p.buscar('character_assist_slot_tab');
  p.mostrar('image_plate_info_assist_slot', false, asist);
  // tab_button_bar_new: Sword Skill / Battle Skill / Equip / Profile.
  const barraInfo = p.buscar('tab_button_bar_new');
  PAGINAS_INFO.forEach((pg, i) => { const b = p.buscar(`tab_button_${i + 1}`, barraInfo); if (b) b.nombre = `info_${pg.clave}`; });
  return p;
}

/**
 * Popup «Character Info» (600028) con la página de 600027. `datos`: { pagina, nombre, retrato, descripcion,
 * mundo, activas: [{nombre, descripcion, coste}], pasivas: [{nombre}], equipo: [{nombre, nivel, imagen}] }.
 */
export function componerInfoPersonaje(popup, paginas, datos, medir = null) {
  const contenido = popup.buscar('layout_contents'), raiz = clonar(paginas.raiz);
  raiz.x = 0; raiz.y = 0; // layout_contents (750×870) contiene el widget 600027 desde su origen
  contenido.hijos = [raiz];
  for (const pg of PAGINAS_INFO) {
    const activa = pg.clave === datos.pagina, tab = popup.buscar(pg.tab);
    for (const [n] of recorrer(tab)) {
      if (n.nombre === 'tab_normal') { n.visible = !activa; n.nombre = `info_${pg.clave}`; }
      else if (n.nombre === 'tab_select') n.visible = activa;
    }
    const pag = paginas.buscar(pg.pagina, raiz); if (pag) pag.visible = activa;
  }
  const lista = (pagina, filas, vacio) => {
    const pag = paginas.buscar(pagina, raiz), lv = paginas.buscar('ListView_1', pag), molde = paginas.buscar('list_base', lv);
    if (!lv || !molde) return;
    lv.hijos = filas.map((f, i) => {
      const b = clonar(molde); b.nombre = `fila_${pagina}_${i}`; b.tactil = false;
      const lineas = envolverTexto(f.descripcion ?? '', medir ?? undefined, medir ? 640 : 52).slice(0, 4);
      b.hijos.push(texto(`titulo_${i}`, f.nombre, 40, b.alto - 45, 30, 650),
        ...lineas.map((l, k) => texto(`desc_${i}_${k}`, l, 40, b.alto - 95 - k * 34, 22, 650)));
      if (f.extra) b.hijos.push(texto(`extra_${i}`, f.extra, b.ancho - 40, b.alto - 45, 24, 300, 2));
      return b;
    });
    lv.interior = { ...(lv.interior ?? {}), alto: Math.max(lv.alto, filas.length * (molde.alto + 10)), direccion: 1 };
    if (vacio != null) paginas.mostrar(vacio, filas.length === 0, pag);
  };
  if (datos.pagina === 'sword') lista('page_1', datos.activas ?? []);
  if (datos.pagina === 'battle') lista('page_2', datos.pasivas ?? [], 'text_empty');
  if (datos.pagina === 'equip') {
    const pag = paginas.buscar('page_3', raiz);
    paginas.mostrar('panel_switch', false, pag);
    lista('page_3', (datos.equipo ?? []).map((e) => ({ nombre: e.nombre, descripcion: e.descripcion ?? '', extra: e.nivel ? `Lv ${e.nivel}` : '' })));
    for (const n of paginas.buscarTodos('background_none', pag)) n.visible = false;
  }
  if (datos.pagina === 'profile') {
    const pag = paginas.buscar('page_4', raiz);
    const carta = paginas.buscar('image_character_card', pag);
    if (carta) { carta.imagen = imagen(`images/character/character_${datos.retrato}.png`); carta.cubrir = true; }
    textoEn(paginas, 'text_world_name', datos.mundo ?? '', pag);
    textoEn(paginas, 'text_character_type', titulo(datos.nombre) || nombreSinTitulo(datos.nombre), pag);
    const desc = paginas.buscar('text_description', pag);
    if (desc) {
      const lineas = envolverTexto(datos.descripcion ?? '', medir ?? undefined, medir ? 660 : 52);
      Object.assign(desc, { texto: lineas.join('\n'), tamPropio: true });
    }
    // Reproducir la historia del personaje necesita las escenas de aventura (pendiente).
    paginas.mostrar('button_play_story', false, pag);
  }
  return popup;
}

const texto = (nombre, valor, x, y, tam, ancho, alineH = 0) => ({ visible: true, alpha: 255, clase: 'Text', nombre, texto: String(valor ?? ''),
  x, y, ancho, alto: tam * 1.6, anclaX: alineH === 2 ? 1 : 0, anclaY: .5, escalaX: 1, escalaY: 1, rotX: 0, rotY: 0, zOrder: 5, hijos: [],
  fuente: 'fonts/SAOFont-Regular_v1.ttf', tamFuente: tam, tamPropio: true, alineH, alineV: 1, color: { r: 67, g: 67, b: 67 } });
