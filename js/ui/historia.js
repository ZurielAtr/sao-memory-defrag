import { rutaWeb } from '../rutas.js';
// Diálogos de las misiones ("Adventure"; AdventureScene/AdventureLayer del juego) con la pantalla original
// ui/adventure_story/adventure_story.csb y los datos de web/data/historias (herramientas/exportar_historias.py).
// NOTAS.md "Diálogos".
//
// Cada línea (adventure_story_content.f2) tiene una o varias entradas que se aplican a la vez: la que trae
// texto (f6) es la que habla (nombre f5); cada entrada con imagen de personaje (f3 → adventure_story_character_
// image: cuerpo, cara, accesorio y pelo; posiciones de adventure_story_character_position) lo pone en su hueco
// (f8). El fondo (f10) cambia la imagen de fondo; la ilustración (f14) y el objeto (f12) se ven solo en su línea.
//
// PROVISIONAL (sin leer en el binario): huecos 1 izquierda, 2 derecha, 3 centro y 4 sin imagen (sin f8, el 1);
// los personajes siguen en pantalla hasta que otro ocupa su hueco o cambia el fondo; el que no habla se
// oscurece; la ilustración va en el sitio del objeto; el texto sale a VELOCIDAD caracteres/s; sin efectos
// (f16/f17), animaciones (f20); sin registro (button_log) ni elecciones. Audio: D69.

import { Pantalla, baseCanvas } from './pantalla.js';
import { audio, motor } from '../audio/index.js';
import { montarAjustes } from '../audio/ajustes.js';

const RUTA = 'ui/adventure_story/adventure_story.csb';
const VELOCIDAD = 40; // caracteres por segundo (PROVISIONAL)
const HUECOS = { 1: 'character_1', 2: 'character_2', 3: 'character_3' };
const CAPAS = [['cara', 'face', '1'], ['accesorio', 'option', '2'], ['pelo', 'hair', '3']]; // posición de la capa
const OSCURO = { r: 130, g: 130, b: 130 };

let cachePosiciones = null;
let cacheMisiones = null;
const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** Historias de una misión: [{ id, momento, escenario, zona, resumen, existe }] (adventure_quest_story). */
export async function historiasDeMision(id) {
  cacheMisiones ??= json(rutaWeb('/data/historias/misiones.json'));
  return (await cacheMisiones)?.[String(id)] ?? [];
}

const nodo = (clase, nombre, extra = {}) => ({
  clase, nombre, visible: true, alpha: 255, x: 0, y: 0, ancho: 0, alto: 0, anclaX: 0.5, anclaY: 0.5, escalaX: 1, escalaY: 1,
  rotX: 0, rotY: 0, zOrder: 0, color: { r: 255, g: 255, b: 255 }, flipX: false, flipY: false, hijos: [], ...extra,
});
const imagen = (path) => ({ path, plist: null, tipo: 0 });

export class Historia {
  /** Carga la historia `id` (web/data/historias/<id>.json) y la pantalla; null si no hay datos. */
  static async cargar(id) {
    cachePosiciones ??= json(rutaWeb('/data/historias/posiciones.json'));
    const [datos, p, posiciones] = await Promise.all([json(rutaWeb(`/data/historias/${id}.json`)), Pantalla.cargar(RUTA), cachePosiciones]);
    if (!datos?.lineas?.length) return null;
    return new Historia(p, datos, posiciones ?? {});
  }

  constructor(p, datos, posiciones) {
    this.p = p;
    this.datos = datos;
    this.posiciones = posiciones;
    this.i = -1; // línea actual
    this.huecos = {}; // hueco → { personaje, nombre }
    this.texto = '';
    this.mostrado = 0; // caracteres ya escritos
    this.terminada = false;
    this.p.mostrar('button_log', false); // PROVISIONAL: sin registro
    this.fondo = p.buscar('background');
    this.objeto = p.buscar('item');
    for (const n of Object.values(HUECOS)) p.buscar(n).imagen = null;
    this.fondo.imagen = null;
    this.objeto.imagen = null;
    this.siguiente();
  }

  get escribiendo() {
    return this.mostrado < this.texto.length;
  }

  // Avanza a la línea siguiente (o termina).
  siguiente() {
    this.cancelarSonidoLinea();
    this.audioLinea = new AbortController();
    this.i++;
    const ln = this.datos.lineas[this.i];
    if (!ln) { this.saltar(); return; }
    let habla = null;
    let still = null, objeto = null;
    for (const e of ln.entradas) {
      if (this._reproduciendo) this.sonidoEntrada(e);
      if (e.fondo) {
        this.fondo.imagen = imagen(`images/story/background/${e.fondo}.jpg`);
        this.huecos = {}; // PROVISIONAL: el fondo nuevo empieza sin personajes
      }
      if (e.still) still = e.still;
      if (e.objeto) objeto = e.objeto;
      const hueco = HUECOS[e.posicion ?? 1] ? (e.posicion ?? 1) : null;
      if (e.personaje && hueco) {
        // Un personaje (carpeta) está en un solo hueco.
        for (const [k, h] of Object.entries(this.huecos)) if (h.personaje.carpeta === e.personaje.carpeta) delete this.huecos[k];
        this.huecos[hueco] = { personaje: e.personaje, nombre: e.nombre };
      }
      if (e.texto != null) habla = { ...e, hueco };
    }
    this.objeto.imagen = still ? imagen(`images/story/still/${still}.jpg`) : objeto ? imagen(`images/story/item/${objeto}.png`) : null;
    this.hablante = habla?.hueco ?? null;
    this.p.texto('text_character_name', habla?.nombre ?? '');
    this.texto = habla?.texto ?? '';
    this.mostrado = 0;
    this.p.texto('text_talk', '');
    this.ponerPersonajes();
    this.p.precargar().catch(() => {});
    if (!habla) this.mostrado = 0; // línea sin texto: espera el toque igual
  }

  // Compone cada hueco: el cuerpo en el nodo del hueco y la cara, el accesorio y el pelo como hijos.
  ponerPersonajes() {
    for (const [k, nombre] of Object.entries(HUECOS)) {
      const n = this.p.buscar(nombre);
      const h = this.huecos[k];
      n._y0 ??= n.y;
      if (!h?.personaje?.cuerpo) { n.imagen = null; n.hijos = []; continue; }
      const pj = h.personaje;
      const base = `images/story/character/${pj.carpeta}`;
      const pos = this.posiciones[pj.carpeta] ?? { ancho: 456, capas: {} };
      n.imagen = imagen(`${base}/body/${pj.cuerpo}.png`);
      n.y = n._y0 + (pj.dy ?? 0);
      // flipX del nodo (hueco 1) solo voltea su textura: las capas se reflejan a mano.
      n.hijos = CAPAS.filter(([c, , id]) => pj[c] && pos.capas[id]).map(([c, dir, id], z) => {
        const [x, y] = pos.capas[id];
        return nodo('Sprite', `capa_${c}`, { imagen: imagen(`${base}/${dir}/${pj[c]}.png`), x: n.flipX ? pos.ancho - x : x, y, flipX: n.flipX, zOrder: z + 1 });
      });
      const color = this.hablante == null || Number(k) === this.hablante ? { r: 255, g: 255, b: 255 } : OSCURO;
      n.color = color;
      for (const c of n.hijos) c.color = color;
    }
  }

  /** Toque / tecla: completa el texto o pasa a la línea siguiente. */
  async avanzar() {
    if (this.terminada || this._avanzando) return;
    if (this.escribiendo) this.mostrado = this.texto.length;
    else {
      this._avanzando = true;
      this.cancelarSonidoLinea();
      this.audioLinea = new AbortController();
      const signal = this.audioLinea.signal;
      // FUN_005dac24: sonido/BGM posteriores; esperar al SE antes de cambiar de línea.
      await Promise.all((this.datos.lineas[this.i]?.entradas ?? []).map(async (e) => {
        if (e.musica2 > 0) void audio.musica(e.musica2, { volumen: (e.volumenMusica ?? 10000) / 10000 });
        if (e.sonido2 > 0) await audio.efecto(e.sonido2, { ambito: 'historia', signal, esperarFin: true });
      }));
      this._avanzando = false;
      if (!this.terminada && !signal.aborted) this.siguiente();
    }
  }

  saltar() {
    this.terminada = true;
    this.cancelarSonidoLinea();
    this._fin?.(); // termina ya (sin esperar al siguiente cuadro, que no llega con la pestaña oculta)
  }

  actualizar(dt) {
    if (this.escribiendo) this.mostrado = Math.min(this.texto.length, this.mostrado + VELOCIDAD * dt);
    this.p.texto('text_talk', this.texto.slice(0, Math.floor(this.mostrado)));
    this.p.mostrar('icon_next', !this.escribiendo);
  }

  dibujar(ctx) {
    const c = ctx.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    this.p.dibujar(ctx, baseCanvas(c));
  }

  /** Botón de la pantalla bajo (x, y) del canvas (px), o null. */
  botonEn(x, y) {
    return this.p.nodoEn(x, y, (n) => n.nombre === 'button_skip')?.nombre ?? null;
  }

  /**
   * Reproduce la historia en `canvas` hasta el final (toque, Espacio, Intro o Z avanzan; Escape o «Skip» la
   * saltan). Devuelve una promesa que se resuelve al terminar.
   */
  reproducir(canvas) {
    montarAjustes();
    this._reproduciendo = true;
    const musicaAnterior = motor.deseada;
    audio.escena(`historia:${this.datos.id}`);
    for (const e of this.datos.lineas[this.i]?.entradas ?? []) this.sonidoEntrada(e);
    const ctx = canvas.getContext('2d');
    return new Promise((resolver) => {
      let ultimo = performance.now();
      const toque = (ev) => {
        if (ev.target.closest?.('[data-audio-ui]')) return;
        const r = canvas.getBoundingClientRect();
        const x = ((ev.clientX - r.left) * canvas.width) / r.width, y = ((ev.clientY - r.top) * canvas.height) / r.height;
        if (this.botonEn(x, y) === 'button_skip') this.saltar();
        else this.avanzar();
        ev.stopImmediatePropagation(); // que no lo reciba el HUD de batalla
      };
      const tecla = (ev) => {
        if (ev.target.closest?.('[data-audio-ui]')) return;
        if (['Space', 'Enter', 'KeyZ', 'NumpadEnter'].includes(ev.code)) this.avanzar();
        else if (ev.code === 'Escape') this.saltar();
        else return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
      };
      // En window: el canvas del HUD de batalla no recibe toques (pointer-events: none).
      addEventListener('pointerdown', toque, true);
      addEventListener('keydown', tecla, true);
      this._fin = () => {
        this._fin = null;
        removeEventListener('pointerdown', toque, true);
        removeEventListener('keydown', tecla, true);
        this._reproduciendo = false;
        audio.escena('fin-historia');
        if (musicaAnterior) void motor.musica(musicaAnterior.id, musicaAnterior.descriptor, musicaAnterior.opciones);
        else void audio.musica(null);
        resolver();
      };
      const bucle = (ahora) => {
        if (this.terminada) return;
        const dt = Math.max(0, Math.min(0.1, (ahora - ultimo) / 1000));
        ultimo = ahora;
        this.actualizar(dt);
        this.dibujar(ctx);
        requestAnimationFrame(bucle);
      };
      if (this.terminada) this._fin();
      else requestAnimationFrame(bucle);
    });
  }

  sonidoEntrada(e) {
    // FUN_005db7ec: f28 BGM, f29 volumen de música /10000; f25 voz, f26 SE.
    if (e.musica > 0) void audio.musica(e.musica, { volumen: (e.volumenMusica ?? 10000) / 10000 });
    const signal = this.audioLinea.signal;
    const timer = setTimeout(() => {
      if (signal.aborted || this.terminada) return;
      if (e.sonido > 0) void audio.efecto(e.sonido, { ambito: 'historia', signal });
      if (e.voz > 0) void audio.voz(e.voz, { emisor: 'historia', ambito: 'historia', signal });
    }, 300);
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  }

  cancelarSonidoLinea() {
    this.audioLinea?.abort();
    audio.detenerVoz('historia');
  }
}
