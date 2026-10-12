import { rutaWeb } from './rutas.js';
import './importador/comprobar.js'; // D68: sin datos (página pública sin importar) manda a la portada
import { parseSSBP } from './ssbp.js';
import { SSRenderer, buildCharacterQuads, boundsOf } from './renderer.js';

const $ = (id) => document.getElementById(id);
const BACKGROUNDS = [[0.043, 0.071, 0.125, 1], [0.35, 0.37, 0.4, 1], [0.95, 0.95, 0.95, 1], [0, 0.6, 0.25, 1]];

const canvas = $('lienzo');
const renderer = new SSRenderer(canvas);
const textures = new Map(); // índice de cellMap -> textura

function setTexture(i, img) {
  setTextures([i], img);
}

// Una textura compartida por varios cellMaps (p. ej. el cuerpo en el paquete principal y en las skills).
function setTextures(indices, img) {
  const tex = renderer.createTexture(img);
  for (const i of indices) {
    const old = textures.get(i);
    textures.set(i, tex);
    if (old && ![...textures.values()].includes(old)) renderer.deleteTexture(old);
  }
}

function clearTextures() {
  for (const t of new Set(textures.values())) renderer.deleteTexture(t);
  textures.clear();
}

const frameQuads = (f) => buildCharacterQuads(st.ssbp, textures, st.pack, st.anim, f, { flipX: st.flipX });

const st = {
  units: [],
  dir: null,
  files: [],
  ssbp: null,
  pack: null,
  anim: null,
  playing: true,
  speed: 1,
  time: 0,
  frame: 0,
  flipX: false,
  bg: 0,
  bodyMaps: [],
  weaponMaps: [],
};

const api = async (path) => (await fetch(rutaWeb(`/api/ls?path=${encodeURIComponent(path)}`))).json();
const assetUrl = (file) => rutaWeb(`/assets/ss/unit/${encodeURIComponent(st.dir)}/${encodeURIComponent(file)}`);

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    img.src = url;
  });
}

function fillSelect(sel, items, selected) {
  sel.innerHTML = '';
  for (const it of items) {
    const o = document.createElement('option');
    o.value = it.value;
    o.textContent = it.label;
    if (it.value === selected) o.selected = true;
    sel.append(o);
  }
}

function setInfo(text, isError = false) {
  $('info').textContent = text;
  $('info').className = 'info' + (isError ? ' err' : '');
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
}
new ResizeObserver(() => { resize(); fit(); }).observe(canvas);

// ---- Lista de unidades ----
async function loadUnitList() {
  const { dirs } = await api('ss/unit');
  st.units = dirs;
  renderUnitList();
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('unidad');
  const first = (fromHash && dirs.includes(fromHash)) ? fromHash : dirs.find((d) => d.includes('anima_kirito')) ?? dirs[0];
  $('unidad').value = first;
  await loadUnit(first);
}

function renderUnitList() {
  const q = $('filtro').value.trim().toLowerCase();
  fillSelect($('unidad'), st.units.filter((u) => u.toLowerCase().includes(q)).map((u) => ({ value: u, label: u })), st.dir);
}

// ---- Carga de una unidad ----
async function loadUnit(dir) {
  st.dir = dir;
  history.replaceState(null, '', `#unidad=${encodeURIComponent(dir)}`);
  setInfo('Cargando…');
  st.ssbp = null;
  clearTextures();
  const { files } = await api(`ss/unit/${dir}`);
  st.files = files;
  const ssbpFile = files.find((f) => f.toLowerCase() === `${dir.toLowerCase()}.ssbp`) ?? files.find((f) => f.endsWith('.ssbp'));
  if (!ssbpFile) { setInfo('Esta carpeta no tiene .ssbp', true); return; }

  let ssbp;
  try {
    ssbp = parseSSBP(await (await fetch(assetUrl(ssbpFile))).arrayBuffer());
  } catch (e) {
    setInfo(`${ssbpFile}: ${e.message}`, true);
    return;
  }

  // Texturas: una por cellMap; el cuerpo y el arma se pueden cambiar.
  await Promise.all(ssbp.cellMaps.map(async (m, i) => {
    const file = m.imagePath.split('/').pop();
    if (!files.includes(file)) return;
    try { setTexture(i, await loadImage(assetUrl(file))); } catch { /* textura ausente */ }
  }));
  st.ssbp = ssbp;

  // El cuerpo suele apuntar a la plantilla de guía (*_sprite.png); se usa un traje real si hay.
  // El cuerpo son los cellMaps que usan la plantilla de guía (puede haber varios: principal, skills).
  const isTemplate = (m) => /_sprite\.png$/i.test(m.imagePath);
  st.bodyMaps = ssbp.cellMaps.map((m, i) => (isTemplate(m) ? i : -1)).filter((i) => i >= 0);
  if (!st.bodyMaps.length) st.bodyMaps = [0];
  const costumes = files.filter((f) => /^\d+_.+\.png$/i.test(f));
  const bodyFile = ssbp.cellMaps[st.bodyMaps[0]]?.imagePath.split('/').pop();
  const realCostumes = costumes.filter((f) => !/_sprite\.png$/i.test(f));
  const defaultCostume = /_sprite\.png$/i.test(bodyFile) && realCostumes.length ? realCostumes[0] : bodyFile;
  if (defaultCostume !== bodyFile) setTextures(st.bodyMaps, await loadImage(assetUrl(defaultCostume)));
  fillSelect($('traje'), costumes.map((f) => ({
    value: f, label: f.replace(/\.png$/i, '') + (/_sprite\.png$/i.test(f) ? ' (plantilla)' : ''),
  })), defaultCostume);
  $('traje').disabled = costumes.length < 2;

  st.weaponMaps = ssbp.cellMaps.map((m, i) => (/^weapon_/i.test(m.name) && !/effect/i.test(m.name) ? i : -1)).filter((i) => i >= 0);
  const weapons = files.filter((f) => /^weapon\d*_\d+\.png$/i.test(f));
  const currentWeapon = st.weaponMaps.length ? ssbp.cellMaps[st.weaponMaps[0]].imagePath.split('/').pop() : '';
  fillSelect($('arma'), weapons.map((f) => ({ value: f, label: f.replace(/\.png$/i, '') })), currentWeapon);
  $('arma').disabled = weapons.length < 2 || !st.weaponMaps.length;

  const packs = ssbp.packs.filter((p) => p.anims.length);
  const mainPack = packs.find((p) => p.name === dir) ?? packs.reduce((a, b) => (b.anims.length > a.anims.length ? b : a));
  fillSelect($('paquete'), packs.map((p) => ({ value: p.name, label: `${p.name} (${p.anims.length})` })), mainPack.name);
  selectPack(mainPack.name);
}

function selectPack(name) {
  st.pack = st.ssbp.packs.find((p) => p.name === name);
  const anims = st.pack.anims.filter((a) => a.numFrames > 0);
  const def = anims.find((a) => a.name === 'wait') ?? anims.find((a) => a.numFrames > 1) ?? anims[0];
  fillSelect($('anim'), anims.map((a) => ({ value: a.name, label: `${a.name} · ${a.numFrames}f` })), def.name);
  selectAnim(def.name);
}

function selectAnim(name) {
  st.anim = st.pack.anims.find((a) => a.name === name);
  st.time = 0;
  st.frame = 0;
  $('cuadro').max = st.anim.numFrames - 1;
  fit();
  const s = st.ssbp;
  setInfo(`ssbp v${s.version} · ${s.cells.length} celdas · ${s.cellMaps.length} texturas\n` +
    `${st.pack.parts.length} partes · ${st.anim.numFrames} cuadros a ${st.anim.fps} fps`);
}

// Encuadra la animación completa (muestrea todos los cuadros).
function fit() {
  if (!st.anim) return;
  let b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let f = 0; f < st.anim.numFrames; f += Math.max(1, Math.floor(st.anim.numFrames / 24))) {
    const fb = boundsOf(frameQuads(f));
    b = { minX: Math.min(b.minX, fb.minX), minY: Math.min(b.minY, fb.minY), maxX: Math.max(b.maxX, fb.maxX), maxY: Math.max(b.maxY, fb.maxY) };
  }
  if (!Number.isFinite(b.minX)) return;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const zoom = Math.min(canvas.width / (w * 1.25), canvas.height / (h * 1.25));
  renderer.view.zoom = zoom;
  renderer.view.x = -((b.minX + b.maxX) / 2) * zoom;
  renderer.view.y = -((b.minY + b.maxY) / 2) * zoom;
  $('zoom').value = zoom;
  $('zoomTxt').textContent = `${zoom.toFixed(2)}×`;
}

// ---- Bucle de dibujo ----
let last = performance.now();
function tick(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (st.anim && st.ssbp) {
    if (st.playing) {
      st.time += dt * st.speed;
      st.frame = Math.floor(st.time * st.anim.fps) % st.anim.numFrames;
      $('cuadro').value = st.frame;
    }
    const quads = frameQuads(st.frame);
    renderer.begin(BACKGROUNDS[st.bg]);
    renderer.drawQuads(quads);
    $('cuadroTxt').textContent = `${st.frame + 1} / ${st.anim.numFrames}`;
    $('hud').textContent = `${st.dir} · ${st.pack.name} / ${st.anim.name} · cuadro ${st.frame + 1}/${st.anim.numFrames} · ${quads.length} partes dibujadas`;
  }
  requestAnimationFrame(tick);
}

// ---- Controles ----
$('filtro').addEventListener('input', renderUnitList);
$('unidad').addEventListener('change', (e) => loadUnit(e.target.value));
$('paquete').addEventListener('change', (e) => selectPack(e.target.value));
$('anim').addEventListener('change', (e) => selectAnim(e.target.value));
$('traje').addEventListener('change', async (e) => {
  setTextures(st.bodyMaps, await loadImage(assetUrl(e.target.value)));
});
$('arma').addEventListener('change', async (e) => {
  const img = await loadImage(assetUrl(e.target.value));
  setTextures(st.weaponMaps, img);
});
$('velocidad').addEventListener('input', (e) => {
  st.speed = +e.target.value;
  $('velTxt').textContent = `${st.speed.toFixed(2)}×`;
});
$('cuadro').addEventListener('input', (e) => {
  st.playing = false;
  st.frame = +e.target.value;
  st.time = st.frame / st.anim.fps;
  $('play').classList.remove('on');
  $('play').textContent = '▶ Reproducir';
});
$('zoom').addEventListener('input', (e) => {
  const z = +e.target.value;
  const k = z / renderer.view.zoom;
  renderer.view.zoom = z;
  renderer.view.x *= k;
  renderer.view.y *= k;
  $('zoomTxt').textContent = `${z.toFixed(2)}×`;
});
$('play').addEventListener('click', () => {
  st.playing = !st.playing;
  $('play').classList.toggle('on', st.playing);
  $('play').textContent = st.playing ? '⏸ Pausa' : '▶ Reproducir';
});
$('voltear').addEventListener('click', () => {
  st.flipX = !st.flipX;
  $('voltear').classList.toggle('on', st.flipX);
  fit();
});
$('ajustar').addEventListener('click', fit);
$('fondo').addEventListener('click', () => { st.bg = (st.bg + 1) % BACKGROUNDS.length; });

// Arrastrar para mover la cámara.
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dpr = window.devicePixelRatio || 1;
  renderer.view.x += (e.clientX - drag.x) * dpr;
  renderer.view.y -= (e.clientY - drag.y) * dpr;
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { drag = null; });

resize();
loadUnitList().catch((e) => setInfo(e.message, true));
requestAnimationFrame(tick);
