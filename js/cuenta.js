// Panel mínimo de la cuenta (F3 conectada, D45): user/all y user/quest del servidor simulado.
// PROVISIONAL: la interfaz real del juego es F2 (archivos .csb).

import './importador/comprobar.js'; // D68: sin datos (página pública sin importar) manda a la portada
import { crearApiLocal } from './api/index.js';

const raiz = document.getElementById('contenido');

function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  for (const h of hijos) e.append(h);
  return e;
}

function tabla(cabeceras, filas, numericas = []) {
  if (!filas.length) return el('div', { className: 'vacio', textContent: 'Nada todavía.' });
  const t = el('table');
  t.append(el('tr', {}, ...cabeceras.map((c) => el('th', { textContent: c }))));
  for (const f of filas) {
    t.append(el('tr', {}, ...f.map((v, i) => el('td', { textContent: String(v ?? '—'), className: numericas.includes(i) ? 'num' : '' }))));
  }
  return t;
}

async function main() {
  const api = await crearApiLocal();
  const master = api.backend.master;
  let cuenta;
  try {
    cuenta = (await api.request('user/all')).data;
  } catch (e) {
    if (e.code !== 'sin_cuenta') throw e;
    raiz.replaceChildren(el('p', {}, 'Todavía no hay cuenta: se crea al jugar una misión. ', el('a', { href: 'juego.html', textContent: 'Jugar la Quest 1-1' })));
    return;
  }
  const { quests } = (await api.request('user/quest')).data;
  const u = cuenta.user;
  const nombre = (id) => master.personaje(id)?.nombre ?? `personaje ${id}`;

  const resumen = el('div', { className: 'datos' },
    ...[
      ['Nombre', u.name], ['Col', u.col.toLocaleString('es')], ['EXP de jugador', u.exp.toLocaleString('es')],
      ['Diamantes', u.diamond], ['Misiones superadas', new Set(quests.map((q) => q.quest_id)).size],
    ].map(([k, v]) => el('div', { className: 'dato' }, k, el('b', { textContent: String(v) }))));

  const personajes = tabla(['Personaje', 'Nivel', 'EXP'],
    cuenta.characters.map((c) => [nombre(c.character_id), c.level, c.exp]), [1, 2]);

  const objetos = tabla(['Objeto', 'Cantidad'],
    cuenta.items.map((i) => [master.objeto(i.item_id)?.nombre ?? `objeto ${i.item_id}`, i.count])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [1]);

  const porEquipo = new Map();
  for (const e of cuenta.equipment) porEquipo.set(e.equipment_id, (porEquipo.get(e.equipment_id) ?? 0) + 1);
  const equipos = tabla(['Equipo', 'Cantidad'],
    [...porEquipo].map(([id, n]) => [master.equipo(id)?.nombre ?? `equipo ${id}`, n]), [1]);

  const misiones = tabla(['Misión', 'Dificultad', 'Veces', 'Mejor tiempo (s)'],
    quests.map((q) => {
      const m = master.mision(q.quest_id);
      return [`${m?.etiqueta ?? q.quest_id} ${m?.nombre ?? ''}`, q.difficulty, q.clear_count, q.best_time];
    }), [1, 2, 3]);

  const borrar = el('button', { textContent: 'Borrar la cuenta (local)' });
  borrar.addEventListener('click', async () => {
    if (!confirm('¿Borrar la cuenta guardada en este navegador?')) return;
    await api.backend.borrarCuenta();
    location.reload();
  });

  raiz.replaceChildren(
    resumen,
    el('div', { className: 'nota', textContent: 'Nivel de jugador: pendiente (no se encontró su tabla); por ahora solo se acumula la EXP.' }),
    el('h2', { textContent: 'Personajes' }), personajes,
    el('h2', { textContent: 'Objetos' }), objetos,
    el('h2', { textContent: 'Equipos' }), equipos,
    el('h2', { textContent: 'Misiones completadas' }), misiones,
    el('h2', { textContent: 'Cuenta' }), borrar,
  );
  window.__cuenta = { cuenta, quests };
}

main().catch((err) => {
  raiz.textContent = `Error: ${err.message}`;
  console.error(err);
});
