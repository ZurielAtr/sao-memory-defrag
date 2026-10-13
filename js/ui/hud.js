import { rutaWeb } from '../rutas.js';
// HUD de batalla con los .csb del juego (D54). Sustituye al HUD provisional de juego.js, que solo lo
// llama (lee player, battle y enemies; no cambia su lógica). Ver NOTAS.md, "Interfaz F2" → "HUD".
//
//   game/game_character_status_s.csb  nombre, HP, MP e icono de arma (image_character_status_1)
//   game/game_skill_L_s.csb            botones de skill 1–3 (nombre, coste, icono) y del personaje
//   game/game_menu_s.csb               cabecera: tiempo (minute/second, .fnt) y botón de menú (pausa)
//   game/game_menuwindow_s.csb         ventana de pausa (button_cancel la cierra)
//   game/game_enemy_hp.csb             barra de HP sobre cada enemigo
//   game/game_combo_number_s.csb       combo (combo_number, .fnt)
//   game/game_enemy_quantity_left.csb  enemigos que quedan (quantity_number, .fnt)
//   game/game_boss_warning.csb         aviso al aparecer un jefe
//   game/game_popup_announce_s.csb     avisos (escenario nuevo, misión completada o fallida)
//   fonts/damage_*_number.fnt          números de daño
//
// El HUD conserva el diseño vertical original (750×1334) dentro del marco centrado del juego.
// PROVISIONAL: qué .csb es cada pieza, 3 botones de skill (la 4.ª ranura del port
// va por teclado), sin nombres sobre los enemigos, el aviso de jefe al verlo por primera vez, los rayos de las
// puertas (no tienen gráfico conocido) y la ventana de pausa sin pestañas.
// Switch: character_button_1–3 son los puestos del grupo (FUN_008f9850): miniatura, HP y MP; a media opacidad
// (0x7f) si no se puede cambiar a él (el activo, caído o en la espera de 0.2 s); image_icon_dead_k si cayó.
// El estado (image_character_status_1) y los botones de skill son los del activo.

import { Pantalla, mul, trasladar, baseCanvas, DISENO } from './pantalla.js';
import { recorrer } from './csb.js';
import { fuenteBitmap } from './recursos.js';

const ELEMENTOS = [null, 'unattributed', 'fire', 'water', 'wind', 'light', 'dark', 'earth'];
const BOTONES_SKILL = 3;
export class HudBatalla {
  /**
   * @param {object} o
   * @param {object[]} o.grupo        los Character del grupo (pj = ficha de web/data/personajes/<id>.json o null)
   * @param {object} o.jugador        el Character activo al empezar (slots, mp…)
   * @param {(p, nombre) => object} o.skill   { name, cost, id, etiqueta, coste } de una ranura de `p`
   * @param {(i) => boolean} [o.puedeCambiar]  Switch: si el puesto `i` (0–2) se puede elegir
   * @param {(x, y) => [number, number]} o.mundoAPantalla  mundo → px CSS (renderer.worldToScreen)
   * @param {(accion) => void} o.accion    pulsa una acción del teclado del juego ('skill1'…)
   * @param {object} [o.mision]            { id, etiqueta, nombre, nivel } para la ventana de pausa
   * @param {() => void} [o.rendirse]      "Give Up": la misión termina como fallida
   */
  static async cargar(o) {
    const rutas = {
      estado: 'ui/game/game_character_status_s.csb', skills: 'ui/game/game_skill_L_s.csb', menu: 'ui/game/game_menu_s.csb',
      pausa: 'ui/game/game_menuwindow_s.csb', enemigo: 'ui/game/game_enemy_hp.csb', combo: 'ui/game/game_combo_number_s.csb',
      quedan: 'ui/game/game_enemy_quantity_left.csb', jefe: 'ui/game/game_boss_warning.csb', aviso: 'ui/game/game_popup_announce_s.csb',
    };
    const [p, datos, ...fnts] = await Promise.all([
      Promise.all(Object.entries(rutas).map(async ([k, r]) => [k, await Pantalla.cargar(r)])).then(Object.fromEntries),
      fetch(rutaWeb('/data/interfaz.json')).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ...['damage_enemy_number', 'damage_critical_number', 'damage_player_number'].map((f) => fuenteBitmap(`fonts/${f}.fnt`)),
    ]);
    const hud = new HudBatalla(p, o, datos, fnts);
    await hud.preparar();
    return hud;
  }

  constructor(p, o, datos, [fntEnemigo, fntCritico, fntJugador]) {
    this.p = p;
    this.o = o;
    this.datos = datos;
    this.fnt = { enemigo: fntEnemigo, critico: fntCritico, jugador: fntJugador };
    this.pausado = false;
    this.jefesVistos = new Set();
    this.avisoJefe = 0; // s que le quedan al aviso de jefe
    this.ultimo = null; // último estado dibujado (para redibujar en pausa)
    this.actual = null; // personaje cuyo estado y skills se muestran
    addEventListener('pointerdown', (ev) => this.tocar(ev));
  }

  // Ajustes que no cambian durante la batalla.
  async preparar() {
    const { estado, skills, menu, enemigo, pausa } = this.p;
    // Estado: el del activo (los 2 y 3 son de otros jugadores en multijugador).
    for (const n of ['image_character_status_2', 'image_character_status_3', 'image_character_status_2_ver2',
      'image_character_status_3_ver2', 'image_character_status_1_teampvp', 'image_character_status_2_teampvp',
      'image_character_status_3_teampvp']) estado.mostrar(n, false);
    for (const [n] of recorrer(skills.raiz)) {
      if (/^(image_icon_dead_|assist_character_thumbnail_|image_active_assist_character_|character_assist_button|image_frame_skill_lock_)/.test(n.nombre)) n.visible = false;
    }
    // Switch: un botón por puesto del grupo con su miniatura e icono de arma; sin personaje, oculto.
    const grupo = this.o.grupo ?? [this.o.jugador];
    for (let k = 1; k <= 3; k++) {
      const m = grupo[k - 1];
      skills.mostrar(`character_button_${k}`, Boolean(m));
      if (!m) continue;
      const mini = skills.buscar(`image_character_${k}`);
      if (mini && m.pj) mini.imagen = { path: `images/unit/thumbnail/256/thumbnail_${m.pj.id}.png`, plist: null, tipo: 0 };
      const arma = m.pj?.arma ? `images/icon/character/icon_job_${m.pj.arma}.png` : null;
      if (arma) for (const n of skills.buscarTodos(`image_character_job_${k}`)) n.imagen = { path: arma, plist: null, tipo: 0 };
    }
    this.ponerJugador(this.o.jugador);
    // Cabecera: sin tesoros ni modo automático (no existen aún).
    for (const n of ['treasure', 'button_auto', 'header_grd']) menu.mostrar(n, false);
    // Barra de enemigo: sin icono de grupo ni barra secundaria.
    enemigo.mostrar('icon_party', false);
    enemigo.mostrar('bar_sub_hp', false);
    // Pausa: pestaña "Battle Info" con la misión; las opciones (cámara, cut-ins…) aún no existen.
    for (const n of ['tab_option', 'tab_option_new', 'tab_option_ver2', 'tab_button_2', 'image_tab_2', 'text_quest_title_trial',
      'button_retire_trial', 'image_item_title_background', 'item_list', 'bonus_mission', 'text_non_level', 'image_difficulty',
      'panel_multi_player_buttons']) pausa.mostrar(n, false);
    const m = this.o.mision ?? {};
    const titulo = pausa.buscar('image_title_background');
    if (titulo) titulo.imagen = null; // no_image.png del editor; quedan sus textos
    pausa.texto('text_quest_title', `${m.etiqueta ?? ''} ${m.nombre ?? ''}`.trim());
    pausa.texto('text_level', m.nivel ?? '--');
    pausa.texto('text_mission', this.datos.misiones?.[m.id]?.condicion ?? '');
    await Promise.all(Object.values(this.p).map((x) => x.precargar()));
  }

  // Estado y botones de skill del personaje activo `j` (al empezar y en cada Switch).
  ponerJugador(j) {
    const { estado, skills } = this.p;
    this.actual = j;
    const pj = j.pj;
    estado.texto('text_name_1', (pj?.nombre ?? j.stats?.nombre ?? '').replace(/^\[[^\]]*\]\s*/, ''));
    const arma = pj?.arma ? `images/icon/character/icon_job_${pj.arma}.png` : null;
    if (arma) for (const n of estado.buscarTodos('image_character_job')) n.imagen = { path: arma, plist: null, tipo: 0 };
    // Skills: botón por ranura con su nombre, coste, icono (active_skill.f8) y color de elemento.
    for (let i = 1; i <= 3; i++) {
      const nombre = j.slots[i - 1];
      const s = nombre ? this.o.skill(j, nombre) : null;
      skills.mostrar(`skill_button_${i}`, Boolean(s));
      skills.mostrar(`image_frame_combination_${i}`, false);
      if (!s) continue;
      skills.texto(`skill_name_${i}`, s.name ?? s.etiqueta ?? nombre);
      skills.texto(`skill_number_${i}`, s.coste ?? s.cost ?? '');
      const icono = this.datos.skills?.[s.id];
      const img = skills.buscar(`Image_skill_${i}`);
      if (img) {
        img._original ??= img.imagen;
        img.imagen = icono ? { path: `images/icon/skill/${icono.replace('{}', '1')}.png`, plist: null, tipo: 0 } : img._original;
      }
      const boton = skills.buscar(`skill_button_${i}`);
      boton._normal ??= boton.boton?.normal; // el del .csb (unattributed)
      const el = ELEMENTOS[s.element ?? 1] ?? 'unattributed';
      if (boton._normal) boton.boton.normal = { ...boton._normal, path: boton._normal.path.replace('unattributed', el) };
    }
    // Las imágenes nuevas se cargan sin esperar (se dibujan en cuanto llegan).
    estado.precargar().catch(() => {});
    skills.precargar().catch(() => {});
  }

  // ---------- disposición ----------
  // El HUD conserva el espacio original, incluso si el lienzo tiene redondeo de píxeles.
  medidas(canvas) {
    const base = baseCanvas(canvas);
    return { k: base[0], ancho: DISENO.ancho, base };
  }

  // Sin redistribución por bordes ni estiramiento de cabeceras.
  dibujarAnclada(ctx, p, { base }) {
    p.dibujar(ctx, base);
  }

  // Un widget (raíz 0×0) en un punto del canvas, con la escala del HUD.
  dibujarEn(ctx, p, x, y, k, escala = 1) {
    p.zonas = [];
    p.dibujarNodo(ctx, p.raiz, [k * escala, 0, 0, -k * escala, x, y], 1);
  }

  // ---------- dibujo ----------
  /**
   * @param {CanvasRenderingContext2D} ctx  del canvas del HUD (juego.js)
   * @param {object} e  { jugador, enemigos, battle, combo, popups, dt, puertas, suelo, escala }
   */
  dibujar(ctx, e) {
    this.ultimo = e;
    const c = ctx.canvas;
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const med = this.medidas(c);
    const { k } = med;
    const { estado, skills, menu, enemigo, combo, quedan, jefe, aviso, pausa } = this.p;
    const j = e.jugador;
    if (j !== this.actual) this.ponerJugador(j); // Switch

    this.puertas(ctx, e, dpr);

    // Barras sobre los enemigos (game_enemy_hp; el jefe, más grande).
    for (const f of e.enemigos) {
      if (f.hidden || !(f.alive || f.state === 'dead')) continue;
      const [sx, sy] = this.o.mundoAPantalla(f.x, f.y + 330 * e.escala);
      enemigo.buscar('bar_hp').porcentaje = (100 * f.hp) / f.maxHp;
      this.dibujarEn(ctx, enemigo, sx * dpr, sy * dpr, k, f.boss ? 1.3 : 0.9);
      if (f.boss && f.alive && !this.jefesVistos.has(f)) { this.jefesVistos.add(f); this.avisoJefe = 2; }
    }

    // Estado del jugador.
    estado.buscar('bar_hp').porcentaje = (100 * j.hp) / j.maxHp;
    estado.texto('text_hp', `${j.hp}/${j.maxHp}`);
    estado.texto('text_mp', `${j.mp ?? 0}/${j.maxMp ?? 0}`); // D64
    const barMp = estado.buscar('bar_mp');
    if (barMp) barMp.porcentaje = j.maxMp ? (100 * j.mp) / j.maxMp : 0;
    this.dibujarAnclada(ctx, estado, med);

    // Botones de skill: pulsado mientras se ejecuta.
    for (let i = 1; i <= BOTONES_SKILL; i++) {
      const b = skills.buscar(`skill_button_${i}`);
      const nombre = j.slots[i - 1];
      if (b && nombre) b._pulsado = j.state === 'skill' && j.anim?.name === nombre;
    }
    // Switch: HP y MP de cada puesto, caídos y a media opacidad los que no se pueden elegir (FUN_008f9850).
    const grupo = e.grupo ?? [j];
    for (let k = 1; k <= 3; k++) {
      const m = grupo[k - 1];
      if (!m) continue;
      const hp = skills.buscar(`charagauge_hp_button_${k}`);
      if (hp) hp.porcentaje = (100 * m.hp) / m.maxHp;
      const mp = skills.buscar(`charagauge_mp_button_${k}`);
      if (mp) mp.porcentaje = m.maxMp ? (100 * m.mp) / m.maxMp : 0;
      skills.mostrar(`image_icon_dead_${k}`, !(m.hp > 0));
      const b = skills.buscar(`character_button_${k}`);
      if (b) b.alpha = this.o.puedeCambiar?.(k - 1) ? 255 : 127;
    }
    this.dibujarAnclada(ctx, skills, med);
    for (const z of skills.zonas) {
      const m = /^skill_button_(\d)$/.exec(z.n.nombre);
      if (!m) continue;
      const i = Number(m[1]) - 1;
      // D64: sin MP para la skill, el botón se apaga (el juego no tiene enfriamiento).
      const coste = this.o.skill(j, j.slots[i])?.coste ?? 0;
      if ((j.mp ?? 0) >= coste) continue;
      ctx.setTransform(...z.m);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, 0, z.w, z.h);
    }

    // Cabecera: tiempo de la misión.
    const t = e.battle?.elapsed ?? 0;
    menu.texto('minute', String(Math.floor(t / 60)).padStart(2, '0'));
    menu.texto('second', String(Math.floor(t % 60)).padStart(2, '0'));
    this.dibujarAnclada(ctx, menu, med);

    // Enemigos que quedan (arriba a la derecha) y combo.
    if (e.battle && !e.battle.repeat) {
      quedan.texto('quantity_number', Math.max(0, e.battle.total - e.battle.defeated));
      this.dibujarEn(ctx, quedan, c.width - 8 * dpr, 250 * k, k); // origen abajo a la derecha del fondo
    }
    if (e.combo.count > 1 && e.combo.timer > 0) {
      combo.texto('combo_number', e.combo.count);
      this.dibujarEn(ctx, combo, c.width - 270 * k, 420 * k, k);
    }

    this.danios(ctx, e, dpr, k);

    // Avisos: escenario nuevo / misión completada o fallida (game_popup_announce_s) y jefe.
    const b = e.battle?.banner;
    if (b && (b.keep || b.t < 2.2)) {
      aviso.texto('text_announce', b.sub ? `${b.text}\n${b.sub}` : b.text);
      aviso.buscar('text_announce').tamFuente = 44;
      const a = b.keep ? 1 : Math.min(1, (2.2 - b.t) * 2, b.t * 4);
      const yAviso = DISENO.alto * 0.62; // el .csb mide 130 de alto: se sube a un tercio de la pantalla
      ctx.globalAlpha = a;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(0, c.height - (yAviso + aviso.alto) * k, c.width, aviso.alto * k);
      aviso.zonas = [];
      aviso.dibujarNodo(ctx, aviso.raiz, mul(med.base, trasladar((med.ancho - DISENO.ancho) / 2, yAviso)), a);
      ctx.globalAlpha = 1;
    }
    if (this.avisoJefe > 0) {
      this.avisoJefe -= e.dt;
      const a = Math.min(1, this.avisoJefe * 2);
      jefe.zonas = [];
      jefe.dibujarNodo(ctx, jefe.raiz, mul(med.base, trasladar((med.ancho - DISENO.ancho) / 2, 0)), a);
    }

    if (this.pausado) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, 0, c.width, c.height);
      pausa.zonas = [];
      const alto = (DISENO.alto - pausa.alto) / 2;
      pausa.dibujarNodo(ctx, pausa.raiz, mul(med.base, trasladar((med.ancho - DISENO.ancho) / 2, alto)), 1);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // como lo deja juego.js
  }

  // Rayos de las puertas (como el HUD de antes; el juego no tiene gráfico conocido para ellas).
  puertas(ctx, e, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    for (const g of e.puertas ?? []) {
      const [bx, by] = this.o.mundoAPantalla(g.x, e.suelo(g.z));
      const [, ty] = this.o.mundoAPantalla(g.x, e.suelo(g.z) + 380);
      const grad = ctx.createLinearGradient(0, ty, 0, by);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, g.open ? 'rgba(90,220,255,.55)' : 'rgba(150,150,160,.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(bx - 28, ty, 56, by - ty);
    }
  }

  // Números de daño con las fuentes del juego (fonts/damage_*_number.fnt).
  danios(ctx, e, dpr, k) {
    for (let i = e.popups.length - 1; i >= 0; i--) {
      const d = e.popups[i];
      d.t += e.dt;
      if (d.t > 0.9) { e.popups.splice(i, 1); continue; }
      const [sx, sy] = this.o.mundoAPantalla(d.x, d.y);
      const a = Math.min(1, (0.9 - d.t) * 3);
      const f = /^\d+!?$/.test(d.text) ? (d.color === '#ff6b6b' ? this.fnt.jugador : d.color === '#ffd25a' ? this.fnt.critico : this.fnt.enemigo) : null;
      const y = (sy - d.t * 60) * dpr;
      if (f) {
        bitmap(ctx, f, d.text.replace('!', ''), sx * dpr, y, k * 1.1, a);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = a;
        ctx.font = `900 ${Math.round(40 * k)}px "SAOFont-Regular_v1", sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.strokeText(d.text, sx * dpr, y);
        ctx.fillStyle = d.color;
        ctx.fillText(d.text, sx * dpr, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- toques ----------
  tocar(ev) {
    const c = document.getElementById('hud');
    if (!c || !this.ultimo) return;
    const r = c.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
    const x = (ev.clientX - r.left) * c.width / r.width, y = (ev.clientY - r.top) * c.height / r.height;
    if (this.pausado) {
      const b = this.p.pausa.nodoEn(x, y, (n) => /^button_(cancel|retire_1|restart)$/.test(n.nombre));
      if (b?.nombre === 'button_cancel') this.reanudar();
      else if (b?.nombre === 'button_retire_1') { this.reanudar(); this.o.rendirse?.(); } // misión fallida
      else if (b?.nombre === 'button_restart') location.reload();
      return;
    }
    const n = this.p.skills.nodoEn(x, y, (z) => /^(skill|character)_button_\d$/.test(z.nombre)) ?? this.p.menu.nodoEn(x, y, (z) => z.nombre === 'menu_button');
    if (!n) return;
    if (n.nombre === 'menu_button') this.pausar();
    else if (n.nombre.startsWith('character_')) this.o.accion(`cambio${n.nombre.slice(-1)}`); // Switch
    else this.o.accion(`skill${n.nombre.slice(-1)}`);
  }

  pausar() {
    this.pausado = true;
    const c = document.getElementById('hud');
    const bucle = () => {
      if (!this.pausado) return;
      this.dibujar(c.getContext('2d'), { ...this.ultimo, dt: 0 });
      requestAnimationFrame(bucle);
    };
    requestAnimationFrame(bucle);
  }

  reanudar() {
    this.pausado = false;
  }
}

// Texto con una fuente BMFont centrado en (x, y) del canvas.
function bitmap(ctx, f, texto, x, y, escala, alfa) {
  let ancho = 0;
  for (const ch of texto) ancho += f.chars[ch.codePointAt(0)]?.xadvance ?? 0;
  ctx.setTransform(escala, 0, 0, escala, x - (ancho * escala) / 2, y - (f.alto * escala) / 2);
  ctx.globalAlpha = alfa;
  let pen = 0;
  for (const ch of texto) {
    const g = f.chars[ch.codePointAt(0)];
    if (!g) continue;
    const img = f.imgs[g.page ?? 0];
    if (img && g.width && g.height) ctx.drawImage(img, g.x, g.y, g.width, g.height, pen + g.xoffset, g.yoffset, g.width, g.height);
    pen += g.xadvance;
  }
}
