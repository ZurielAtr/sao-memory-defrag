// D89: composición con las pantallas, nodos, iconos y popups originales.
import { Pantalla, clonar } from './pantalla.js';
import { recorrer } from './csb.js';
import { consultarRanura, consultarNodo, inventarioMateriales, nodosDelPersonaje, estadoHabilidades, DIRECCIONES_LIMITE } from '../habilidades.js';
import { posicionNodo, limitesTablero } from './composicion_habilidades.js';
import { envolverTexto } from './historia_menus.js';

const FUENTE = 'fonts/SAOFont-Regular_v1.ttf';
const base = { visible: true, alpha: 255, escalaX: 1, escalaY: 1, rotX: 0, rotY: 0,
  zOrder: 0, color: { r: 255, g: 255, b: 255 }, anclaX: 0, anclaY: 0, hijos: [] };
const texto = (nombre, valor, x, y, tam = 24, ancho = 660) => ({ ...base,
  clase: 'Text', nombre, texto: String(valor), x, y, ancho, alto: tam * 2.6, tamPropio: true,
  anclaY: .5, fuente: FUENTE, tamFuente: tam, alineH: 0, alineV: 1, color: { r: 67, g: 67, b: 67 } });
const panel = (nombre, x, y, ancho, alto, hijos = []) => ({ ...base, clase: 'Panel', nombre,
  x, y, ancho, alto, hijos, panel: { tipoColor: 0, opacidad: 0, recorte: true } });
const recurso = path => ({ path, tipo: 0, plist: null });

function ajustarTexto(p, nombre, valor, ancho, tam, desde = p.raiz) {
  const n = p.buscar(nombre, desde); if (n) Object.assign(n, { texto: String(valor), tamPropio: true, ancho, tamFuente: tam });
}

/** FUN_005c79d0: filas alternas, 144 unidades verticales, 288 horizontales. */
export function componerTablero(p, modelo, nodos, consultas, elegido, abrir) {
  const limites = limitesTablero(nodos), zona = panel('lista_habilidades', 0, 160, 750, 768);
  // Encuadre inicial proporcional; selección legible con desplazamiento 2D.
  const escala = elegido == null ? Math.min(1, 750 / limites.ancho, 768 / limites.alto) : .65;
  const ancho = Math.max(750, limites.ancho * escala), alto = Math.max(768, limites.alto * escala);
  zona.interior = { ancho, alto, direccion: 3 };
  const ox = (ancho - limites.ancho * escala) / 2, oy = (alto - limites.alto * escala) / 2;
  const pos = new Map(nodos.map(n => { const [x, y] = posicionNodo(n.local);
    return [n.local, [(x - limites.x) * escala + ox, (y - limites.y) * escala + oy]]; }));
  const acciones = {};
  for (const n of nodos) {
    const a = pos.get(n.padre), b = pos.get(n.local); if (!a) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], linea = panel(`enlace_${n.local}`, a[0], a[1], Math.hypot(dx, dy), 3);
    linea.rotX = -Math.atan2(dy, dx) * 180 / Math.PI; linea.anclaY = .5;
    linea.panel = { recorte: false, tipoColor: 1, opacidad: 255, color: { r: 170, g: 195, b: 190 } };
    zona.hijos.push(linea);
  }
  for (const n of nodos) {
    const q = consultas.get(n.local), [x, y] = pos.get(n.local), estado = q.adquirido ? '30' : q.disponible ? '20' : '10';
    const molde = clonar(modelo.raiz); Object.assign(molde, { x: 72, y: 72 });
    for (const k of ['00', '10', '20', '30']) modelo.mostrar(`circle_${k}`, k === (n.tipo === 0 ? '00' : estado), molde);
    for (const k of ['10', '20', '30']) modelo.mostrar(`btn_${k}`, n.tipo !== 0 && k === estado, molde);
    const sufijo = ({ 1: 'hp', 2: 'mp', 3: 'attack', 4: 'defense', 5: 'critical', 11: 'active_passive', 12: 'active_passive' })[n.tipo];
    if (sufijo) {
      const circulo = modelo.buscar(`circle_${estado}`, molde), prefijo = estado === '30' ? 'freed' : estado === '20' ? 'release' : 'not_open';
      circulo.imagen = { ...circulo.imagen, path: `ui/ability_board_s/button_ability_board_${prefijo}_${sufijo}.png` };
    }
    modelo.mostrar('image_icon', false, molde); modelo.mostrar('icon_question', false, molde);
    modelo.mostrar('icon_lock', n.tipo !== 0 && !q.adquirido && !q.disponible, molde);
    modelo.texto('text_17', n.nivel, molde);
    for (const k of ['10', '20', '30']) ajustarTexto(modelo, `text_btn_${k}`,
      `${n.etiqueta ?? n.nombre}${Number.isFinite(n.valor) ? `+${n.valor}` : ''}`, 115, 21, molde);
    const b = panel(`nodo_${n.local}`, x - 72 * escala, y - 72 * escala, 144, 144, [molde]);
    Object.assign(b, { escalaX: escala, escalaY: escala, tactil: n.tipo !== 0 }); b.panel.recorte = false;
    zona.hijos.push(b); if (n.tipo !== 0) acciones[b.nombre] = () => abrir('arbol', n.local);
  }
  if (elegido != null && pos.has(elegido)) {
    const [x, y] = pos.get(elegido);
    zona._desplazX = Math.max(0, Math.min(ancho - 750, x - 375));
    zona._desplaz = Math.max(0, Math.min(alto - 768, alto - y - 384));
  }
  p.raiz.hijos.push(zona); return acciones;
}

function iconoRanura(modelo, ficha, nivel, seleccionado, disponible, nombre) {
  const n = clonar(modelo.raiz); n.nombre = nombre;
  modelo.buscar('image_skill', n).imagen = recurso(`images/slot_skill/icon/${ficha?.icono || 'slot_skill_icon_job_1'}.png`);
  modelo.mostrar('image_bg_select', seleccionado, n); modelo.mostrar('image_bg_next', false, n);
  modelo.mostrar('image_black', !nivel, n); modelo.mostrar('image_lock', !nivel && !disponible, n);
  modelo.texto('text_lv_num', nivel, n); return n;
}

export function componerRanuras(p, modelo, ofertas, pj, c, cat, cuenta, seleccion, abrir) {
  const acciones = {}, indice = Math.max(0, ofertas.findIndex(r => r.ranura === seleccion));
  for (const punto of p.buscar('node_skill_thumbnail')?.hijos ?? []) {
    const k = Number(punto.nombre.match(/\d+$/)?.[0]) - 1, r = ofertas[k];
    punto.visible = Boolean(r) && k < 12; if (!punto.visible) continue;
    const nivel = c.slot_skill?.find(s => s.slot === r.ranura)?.level ?? 0;
    const f = cat.fichas?.[r.id]?.[Math.max(1, nivel)], q = consultarRanura(pj, c, cat, cuenta, r.ranura);
    const n = iconoRanura(modelo, f, nivel, k === indice, q.disponible, `ranura_${r.ranura}`);
    Object.assign(n, { x: -124, y: -124 }); n.hijos[0].tactil = true; n.hijos[0].nombre = n.nombre;
    punto.hijos = [n]; acciones[n.nombre] = () => abrir('ranuras', r.ranura);
  }
  const lista = p.buscar('list_slot_skill'); lista.panel.recorte = true;
  for (let k = 1; k <= 7; k++) {
    const punto = p.buscar(`image_skill_${k}`, lista), r = ofertas[indice + k - 4];
    punto.visible = Boolean(r); if (!r) continue;
    const nivel = c.slot_skill?.find(s => s.slot === r.ranura)?.level ?? 0, f = cat.fichas?.[r.id]?.[Math.max(1, nivel)];
    const icon = iconoRanura(modelo, f, nivel, k === 4, true, `ranura_carrusel_${r.ranura}`);
    delete punto.imagen; punto.hijos = [icon]; punto.tactil = true; punto.nombre = icon.nombre;
    acciones[punto.nombre] = () => abrir('ranuras', r.ranura);
  }
  for (const [nombre, delta] of [['button_arrow_left', -1], ['button_arrow_right', 1]]) {
    const n = p.buscar(nombre), r = ofertas[indice + delta]; n.visible = Boolean(r);
    if (r) acciones[nombre] = () => abrir('ranuras', r.ranura);
  }
  for (const nombre of ['node_assist_skill_thumbnail', 'button_assist', 'button_main']) p.mostrar(nombre, false);
  return acciones;
}

async function detalleMejora(o) {
  const { p, modo, consulta, titulo, detalle, objetivo, elegido, cuenta, master, mensaje, abrir, comprar } = o;
  const acciones = {}, items = inventarioMateriales(cuenta), limite = modo === 'arbol' && consulta.nodo?.tipo === 9;
  const pop = await Pantalla.cargar(modo === 'ranuras' ? 'ui/slot_skill/slot_skill_upgrade.csb' : 'ui/common/common_popup_middle_s.csb');
  if (modo === 'arbol') {
    const bloqueo = panel('bloqueo_habilidades', 0, 0, 750, 1334); bloqueo.tactil = true; bloqueo.zOrder = 50;
    bloqueo.interior = { ancho: 750, alto: 1334, direccion: 0 };
    bloqueo.panel = { recorte: false, tipoColor: 1, opacidad: 170, color: { r: 0, g: 0, b: 0 } };
    p.raiz.hijos.push(bloqueo); acciones.bloqueo_habilidades = () => {};
  }
  let contenido, btn;
  if (modo === 'ranuras') {
    pop.mostrar('panel_black', false); pop.mostrar('node_max_level', !consulta.siguiente); pop.mostrar('node_upgrade', Boolean(consulta.siguiente));
    ajustarTexto(pop, 'text_title', 'Habilidad de ranura', 630, 34);
    ajustarTexto(pop, 'text_name_skill', titulo, 392, 28);
    const informacion=[detalle,mensaje||(!consulta.disponible?consulta.motivo:'')].filter(Boolean).join('\n');
    const lineasInfo = envolverTexto(informacion, undefined, 37);
    const altoInfo = pop.buscar('text_info_skill').alto;
    ajustarTexto(pop, 'text_info_skill', lineasInfo.join('\n'), 442, Math.min(23, altoInfo / (Math.max(1,lineasInfo.length) * 1.2)));
    pop.buscar('text_info_skill').nombre='motivo_habilidad';
    ajustarTexto(pop, 'text_max', mensaje || consulta.motivo, 630, 26); ajustarTexto(pop, 'text_material', 'Materiales', 210, 25);
    const f = consulta.siguiente ?? master.habilidades().fichas?.[consulta.oferta?.id]?.[consulta.nivel];
    for (const nombre of ['image_icon', 'image_icon_max']) pop.buscar(nombre).imagen = recurso(`images/slot_skill/icon/${f?.icono || 'slot_skill_icon_job_1'}.png`);
    contenido = pop.buscar('node_upgrade'); btn = pop.buscar('button_get_skill');
  } else {
    pop.mostrar('image_header_tab', false); Object.assign(pop.raiz, { x: 375, y: 650 });
    ajustarTexto(pop, 'text_title', titulo, 660, 32);
    const release = await Pantalla.cargar('ui/ability_board/ability_board_release_s.csb');
    ajustarTexto(release, 'text_title', titulo, 630, 28);
    ajustarTexto(release, 'text', envolverTexto(detalle, undefined, 48).join('\n'), 680, 24);
    ajustarTexto(release, 'text_confirm', mensaje || consulta.motivo || '¿Desbloquear esta mejora?', 670, 24);
    release.buscar('text_confirm').nombre = 'motivo_habilidad';
    release.raiz.y = 65; contenido = release.buscar('panel'); pop.buscar('layout_contents').hijos = [release.raiz];
    btn = pop.buscar('button_ok'); const cierre = pop.buscar('button_close'); cierre.nombre = 'cerrar_habilidad';
    acciones.cerrar_habilidad = () => abrir(modo);
  }
  const costes = consulta.siguiente?.costes ?? (limite ? consulta.opciones : consulta.costes) ?? [];
  const opciones = limite && consulta.opcionCristales ? [{ cristales: true, cantidad: consulta.opcionCristales.cantidad, saldo: consulta.opcionCristales.saldo }, ...costes] : costes;
  const tarjetasNativas = !limite && opciones.length > 0 && !opciones.some(r=>r.cristales) && opciones.length <= (modo==='ranuras'?5:3);
  if (tarjetasNativas) {
    const modelo = await Pantalla.cargar(`ui/common/common_use_item_widget_${modo==='ranuras'?'small':'medium'}_s.csb`);
    opciones.forEach((r,i)=>{
      const punto=pop.buscar(`${modo==='ranuras'?'node_item_':'item_'}${i+1}`),n=clonar(modelo.raiz);
      if(modo==='ranuras')n.escalaX=n.escalaY=.9;
      for(const nombre of ['image_plus','bg_item_select','board_item_pickup','image_rarity','item_status_col'])modelo.mostrar(nombre,false,n);
      modelo.buscar('image_item',n).imagen=recurso(`images/item/m/item_m_${r.id}.png`);
      modelo.texto('text_need_number',`x ${r.cantidad}`,n);modelo.texto('text_possession_number',items[r.id]??0,n);
      ajustarTexto(modelo,'text_possession_number',items[r.id]??0,80,22,n);
      const b=modelo.buscar('button_background_item',n);b.nombre=`elegir_material_${r.id}`;b.tactil=r.alternativa===1;
      modelo.mostrar('higlight_selected',r.id===(limite?elegido?.material:elegido),n);
      if(r.alternativa===1)acciones[b.nombre]=()=>abrir(modo,objetivo,limite?{...elegido,material:r.id,cristales:false}:r.id);
      punto.hijos=[n];
    });
  }
  const pagos = panel('fuentes_mejora', 25, limite ? 245 : modo === 'ranuras' ? 160 : 120, 680, limite ? 90 : 180);
  const alto = Math.max(pagos.alto, opciones.length * 60); pagos.interior = { ancho: 680, alto, direccion: 1 };
  opciones.forEach((r, i) => {
    const seleccionada = r.cristales ? elegido?.cristales : !elegido?.cristales && r.id === (limite ? elegido?.material : elegido);
    const nombre = r.cristales ? 'elegir_cristales_generales' : `elegir_material_${r.id}`;
    const etiqueta = `${seleccionada ? '✓ ' : ''}${r.cristales ? 'Cristales generales' : master.objeto(r.id)?.nombre ?? `Objeto ${r.id}`} ${r.cristales ? r.saldo : items[r.id] ?? 0}/${r.cantidad}`;
    const fila = panel(nombre, 0, alto - (i + 1) * 60, 675, 58, [texto('material_' + i, etiqueta, 12, 29, 22, 650)]);
    if (r.cristales || r.alternativa === 1) {
      fila.tactil = true;
      acciones[nombre] = () => abrir(modo, objetivo, limite ? { ...elegido, material: r.cristales ? null : r.id, cristales: Boolean(r.cristales) } : r.id);
    }
    pagos.hijos.push(fila);
  });
  if (!opciones.length) pagos.hijos.push(texto('sin_materiales', consulta.disponible ? 'No requiere materiales' : consulta.motivo, 12, 100, 24, 650));
  if (!tarjetasNativas) contenido.hijos.push(pagos);
  if (limite && !consulta.adquirido) for (const [i, d] of DIRECCIONES_LIMITE.entries()) {
    const b = clonar(btn); Object.assign(b, { nombre: `direccion_${d.id}`, x: 80 + 140 * i, y: 160, escalaX: .65, escalaY: .65, visible: true });
    const t = texto(`texto_direccion_${d.id}`, `${elegido?.direccion === d.id ? '✓ ' : ''}${d.nombre}`, b.ancho / 2, -22, 32, 150);
    t.anclaX = .5; t.alineH = 1; b.hijos.push(t);
    if (elegido?.direccion === d.id && b.boton?.pulsado) b.boton.normal = b.boton.pulsado;
    contenido.hijos.push(b); acciones[b.nombre] = () => abrir(modo, objetivo, { ...elegido, direccion: d.id });
  }
  btn.nombre = 'comprar_habilidad'; btn.visible = Boolean(consulta.siguiente || modo === 'arbol');
  btn.tactil = Boolean(consulta.disponible); btn.alpha = consulta.disponible ? 255 : 130;
  for (const n of btn.hijos) if ('texto' in n) n.texto = modo === 'arbol' ? 'Desbloquear' : `Adquirir nivel ${consulta.nivel + 1}`;
  pop.raiz.zOrder = 60; p.raiz.hijos.push(pop.raiz);
  if (consulta.disponible) acciones.comprar_habilidad = () => comprar(modo, objetivo, consulta, elegido);
  if (modo === 'arbol') acciones.button_footer_return = () => abrir(modo);
  return acciones;
}

/** Contexto y transacciones pertenecen a flujo.js; sólo cambia su presentación. */
export async function crearPantallaHabilidades(o) {
  const { personaje: pj, instancia: c, catalogo: cat, cuenta, master, modo = 'arbol', stats = {},
    seleccionado = null, elegido = null, mensaje = '', abrir, comprar, volver, retrato = pj.id } = o;
  const p = await Pantalla.cargar(modo === 'arbol' ? 'ui/ability_board/ability_board_s.csb' : 'ui/slot_skill/slot_skill.csb');
  let acciones = { button_footer_return: volver }, consulta, objetivo, titulo, detalle;
  if (modo === 'arbol') {
    const [modelo, status] = await Promise.all([Pantalla.cargar('ui/ability_board/ability_board_node_s.csb'), Pantalla.cargar('ui/ability_board/ability_board_status_s.csb')]);
    const nodos = nodosDelPersonaje(pj, cat), consultas = new Map(nodos.map(n => [n.local, consultarNodo(pj, c, cat, cuenta, n.local)]));
    Object.assign(acciones, componerTablero(p, modelo, nodos, consultas, seleccionado, abrir));
    p.buscar('status_node').hijos = [status.raiz];
    ajustarTexto(status, 'text_character_name', pj.nombre.replace(/^\[[^\]]*\]\s*/, ''), 600, 27);
    status.buscar('dummy_job_icon').imagen = recurso(`images/icon/character/icon_job_${pj.arma}.png`);
    for (const [nombre, campo] of Object.entries({ hp: 'hp', mp: 'mp', attack: 'atk', defense: 'def', critical: 'crit' })) {
      const fila = status.buscar('status_parameter_' + nombre);
      for (const [n] of recorrer(fila)) if ('texto' in n && /number|before|after/.test(n.nombre)) n.texto = String(stats[campo] ?? '—');
      status.mostrar('image_arrow_status', false, fila);
    }
    status.mostrar('image_swipe', false); status.mostrar('button_release_all', false);
    const habilidades = estadoHabilidades(pj, c, cat);
    for (let i = 1; i <= 3; i++) {
      const a = habilidades.activas[i-1], b = habilidades.pasivas[i-1];
      ajustarTexto(status, `text_active_skill_${i}`, a?.nivel ? cat.activas?.[a.id]?.name ?? `Skill ${a.id}` : 'Sin adquirir', 255, 23);
      ajustarTexto(status, `skill_number_${i}`, a?.nivel ? `Lv ${a.nivel}` : '—', 90, 23);
      ajustarTexto(status, `text_passive_skill_${i}`, b?.estado > 0 ? cat.nombresPasivas?.[b.id] ?? `Pasiva ${b.id}` : 'Sin adquirir', 300, 23);
    }
    status.mostrar('button_sword_skill_detail', false); status.mostrar('button_battle_skill_detail', false);
    status.mostrar('combination_effect_node', false);
    const vistaStatus = status.buscar('page_view');
    // El CSB deja ambas páginas como hermanas: el cliente las añade al PageView.
    // Mantenerlas allí dibuja estadísticas y habilidades una encima de la otra.
    const contenedor = status.buscar('character_info_panel');
    const paginas = ['status_info_node', 'parameter_other_info_node'].map(n => status.buscar(n));
    contenedor.hijos = contenedor.hijos.filter(n => !paginas.includes(n));
    vistaStatus.hijos = paginas; vistaStatus._pagina = 0;
    status.mostrar('image_sao_woman', pj.genero === 2);
    status.mostrar('image_sao_man', pj.genero !== 2);
    acciones.button_switch = () => { const vista = status.buscar('page_view'); vista._pagina = vista._pagina ? 0 : 1; };
    if (seleccionado != null) {
      objetivo = seleccionado; consulta = consultarNodo(pj, c, cat, cuenta, objetivo, elegido ?? {});
      titulo = consulta.nodo?.nombre ?? 'Nodo'; detalle = consulta.nodo?.descripcion ?? '';
      if (consulta.nodo?.tipo === 9) detalle = 'Elige el crecimiento de esta rama y una fuente de pago';
      if (consulta.nodo?.tipo === 10 && consulta.direccion) detalle = `${DIRECCIONES_LIMITE.find(d => d.id === consulta.direccion)?.nombre} +${consulta.valor}`;
    }
  } else {
    const modelo = await Pantalla.cargar('ui/slot_skill/slot_skill_icon.csb'), ofertas = cat.ranuras?.[c.character_id] ?? [];
    objetivo = seleccionado ?? ofertas[0]?.ranura; consulta = consultarRanura(pj, c, cat, cuenta, objetivo, elegido);
    Object.assign(acciones, componerRanuras(p, modelo, ofertas, pj, c, cat, cuenta, objetivo, abrir));
    p.buscar('image_character').imagen = recurso(`images/character/character_${retrato}.png`);
    const f = consulta.siguiente ?? cat.fichas?.[consulta.oferta?.id]?.[consulta.nivel];
    titulo = f?.nombre ?? 'Habilidad de ranura'; detalle = f?.texto ?? consulta.motivo;
    ajustarTexto(p, 'text_name_skill', titulo, 572, 26); ajustarTexto(p, 'text_info_skill', envolverTexto(detalle, undefined, 45).join('\n'), 550, 23);
  }
  if (consulta && (modo === 'ranuras' || seleccionado != null || mensaje)) {
    const nuevas = await detalleMejora({ p, modo, consulta, titulo, detalle, objetivo, elegido, cuenta, master, mensaje, abrir, comprar });
    acciones = modo === 'arbol' ? nuevas : { ...acciones, ...nuevas };
  }
  await p.precargar(); return { pantalla: p, acciones };
}
