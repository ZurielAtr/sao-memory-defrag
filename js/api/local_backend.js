// Backend local (F3, D41): hace de servidor dentro del navegador, como el DummyDriver del juego
// original en modo offline, pero guardando el estado de la cuenta (R8: simulado ahora, preparado
// para un servidor real con HttpBackend).
//
// Qué está CONFIRMADO del juego (Ghidra, DummyDriver; ver NOTAS.md "F3: servidor simulado"):
//   - quest/start responde exactamente {"data":{"diamond":{"continue":0,"treasure_box":0}}}.
//   - user/register, quest/save y quest/continue responden con cuerpo vacío y éxito
//     (el DummyDriver llama al callback con "" y 1); aquí: `{}`.
//   - quest/result no pasa por el driver: offline el cliente calcula el resultado él mismo.
//   - user/all offline se arma desde el estado guardado en el dispositivo (no hay JSON fijo).
// Todo lo demás (formato de user/all, user/quest, quest/result, errores, reglas de recompensa)
// es PROVISIONAL: diseño propio para que el juego funcione, no el formato original.

import { MemoryStore } from './store.js';
import { equipoCompatible, RANURAS_EQUIPO } from '../equipo.js';
import { consultarRanura, consultarNodo } from '../habilidades.js';
import { consultarOperacion, selloOperacion, normalizarOperacion, MODOS_EQUIPO } from '../operaciones_equipo.js';
import {consultarReclutamiento,selloReclutamiento,sortearPersonaje} from '../reclutamiento.js';
import {REGALO_INICIAL} from './configuracion.js';

export const SCHEMA_VERSION = 5;

// Migraciones del estado guardado: MIGRACIONES[n] convierte un estado de versión n a n + 1.
// Al cambiar el formato del estado se sube SCHEMA_VERSION y se agrega aquí la conversión.
const MIGRACIONES = {
  1: (estado) => {
    for (const c of estado.characters) c.weapon_uid ??= null;
    for (const e of estado.equipment) e.level ??= 1;
    return estado;
  },
  2: (estado) => {
    for (const c of estado.characters) { c.armor_uid ??= null; c.accessory_uid ??= null; }
    return estado;
  },
  3: (estado) => {
    // D78: ausencia de un estado confirmado equivale a0, como el ctor nativo.
    for (const c of estado.characters) c.passive_skill ??= [];
    return estado;
  },
  4: (estado, master) => {
    for (const c of estado.characters) {
      c.slot_skill ??= [];
      c.ability_board ??= [];
      c.unlocked_ability_release_level ??= 1;
      c.unlocked_limit_break_node_count ??= 0;
      c.selected_limit_break_direction ??= [];
      c.growth_nodes ??= [];
      // Continuidad del port: conservar las habilidades básicas ya disponibles.
      // Son registros explícitos locales; no una inferencia del ctor nativo (0).
      c.active_skill ??= (master.personaje(c.character_id)?.activas ?? []).filter((id) => id > 0)
        .map((id) => ({ master_active_skill_id: id, level: 1 }));
    }
    return estado;
  },
};

// Respuesta real del DummyDriver (FUN_00ab125c). CONFIRMADA.
const RESPUESTA_QUEST_START = { data: { diamond: { continue: 0, treasure_box: 0 } } };

// Tipos de reward_content.f2. PROVISIONAL: deducidos de las etiquetas (f4) de reward_content.
export const TIPO_RECOMPENSA = {
  OBJETO: 1, // "HP Shard x1"
  EQUIPO: 2, // "Asuna's Kitchen Knife R2"
  DIAMANTE: 3, // "Memory Diamond x5"
  COL: 4, // "Col x1000"
  PERSONAJE: 5, // "[AR Idol] Yuna"
};

class ClientError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => { throw new ClientError(code, message); };
const copy = (x) => JSON.parse(JSON.stringify(x));

export class LocalBackend {
  /**
   * @param {object} o
   * @param {import('./master.js').Master} o.master
   * @param {{get, set, remove}} [o.store]  MemoryStore (por defecto) o LocalStorageStore
   * @param {string} [o.cuenta]  clave del estado en el almacén (una cuenta por clave)
   * @param {() => number} [o.now]  reloj (ms), inyectable para pruebas
   * @param {() => number} [o.random]  aleatorio [0, 1), inyectable para pruebas
   * @param {number[]} [o.iniciales]  personajes de una cuenta nueva (PROVISIONAL: el del juego web)
   */
  constructor({ master, store = new MemoryStore(), cuenta = 'cuenta', now = () => Date.now(),
    random = Math.random, iniciales = [34001], diamantesIniciales=REGALO_INICIAL.diamantes } = {}) {
    if (!master) throw new TypeError('LocalBackend necesita master');
    this.master = master;
    this.store = store;
    this.key = cuenta;
    this.now = now;
    this.random = random;
    this.iniciales = iniciales;
    if(!Number.isSafeInteger(diamantesIniciales)||diamantesIniciales<0)throw new TypeError('Saldo inicial de diamantes inválido');
    this.diamantesIniciales=diamantesIniciales;
    this.cola = Promise.resolve(); // las peticiones se atienden de una en una, como un servidor
  }

  handle(route, params) {
    const run = this.cola.then(() => this.atender(route, params));
    this.cola = run.catch(() => {});
    return run;
  }

  async atender(route, params) {
    const handler = RUTAS[route];
    if (!handler) {
      return { error: { code: 'no_implementada', message: `ruta no implementada en el servidor local: ${route}` } };
    }
    try {
      const estado = await this.cargar();
      if (handler.cuenta && !estado) fail('sin_cuenta', 'no hay cuenta: llamar antes a user/register');
      const { respuesta, nuevo } = handler.fn.call(this, estado, params ?? {});
      if (nuevo) await this.guardar(nuevo);
      return respuesta;
    } catch (e) {
      if (e instanceof ClientError) return { error: { code: e.code, message: e.message } };
      throw e;
    }
  }

  async cargar() {
    const texto = await this.store.get(this.key);
    if (texto == null) return null;
    let estado;
    try {
      estado = JSON.parse(texto);
    } catch {
      fail('cuenta_corrupta', 'el estado guardado no es JSON válido');
    }
    if (estado.schema > SCHEMA_VERSION) {
      fail('schema_nuevo', `la cuenta es de una versión más nueva (${estado.schema} > ${SCHEMA_VERSION})`);
    }
    let migrado = false;
    while (estado.schema < SCHEMA_VERSION) {
      const migrar = MIGRACIONES[estado.schema];
      if (!migrar) fail('schema_sin_migracion', `no hay migración desde la versión ${estado.schema}`);
      estado = migrar(estado, this.master);
      estado.schema += 1;
      migrado = true;
    }
    if (migrado) await this.guardar(estado);
    return estado;
  }

  async guardar(estado) {
    estado.user.updated_at = this.now();
    await this.store.set(this.key, JSON.stringify(estado));
  }

  /** Borra la cuenta del almacén (solo local; útil para pruebas y "empezar de nuevo"). */
  async borrarCuenta() {
    await this.store.remove(this.key);
  }

  // ---- reglas compartidas ----

  /**
   * Progresión (D55): ¿está abierta la misión en esa dificultad? `requiere` = [misión, dificultad] de
   * quest_appearance.json (DEDUCCIÓN de los datos: la cadena 1-1 → 2-1 → Story 2-2 → 2-3…; la
   * dificultad 2 de cada misión pide la 1 de la misma). null o sin dato = abierta desde el inicio
   * (sin dato: PROVISIONAL). Completada = hay progreso guardado (quest/result con cleared).
   */
  desbloqueada(estado, questId, difficulty) {
    const req = this.master.mision(questId)?.dificultades?.[difficulty]?.requiere;
    if (!req) return true;
    const [qid, dif] = req;
    return !!estado.quests[qid]?.[dif];
  }

  /** Misiones abiertas: [{quest_id, difficulty}] (formato PROVISIONAL). */
  disponibles(estado) {
    const out = [];
    for (const [qid, q] of Object.entries(this.master.data.misiones ?? {})) {
      for (const dif of Object.keys(q.dificultades ?? {})) {
        if (this.desbloqueada(estado, qid, dif)) out.push({ quest_id: Number(qid), difficulty: Number(dif) });
      }
    }
    return out;
  }

  nuevoPersonaje(estado, characterId) {
    const m = this.master.personaje(characterId);
    if (!m) fail('personaje_inexistente', `personaje ${characterId} no está en la master data`);
    const p = { uid: estado.siguienteUid++, character_id: characterId, level: 1, exp: 0,
      weapon_uid: null, armor_uid: null, accessory_uid: null, passive_skill: [],
      active_skill: (m.activas ?? []).filter((id) => id > 0).map((id) => ({ master_active_skill_id: id, level: 1 })),
      slot_skill: [], ability_board: [], unlocked_ability_release_level: 1,
      unlocked_limit_break_node_count: 0, selected_limit_break_direction: [], growth_nodes: [], created_at: this.now() };
    estado.characters.push(p);
    return p;
  }

  /** Suma exp a un personaje y sube de nivel (PROVISIONAL: tabla character_level, tope por rareza). */
  darExp(personaje, exp) {
    const rareza = this.master.personaje(personaje.character_id)?.rareza;
    // Contrato local: cuatro rupturas añaden cinco niveles cada una; cap +20
    // usado ya en characterStats. El servidor original no se recuperó.
    const tope = this.master.nivelMaximo(rareza) + 5 * Math.min(4, Math.max(0, personaje.unlocked_limit_break_node_count ?? 0));
    const antes = personaje.level;
    personaje.exp = Math.min(personaje.exp + exp, this.master.expParaNivel(tope));
    while (personaje.level < tope && personaje.exp >= this.master.expParaNivel(personaje.level + 1)) {
      personaje.level += 1;
    }
    return personaje.level - antes;
  }

  /** Aplica un reward_content a la cuenta. Tipos sin implementar quedan en `otrasRecompensas`. */
  aplicarRecompensa(estado, r) {
    const n = r.cantidad ?? 1;
    switch (r.tipo) {
      case TIPO_RECOMPENSA.OBJETO:
        estado.items[r.id] = (estado.items[r.id] ?? 0) + n;
        break;
      case TIPO_RECOMPENSA.EQUIPO:
        for (let i = 0; i < n; i++) {
          estado.equipment.push({ uid: estado.siguienteUid++, equipment_id: r.id, level: 1, created_at: this.now() });
        }
        break;
      case TIPO_RECOMPENSA.DIAMANTE:
        estado.user.diamond += n;
        break;
      case TIPO_RECOMPENSA.COL:
        estado.user.col += n;
        break;
      case TIPO_RECOMPENSA.PERSONAJE:
        for (let i = 0; i < n; i++) this.nuevoPersonaje(estado, r.id);
        break;
      default: {
        const k = `${r.tipo}:${r.id ?? ''}`;
        estado.otrasRecompensas[k] = (estado.otrasRecompensas[k] ?? 0) + n;
      }
    }
  }

  /**
   * Sortea los drops de una lista de drop_id (uno por enemigo derrotado).
   * PROVISIONAL: en cada grupo de drop.json se tira un número en [0, 10000) y se recorre la
   * probabilidad acumulada (`prob`, sobre 10000) de sus entradas; si no cae en ninguna, no hay drop.
   */
  sortearDrops(dropIds) {
    const out = [];
    for (const id of dropIds) {
      for (const grupo of this.master.drop(id) ?? []) {
        const tiro = this.random() * 10000;
        let acum = 0;
        for (const entrada of grupo) {
          acum += entrada.prob;
          if (tiro < acum) {
            out.push(...(this.master.recompensa(entrada.recompensa) ?? []));
            break;
          }
        }
      }
    }
    return out;
  }
}

// ---- formatos de salida (PROVISIONALES) ----

function vistaUsuario(estado) {
  const { id, name, exp, col, diamond, created_at } = estado.user;
  return { id, name, exp, col, diamond, created_at,hacking_crystals:estado.user.hacking_crystals??0 };
}

function vistaInventario(estado) {
  return {
    characters: copy(estado.characters),
    equipment: copy(estado.equipment),
    items: Object.entries(estado.items).map(([id, count]) => ({ item_id: Number(id), count })),
    equipment_exchanged_ids: [...(estado.equipment_exchanged_ids??[])],
  };
}

// ---- rutas ----
// Cada ruta: { cuenta: requiere cuenta, fn(estado, params) -> { respuesta, nuevo? } }.
// `nuevo` es el estado a guardar (se guarda entero al final: cada petición es atómica).

function personajePropio(estado, uid) {
  if (!Number.isSafeInteger(uid) || uid <= 0) fail('personaje_invalido', 'Personaje inválido');
  const c = estado.characters.find((c) => c.uid === uid);
  if (!c) fail('personaje_ajeno', 'El personaje no pertenece a la cuenta');
  return c;
}

function consumirMateriales(estado, costes) {
  for (const r of costes) estado.items[r.id] -= r.cantidad;
}

function asignarEquipo(backend, estado, { character_uid, slot, equipment_uid }) {
  if (!Object.hasOwn(RANURAS_EQUIPO, slot)) fail('ranura_invalida', 'ranura de equipo inválida');
  if (!Number.isSafeInteger(character_uid) || character_uid <= 0) fail('personaje_invalido', 'personaje inválido');
  const c = estado.characters.find((c) => c.uid === character_uid);
  if (!c) fail('personaje_ajeno', 'el personaje no pertenece a la cuenta');
  const arma = slot === 'weapon', prefijo = arma ? 'arma' : 'equipo';
  if (equipment_uid !== null) {
    if (!Number.isSafeInteger(equipment_uid) || equipment_uid <= 0) fail(arma ? 'arma_invalida' : 'equipo_invalido', 'equipo inválido');
    const e = estado.equipment.find((e) => e.uid === equipment_uid);
    if (!e) fail('equipo_ajeno', 'el equipo no pertenece a la cuenta');
    if (!equipoCompatible(backend.master.personaje(c.character_id), backend.master.equipo(e.equipment_id), slot)) {
      fail(`${prefijo}_incompatible`, 'ese equipo no es compatible con la ranura o el personaje');
    }
    const dueño = estado.characters.find((p) => Object.entries(RANURAS_EQUIPO)
      .some(([r, f]) => p[f] === equipment_uid && (p.uid !== c.uid || r !== slot)));
    if (dueño) fail(`${prefijo}_en_uso`, `el equipo está equipado por ${backend.master.personaje(dueño.character_id)?.nombre ?? 'otro personaje'}`);
  }
  c[RANURAS_EQUIPO[slot]] = equipment_uid;
  return { respuesta: { data: { character: copy(c) } }, nuevo: estado };
}

const RUTAS = {
  'lottery/last-result':{cuenta:true,fn(estado){
    const ultimo=estado.last_lottery_result??estado.operation_receipts?.findLast(r=>r.mode==='recruit')?.respuesta?.data??null;
    return {respuesta:{data:copy(ultimo)}};
  }},
  'lottery/quote':{cuenta:true,fn(estado,params){
    const q=consultarReclutamiento(this.master,estado,params);
    return {respuesta:{data:{...q,quote:q.permitida?selloReclutamiento(estado,q):null}}};
  }},
  'lottery/draw':{cuenta:true,fn(estado,{banner_id,count,quote}){
    if(typeof quote!=='string'||!quote)fail('confirmacion_requerida','Consulta el banner y confirma el coste antes de reclutar');
    const recibo=estado.operation_receipts?.find(r=>r.quote===quote);
    if(recibo){
      if(recibo.mode!=='recruit'||recibo.params.banner_id!==banner_id||recibo.params.count!==count)fail('confirmacion_invalida','La selección cambió');
      return {respuesta:copy(recibo.respuesta)};
    }
    const q=consultarReclutamiento(this.master,estado,{banner_id,count});
    if(!q.permitida)fail(q.code,q.motivo);
    if(quote!==selloReclutamiento(estado,q))fail('inventario_cambiado','El banner o tu colección cambió; revisa de nuevo el sorteo');
    const sorteados=Array.from({length:count},()=>sortearPersonaje(q.banner,this.random));
    estado.user.diamond-=q.coste;
    // D109: banner de armas. Cada arma es una pieza nueva del almacén (no hay repetidos).
    const resultados=q.banner.tipo==='arma'?sorteados.map(id=>{
      const pieza={uid:estado.siguienteUid++,equipment_id:id,level:1,created_at:this.now()};
      (estado.equipment??=[]).push(pieza);
      return {equipment_id:id,duplicate:false,equipment:copy(pieza)};
    }):sorteados.map(id=>{
      const duplicado=estado.characters.some(c=>c.character_id===id),rareza=this.master.personaje(id).rareza;
      if(duplicado){const cristales=q.banner.duplicados?.[rareza];if(!Number.isSafeInteger(cristales)||cristales<0)fail('datos_incompletos','Falta la compensación del personaje repetido');
        estado.user.hacking_crystals=(estado.user.hacking_crystals??0)+cristales;
        return {character_id:id,duplicate:true,hacking_crystals:cristales};}
      return {character_id:id,duplicate:false,character:copy(this.nuevoPersonaje(estado,id))};
    });
    const respuesta={data:{banner_id,count,cost:q.coste,results:resultados,user:vistaUsuario(estado)}};
    estado.last_lottery_result=copy(respuesta.data);
    (estado.operation_receipts??=[]).push({quote,mode:'recruit',params:{banner_id,count},respuesta:copy(respuesta)});
    estado.operation_receipts=estado.operation_receipts.slice(-32);
    return {respuesta,nuevo:estado};
  }},
  'equipment/quote': {
    cuenta: true,
    fn(estado, {mode,...params}) {
      const q=consultarOperacion(this.master,estado,mode,params,this.now());
      return {respuesta:{data:{...q,quote:q.permitida?selloOperacion(estado,q):null}}};
    },
  },
  'character/ability-board': {
    cuenta: true,
    fn(estado, { character_uid, local_node_id, direction, choose_master_item_id, use_hacking_crystals=false }) {
      const c = personajePropio(estado, character_uid);
      if (!Number.isSafeInteger(local_node_id) || local_node_id <= 0) fail('nodo_invalido', 'Nodo inválido');
      const pj = this.master.personaje(c.character_id);
      const compra = consultarNodo(pj, c, this.master.habilidades(), estado, local_node_id,
        { direccion: direction, material: choose_master_item_id,cristales:use_hacking_crystals });
      if (!compra.disponible) fail(compra.code, compra.motivo);
      consumirMateriales(estado, compra.costes);
      if(compra.cristales)estado.user.hacking_crystals-=compra.cristales;
      c.ability_board.push(local_node_id);
      c.unlocked_ability_release_level = compra.liberacion;
      const n = compra.nodo;
      if (n.tipo === 9) {
        c.unlocked_limit_break_node_count += 1;
        c.selected_limit_break_direction.push({ local_node_id, selected_direction: compra.direccion });
      }
      if (n.tipo === 10) c.growth_nodes.push({ growth_node_id: n.id, node_type: compra.direccion });
      if (n.tipo === 12) {
        const id = pj.pasivas[n.habilidad.ranura - 1];
        c.passive_skill = c.passive_skill.filter(r=>r.master_passive_skill_id!==id);
        c.passive_skill.push({ master_passive_skill_id: id, status: n.habilidad.estado });
      }
      if (n.tipo === 11) {
        const id = pj.activas[n.habilidad.ranura - 1];
        const nivel = Math.max(n.habilidad.nivel, ...c.active_skill.filter(r=>r.master_active_skill_id===id).map(r=>r.level));
        c.active_skill = c.active_skill.filter(r=>r.master_active_skill_id!==id);
        c.active_skill.push({ master_active_skill_id: id, level: nivel });
      }
      return { respuesta: { data: { character: copy(c), items: vistaInventario(estado).items,user:vistaUsuario(estado) } }, nuevo: estado };
    },
  },
  'character/slot-skill': {
    cuenta: true,
    fn(estado, { character_uid, slot, expected_level, choose_master_item_id = null }) {
      const c = personajePropio(estado, character_uid);
      if (!Number.isSafeInteger(slot) || slot <= 0) fail('ranura_invalida', 'Ranura inválida');
      const actual = c.slot_skill.find((r) => r.slot === slot)?.level ?? 0;
      if (!Number.isSafeInteger(expected_level) || expected_level !== actual) fail('progreso_cambiado', 'El nivel de la ranura cambió; vuelve a abrirla');
      const compra = consultarRanura(this.master.personaje(c.character_id), c, this.master.habilidades(), estado, slot, choose_master_item_id);
      if (!compra.disponible) fail(compra.code, compra.motivo);
      consumirMateriales(estado, compra.costes);
      const r = { slot, master_slot_skill_id: compra.oferta.id, level: compra.nivel + 1, max_level: compra.oferta.maximo };
      const i = c.slot_skill.findIndex((r) => r.slot === slot);
      if (i < 0) c.slot_skill.push(r); else c.slot_skill[i] = r;
      return { respuesta: { data: { character: copy(c), items: vistaInventario(estado).items } }, nuevo: estado };
    },
  },
  'character/equipment': {
    cuenta: true,
    fn(estado, params) { return asignarEquipo(this, estado, params); },
  },
  // D76: contrato propio del servidor simulado; no afirma el formato del servidor original.
  'character/weapon': {
    cuenta: true,
    fn(estado, { character_uid, weapon_uid }) {
      return asignarEquipo(this, estado, { character_uid, slot: 'weapon', equipment_uid: weapon_uid });
    },
  },
  // Crear cuenta. Respuesta CONFIRMADA offline: cuerpo vacío. Error si ya existe: PROVISIONAL.
  'user/register': {
    cuenta: false,
    fn(estado, { name = 'Player' }) {
      if (estado) fail('cuenta_existente', 'ya hay una cuenta en este almacén');
      if (typeof name !== 'string' || !name.trim() || name.length > 16) fail('nombre_invalido', 'nombre de 1 a 16 caracteres');
      const ahora = this.now();
      const nuevo = {
        schema: SCHEMA_VERSION,
        user: { id: Math.floor(this.random() * 9e8) + 1e8, name: name.trim(), exp: 0, col: 0, diamond: this.diamantesIniciales,
          initial_diamond_grant:{amount:this.diamantesIniciales,version:REGALO_INICIAL.version},created_at: ahora, updated_at: ahora },
        characters: [],
        equipment: [],
        items: {},
        quests: {},
        quest_session: null,
        otrasRecompensas: {},
        siguienteUid: 1,
        siguienteSesion: 1,
      };
      for (const id of this.iniciales) this.nuevoPersonaje(nuevo, id);
      return { respuesta: {}, nuevo };
    },
  },

  // Datos del usuario e inventario. Formato PROVISIONAL.
  'user/all': {
    cuenta: true,
    fn(estado) {
      const s = estado.quest_session;
      return {
        respuesta: {
          data: {
            user: vistaUsuario(estado),
            ...vistaInventario(estado),
            quest_session: s ? { quest_id: s.quest_id, difficulty: s.difficulty } : null,
            party: estado.party ?? null,
          },
        },
      };
    },
  },

  // Equipo elegido (líder + dos puestos del Switch) por uid. En el original lo guarda el servidor; nombre y formato
  // PROVISIONALES (no se encontró la ruta). Campo opcional de la cuenta: sin él, el primer personaje (schema5 sin cambios).
  'user/party': {
    cuenta: true,
    fn(estado, { party }) {
      if (!Array.isArray(party) || party.length < 1 || party.length > 3) fail('equipo_invalido', 'el equipo lleva de 1 a 3 puestos');
      const propios = new Set(estado.characters.map((c) => c.uid));
      const limpio = [];
      for (const uid of party) {
        if (uid == null) { limpio.push(null); continue; }
        if (!propios.has(uid)) fail('equipo_invalido', `personaje ${uid} no está en la cuenta`);
        if (limpio.includes(uid)) fail('equipo_invalido', `personaje ${uid} repetido`);
        limpio.push(uid);
      }
      if (limpio[0] == null) fail('equipo_invalido', 'el primer puesto no puede estar vacío');
      while (limpio.length < 3) limpio.push(null);
      estado.party = limpio;
      return { respuesta: { data: { party: limpio } }, nuevo: estado };
    },
  },

  // Progreso de misiones y (D55) las misiones abiertas (`available`). Formato PROVISIONAL.
  'user/quest': {
    cuenta: true,
    fn(estado) {
      const quests = [];
      for (const [qid, porDif] of Object.entries(estado.quests)) {
        for (const [dif, p] of Object.entries(porDif)) {
          quests.push({ quest_id: Number(qid), difficulty: Number(dif), ...p });
        }
      }
      quests.sort((a, b) => a.quest_id - b.quest_id || a.difficulty - b.difficulty);
      return { respuesta: { data: { quests, available: this.disponibles(estado) } } };
    },
  },

  // Empezar misión. Respuesta CONFIRMADA (constante del DummyDriver); validaciones PROVISIONALES.
  // Sin estamina por ahora (no se ubicó en la master data). D55: rechaza las misiones bloqueadas.
  'quest/start': {
    cuenta: true,
    fn(estado, { quest_id, difficulty = 1, party }) {
      const q = this.master.mision(quest_id);
      if (!q) fail('mision_inexistente', `misión ${quest_id} no existe`);
      if (!q.dificultades[difficulty]) fail('dificultad_inexistente', `misión ${quest_id} sin dificultad ${difficulty}`);
      if (!this.desbloqueada(estado, quest_id, difficulty)) {
        const [rq, rd] = q.dificultades[difficulty].requiere;
        fail('mision_bloqueada', `misión ${quest_id} (dificultad ${difficulty}) bloqueada: hay que completar ${rq} en la dificultad ${rd}`);
      }
      const uids = party ?? [estado.characters[0]?.uid];
      if (!Array.isArray(uids) || !uids.length || uids.length > 3) fail('equipo_invalido', 'el equipo lleva de 1 a 3 personajes');
      for (const uid of uids) {
        if (!estado.characters.some((p) => p.uid === uid)) fail('personaje_ajeno', `el personaje ${uid} no es de la cuenta`);
      }
      // Una sesión abierta se reemplaza (misión abandonada).
      estado.quest_session = {
        id: estado.siguienteSesion++, quest_id, difficulty, party: uids, started_at: this.now(), saves: 0, save: null,
      };
      return { respuesta: copy(RESPUESTA_QUEST_START), nuevo: estado };
    },
  },

  // Guardado intermedio (para reanudar). Respuesta CONFIRMADA offline: cuerpo vacío.
  'quest/save': {
    cuenta: true,
    fn(estado, { state = null }) {
      const s = estado.quest_session;
      if (!s) fail('sin_mision', 'no hay misión en curso');
      s.saves += 1;
      s.save = state;
      return { respuesta: {}, nuevo: estado };
    },
  },

  // Resultado. En el juego offline no pasa por el driver (lo calcula el cliente); aquí lo hace el
  // servidor simulado para que el progreso quede en un solo lugar. Formato y reglas PROVISIONALES:
  //   params: { cleared: bool, clear_time: segundos, defeated?: nº de enemigos derrotados }
  //   recompensas: col / exp de jugador / exp de personaje de quest_level (f11 / f9 / f10) y drops
  //   de los enemigos de stage (drop_id) sorteados con drop.json.
  'quest/result': {
    cuenta: true,
    fn(estado, { cleared = false, clear_time = null, defeated }) {
      const s = estado.quest_session;
      if (!s) fail('sin_mision', 'no hay misión en curso');
      estado.quest_session = null;
      const q = this.master.mision(s.quest_id);
      const dif = q.dificultades[s.difficulty];
      const vacio = { col: 0, exp_user: 0, exp_character: 0, drops: [] };
      if (!cleared) {
        return { respuesta: { data: { cleared: false, first_clear: false, rewards: vacio, characters: [], user: vistaUsuario(estado) } }, nuevo: estado };
      }
      // Solo los enemigos de la dificultad jugada (stage.f9[].f1, confirmado en Ghidra).
      const lista = q.drops?.[s.difficulty] ?? [];
      const derrotados = Number.isInteger(defeated) ? lista.slice(0, Math.max(0, defeated)) : lista;
      const drops = this.sortearDrops(derrotados);
      estado.user.col += dif.col;
      estado.user.exp += dif.expJugador;
      for (const r of drops) this.aplicarRecompensa(estado, r);
      const characters = s.party.map((uid) => {
        const p = estado.characters.find((c) => c.uid === uid);
        const subio = this.darExp(p, dif.expPersonaje);
        return { ...copy(p), level_up: subio };
      });
      const porDif = (estado.quests[s.quest_id] ??= {});
      const previo = porDif[s.difficulty];
      porDif[s.difficulty] = {
        clear_count: (previo?.clear_count ?? 0) + 1,
        best_time: previo?.best_time != null && clear_time != null ? Math.min(previo.best_time, clear_time) : (clear_time ?? previo?.best_time ?? null),
        first_clear_at: previo?.first_clear_at ?? this.now(),
      };
      return {
        respuesta: {
          data: {
            cleared: true,
            first_clear: !previo,
            rewards: { col: dif.col, exp_user: dif.expJugador, exp_character: dif.expPersonaje, drops: copy(drops) },
            characters,
            user: vistaUsuario(estado),
          },
        },
        nuevo: estado,
      };
    },
  },
};

// D85: registro aditivo compatible con schema5. Últimos32 resultados para reintentos.
for(const mode of MODOS_EQUIPO) RUTAS['equipment/'+mode]={cuenta:true,fn(estado,{quote,...params}){
  if(typeof quote!=='string'||!quote)fail('confirmacion_requerida','Consulta y confirma los requisitos antes de continuar');
  const normal=normalizarOperacion(mode,params),recibo=estado.operation_receipts?.find(r=>r.quote===quote);
  if(recibo){
    if(recibo.mode!==mode||JSON.stringify(recibo.params)!==JSON.stringify(normal))fail('confirmacion_invalida','La selección no coincide con la confirmación');
    return {respuesta:copy(recibo.respuesta)};
  }
  const q=consultarOperacion(this.master,estado,mode,normal,this.now());
  if(!q.permitida)fail(q.code,q.motivo);
  if(quote!==selloOperacion(estado,q))fail('inventario_cambiado','El inventario o los requisitos cambiaron; revisa de nuevo la operación');
  estado.user.col-=q.col;
  for(const r of q.materiales)estado.items[r.id]-=r.cantidad;
  const consumidos=new Set(q.consumir);
  estado.equipment=estado.equipment.filter(e=>!consumidos.has(e.uid));
  let equipo=null;
  if(mode==='strengthen'||mode==='evolve'){
    equipo=estado.equipment.find(e=>e.uid===normal.equipment_uid);
    equipo.equipment_id=q.destino;equipo.level=q.nivel;
  }
  if(mode==='exchange'){
    equipo={uid:estado.siguienteUid++,equipment_id:q.destino,level:1,created_at:this.now()};
    estado.equipment.push(equipo);
    (estado.equipment_exchanged_ids??=[]).push(q.destino);
  }
  for(const r of q.recibir)estado.items[r.id]=(estado.items[r.id]??0)+r.cantidad;
  const respuesta={data:{mode,equipment:equipo?copy(equipo):null,consumed_uids:q.consumir,
    col:q.col,materials:copy(q.materiales),received:copy(q.recibir),user:vistaUsuario(estado),items:vistaInventario(estado).items}};
  (estado.operation_receipts??=[]).push({quote,mode,params:normal,respuesta:copy(respuesta)});
  estado.operation_receipts=estado.operation_receipts.slice(-32);
  return {respuesta,nuevo:estado};
}};

export const RUTAS_LOCALES = Object.keys(RUTAS);
