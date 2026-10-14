// D106: campo de batalla como FieldHorizontal (vtable 0x014adcd0; base Field 0x014ad964).
// Fondo por capas de background.json (data/fondos.json) y cámara del original.
//
// Coordenadas:
//  - Fondo (px): las de background.json. El campo (capa tipo 1, f3 = 1) es el nodo donde están las unidades;
//    su contenido mide ancho × profundidad (f2 × f3) y está en pos = (f7, f8).
//  - Campo (px): relativo al nodo del campo. Una unidad en (x, y, z) del juego queda en
//    ((x + z·A)·1.82, (y − z·0.7071)·1.82) (FUN_00819570/00819784; A = 0 en combate, FUN_0089e6cc(0) en
//    FUN_007167a0 y FUN_00705534). Aquí z > 0 es «más lejos» (el juego usa −z), así que y = (alt + z·0.7071)·1.82.
//  - Mundo del port: unidades del juego (el arte de los personajes a 1/1.82). Fondo (bx, by) ↔ mundo
//    ((bx − fx)/1.82, suelo + (by − fy)/1.82), con (fx, fy) la posición del campo.
//
// Cámara (FieldHorizontal): el punto (cx, cy) del campo queda en el centro de la pantalla de 750 × 1334 con
// escala s (FUN_0081a00c). Cada cuadro (FUN_00816c7c): objetivo (FUN_0081935c + FUN_00819570), límites
// (FUN_00819384), avance (FUN_00819d38, k = 5 por segundo, sin pasarse) y límites otra vez.

export const CAMPO = {
  pixelesPorUnidad: 1.82,   // DAT_0081977c
  coseno: 0.70710677,       // −DAT_00819778
  seguimiento: 5,           // Field +0x2ec = 5.0 (FUN_0081803c)
  adelanto: 0.2,            // DAT_00819770: el objetivo va 0.2 pantallas por delante de la unidad
  pantalla: [750, 1334],
  negro: 'images/background/common/bg_black.jpg', // FUN_0081860c (capas con f15)
};

/** Escalas de la cámara (FUN_008171ac/0081720c/008173fc/008174a0). La del escenario gana si no es 0.
 *  Con CAMERA_WORK = 1 (valor inicial de los ajustes, FUN_006089d4) la base es f22 del escenario o f5 del fondo. */
export function escalasCamara(fondo, camara = null) {
  const min = camara?.min || fondo.escalaMin || 1;
  const max = camara?.max || fondo.escalaMax || 1;
  let base = camara?.base || fondo.escala || 1;
  if (min <= base) { if (max < base) base = max; } else base = min; // FUN_008174a0
  return { base, min, max };
}

/** Limita {x, y, s} (cámara en px del campo) como FUN_00819384. `g` = geometría del fondo. */
export function limitarCamara(p, g) {
  const [mx, my] = [CAMPO.pantalla[0] / 2, CAMPO.pantalla[1] / 2];
  if (p.s < g.min) p.s = g.min; else if (g.max < p.s) p.s = g.max;
  const s = p.s, [fx, fy] = g.campo;
  // Horizontal: el campo cubre la pantalla (P240.x = 0).
  const bx = s * fx;
  let c = bx + s * p.x;
  if (c < mx) c = mx;
  else { const tope = s * g.ancho - mx; if (mx < tope && tope < c) c = tope; }
  p.x = (c - bx) / s;
  // Vertical: P240.y = fy + profundidad (FUN_00818244 con la escala de pantalla 1). El borde superior del
  // fondo (alto = f4) no baja de la parte superior de la pantalla; si no cabe, gana el límite inferior.
  const by = g.p240 + s * fy;
  const q = by + s * p.y;
  let r = my;
  if (!(q < my)) { const tope = g.p240 + s * g.alto - my; r = q; if (tope < q) { r = tope; if (tope <= my) r = my; } }
  p.y = (r - by) / s;
  return p;
}

export class CamaraCampo {
  constructor(fondo, camara = null) {
    const campo = fondo.capas?.find((c) => c.tipo === 1);
    const esc = escalasCamara(fondo, camara);
    this.g = {
      ...esc, ancho: fondo.ancho, alto: fondo.alto || CAMPO.pantalla[1], campo: campo?.pos ?? [0, 0],
      p240: (campo?.pos?.[1] ?? 0) + (fondo.profundidad ?? 0),
    };
    this.actual = null;
    this.objetivo = null;
  }

  /** Objetivo para una unidad en (x, y) px del campo que mira a `dir` (FUN_0081935c + FUN_00819570). */
  calcularObjetivo(u) {
    const o = limitarCamara({ x: this.objetivo?.x ?? u.x, y: this.objetivo?.y ?? u.y, s: this.g.base }, this.g);
    let adelanto = 0;
    if (u.activo) {
      adelanto = (CAMPO.pantalla[0] / o.s) * (u.dir < 0 ? -1 : 1);
      const lim = (CAMPO.adelanto * CAMPO.pantalla[0]) / o.s;
      adelanto = Math.max(-lim, Math.min(lim, adelanto));
    }
    o.x = u.x + adelanto;
    o.y = u.y;
    return o;
  }

  /** Coloca la cámara de golpe sobre la unidad (FUN_0081771c). */
  fijar(u) {
    this.actual = limitarCamara({ x: u.x, y: u.y, s: this.g.base }, this.g);
    this.objetivo = { ...this.actual };
  }

  /** Un cuadro de la cámara (FUN_00816c7c con el seguimiento en modo 2). */
  actualizar(dt, u) {
    if (!this.actual) this.fijar(u);
    this.objetivo = limitarCamara(this.calcularObjetivo(u), this.g);
    const k = CAMPO.seguimiento * dt, a = this.actual, o = this.objetivo;
    for (const c of ['s', 'x', 'y']) { // FUN_00819d38: avanza sin pasarse
      const d = o[c] - a[c];
      const n = a[c] + d * k;
      a[c] = d > 0 ? Math.min(n, o[c]) : d < 0 ? Math.max(n, o[c]) : a[c];
    }
    limitarCamara(a, this.g);
    return a;
  }

  /** Posición del nodo de paralaje respecto de P240 (FUN_0081a00c). */
  paralaje(cam = this.actual) {
    const [mx, my] = [CAMPO.pantalla[0] / 2, CAMPO.pantalla[1] / 2], [fx, fy] = this.g.campo;
    return [mx - cam.s * (fx + cam.x), my - (this.g.p240 + cam.s * (fy + cam.y))];
  }
}

/** Mosaicos de una capa de imagen (FUN_008185cc): [{dx, dy, escala, volteo}] respecto de su posición.
 *  `t` = tamaño de la textura; `min` = escala mínima de la cámara (la vista más amplia). */
export function mosaicos(capa, t, g) {
  const [W, H] = CAMPO.pantalla, [f7, f8] = capa.pos, [f9, f10] = capa.paralaje, alto = g.alto, ancho = g.ancho;
  if (capa.modo === 2) { // estirada para cubrir el recorrido (sin f13/f14)
    let sx = 1, sy = 1;
    if (capa.mosaico === 2 || capa.mosaico === 4) sx = Math.max((W - f7) / g.min, (ancho - f7) * f9) / t.w;
    if (capa.mosaico === 3 || capa.mosaico === 4) sy = Math.max((H - f8) / g.min, (alto - f8) * f10) / t.h;
    return [{ dx: 0, dy: 0, escala: [sx, sy], volteo: [false, false] }];
  }
  if (capa.modo < 3 || capa.modo > 6) return [{ dx: 0, dy: 0, escala: capa.escala, volteo: [false, false] }];
  const [ex, ey] = capa.escala, tw = t.w * ex, th = t.h * ey;
  if (!tw || !th) return [];
  let nx = 1, ny = 1;
  const ancho0 = () => {
    const v = W / g.min, a = (W - f7) / g.min, b = v + f9 * (ancho - (f7 + v));
    return Math.max(a, b);
  };
  const alto0 = () => Math.max((H - f8) / g.min, (alto - f8) * f10);
  if (capa.mosaico === 2) nx = Math.ceil(ancho0() / tw);
  else if (capa.mosaico === 3) ny = Math.ceil(alto0() / th);
  else if (capa.mosaico === 4) { nx = Math.ceil(ancho0() / tw) + 1; ny = Math.ceil(alto0() / th); }
  if (nx < 1 || ny < 1) return [];
  const u = capa.modo - 4; // 4: voltea columnas y filas impares; 5: columnas; 6: filas
  const volteaX = u === 0 || u === 1, volteaY = u === 0 || u === 2;
  const out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    out.push({ dx: i * tw, dy: j * th, escala: [ex, ey], volteo: [volteaX && i % 2 === 1, volteaY && j % 2 === 1] });
  }
  return out;
}

/** Sprites del fondo en orden de dibujo (zOrder f4 y luego orden de llegada, como cocos2d).
 *  Cada uno: {capa, ruta, ancla, escala, volteo, offset, ratio, z, n}; el campo va como {campo: true}. */
export function spritesFondo(fondo, tamanos, g) {
  const out = [];
  let n = 0;
  for (const capa of fondo.capas ?? []) {
    if (capa.tipo === 1) { out.push({ campo: true, z: capa.z, n: n++, offset: capa.pos, ratio: capa.paralaje }); continue; }
    if (!capa.archivo || !capa.carpeta) continue;
    const ruta = `images/background/${capa.carpeta}/${capa.archivo}`, t = tamanos[ruta];
    if (t?.w && t?.h) {
      for (const m of mosaicos(capa, t, g)) {
        out.push({ ruta, ancla: capa.ancla, escala: m.escala, volteo: m.volteo, z: capa.z, n: n++,
          offset: [capa.pos[0] + m.dx, capa.pos[1] + m.dy], ratio: capa.paralaje });
      }
    }
    if (capa.negro) { // FUN_0081860c: bg_black estirado a ancho × alto, ancla (0, 1) (Vec2 en 0x1580c48), sigue sólo en y
      const tn = tamanos[CAMPO.negro];
      if (tn?.w && tn?.h) out.push({ ruta: CAMPO.negro, ancla: [0, 1], escala: [g.ancho / tn.w, g.alto / tn.h], volteo: [false, false],
        z: capa.z, n: n++, offset: [0, capa.pos[1]], ratio: [0, capa.paralaje[1]] });
    }
  }
  return out.sort((a, b) => a.z - b.z || a.n - b.n);
}

/** Rectángulo en px del fondo (sin paralaje aplicado aún) de un sprite colocado en (lx, ly). */
export function rectSprite(sp, t, lx, ly) {
  const w = t.w * sp.escala[0], h = t.h * sp.escala[1];
  return { x: lx - sp.ancla[0] * w, y: ly - sp.ancla[1] * h, w, h };
}

/** Posición del sprite en el nodo de paralaje (FUN_0081e5e0): offset + pos·(ratio − 1)/escala. */
export function posicionParalaje(sp, par, s) {
  return [sp.offset[0] + (par[0] * (sp.ratio[0] - 1)) / s, sp.offset[1] + (par[1] * (sp.ratio[1] - 1)) / s];
}
