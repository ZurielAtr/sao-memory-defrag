// D98: destinos de MENU según MenuWindowUI (FUN_00a53324). Cada botón cierra la ventana y emite:
//   Avisos        ShowWebViewEvent (tipo 50)            · servidor
//   Objetos       ChangeSceneEvent 31 (almacén, UIFile 160001)          → objetos locales
//   Regalos       ChangeSceneEvent 32                    · servidor
//   Estado        UserProfileEvent::showUserProfilePopup (UIFile 50041)  → perfil local
//   Amigos        FriendEvent::showManageFriendLayer     · servidor
//   Notificaciones ShowNotificationListEvent             · servidor
//   Intercambio   ChangeSceneEvent 20                    · pendiente
//   Misiones      ChangeSceneEvent 33                    · pendiente
//   Gremio        comprobación de gremio                 · servidor
//   Otros         ShowPolicyListEvent                    · web/servidor
// Los destinos sin reconstruir no hacen nada (decisión del usuario, 2026-10-13). Ver docs/menu-estado-d98.md.
import { clonar, apilar } from './pantalla.js';
import { ponerRareza } from './estado_personaje.js';

export const DESTINOS_MENU_LOCALES = Object.freeze({ item: 'objetos', status: 'perfil' });

const imagen = (path) => ({ path, plist: null, tipo: 0 });

/** Objetos que se muestran: cantidad > 0 y presentes en el catálogo, por tipo y después por id. */
export function objetosDeCuenta(cuenta, objetos) {
  return (cuenta?.items ?? []).map((r) => ({ id: Number(r.item_id ?? r.id), cantidad: Number(r.count ?? r.cantidad ?? 0) }))
    .filter((o) => o.cantidad > 0 && objetos?.[o.id])
    .map((o) => ({ ...o, nombre: objetos[o.id].nombre, tipo: objetos[o.id].tipo ?? 0 }))
    .sort((a, b) => a.tipo - b.tipo || a.id - b.id);
}

/**
 * Almacén (item_list_s): filas de template_item_group con tres item_widget en dummy_item_1..3. La primera
 * fila de cada tipo muestra item_type_bar con el nombre de item_type (FUN_008efd58). PROVISIONAL: orden por
 * tipo/id; el icono de categoría (item_type_icon) y el orden alternativo no se reconstruyen.
 */
export function componerObjetos(p, widget, lista, tipos = {}) {
  const lv = p.buscar('ListView'), molde = p.buscar('template_item_group');
  molde.visible = false;
  p.texto('text_possession_item_number', lista.reduce((s, o) => s + o.cantidad, 0));
  p.mostrar('text_none_item', lista.length === 0);
  p.mostrar('button_sort', false);
  const filas = [];
  for (let i = 0, tipo = null; i < lista.length;) {
    const grupo = [], t = lista[i].tipo;
    while (i < lista.length && lista[i].tipo === t && grupo.length < 3) grupo.push(lista[i++]);
    const fila = clonar(molde); fila.visible = true; fila.nombre = `grupo_${filas.length}`;
    fila.anclaX = 0; fila.anclaY = 0;
    p.mostrar('item_type_bar', t !== tipo, fila); tipo = t;
    p.texto('item_type_name', tipos[t] ?? '', fila);
    p.mostrar('item_type_icon', false, fila);
    grupo.forEach((o, k) => {
      const hueco = p.buscar(`dummy_item_${k + 1}`, fila), w = clonar(widget.raiz);
      w.nombre = `objeto_${o.id}`; w.x = hueco.x - 90; w.y = hueco.y - 102;
      widget.buscar('image_item', w).imagen = imagen(`images/item/m/item_m_${o.id}.png`);
      widget.texto('text_number', o.cantidad > 9999 ? '9999+' : o.cantidad, w);
      fila.hijos.push(w);
    });
    for (let k = 1; k <= 3; k++) p.mostrar(`dummy_item_${k}`, false, fila);
    filas.push(fila);
  }
  apilar(lv, filas, [molde.ancho, molde.alto], 4);
  return p;
}

/**
 * Perfil propio (common_status_profile_s). `datos`: { nombre, rango, comentario, lider: {nombre, rareza, retrato},
 * grupo: [{miniatura, nivel, arma, rareza, lider}] }. Los botones para otros jugadores (seguir, gremio,
 * «Me gusta», detalle) no aplican al perfil propio sin servidor.
 */
export function componerPerfil(p, estrellas, datos) {
  p.texto('text_user_name', datos.nombre ?? '');
  p.texto('rank_number', datos.rango ?? 1);
  p.texto('text_title_name', '');
  p.mostrar('image_icon_degree', false); p.mostrar('image_adventure_character_thumbnail', false);
  p.texto('text_comment', datos.comentario ?? '');
  p.texto('score_num', '- pt');
  p.texto('text_none', 'None');
  for (const n of ['button_follow', 'button_unfollower', 'button_like', 'button_guild', 'button_detail', 'button_invite', 'image_deck_background_1'])
    p.mostrar(n, false);
  const carta = p.buscar('character_dummy');
  if (carta) { if (datos.lider) { carta.imagen = imagen(`images/character/character_${datos.lider.retrato}.png`); carta.cubrir = true; } else carta.visible = false; }
  const barra = p.buscar('image_character_background');
  p.texto('text_character_name', String(datos.lider?.nombre ?? '').replace(/^\[[^\]]*\]\s*/, ''), barra);
  ponerRareza(p.buscar('image_rarity', barra), estrellas, datos.lider?.rareza ?? 0);
  p.texto('text_cost', '---/---');
  const deck = p.buscar('image_deck_background');
  for (let k = 1; k <= 3; k++) {
    const m = datos.grupo?.[k - 1], slot = p.buscar(`button_character_slot_${k}`, deck);
    if (!slot) continue;
    slot.nombre = `perfil_slot_${k}`;
    p.mostrar('image_character_frame_selected', false, slot);
    p.mostrar(`image_character_gray_${k}`, false, slot);
    p.mostrar(`text_not_character_${k}`, !m, slot);
    p.mostrar(`icon_leader_${k}`, Boolean(m?.lider), slot);
    p.mostrar(`character_widget_${k}`, Boolean(m), slot);
    const mini = p.buscar(`image_character_select_${k}`, slot);
    if (mini) { mini.visible = Boolean(m); if (m) mini.imagen = imagen(m.miniatura); }
    if (m) {
      const w = p.buscar(`character_widget_${k}`, slot);
      p.texto('level_number', m.nivel, w);
      const icono = p.buscar('dummy_job_icon', w); if (icono) icono.imagen = imagen(`images/icon/character/icon_job_${m.arma}.png`);
      ponerRareza(p.buscar('image_rarity', w), estrellas, m.rareza);
    }
  }
  return p;
}
