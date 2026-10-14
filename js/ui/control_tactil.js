// D99: dibujo del control táctil del combate con los recursos originales.
// StickWidget (FUN_008ffec0, actualizado en FUN_008f6254/FUN_00900084/FUN_00900168/FUN_00900558):
//   images/controller/controller_background.png  anillo en el punto inicial; gira a 240°/s al aparecer y frena
//                                                 500°/s hasta 90°/s; escala 0.5 → 1 (0.5 cada 0.03 s)
//   images/controller/controller_1…4.png         anillos que entran desde escala 2 (0.4 s)
//   images/controller/controller_line.png        trazo hacia el dedo, ancla (0.846, 0.5)
//   opacidad: sube 200 cada 0.03 s hasta 200 al mostrarse; baja 200 cada 0.4 s al soltar.
//   Aparece al mover el dedo o tras 0.2 s; el extremo se mantiene a 30 px de los bordes (FUN_00900558).
// FlickWidget (FUN_008fcf00, FUN_008fd1f4): ss/ui/controller_flick, controller_flick_s/appear en el punto
//   final, girado según el deslizamiento; tres instancias que se turnan.
// PROVISIONAL: la colocación y escala exactas del trazo y la opacidad de cada anillo (tabla sin leer).
import {imagen} from './recursos.js';
import {loadSSBP} from '../character.js';
import {buildCharacterQuads} from '../renderer.js';
import {rendererUI, componerQuads} from './lienzo_ss.js';
import {DISENO} from './pantalla.js';

const ANILLOS = [1, 2, 3, 4];
const ALFA_ANILLO = [255, 220, 190, 160]; // PROVISIONAL
const GIRO_ANILLO = [90, -120, 150, -180]; // °/s, PROVISIONAL

export class VistaControl {
  static async cargar() {
    const [fondo, linea, ...anillos] = await Promise.all(['background', 'line', ...ANILLOS].map((n) => imagen(`images/controller/controller_${n}.png`)));
    const flick = await loadSSBP(rendererUI(), 'ss/ui/controller_flick', 'controller_flick.ssbp').catch(() => null);
    return new VistaControl({fondo, linea, anillos}, flick);
  }

  constructor(img, flick) {
    this.img = img;
    this.flick = flick;
    this.clip = flick && (() => {
      const pack = flick.ssbp.packs.find((p) => p.name === 'controller_flick_s');
      const animacion = pack?.anims.find((a) => a.name === 'appear');
      return animacion ? {pack, animacion} : null;
    })();
    this.stick = {visible: false, x: 0, y: 0, dx: 0, dy: 0, alfa: 0, escala: 0.5, giro: 0, velGiro: 240, tAnillos: 0};
    this.destellos = [];
  }

  /** Estado del dedo en diseño: { x0, y0, x, y, t } o null. */
  actualizar(dedo, dt) {
    const s = this.stick;
    if (dedo) {
      if (!s.visible && (dedo.t >= 0.2 || dedo.x !== dedo.x0 || dedo.y !== dedo.y0)) {
        Object.assign(s, {visible: true, x: dedo.x0, y: dedo.y0, escala: 0.5, velGiro: 240, tAnillos: 0});
      }
      if (s.visible) {
        // El extremo no se acerca a menos de 30 px de los bordes (FUN_00900558).
        s.dx = Math.min(DISENO.ancho - 30, Math.max(30, dedo.x)) - s.x;
        s.dy = Math.min(DISENO.alto - 30, Math.max(30, dedo.y)) - s.y;
      }
    } else if (s.visible) {
      s.visible = false;
      s.tAnillos = 0;
    }
    if (s.visible) {
      s.alfa = Math.min(200, s.alfa + (dt * 200) / 0.03);
      s.escala = Math.min(1, s.escala + (dt * 0.5) / 0.03);
      s.velGiro = Math.max(90, s.velGiro - (dt * 150) / 0.3);
    } else {
      s.alfa = Math.max(0, s.alfa - (dt * 200) / 0.4);
      s.velGiro = Math.min(240, s.velGiro + (dt * 150) / 0.2);
    }
    s.giro += s.velGiro * dt;
    s.tAnillos += dt;
    for (const d of this.destellos) d.t += dt;
    this.destellos = this.destellos.filter((d) => d.t < this.duracionFlick());
  }

  duracionFlick() { return this.clip ? this.clip.animacion.numFrames / this.clip.animacion.fps : 0; }

  /** Deslizamiento terminado (FUN_008fd1f4): destello en el punto final, girado hacia donde va. */
  deslizar(x0, y0, x1, y1) {
    if (!this.clip) return;
    this.destellos.push({x: x1, y: y1, giro: Math.atan2(y1 - y0, x1 - x0), t: 0});
    if (this.destellos.length > 3) this.destellos.shift();
  }

  /** Dibuja en el canvas del HUD (px del dispositivo); k = píxeles por unidad de diseño. */
  dibujar(ctx, k) {
    const s = this.stick, {fondo, linea, anillos} = this.img;
    ctx.save();
    if (s.alfa > 0) {
      const a = s.alfa / 255, px = s.x * k, py = s.y * k;
      // Anillos: entran desde escala 2 en 0.4 s al aparecer y salen hacia 2 al soltar.
      const p = Math.min(1, s.tAnillos / 0.4), ease = 1 - (1 - p) * (1 - p);
      const esc = s.visible ? 2 - ease : 1 + p * p;
      anillos.forEach((im, i) => {
        if (!im) return;
        ctx.setTransform(k * esc, 0, 0, k * esc, px, py);
        ctx.rotate((s.giro * GIRO_ANILLO[i] / 90) * Math.PI / 180);
        ctx.globalAlpha = a * (ALFA_ANILLO[i] / 255) * (s.visible ? ease : 1 - p);
        ctx.drawImage(im, -im.width / 2, -im.height / 2);
      });
      if (fondo) {
        ctx.setTransform(k * s.escala, 0, 0, k * s.escala, px, py);
        ctx.rotate((s.giro * Math.PI) / 180);
        ctx.globalAlpha = a;
        ctx.drawImage(fondo, -fondo.width / 2, -fondo.height / 2);
      }
      const dist = Math.hypot(s.dx, s.dy);
      if (linea && dist > 1) {
        ctx.setTransform(k, 0, 0, k, (s.x + s.dx) * k, (s.y + s.dy) * k);
        ctx.rotate(Math.atan2(s.dy, s.dx));
        ctx.globalAlpha = a;
        // El ancla (0.846, 0.5) queda en el dedo; el trazo, hacia el punto inicial y sin pasar de él.
        const largo = Math.min(linea.width * 0.846, dist);
        ctx.drawImage(linea, linea.width * 0.846 - largo, 0, largo + linea.width * 0.154, linea.height,
          -largo, -linea.height / 2, largo + linea.width * 0.154, linea.height);
      }
    }
    ctx.restore();
    if (!this.destellos.length) return;
    const {pack, animacion} = this.clip, quads = [];
    for (const d of this.destellos) {
      const cuadro = Math.min(animacion.numFrames - 1, Math.floor(d.t * animacion.fps));
      const c = Math.cos(d.giro), sn = Math.sin(d.giro);
      for (const q of buildCharacterQuads(this.flick.ssbp, this.flick.textures, pack, animacion, cuadro, {matrix: [1, 0, 0, 1, 0, 0], particles: true})) {
        // SpriteStudio tiene y hacia arriba; el lienzo, hacia abajo.
        q.pts = q.pts.map(([x, y]) => [(d.x + x * c + y * sn) * k, (d.y + x * sn - y * c) * k]);
        quads.push(q);
      }
    }
    if (quads.length) componerQuads(ctx, quads);
  }
}
