// Reproductor del port. No contiene identificadores ni recursos del juego original.
export const AJUSTES_INICIALES = { musica: 0.6, efectos: 0.8, voces: 1, silencio: false };
const CLAVE = 'saomd.audio.v1';
const limitar = (v, def) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : def;

export class MotorAudio {
  constructor({ crearContexto, cargar, almacen = null, limiteCache = 64 * 1024 ** 2, limiteEfectos = 24 } = {}) {
    this.crearContexto = crearContexto;
    this.cargar = cargar;
    this.almacen = almacen;
    this.limiteCache = limiteCache;
    this.limiteEfectos = limiteEfectos;
    this.preferencias = { ...AJUSTES_INICIALES };
    try { this.ajustar(JSON.parse(almacen?.getItem(CLAVE) ?? '{}'), false); } catch { /* preferencias dañadas */ }
    this.ctx = null;
    this.canales = {};
    this.cache = new Map();
    this.cargas = new Map();
    this.activos = new Set();
    this.turnosVoz = new Map();
    this.pausas = new Set();
    this.generacion = 0;
    this.generacionUI = 0;
    this.turnoMusica = 0;
    this.deseada = null;
    this.pista = null;
    this.cerrado = false;
    this.errores = new Set();
    this.contadores = { musica: 0, efectos: 0, voces: 0, fallos: 0 };
  }

  ajustar(cambios, guardar = true) {
    if (!cambios || typeof cambios !== 'object') return;
    for (const k of ['musica', 'efectos', 'voces']) if (k in cambios) this.preferencias[k] = limitar(cambios[k], AJUSTES_INICIALES[k]);
    if (typeof cambios.silencio === 'boolean') this.preferencias.silencio = cambios.silencio;
    for (const [k, gain] of Object.entries(this.canales ?? {})) gain.gain.value = this.preferencias.silencio ? 0 : this.preferencias[k];
    if (guardar) try { this.almacen?.setItem(CLAVE, JSON.stringify(this.preferencias)); } catch { /* almacenamiento opcional */ }
    this.alCambiar?.();
  }

  async activar() {
    if (this.cerrado) return false;
    try {
      if (!this.ctx) {
        this.ctx = this.crearContexto();
        for (const k of ['musica', 'efectos', 'voces']) {
          const gain = this.ctx.createGain();
          gain.connect(this.ctx.destination);
          this.canales[k] = gain;
        }
        this.ajustar({}, false);
      }
      if (this.pausas.has('oculto')) return false;
      this._desbloquear();
      await this.ctx.resume();
      if (this.ctx.state !== 'running') return false;
      this._continuarMusica();
      this.alCambiar?.();
      return true;
    } catch (e) { this.diagnostico('activar', e); return false; }
  }

  // iPhone: la sesión «playback» suena aunque el interruptor de silencio esté puesto (con la
  // predeterminada el audio web queda mudo), y un búfer vacío iniciado dentro del gesto termina de
  // desbloquear la salida en versiones antiguas de Safari (se repite en cada intento: el primero
  // puede llegar con pointerdown, que no cuenta como gesto). En otros navegadores no estorba.
  _desbloquear() {
    const sesion = globalThis.navigator?.audioSession;
    if (sesion && sesion.type !== 'playback') try { sesion.type = 'playback'; } catch { /* no admitido */ }
    if (!this.ctx.createBuffer) return;
    try {
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate || 44100);
      s.connect(this.ctx.destination); s.start(0);
    } catch { /* sólo es una ayuda */ }
  }

  diagnostico(clave, e) {
    if (this.errores.has(clave) || this.errores.size >= 30) return;
    this.errores.add(clave);
    this.contadores.fallos++;
    console.warn(`[audio] ${clave}: ${e?.message ?? e}`);
  }

  async precargar(descriptor) {
    if (!this.ctx || this.cerrado) return false;
    try { const d = await descriptor; if (!d) return false; await this._buffer(d); return true; }
    catch (e) { this.diagnostico('precarga', e); return false; }
  }

  async _buffer(d) {
    const key = d.banco ? `${d.banco}#${d.nombre}` : d.ruta;
    if (!key) throw new Error('recurso sin ruta ni banco');
    if (this.cache.has(key)) {
      const v = this.cache.get(key);
      this.cache.delete(key); this.cache.set(key, v);
      return v;
    }
    if (!this.cargas.has(key)) {
      const p = (async () => {
        const pcm = await this.cargar(d, this.ctx);
        let buffer = pcm.buffer;
        if (!buffer) {
          buffer = this.ctx.createBuffer(pcm.canales.length, pcm.canales[0].length, pcm.frecuencia);
          pcm.canales.forEach((c, i) => buffer.copyToChannel(c, i));
        }
        const { canales, ...metadatos } = pcm; // no retener otra copia PCM además del AudioBuffer
        const v = { ...metadatos, buffer, bytes: buffer.length * buffer.numberOfChannels * 4 };
        if (!this.cerrado) { this.cache.set(key, v); this._limpiarCache(); }
        return v;
      })().finally(() => this.cargas.delete(key));
      this.cargas.set(key, p);
    }
    return this.cargas.get(key);
  }

  _limpiarCache() {
    let total = [...this.cache.values()].reduce((s, v) => s + v.bytes, 0);
    for (const [k, v] of this.cache) {
      if (total <= this.limiteCache) break;
      if ([...this.activos].some((a) => a.buffer === v.buffer) || this.pista?.buffer === v.buffer) continue;
      this.cache.delete(k); total -= v.bytes;
    }
  }

  _nodo(tipo, d, pcm, opciones = {}) {
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = pcm.buffer;
    gain.gain.value = Math.max(0, Math.min(4, d.volumen ?? 1)) * (opciones.volumen ?? 1);
    source.playbackRate.value = Math.max(0.25, Math.min(4, d.tono ?? 1));
    source.connect(gain); gain.connect(this.canales[tipo]);
    const a = { source, gain, buffer: pcm.buffer, tipo, ambito: opciones.ambito, emisor: opciones.emisor, prioridad: d.prioridad ?? 0 };
    a.fin = new Promise((resolve) => { a.finalizar = resolve; });
    this.activos.add(a);
    source.onended = () => { this.activos.delete(a); source.disconnect(); gain.disconnect(); a.finalizar(); this._limpiarCache(); };
    this.contadores[tipo]++;
    return a;
  }

  _parar(a) {
    if (!a) return;
    this.activos.delete(a);
    try { a.source.stop(); } catch { /* ya terminó */ }
    a.source.disconnect(); a.gain.disconnect();
    a.finalizar();
  }

  // descriptor puede ser una promesa del catálogo. El turno se toma ANTES de esperarla.
  async sonar(tipo, descriptor, opciones = {}) {
    const ui = opciones.ambito === 'ui';
    const gen = ui ? this.generacionUI : this.generacion;
    const solicitado = Date.now();
    const emisor = opciones.emisor ?? 'voz';
    const voz = tipo === 'voces';
    if (voz) this.detenerVoz(emisor);
    const turno = this.turnosVoz.get(emisor);
    const bloqueado = () => opciones.signal?.aborted || this.cerrado || !this.ctx || this.ctx.state !== 'running' || this.pausas.has('oculto')
      || (this.pausas.has('menu') && !ui) || (ui ? this.generacionUI : this.generacion) !== gen
      || (ui && Date.now() - solicitado > 300) // un clic cargado demasiado tarde se descarta
      || (voz && this.turnosVoz.get(emisor) !== turno);
    if (bloqueado()) return false; // no guardar efectos mientras espera un gesto o está en pausa
    try {
      const d = await descriptor;
      if (!d || bloqueado()) return false;
      const pcm = await this._buffer(d);
      if (bloqueado()) return false;
      if (tipo === 'efectos') {
        const efectos = [...this.activos].filter((a) => a.tipo === tipo);
        if (efectos.length >= this.limiteEfectos) {
          const viejo = efectos.reduce((a, b) => a.prioridad <= b.prioridad ? a : b);
          this._parar(viejo);
        }
      }
      const a = this._nodo(tipo, d, pcm, { ...opciones, emisor });
      const cancelar = () => this._parar(a);
      opciones.signal?.addEventListener('abort', cancelar, { once: true });
      void a.fin.then(() => opciones.signal?.removeEventListener('abort', cancelar));
      a.source.start();
      if (opciones.esperarFin) await a.fin;
      return true;
    } catch (e) { this.diagnostico(tipo, e); return false; }
  }

  detenerVoz(emisor = 'voz') {
    this.turnosVoz.set(emisor, (this.turnosVoz.get(emisor) ?? 0) + 1);
    for (const a of this.activos) if (a.tipo === 'voces' && a.emisor === emisor) this._parar(a);
  }

  musica(id, descriptor, opciones = {}) {
    if (this.deseada?.id === id) {
      this.deseada.opciones = { ...this.deseada.opciones, ...opciones };
      if (this.pista) {
        this.pista.opciones = this.deseada.opciones;
        if (this.pista.nodo) this.pista.nodo.gain.gain.value = (this.pista.d.volumen ?? 1) * (this.pista.opciones.volumen ?? 1);
      }
      return this.deseada.promesa ?? (this.pista ? Promise.resolve(true) : this._continuarMusica());
    }
    this.turnoMusica++;
    this._parar(this.pista?.nodo);
    this.pista = null;
    this.deseada = id == null ? null : { id, descriptor, opciones };
    return this._continuarMusica();
  }

  async _continuarMusica() {
    const wanted = this.deseada;
    if (!wanted || this.cerrado || !this.ctx || this.ctx.state !== 'running' || this.pausas.size) return false;
    if (this.pista) { this._arrancarPista(); return true; }
    if (wanted.promesa) return wanted.promesa;
    const turno = this.turnoMusica;
    wanted.promesa = (async () => {
      try {
        const d = await wanted.descriptor;
        if (!d || turno !== this.turnoMusica || this.cerrado) return false;
        const pcm = await this._buffer(d);
        if (turno !== this.turnoMusica || this.cerrado) return false;
        this.pista = { ...pcm, d, opciones: wanted.opciones, offset: 0, nodo: null, terminada: false };
        this._arrancarPista();
        return true;
      } catch (e) { this.diagnostico(`música ${wanted.id}`, e); return false; }
      finally { wanted.promesa = null; }
    })();
    return wanted.promesa;
  }

  _arrancarPista() {
    const p = this.pista;
    if (!p || p.nodo || p.terminada || this.pausas.size || this.ctx.state !== 'running') return;
    const a = this._nodo('musica', p.d, p, p.opciones);
    a.source.loop = p.opciones.loop ?? p.d.loop ?? true;
    const frecuencia = p.frecuenciaOriginal ?? p.frecuencia ?? p.buffer.sampleRate ?? 1;
    a.source.loopStart = Math.max(0, p.d.loopInicio ?? (p.d.loopInicioMuestras ?? 0) / frecuencia);
    a.source.loopEnd = Math.min(p.buffer.duration, p.d.loopFin ?? (p.d.loopFinMuestras > 0 ? p.d.loopFinMuestras / frecuencia : p.buffer.duration));
    if (a.source.loopEnd <= a.source.loopStart) { a.source.loopStart = 0; a.source.loopEnd = p.buffer.duration; }
    p.inicio = this.ctx.currentTime;
    p.nodo = a;
    const terminado = a.source.onended;
    a.source.onended = () => { terminado(); if (p.nodo === a) { p.nodo = null; p.terminada = true; } };
    a.source.start(0, Math.min(p.offset, Math.max(0, p.buffer.duration - 0.001)));
  }

  pausar(motivo, valor) {
    if (this.pausas.has(motivo) === Boolean(valor)) return;
    if (valor) {
      this.pausas.add(motivo);
      this.transitorios();
      const p = this.pista;
      if (p?.nodo) {
        const a = p.nodo;
        p.offset += (this.ctx.currentTime - p.inicio) * a.source.playbackRate.value;
        if (a.source.loop && p.offset >= a.source.loopEnd) p.offset = a.source.loopStart + (p.offset - a.source.loopStart) % (a.source.loopEnd - a.source.loopStart);
        else if (p.offset >= p.buffer.duration) p.terminada = true;
        p.nodo = null; this._parar(a);
      }
      if (motivo === 'oculto') this.ctx?.suspend().catch((e) => this.diagnostico('suspender', e));
    } else {
      this.pausas.delete(motivo);
      if (motivo === 'oculto' && this.ctx) void this.activar();
      else void this._continuarMusica();
    }
  }

  transitorios({ conservarUI = false } = {}) {
    this.generacion++;
    if (!conservarUI) this.generacionUI++;
    for (const a of this.activos) if (a.tipo !== 'musica' && !(conservarUI && a.ambito === 'ui')) this._parar(a);
    this.turnosVoz.clear(); // la generación ya invalida cargas anteriores; no retener personajes de otras escenas
  }

  cerrar() {
    this.cerrado = true;
    this.transitorios(); this.turnoMusica++;
    this._parar(this.pista?.nodo); this.pista = null; this.deseada = null;
    this.cache.clear();
    this.ctx?.close().catch(() => {});
  }
}
