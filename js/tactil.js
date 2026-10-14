// D99: controles táctiles del combate como PlayerControllerLayer (FUN_008f4fec y su update FUN_008f5360).
// El original sigue un solo dedo; las distancias van en píxeles de diseño (750 × 1334): FUN_008f52f0
// convierte con la misma escala la distancia del toque y los umbrales, así que se comparan como diseño.
//
//   radioToque 50 (+0x2ec)   el dedo no se ha separado del punto inicial (toque o mantener quieto)
//   caminar 30 (+0x2f4)      arrastre más largo: caminar (FUN_008f56b0)
//   correr 120 (+0x2f0)      arrastre más largo: correr
//   tiempoToque 0.2 s        DAT_008f6b18: soltar antes es un toque o un deslizamiento (FUN_008f6990)
//   tiempoMantener 0.2 s     DAT_008f5980: quieto tanto tiempo = guardia (o carga con rifle/arco/vara)
//   cono 50°–130°            DAT_008f6b1c/6b20: ángulo con (−1, 0); dentro, el deslizamiento es vertical
//
// Al soltar (FUN_008f6990 → FUN_008f6b58):
//   rápido y dentro del radio                → toque (ataque; también en el aire)
//   rápido y fuera, vertical hacia arriba    → salto con la dirección del deslizamiento (FUN_008f6d24)
//   rápido y fuera, vertical hacia abajo     → en el aire, Head Splitter; en el suelo, paso en diagonal
//                                              hacia la cámara en el borde del cono (FUN_008f6d58)
//   rápido y fuera, lateral                  → paso: hacia donde mira = step (motion 5); al revés = back_step (6)
//   tras mantener y fuera del radio          → con la guardia puesta, parada (motion 30, FUN_008f6b58 caso 7)
//   tras mantener quieto                     → suelta la guardia o la carga
// Un segundo dedo cancela el gesto (FUN_008f63a0, +0x25a): el personaje se detiene.
export const GESTOS = Object.freeze({
  radioToque: 50,
  caminar: 30,
  correr: 120,
  tiempoToque: 0.2,
  tiempoMantener: 0.2,
  conoMin: 50 * Math.PI / 180, // 0.8726646 rad
  conoMax: 130 * Math.PI / 180, // 2.2689280 rad
});

/** Armas que cargan al mantener (FUN_008f56b0: 0x430 = 6, 7, 8 u 11) en lugar de cubrirse. */
export const ARMAS_CARGA = new Set([6, 7, 8, 11]);

// Ángulo entre (−1, 0) y (dx, dyGL) con y hacia arriba, como FUN_00df4e74.
const anguloDesdeIzquierda = (dx, dyGL) => Math.acos(Math.max(-1, Math.min(1, -dx / (Math.hypot(dx, dyGL) || 1))));

/**
 * Clasifica el final de un toque. `dx`, `dy` en diseño con y hacia abajo (pantalla); `t` en segundos;
 * `maximo` = mayor separación alcanzada; `quieto` = nunca salió del radio.
 * Devuelve { tipo: 'toque' | 'arriba' | 'abajo' | 'lado' | 'soltarMantener' | 'soltarArrastre' | null, dx, dy }.
 */
export function clasificarFin({ dx, dy, t, maximo, quieto }, g = GESTOS) {
  const dist = Math.hypot(dx, dy);
  const rapido = t < g.tiempoToque;
  if (rapido && maximo < g.radioToque) return { tipo: 'toque', dx, dy };
  if (!rapido && quieto) return { tipo: 'soltarMantener', dx, dy };
  if (rapido) {
    if (dist <= g.radioToque) return { tipo: null, dx, dy };
    const dyGL = -dy, a = anguloDesdeIzquierda(dx, dyGL);
    if (a > g.conoMin && a < g.conoMax) return { tipo: dyGL < 0 ? 'abajo' : 'arriba', dx, dy };
    return { tipo: 'lado', dx, dy };
  }
  return dist > g.radioToque ? { tipo: 'soltarArrastre', dx, dy } : { tipo: null, dx, dy };
}

/**
 * Dirección del paso al deslizar hacia abajo en el suelo (FUN_008f6d58): el vector se lleva al borde del
 * cono más cercano (50° o 130° desde la izquierda), hacia la cámara. Devuelve [x, z] unitario del mundo.
 */
export function pasoDiagonal(dx, g = GESTOS) {
  const lado = dx > 0 ? 1 : -1;
  return [lado * Math.cos(g.conoMin), -Math.sin(g.conoMin)];
}

/**
 * Reconocedor de gestos de un dedo. Las coordenadas que recibe ya están en diseño (y hacia abajo).
 * Cada cuadro, `cuadro(dt)` devuelve lo que ha pasado: { ejes, mantener, eventos }.
 *   ejes      { x, z, correr } mientras se arrastra (x a la derecha, z hacia el fondo); null = quieto
 *   mantener  true desde que el dedo lleva 0.2 s quieto hasta que se suelta (guardia o carga)
 *   eventos   gestos terminados en este cuadro (clasificarFin)
 */
export class ReconocedorTactil {
  constructor(g = GESTOS) {
    this.g = g;
    this.dedo = null; // { id, x0, y0, x, y, t, maximo, quieto, mantener }
    this.cancelado = new Set(); // dedos que ya no cuentan tras un segundo dedo
    this.pendientes = [];
    this.ultimo = null;
  }

  get activo() { return this.dedo; }

  /** `mira` = hacia dónde mira el personaje al empezar (+0x298, FUN_008f567c): decide step o back_step. */
  empezar(id, x, y, mira = 1) {
    if (this.dedo) { // segundo dedo: se cancela el gesto en curso (+0x25a)
      this.cancelado.add(this.dedo.id);
      this.cancelado.add(id);
      this.dedo = null;
      this.pendientes.push({ tipo: 'cancelar', dx: 0, dy: 0 });
      return;
    }
    this.dedo = { id, x0: x, y0: y, x, y, t: 0, maximo: 0, quieto: true, mantener: false, mira };
  }

  mover(id, x, y) {
    const d = this.dedo;
    if (!d || d.id !== id) return;
    d.x = x; d.y = y;
    const dist = Math.hypot(x - d.x0, y - d.y0);
    d.maximo = Math.max(d.maximo, dist);
    if (dist > this.g.radioToque) d.quieto = false; // FUN_008f54ac: +0x25c a 0
  }

  terminar(id, x, y) {
    if (this.cancelado.delete(id)) return;
    const d = this.dedo;
    if (!d || d.id !== id) return;
    if (x != null) this.mover(id, x, y);
    this.dedo = null;
    this.ultimo = d; // para dibujar el destello del deslizamiento
    const fin = clasificarFin({ dx: d.x - d.x0, dy: d.y - d.y0, t: d.t, maximo: d.maximo, quieto: d.quieto }, this.g);
    if (fin.tipo) this.pendientes.push({ ...fin, mira: d.mira });
    else if (d.mantener) this.pendientes.push({ tipo: 'soltarMantener', dx: fin.dx, dy: fin.dy });
  }

  cancelar(id) {
    if (this.cancelado.delete(id)) return;
    if (this.dedo?.id !== id) return;
    this.dedo = null;
    this.pendientes.push({ tipo: 'cancelar', dx: 0, dy: 0 });
  }

  cuadro(dt) {
    const d = this.dedo;
    let ejes = null;
    if (d) {
      d.t += dt;
      if (!d.mantener && d.quieto && d.t >= this.g.tiempoMantener) d.mantener = true;
      const dx = d.x - d.x0, dy = d.y - d.y0, dist = Math.hypot(dx, dy);
      // Con la guardia o la carga puestas el arrastre no mueve (guardia en marcha sin portar).
      if (!d.mantener && dist > this.g.caminar) ejes = { x: dx / dist, z: -dy / dist, correr: dist > this.g.correr };
    }
    const eventos = this.pendientes;
    this.pendientes = [];
    return { ejes, mantener: Boolean(d?.mantener), eventos };
  }
}
