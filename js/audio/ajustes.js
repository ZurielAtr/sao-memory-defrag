import { audio, motor } from './index.js';

export function montarAjustes() {
  if (document.getElementById('ajustes-audio')) return;
  const host = document.createElement('details');
  host.id = 'ajustes-audio';
  host.dataset.audioUi = 'true';
  host.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:10000;color:#ecf6ff;background:#101c2fee;border:1px solid #51708c;border-radius:6px;padding:7px;font:13px system-ui;max-width:230px';
  host.innerHTML = '<summary style="cursor:pointer">Sonido</summary><div style="display:grid;gap:8px;padding-top:10px"><button type="button" data-activar>Activar sonido</button><label><input type="checkbox" data-silencio> Silenciar todo</label></div>';
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
  const silencio = host.querySelector('[data-silencio]');
  silencio.checked = motor.preferencias.silencio;
  silencio.addEventListener('change', () => audio.ajustar({ silencio: silencio.checked }));
  const activar = host.querySelector('[data-activar]');
  activar.addEventListener('click', () => void audio.activar());
  motor.alCambiar = () => {
    activar.hidden = motor.ctx?.state === 'running';
    host.querySelector('summary').textContent = motor.preferencias.silencio ? 'Sonido silenciado' : motor.ctx?.state === 'running' ? 'Sonido' : 'Activar sonido';
  };
  for (const tipo of ['pointerdown', 'pointerup', 'keydown', 'keyup']) host.addEventListener(tipo, (ev) => ev.stopPropagation());
  document.body.append(host);
  motor.alCambiar();
}
