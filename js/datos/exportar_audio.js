// Catálogo obtenido exclusivamente de las tablas y recursos de Fuente (Node u OPFS).
// No incluye sonidos ni una copia de los identificadores del juego en el código público.
import { leerBanco } from '../audio/ckb.js';

const clave = (x) => String(x).toLowerCase();
const base = (ruta) => ruta.split('/').at(-1).replace(/\.[^.]+$/, '');
const ordenar = (a) => [...a].sort((a, b) => clave(a).localeCompare(clave(b), 'en') || a.localeCompare(b, 'en'));
function agregar(indice, nombre, valor) {
  const k = clave(nombre);
  if (!indice.has(k)) indice.set(k, []);
  indice.get(k).push(valor);
}

async function recursos(fuente, dir, archivos) {
  const lista = await fuente.listar(dir);
  if (!lista) return;
  for (const f of ordenar(lista.files)) if (/\.(ogg|ckb)$/i.test(f)) archivos.push(`${dir}/${f}`);
  for (const sub of ordenar(lista.dirs)) await recursos(fuente, `${dir}/${sub}`, archivos);
}

/** Genera audio.json sin decodificar OGG ni cargar simultáneamente los bancos en memoria. */
export async function exportarAudio(fuente, salida) {
  const catalogo = { version: 1, musica: {}, efectos: {}, preload: {}, voces: {}, familiasVoz: {}, bancos: [],
    contextos: {}, contextoEvidencia: {}, faltantes: [], duplicados: [] };
  const archivos = [];
  await recursos(fuente, 'sound', archivos);
  const ogg = new Map(), muestras = new Map();
  for (const ruta of archivos) {
    if (/\.ogg$/i.test(ruta)) agregar(ogg, base(ruta), ruta);
    else {
      try {
        const bytes = await fuente.leer(ruta);
        if (!bytes) throw new Error('No se pudo leer el banco');
        const banco = leerBanco(bytes);
        catalogo.bancos.push(ruta);
        for (const muestra of banco.muestras) agregar(muestras, muestra.nombre, { banco: ruta, nombre: muestra.nombre });
      } catch (e) {
        catalogo.faltantes.push({ tipo: 'banco', ruta, motivo: String(e.message ?? e) });
      }
    }
  }
  for (const [nombre, rutas] of ogg) if (rutas.length > 1) catalogo.duplicados.push({ tipo: 'ogg', nombre, rutas });
  for (const [nombre, entradas] of muestras) if (entradas.length > 1) catalogo.duplicados.push({ tipo: 'muestra', nombre, bancos: entradas.map((e) => e.banco) });

  const tablas = {};
  for (const tabla of ['bgm', 'se', 'preload_se', 'voice', 'bank']) {
    const filas = await fuente.md(tabla);
    tablas[tabla] = Array.isArray(filas) ? filas : [];
    if (!Array.isArray(filas)) catalogo.faltantes.push({ tipo: 'tabla', tabla, motivo: 'Tabla no disponible' });
  }
  const nombresBanco = new Map(tablas.bank.map((r) => [r.f0, r.f1]));
  function guardar(destino, tabla, r, entrada) {
    if (!Number.isSafeInteger(r.f0) || typeof r.f1 !== 'string') {
      catalogo.faltantes.push({ tipo: tabla, id: r.f0 ?? null, motivo: 'Registro sin identificador o nombre válido' });
      return;
    }
    if (Object.hasOwn(destino, r.f0)) {
      catalogo.duplicados.push({ tipo: tabla, id: r.f0, nombre: r.f1 });
      return;
    }
    destino[r.f0] = entrada;
    if (!entrada.ruta && !entrada.banco) catalogo.faltantes.push({ tipo: tabla, id: r.f0, nombre: r.f1, motivo: 'Recurso ausente o ambiguo' });
  }
  function rutaOgg(nombre) {
    const rutas = ogg.get(clave(nombre)) ?? [];
    return rutas.length === 1 ? rutas[0] : null;
  }
  // Escalas y puntos de bucle confirmados en SoundManager (investigación privada audio_play.c).
  // Los puntos están en muestras; el motor usa la frecuencia real del recurso al reproducir.
  for (const r of tablas.bgm) guardar(catalogo.musica, 'bgm', r, {
    nombre: r.f1, ruta: rutaOgg(r.f1), volumen: (r.f2 ?? 1000) / 1000, original: r,
    ...(r.f4 ? { loopInicioMuestras: r.f5 ?? 0, loopFinMuestras: r.f6 ?? 0 } : {}),
  });
  for (const [tabla, destino, grupo, volumen] of [['se', catalogo.efectos, 'f4', 'f8'], ['preload_se', catalogo.preload, 'f2', 'f6']]) {
    for (const r of tablas[tabla]) {
      const candidatos = muestras.get(clave(r.f1)) ?? [];
      // FUN_007cf8b8: banco de preload 18 usa titlecall; los demás usan preload.
      // Es una regla de selección del motor original, no una tabla extraída empaquetada.
      // FUN_007cd6d0: el resto de los bancos se resuelve por bank.f0 -> bank.f1.
      const esperado = tabla === 'preload_se' ? (r.f2 === 18 ? 'se_titlecall' : 'se_preload') : nombresBanco.get(r[grupo]);
      const elegibles = esperado ? candidatos.filter((m) => clave(base(m.banco)) === clave(esperado)) : [];
      const elegido = elegibles.length === 1 ? elegibles[0] : null;
      guardar(destino, tabla, r, { nombre: elegido?.nombre ?? r.f1, banco: elegido?.banco ?? null,
        volumen: (r[volumen] ?? 1000) / 1000, original: r,
        ...(tabla === 'se' ? { permiteLoop: !!r.f9, loopInicioMuestras: r.f10 ?? 0 } : {}) });
    }
  }
  for (const r of tablas.voice) {
    guardar(catalogo.voces, 'voice', r, {
      nombre: r.f1, ruta: rutaOgg(r.f1), volumen: (r.f3 ?? 1000) / 1000,
      grupo: r.f2 ?? null, tipo: r.f6 ?? null, original: r,
    });
    if (Number.isSafeInteger(r.f2) && Number.isSafeInteger(r.f6)) {
      const familia = catalogo.familiasVoz[r.f2] ??= {};
      (familia[r.f6] ??= []).push(r.f0);
    }
  }

  // Estas asociaciones son políticas provisionales del port inferidas de los nombres, no IDs
  // ni selecciones originales confirmadas. Las referencias explícitas de misión/historia prevalecen.
  const contextos = [
    ['titulo', catalogo.musica, /(?:^|_)title(?:_|$)/i], ['home', catalogo.musica, /(?:^|_)town(?:_|$)/i],
    ['misiones', catalogo.musica, /(?:^|_)worldmap(?:_|$)/i], ['equipo', catalogo.musica, /(?:^|_)party(?:_|$)/i],
    ['gacha', catalogo.musica, /(?:^|_)gacha_01$/i],
    ['victoria', catalogo.musica, /(?:^|_)quest_clear$/i], ['derrota', catalogo.musica, /(?:^|_)quest_gameover$/i],
    ['batalla', catalogo.musica, /(?:^|_)qst_sao(?:_|$)/i], ['jefe', catalogo.musica, /(?:^|_)boss_sao(?:_|$)/i],
    ['seleccionar', catalogo.efectos, /(?:^|_)system_click$/i], ['confirmar', catalogo.efectos, /(?:^|_)system_confirm$/i],
    ['cancelar', catalogo.efectos, /(?:^|_)system_cancel$/i],
  ];
  for (const [contexto, entradas, patron] of contextos) {
    const candidatos = Object.entries(entradas).filter(([, e]) => (e.ruta || e.banco) && patron.test(e.nombre));
    // Orden de IDs de la tabla: con varias versiones se conserva la primera como elección del port.
    if (candidatos.length) {
      catalogo.contextos[contexto] = Number(candidatos[0][0]);
      catalogo.contextoEvidencia[contexto] = 'inferido-del-nombre';
      if (contexto === 'victoria' || contexto === 'derrota') candidatos[0][1].loop = false;
    }
  }
  await salida.escribir('audio.json', JSON.stringify(catalogo));
  return catalogo;
}
