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
// oscurece; la ilustración va en el sitio del objeto; el texto sale a VELOCIDAD caracteres/s.
// Audio D69; registro/fades D81; SS/resumen D82; shake/gamma y popups D83. Elecciones pendientes.

import { Pantalla, baseCanvas, desplazarLista, mul, trasladar } from './pantalla.js';
import {crearRegistro,crearSalto,crearResumen,registroVisible} from './historia_menus.js';
import {EfectosHistoria} from './historia_efectos.js';
import {TransicionDialogo} from './historia_transiciones.js';
import { audio, motor } from '../audio/index.js';
import { montarAjustes } from '../audio/ajustes.js';

const RUTA = 'ui/adventure_story/adventure_story.csb';
const VELOCIDAD = 40; // caracteres por segundo (PROVISIONAL)
const HUECOS = { 1: 'character_1', 2: 'character_2', 3: 'character_3' };
const CAPAS = [['cara', 'face', '1'], ['accesorio', 'option', '2'], ['pelo', 'hair', '3']]; // posición de la capa
const OSCURO = { r: 130, g: 130, b: 130 };

let cachePosiciones = null;
let cacheMisiones = null;
let cacheEfectos = null;
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
    cacheEfectos ??= json(rutaWeb('/data/historias/efectos.json'));
    const [datos, p, posiciones, efectos] = await Promise.all([json(rutaWeb(`/data/historias/${id}.json`)), Pantalla.cargar(RUTA), cachePosiciones,cacheEfectos]);
    if (!datos?.lineas?.length) return null;
    return new Historia(p, datos, posiciones ?? {},efectos??{});
  }

  constructor(p, datos, posiciones, efectos={}) {
    this.p = p;
    this.datos = datos;
    this.posiciones = posiciones;
    this.i = -1; // línea actual
    this.huecos = {}; // hueco → { personaje, nombre }
    this.texto = '';
    this.mostrado = 0; // caracteres ya escritos
    this.terminada = false;
    this.registro = [];
    this.modal = null;
    this.efectos=new EfectosHistoria(efectos,{cargarAnimacion:async e=>{
      const {cargarAnimacionHistoria}=await import('./historia_animacion.js');return cargarAnimacionHistoria(e);
    }});
    this.p.mostrar('button_log', true);
    this.p.mostrar('button_skip',datos.permitirSalto!==false);
    this.fondo = p.buscar('background');
    this.fondo._x0=this.fondo.x;this.fondo._y0=this.fondo.y;
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
    this._preparando=true;
    const indice=this.i,efecto=this.efectos.ejecutar(ln.entradas.map(e=>e.efectoAntes),'antes');
    const presentar=()=>{if(!this.terminada&&this.i===indice){this._preparando=false;this.presentarLinea(ln);}};
    if(this.efectos.ocupado)void efecto.then(presentar);else presentar();
  }

  presentarLinea(ln) {
    let habla = null;
    let still = null, objeto = null;
    for (const e of ln.entradas) {
      if (this._reproduciendo) this.sonidoEntrada(e);
      if (e.fondo) {
        this.fondo.imagen = imagen(`images/story/background/${e.fondo}.jpg`);
        this.huecos = {}; // PROVISIONAL: el fondo nuevo empieza sin personajes
        this.efectos.movimientos.clear(); // No dejar RepeatForever asociado a un retrato retirado.
      }
      if (e.still) still = e.still;
      if (e.objeto) objeto = e.objeto;
      const hueco = HUECOS[e.posicion ?? 1] ? (e.posicion ?? 1) : null;
      if (e.personaje && hueco) {
        // Un personaje (carpeta) está en un solo hueco.
        for (const [k, h] of Object.entries(this.huecos)) if (h.personaje.carpeta === e.personaje.carpeta&&Number(k)!==hueco){delete this.huecos[k];this.efectos.mover(Number(k),0);}
        if(this.huecos[hueco]?.personaje.carpeta!==e.personaje.carpeta)this.efectos.mover(hueco,0);
        this.huecos[hueco] = { personaje: e.personaje, nombre: e.nombre };
      }
      if (e.texto != null) habla = { ...e, hueco };
    }
    this.objeto.imagen = still ? imagen(`images/story/still/${still}.jpg`) : objeto ? imagen(`images/story/item/${objeto}.png`) : null;
    this.hablante = habla?.hueco ?? null;
    this.p.texto('text_character_name', habla?.nombre ?? '');
    this.texto = habla?.texto ?? '';
    if (habla?.texto != null) this.registro.push({indice:this.i,nombre:habla.nombre??'',texto:this.texto,voz:habla.voz??0});
    this.mostrado = 0;
    this.p.texto('text_talk', '');
    this.ponerPersonajes();
    for(const e of ln.entradas)if(e.personaje)this.efectos.mover(e.posicion??1,e.movimientoAntes??e.f20??0);
    this.p.precargar().catch(() => {});
    if (!habla) this.mostrado = 0; // línea sin texto: espera el toque igual
  }

  // Compone cada hueco: el cuerpo en el nodo del hueco y la cara, el accesorio y el pelo como hijos.
  ponerPersonajes() {
    for (const [k, nombre] of Object.entries(HUECOS)) {
      const n = this.p.buscar(nombre);
      const h = this.huecos[k];
      n._y0 ??= n.y;
      n._x0 ??= n.x;
      if (!h?.personaje?.cuerpo) { n.imagen = null; n.hijos = [];this.efectos.mover(Number(k),0);continue; }
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
    if (this.terminada || this._avanzando || this._preparando || this.modal || this.efectos?.ocupado) return;
    if (this.escribiendo) this.mostrado = this.texto.length;
    else {
      this._avanzando = true;
      this.cancelarSonidoLinea();
      this.audioLinea = new AbortController();
      const signal = this.audioLinea.signal;
      const entradas=this.datos.lineas[this.i]?.entradas??[];
      const espera=entradas.reduce((prev,e)=>e.espera>0?e.espera:prev,0)/1000;
      for(const e of entradas)if(e.personaje)this.efectos?.mover(e.posicion??1,e.movimientoDespues??e.f21??0);
      // FUN_005dac24: sonido/BGM posteriores; esperar al SE antes de cambiar de línea.
      await Promise.all([this.efectos?.esperar(espera),this.efectos?.ejecutar(entradas.map(e=>e.efectoDespues),'despues'),...entradas.map(async (e) => {
        if (e.musica2 > 0) void audio.musica(e.musica2, { volumen: (e.volumenMusica ?? 10000) / 10000 });
        if (e.sonido2 > 0) await audio.efecto(e.sonido2, { ambito: 'historia', signal, esperarFin: true });
      })]);
      this._avanzando = false;
      if (!this.terminada && !signal.aborted) {
        if(this.modal)this._siguientePendiente=true;else this.siguiente();
      }
    }
  }

  saltar() {
    this.terminada = true;
    this.cerrarRegistro(true);
    this.efectos?.cancelar();
    if(this.fondo){this.fondo.gamma=1;this.aplicarDesplazamientos();}
    this.cancelarSonidoLinea();
    this._fin?.(); // termina ya (sin esperar al siguiente cuadro, que no llega con la pestaña oculta)
  }

  actualizar(dt) {
    if(this.modal){
      this.modal.transicion?.actualizar(dt);
      if(this.modal.transicion?.cerrada)this.cerrarRegistro(true);
      return;
    }
    this.efectos?.actualizar(dt);
    this.aplicarDesplazamientos();
    if (!this._preparando&&!this.efectos?.ocupado && this.escribiendo) this.mostrado = Math.min(this.texto.length, this.mostrado + VELOCIDAD * dt);
    this.p.texto('text_talk', this.texto.slice(0, Math.floor(this.mostrado)));
    this.p.mostrar('icon_next', !this.escribiendo&&!this._preparando&&!this.efectos?.ocupado&&!this._avanzando);
  }

  aplicarDesplazamientos(){
    // Shake12 afecta al padre del CSB completo; no cambia la posición del sprite background.
    this.fondo.x=this.fondo._x0;this.fondo.y=this.fondo._y0;
    for(const [k,nombre] of Object.entries(HUECOS)){
      const n=this.p.buscar(nombre);if(n?._y0!=null){
        n.y=n._y0+(this.huecos[k]?.personaje.dy??0)+(this.efectos?.desplazamiento(Number(k))??0);
        n.x=n._x0+(this.efectos?.desplazamientoX(Number(k))??0);
      }
    }
  }

  dibujar(ctx) {
    const c = ctx.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    this.fondo.gamma=this.efectos?.gammaFondo??1;
    const [dx,dy]=this.efectos?.desplazamientoFondo()??[0,0],base=baseCanvas(c);
    if(dx||dy){
      // El padre ClippingNode incluye el CSB, fades y SS. Componer primero evita desplazar dos veces el fondo copiado por SS.
      this.canvasEscena??=document.createElement('canvas');const escena=this.canvasEscena;
      if(escena.width!==c.width||escena.height!==c.height){escena.width=c.width;escena.height=c.height;}
      const x=escena.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,c.width,c.height);
      this.p.dibujar(x,base);this.efectos?.dibujar(x);
      const traslado=trasladar(dx*base[0],dy*base[3]);
      ctx.setTransform(...traslado);ctx.globalAlpha=1;ctx.drawImage(escena,0,0);
      // Mantener hit testing y recortes en las mismas coordenadas que los botones desplazados.
      this.p.zonas=this.p.zonas.map(z=>({...z,m:mul(traslado,z.m),recortes:z.recortes?.map(r=>({...r,m:mul(traslado,r.m)}))}));
    }else{this.p.dibujar(ctx,base);this.efectos?.dibujar(ctx);}
    if(this.modal){
      ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.fillStyle=`rgba(0,0,0,${this.modal.transicion?.oscurecedor??205/255})`;ctx.fillRect(0,0,c.width,c.height);
      this.modal.pantalla?.dibujar(ctx,baseCanvas(c));
    }
  }

  /** Botón de la pantalla bajo (x, y) del canvas (px), o null. */
  botonEn(x, y) {
    if(this.modal?.transicion&&!this.modal.transicion.interactiva)return null;
    const p=this.modal?.pantalla??this.p;
    return p.nodoEn(x,y,n=>['button_skip','button_log','button_close','button_ok','text_confirm'].includes(n.nombre)||n.nombre.startsWith('registro_voz_'))?.nombre??null;
  }

  async abrirRegistro(){
    if(this.terminada||this.modal||this._avanzando)return;
    const modal=this.modal={tipo:'registro',pantalla:null};this.cancelarSonidoLinea();
    try{
      const p=await crearRegistro(registroVisible(this.registro,this._preparando?this.i-1:this.i,this._preparando?Infinity:this.mostrado));
      if(!this.terminada&&this.modal===modal){modal.pantalla=p;modal.transicion=new TransicionDialogo(p);}
    }catch(err){if(this.modal===modal)this.modal=null;console.warn('registro: no se pudo abrir',err);}
  }

  cerrarRegistro(inmediato=false){
    if(!inmediato&&this.modal?.transicion&&!this.modal.transicion.cerrada){
      this.vozRegistro?.abort();audio.detenerVoz('registro-historia');this.arrastreRegistro=null;this.modal.transicion.cerrar();return;
    }
    this.vozRegistro?.abort();audio.detenerVoz('registro-historia');this.modal=null;this.arrastreRegistro=null;
    if(this._siguientePendiente){this._siguientePendiente=false;if(!this.terminada)this.siguiente();}
  }

  async confirmarSalto(){
    if(this.terminada||this.modal)return;
    const permitido=this.datos.permitirSalto!==false;
    const tipo=!permitido?'aviso':this.datos.resumen?'resumen':'salto';
    const modal=this.modal={tipo,pantalla:null};
    if(!this._avanzando)this.cancelarSonidoLinea();
    try{const p=await (tipo==='resumen'?crearResumen(this.datos):crearSalto({permitido}));if(!this.terminada&&this.modal===modal){modal.pantalla=p;modal.transicion=new TransicionDialogo(p);}}
    catch(err){if(this.modal===modal)this.modal=null;console.warn('historia: no se pudo abrir confirmación',err);}
  }

  listaModal(){return this.modal?.pantalla?.buscar('list_view_log')??this.modal?.pantalla?.buscar('list_view_resumen');}

  repetirVoz(nombre){
    const id=this.modal?.pantalla?.buscar(nombre)?._voz;if(!(id>0))return;
    this.vozRegistro?.abort();this.vozRegistro=new AbortController();
    void audio.voz(id,{emisor:'registro-historia',ambito:'historia',signal:this.vozRegistro.signal});
  }

  /**
   * Reproduce la historia en `canvas` hasta el final (toque, Espacio, Intro o Z avanzan; Escape o «Skip» la
   * abren la confirmación de salto). L abre el registro. Devuelve una promesa al terminar.
   */
  reproducir(canvas) {
    montarAjustes();
    this._reproduciendo = true;
    const musicaAnterior = motor.deseada;
    audio.escena(`historia:${this.datos.id}`);
    if(!this._preparando)for (const e of this.datos.lineas[this.i]?.entradas ?? []) this.sonidoEntrada(e);
    const ctx = canvas.getContext('2d');
    return new Promise((resolver) => {
      let ultimo = performance.now();
      const toque = (ev) => {
        if (ev.target.closest?.('[data-audio-ui]')) return;
        const r = canvas.getBoundingClientRect();
        const x = ((ev.clientX - r.left) * canvas.width) / r.width, y = ((ev.clientY - r.top) * canvas.height) / r.height;
        const boton=this.botonEn(x,y);
        if(this.modal){
          if(this.modal.transicion&&!this.modal.transicion.interactiva){ev.stopImmediatePropagation();return;}
          const lista=this.listaModal();
          if(lista&&this.modal.pantalla.nodoEn(x,y,n=>n===lista)) this.arrastreRegistro={x,y,boton,desde:lista._desplaz??0,movido:false};
          else if(boton==='button_close')this.cerrarRegistro();
          else if(boton==='button_ok'&&['salto','resumen'].includes(this.modal.tipo))this.saltar();
        }else if(boton==='button_skip')void this.confirmarSalto();
        else if(boton==='button_log')void this.abrirRegistro();
        else void this.avanzar();
        ev.stopImmediatePropagation(); // que no lo reciba el HUD de batalla
      };
      const tecla = (ev) => {
        if (ev.target.closest?.('[data-audio-ui]')) return;
        if(ev.ctrlKey||ev.metaKey||ev.altKey)return;
        if(this.modal){
          if(this.modal.transicion&&!this.modal.transicion.interactiva&&ev.code!=='Escape'){ev.preventDefault();ev.stopImmediatePropagation();return;}
          if(ev.code==='Escape')this.cerrarRegistro();
          else if(['Enter','NumpadEnter'].includes(ev.code)){
            if(['salto','resumen'].includes(this.modal.tipo))this.saltar();else if(this.modal.tipo==='aviso')this.cerrarRegistro();else return;
          }
          else if(['ArrowUp','ArrowDown','PageUp','PageDown'].includes(ev.code)){
            const n=this.listaModal();if(n)desplazarLista(n,0,(['ArrowUp','PageUp'].includes(ev.code)?-1:1)*(ev.code.startsWith('Page')?500:100));
          }else return;
        }else if(ev.code==='KeyL')void this.abrirRegistro();
        else if (['Space', 'Enter', 'KeyZ', 'NumpadEnter'].includes(ev.code)) void this.avanzar();
        else if (ev.code === 'Escape') void this.confirmarSalto();
        else return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
      };
      // En window: el canvas del HUD de batalla no recibe toques (pointer-events: none).
      addEventListener('pointerdown', toque, true);
      addEventListener('keydown', tecla, true);
      const mover=(ev)=>{
        const t=this.arrastreRegistro;if(!t)return;
        const r=canvas.getBoundingClientRect(),y=(ev.clientY-r.top)*canvas.height/r.height;
        if(Math.abs(y-t.y)>12*devicePixelRatio)t.movido=true;
        if(t.movido){const n=this.listaModal();if(n)desplazarLista(n,0,(t.y-y)/baseCanvas(canvas)[0],{y:t.desde});}
        ev.stopImmediatePropagation();
      };
      const soltar=(ev)=>{const t=this.arrastreRegistro;this.arrastreRegistro=null;if(t&&!t.movido){if(t.boton?.startsWith('registro_voz_'))this.repetirVoz(t.boton);else if(t.boton==='text_confirm'&&this.modal?.tipo==='resumen')this.saltar();}if(this.modal||t)ev.stopImmediatePropagation();};
      const cancelar=(ev)=>{this.arrastreRegistro=null;if(this.modal)ev.stopImmediatePropagation();};
      const rueda=(ev)=>{
        if(!this.modal)return;const n=this.modal.transicion&&!this.modal.transicion.interactiva?null:this.listaModal();if(n)desplazarLista(n,0,ev.deltaY);
        ev.preventDefault();ev.stopImmediatePropagation();
      };
      addEventListener('pointermove',mover,true);addEventListener('pointerup',soltar,true);addEventListener('wheel',rueda,{capture:true,passive:false});
      addEventListener('pointercancel',cancelar,true);
      this._fin = () => {
        this._fin = null;
        removeEventListener('pointerdown', toque, true);
        removeEventListener('keydown', tecla, true);
        removeEventListener('pointermove',mover,true);removeEventListener('pointerup',soltar,true);removeEventListener('wheel',rueda,true);
        removeEventListener('pointercancel',cancelar,true);
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
