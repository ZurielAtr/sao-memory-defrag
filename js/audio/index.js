import { rutaWeb } from '../rutas.js';
import { MotorAudio } from './motor.js';
import { frecuenciaVorbis } from './ogg.js';

let catalogo = null;
export function cargarCatalogo() {
  catalogo ??= fetch(rutaWeb('/data/audio.json')).then((r) => r.ok ? r.json() : null).catch(() => null);
  return catalogo;
}

let trabajador = null, secuencia = 0;
const pendientes = new Map();
function falloTrabajador(e) {
  trabajador?.terminate(); trabajador = null;
  for (const p of pendientes.values()) { clearTimeout(p.timer); p.reject(e); }
  pendientes.clear();
}
function muestra(d) {
  if (!trabajador) {
    trabajador = new Worker(new URL('./trabajador.js', import.meta.url), { type: 'module' });
    trabajador.onmessage = ({ data }) => {
      const p = pendientes.get(data.id);
      if (!p) return;
      pendientes.delete(data.id); clearTimeout(p.timer);
      if (data.error) p.reject(new Error(data.error)); else p.resolve(data.pcm);
    };
    trabajador.onerror = (ev) => falloTrabajador(new Error(ev.message || 'falló el decodificador'));
  }
  return new Promise((resolve, reject) => {
    const id = ++secuencia;
    const timer = setTimeout(() => falloTrabajador(new Error('el decodificador no respondió')), 30000);
    pendientes.set(id, { resolve, reject, timer });
    trabajador.postMessage({ id, ruta: d.banco, nombre: d.nombre });
  });
}

let almacen = null;
try { almacen = globalThis.localStorage; } catch { /* modo privado */ }
export const motor = new MotorAudio({
  almacen,
  crearContexto: () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
  async cargar(d, ctx) {
    if (d.banco) return muestra(d);
    const r = await fetch(rutaWeb(`/assets/${d.ruta}`));
    if (!r.ok) throw new Error(`${d.ruta}: HTTP ${r.status}`);
    const bytes = await r.arrayBuffer();
    const frecuenciaOriginal = frecuenciaVorbis(bytes);
    return { buffer: await ctx.decodeAudioData(bytes), frecuenciaOriginal };
  },
});

const descriptor = (tipo, id) => cargarCatalogo().then((c) => {
  if (id == null || id === 0) return null;
  const d = c?.[tipo]?.[id];
  if (!d || (!d.ruta && !d.banco)) {
    motor.diagnostico(c ? `${tipo}:${id}` : 'catálogo', new Error(c ? 'recurso no disponible' : 'no se pudo cargar data/audio.json'));
    return null;
  }
  return d;
});
let vozAlActivar = null;
const efectosInmediatos = new Set();
let precargadaUI = false;
export const audio = {
  motor,
  async activar() {
    const ok = await motor.activar();
    if (ok) {
      if (!precargadaUI) {
        precargadaUI = true;
        void cargarCatalogo().then((c) => {
          for (const k of ['seleccionar', 'confirmar', 'cancelar']) if (c?.contextos[k]) void motor.precargar(c.efectos[c.contextos[k]]);
        });
      }
      for (const id of efectosInmediatos) void motor.precargar(descriptor('efectos', id));
      efectosInmediatos.clear();
    }
    if (ok && vozAlActivar) { const v = vozAlActivar; vozAlActivar = null; void audio.voz(v.id, v.opciones); }
    return ok;
  },
  musica(id, opciones = {}) { return motor.musica(id, id == null || id === 0 ? null : descriptor('musica', id), opciones); },
  efecto(id, opciones = {}) { return motor.sonar('efectos', descriptor(opciones.preload ? 'preload' : 'efectos', id), opciones); },
  prepararEventos(eventos) {
    const ids = [...new Set(Object.values(eventos ?? {}).flatMap((e) => (e.sonidos ?? []).filter((s) => s.tipo === 5).map((s) => s.id)))].slice(0, 24);
    for (const id of ids) {
      if (motor.ctx) void motor.precargar(descriptor('efectos', id));
      else if (efectosInmediatos.size < 48) efectosInmediatos.add(id);
    }
  },
  voz(id, opciones = {}) {
    if (opciones.ambito === 'historia' && motor.ctx?.state !== 'running' && !motor.pausas.size) {
      vozAlActivar = { id, opciones }; return Promise.resolve(false);
    }
    return motor.sonar('voces', descriptor('voces', id), opciones);
  },
  vozTipo(grupo, tipo, opciones = {}) {
    const d = cargarCatalogo().then((c) => {
      const ids = c?.familiasVoz?.[grupo]?.[tipo & 0xff]; // FUN_0082a3b4 recibe el tipo como byte
      const id = ids?.[Math.floor(Math.random() * ids.length)];
      return c?.voces?.[id] ?? null;
    });
    return motor.sonar('voces', d, opciones);
  },
  detenerVoz(emisor) {
    if (vozAlActivar?.opciones.emisor === emisor) vozAlActivar = null;
    motor.detenerVoz(emisor);
  },
  pausar(motivo, valor) { motor.pausar(motivo, valor); },
  escena(nombre) { audio.nombreEscena = nombre; vozAlActivar = null; motor.transitorios({ conservarUI: true }); },
  async contexto(nombre, opciones = {}) {
    const ui = ['seleccionar', 'confirmar', 'cancelar', 'jefeAviso'].includes(nombre);
    const turno = ui ? motor.generacionUI : motor.generacion;
    const c = await cargarCatalogo();
    if (turno !== (ui ? motor.generacionUI : motor.generacion)) return false;
    const id = c?.contextos?.[nombre];
    if (id == null) return false;
    if (ui) return audio.efecto(id, { ambito: 'ui', ...opciones });
    return audio.musica(id, { loop: !['victoria', 'derrota'].includes(nombre), ...opciones });
  },
  ajustar(p) { motor.ajustar(p); },
};

if (typeof window !== 'undefined') {
  const gesto = () => { if (motor.ctx?.state !== 'running') void audio.activar(); };
  window.addEventListener('pointerdown', gesto, { capture: true });
  window.addEventListener('keydown', gesto, { capture: true });
  document.addEventListener('visibilitychange', () => audio.pausar('oculto', document.hidden));
  window.addEventListener('pagehide', () => {
    motor.transitorios(); motor.pausar('oculto', true); vozAlActivar = null;
    falloTrabajador(new Error('página cerrada'));
  });
  window.addEventListener('pageshow', () => audio.pausar('oculto', document.hidden));
  window.__audio = audio; // observación de reproducción/errores en pruebas locales
}
