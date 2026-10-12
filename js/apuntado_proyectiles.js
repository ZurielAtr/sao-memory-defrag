// Gestor del evento 57: funciones puras confirmadas en Ghidra (D73).
// Las posiciones de este módulo usan altura física sobre el suelo, sin proyección de dibujo.
const RAD = Math.PI / 180;

/** FUN_00856748: ángulo de la caja en radianes, reflejado según dirección lógica. */
export function anguloInicial57(anguloCaja, dir) {
  const rad = -(anguloCaja ?? 0) * RAD;
  return dir < 0 ? Math.PI - rad : rad;
}

/** FUN_005e3f08: solo los modos 1 y 2 son válidos; conserva la salida local del emisor. */
export function configurarApuntado57(disparo, emisor, salida, anterior = null) {
  return Object.assign(anterior ?? {
    objetivo: null, vector: [0, 0, 0], angulo: 0, tiempoObjetivo: 0,
  }, {
    bala: disparo.bala,
    modo: disparo.f4 === 1 || disparo.f4 === 2 ? disparo.f4 : 0,
    offset: [salida.x - emisor.x, salida.y - emisor.y, 0],
    anguloInicial: anguloInicial57(salida.angulo ?? disparo.punto?.[2] ?? 0, emisor.dir ?? 1),
  });
}

/** FUN_005e40a4/005e44e0: centro del objetivo; f51 fuerza la altura absoluta a cero. */
export function vectorObjetivo57(origen, objetivo, { alto, apuntarSuelo = false }) {
  return [objetivo.x - origen.x, (apuntarSuelo ? 0 : objetivo.y + alto / 2) - origen.y,
    (objetivo.z ?? 0) - (origen.z ?? 0)];
}

/** FUN_005e45b8: rayo de alcance; si termina bajo el suelo, recórtalo en y=0. */
export function vectorSinObjetivo57(origen, angulo, alcance) {
  let vx = alcance * Math.cos(angulo), vy = alcance * Math.sin(angulo);
  if (origen.y + vy < 0) {
    // 00df53ec intersecta líneas infinitas: no restringe sus parámetros a [0,1].
    // Si son paralelas, 00df5734 devuelve (0,0), que 005e45b8 resta al origen.
    vx = vy === 0 ? -origen.x : vx * (-origen.y / vy);
    vy = -origen.y;
  }
  return [vx, vy, 0];
}

/** FUN_005e3f34: dirección que se dibuja tras proyectar profundidad a altura. */
export function anguloProyectado57([vx, vy, vz], proyeccionX = 0.49512147903442383) {
  // FUN_0089e6b8 lee el coeficiente mutable; el valor inicial de 0158f74c es este literal.
  return Math.atan2((vy - Math.SQRT1_2 * vz) * 1.82, (vx + vz * proyeccionX) * 1.82);
}

/** FUN_005e4700: primer disparo tipo 4 de la animación cuya bala tiene f33 distinto de cero. */
export function alcanceApuntado57(disparos, balas) {
  for (const disparo of disparos ?? []) {
    if (disparo.tipo !== 4) continue;
    const alcance = balas[disparo.bala]?.alcance;
    if (alcance) return alcance;
  }
  return 3000; // literal DAT_005e47e0, confirmado también en el listado ARM.
}

// cocos2d::Vec2::getAngle (FUN_00df4e74): unsigned; el epsilon evita atan2(0,0).
function anguloEje57(x, otro, dir) {
  return Math.atan2(Math.abs(otro) + 1e-37, x * dir);
}

/** FUN_005e41a0/005e4270: las dos tolerancias se consultan por separado. */
export function tolerancias57(estado, vector, ficha, dir) {
  const fis = ficha?.fisica ?? {};
  return {
    z: anguloEje57(vector[0], vector[2], dir) < (fis.apuntarZ ?? 0) * RAD,
    // El original convierte otra vez +0x20 con RAD, aunque 00856748 ya lo guardó en radianes.
    y: Math.abs(anguloEje57(vector[0], vector[1], dir) + estado.anguloInicial * RAD) < (fis.apuntarY ?? 0) * RAD,
  };
}

/** FUN_005e4078: preferido dentro del alcance/tolerancia; si no, intersección con el rayo inicial.
 * `geometria(u)` devuelve {x,y,z,ancho,alto,profundidad} ya medidos en unidades físicas del mundo.
 * `candidatos` debe contener solo rivales vivos, visibles y aptos, como la lista original del gestor.
 */
export function seleccionarObjetivo57(estado, emisor, candidatos, { ficha, alcance, geometria, preferido = null }) {
  const origen = { x: emisor.x + estado.offset[0], y: emisor.y + estado.offset[1], z: (emisor.z ?? 0) + estado.offset[2] };
  if (estado.bala && preferido) {
    const g = geometria(preferido);
    const v = vectorObjetivo57(origen, g, { alto: g.alto, apuntarSuelo: ficha?.fisica?.apuntarSuelo });
    const t = tolerancias57(estado, v, ficha, emisor.dir ?? 1);
    // Listado ARM 005e4894: la aceptación del preferido usa Z O Y, no ambas a la vez.
    if (Math.hypot(...v) <= alcance && (t.z || t.y)) return preferido;
  }
  const rx = alcance * Math.cos(estado.anguloInicial), ry = alcance * Math.sin(estado.anguloInicial);
  let mejor = null, distancia = Infinity;
  if (!rx) return mejor; // segmento vertical del objetivo paralelo al rayo.
  for (const u of candidatos) {
    const g = geometria(u);
    if (Math.abs((g.z ?? 0) - origen.z) > g.profundidad / 2) continue;
    const t = (g.x - origen.x) / rx, y = origen.y + t * ry;
    if (g.x === 0 && y === 0) continue; // Vec2::lineIntersection usa (0,0) como no intersección.
    if (g.x < Math.min(origen.x, origen.x + rx) - 1 || g.x > Math.max(origen.x, origen.x + rx) + 1 ||
      y < Math.min(origen.y, origen.y + ry) - 1 || y > Math.max(origen.y, origen.y + ry) + 1) continue;
    const extra = g.ancho * Math.sin(estado.anguloInicial) / 2;
    const inicio = g.y - extra, fin = g.y + g.alto + extra;
    if (y < Math.min(inicio, fin) - 1 || y > Math.max(inicio, fin) + 1) continue;
    if (u === estado.objetivo) return u;
    const d = (g.x - origen.x) ** 2 + (y - origen.y) ** 2;
    if (d <= distancia) { distancia = d; mejor = u; }
  }
  return mejor;
}

/** FUN_005e3f34: recomputa el vector cada paso, limita Y/Z y actualiza el ángulo de dibujo.
 * `conservarTiempo` implementa la condición de motions 9/10/13/14/15 de FUN_005e43ac en el llamador.
 */
export function actualizarApuntado57(estado, emisor, candidatos, opciones) {
  if (!estado.offset.some((v) => v !== 0)) return estado;
  const { ficha, alcance, geometria, dt = 0, conservarTiempo = false, proyeccionX } = opciones;
  const objetivo = seleccionarObjetivo57(estado, emisor, candidatos, opciones);
  const origen = { x: emisor.x + estado.offset[0], y: emisor.y + estado.offset[1], z: (emisor.z ?? 0) + estado.offset[2] };
  const g = objetivo ? geometria(objetivo) : null;
  const vector = objetivo ? vectorObjetivo57(origen, g, { alto: g.alto, apuntarSuelo: ficha?.fisica?.apuntarSuelo })
    : vectorSinObjetivo57(origen, estado.anguloInicial, alcance);
  const t = tolerancias57(estado, vector, ficha, emisor.dir ?? 1);
  if (!t.z) vector[2] = 0;
  if (!t.y) vector[1] = 0;
  estado.vector = vector;
  estado.angulo = anguloProyectado57(vector, proyeccionX);
  estado.tiempoObjetivo = conservarTiempo && objetivo && objetivo === estado.objetivo ? estado.tiempoObjetivo + dt : 0;
  estado.objetivo = objetivo;
  return estado;
}
