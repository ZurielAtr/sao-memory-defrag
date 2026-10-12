import { rutaWeb } from '../rutas.js';
// Visor de .csb (D49): web/ui.html?csb=ui/title/title.csb dibuja cualquier pantalla de la interfaz.
import '../importador/comprobar.js'; // D68: sin datos (página pública sin importar) manda a la portada
import { Pantalla, baseCanvas, mul, trasladar, DISENO } from './pantalla.js';
import { recorrer } from './csb.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const arbol = document.getElementById('arbol');
const estado = document.getElementById('estado');
const selector = document.getElementById('archivos');
window.__ui = { listo: false };

let pantalla = null;
let seleccionado = null;

const ls = async (path) => (await fetch(rutaWeb(`/api/ls?path=${encodeURIComponent(path)}`))).json();

async function listarCSB(dir = 'ui') {
  const { dirs = [], files = [] } = await ls(dir);
  const propios = files.filter((f) => f.endsWith('.csb')).map((f) => `${dir}/${f}`);
  const sub = await Promise.all(dirs.map((d) => listarCSB(`${dir}/${d}`)));
  return [...propios, ...sub.flat()];
}

function base() {
  // Las pantallas tienen raíz de 750×1334; los widgets (raíz 0×0) se centran en el diseño.
  const b = baseCanvas(canvas);
  if (pantalla && !pantalla.raiz.ancho && !pantalla.raiz.alto) return mul(b, trasladar(DISENO.ancho / 2, DISENO.alto / 2));
  return b;
}

function dibujar() {
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * devicePixelRatio));
  canvas.height = Math.max(1, Math.round(r.height * devicePixelRatio));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!pantalla) return;
  const b = baseCanvas(canvas);
  // Marco del área de diseño.
  ctx.strokeStyle = '#22385c';
  ctx.strokeRect(b[4], b[5] + b[3] * DISENO.alto, b[0] * DISENO.ancho, -b[3] * DISENO.alto);
  pantalla.dibujar(ctx, base());
  if (seleccionado) {
    const z = pantalla.zonas.find((x) => x.n === seleccionado);
    if (z) {
      ctx.setTransform(...z.m);
      ctx.strokeStyle = '#ff4fd8';
      ctx.lineWidth = 2 / Math.abs(z.m[0] || 1);
      ctx.strokeRect(0, 0, z.w, z.h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
}

function pintarArbol() {
  arbol.textContent = '';
  for (const [n, padres] of recorrer(pantalla.raiz)) {
    const d = document.createElement('div');
    const oculto = !n.visible || padres.some((p) => !p.visible);
    d.className = (oculto ? 'oculto' : '') + (n === seleccionado ? ' sel' : '');
    d.style.paddingLeft = `${4 + padres.length * 12}px`;
    const clase = document.createElement('span');
    clase.className = 'clase';
    clase.textContent = n.clase;
    d.append(clase, ` ${n.nombre}${n.visible ? '' : ' (oculto)'}`);
    d.title = JSON.stringify({ x: n.x, y: n.y, ancho: n.ancho, alto: n.alto, ancla: [n.anclaX, n.anclaY],
      imagen: n.imagen?.path ?? n.boton?.normal?.path, texto: n.texto }, null, 1);
    d.onclick = () => {
      n.visible = !n.visible;
      seleccionado = n;
      pintarArbol();
      dibujar();
    };
    arbol.append(d);
  }
}

async function abrir(ruta) {
  estado.textContent = `cargando ${ruta}…`;
  window.__ui = { listo: false, ruta };
  try {
    pantalla = await Pantalla.cargar(ruta);
    seleccionado = null;
    let nodos = 0;
    for (const _ of recorrer(pantalla.raiz)) nodos++; // eslint-disable-line no-unused-vars
    estado.textContent = `${ruta}\nversión ${pantalla.datos.version} · ${nodos} nodos · raíz ${pantalla.raiz.ancho}×${pantalla.raiz.alto}`;
    pintarArbol();
    dibujar();
    window.__ui = { listo: true, ruta, nodos, pantalla };
  } catch (e) {
    estado.textContent = `Error: ${e.message}`;
    console.error(e);
    window.__ui = { listo: true, ruta, error: e.message };
  }
}

canvas.addEventListener('click', (ev) => {
  if (!pantalla) return;
  const r = canvas.getBoundingClientRect();
  const n = pantalla.nodoEn((ev.clientX - r.left) * devicePixelRatio, (ev.clientY - r.top) * devicePixelRatio);
  seleccionado = n;
  estado.textContent = n ? `${n.clase} "${n.nombre}"${n.callback ? ` · callback ${n.callback.nombre}` : ''}` : '(nada interactivo)';
  pintarArbol();
  dibujar();
});

canvas.addEventListener('wheel', (ev) => {
  if (!pantalla) return;
  const r = canvas.getBoundingClientRect();
  const n = pantalla.nodoEn((ev.clientX - r.left) * devicePixelRatio, (ev.clientY - r.top) * devicePixelRatio, (x) => x.interior);
  if (!n) return;
  ev.preventDefault();
  n._desplaz = Math.max(0, Math.min(n._max ?? 0, (n._desplaz ?? 0) + ev.deltaY));
  dibujar();
}, { passive: false });

addEventListener('resize', dibujar);

const inicial = (params.get('csb') ?? 'ui/title/title.csb').replace(/^\/?(assets\/)?/, '');
const ruta = inicial.startsWith('ui/') ? inicial : `ui/${inicial}`;
selector.onchange = () => {
  history.replaceState(null, '', `?csb=${selector.value}`);
  abrir(selector.value);
};
abrir(ruta);
listarCSB().then((todos) => {
  selector.textContent = '';
  for (const f of todos.sort()) {
    const o = document.createElement('option');
    o.value = o.textContent = f;
    if (f === ruta) o.selected = true;
    selector.append(o);
  }
});
