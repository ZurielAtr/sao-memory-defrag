import { audio, motor } from './index.js';
import { animaciones } from '../ui/animaciones.js';
import { borrarCuentaLocal } from '../api/index.js';
import { CLAVE_RESULTADO } from '../ui/regreso.js';
import { rutaWeb } from '../rutas.js';

export const AVISO_REROLL = '¿Hacer reroll?\n\nSe borrará la cuenta de este navegador: personajes, objetos, progreso y diamantes. '
  + 'Empezarás una cuenta nueva con el regalo inicial.\n\nLos datos del juego importados de la APK no se borran.';

/** Borra la cuenta y vuelve a la interfaz, que registra una nueva. Devuelve false si se cancela. */
export async function reroll({ confirmar = (t) => globalThis.confirm(t), ir = (u) => location.replace(u) } = {}) {
  if (!confirmar(AVISO_REROLL)) return false;
  await borrarCuentaLocal();
  try { sessionStorage.removeItem(CLAVE_RESULTADO); } catch { /* opcional */ }
  ir(rutaWeb('/interfaz.html'));
  return true;
}

export function montarAjustes() {
  if (document.getElementById('ajustes-audio')) return;
  const host = document.createElement('details');
  host.id = 'ajustes-audio';
  host.dataset.audioUi = 'true';
  host.style.cssText = 'position:fixed;right:max(8px, env(safe-area-inset-right));bottom:max(8px, env(safe-area-inset-bottom));z-index:10000;color:#ecf6ff;background:#101c2fee;border:1px solid #51708c;border-radius:6px;padding:7px;font:13px system-ui;max-width:230px';
  host.innerHTML = '<summary style="cursor:pointer">Ajustes</summary><div style="display:grid;gap:8px;padding-top:10px"><button type="button" data-activar>Activar sonido</button><label><input type="checkbox" data-silencio> Silenciar todo</label></div>';
  const contenido = host.lastElementChild;
  for (const [k, nombre] of [['musica', 'Música'], ['efectos', 'Efectos'], ['voces', 'Voces']]) {
    const l = document.createElement('label');
    l.textContent = nombre;
    const rango = document.createElement('input');
    Object.assign(rango, { type: 'range', min: 0, max: 100, step: 1, value: Math.round(motor.preferencias[k] * 100) });
    rango.setAttribute('aria-label', `Volumen de ${nombre.toLowerCase()}`);
    rango.style.cssText = 'display:block;width:200px';
    rango.addEventListener('input', () => audio.ajustar({ [k]: Number(rango.value) / 100 }));
    l.append(rango); contenido.append(l);
  }
  // D91: animaciones completas por defecto, como el original; «sistema» sigue al navegador.
  const anim = document.createElement('label');
  anim.textContent = 'Animaciones';
  const selector = document.createElement('select');
  selector.dataset.animaciones = '';
  selector.style.cssText = 'display:block;width:200px';
  for (const [valor, texto] of [['completas', 'Completas (como el original)'], ['reducidas', 'Reducidas'], ['sistema', 'Según el sistema']]) selector.add(new Option(texto, valor));
  selector.value = animaciones.modo;
  selector.addEventListener('change', () => { selector.value = animaciones.ajustar(selector.value); });
  anim.append(selector); contenido.append(anim);
  // Reroll: cuenta nueva para volver a tirar en el gacha, sin tocar lo importado.
  const botonReroll = document.createElement('button');
  botonReroll.type = 'button';
  botonReroll.dataset.reroll = '';
  botonReroll.textContent = 'Reroll';
  botonReroll.title = 'Borra sólo la cuenta (no los datos del juego) y empieza una nueva';
  botonReroll.style.cssText = 'color:#ffd9d9;background:#5a1f26;border:1px solid #a4505a;border-radius:4px;padding:4px';
  botonReroll.addEventListener('click', () => { reroll().catch((e) => alert(`No se pudo hacer reroll: ${e.message}`)); });
  contenido.append(botonReroll);
  const silencio = host.querySelector('[data-silencio]');
  silencio.checked = motor.preferencias.silencio;
  silencio.addEventListener('change', () => audio.ajustar({ silencio: silencio.checked }));
  const activar = host.querySelector('[data-activar]');
  activar.addEventListener('click', () => void audio.activar());
  motor.alCambiar = () => {
    activar.hidden = motor.ctx?.state === 'running';
    host.querySelector('summary').textContent = motor.preferencias.silencio ? 'Ajustes · sonido silenciado' : motor.ctx?.state === 'running' ? 'Ajustes' : 'Ajustes · activar sonido';
  };
  for (const tipo of ['pointerdown', 'pointerup', 'keydown', 'keyup']) host.addEventListener(tipo, (ev) => ev.stopPropagation());
  document.body.append(host);
  motor.alCambiar();
}
