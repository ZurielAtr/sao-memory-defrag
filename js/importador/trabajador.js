// Worker del importador (D68): importa la APK y genera los datos en OPFS sin congelar la página. Mensajes:
//   → { tipo: 'importar', archivos: [File] }   borra lo anterior, descifra, genera los datos y guarda el estado
//   → { tipo: 'importar', urls: [url] }        lo mismo leyendo del servidor local por rangos (solo pruebas)
//   → { tipo: 'regenerar' }                    solo vuelve a generar los datos (versión nueva de los exportadores)
//   → { tipo: 'respaldo', archivos: [File] }   D108: añade del respaldo de descargas lo que falta (más la APK si no hay clave)
//   ← { tipo: 'avance', fase, fraccion, archivos?, detalle? } · { tipo: 'listo', estado } · { tipo: 'error', mensaje }

import { importar, clavesDeArchivos } from './importar.js';
import { examinarRespaldo, importarRespaldo } from './respaldo.js';
import { keystream } from './ccz.js';
import { generarDatos, VERSION_DATOS } from '../datos/generar.js';
import { Fuente } from '../datos/fuente.js';
import { BlobRemoto } from './blob_remoto.js';
import { carpeta, Escritor, Indice, almacenOPFS, leer, borrarTodo, RAIZ, mismasFuentes } from './opfs.js';
import {actualizarImportacion} from './actualizacion.js';

const enviar = (m) => postMessage(m);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const deHex = (s) => Uint8Array.from(s.match(/../g), (x) => parseInt(x, 16));
const json = async (base, ruta) => {
  const b = await leer(base, ruta);
  return b ? JSON.parse(new TextDecoder().decode(b)) : null;
};

/** Genera saomd/data desde saomd/descifrado (borra los datos anteriores). */
async function generar(base, indice, claveDatos) {
  try {
    await base.removeEntry('data', { recursive: true });
  } catch { /* no había */ }
  const salida = new Escritor(await base.getDirectoryHandle('data', { create: true }));
  const recursos = await base.getDirectoryHandle('descifrado');
  const fuente = new Fuente(almacenOPFS(recursos, indice), claveDatos);
  await generarDatos(fuente, salida, (fraccion, detalle) => enviar({ tipo: 'avance', fase: 'datos', fraccion, detalle }));
}

// D101: cada GUARDAR_INDICE archivos se guarda el índice parcial; si la importación se corta (en el iPhone, al
// bloquear la pantalla o por memoria), volver a importar el mismo archivo continúa sin reescribir lo guardado.
const GUARDAR_INDICE = 1000;

async function hacerImportacion(archivos) {
  const fuentes = archivos.map((f) => ({ nombre: f.name, bytes: f.size }));
  const previa = await carpeta();
  const pendiente = previa && (await json(previa, 'importando.json'));
  const parcial = pendiente && mismasFuentes(pendiente.fuentes, fuentes) ? await json(previa, 'indice_parcial.json') : null;
  if (!parcial) await borrarTodo();
  const base = await carpeta('', true);
  const abrirRaiz = async () => carpeta('', true);
  const raiz = new Escritor(base, abrirRaiz);
  if (!parcial) await raiz.escribir('importando.json', JSON.stringify({ fuentes }));
  const recursos = new Escritor(await base.getDirectoryHandle('descifrado', { create: true }),
    async () => (await abrirRaiz()).getDirectoryHandle('descifrado', { create: true }));
  const indice = new Indice(parcial ?? []);
  if (parcial) enviar({ tipo: 'avance', fase: 'examinar', fraccion: 0, continuar: indice.archivos.size });
  let nuevos = 0;
  const r = await importar({
    saltar: parcial ? async (ruta) => Boolean(indice.buscar(ruta)) : null,
    archivos: archivos.map((f) => ({ blob: f, nombre: f.name })),
    destino: {
      async escribir(ruta, bytes) {
        await recursos.escribir(ruta, bytes);
        indice.agregar(ruta, bytes.length);
        if (++nuevos % GUARDAR_INDICE === 0) await raiz.escribir('indice_parcial.json', indice.aJSON());
      },
      async borrar(ruta) {
        await recursos.borrar(ruta);
        indice.quitar(ruta);
      },
    },
    avance: (a) => enviar({ tipo: 'avance', ...a }),
  });
  await raiz.escribir('indice.json', indice.aJSON());
  await generar(base, indice, r.claves.xxtea);
  // El estado se escribe al final: sin él, la importación no cuenta como hecha.
  const estado = {
    version: VERSION_DATOS, archivos: r.archivos.length, fecha: new Date().toISOString(), fuentes, claveDatos: hex(r.claves.xxtea),
    claveRecursos: [...r.claves.ccz], // D108: clave CCZp (4 enteros) para descifrar el respaldo sin volver a pedir la APK
    bytes: [...indice.archivos.values()].reduce((s, [, tam]) => s + tam, 0),
  };
  await raiz.escribir('estado.json', JSON.stringify(estado));
  for (const n of ['importando.json', 'indice_parcial.json']) await raiz.borrar(n);
  return estado;
}

async function regenerar() {
  const base = await carpeta();
  const estado = base && (await json(base, 'estado.json'));
  const entradas = base && (await json(base, 'indice.json'));
  if (!estado || !entradas) throw new Error(`no hay nada importado en ${RAIZ}`);
  return actualizarImportacion(estado,{
    version:VERSION_DATOS,
    generar:()=>generar(base,new Indice(entradas),deHex(estado.claveDatos)),
    escribir:e=>new Escritor(base).escribir('estado.json',JSON.stringify(e)),
  });
}

/** D108: añade del respaldo de descargas (opcional) los recursos que faltan; la APK manda siempre. */
async function anadirRespaldo(archivos) {
  const base = await carpeta();
  const estado = base && (await json(base, 'estado.json'));
  const entradas = base && (await json(base, 'indice.json'));
  if (!estado || !entradas) throw new Error('Importa primero tu APK; el respaldo sólo completa lo que le falta.');
  enviar({ tipo: 'avance', fase: 'examinar', fraccion: 0 });
  let respaldo = null, entradasRespaldo = null;
  const otros = [];
  for (const f of archivos) {
    const e = respaldo ? null : await examinarRespaldo(f);
    if (e) { respaldo = f; entradasRespaldo = e; } else otros.push(f);
  }
  if (!respaldo) throw new Error('Ninguno de los archivos es el respaldo de descargas (files.zip con files/download/project.manifest).');
  let ccz = Array.isArray(estado.claveRecursos) && estado.claveRecursos.length === 4 ? Uint32Array.from(estado.claveRecursos) : null;
  if (!ccz) {
    if (!otros.length) throw Object.assign(new Error('Para descifrar el respaldo hace falta la clave de tu APK: elige el respaldo y también tu APK (saomd8.apks) a la vez.'), { name: 'FaltaApk' });
    ccz = (await clavesDeArchivos(otros.map((f) => ({ blob: f, nombre: f.name })), (f) => enviar({ tipo: 'avance', fase: 'clave', fraccion: f }))).ccz;
  }
  const indice = new Indice(entradas);
  const raiz = new Escritor(base);
  const recursos = new Escritor(await base.getDirectoryHandle('descifrado', { create: true }));
  const r = await importarRespaldo({
    blob: respaldo, entradas: entradasRespaldo, ks: keystream(ccz), existe: (ruta) => Boolean(indice.buscar(ruta)),
    destino: { async escribir(ruta, bytes) { await recursos.escribir(ruta, bytes); indice.agregar(ruta, bytes.length); } },
    avance: (a) => enviar({ tipo: 'avance', ...a }),
  });
  await raiz.escribir('indice.json', indice.aJSON());
  const nuevo = {
    ...estado, claveRecursos: [...ccz],
    respaldo: { version: '1.42.93', archivos: (estado.respaldo?.archivos ?? 0) + r.archivos.length, nuevos: r.archivos.length, fecha: new Date().toISOString() },
    bytes: [...indice.archivos.values()].reduce((s, [, tam]) => s + tam, 0),
  };
  await raiz.escribir('estado.json', JSON.stringify(nuevo));
  return nuevo;
}

onmessage = async (ev) => {
  try {
    let archivos = ev.data.archivos;
    if (ev.data.urls) archivos = await Promise.all(ev.data.urls.map((u) => BlobRemoto.abrir(u)));
    const estado = ev.data.tipo === 'importar' ? await hacerImportacion(archivos)
      : ev.data.tipo === 'respaldo' ? await anadirRespaldo(archivos) : await regenerar();
    enviar({ tipo: 'listo', estado });
  } catch (e) {
    enviar({ tipo: 'error', mensaje: e?.message ?? String(e), nombre: e?.name });
  }
};
