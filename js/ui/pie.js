// D88: CSB oficial y FUN_009cffd8/FUN_009d1fb8. Ver docs/regreso-menus-d88.md.
// Al ocultar la barra, Android baja el pie por la altura de footermenu_left (198 en este CSB).
export function configurarPie(p, { menu = false, volver = true } = {}) {
  for (const nombre of ['button_footer_talk', 'button_town_history', 'button_footer_menu',
    'image_new_lottery_icon', 'image_new_event_icon', 'footer_grd']) p.mostrar(nombre, false);
  for (const nombre of ['footermenu_left', 'buttons']) p.mostrar(nombre, menu);
  p.mostrar('button_footer_return', volver);
  // El botón conserva x=0, y=185, escala=1 y flipX del archivo. Su ancla reflejada lo coloca dentro.
  p._origenPieY ??= p.raiz.y;
  p.raiz.y = p._origenPieY - (menu ? 0 : p.buscar('footermenu_left').alto);
  return p;
}
