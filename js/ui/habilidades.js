// D79: pantallas de habilidades con botones/nodos originales. Colocación y
// navegación del port; las compras y requisitos se comprueban también en backend.
import { Pantalla, clonar } from './pantalla.js';
import { consultarRanura, consultarNodo, inventarioMateriales, nodosDelPersonaje, DIRECCIONES_LIMITE } from '../habilidades.js';

const FUENTE = 'fonts/SAOFont-Regular_v1.ttf';
const base = { visible: true, alpha: 255, escalaX: 1, escalaY: 1, rotX: 0, rotY: 0,
  zOrder: 0, color: { r: 255, g: 255, b: 255 }, anclaX: 0, anclaY: 0, hijos: [] };
const tinta = { r: 235, g: 245, b: 250 }, gris = { r: 175, g: 195, b: 210 }, cyan = { r: 100, g: 230, b: 255 };
const texto = (nombre, valor, x, y, tam = 26, ancho = 660, color = tinta) => ({ ...base,
  clase: 'Text', nombre, texto: String(valor), x, y, ancho, alto: tam * 2.6, tamPropio: true,
  anclaY: .5, fuente: FUENTE, tamFuente: tam, alineH: 0, alineV: 1, color });
const panel = (nombre, x, y, ancho, alto, hijos = []) => ({ ...base, clase: 'Panel', nombre,
  x, y, ancho, alto, hijos, panel: { tipoColor: 1, color: { r: 18, g: 30, b: 46 }, opacidad: 238, recorte: true } });

function boton(modelo, nombre, etiqueta, x, y, ancho = 330, habilitado = true) {
  const b = clonar(modelo);
  Object.assign(b, { nombre, x, y, ancho, alto: 90, anclaX: .5, anclaY: .5,
    escalaX: 1, escalaY: 1, visible: true, tactil: habilitado, alpha: habilitado ? 255 : 125 });
  b.hijos = [texto(`${nombre}_texto`, etiqueta, ancho / 2, 45, 27, ancho - 20)];
  Object.assign(b.hijos[0], { anclaX: .5, alineH: 1 });
  return b;
}

/** Contexto y callbacks pertenecen a flujo.js; no conserva una cuenta desactualizada. */
export async function crearPantallaHabilidades(o) {
  const { personaje: pj, instancia: c, catalogo: cat, cuenta, master, modo = 'arbol',
    seleccionado = null, elegido = null, mensaje = '', abrir, comprar, volver } = o;
  const [p, mejora, modeloNodo] = await Promise.all([
    Pantalla.cargar(modo === 'arbol' ? 'ui/ability_board/ability_board_s.csb' : 'ui/slot_skill/slot_skill.csb'),
    Pantalla.cargar('ui/slot_skill/slot_skill_upgrade.csb'),
    modo === 'arbol' ? Pantalla.cargar('ui/ability_board/ability_board_node_s.csb') : null,
  ]);
  // Las variantes del editor se componen aquí; no se muestran sus textos de ejemplo.
  for (const h of p.raiz.hijos) h.visible = false;
  const btn = mejora.buscar('button_get_skill');
  const acciones = { button_footer_return: volver };
  const añadirBoton = (nombre, etiqueta, x, y, ancho, accion, habilitado = true) => {
    p.raiz.hijos.push(boton(btn, nombre, etiqueta, x, y, ancho, habilitado));
    if (accion && habilitado) acciones[nombre] = accion;
  };
  p.raiz.hijos.push(texto('titulo_habilidades', `Habilidades · ${pj.nombre.replace(/^\[[^\]]*\]\s*/, '')}`, 28, 1290, 30));
  p.raiz.hijos.push(texto('progreso_habilidades', `Lv ${c.level} · Liberación ${c.unlocked_ability_release_level ?? 1} · Límite ${c.unlocked_limit_break_node_count ?? 0}`, 28, 1240, 23, 695, gris));
  añadirBoton('tab_arbol', 'Árbol', 195, 1170, 335, () => abrir('arbol'), modo !== 'arbol');
  añadirBoton('tab_ranuras', 'Ranuras', 555, 1170, 335, () => abrir('ranuras'), modo !== 'ranuras');
  const sv = panel('lista_habilidades', 20, 620, 710, 495);
  let consulta, titulo, detalle, objetivo;
  if (modo === 'ranuras') {
    const ofertas = cat.ranuras?.[c.character_id] ?? [];
    const slot = seleccionado ?? ofertas[0]?.ranura;
    const alto = Math.max(sv.alto, ofertas.length * 110);
    sv.interior = { ancho: sv.ancho, alto, direccion: 1 };
    sv.hijos = ofertas.map((r, i) => {
      const guardada = c.slot_skill?.find((s) => s.slot === r.ranura), nivel = guardada?.level ?? 0;
      const f = cat.fichas?.[r.id]?.[Math.max(1, nivel)];
      const n = panel(`ranura_${r.ranura}`, 8, alto - (i + 1) * 110, 694, 102,
        [texto('nombre_ranura', `${r.ranura}. ${f?.nombre ?? `Habilidad ${r.id}`}`, 16, 69, 25, 662,
          slot === r.ranura ? cyan : tinta), texto('nivel_ranura', `Nivel ${nivel}/${r.maximo}${nivel ? ' · Adquirida' : ' · Sin adquirir'}`, 16, 29, 23, 662, gris)]);
      n.tactil = true; acciones[n.nombre] = () => abrir('ranuras', r.ranura); return n;
    });
    objetivo = slot; consulta = consultarRanura(pj, c, cat, cuenta, slot, elegido);
    const indice = ofertas.findIndex(r=>r.ranura===slot);
    sv._desplaz = Math.max(0, Math.min(alto - sv.alto, (indice + .5) * 110 - sv.alto / 2));
    const f = consulta.siguiente ?? cat.fichas?.[consulta.oferta?.id]?.[consulta.nivel];
    titulo = f?.nombre ?? 'Habilidad de ranura'; detalle = f?.texto ?? consulta.motivo;
  } else {
    const nodos = nodosDelPersonaje(pj, cat), pos = new Map();
    const maxFila = Math.max(0, ...nodos.map((n) => Math.floor(n.local / 11)));
    const alto = Math.max(sv.alto, (maxFila + 1) * 125 + 100), ancho = 1050;
    sv.interior = { ancho, alto, direccion: 3 };
    for (const n of nodos) pos.set(n.local, [70 + ((n.local - 1) % 11) * 90, alto - 75 - Math.floor((n.local - 1) / 11) * 125]);
    for (const n of nodos) {
      const a = pos.get(n.padre), b = pos.get(n.local);
      if (!a) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const linea = panel(`enlace_${n.local}`, a[0], a[1], Math.hypot(dx, dy), 4);
      linea.rotX = -Math.atan2(dy, dx) * 180 / Math.PI; linea.anclaY = .5;
      linea.panel.color = { r: 70, g: 110, b: 145 }; sv.hijos.push(linea);
    }
    for (const n of nodos) {
      const q = consultarNodo(pj, c, cat, cuenta, n.local);
      const [x, y] = pos.get(n.local), b = panel(`nodo_${n.local}`, x - 44, y - 50, 88, 100);
      b.panel.opacidad = 0; b.panel.recorte = false; b.tactil = true;
      const imagen = clonar(modeloNodo.buscar(n.tipo === 0 ? 'circle_00' : q.adquirido ? 'circle_30' : q.disponible ? 'circle_20' : 'circle_10'));
      Object.assign(imagen, { x: 44, y: 55, escalaX: .61, escalaY: .61, anclaX: .5, anclaY: .5 });
      b.hijos = [imagen, texto('tipo_nodo', n.etiqueta ?? String(n.tipo), 44, 56, 25, 85,
        n.local === seleccionado ? cyan : tinta), texto('nivel_nodo', `Lv${n.nivel}`, 44, 9, 22, 85, gris)];
      for (const t of b.hijos.slice(1)) { t.anclaX = .5; t.alineH = 1; }
      acciones[b.nombre] = () => abrir('arbol', n.local); sv.hijos.push(b);
    }
    objetivo = seleccionado ?? nodos.find(n=>n.tipo!==0)?.local;
    consulta = consultarNodo(pj, c, cat, cuenta, objetivo, elegido ?? {});
    titulo = consulta.nodo?.nombre ?? 'Selecciona un nodo'; detalle = consulta.nodo?.descripcion ?? '';
    if (consulta.nodo?.tipo === 9) detalle = 'Elige el crecimiento de esta rama y un material';
    if (consulta.nodo?.tipo === 10 && consulta.direccion) detalle = `${DIRECCIONES_LIMITE.find(d=>d.id===consulta.direccion)?.nombre} +${consulta.valor} · Crecimiento de esta rama`;
    if (consulta.nodo) sv._desplaz = Math.max(0, Math.min(alto - sv.alto, alto - (pos.get(consulta.nodo.local)?.[1] ?? alto) - sv.alto / 2));
    if (consulta.nodo) sv._desplazX = Math.max(0, Math.min(ancho - sv.ancho, (pos.get(consulta.nodo.local)?.[0] ?? 0) - sv.ancho / 2));
  }
  p.raiz.hijos.push(sv);
  const info = panel('detalle_habilidad', 20, 100, 710, 500);
  info.hijos.push(texto('nombre_mejora', titulo, 18, 464, 27), texto('descripcion_mejora', detalle, 18, 406, 23));
  const items = inventarioMateriales(cuenta);
  const limite = modo === 'arbol' && consulta?.nodo?.tipo === 9;
  const costes = consulta?.siguiente?.costes ?? (limite ? consulta?.opciones : consulta?.costes) ?? [];
  let y = 353;
  for (const coste of costes) {
    const alt = coste.alternativa === 1, seleccionadoAlt = alt && coste.id === (limite ? consulta.material ?? elegido?.material : elegido);
    const color = (items[coste.id] ?? 0) >= coste.cantidad ? gris : { r: 255, g: 180, b: 150 };
    const linea = texto(`material_${coste.id}`, `${alt ? seleccionadoAlt ? 'Elegido · ' : 'Elegir · ' : ''}${master.objeto(coste.id)?.nombre ?? `Objeto ${coste.id}`} ${items[coste.id] ?? 0}/${coste.cantidad}`, 18, y, 22, 660, seleccionadoAlt ? cyan : color);
    linea.alto = 28;
    if (alt) {
      const fila = panel(`elegir_material_${coste.id}`, 12, y - 19, 680, 38, [linea]);
      Object.assign(linea, { x: 6, y: 19 }); fila.tactil = true; info.hijos.push(fila);
      acciones[fila.nombre] = () => abrir(modo, objetivo, limite ? { ...elegido, material: coste.id } : coste.id);
    } else info.hijos.push(linea);
    y -= 32;
  }
  if (limite && !consulta.adquirido) {
    for (const [i, d] of DIRECCIONES_LIMITE.entries()) {
      const b = boton(btn, `direccion_${d.id}`, `${elegido?.direccion === d.id ? '✓ ' : ''}${d.nombre}`, 75 + i * 140, 224, 126);
      b.alto = 64; b.hijos[0].y = 32; b.hijos[0].tamFuente = 23; info.hijos.push(b);
      acciones[b.nombre] = () => abrir(modo, objetivo, { ...elegido, direccion: d.id });
    }
  }
  if (!costes.length && consulta?.disponible) info.hijos.push(texto('sin_materiales', 'No requiere materiales', 18, y, 22, 660, gris));
  info.hijos.push(texto('motivo_habilidad', mensaje || consulta?.motivo || 'Puedes adquirir esta mejora', 195, 175, 23, 495,
    mensaje && mensaje !== 'Mejora guardada' ? { r: 255, g: 180, b: 150 } : cyan));
  info.hijos.at(-1).alto = 38;
  const comprarBtn = boton(btn, 'comprar_habilidad', modo === 'arbol' ? 'Desbloquear' : `Adquirir nivel ${(consulta?.nivel ?? 0) + 1}`, 355, 109, 425, Boolean(consulta?.disponible));
  info.hijos.push(comprarBtn);
  if (consulta?.disponible) acciones.comprar_habilidad = () => comprar(modo, objetivo, consulta, elegido);
  p.raiz.hijos.push(info);
  await p.precargar();
  return { pantalla: p, acciones };
}
