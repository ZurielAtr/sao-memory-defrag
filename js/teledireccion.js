// FUN_008216a8 y getters 00821bb4/00821bf0/00821c20/00821c60 (D73).
const RAD = Math.PI / 180;
const normalizar = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function parametrosSeguimiento(ficha) {
  const crudo = ficha.crudo ?? {};
  return ficha.fisica?.teledireccion ?? { giro: crudo.f22 ?? 0, tolerancia: crudo.f23 ?? 0,
    radio: crudo.f24 ?? 0, tiempo: (crudo.f25 ?? 0) / 1000 };
}

/** Devuelve true mientras el objetivo sigue asignado; al perderlo no se vuelve a adquirir. */
export function orientarTeledirigida(b, dt, centro) {
  const objetivo = b.objetivoSeguimiento, p = parametrosSeguimiento(b.ficha);
  if (!objetivo) return false;
  const activo = (objetivo.alive ?? objetivo.hp > 0) && !objetivo.hidden && !objetivo.enReserva && !objetivo.saliendo;
  b.tiempoSeguimiento += dt;
  if (!activo || (p.tiempo > 0 && b.tiempoSeguimiento >= p.tiempo)) {
    b.objetivoSeguimiento = null; return false;
  }
  const [x, y, z] = centro(objetivo);
  const dx = x - b.x, dy = y - (b.y - (b.suelo ?? 0)), dz = z - b.z;
  if (dx * dx + dy * dy + dz * dz <= p.radio * p.radio) {
    b.objetivoSeguimiento = null; return false;
  }
  const [ax = 0, ay = 0, az = 0] = b.ficha.fisica.aceleracion ?? [];
  let vx = b.vx + ax * b.dir * dt, vy = b.vy + ay * dt, vz = b.vz + az * dt;
  const girar = (a, c, destino) => {
    const delta = normalizar(destino - Math.atan2(c, a));
    if (p.tolerancia > 0 && Math.abs(delta) >= p.tolerancia * RAD) return null;
    if (Math.abs(delta) <= RAD) return [a, c]; // epsilon original: un grado
    const paso = Math.max(-p.giro * RAD * dt, Math.min(p.giro * RAD * dt, delta));
    return [a * Math.cos(paso) - c * Math.sin(paso), a * Math.sin(paso) + c * Math.cos(paso)];
  };
  const horizontal = girar(vx, vz, Math.atan2(dz, dx));
  if (!horizontal) { b.objetivoSeguimiento = null; return false; }
  [vx, vz] = horizontal;
  const vertical = girar(vx, vy, Math.atan2(dy, dx));
  if (!vertical) { b.objetivoSeguimiento = null; return false; }
  [vx, vy] = vertical;
  b.vx = vx; b.vy = vy; b.vz = vz;
  return true;
}
