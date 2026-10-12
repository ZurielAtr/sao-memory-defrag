import { rutaWeb } from './rutas.js';
// Personaje animado del juego: carga un .ssbp con sus texturas, maneja la animación actual y
// el movimiento de raíz. En las animaciones del juego la parte `root` lleva el desplazamiento
// lógico (p. ej. attack_1 la mueve +240 px) y `all_objects` lo compensa en el dibujo; por eso
// la posición lógica es base + root.x, y al cambiar de animación se ajusta la base para que
// no haya saltos (attack_2 empieza donde terminó de avanzar attack_1).
//
// Un .ssbp trae varios paquetes (el principal, wait_*, skill_*...), cada uno con su propio
// esqueleto; las animaciones se buscan por nombre en todos, con prioridad del principal.

import { parseSSBP, decodeFrame } from './ssbp.js';
import { buildCharacterQuads, POSITION_SCALE } from './renderer.js';
import { sonidosCruzados } from './audio/eventos.js';

const api = async (path) => (await fetch(rutaWeb(`/api/ls?path=${encodeURIComponent(path)}`))).json();

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    img.src = url;
  });
}

// Carga un .ssbp y las texturas de sus cellMaps desde una carpeta de los recursos.
// override(cellMap, índice, archivo) -> URL de imagen que reemplaza a la original, o null.
export async function loadSSBP(renderer, folder, ssbpName, override = () => null) {
  const url = (f) => rutaWeb(`/assets/${folder}/${encodeURIComponent(f)}`);
  const { files } = await api(folder);
  const ssbpFile = ssbpName ?? files.find((f) => f.endsWith('.ssbp'));
  const ssbp = parseSSBP(await (await fetch(url(ssbpFile))).arrayBuffer());
  const textures = new Map();
  const cache = new Map(); // una sola textura por archivo, aunque varios cellMaps la usen
  await Promise.all(ssbp.cellMaps.map(async (m, i) => {
    const file = m.imagePath.split('/').pop();
    const src = override(m, i, file) ?? (files.includes(file) ? url(file) : null);
    if (!src) return;
    if (!cache.has(src)) cache.set(src, loadImage(src).then((img) => renderer.createTexture(img)).catch(() => null));
    const tex = await cache.get(src);
    if (tex) textures.set(i, tex);
  }));
  return { ssbp, textures, files };
}

export class Character {
  // opts.costume: PNG del traje (por defecto el primero que no sea la plantilla de guía).
  static async load(renderer, dir, opts = {}) {
    const folder = `ss/unit/${dir}`;
    const { files } = await api(folder);
    const ssbpFile = files.find((f) => f.toLowerCase() === `${dir.toLowerCase()}.ssbp`) ?? files.find((f) => f.endsWith('.ssbp'));
    const costumes = files.filter((f) => /^\d+_.+\.png$/i.test(f) && !/_sprite\.png$/i.test(f));
    const costume = opts.costume && files.includes(opts.costume) ? opts.costume : costumes[0];
    // El cuerpo usa la plantilla de guía (0_*_sprite.png), y puede aparecer en varios cellMaps
    // (paquete principal, skills...). Si no hay plantilla, el cuerpo es el cellMap 0.
    const hasTemplate = files.some((f) => /_sprite\.png$/i.test(f));
    const isBody = (i, file) => (hasTemplate ? /_sprite\.png$/i.test(file) : i === 0);
    const { ssbp, textures } = await loadSSBP(renderer, folder, ssbpFile, (m, i, file) =>
      (costume && isBody(i, file) ? rutaWeb(`/assets/${folder}/${encodeURIComponent(costume)}`) : null));
    const packs = ssbp.packs.filter((p) => p.anims.length);
    const main = packs.find((p) => p.name === dir) ?? packs.reduce((a, b) => (b.anims.length > a.anims.length ? b : a));
    const ch = new Character(ssbp, main, textures, opts);
    ch.unit = dir;
    ch.costume = costume;
    return ch;
  }

  constructor(ssbp, mainPack, textures, opts = {}) {
    this.ssbp = ssbp;
    this.mainPack = mainPack;
    this.pack = mainPack;
    this.textures = textures;
    this.scale = opts.scale ?? 1;

    this.entries = new Map();
    for (const p of ssbp.packs) {
      if (p === mainPack) continue;
      for (const a of p.anims) if (!this.entries.has(a.name)) this.entries.set(a.name, { pack: p, anim: a });
    }
    for (const a of mainPack.anims) this.entries.set(a.name, { pack: mainPack, anim: a });
    // Sword skills: paquetes skill_<id> con una animación del mismo nombre.
    this.skills = ssbp.packs
      .filter((p) => /^skill_\d+$/.test(p.name) && p.anims.some((a) => a.name === p.name))
      .map((p) => p.name);
    this.rootMotion = new Map();

    this.baseX = 0;
    this.y = 0;
    this.dir = 1; // 1 = mirando a la derecha
    this.alpha = 1;
    this.anim = null;
    this.time = 0;
    this.frame = 0;
    this.loop = false;
    this.done = false;

    // Hacia dónde mira el arte original: según el avance de su primer ataque.
    const atk = this.rootMotionOf('attack_1');
    const peak = atk ? atk.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0) : 0;
    this.artFacing = peak < 0 ? -1 : 1;
  }

  has(name) {
    return this.entries.has(name);
  }

  // x del root por cuadro (px), en la orientación original del arte.
  rootMotionOf(name) {
    if (this.rootMotion.has(name)) return this.rootMotion.get(name);
    const e = this.entries.get(name);
    if (!e) return null;
    const rootIndex = e.pack.parts.findIndex((p) => p.parent < 0);
    const xs = new Float32Array(e.anim.numFrames);
    for (let f = 0; f < e.anim.numFrames; f++) {
      const st = decodeFrame(this.ssbp, e.pack, e.anim, f).find((s) => s.partIndex === rootIndex);
      xs[f] = st ? st.x * POSITION_SCALE : 0;
    }
    this.rootMotion.set(name, xs);
    return xs;
  }

  // Desplazamiento de raíz en el mundo para el cuadro actual (según hacia dónde mira).
  get rootOffset() {
    if (!this.anim) return 0;
    return this.rootMotionOf(this.anim.name)[this.frame] * this.scale * this.artFacing * this.dir;
  }

  // Posición lógica (para cámara, distancias y golpes).
  get x() {
    return this.baseX + this.rootOffset;
  }

  set x(v) {
    this.baseX = v - this.rootOffset;
  }

  play(name, { loop = false, restart = false } = {}) {
    const e = this.entries.get(name);
    if (!e) return false;
    if (this.anim === e.anim && !restart) {
      this.loop = loop;
      return true;
    }
    const keep = this.x;
    this.pack = e.pack;
    this.anim = e.anim;
    this.time = 0;
    this.frame = 0;
    this.loop = loop;
    this.done = false;
    this.x = keep; // continuidad: la nueva animación arranca donde estaba el personaje
    this.alAnimar?.(name);
    this.emitirSonidos(-1, 0);
    return true;
  }

  emitirSonidos(antes, ahora) {
    const ev = this.eventosAudio?.[this.anim?.name];
    if (!ev?.sonidos?.length || !this.alSonido) return;
    const fps = ev.fps ?? this.anim.fps;
    const n = this.anim.numFrames * fps / this.anim.fps;
    for (const s of sonidosCruzados(ev.sonidos, antes < 0 ? -1 : antes * fps, ahora * fps, n, this.loop)) this.alSonido(s.id, s.tipo);
  }

  // Cambia hacia dónde mira sin mover la posición lógica.
  face(dir) {
    if (dir === this.dir) return;
    const keep = this.x;
    this.dir = dir;
    this.x = keep;
  }

  update(dt) {
    if (!this.anim) return;
    const n = this.anim.numFrames;
    const antes = this.time;
    this.time = Math.max(0, this.time + dt);
    this.emitirSonidos(antes, this.time);
    let f = Math.floor(this.time * this.anim.fps);
    if (f >= n) {
      if (this.loop) {
        const keep = this.x;
        this.time %= n / this.anim.fps;
        this.frame = Math.floor(this.time * this.anim.fps) % n;
        this.x = keep;
        return;
      }
      f = n - 1;
      this.done = true;
    }
    this.frame = f;
  }

  // Fracción recorrida de la animación actual (0..1).
  get progress() {
    return this.anim ? this.frame / Math.max(1, this.anim.numFrames - 1) : 0;
  }

  quads() {
    if (!this.anim) return [];
    if (!(this.frame >= 0 && this.frame < this.anim.numFrames)) {
      console.warn('cuadro fuera de rango', this.unit, this.anim.name, this.frame, this.anim.numFrames);
      this.frame = Math.max(0, Math.min(this.anim.numFrames - 1, this.frame | 0));
    }
    return buildCharacterQuads(this.ssbp, this.textures, this.pack, this.anim, this.frame, {
      x: this.baseX,
      y: this.y,
      scale: this.scale,
      flipX: this.dir !== this.artFacing,
      alpha: this.alpha,
    });
  }
}
