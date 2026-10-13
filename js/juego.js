import { rutaWeb } from './rutas.js';
// Batalla jugable: un personaje controlable contra los enemigos de una misión real (stage.json,
// D43: escenarios unidos por puertas) o, en modo de prueba (?enemigoid= sin ?mision=), contra un
// solo enemigo que reaparece.
// Salen de los datos originales: animaciones, combo, avance de los ataques, sword skills
// (golpes y multiplicadores), estadísticas del personaje y de los enemigos (por nivel), fórmula de
// daño (D42), y de la misión: enemigos, posiciones, niveles, jefe y escenarios. Siguen siendo
// aproximaciones nuestras: velocidades, alcance, tiempos de golpe, IA y enfriamientos; y en la
// misión, lo marcado PROVISIONAL (apertura de puertas, profundidad, posición inicial del jugador).
//
// Parámetros: ?mision=ID (por defecto 1001001, la Quest 1-1; exportar con
// herramientas/exportar_mision.py) · ?dificultad=N (1) · ?pjnivel=N (1) · ?pjid= · ?pj= · ?traje= ·
// ?skills= · ?escenario= (fondo) · modo de prueba: ?enemigoid=ID&nivel=N[&enemigo=unidad].

import './importador/comprobar.js'; // D68: sin datos (página pública sin importar) manda a la portada
import { SSRenderer, imageQuad } from './renderer.js';
import { decodeFrame, PART_TYPE } from './ssbp.js';
import { Character, loadImage } from './character.js';
import { Stage, STAGES } from './stage.js';
import { SkillCutin } from './cutin.js';
import { loadCombatData, characterStats, enemyStats, computeDamage } from './combate.js';
import { Progreso } from './progreso.js';
import { cargarIA } from './ia_datos.js';
import { cargarPersonaje } from './personaje.js';
import { IAEnemigo } from './ia.js';
import { volverAInterfaz } from './ui/regreso.js';
import { HudBatalla } from './ui/hud.js';
import { cargarCajas, anchoCuerpo, PIXELES_POR_UNIDAD } from './cajas.js';
import { Proyectiles, resolverImpactoBala, responderParadaBala, resolverContactosProyectiles } from './proyectiles.js';
import { actualizarDefensa, resolverGolpe, recuperarMedidor } from './defensa.js';
import { pausaDeGolpe, pausar, enPausa, descontarPausa, PAUSA_PARADA } from './impacto.js';
import { moverConVelocidad, orientar, GIRO_RAIZ } from './movimiento.js';
import { Pasivas, cargarPasivas, TIPO } from './pasivas.js';
import { sumarStatsEquipo, pasivasConEquipo } from './equipo.js';
import { aplicarBuff, esBuff, terminoBuff, buffsDe, pasarBuffs, TIPOS_PERSONAJE, TIPOS_ENEMIGO, STAT } from './buffs.js';
import { iniciarMp, costeSkill, puedePagar, pagarSkill, ganarMpPorGolpe } from './mp.js';
import { recibirGolpe, avanzarEstados, activar, activo, factorVelocidad, sinCuracion, parametro, estadosDe, ESTADO } from './estados.js';
import { puedeCambiar, skillDeEntrada, llegada, ESPERA_CAMBIO, DISTANCIA_ENTRADA } from './switch.js';
import { Historia, historiasDeMision } from './ui/historia.js';
import { audio } from './audio/index.js';
import { bonosCargaRifle, animacionAtaqueRifle } from './carga_rifle.js';
import { MiraProyectiles } from './mira_proyectiles.js';
import { montarAjustes } from './audio/ajustes.js';

const params = new URLSearchParams(location.search);
// Personaje jugable (D46): ?pjid=ID (por defecto Kirito 34001) trae su unidad, traje, stats, normales y
// skills equipadas de web/data/personajes/<id>.json. ?pj= / ?traje= siguen forzando unidad o traje (del primero).
// Switch: ?grupo=ID,ID,ID lleva hasta 3 personajes (empieza el primero; sin él, solo ?pjid=).
const GRUPO_IDS = params.get('grupo')
  ? [...new Set(params.get('grupo').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 3)
  : [params.get('pjid') ?? '34001'];
const PLAYER_ID = GRUPO_IDS[0];
// Skills por defecto: las que equipa el personaje (character.f35); sin datos, Vorpal Strike, Double
// Circular, Starburst Stream y Starbust Reborn. ?skills=31201,33104,... las cambia (las del primero).
const SKILLS_SIN_DATOS = ['skill_11201', 'skill_31201', 'skill_33101', 'skill_35124'];
const ENEMY_UNIT = params.get('enemigo') ?? 'enemy_103_ruin_kobold_sentinel';
// Registros de master data: [Black Swordsman] Kirito (4★) y Ruin Kobold Sentinel. El nivel del
// enemigo es el de la misión (stage.f9[].f13); 5 por defecto para que Kirito nivel 1 pueda con él.
const ENEMY_ID = params.get('enemigoid') ?? '1030001';
const ENEMY_LEVEL = Number(params.get('nivel') ?? 5);
const PLAYER_LEVEL = Number(params.get('pjnivel') ?? 1);
const STAGE_ID = params.get('escenario');
const DEFAULT_STAGE = '2006';
// Misión real (D43). Sin ?mision= pero con ?enemigoid= / ?enemigo= se usa el modo de prueba.
const TEST_MODE = !params.has('mision') && (params.has('enemigoid') || params.has('enemigo'));
const MISSION_ID = params.get('mision') ?? '1001001';
const DIFFICULTY = Number(params.get('dificultad') ?? 1);
// PROVISIONAL (no está en stage.json ni se buscó en el binario): x inicial del jugador en el campo.
// Los enemigos con f8 = 2 suelen estar en x < 700 (detrás del jugador), así que empieza más adelante.
const PLAYER_START_X = 600;
// Profundidad (D58). El juego coloca a cada enemigo en Vec3(f2, f3, -f4) (FUN_0082ce90): aquí z = f4
// (más lejos = z mayor = más arriba y detrás). Caminar mueve en x y z ((dir.x, 0, −dir.y)·248, FUN_0084f384)
// y los golpes miran la profundidad (defensa.js). El campo va de z = 0 a background.f3 (fondo.profundidad).
// PROVISIONAL: el dibujo (cada unidad de z sube DEPTH_Y) y que el jugador empiece en la mitad de la
// profundidad (no se leyó dónde lo coloca el juego). PLAYER_Z es solo la referencia del dibujo.
const PLAYER_Z = 120;
const DEPTH_Y = 0.35;
const PROF_APROX = 50; // sin eventos de golpe: attack.f8 más común (PROVISIONAL)
// D58: guardia firme (define 6001/6002, FUN_00847450) y aturdimiento de la rotura de guardia (3 s según
// el manual del juego, how_to_play.json "Guard Breaks"; motion 0x1b = `stun`, sin leer cómo lo dispara).
const GUARDIA_FIRME = 0.8;
const ATURDIMIENTO = 3;
// PROVISIONAL: los enemigos no se acercan hasta que el jugador está a esta distancia o los golpea.
const AGGRO_RANGE = 800;

const VIEW_H = 750; // alto visible del mundo (las capas del fondo están hechas para ~750)
const CAM_Y = VIEW_H / 2;
const GROUND = 70;
// Escala de los personajes (D52): el juego mide y dibuja el arte a 1/1.82 unidades del mundo
// (DAT_0083cac0, FUN_0083c9cc). Antes era 0.8 (a ojo); los valores PROVISIONALES que se eligieron a
// ojo para ese tamaño (velocidades, salto, alcances aproximados, separación) se multiplican por
// A_ESCALA para que se vean igual respecto del personaje.
const CHAR_SCALE = 1 / PIXELES_POR_UNIDAD;
const A_ESCALA = CHAR_SCALE / 0.8;
// Velocidades reales (D56, FUN_0084f384): caminar 248 y correr 495 (DAT_008512f0 / DAT_0085019c) × la
// velocidad del personaje (stat 5 = character.f11 / 100: p.velBase); salto = character_job.f6 (1062:
// p.saltoVel); paso y paso atrás = character.f13 (+0x734: p.pasoVel); gravedad 2772 para todas las unidades
// (+0xe4, FUN_0083c72c). Los datos de cada personaje van en él (cargarMiembro).
const WALK_SPEED = 248;
const DASH_SPEED = 495;
// D60: dos espadas (arma 2): +define 3008 (500) cada define 3007 (10) golpes de combo, hasta define 3009 (2500).
const COMBO_VEL = { cada: 10, suma: 500, tope: 2500 };
const GRAVITY = 2772;
const HEAD_SPLITTER_VY = -1320; // D63: motion 12 (jump_attack) → velocidad (0, −1320, 0) (FUN_0084f384)
const GRAVEDAD_ENEMIGO = GRAVITY;
// PROVISIONAL (D53): mientras se sostiene la guardia, la animación se queda en este cuadro (el siguiente
// evento 15 de Kirito pone el modo 1 = sin guardia; no se sabe cómo la sostiene el juego).
const CUADRO_GUARDIA = 12;
const ENEMY_REACH = 200 * A_ESCALA;
const SKILL_REACH = 700 * A_ESCALA;
const SKILL_SLOTS = 4;

const canvas = document.getElementById('juego');
const hud = document.getElementById('hud');
const ctx = hud.getContext('2d');
const renderer = new SSRenderer(canvas);

// ---------- Entrada ----------
const held = new Set();
const pressed = new Set();
const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'], // D58: el arrastre del juego mueve también en profundidad
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyI'], // deslizar hacia arriba (how_to_play.json); con la guardia, parada
  attack: ['KeyZ', 'KeyJ'],
  dodge: ['KeyX', 'KeyK'],
  guard: ['KeyC', 'KeyL'],
  run: ['ShiftLeft', 'ShiftRight'],
  skill1: ['Digit1', 'Numpad1'],
  skill2: ['Digit2', 'Numpad2'],
  skill3: ['Digit3', 'Numpad3'],
  skill4: ['Digit4', 'Numpad4'],
  // Switch: cambiar al personaje 1, 2 o 3 del grupo (en el juego, tocar su icono).
  cambio1: ['KeyQ'],
  cambio2: ['KeyE'],
  cambio3: ['KeyR'],
};
const isHeld = (k) => KEYS[k].some((c) => held.has(c));
const wasPressed = (k) => KEYS[k].some((c) => pressed.has(c));
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); toggleSkillMenu(); return; }
  if (e.target instanceof HTMLSelectElement) return;
  if (Object.values(KEYS).flat().includes(e.code)) e.preventDefault();
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

// ---------- Utilidades ----------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  for (const c of [canvas, hud]) {
    c.width = Math.round(innerWidth * dpr);
    c.height = Math.round(innerHeight * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

const popups = [];
let cutin = null;
let shake = 0;
let combo = { count: 0, timer: 0 };

function popup(x, y, text, color) {
  popups.push({ x, y, text, color, t: 0 });
}

// Cuadros clave de un ataque: cuándo golpea y desde cuándo se puede encadenar el siguiente.
// El encadenado se hace en el último cuadro en que el avance del root coincide con el inicio
// del siguiente ataque (así attack_1 -> attack_2 no salta).
function attackTiming(ch, name, next) {
  // Algunas unidades no tienen la animación (p. ej. enemy_210 sin attack_1, misión 4132023): sin datos.
  const rm = ch.rootMotionOf(name) ?? [];
  const n = rm.length;
  let cancel = -1;
  let runStart = -1;
  if (next && ch.has(next)) {
    const target = ch.rootMotionOf(next)[0];
    for (let f = 1; f < n; f++) {
      if (Math.abs(rm[f] - target) < 6) {
        if (runStart < 0) runStart = f;
        cancel = f;
      } else if (runStart >= 0) break;
    }
  }
  const hit = runStart > 0 ? Math.min(runStart + 1, n - 1) : Math.round(n * 0.4);
  return { hit, cancel: cancel > 0 ? cancel : Math.round(n * 0.65) };
}

// ---------- Jugador ----------
function makePlayer(ch, skills = SKILLS_SIN_DATOS) {
  ch.y = GROUND;
  ch.alt = 0; // altura sobre el suelo (D58: el suelo depende de z)
  ch.vx = ch.vz = 0; // velocidad de la motion y del evento 10 (movimiento.js)
  ch.x = 0;
  ch.hp = ch.maxHp = ch.stats.hp;
  ch.state = 'idle';
  ch.vy = 0;
  ch.combo = 0;
  ch.queued = false;
  ch.hitDone = false;
  ch.timer = 0;
  ch.timing = {
    attack_1: attackTiming(ch, 'attack_1', 'attack_2'),
    attack_2: attackTiming(ch, 'attack_2', 'attack_3'),
    attack_3: attackTiming(ch, 'attack_3', null),
    jump_attack: attackTiming(ch, 'jump_attack', null),
  };
  const wanted = skills;
  ch.slots = wanted.filter((s) => ch.skills.includes(s));
  for (const s of ch.skills) if (ch.slots.length < SKILL_SLOTS && !ch.slots.includes(s)) ch.slots.push(s);
  ch.slots.length = Math.min(ch.slots.length, SKILL_SLOTS);
  ch.hitFrameCache = {};
  ch.play('wait', { loop: true });
  return ch;
}

// Datos reales de las skills (herramientas/exportar_skills.py): nombre, golpes y multiplicadores de la
// master data, en p.skillData (cargarMiembro, si existen para la unidad del personaje).
let IA_DATA = null; // web/data/ia/<patrón>.json de la misión (D47, D55)
let hudCsb = null; // D54: HUD con los .csb del juego (ui/hud.js); ?hud=0 = el provisional de abajo
let miraProyectiles = null;
let pasivas = null; // D60: pasivas de todas las unidades de la batalla (pasivas.js)
let TABLA_ESTADOS = null; // D62: web/data/estados.json (abnormal_state)
// D62: virtual 0x454 (FUN_00853bb8): resistencia de cada estado por pasivas (tipos 0x53–0x5a, 0x5b, 0x51,
// 0x52; base 10000) y, si se cubrió, 0 en aturdimiento/reacción/derribo y × (1 − reducción) en el resto.
const PASIVA_DE_ESTADO = { 0: 0x53, 1: 0x54, 2: 0x55, 3: 0x56, 4: 0x57, 5: 0x58, 6: 0x59, 7: 0x5a, 0x11: 0x5b, 0x12: 0x51, 0x13: 0x52 };
function factorEstado(def, factorGuardia = null) {
  return (i) => {
    const t = PASIVA_DE_ESTADO[i];
    let f = t && pasivas ? (pasivas.consultar(def, t, 10000) - 10000) / 10000 + 1 : 1;
    if (factorGuardia != null) f *= i === 0 || i === 0x12 || i === 0x13 ? 0 : factorGuardia;
    return f;
  };
}
const NOMBRE_ESTADO = { 0: 'STUN', 1: 'VENENO', 2: 'OSCURIDAD', 3: 'QUEMADURA', 4: 'ESTADO 4', 5: 'PARÁLISIS', 6: 'ESTADO 6', 7: 'LENTITUD' };
// D62: lo que dispara el golpe en los medidores de estado de `u` (null si el golpe no trae datos).
function estadosDelGolpe(u, g, factorGuardia) {
  if (!g?.estados && !g?.anormal) return null;
  const r = recibirGolpe(u, g, { factor: factorEstado(u, factorGuardia), tabla: TABLA_ESTADOS });
  for (const i of r.activados) if (NOMBRE_ESTADO[i]) popup(u.x, u.y + 380 * CHAR_SCALE, NOMBRE_ESTADO[i], '#c58cff');
  return r;
}
// D62: derribo (estado 0x13 → motion 0x13 `down`, luego `wakeup`). PROVISIONAL: sin `down`, la de daño.
function derribar(u) {
  u.state = 'derribo';
  u.vx = u.vz = 0;
  if (!u.play('down', { restart: true })) u.play('damage', { restart: true });
}
function actualizarDerribo(u, alAcabar) {
  if (!u.done) return;
  if (u.anim.name === 'down' && u.has('wakeup')) u.play('wakeup', { restart: true });
  else alAcabar();
}
// D60: ventana del combo = define 7 (2000 ms) con las pasivas 0x40 del jugador (FUN_005fccb4).
const ventanaCombo = (p) => (pasivas ? pasivas.consultar(p, TIPO.VENTANA_COMBO, 2000) : 2000) / 1000;

// D60: el golpe de `atacante` a `defensor` en curso para las pasivas (FUN_005fa188 … FUN_005fa404, FUN_008389ec).
function conGolpe(atacante, defensor, golpe, fn) {
  pasivas?.contexto(atacante, defensor, golpe);
  try {
    return fn();
  } finally {
    pasivas?.limpiar();
  }
}
// velocidad() (virtual 0x90, FUN_00827b98): stat 5 con las pasivas de tipo 8 (FUN_0083aaf0; base ×100) más
// virtual 0x604 / 10000 (FUN_00827c3c: el bono de combo de las dos espadas). D56 + D60.
function velocidadJugador(p) {
  const base = p.velBase ?? 1;
  const v = (pasivas ? pasivas.consultar(p, TIPO.VELOCIDAD, base * 100) / 100 : base)
    + terminoBuff(p, base, STAT.VELOCIDAD); // D61
  const bono = p.arma === 2 ? Math.min(Math.trunc(combo.count / COMBO_VEL.cada) * COMBO_VEL.suma, COMBO_VEL.tope) : 0;
  return (v + bono / 10000) * factorVelocidad(p, TABLA_ESTADOS); // D62: lentitud (estado 7)
}

// D61: golpes que no hacen daño (attack.f2 ≠ 1, FUN_008389ec). Buffs (3/8/12 a personajes, 4/9 a enemigos;
// 6/7 los vacían): el valor sube con el efecto de buffs del atacante (virtual 0xb0 = FUN_0083b624: 1 sin skill
// activa, 1 + pasivas 0x4c con ella). PROVISIONAL: 2/10 (curación, virtual 0x30), 5 y 11 sin portar.
const NOMBRE_STAT = { 0: 'ATK', 1: 'DEF', 2: 'CRIT', 4: 'VEL. ATQ.', 5: 'VEL.', 7: 'EVA', 11: 'DAÑO CRIT', 13: 'ATK', 15: 'GUARDIA' };
const noHaceDano = (g) => g?.tipo != null && g.tipo !== 1;
function efectoBuffs(u) {
  if (!pasivas || u.state !== 'skill') return 1;
  return 1 + (pasivas.consultar(u, TIPO.EFECTO_BUFFS, 10000) - 10000) / 10000;
}
function golpeSinDano(atacante, objetivo, g) {
  if (g.tipo === 2) return curar(atacante, objetivo, g);
  if (!esBuff(g) || !aplicarBuff(objetivo, atacante, g, efectoBuffs(atacante))) return false;
  const b = g.buff ?? {};
  const sube = g.tipo === 6 || g.tipo === 7 ? null : (buffsDe(objetivo)[TIPOS_ENEMIGO.has(g.tipo) ? 'ajenos' : 'propios'].hueco(b.stat ?? 0, g.tipo === 12 ? 1 : 0) >= 1);
  const texto = `${NOMBRE_STAT[b.stat] ?? `STAT ${b.stat}`} ${sube == null ? '×' : sube ? '↑' : '↓'}`;
  popup(objetivo.x, objetivo.y + 340 * CHAR_SCALE, texto, sube === false ? '#c58cff' : '#8cff9f');
  return true;
}
// D62: curación (attack.f2 = 2; virtual 0x30 → FUN_0083a2f8, cantidad virtual 0x94 = FUN_0083ab98): base = ATK/2
// del que cura; base·f3/10000 + (pasivas 0x3d − base), con azar ±5 %, como mucho attack.f46, más base·(skill − 1),
// entre attack.f4. Nada si alguno tiene el estado 0x16. (El tipo 10 cura MP: el port no tiene MP.)
function curar(cura, objetivo, g) {
  if (sinCuracion(cura) || sinCuracion(objetivo) || !(objetivo.hp > 0)) return false;
  const base = (cura.stats?.atk ?? 0) * 0.5;
  let v = base * (g.mult ?? 0) + (pasivas ? pasivas.consultar(cura, 0x3d, base) - base : 0);
  if (v > 0) {
    const lo = Math.round(v * 0.95), hi = Math.round(v * 1.05);
    v = lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  v = Math.min(v, g.cura?.tope ?? 0);
  const skill = cura.state === 'skill' && pasivas ? 1 + (pasivas.consultar(cura, TIPO.DANO_SKILL, 10000) - 10000) / 10000 : 1;
  if (skill !== 1) v += base * (skill - 1);
  v = Math.trunc(v / (g.cura?.div || 1));
  if (!(v > 0)) return false;
  objetivo.hp = Math.min(objetivo.maxHp, objetivo.hp + v);
  popup(objetivo.x, objetivo.y + 300 * CHAR_SCALE, `+${v}`, '#7dff8a');
  // D63: curar a un personaje suma v · attack.f61 / 10000 al odio de cada rival vivo en el campo
  // (FUN_00700abc → FUN_0070c208, FUN_007107b0).
  if (objetivo.esPersonaje && g.odio) {
    for (const e of battle?.enemies ?? []) if (e.alive && (e.equipo ?? 2) !== (cura.equipo ?? 1)) e.ia?.sumarOdio(cura, (v * g.odio) / 10000);
  }
  return true;
}
// A quién va un golpe sin daño (PROVISIONAL: el juego lo decide con las cajas y attack.f5): si es de la clase
// del atacante (buff de personaje lanzado por un personaje, de enemigo por un enemigo), a él mismo; si no, a
// los rivales que toca, como un golpe normal.
const aSiMismo = (u, g) => (u.esPersonaje ? TIPOS_PERSONAJE : TIPOS_ENEMIGO).has(g.tipo) || g.tipo === (u.esPersonaje ? 6 : 7) || g.tipo === 2 || g.tipo === 10;

// Daño de un golpe con las pasivas del golpe en curso (D42 + D60).
const danoDe = (atacante, defensor, rate, skill = false, bala = null) =>
  computeDamage(atacante.stats, defensor.stats, { rate, pasivas, atacante, defensor, skill,
    critPorcentajeExtra: bonosCargaRifle(bala?.nivelCarga).critPorcentaje });
// D60: si el daño mata, las pasivas 0x50 lo pueden bajar (FUN_00839fa0).
const danoFinal = (defensor, dmg) => (pasivas ? Math.trunc(pasivas.danoFinal(defensor, dmg)) : dmg);
const skillInfo = (p, name) => p?.skillData?.[name];
const skillLabel = (p, name) => skillInfo(p, name)?.name ?? name.replace('skill_', '');

// Cuándo pega cada golpe. La master data dice cuántos golpes hay pero no en qué cuadro; las
// estelas/chispas de la animación sí: en Starburst Stream, effect_weapon_1_1 aparece justo 16
// veces (los 16 golpes de la tabla). Si una parte de efecto aparece exactamente N veces se usan
// esos cuadros; si no, los N momentos en que más efectos se encienden a la vez.
function skillHitFrames(p, name, count) {
  const { pack, anim } = p.entries.get(name);
  const n = anim.numFrames;
  if (!count) {
    count = Math.max(1, Math.min(16, Math.round(n / 16)));
    return Array.from({ length: count }, (_, i) => Math.round(n * (0.2 + (0.65 * i) / Math.max(1, count - 1))));
  }
  const fxParts = new Set(pack.parts.map((pt, i) => (/effect/.test(pt.name) && pt.type === PART_TYPE.NORMAL ? i : -1)).filter((i) => i >= 0));
  const appear = new Map(); // parte -> cuadros en que se enciende
  const prev = new Map();
  for (let f = 0; f < n; f++) {
    for (const st of decodeFrame(p.ssbp, pack, anim, f)) {
      if (!fxParts.has(st.partIndex)) continue;
      const on = st.visible && st.opacity > 0 && st.cellIndex >= 0;
      // Lo que ya está encendido al empezar (brillo del arma, etc.) no es un impacto.
      if (on && !prev.get(st.partIndex) && f >= 2) {
        if (!appear.has(st.partIndex)) appear.set(st.partIndex, []);
        appear.get(st.partIndex).push(f);
      }
      prev.set(st.partIndex, on);
    }
  }
  const exact = [...appear.values()].find((fr) => fr.length === count);
  if (exact) return exact;
  // Agrupa encendidos cercanos (±2 cuadros) y elige los grupos con más efectos.
  const all = [...appear.values()].flat().sort((a, b) => a - b);
  const clusters = [];
  for (const f of all) {
    const last = clusters[clusters.length - 1];
    if (last && f - last.end <= 2) { last.end = f; last.weight++; } else clusters.push({ start: f, end: f, weight: 1 });
  }
  const chosen = clusters.sort((a, b) => b.weight - a.weight || a.start - b.start).slice(0, count).map((c) => c.start);
  while (chosen.length < count) chosen.push(Math.round(n * (0.2 + 0.65 * (chosen.length / count))));
  return chosen.sort((a, b) => a - b);
}

// D64: las skills no tienen enfriamiento: cuestan MP (active_skill.f6 + pasivas 0x3f; mp.js). Sin el dato, 0.
function costeDe(p, name) {
  return costeSkill(p, skillInfo(p, name)?.cost ?? 0, pasivas);
}

function startSkill(p, slot) {
  const name = p.slots[slot];
  if (!name) return false;
  return lanzarSkill(p, name);
}

function lanzarSkill(p, name) {
  if (!name || !p.has(name)) return false;
  const coste = costeDe(p, name);
  if (!puedePagar(p, coste)) return false;
  pagarSkill(p, coste); // FUN_0084f384 (motion 10)
  p.state = 'skill';
  const hits = skillInfo(p, name)?.hits ?? [];
  p.skillHitData = hits;
  p.skillHits = (p.hitFrameCache[name] ??= skillHitFrames(p, name, hits.length));
  p.skillHitIndex = 0;
  empezarEventos(p);
  p.play(name, { restart: true });
  cutin = p.cutin ?? cutin;
  p.cutin?.start();
  return true;
}

function pressedSkill() {
  for (let i = 0; i < SKILL_SLOTS; i++) if (wasPressed(`skill${i + 1}`)) return i;
  return -1;
}

// D63: gravedad en el aire (FUN_0083c72c: posición += v·dt − ½·g·dt²; v −= g·dt) y llegada al suelo.
function caerJugador(p, dt) {
  p.alt += p.vy * dt - 0.5 * GRAVITY * dt * dt;
  p.vy -= GRAVITY * dt;
  aterrizar(p);
}
function aterrizar(p) {
  if (p.alt > 0) return false;
  p.alt = 0;
  p.vx = p.vz = p.vy = 0;
  return true;
}

function startAttack(p, n) {
  p.state = 'attack';
  p.combo = n;
  p.queued = false;
  p.hitDone = false;
  empezarEventos(p);
  const nombre = animacionAtaqueRifle(p, n);
  p.timing[nombre] ??= attackTiming(p, nombre, n < 3 ? animacionAtaqueRifle(p, n + 1) : null);
  p.play(nombre, { restart: true });
}

// D50: golpes del jugador en los cuadros de character.f18 (tipo 1): cada id de attack.json pega
// una vez a cada enemigo mientras su ventana [desde, hasta] está activa. Sin eventos para la
// animación (otra unidad con ?pj=, la 4.ª ranura de skill) se usa lo deducido de antes (D24).
function empezarEventos(p) {
  p.lastEvFrame = -1;
  p.golpeados = new Map();
  p.lastImpFrame = -1;
  p.vx = p.vz = 0; // D58: el cambio de motion fija la velocidad (0 en los ataques; FUN_0084f384)
}

// D58: evento 10 (FUN_00840fbc): fija la velocidad (vx hacia donde mira, vy hacia arriba) y dura hasta el
// siguiente evento 10 o el cambio de motion; el rozamiento la frena (movimiento.js). PROVISIONAL: sin el
// giro hacia el objetivo (f4, con el flag +0x1dc sin leer); vy > 0 en el suelo no se aplica.
function aplicarImpulsos(p, ev, dt) {
  const f = p.frame;
  for (const m of ev?.impulsos ?? []) {
    if (m.cuadro <= (p.lastImpFrame ?? -1) || m.cuadro > f) continue;
    [p.vx, p.vz] = orientar(p, objetivoDe(p), m.vx * p.dir, 0, (m.giro * Math.PI) / 180); // giro f4 (grados)
  }
  p.lastImpFrame = f;
  moverConVelocidad(p, dt);
}

// Objetivo de una unidad (+0x34). Enemigo: el jugador. Jugador: PROVISIONAL, el enemigo vivo más cercano
// por delante (no se leyó cómo lo elige el juego).
function objetivoDe(u) {
  const jugador = battle?.player;
  if (u !== jugador) return jugador;
  let mejor = null;
  for (const e of battle?.enemies ?? []) {
    if (!e.alive || e.hidden || Math.sign(e.x - u.x) !== u.dir) continue;
    if (!mejor || Math.hypot(e.x - u.x, e.z - u.z) < Math.hypot(mejor.x - u.x, mejor.z - u.z)) mejor = e;
  }
  return mejor;
}

// D58: la raíz del ataque avanza hacia el objetivo si está delante a menos de 45° (FUN_0083e330). `antes` =
// desplazamiento de la raíz antes de actualizar la animación.
function orientarRaiz(u, antes, animAntes) {
  if (u.anim !== animAntes || (u.state !== 'attack' && u.state !== 'skill')) return;
  const d = u.rootOffset - antes;
  if (!d || !Number.isFinite(d)) return;
  const [dx, dz] = orientar(u, objetivoDe(u), d, 0, GIRO_RAIZ);
  u.x += dx - d;
  u.z += dz;
}

function golpesDeEventos(p, foes, ev, { reach = p.alcance, behind = 60, drag = false, area = false } = {}) {
  const f = p.frame;
  for (const g of ev.golpes) {
    if (Math.max(g.desde, p.lastEvFrame + 1) > Math.min(g.hasta, f)) continue;
    if (!p.golpeados.has(g.ataque)) p.golpeados.set(g.ataque, new Set());
    const ya = p.golpeados.get(g.ataque);
    if (noHaceDano(g) && aSiMismo(p, g)) { // D61: buff propio
      if (!ya.has(p)) { ya.add(p); golpeSinDano(p, p, g); }
      continue;
    }
    // D51: con cajas de colisión, pega a todo enemigo cuya caja de cuerpo toque la del golpe; sin
    // datos para alguno de los dos, el alcance aproximado de antes.
    const tocados = [], sinCajas = [];
    for (const e of foes) {
      if (!e.alive || e.hidden || ya.has(e)) continue;
      const r = resolverGolpe(p, g, e, { reduccion: e.guardia, sueloA: p.alt ?? 0, sueloD: e.alt ?? 0 });
      if (r.resultado === 'parada') { ya.add(e); pararGolpe(e, p, g); continue; }
      if (r.sinDatos) sinCajas.push(e);
      else if (r.resultado) tocados.push([e, r]);
    }
    for (const [e, r] of [...tocados, ...objetivos(p, sinCajas, { reach, behind, area }).map((e) => [e, { factor: 1 }])]) {
      const n = ya.size; // D57: la pausa de impacto baja con cada objetivo que el ataque ya golpeó
      ya.add(e);
      if (noHaceDano(g)) { golpeSinDano(p, e, g); continue; } // D61: debuff al rival
      const cubierto = r.resultado === 'guardia' || r.resultado === 'rotura';
      if (cubierto) popup(e.x, e.y + 300 * CHAR_SCALE, r.resultado === 'rotura' ? 'GUARD BREAK' : 'GUARD', '#7fd0ff');
      hitEnemy(p, e, { mult: g.mult * r.factor, final: g.final, drag: drag && !cubierto, guardia: cubierto, golpe: g, factorGuardia: r.factor });
      // D57: al romper la guardia el golpe hace además el daño entero (FUN_008389ec).
      if (r.resultado === 'rotura' && e.alive) { hitEnemy(p, e, { mult: g.mult, final: g.final, drag, golpe: g }); aturdir(e); }
      pausaDeGolpe(p, e, g, n);
    }
  }
  p.lastEvFrame = f;
}

function playerInvulnerable(p) {
  return p.state === 'dodge' || p.state === 'down' || p.state === 'skill';
}

function updatePlayer(p, foes, dt) {
  const move = (isHeld('right') ? 1 : 0) - (isHeld('left') ? 1 : 0);
  const moveZ = (isHeld('up') ? 1 : 0) - (isHeld('down') ? 1 : 0); // D58: arriba = más lejos (z mayor)
  if (p.state !== 'guard') { p.tiempoGuardia = 0; p.guardiaFirme = false; }
  // D63: golpeado en el aire (reacción, derribo…): la gravedad sigue actuando.
  if (p.alt > 0 && !['jump', 'headSplitter', 'attack'].includes(p.state)) caerJugador(p, dt);
  switch (p.state) {
    case 'idle':
    case 'walk':
    case 'run': {
      p.vx = p.vz = 0; // caminar y correr mueven directamente (abajo); las demás motions empiezan paradas
      const skill = pressedSkill();
      if (skill >= 0 && startSkill(p, skill)) break;
      if (wasPressed('attack')) { startAttack(p, 1); break; }
      if (wasPressed('dodge') && p.has('back_step')) {
        // D56/D58: motion 6 → velocidad dirección · paso (+0x734) hacia atrás y frena con el rozamiento.
        p.state = 'dodge';
        p.vx = -p.dir * p.pasoVel;
        p.play('back_step', { restart: true });
        break;
      }
      if (isHeld('guard') && p.has('guard')) { p.state = 'guard'; p.play('guard', { restart: true }); break; }
      if (wasPressed('jump')) {
        // D56/D58: motion 7 → (dir.x, 1, 0) · salto con dir normalizada (FUN_0084f384). PROVISIONAL: con una
        // dirección pulsada se toma un deslizamiento a 45° (dir.x = ±0.71); sin ella, salto vertical.
        p.state = 'jump';
        p.vy = p.saltoVel;
        p.vx = move * Math.SQRT1_2 * p.saltoVel;
        p.airAttack = false;
        p.play('jump', { restart: true });
        break;
      }
      if (move || moveZ) {
        if (move) p.face(move);
        const running = isHeld('run');
        const n = Math.hypot(move, moveZ); // dirección normalizada (el arrastre da a lo sumo 1)
        const v = (running ? DASH_SPEED : WALK_SPEED) * velocidadJugador(p);
        p.x += (move / n) * v * dt;
        p.z += (moveZ / n) * v * dt;
        p.state = running ? 'run' : 'walk';
        p.play(running ? 'dash' : 'walk', { loop: true });
      } else {
        p.state = 'idle';
        p.play('wait', { loop: true });
      }
      break;
    }

    case 'attack': {
      if (p.alt > 0) caerJugador(p, dt); // D63: ataque empezado en el aire
      const skill = pressedSkill();
      if (skill >= 0 && p.frame >= 4 && p.alt <= 0 && startSkill(p, skill)) break;
      if (wasPressed('attack')) p.queued = true;
      const t = p.timing[p.anim.name];
      const ev = p.eventosGolpe?.[p.anim.name];
      aplicarImpulsos(p, ev, dt);
      // D73: mantener ataque prepara el rifle; soltarlo libera el evento4 de attack_2.
      // 0082790c conserva la motion9 del arma6 al acabar su preparación.
      if (p.proyectiles.preparaApuntado(p)) {
        if (p.done && !isHeld('attack') && p.has('attack_2')) startAttack(p, 2);
        break;
      }
      if (ev) golpesDeEventos(p, foes, ev);
      else if (!p.hitDone && p.frame >= t.hit) { p.hitDone = true; tryHit(p, foes); }
      if (p.queued && p.combo < 3 && p.frame >= t.cancel && p.has(`attack_${p.combo + 1}`)) {
        if (move) p.face(move);
        startAttack(p, p.combo + 1);
      } else if (p.done) {
        p.state = p.alt > 0 ? 'jump' : 'idle'; // PROVISIONAL: al acabar en el aire, sigue la caída
        p.play(p.alt > 0 ? 'jump' : 'wait', { loop: p.alt <= 0 });
      }
      break;
    }

    case 'skill': {
      const ev = p.eventosGolpe?.[p.anim.name];
      aplicarImpulsos(p, ev, dt);
      if (ev) {
        golpesDeEventos(p, foes, ev, { reach: SKILL_REACH, behind: 400, drag: true, area: true });
        if (p.done) { p.state = 'idle'; p.play('wait', { loop: true }); }
        break;
      }
      while (p.skillHitIndex < p.skillHits.length && p.frame >= p.skillHits[p.skillHitIndex]) {
        const hit = p.skillHitData[p.skillHitIndex];
        p.skillHitIndex++;
        // Multiplicador real de la tabla attack (1.25 = 125 %); el ataque base es inventado.
        tryHit(p, foes, { reach: SKILL_REACH, mult: hit ? hit.rate : 1.8, behind: 400, final: hit?.final, drag: true, area: true });
      }
      if (p.done) { p.state = 'idle'; p.play('wait', { loop: true }); }
      break;
    }

    case 'dodge':
      // D56/D58: el paso atrás sale a la velocidad +0x734 y el rozamiento (1980/s²) lo frena: 990 → 0 en
      // 0.5 s, 247 de recorrido (movimiento.js). Su animación no tiene raíz.
      moverConVelocidad(p, dt);
      if (p.done) { p.state = 'idle'; p.play('wait', { loop: true }); }
      break;

    case 'guard':
      if (!isHeld('guard')) { p.state = 'idle'; p.play('wait', { loop: true }); break; }
      // D58: guardia + deslizar hacia arriba = parada (how_to_play.json); la animación `parry` lleva sus
      // cajas de parada (evento 54).
      if (wasPressed('jump') && p.has('parry')) { p.state = 'parry'; p.play('parry', { restart: true }); break; }
      p.tiempoGuardia = (p.tiempoGuardia ?? 0) + dt;
      p.guardiaFirme = p.tiempoGuardia >= GUARDIA_FIRME;
      if (p.frame >= CUADRO_GUARDIA && p.anim?.fps) p.time = CUADRO_GUARDIA / p.anim.fps; // PROVISIONAL (D53)
      break;

    case 'parry': // D53: parada automática (evento 93) → animación `parry` (motion 30)
      if (p.done) { p.state = isHeld('guard') && p.has('guard') ? 'guard' : 'idle'; p.play(p.state === 'guard' ? 'guard' : 'wait', { loop: p.state !== 'guard', restart: true }); }
      break;

    case 'jump':
      // FUN_0083c72c: posición += v·dt − ½·g·dt²; v −= g·dt. D58: en el aire la velocidad horizontal frena
      // hasta 264 en su dirección (FUN_00848e2c) y no se dirige (el arrastre no actúa en el aire).
      p.alt += p.vy * dt - 0.5 * GRAVITY * dt * dt;
      p.vy -= GRAVITY * dt;
      moverConVelocidad(p, dt, { enAire: true });
      // D63: en el aire (motion 7) se aceptan el ataque normal (9) y el Head Splitter (12): deslizar hacia
      // abajo (how_to_play.json) → jump_attack con velocidad (0, −1320, 0) (FUN_0084f384); tocar → attack_1
      // con la velocidad a 0, y sigue cayendo (FUN_0083c72c).
      if (wasPressed('down') && p.has('jump_attack')) {
        p.state = 'headSplitter';
        p.hitDone = false;
        empezarEventos(p);
        p.vy = HEAD_SPLITTER_VY;
        p.play('jump_attack', { restart: true });
        break;
      }
      if (wasPressed('attack') && p.has('attack_1')) {
        startAttack(p, 1);
        p.vy = 0;
        break;
      }
      if (aterrizar(p)) {
        p.state = 'idle';
        p.play('wait', { loop: true });
      }
      break;

    case 'headSplitter': // D63
      caerJugador(p, dt);
      if (p.eventosGolpe?.jump_attack) golpesDeEventos(p, foes, p.eventosGolpe.jump_attack);
      else if (!p.hitDone && p.frame >= p.timing.jump_attack.hit) { p.hitDone = true; tryHit(p, foes); }
      if (p.alt <= 0 && p.done) { p.state = 'idle'; p.play('wait', { loop: true }); }
      break;

    case 'hurt':
      if (p.done) { p.state = 'idle'; p.play('wait', { loop: true }); }
      break;

    case 'stun': // D58: aturdido tras romperse la guardia
      p.timer -= dt;
      if (p.timer <= 0) { p.state = 'idle'; p.play('wait', { loop: true }); }
      break;

    case 'derribo': // D62
      actualizarDerribo(p, () => { p.state = 'idle'; p.play('wait', { loop: true }); });
      break;

    case 'switchIn': // Switch: llegada (motion 0x18) frenando hasta el punto; luego la skill de entrada
      moverConVelocidad(p, dt);
      if (!p.vx && !p.vz) {
        const s = p.skillEntrada;
        p.skillEntrada = null;
        if (!(s && lanzarSkill(p, s))) { p.state = 'idle'; p.play('wait', { loop: true }); }
      }
      break;

    case 'down':
      p.timer -= dt;
      // Switch: con alguien del grupo en pie, se cambia a él (se puede antes con Q/E/R). PROVISIONAL: solo, al
      // acabar el tiempo de `down` (no se leyó si el juego espera a que el jugador toque un icono).
      if (p.hp <= 0 && !battle.repeat && grupo.some((m) => m !== p && m.hp > 0)) {
        if (p.timer <= 0) cambiar(grupo.findIndex((m) => m !== p && m.hp > 0));
        break;
      }
      if (p.anim.name === 'down' && p.timer <= 0) p.play('wakeup', { restart: true });
      else if (p.anim.name === 'wakeup' && p.done) {
        p.hp = p.maxHp;
        p.state = 'idle';
        p.play('wait', { loop: true });
      }
      break;
  }
}

// El personaje cae (HP 0). Sin nadie más del grupo en pie, la misión queda fallida (F3, D45: quest/result con
// cleared: false); si queda alguien, se cambia a él (Switch).
function caePersonaje(p) {
  p.state = 'down';
  p.timer = 1.2;
  p.play('down', { restart: true });
  if (!grupo.some((m) => m !== p && m.hp > 0)) { void audio.contexto('derrota'); progreso?.caer(battle); }
}

// Switch: el que sale hace `back_step` (motion 0x19) y desaparece al acabar (SwitchedUnitDisappearingEvent,
// FUN_00847450).
function actualizarSalida(m, dt) {
  moverConVelocidad(m, dt);
  m.update(dt);
  m.y = groundY(m.z);
  if (m.done) {
    m.saliendo = false;
    m.state = 'idle';
    m.play('wait', { loop: true });
  }
}

// drag: los golpes de una skill arrastran al enemigo frente al jugador (las skills avanzan
// mucho por su root motion y si no el enemigo se quedaría atrás).
// PROVISIONAL (D43): con varios enemigos, los ataques normales pegan al más cercano que esté al
// frente y las sword skills (`area`) a todos los que estén en su alcance.
function tryHit(p, foes, { reach = p.alcance, mult = null, behind = 60, final = false, drag = false, area = false } = {}) {
  if (p.proyectiles?.reemplaza(p)) return; // D48: esta animación dispara; pegan sus balas (proyectiles.js)
  for (const e of objetivos(p, foes, { reach, behind, area })) hitEnemy(p, e, { mult, final, drag });
}

function objetivos(p, foes, { reach, behind, area, exclude = null }) {
  const inRange = foes.filter((e) => {
    const dx = (e.x - p.x) * p.dir;
    const enProf = Math.abs((e.z ?? 0) - (p.z ?? 0)) < PROF_APROX + (e.radio ?? 0); // D58 (PROVISIONAL)
    return e.alive && !e.hidden && enProf && dx >= -behind && dx <= reach && !exclude?.has(e);
  });
  if (!inRange.length) return [];
  return area ? inRange : [inRange.reduce((a, b) => (Math.abs(b.x - p.x) < Math.abs(a.x - p.x) ? b : a))];
}

function hitEnemy(p, e, { mult, final, drag, guardia = false, golpe = null, factorGuardia = null, bala = null }) {
  conGolpe(p, e, golpe, () => golpeAEnemigo(p, e, { mult, final, drag, guardia, golpe, factorGuardia, bala }));
}

function golpeAEnemigo(p, e, { mult, final, drag, guardia, golpe, factorGuardia, bala }) {
  e.aggro = true;
  // Ataques normales: multiplicadores reales de attack.json. Los que tienen 2 golpes (attack_2,
  // attack_3) se calculan por separado (cada uno con su azar y su crítico, como FUN_0083ad60) y se
  // aplican juntos en el único momento de golpe que detectamos.
  const rates = mult != null ? [mult] : (p.normales[p.anim.name] ?? [1]);
  let dmg = 0;
  let crit = false;
  for (const rate of rates) {
    const hit = danoDe(p, e, rate, p.state === 'skill', bala);
    dmg += hit.dmg;
    crit ||= hit.crit;
  }
  dmg = danoFinal(e, dmg);
  e.hp = Math.max(0, e.hp - dmg);
  e.ia?.sumarOdio(p, (dmg * (golpe?.odio ?? 0)) / 10000); // D63: FUN_0070c208 (attack.f61)
  // D64: un golpe normal (attack.f1 = 1) del personaje da MP (FUN_0070bd6c). Sin datos del golpe, el de un
  // ataque normal (PROVISIONAL).
  if (p.esPersonaje) ganarMpPorGolpe(p, golpe ?? (p.state === 'attack' || p.state === 'headSplitter' ? { clase: 1 } : null), pasivas);
  combo.count += 1;
  combo.timer = ventanaCombo(p);
  shake = 0.12;
  popup(e.x, e.y + 260 * CHAR_SCALE, crit ? `${dmg}!` : String(dmg), final || crit ? '#ffd25a' : '#ffffff');
  if (final) shake = 0.3;
  if (e.hp <= 0) {
    e.alive = false;
    e.state = 'dead';
    e.play('dead', { restart: true });
    e.timer = 1.6;
    battle.onDefeated(e);
    return;
  }
  // D62: reacción por los medidores de estado (sin datos del golpe, como antes: siempre reacciona).
  const est = estadosDelGolpe(e, golpe, guardia ? factorGuardia ?? 0 : null);
  if (guardia) { // D53: se cubrió: daño reducido, sin interrumpir lo que hacía
    e.x += 28 * p.dir * A_ESCALA;
  } else if (e.state === 'stun' || e.state === 'derribo') { // D58: aturdido: recibe el daño sin reaccionar
    e.x += 28 * p.dir * A_ESCALA;
  } else if (est?.derribo) {
    if (drag) e.x = p.x + p.dir * 260 * A_ESCALA;
    else e.x += 28 * p.dir * A_ESCALA;
    e.face(p.x < e.x ? -1 : 1);
    derribar(e);
  } else if (est && !est.reaccion) { // no se le acabó el medidor de reacción: sigue con lo suyo
    e.x += 28 * p.dir * A_ESCALA;
  } else {
    e.state = 'hurt';
    if (drag) e.x = p.x + p.dir * (final ? 260 : 150) * A_ESCALA;
    else e.x += 28 * p.dir * A_ESCALA;
    e.face(p.x < e.x ? -1 : 1);
    e.play('damage', { restart: true });
  }
}

// ---------- Enemigos ----------
// Profundidad -> altura de dibujo (PROVISIONAL, ver PLAYER_Z / DEPTH_Y).
const groundY = (z) => GROUND + (z - PLAYER_Z) * DEPTH_Y;

// Instancia otro enemigo con el mismo .ssbp y texturas ya cargados (misma unidad y traje).
function cloneCharacter(proto) {
  const ch = new Character(proto.ssbp, proto.mainPack, proto.textures, { scale: proto.scale });
  ch.rootMotion = proto.rootMotion;
  ch.unit = proto.unit;
  ch.costume = proto.costume;
  ch.cajas = proto.cajas;
  return ch;
}

function makeEnemy(ch, { stats, normales, placed = null }) {
  ch.stats = stats;
  ch.normales = normales;
  ch.placed = placed; // registro de stage.json (null en el modo de prueba)
  ch.boss = !!placed?.jefe;
  ch.z = placed?.z ?? PLAYER_Z;
  ch.y = groundY(ch.z);
  ch.hp = ch.maxHp = stats.hp;
  // D60: datos que miran las pasivas (equipo, clase, arma 0x430); los enemigos no traen pasivas propias.
  ch.equipo = 2;
  ch.esPersonaje = false;
  ch.arma = 0;
  pasivas?.registrar(ch, []);
  pasivas?.aplicarAlEmpezar(ch);
  ch.alive = false;
  ch.hidden = true; // hasta que aparece
  ch.aggro = false;
  ch.cooldown = 1.5;
  ch.timer = 0;
  ch.alpha = 1;
  ch.timing = attackTiming(ch, 'attack_1', null);
  if (placed) ch.x = placed.x;
  return ch;
}

function appear(e, p) {
  if (e.boss) contarHistorias(MOMENTO.jefe); // diálogo al aparecer el jefe (PROVISIONAL); conservar BGM del escenario
  e.hidden = false;
  e.alive = true;
  e.hp = e.maxHp;
  e.alpha = 1;
  e.cooldown = 1.5;
  e.face(p.x < e.x ? -1 : 1);
  e.state = 'appear';
  if (!e.play('appear', { restart: true })) { e.state = 'idle'; e.play('wait', { loop: true }); }
}

// Modo de prueba: el enemigo (re)aparece frente al jugador.
function spawnEnemy(e, p) {
  e.x = p.x + p.dir * 650;
  e.aggro = true;
  appear(e, p);
}

// Estados en que manda la IA del juego (D47). El resto (muerte, reaparición) es común.
const ESTADOS_IA = new Set(['appear', 'hurt', 'idle', 'walk', 'ai', 'attack', 'stun', 'derribo']);

function updateEnemy(e, p, dt) {
  if (e.hidden) return;
  if (e.ia && ESTADOS_IA.has(e.state)) return updateEnemyIA(e, p, dt);
  const dist = Math.abs(p.x - e.x);
  const towards = p.x < e.x ? -1 : 1;
  switch (e.state) {
    case 'appear':
    case 'hurt':
      if (e.done) { e.state = 'idle'; e.play('wait', { loop: true }); }
      break;
    case 'derribo': // D62
      actualizarDerribo(e, () => { e.state = 'idle'; e.play('wait', { loop: true }); });
      break;
    case 'idle':
    case 'walk':
      e.face(towards);
      if (!e.aggro && dist > AGGRO_RANGE) {
        e.state = 'idle';
        e.play('wait', { loop: true });
        break;
      }
      e.aggro = true;
      e.cooldown -= dt;
      if (dist > ENEMY_REACH - 10) {
        e.state = 'walk';
        e.play('walk', { loop: true });
        e.x += towards * 130 * dt;
      } else if (e.cooldown <= 0 && p.state !== 'down') {
        e.state = 'attack';
        e.hitDone = false;
        e.play('attack_1', { restart: true });
      } else {
        e.state = 'idle';
        e.play('wait', { loop: true });
      }
      break;
    case 'attack':
      if (!e.hitDone && !e.proyectiles?.reemplaza(e) && e.frame >= e.timing.hit) {
        e.hitDone = true;
        const dx = (p.x - e.x) * e.dir;
        if (dx > -60 && dx < ENEMY_REACH + 20 && !playerInvulnerable(p)) hitPlayer(p, e);
      }
      if (e.done) {
        e.state = 'idle';
        e.cooldown = 1.2 + Math.random() * 1.3;
        e.play('wait', { loop: true });
      }
      break;
    case 'dead':
      if (e.done) {
        e.timer -= dt;
        e.alpha = Math.max(0, Math.min(1, e.timer / 0.8));
        if (e.timer <= 0) { e.state = 'gone'; e.timer = 0.8; }
      }
      break;
    case 'gone':
      if (!battle.repeat) break;
      e.timer -= dt;
      if (e.timer <= 0) spawnEnemy(e, p);
      break;
  }
}

// D47: enemigo con la IA del juego (web/js/ia.js). La IA solo corre con el enemigo libre (no al
// aparecer ni al recibir daño, como FUN_00801f24); aquí se resuelven sus órdenes y el golpe.
const IA_CTX = {
  rivales: [],
  ancho: null,
  esperar(e) { e.play('wait', { loop: true }); },
  mover(e, dx, dz, anim, mira) {
    e.x += dx;
    e.z += dz;
    e.y = groundY(e.z);
    if (mira) e.face(mira);
    if (!e.play(anim, { loop: true })) e.play('walk', { loop: true });
  },
  // D59: `motion` y `dir` ([x, z]) de la virtual 0x38c: el paso (5/6) sale a dirección · paso (v[13]) y el
  // salto (7) a (dir.x · salto, salto) (v[14]); FUN_0084f384. El resto de ataques empiezan parados.
  atacar(e, anim, objetivo, { motion = 0, dir = [0, 0] } = {}) {
    if (!e.has(anim)) return false;
    if (objetivo) e.face(objetivo.x < e.x ? -1 : 1);
    e.state = 'attack';
    e.attackAnim = anim;
    e.hitDone = false;
    e.hitIds = new Set();
    e.lastEvFrame = -1;
    e.vx = 0;
    e.vz = 0;
    e.vy = 0;
    e.alt ??= 0;
    e.timings ??= {};
    e.timings[anim] ??= attackTiming(e, anim, null);
    e.play(anim, { restart: true });
    const n = Math.hypot(dir[0], dir[1]);
    if ((motion === 5 || motion === 6) && n) {
      e.vx = (dir[0] / n) * (e.paso ?? 0);
      e.vz = (dir[1] / n) * (e.paso ?? 0);
    } else if (motion === 7) {
      e.vx = (n ? dir[0] / n : 0) * (e.salto ?? 0);
      e.vy = e.salto ?? 0;
      if (e.vy > 0) e.enAire = true;
    } else if (motion === 12 && e.enAire) {
      e.vy = HEAD_SPLITTER_VY; // D63: jump_attack cae en picado (FUN_0084f384)
    }
    return true;
  },
  ataqueTerminado(e) { return e.state !== 'attack'; },
};

function updateEnemyIA(e, p, dt) {
  switch (e.state) {
    case 'appear':
    case 'hurt':
      if (e.done) { e.state = 'ai'; e.play('wait', { loop: true }); }
      return;
    case 'stun': // D58: guardia rota
      e.timer -= dt;
      if (e.timer <= 0) { e.state = 'ai'; e.play('wait', { loop: true }); }
      return;
    case 'derribo': // D62
      actualizarDerribo(e, () => { e.state = 'ai'; e.play('wait', { loop: true }); });
      return;
    case 'attack': {
      if (e.eventos) {
        // Sin eventos de golpe la animación no hace daño (p. ej. attack_4 del lobo: solo embiste).
        eventosDeAtaque(e, p, e.eventos[e.attackAnim] ?? { golpes: [], impulsos: [] }, dt);
      } else {
        const t = e.timings[e.attackAnim];
        if (!e.hitDone && !e.proyectiles?.reemplaza(e) && e.frame >= t.hit) {
          e.hitDone = true;
          const dx = (p.x - e.x) * e.dir; // PROVISIONAL: alcance del golpe (cajas de colisión sin leer)
          if (dx > -60 && dx < ENEMY_REACH + 20 && p.hp > 0 && !playerInvulnerable(p)) hitPlayer(p, e, e.normales[e.attackAnim] ?? [1]);
        }
      }
      if (e.done) { e.state = 'ai'; e.play('wait', { loop: true }); }
      break;
    }
    default:
      e.state = 'ai';
  }
  if (e.enAire && e.state !== 'attack') caerEnemigo(e, dt);
  IA_CTX.rivales[0] = p;
  IA_CTX.unidades = [p, ...(battle?.enemies ?? [])]; // D63: candidatos del objetivo de ataque (FUN_00809f54)
  IA_CTX.ancho = battle?.repeat ? null : battle?.fieldWidth ?? null;
  IA_CTX.profundidad = battle?.repeat ? null : battle?.fieldDepth ?? null;
  e.ia.update(dt, IA_CTX);
}

// Eventos por cuadro del ataque (enemy.f13, FUN_0083f114; web/data/ia/, D55): tipo 1 = golpe en ese
// cuadro con el multiplicador de su attack.json (una vez por id de ataque), tipo 10 = velocidad
// (vx hacia donde mira, vy hacia arriba; FUN_00840fbc).
// PROVISIONAL: el alcance (las cajas de colisión de la animación no están leídas), la gravedad (la
// del jugador) y que en el suelo la velocidad dure solo los cuadros que la fijan.
function eventosDeAtaque(e, p, ev, dt) {
  const f = e.frame;
  let impulso = null;
  for (const m of ev.impulsos) if (m.cuadro > e.lastEvFrame && m.cuadro <= f) impulso = m;
  for (const g of ev.golpes) {
    if (Math.max(g.desde, e.lastEvFrame + 1) > Math.min(g.hasta, f) || e.hitIds.has(g.ataque)) continue;
    if (noHaceDano(g) && aSiMismo(e, g)) { e.hitIds.add(g.ataque); golpeSinDano(e, e, g); continue; } // D61
    if (!(p.hp > 0) || playerInvulnerable(p)) continue;
    const dx = (p.x - e.x) * e.dir;
    // D51 + D53: cajas de colisión y defensa del jugador (parada, parada automática, guardia). D58: antes,
    // la profundidad (si no alcanza, resultado null aunque falten cajas).
    const r = resolverGolpe(e, g, p, { reduccion: p.reduccion, sueloA: e.alt ?? 0, sueloD: p.alt ?? 0 });
    if (r.resultado === 'parada') { e.hitIds.add(g.ataque); pararGolpe(p, e, g); continue; }
    if (r.auto) empezarParada(p);
    const toca = r.sinDatos ? dx > -60 && dx < ENEMY_REACH + 20 : r.resultado && r.resultado !== 'parada';
    if (toca && r.resultado !== 'auto') {
      e.hitIds.add(g.ataque);
      if (noHaceDano(g)) { golpeSinDano(e, p, g); continue; } // D61: debuff al jugador
      const cubierto = r.resultado === 'guardia' || r.resultado === 'rotura';
      hitPlayer(p, e, [g.mult * r.factor], { guardia: cubierto, golpe: g, factorGuardia: r.factor });
      if (r.resultado === 'rotura' && p.hp > 0) { // D57: rotura de guardia: además el daño entero
        popup(p.x, p.y + 330 * CHAR_SCALE, 'GUARD BREAK', '#7fd0ff');
        hitPlayer(p, e, [g.mult], { golpe: g });
        if (p.hp > 0) aturdir(p);
      }
      pausaDeGolpe(e, p, g);
    }
  }
  e.lastEvFrame = f;
  if (impulso) {
    [e.vx, e.vz] = orientar(e, p, impulso.vx * e.dir, 0, (impulso.giro * Math.PI) / 180); // D58: giro f4
    e.vy = impulso.vy;
    if (e.vy > 0) e.enAire = true;
  }
  // D58: la velocidad dura hasta otro evento 10 o el cambio de motion y el rozamiento la frena.
  if (e.enAire) caerEnemigo(e, dt);
  else moverConVelocidad(e, dt);
}

function caerEnemigo(e, dt) {
  moverConVelocidad(e, dt, { enAire: true }); // D58: en el aire frena hasta 264
  e.alt += e.vy * dt - 0.5 * GRAVEDAD_ENEMIGO * dt * dt; // FUN_0083c72c
  e.vy -= GRAVEDAD_ENEMIGO * dt;
  if (e.alt <= 0) { e.alt = 0; e.vx = 0; e.vy = 0; e.enAire = false; }
  e.y = groundY(e.z) + e.alt;
}

// D53: el golpe tocó una caja de parada de `def` (evento 54): sin daño; si se puede parar (attack.f44),
// el atacante queda parado (FUN_008395f0) y los dos se paran 0.4 s (D57). PROVISIONAL: animación
// `parried` del atacante, sin el empuje del defensor.
function pararGolpe(def, atq, g) {
  popup(def.x, def.y + 300 * CHAR_SCALE, 'PARRY', '#ffe28a');
  if (!g.parable) return;
  pausar(def, PAUSA_PARADA);
  pausar(atq, PAUSA_PARADA);
  // D54: antes comparaba con `player`, que aquí no existe (ReferenceError); las dos ramas hacían lo mismo.
  if (atq.has('parried')) {
    atq.state = 'hurt';
    atq.play('parried', { restart: true });
  }
}

// D58: guardia rota → aturdido ATURDIMIENTO s (animación `stun`, motion 0x1b; sin ella, la de daño).
function aturdir(u, duracion = ATURDIMIENTO) {
  u.tiempoGuardia = 0;
  u.guardiaFirme = false;
  u.timer = duracion;
  u.state = 'stun';
  if (!u.play('stun', { loop: true, restart: true })) u.play('damage', { restart: true });
}

// D53: parada automática (evento 93 tocado por un ataque que se puede parar) → animación `parry`.
function empezarParada(p) {
  if (!p.has('parry') || p.state === 'parry') return;
  p.state = 'parry';
  p.play('parry', { restart: true });
}

function impactoEnemigo(p, e, g, b) {
  if (!(p.hp > 0) || playerInvulnerable(p)) return { consumirImpacto: false };
  const r = resolverImpactoBala(b, g, p);
  if (r.auto) empezarParada(p);
  if (r.resultado === 'parada') {
    popup(p.x, p.y + 300 * CHAR_SCALE, 'PARRY', '#ffe28a');
    if (g.tipo === 1 && g.parable) { pausar(p, PAUSA_PARADA); pausar(b, PAUSA_PARADA); }
    return responderParadaBala(b, p, g, { equipo: 'jugador' });
  }
  if (!r.resultado || r.resultado === 'auto') return { consumirImpacto: false };
  if (noHaceDano(g)) { golpeSinDano(e, p, g); return; }
  if (!aciertaProyectil(b, p)) { popup(p.x, p.y + 260 * CHAR_SCALE, 'MISS', '#dbe6ff'); return; }
  const cubierto = r.resultado === 'guardia' || r.resultado === 'rotura';
  hitPlayer(p, e, [g.mult * r.factor], { guardia: cubierto, golpe: g, factorGuardia: r.factor, direccion: b.sentido, bala: b });
  if (r.resultado === 'rotura' && p.hp > 0) {
    popup(p.x, p.y + 330 * CHAR_SCALE, 'GUARD BREAK', '#7fd0ff');
    hitPlayer(p, e, [g.mult], { golpe: g, direccion: b.sentido, bala: b });
    if (p.hp > 0) aturdir(p);
  }
  // Provisional: pausa del defensor; la bala no detiene la animación del emisor.
  pausaDeGolpe(b, p, g);
}

function impactoProyectil(objetivo, rate, final, g, b) {
  // La reflexión conserva el dueño y sus stats; el nuevo bando solo cambia los blancos.
  const emisor = b.emisor;
  if (objetivo.esPersonaje) return impactoEnemigo(objetivo, emisor, g, b);
  const r = resolverImpactoBala(b, g, objetivo);
  if (r.auto) empezarParada(objetivo);
  if (r.resultado === 'parada') {
    popup(objetivo.x, objetivo.y + 300 * CHAR_SCALE, 'PARRY', '#ffe28a');
    if (g.tipo === 1 && g.parable) { pausar(objetivo, PAUSA_PARADA); pausar(b, PAUSA_PARADA); }
    return responderParadaBala(b, objetivo, g, { equipo: 'enemigo' });
  }
  if (!r.resultado || r.resultado === 'auto') return { consumirImpacto: false };
  if (noHaceDano(g)) { golpeSinDano(emisor, objetivo, g); return; }
  if (!aciertaProyectil(b, objetivo)) { popup(objetivo.x, objetivo.y + 260 * CHAR_SCALE, 'MISS', '#dbe6ff'); return; }
  const guardia = r.resultado === 'guardia' || r.resultado === 'rotura';
  hitEnemy(emisor, objetivo, { mult: rate * r.factor, final, guardia, golpe: g, factorGuardia: r.factor, bala: b });
  if (r.resultado === 'rotura' && objetivo.alive) {
    hitEnemy(emisor, objetivo, { mult: rate, final, golpe: g, bala: b });
    if (objetivo.alive) aturdir(objetivo);
  }
  pausaDeGolpe(b, objetivo, g);
}

function aciertaProyectil(b, defensor) {
  // 00820ff0 y 00839ae4: el nivel2 resta10000 después del clamp de precisión.
  const dueno = b.emisor, base = dueno.stats.precision ?? 10000;
  const evasion = defensor.stats.evasion ?? 0;
  const precisionFinal = Math.max(0, base + terminoBuff(dueno, base, 6));
  const evasionFinal = Math.max(0, evasion + terminoBuff(defensor, evasion, STAT.EVASION));
  return Math.floor(Math.random() * 10000) < precisionFinal + bonosCargaRifle(b.nivelCarga).precision - evasionFinal;
}

function hitPlayer(p, e, rates = e.normales.attack_1 ?? [1], { guardia = false, golpe = null, factorGuardia = null, direccion = e.dir, bala = null } = {}) {
  conGolpe(e, p, golpe, () => golpeAJugador(p, e, rates, { guardia, golpe, factorGuardia, direccion, bala }));
}

function golpeAJugador(p, e, rates, { guardia, golpe, factorGuardia, direccion, bala }) {
  if (guardia) { // D53: golpe en guardia: daño reducido, sigue cubriéndose
    let dmg = 0;
    for (const rate of rates) dmg += danoDe(e, p, rate, false, bala).dmg;
    dmg = danoFinal(p, dmg);
    p.hp = Math.max(0, p.hp - dmg);
    popup(p.x, p.y + 260 * CHAR_SCALE, `GUARD ${dmg}`, '#7fd0ff');
    p.x += direccion * 20 * A_ESCALA;
    if (p.hp > 0) { estadosDelGolpe(p, golpe, factorGuardia ?? 0); return; }
    caePersonaje(p);
    return;
  }
  const guarding = !guardia && !p.eventosDef && p.state === 'guard' && p.dir === -direccion; // sin datos: la de antes
  if (guarding) {
    popup(p.x, p.y + 260 * CHAR_SCALE, 'GUARD', '#7fd0ff');
    p.x += direccion * 20 * A_ESCALA;
    return;
  }
  let dmg = 0;
  for (const rate of rates) dmg += danoDe(e, p, rate, false, bala).dmg;
  dmg = danoFinal(p, dmg);
  p.hp = Math.max(0, p.hp - dmg);
  shake = 0.18;
  popup(p.x, p.y + 260 * CHAR_SCALE, String(dmg), '#ff6b6b');
  if ((p.state === 'stun' || p.state === 'derribo') && p.hp > 0) return; // D58: aturdido: sin reaccionar
  // D62: reacción por los medidores de estado (sin datos del golpe, como antes).
  const est = p.hp > 0 ? estadosDelGolpe(p, golpe, null) : null;
  if (est && !est.reaccion && !est.derribo) return;
  p.alt = 0;
  p.vx = p.vz = 0;
  p.face(-direccion);
  if (p.hp <= 0) {
    caePersonaje(p);
  } else if (est?.derribo) {
    derribar(p);
  } else {
    p.state = 'hurt';
    p.play('damage', { restart: true });
  }
}

// Los cuerpos no se atraviesan: el avance de los ataques se detiene frente al enemigo más cercano.
const BODY_GAP = 110 * A_ESCALA;
function separate(p, foes) {
  if (p.alt > 60 || p.state === 'skill') return;
  let near = null;
  for (const e of foes) {
    // D58 (PROVISIONAL): solo choca con quien está a su profundidad (suma de radios).
    if (Math.abs((e.z ?? 0) - p.z) >= (p.radio ?? 15) + (e.radio ?? 15)) continue;
    if (e.alive && !e.hidden && (!near || Math.abs(e.x - p.x) < Math.abs(near.x - p.x))) near = e;
  }
  if (!near) return;
  const d = near.x - p.x;
  if (Math.abs(d) < BODY_GAP) p.x = near.x - (d === 0 ? p.dir : Math.sign(d)) * BODY_GAP;
}

// ---------- Misión (D43) ----------
// Confirmado en Ghidra (local; NOTAS.md "Misión: cómo arma el juego los escenarios" y "Apariciones y
// oleadas"):
//   - solo se crean los enemigos con f1 == dificultad (FUN_00733bac);
//   - la misión empieza en misión.f2 (escenarioInicial); f5 marca el escenario META (FUN_007063fc);
//   - las puertas (escenario.f10) llevan a otro escenario (f5); las de lado (f6) 1 nunca se cruzan
//     (solo son punto de llegada); las de lado 2 se cruzan avanzando hacia +x (FUN_00834cec);
//   - oleadas: un enemigo con f15 = k está oculto hasta que se activa la aparición k (escenario.f11);
//     la aparición tipo 4 se activa cuando mueren todos los enemigos con f16 = k, la tipo 1 cuando el
//     jugador entra en su área; luego espera f6 segundos (FUN_00834228 / FUN_0083437c / FUN_008342a8).
// PROVISIONAL (sin confirmar):
//   - apariciones tipo 2, 3 y 5: se activan al entrar al escenario; el área tipo 1 está centrada en f2;
//   - puertas: estado 1 abierta desde el inicio, 2 se abre al no quedar enemigos (ni oleadas
//     pendientes) en el escenario, 3 cerrada; al llegar, el jugador sale junto a la puerta de vuelta;
//   - la misión termina al no quedar enemigos (ni oleadas pendientes) en el escenario meta;
//   - un escenario ya visitado conserva a sus enemigos; el jugador conserva el HP entre escenarios.
const GATE_TOUCH = 70; // distancia para cruzar una puerta
const GATE_REARM = 180; // hay que alejarse esto de las puertas antes de poder volver a cruzar

class Battle {
  constructor(mission, protos, player, stages, proyectilesEnemigos) {
    this.mission = mission;
    this.protos = protos; // 'unidad|traje' -> Character cargado
    this.proyectilesEnemigos = proyectilesEnemigos;
    this.player = player;
    this.stages = stages; // id de fondo -> Stage
    this.repeat = !!mission.repetir;
    this.areas = new Map(); // id de escenario -> { sc, enemies } (se crean al entrar y se conservan)
    this.current = null;
    this.state = 'loading';
    this.timer = 0;
    this.elapsed = 0;
    this.banner = null; // { text, sub, t, keep }
    this.gateArmed = true;
    this.pendingGate = null;
    // Total de enemigos de la misión en esta dificultad (para saber cuándo termina).
    this.total = mission.escenarios.reduce((n, sc) => n + this.placedFor(sc).length, 0);
    this.defeated = 0;
  }

  get scenario() { return this.current?.sc; }
  get enemies() { return this.current?.enemies ?? []; }
  get index() { return this.mission.escenarios.indexOf(this.scenario); }
  get stage() { return this.stages.get(stageIdFor(this.scenario)); }
  get fieldWidth() { return this.scenario?.fondo?.ancho ?? null; }
  get fieldDepth() { return this.scenario?.fondo?.profundidad ?? null; } // background.f3 (D58)

  placedFor(sc) {
    return sc.enemigos.filter((pl) => (pl.dificultad ?? 1) === DIFFICULTY && (pl.equipo ?? 2) === 2);
  }

  /** Empieza la misión en el escenario inicial (misión.f2) o, si no hay, en el primero. */
  begin() {
    const m = this.mission;
    const first = m.escenarios.find((sc) => sc.id === m.escenarioInicial) ?? m.escenarios[0];
    this.enter(first.id, null);
  }

  /** Escenario meta (f5 != 0); sin él, el último de la lista. */
  get goalId() {
    const m = this.mission;
    return m.escenarioMeta ?? m.escenarios[m.escenarios.length - 1]?.id;
  }

  area(id) {
    if (!this.areas.has(id)) {
      const sc = this.mission.escenarios.find((x) => x.id === id);
      if (!sc) throw new Error(`escenario ${id} no está en la misión`);
      const enemies = this.placedFor(sc).map((pl) => {
        const m = this.mission.enemigos[pl.maestro];
        if (!m) throw new Error(`enemigo ${pl.maestro} sin exportar en la misión`);
        const e = cloneCharacter(this.protos.get(`${m.unidad}|${m.traje ?? ''}`));
        const enemy = makeEnemy(e, { stats: enemyStats(this.mission, pl.maestro, pl.nivel), normales: m.normales, placed: pl.x == null ? null : pl });
        enemy.fisica = m.fisica ?? { escala: 1 };
        enemy.eventosGeometria = m.eventosGeometria;
        enemy.radio = m.radio ?? 15;
        enemy.proyectiles = this.proyectilesEnemigos.get(String(pl.maestro)).instanciar();
        enemy.wave = pl.otros?.f15 ?? 0; // aparición que lo trae (0 = desde el inicio)
        enemy.waitedBy = pl.otros?.f16 ?? 0; // aparición tipo 4 que espera su muerte
        if (IA_DATA?.entradas[pl.ia]) {
          enemy.ia = new IAEnemigo(IA_DATA, { ia: pl.ia, modo: pl.modoIa, maestro: pl.maestro }, enemy);
          enemy.eventos = IA_DATA.enemigos[pl.maestro]?.eventos ?? null;
          enemy.eventosAudio = enemy.eventos;
          enemy.alSonido = (id, tipo) => { if (tipo === 5 && !historiasPendientes) void audio.efecto(id); };
          enemy.guardia = IA_DATA.enemigos[pl.maestro]?.guardia ?? [0, 0]; // D53: f27/f28
          enemy.medidorMax = IA_DATA.enemigos[pl.maestro]?.medidor ?? 0; // D57: v[27]
          enemy.radio = IA_DATA.enemigos[pl.maestro]?.radio ?? 15; // D58: enemy.f9
          enemy.estadosMax = IA_DATA.enemigos[pl.maestro]?.estadosMax ?? null; // D62
          enemy.paso = IA_DATA.enemigos[pl.maestro]?.paso ?? 0; // D59: v[13] (+0x734)
          enemy.salto = IA_DATA.enemigos[pl.maestro]?.salto ?? 0; // D59: v[14] (+0xf6c)
        }
        return enemy;
      });
      const appears = (sc.apariciones ?? []).map((a) => ({
        id: a.f0 ?? 0, tipo: a.f1, x: a.f2 ?? 0, ancho: a.f4 ?? 0, retraso: a.f6 ?? 0, timer: null, done: false,
      }));
      this.areas.set(id, { sc, enemies, appears });
    }
    return this.areas.get(id);
  }

  /** Entra en el escenario `id`; `fromId` = escenario del que se viene (por una puerta). */
  enter(id, fromId) {
    const p = this.player;
    // No llevar balas del escenario anterior ni reactivar balas al volver a un área visitada.
    for (const area of this.areas.values()) for (const e of area.enemies) e.proyectiles.reiniciar();
    this.current = this.area(id);
    audio.escena(`escenario:${id}`);
    if (this.scenario.otros?.f3) void audio.musica(this.scenario.otros.f3); // FUN_00701e00: stage.f3
    else void audio.contexto('batalla'); // sólo misiones de prueba sin escenario original
    if (!this.repeat) {
      const back = fromId != null ? this.scenario.puertas?.find((g) => g.destino === fromId) : null;
      if (back) {
        // Sale junto a la puerta de vuelta, un poco hacia dentro del campo.
        const inward = back.x > (this.fieldWidth ?? 0) / 2 ? -1 : 1;
        p.x = back.x + inward * GATE_REARM;
        if (back.z != null) p.z = back.z;
        p.face(inward);
        this.gateArmed = false;
      } else {
        p.x = PLAYER_START_X;
        p.z = this.fieldDepth != null ? this.fieldDepth / 2 : PLAYER_Z; // PROVISIONAL (D58)
        p.face(1);
      }
      p.state = 'idle';
      p.play('wait', { loop: true });
    }
    contarHistorias(MOMENTO.escenario, id); // diálogos al entrar en el escenario (adventure_quest_story.f4)
    for (const e of this.enemies) {
      if (!e.placed) spawnEnemy(e, p);
      else if (e.hidden && !e.wave) appear(e, p); // primera visita: los de oleada esperan
    }
    this.state = 'fighting';
    this.snapCamera = true; // la cámara salta al jugador en vez de deslizarse desde el otro escenario
    const n = this.mission.escenarios.length;
    this.banner = { text: n > 1 ? `Escenario ${this.index + 1} / ${n}` : (this.mission.etiqueta ?? ''), sub: this.mission.nombre ?? '', t: 0 };
  }

  onDefeated() {
    this.defeated += 1;
  }

  /** Sin enemigos vivos ni oleadas pendientes. */
  cleared(area) {
    return !!area && area.enemies.every((e) => !e.alive && !(e.hidden && e.wave && !this.waveDone(area, e.wave)));
  }

  waveDone(area, id) {
    return area.appears.find((a) => a.id === id)?.done ?? true;
  }

  /** Apariciones del escenario actual (oleadas; ver la cabecera). */
  updateAppears(dt) {
    const area = this.current;
    const p = this.player;
    for (const a of area.appears) {
      if (a.done) continue;
      if (a.timer == null) {
        let go;
        if (a.tipo === 4) go = area.enemies.every((e) => e.waitedBy !== a.id || (!e.alive && !e.hidden));
        else if (a.tipo === 1) go = Math.abs(p.x - a.x) <= a.ancho / 2;
        else go = true; // tipos 2, 3, 5: PROVISIONAL
        if (go) a.timer = a.retraso;
        continue;
      }
      a.timer -= dt;
      if (a.timer > 0) continue;
      a.done = true;
      for (const e of area.enemies) {
        if (e.wave === a.id && e.hidden) { e.aggro = true; appear(e, p); }
      }
    }
  }

  /** Puertas del escenario actual con su estado (PROVISIONAL, ver arriba). */
  gates() {
    const cleared = this.cleared(this.current);
    return (this.scenario?.puertas ?? []).map((g) => ({
      ...g,
      arrival: g.lado === 1, // FUN_00834cec: nunca se activa; es el punto de llegada
      open: g.lado !== 1 && (g.estado === 1 || (g.estado === 2 && cleared)),
      label: `Escenario ${this.mission.escenarios.findIndex((sc) => sc.id === g.destino) + 1}`,
    }));
  }

  update(dt) {
    if (this.banner) this.banner.t += dt;
    if (this.repeat || this.state === 'complete' || this.state === 'failed') return;
    if (this.state === 'gate') {
      this.timer -= dt;
      if (this.timer <= 0) this.enter(this.pendingGate.destino, this.scenario.id);
      return;
    }
    this.elapsed += dt;
    const p = this.player;
    this.updateAppears(dt);
    const gates = this.gates();
    if (!this.gateArmed && gates.every((g) => Math.abs(p.x - g.x) > GATE_REARM - 10)) this.gateArmed = true;
    const touching = this.gateArmed && gates.find((g) => g.open && Math.abs(p.x - g.x) < GATE_TOUCH);
    if (touching) {
      this.state = 'gate';
      this.timer = 0.5;
      this.pendingGate = touching;
      this.banner = { text: touching.label, sub: 'Cambiando de escenario…', t: 0 };
      return;
    }
    const allGone = this.enemies.every((e) => e.state === 'gone' || (!e.alive && e.hidden));
    // D55, PROVISIONAL (sin leer en Ghidra): 296 misiones tienen varios escenarios y ninguna puerta; al
    // limpiar uno sin puertas de salida que no es la meta, se pasa al siguiente de la lista.
    const siguiente = this.mission.escenarios[this.index + 1];
    if (siguiente && this.scenario.id !== this.goalId && !gates.some((g) => !g.arrival) && this.cleared(this.current) && allGone) {
      this.state = 'gate';
      this.timer = 0.5;
      this.pendingGate = { destino: siguiente.id };
      this.banner = { text: `Escenario ${this.index + 2}`, sub: 'Cambiando de escenario…', t: 0 };
      return;
    }
    if (this.scenario.id === this.goalId && this.cleared(this.current) && allGone) {
      this.state = 'complete';
      void audio.contexto('victoria');
      this.banner = { text: '¡MISIÓN COMPLETADA!', sub: `${this.mission.etiqueta ?? ''} ${this.mission.nombre ?? ''} · ${this.elapsed.toFixed(1)} s`, t: 0, keep: true };
      const datos = { cleared: true, clearTime: this.elapsed, defeated: this.defeated };
      contarHistorias(MOMENTO.despues).then(() => progreso?.terminar(datos)); // diálogos del final; F3 (D45)
    }
  }
}

let battle = null;
// Cuenta y progreso (F3 conectada, D45; web/js/progreso.js).
let progreso = null;

function stageIdFor(sc) {
  if (STAGE_ID) return STAGE_ID;
  const folder = sc?.fondo?.carpeta;
  // Solo el fondo 2006 tiene capas acomodadas (stage.js); el resto usa ese mientras tanto.
  return folder && STAGES[folder] ? String(folder) : DEFAULT_STAGE;
}

async function loadMission(id) {
  const res = await fetch(rutaWeb(`/data/misiones/${id}.json`));
  if (!res.ok) throw new Error(`misión ${id} sin datos (no está en stage; datos: node herramientas/generar_datos.mjs)`);
  return res.json();
}

// Modo de prueba (?enemigoid=): una "misión" con un solo enemigo que reaparece al morir.
function testMission(combat) {
  const m = combat.enemigos[ENEMY_ID];
  if (!m) throw new Error(`enemigo ${ENEMY_ID} no está en combate.json`);
  return {
    etiqueta: 'Prueba',
    nombre: m.nombre,
    repetir: true,
    escenarios: [{ id: 0, fondo: null, enemigos: [{ id: 1, dificultad: DIFFICULTY, maestro: ENEMY_ID, nivel: ENEMY_LEVEL, x: null }] }],
    enemigos: { [ENEMY_ID]: { ...m, unidad: ENEMY_UNIT, traje: null } },
  };
}

// ---------- HUD ----------
function bar(x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#2a3346';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * frac, h);
}

function drawHud(p, foes, dt) {
  if (hudCsb) return hudCsb.dibujar(ctx, { jugador: p, grupo, enemigos: foes, battle, combo, popups, dt, suelo: groundY, escala: CHAR_SCALE,
    puertas: battle && !battle.repeat ? battle.gates() : [] });
  const W = innerWidth;
  const H = innerHeight;
  ctx.clearRect(0, 0, W, H);
  ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'top';

  // Jugador
  ctx.fillStyle = '#fff';
  ctx.fillText(`Lv ${p.stats.nivel} ${p.stats.nombre}`, 20, 16);
  bar(20, 36, Math.min(320, W * 0.4), 12, p.hp / p.maxHp, p.hp / p.maxHp > 0.3 ? '#5be37a' : '#ff5d5d');
  ctx.fillStyle = '#cfe3ff';
  ctx.fillText(`${p.hp} / ${p.maxHp}`, 24, 52);
  bar(20, 72, Math.min(240, W * 0.3), 8, p.maxMp ? p.mp / p.maxMp : 0, '#4fb3ff'); // D64
  ctx.fillText(`MP ${p.mp ?? 0} / ${p.maxMp ?? 0}`, 24, 84);
  if (grupo.length > 1) { // Switch
    ctx.fillText(grupo.map((m, i) => `${'QER'[i]} ${m.stats.nombre.replace(/^\[[^\]]*\]\s*/, '')}${m === p ? ' (activo)' : ''} ${m.hp > 0 ? `${m.hp} HP` : 'caído'}`).join(' · '), 24, 104);
  }

  ctx.textAlign = 'center';
  // Puertas del escenario (escenario.f10): haz de luz con el destino; cian = abierta, gris = cerrada.
  for (const g of battle && !battle.repeat ? battle.gates() : []) {
    const [bx, by] = renderer.worldToScreen(g.x, groundY(g.z));
    const [, ty] = renderer.worldToScreen(g.x, groundY(g.z) + 380);
    const grad = ctx.createLinearGradient(0, ty, 0, by);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, g.open ? 'rgba(90,220,255,.55)' : 'rgba(150,150,160,.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(bx - 28, ty, 56, by - ty);
    ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    const txt = `${g.lado === 1 ? '←' : '→'} ${g.label}${g.arrival ? ' (llegada)' : g.open ? '' : ' (cerrada)'}`;
    ctx.strokeText(txt, bx, ty + 14);
    ctx.fillStyle = g.open ? '#9ff0ff' : '#c9c9d2';
    ctx.fillText(txt, bx, ty + 14);
  }

  // Enemigos (barra sobre la cabeza; el jefe, f14 = 2, en dorado y con su barra arriba)
  for (const e of foes) {
    if (e.hidden || !(e.alive || e.state === 'dead')) continue;
    const [sx, sy] = renderer.worldToScreen(e.x, e.y + 330 * CHAR_SCALE);
    bar(sx - 60, sy, 120, 7, e.hp / e.maxHp, e.boss ? '#ffc93d' : '#ff8a3d');
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(`${e.boss ? 'JEFE · ' : ''}Lv ${e.stats.nivel} ${e.stats.nombre}`, sx, sy - 18);
    ctx.fillStyle = e.boss ? '#ffd25a' : '#ffe2c9';
    ctx.fillText(`${e.boss ? 'JEFE · ' : ''}Lv ${e.stats.nivel} ${e.stats.nombre}`, sx, sy - 18);
  }
  const boss = foes.find((e) => e.boss && !e.hidden && (e.alive || e.state === 'dead'));
  if (boss) {
    const w = Math.min(420, W * 0.45);
    ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(`JEFE · ${boss.stats.nombre} · ${boss.hp} / ${boss.maxHp}`, W / 2, 44);
    ctx.fillStyle = '#ffd25a';
    ctx.fillText(`JEFE · ${boss.stats.nombre} · ${boss.hp} / ${boss.maxHp}`, W / 2, 44);
    bar(W / 2 - w / 2, 64, w, 10, boss.hp / boss.maxHp, '#ffc93d');
  }

  // Misión: nombre, escenario, dificultad y enemigos que quedan
  if (battle && !battle.repeat) {
    const m = battle.mission;
    const left = battle.total - battle.defeated;
    const line = `${m.etiqueta ?? ''} ${m.nombre ?? ''} · Escenario ${battle.index + 1}/${m.escenarios.length} · Dificultad ${DIFFICULTY} · Enemigos ${left}`;
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    const lw = ctx.measureText(line).width;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(W / 2 - lw / 2 - 10, 12, lw + 20, 22);
    ctx.fillStyle = '#e8f1ff';
    ctx.fillText(line, W / 2, 16);
  }
  // Avisos (escenario nuevo, misión completada)
  const b = battle?.banner;
  if (b && (b.keep || b.t < 2.2)) {
    ctx.globalAlpha = b.keep ? 1 : Math.min(1, (2.2 - b.t) * 2, b.t * 4);
    ctx.font = 'italic 800 40px "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.strokeText(b.text, W / 2, H * 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(b.text, W / 2, H * 0.3);
    ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeText(b.sub, W / 2, H * 0.3 + 50);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(b.sub, W / 2, H * 0.3 + 50);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
  ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';

  // Combo
  if (combo.count > 1 && combo.timer > 0) {
    ctx.textAlign = 'right';
    ctx.font = 'italic 800 42px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffd25a';
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 5;
    ctx.strokeText(`${combo.count}`, W - 30, H * 0.22);
    ctx.fillText(`${combo.count}`, W - 30, H * 0.22);
    ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('HITS', W - 30, H * 0.22 + 46);
    ctx.textAlign = 'left';
  }

  // Números de daño
  ctx.textAlign = 'center';
  for (let i = popups.length - 1; i >= 0; i--) {
    const d = popups[i];
    d.t += dt;
    if (d.t > 0.9) { popups.splice(i, 1); continue; }
    const [sx, sy] = renderer.worldToScreen(d.x, d.y);
    ctx.globalAlpha = Math.min(1, (0.9 - d.t) * 3);
    ctx.font = '900 28px "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(d.text, sx, sy - d.t * 60);
    ctx.fillStyle = d.color;
    ctx.fillText(d.text, sx, sy - d.t * 60);
  }
  ctx.globalAlpha = 1;

  drawSkillBar(p, W, H);

  // Controles
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  const help = '← → ↑ ↓ moverse · Shift correr · Z atacar · X esquivar · C defender (+ Espacio: parar) · Espacio saltar (↓ en el aire: Head Splitter) · 1-4 sword skills · Q/E/R cambiar de personaje · Tab elegir skills';
  const tw = ctx.measureText(help).width;
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.fillRect(W / 2 - tw / 2 - 12, H - 36, tw + 24, 26);
  ctx.fillStyle = '#e8f1ff';
  ctx.fillText(help, W / 2, H - 16);
  ctx.textAlign = 'left';
}

function drawSkillBar(p, W, H) {
  const size = 58;
  const gap = 10;
  const x0 = W - (size + gap) * SKILL_SLOTS - 14;
  const y0 = H - size - 54;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  p.slots.forEach((name, i) => {
    const x = x0 + i * (size + gap);
    const coste = costeDe(p, name);
    const ready = puedePagar(p, coste); // D64: sin MP suficiente, apagado
    const active = p.state === 'skill' && p.anim.name === name;
    ctx.fillStyle = active ? 'rgba(255,210,90,.9)' : ready ? 'rgba(20,40,70,.85)' : 'rgba(15,20,30,.85)';
    ctx.fillRect(x, y0, size, size);
    ctx.strokeStyle = ready ? '#4fb3ff' : '#3a4558';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y0, size, size);
    if (!ready) {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(x, y0, size, size);
    }
    ctx.fillStyle = active ? '#1a1205' : '#e8f1ff';
    ctx.font = '700 10px "Segoe UI", system-ui, sans-serif';
    const words = skillLabel(p, name).split(' ');
    const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words;
    lines.forEach((ln, k) => ctx.fillText(ln.slice(0, 12), x + size / 2, y0 + size / 2 + 2 + k * 12));
    ctx.font = '800 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = ready ? '#ffd25a' : '#8090a8';
    ctx.fillText(`${i + 1} · ${coste}`, x + size / 2, y0 + 14);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// Menú (Tab) para elegir qué skills van en cada ranura.
let skillMenu = null;
function buildSkillMenu(p) {
  const visible = skillMenu?.style.display === 'block'; // al cambiar de personaje se rehace con sus skills
  skillMenu?.remove();
  skillMenu = document.createElement('div');
  Object.assign(skillMenu.style, {
    position: 'absolute', top: '70px', left: '20px', padding: '14px 16px', display: visible ? 'block' : 'none',
    background: 'rgba(8,14,26,.92)', border: '1px solid #2c3d5c', borderRadius: '8px',
    color: '#dbe6ff', font: '13px "Segoe UI", system-ui, sans-serif', zIndex: 5,
  });
  const title = document.createElement('div');
  title.textContent = `Sword skills de ${p.unit} (${p.skills.length})`;
  title.style.cssText = 'font-weight:700;margin-bottom:8px;color:#4fb3ff';
  skillMenu.append(title);
  for (let i = 0; i < SKILL_SLOTS; i++) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0';
    row.textContent = `Tecla ${i + 1}`;
    const sel = document.createElement('select');
    sel.style.cssText = 'background:#0b1220;color:#dbe6ff;border:1px solid #2c3d5c;border-radius:4px;padding:3px 6px';
    for (const name of p.skills) {
      const o = document.createElement('option');
      o.value = name;
      const info = skillInfo(p, name);
      o.textContent = info
        ? `${info.name} · ${info.hits.length} golpes · ${info.hits.reduce((a, h) => a + h.rate, 0).toFixed(1)}×`
        : `${name.replace('skill_', '')} · ${p.entries.get(name).anim.numFrames} cuadros`;
      sel.append(o);
    }
    sel.value = p.slots[i] ?? p.skills[0];
    sel.addEventListener('change', () => { p.slots[i] = sel.value; });
    row.append(sel);
    skillMenu.append(row);
  }
  const hint = document.createElement('div');
  hint.textContent = 'Tab para cerrar · nombres, golpes y multiplicadores de la master data del juego';
  hint.style.cssText = 'margin-top:8px;color:#7f90b3;font-size:12px';
  skillMenu.append(hint);
  document.body.append(skillMenu);
}

function toggleSkillMenu() {
  if (!skillMenu) return;
  skillMenu.style.display = skillMenu.style.display === 'none' ? 'block' : 'none';
  if (skillMenu.style.display === 'none') document.activeElement?.blur();
}

// ---------- Grupo y Switch (switch.js) ----------
let grupo = []; // personajes del grupo en el orden de ?grupo= (botones 1–3 del HUD)
let esperaCambio = 0; // widget+0x248: 0.2 s tras cada cambio (FUN_008fcac0)

// Carga un personaje del grupo con todo lo suyo (D46 + Switch). `i` = puesto en el grupo; ?pj=, ?traje= y
// ?skills= solo valen para el primero.
async function cargarMiembro(id, i, combat) {
  const pj = await cargarPersonaje(id);
  const forzado = i === 0 && params.has('pj');
  const unidad = (i === 0 && params.get('pj')) || pj?.unidad || 'chara_3_dualblade_m';
  const traje = (i === 0 ? params.get('traje') : null) ?? (forzado ? undefined : pj?.traje ?? '4_kirito_34001.png');
  const [ch, cajas, skillData, proy] = await Promise.all([
    Character.load(renderer, unidad, { scale: CHAR_SCALE, costume: traje }),
    cargarCajas(unidad), // D51: cajas de colisión por cuadro; sin archivo, el alcance aproximado
    fetch(rutaWeb(`/data/skills_${unidad}.json`)).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    Proyectiles.cargar(renderer, forzado ? null : id, { escala: CHAR_SCALE, suelo: GROUND }), // D48
  ]);
  if (pj) combat.personajes[id] = pj; // D46: cualquier personaje, no solo los de combate.json
  Object.assign(ch, {
    idPj: id, pj, cajas, skillData, proyectiles: proy, fisica: pj?.fisica ?? { escala: 1 },
    // D56: velocidad (stat 5), salto (character_job.f6) y paso (character.f13).
    velBase: pj?.velocidad ?? 1, saltoVel: pj?.salto || 1062, pasoVel: pj?.paso || 990,
    // PROVISIONAL (D46): 240 cuerpo a cuerpo; armas de distancia (character_job.f5 = 1000) escalado.
    alcance: (pj?.alcanceNormal ?? 240) * A_ESCALA,
    // Cuadros de impacto reales (character.f18, D50); con ?pj= la unidad no es la suya. Solo animaciones con
    // golpes: las balas de las armas a distancia (tipos 4/57) van en proyectiles.js (D48).
    eventosGolpe: forzado || !pj?.eventos ? null : Object.fromEntries(Object.entries(pj.eventos).filter(([, ev]) => ev.golpes.length)),
    // D53: eventos de defensa (guardia, parada) y reducción de daño en guardia (f50/f51).
    eventosDef: forzado ? null : pj?.eventos ?? null,
    reduccion: pj?.guardia ?? [0, 0],
  });
  ch.armaEquipada = forzado ? null : progreso.armaDe(id);
  ch.equiposAsignados = forzado ? [] : progreso.equiposDe(id);
  ch.stats = sumarStatsEquipo(characterStats(combat, id, progreso.nivelDe(id) ?? PLAYER_LEVEL), ch.equiposAsignados);
  ch.velBase += (ch.stats.velocidad ?? 0) / 100;
  ch.normales = combat.personajes[id].normales;
  ch.z = PLAYER_Z;
  ch.medidorMax = pj?.medidor ?? 0; // D57: character.f34[17]
  ch.radio = pj?.radio ?? 15; // D58: character.f14
  ch.estadosMax = forzado ? null : pj?.estadosMax ?? null; // D62: character.f34
  const pedidas = i === 0 ? params.get('skills')?.split(',').map((s) => `skill_${s.replace(/^skill_/, '')}`) : null;
  makePlayer(ch, pedidas ?? pj?.skillsEquipadas ?? SKILLS_SIN_DATOS);
  ch.equipo = 1;
  ch.esPersonaje = true;
  ch.arma = pj?.arma ?? 0; // character.f3
  ch.lider = i === 0;
  // D60: pasivas del personaje (character.f36) y su efecto al empezar (HP máximo, medidor de guardia).
  pasivas.registrar(ch, forzado ? [] : pasivasConEquipo(pj, ch.equiposAsignados));
  pasivas.aplicarAlEmpezar(ch);
  ch.mpPorGolpe = pj?.mpPorGolpe ?? 0; // D64: character.f46
  iniciarMp(ch, ch.stats.mp, pasivas); // D64: máximo con pasivas de tipo 2 y MP lleno
  // Switch: la SS1 (f45) y la SS3 (f61) de las ranuras f35 para la skill de entrada; objetivo a ≤ f49.
  const ranura = (n) => (n ? pj?.skillsRanura?.[n - 1] ?? null : null);
  ch.entrada = { ss1: ranura(pj?.ss1), ss3: ranura(pj?.ss3), distancia: pj?.distanciaEntrada || DISTANCIA_ENTRADA };
  // El ID del traje (4_kirito_34001.png -> 34001) es el de su ilustración para el cut-in.
  const retrato = pj ? pj.retrato : ch.costume?.match(/_(\d+)(?:_\d+)?\.png$/)?.[1];
  ch.cutin = await SkillCutin.load(renderer, retrato).catch((err) => { console.warn(err); return null; });
  ch.enReserva = i > 0; // el primero empieza en el campo
  ch.eventosAudio = forzado ? null : pj?.eventos;
  ch.alSonido = (id, tipo) => {
    if (ch.enReserva || historiasPendientes) return;
    if (tipo === 5) void audio.efecto(id);
    else if (tipo === 65 || (tipo === 116 && battle?.player === ch)) void audio.vozTipo(pj?.grupoVoz, id, { emisor: ch });
  };
  ch.proyectiles.alSonido = (id, tipo) => { if (tipo === 5 && !historiasPendientes) void audio.efecto(id); };
  ch.proyectiles.sueloDe = groundY;
  ch.proyectiles.limites = () => battle && !battle.repeat ? {
    xMin: -100, xMax: (battle.fieldWidth ?? Infinity) + 100, zMin: -100, zMax: (battle.fieldDepth ?? Infinity) + 100,
  } : null;
  ch.alAnimar = (nombre) => {
    if (ch.enReserva || historiasPendientes) return;
    // FUN_00826a54: motions 18/19 son damage/down (D69).
    const tipo = nombre === 'damage' ? (Math.random() < 0.5 ? 20 : 21) : nombre === 'down' ? 22 : null;
    if (tipo != null) void audio.vozTipo(pj?.grupoVoz, tipo, { emisor: ch });
  };
  audio.prepararEventos(ch.eventosAudio);
  ch.lider = i === 0; // FUN_005f7534: el activo es el líder del gestor (pasivas f7 = 2)
  return ch;
}

// FUN_00858ea0 (virtual 0x154): incapacitado. PROVISIONAL: motion 0x1f = `parried` y el aturdimiento del port
// (guardia rota) cuenta como el estado 0; sin la motion 0x25 ni las marcas +0xebc/+0xec1/+0xec2/+0x1270.
const incapacitado = (u) => u.state === 'stun' || (u.state === 'hurt' && u.anim?.name === 'parried')
  || activo(u, ESTADO.ATURDIDO) || activo(u, ESTADO.PARALISIS) || activo(u, ESTADO.ESTADO_6);

// Switch al miembro `i` del grupo (FUN_008fcac0 → FUN_005e69bc). Devuelve si cambió.
function cambiar(i) {
  const sale = battle?.player, entra = grupo[i];
  if (!puedeCambiar(entra, { activo: sale, espera: esperaCambio, enMarcha: battle.state === 'fighting' })) return false;
  esperaCambio = ESPERA_CAMBIO;
  const objetivo = objetivoDe(sale); // +0x34 del que sale
  // El que sale: motion 0x19 (`back_step` hacia atrás a la velocidad del paso) si sigue en pie; deja de poder
  // ser objetivo (+0x1271) y desaparece al acabar.
  sale.enReserva = true;
  sale.lider = false;
  sale.saliendo = sale.hp > 0 && sale.has('back_step');
  if (sale.saliendo) {
    sale.state = 'switchOut';
    sale.alt = 0;
    sale.vx = -sale.dir * sale.pasoVel;
    sale.vz = 0;
    sale.play('back_step', { restart: true });
  }
  // El que entra: en el sitio del que sale, mirando a su lado, con sus buffs y la skill de entrada.
  entra.enReserva = false;
  entra.lider = true;
  entra.alt = entra.vy = 0;
  entra.x = sale.x;
  entra.z = sale.z;
  entra.face(sale.dir);
  const { skill, sinMp } = skillDeEntrada(entra, objetivo, {
    incapacitado, ancho: (u) => anchoCuerpo(u), coste: (n) => costeDe(entra, n), mp: entra.mp, bloqueada: activo(entra, 0xb),
  });
  if (sinMp) popup(entra.x, entra.y + 300 * CHAR_SCALE, 'SIN MP', '#8fb8ff'); // aviso FUN_005fa95c(0x13); texto nuestro
  const l = llegada({
    sale, objetivo, skill: skill ? skillInfo(entra, skill) ?? { distancia: 0 } : null, dir: sale.dir,
    ancho: (u) => anchoCuerpo(u), profundidad: battle.repeat ? null : battle.fieldDepth,
  });
  entra.x = l.salida.x;
  entra.z = l.salida.z;
  entra.vx = l.vx;
  entra.vz = l.vz;
  entra.y = groundY(entra.z);
  entra.skillEntrada = skill;
  entra.state = 'switchIn';
  entra.play('dash', { loop: true, restart: true }); // PROVISIONAL: animación de la motion 0x18 sin leer
  pasarBuffs(sale, entra);
  battle.player = entra;
  buildSkillMenu(entra);
  return true;
}

// ---------- Diálogos (ui/historia.js) ----------
// adventure_quest_story.f3 = momento de cada historia de la misión. 6 = misiones "Story" (las 358, solo diálogo);
// 1 = al entrar en el escenario f4. PROVISIONAL (deducido de los datos, sin leer en el binario): 4 antes de la
// batalla, 3 al aparecer el jefe (1-2-6: tras los centinelas llega Illfang) y 5 al acabar; 2 y 7 (3 historias)
// sin portar.
const MOMENTO = { antes: [6, 4], escenario: [1], jefe: [3], despues: [5] };
let historias = []; // las de la misión (historiasDeMision)
let historiaEnCurso = null;
const vistas = new Set();

// Reproduce, en orden, las historias de la misión de esos momentos (y de ese escenario) que no se han visto. Van
// en cola (al entrar en un escenario puede aparecer también el jefe) y la batalla se para desde que se piden.
let colaHistorias = Promise.resolve();
let historiasPendientes = 0;
function contarHistorias(momentos, escenario = null) {
  const lista = historias.filter((h) => momentos.includes(h.momento) && h.existe && !vistas.has(h.id)
    && (escenario == null || h.escenario === escenario));
  if (!lista.length) return colaHistorias;
  for (const h of lista) vistas.add(h.id);
  historiasPendientes++;
  colaHistorias = colaHistorias.then(async () => {
    for (const h of lista) {
      const hist = await Historia.cargar(h.id).catch((e) => { console.warn('historia', h.id, e); return null; });
      if (!hist) continue;
      historiaEnCurso = hist;
      held.clear();
      await hist.reproducir(hud);
      historiaEnCurso = null;
    }
    historiasPendientes--;
    resize(); // el HUD vuelve a su transformación
  });
  return colaHistorias;
}

// ---------- Arranque y bucle ----------
async function main() {
  montarAjustes();
  const combat = await loadCombatData(rutaWeb('/data/combate.json'));
  const mission = TEST_MODE ? testMission(combat) : await loadMission(MISSION_ID);
  // D47: IA de los enemigos (herramientas/exportar_ia.py); ?ia=0 vuelve a la IA provisional.
  if (!TEST_MODE && params.get('ia') !== '0') IA_DATA = await cargarIA(mission); // D55: por patrón (ia_datos.js)
  // Una carga por unidad y traje; cada enemigo es una instancia que comparte .ssbp y texturas.
  const kinds = new Map();
  for (const m of Object.values(mission.enemigos)) {
    if (!m.unidad) throw new Error(`el enemigo ${m.nombre} no tiene unidad (.ssbp) en unit.json`);
    kinds.set(`${m.unidad}|${m.traje ?? ''}`, m);
  }
  const stageIds = [...new Set(mission.escenarios.map(stageIdFor))];
  // En una misión el nivel es el del personaje en la cuenta; ?pjnivel= o ?enemigoid= = modo de prueba (no se guarda).
  progreso = await Progreso.cargar({ activo: !TEST_MODE && !params.has('pjnivel'), personajeId: PLAYER_ID, grupo: GRUPO_IDS });
  // D49: lanzado desde la interfaz (?volver=interfaz.html): el resultado se muestra allí, no en el panel provisional.
  if (params.has('volver')) progreso.mostrar = (data) => volverAInterfaz(params.get('volver'), { mision: MISSION_ID, dificultad: DIFFICULTY, personaje: PLAYER_ID, grupo: GRUPO_IDS.join(','), tiempo: battle?.elapsed, ...data });
  TABLA_ESTADOS = await fetch(rutaWeb('/data/estados.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  pasivas = new Pasivas(await cargarPasivas(), { combo: () => combo.count }); // D60
  const [stages, shadowImg, miembros, protos, mira] = await Promise.all([
    Promise.all(stageIds.map(async (id) => [id, await Stage.load(renderer, id)])).then((e) => new Map(e)),
    loadImage(rutaWeb('/assets/images/battle/shadow.png')),
    Promise.all(GRUPO_IDS.map((id, i) => cargarMiembro(id, i, combat))),
    Promise.all([...kinds].map(async ([k, m]) => [k, await Character.load(renderer, m.unidad, { scale: CHAR_SCALE, costume: m.traje ?? undefined })]))
      .then((e) => new Map(e)),
    MiraProyectiles.cargar(renderer),
  ]);
  miraProyectiles = mira;
  grupo = miembros;
  const player = grupo[0];
  const shadow = renderer.createTexture(shadowImg);
  await Promise.all([...protos.values()].map(async (pr) => { pr.cajas = await cargarCajas(pr.unit); })); // D51
  const proyectilesEnemigos = new Map(await Promise.all(Object.keys(mission.enemigos).map(async (id) => {
    const pr = await Proyectiles.cargar(renderer, id, { escala: CHAR_SCALE, suelo: GROUND, enemigo: true });
    pr.sueloDe = groundY;
    pr.limites = () => battle && !battle.repeat ? {
      xMin: -100, xMax: (battle.fieldWidth ?? Infinity) + 100, zMin: -100, zMax: (battle.fieldDepth ?? Infinity) + 100,
    } : null;
    pr.alSonido = (id, tipo) => { if (tipo === 5 && !historiasPendientes) void audio.efecto(id); };
    return [id, pr];
  })));
  if (params.get('hud') !== '0') {
    hudCsb = await HudBatalla.cargar({ grupo, jugador: player, mundoAPantalla: (x, y) => renderer.worldToScreen(x, y),
      skill: (p, n) => ({ ...skillInfo(p, n), etiqueta: skillLabel(p, n), coste: costeDe(p, n) }),
      puedeCambiar: (i) => puedeCambiar(grupo[i], { activo: battle?.player, espera: esperaCambio, enMarcha: battle?.state === 'fighting' }),
      accion: (a) => pressed.add(KEYS[a][0]), rendirse: () => progreso.caer(battle),
      mision: { id: mission.id, etiqueta: mission.etiqueta, nombre: mission.nombre, nivel: mission.dificultades?.[DIFFICULTY]?.nivelRecomendado } }).catch((e) => { console.warn('HUD de .csb no disponible; se usa el provisional', e); return null; });
  }
  cutin = player.cutin;
  buildSkillMenu(player);
  battle = new Battle(mission, protos, player, stages, proyectilesEnemigos);
  if (!TEST_MODE && params.get('historias') !== '0') historias = await historiasDeMision(mission.id ?? MISSION_ID);
  if (!TEST_MODE) await progreso.empezar(MISSION_ID, DIFFICULTY);
  document.getElementById('carga').remove();
  await contarHistorias(MOMENTO.antes); // diálogos antes de la batalla (y las misiones "Story")
  battle.begin();

  let camX = player.x;
  const step = (dt) => {
    const foes = battle.enemies;
    // Switch: Q/E/R (o tocar el icono) cambian al personaje 1/2/3 del grupo (switch.js).
    esperaCambio = Math.max(0, esperaCambio - dt);
    for (let i = 0; i < grupo.length; i++) if (wasPressed(`cambio${i + 1}`)) cambiar(i);
    const player = battle.player;
    const salen = grupo.filter((m) => m.saliendo);
    // D57: en la pausa de impacto la unidad no se mueve ni avanza su animación (impacto.js).
    if (!enPausa(player)) updatePlayer(player, foes, dt);
    for (const m of salen) actualizarSalida(m, dt);
    for (const e of foes) if (!enPausa(e)) updateEnemy(e, player, dt);
    if (!enPausa(player)) { const r0 = player.rootOffset, a0 = player.anim; player.update(dt); orientarRaiz(player, r0, a0); }
    actualizarDefensa(player, player.eventosDef); // D53
    // D61: las balas que no hacen daño aplican su buff al enemigo (las de buff propio: sin portar). Las de
    // quien acaba de salir siguen su camino.
    for (const e of foes) {
      if (e.hidden || enPausa(e)) continue;
      const r0 = e.rootOffset, a0 = e.anim;
      e.update(dt);
      orientarRaiz(e, r0, a0);
      actualizarDefensa(e, e.eventos);
    }
    for (const m of grupo) {
      m.proyectiles.update(dt, m, foes, impactoProyectil, { diferirContactos: true,
        objetivosBala: (b) => b.equipo === 'enemigo' ? (player.hp > 0 && !playerInvulnerable(player) ? [player] : []) : foes,
      });
    }
    for (const e of foes) {
      const objetivos = player.hp > 0 && !playerInvulnerable(player) ? [player] : [];
      e.proyectiles.update(dt, e, objetivos, impactoProyectil,
        { emitir: e.alive && !e.hidden && !enPausa(e), diferirContactos: true,
          objetivosBala: (b) => b.equipo === 'jugador' ? foes : objetivos });
    }
    resolverContactosProyectiles([...grupo, ...foes].map((u) => u.proyectiles), {
      actores: [...grupo, ...foes], anchoCampo: battle.fieldWidth, golpear: impactoProyectil,
      objetivosBala: (b) => b.equipo === 'jugador' ? foes : (player.hp > 0 && !playerInvulnerable(player) ? [player] : []),
    });
    miraProyectiles.actualizar(player.apuntado57, player, {
      ficha: player.proyectiles.datos.balas[player.apuntado57?.bala],
    });
    descontarPausa(player, dt);
    for (const e of foes) descontarPausa(e, dt);
    // D62: bucle de estados (FUN_0084997c): medidores, temporizadores, diferidos y ticks.
    for (const u of [player, ...foes]) {
      if (!u.estados || !(u.hp > 0) || u.hidden) continue;
      const r = avanzarEstados(u, dt, { corre: player.hp > 0, enReaccion: u.state === 'hurt' || u.state === 'derribo', tabla: TABLA_ESTADOS });
      for (const i of r.empiezan) {
        // Aturdimiento (0 → motion 0x1b) y estado 6 (motion 0x1c): la animación `stun` mientras dura.
        if ((i === ESTADO.ATURDIDO || i === ESTADO.ESTADO_6) && u.state !== 'dead') aturdir(u, estadosDe(u).tiempo[i]);
      }
      if (r.dano) {
        u.hp = Math.max(0, u.hp - r.dano);
        popup(u.x, u.y + 260 * CHAR_SCALE, String(r.dano), '#c58cff');
        if (u.hp <= 0 && !u.esPersonaje && u.alive) { u.alive = false; u.state = 'dead'; u.play('dead', { restart: true }); u.timer = 1.6; battle.onDefeated(u); }
        else if (u.hp <= 0 && u.esPersonaje) caePersonaje(u);
      }
      if (r.cura && !sinCuracion(u)) u.hp = Math.min(u.maxHp, u.hp + r.cura);
    }
    // D61: el tiempo de los buffs corre mientras el jugador sigue en pie (FUN_005f729c); el hueco 1 con el reloj
    // global y el resto con el de la unidad (FUN_005e36e4; PROVISIONAL: parado en la pausa de impacto).
    if (player.hp > 0) {
      for (const u of [player, ...foes]) {
        if (u.medidorMax) recuperarMedidor(u, dt); // D61: +2/s (FUN_0084997c)
        if (!u.buffs) continue;
        const du = enPausa(u) ? 0 : dt;
        u.buffs.propios.avanzar(du, dt);
        u.buffs.ajenos.avanzar(du, dt);
      }
    }
    separate(player, foes);
    // PROVISIONAL: nadie sale del ancho del campo (background.json f2).
    const field = battle.fieldWidth;
    if (field && !battle.repeat) {
      player.x = Math.max(0, Math.min(field, player.x));
      // Los empujones de los golpes tampoco sacan a los enemigos del campo (si no, quedan fuera de alcance).
      for (const e of foes) if (e.alive && !e.hidden) e.x = Math.max(0, Math.min(field, e.x));
    }
    // D58: profundidad del campo [0, background.f3].
    const prof = battle.fieldDepth;
    if (prof && !battle.repeat) {
      player.z = Math.max(0, Math.min(prof, player.z));
      for (const e of foes) if (e.alive && !e.hidden) { e.z = Math.max(0, Math.min(prof, e.z)); e.y = groundY(e.z) + (e.alt ?? 0); }
    }
    player.y = groundY(player.z) + player.alt;
    battle.update(dt);
    cutin?.update(dt);
    if (!enPausa(player)) pressed.clear(); // lo pulsado en la pausa de impacto se guarda para después
    combo.timer -= dt;
    if (combo.timer <= 0) combo.count = 0;

    // Cámara: sigue al jugador con un poco de anticipación hacia donde mira.
    if (battle.snapCamera) { camX = player.x + player.dir * 120; battle.snapCamera = false; }
    camX += (player.x + player.dir * 120 - camX) * Math.min(1, dt * 4);
    shake = Math.max(0, shake - dt);
    const zoom = canvas.height / VIEW_H;
    const jitter = shake > 0 ? (Math.random() - 0.5) * 12 : 0;
    renderer.lookAt(camX + jitter, CAM_Y, zoom);
    const halfW = canvas.width / zoom / 2;
    const stage = battle.stage;

    renderer.begin(stage.def.sky);
    renderer.drawQuads(stage.layerQuads(stage.back, camX, halfW));
    // Más lejos (z mayor) se dibuja antes; a igual profundidad, el jugador encima.
    const bodies = [player, ...salen.filter((m) => m.saliendo), ...foes.filter((e) => !e.hidden && e.alpha > 0)]
      .sort((a, b) => (b.z - a.z) || (a === player ? 1 : b === player ? -1 : 0));
    const shadows = bodies.map((c) => {
      const w = 220 * CHAR_SCALE;
      const h = (shadow.h / shadow.w) * w;
      const base = groundY(c.z);
      return imageQuad(shadow, c.x - w / 2, base - h / 2, w, h, 0.6 * c.alpha);
    });
    renderer.drawQuads(shadows);
    renderer.drawQuads(bodies.flatMap((c) => c.quads()));
    for (const m of grupo) renderer.drawQuads(m.proyectiles.quads());
    for (const e of foes) renderer.drawQuads(e.proyectiles.quads());
    renderer.drawQuads(miraProyectiles.quads());
    renderer.drawQuads(stage.layerQuads(stage.front, camX, halfW));
    if (cutin?.active) {
      renderer.lookAt(0, 0, zoom); // el cut-in va en coordenadas de pantalla
      renderer.drawQuads(cutin.quads());
    }

    drawHud(player, foes, dt);
  };

  // Para depurar desde la consola (step avanza la simulación aunque la pestaña esté oculta).
  window.__juego = {
    get player() { return battle.player; }, grupo, cambiar, battle, step, get cutin() { return cutin; }, progreso, pasivas, combo,
    hud: hudCsb, get proyectiles() { return battle.player.proyectiles; }, get enemies() { return battle.enemies; },
    get historia() { return historiaEnCurso; }, get historiasPendientes() { return historiasPendientes; },
    get mira() { return miraProyectiles; },
  };

  let last = performance.now();
  const frame = (now) => {
    audio.pausar('menu', Boolean(hudCsb?.pausado));
    // La marca de tiempo de requestAnimationFrame puede ser anterior a performance.now():
    // sin el max(0, ...) el primer dt sale negativo y la animación iría al cuadro -1.
    // D54: pausa del HUD; los diálogos también paran la batalla (se dibujan en el canvas del HUD).
    if (!hudCsb?.pausado && !historiasPendientes) step(Math.max(0, Math.min(0.05, (now - last) / 1000)));
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((err) => {
  document.getElementById('carga').textContent = `Error: ${err.message}`;
  console.error(err);
});
