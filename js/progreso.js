// Progreso de la cuenta en el juego: conecta la capa de API de F3 (web/js/api/, D41) con la misión
// (D43/D44). Ver NOTAS.md, "F3 conectada al juego" (D45).
//
// juego.js solo hace estas llamadas:
//   const progreso = await Progreso.cargar({ activo, personajeId, grupo });   // cuenta (user/all o user/register)
//   progreso.nivel / progreso.nivelDe(id)                               // nivel del personaje en la cuenta
//   progreso.empezar(misionId, dificultad)                              // quest/start
//   progreso.terminar({ cleared, clearTime, defeated })                 // quest/result + resumen
//   progreso.caer(battle)                                               // el jugador cae: misión fallida
//
// PROVISIONAL: el panel de recompensas es nuestro (la interfaz real es F2, archivos .csb), y los
// formatos de user/all y quest/result son los provisionales del LocalBackend.

import { crearApiLocal } from './api/index.js';
import { armaDeCuenta, equiposDeCuenta } from './equipo.js';

const NOMBRE_INICIAL = 'Kirito';

export class Progreso {
  /**
   * @param {object} o
   * @param {boolean} o.activo  false = modo de prueba (?enemigoid= o ?pjnivel=): no se usa la cuenta
   * @param {string|number} o.personajeId  personaje que se juega (character.f0)
   * @param {Array<string|number>} [o.grupo]  Switch: los del grupo (el primero es personajeId)
   */
  static async cargar({ activo = true, personajeId, grupo = [personajeId] } = {}) {
    const p = new Progreso();
    if (!activo) return p;
    try {
      p.api = await crearApiLocal();
      p.cuenta = await p.leerCuenta();
      const deCuenta = (id) => p.cuenta.characters.find((c) => String(c.character_id) === String(id)) ?? null;
      p.personaje = deCuenta(personajeId);
      p.miembros = grupo.map(deCuenta);
      if (!p.personaje) {
        console.info(`progreso: el personaje ${personajeId} no está en la cuenta; la misión no se guarda`);
      }
    } catch (e) {
      console.warn('progreso: no se pudo usar la cuenta; se juega sin guardar.', e);
      p.api = null;
    }
    return p;
  }

  constructor() {
    this.api = null;
    this.cuenta = null; // data de user/all
    this.personaje = null; // personaje de la cuenta que se juega ({ uid, character_id, level, exp })
    this.miembros = []; // Switch: los del grupo que están en la cuenta (null los que no)
    this.enCurso = false; // hay quest/start sin quest/result
    this.cuentaNueva = false;
    this.panel = null;
  }

  async leerCuenta() {
    try {
      return (await this.api.request('user/all')).data;
    } catch (e) {
      if (e.code !== 'sin_cuenta') throw e;
      await this.api.request('user/register', { name: NOMBRE_INICIAL });
      this.cuentaNueva = true;
      return (await this.api.request('user/all')).data;
    }
  }

  /** Nivel del personaje en la cuenta (null si no se usa la cuenta). */
  get nivel() {
    return this.personaje?.level ?? null;
  }

  /** Nivel de un miembro del grupo en la cuenta (null si no está). */
  nivelDe(id) {
    return this.miembros.find((c) => c && String(c.character_id) === String(id))?.level ?? null;
  }

  armaDe(id) {
    const c = this.miembros.find((c) => c && String(c.character_id) === String(id));
    return armaDeCuenta(this.cuenta, c, this.api?.backend?.master);
  }

  equiposDe(id) {
    const c = this.miembros.find((c) => c && String(c.character_id) === String(id));
    return equiposDeCuenta(this.cuenta, c, this.api?.backend?.master);
  }

  async empezar(misionId, dificultad) {
    if (!this.api || !this.personaje) return;
    try {
      // Respuesta confirmada del DummyDriver: {"data":{"diamond":{...}}}; no trae datos de la batalla.
      const party = [...new Set([this.personaje, ...this.miembros.filter(Boolean)])].map((c) => c.uid);
      await this.api.request('quest/start', { quest_id: Number(misionId), difficulty: dificultad, party });
      this.enCurso = true;
    } catch (e) {
      console.warn('progreso: quest/start falló; la misión no se guarda.', e);
    }
  }

  /** Fin de la misión: quest/result y resumen en pantalla. Solo la primera vez por misión. */
  async terminar({ cleared, clearTime, defeated }) {
    if (!this.enCurso) return null;
    this.enCurso = false;
    try {
      const { data } = await this.api.request('quest/result', {
        cleared, clear_time: Math.round(clearTime * 10) / 10, defeated,
      });
      this.mostrar(data);
      return data;
    } catch (e) {
      console.warn('progreso: quest/result falló.', e);
      return null;
    }
  }

  /** El jugador cayó: la misión queda fallida (quest/result con cleared: false). */
  caer(battle) {
    if (!battle || battle.repeat || battle.state === 'complete' || battle.state === 'failed') return;
    battle.state = 'failed';
    battle.banner = { text: 'MISIÓN FALLIDA', sub: 'Recarga la página para reintentar', t: 0, keep: true };
    this.terminar({ cleared: false, clearTime: battle.elapsed, defeated: battle.defeated });
  }

  // ---- resumen (PROVISIONAL: la pantalla de resultados real es F2) ----
  mostrar(data) {
    this.panel?.remove();
    const div = document.createElement('div');
    div.id = 'resultado';
    Object.assign(div.style, {
      position: 'absolute', left: '50%', top: '42%', transform: 'translateX(-50%)', minWidth: '320px',
      maxWidth: '90vw', padding: '14px 18px', background: 'rgba(6,12,24,.9)', border: '1px solid #2f4a75',
      borderRadius: '10px', color: '#e8f1ff', font: '14px "Segoe UI", system-ui, sans-serif', zIndex: 6,
      boxShadow: '0 8px 30px rgba(0,0,0,.5)',
    });
    const linea = (txt, color = '#e8f1ff', peso = 400) => {
      const d = document.createElement('div');
      d.textContent = txt;
      d.style.cssText = `color:${color};font-weight:${peso};margin:3px 0`;
      div.append(d);
    };
    const r = data.rewards;
    if (data.cleared) {
      linea(`Recompensas${data.first_clear ? ' · ¡primera vez!' : ''}`, '#ffd25a', 700);
      linea(`Col +${r.col}  (total ${data.user.col})`);
      linea(`EXP de jugador +${r.exp_user}  (total ${data.user.exp})`);
      for (const c of data.characters) {
        const nombre = this.api.backend.master?.personaje(c.character_id)?.nombre ?? c.character_id;
        const sube = c.level_up ? `  ▲ ¡Sube ${c.level_up} nivel${c.level_up > 1 ? 'es' : ''}!` : '';
        linea(`${nombre}: EXP +${r.exp_character} → Lv ${c.level}${sube}`, c.level_up ? '#7dffa8' : '#e8f1ff');
      }
      if (r.drops.length) {
        linea('Drops:', '#9fd3ff', 600);
        for (const d of r.drops) linea(`  • ${d.texto ?? `${d.tipo}:${d.id}`}`);
      } else {
        linea('Drops: ninguno', '#9fd3ff');
      }
    } else {
      linea('Misión fallida: sin recompensas', '#ff8a8a', 700);
    }
    const pie = document.createElement('div');
    pie.style.cssText = 'margin-top:10px;display:flex;gap:10px;justify-content:space-between;align-items:center';
    const nota = document.createElement('span');
    nota.textContent = 'provisional (la pantalla real es F2)';
    nota.style.cssText = 'color:#7f90b3;font-size:11px';
    const enlaces = document.createElement('span');
    enlaces.innerHTML = '<a href="cuenta.html" style="color:#4fb3ff">Ver cuenta</a> · '
      + '<a href="#" id="otra-vez" style="color:#4fb3ff">Jugar otra vez</a>';
    pie.append(nota, enlaces);
    div.append(pie);
    document.body.append(div);
    div.querySelector('#otra-vez').addEventListener('click', (ev) => { ev.preventDefault(); location.reload(); });
    this.panel = div;
  }
}
