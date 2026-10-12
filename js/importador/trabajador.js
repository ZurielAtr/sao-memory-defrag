// Worker del importador (D68): importa la APK y genera los datos en OPFS sin congelar la página. Mensajes:
//   → { tipo: 'importar', archivos: [File] }   borra lo anterior, descifra, genera los datos y guarda el estado
//   → { tipo: 'importar', urls: [url] }        lo mismo leyendo del servidor local por rangos (solo pruebas)
//   → { tipo: 'regenerar' }                    solo vuelve a generar los datos (versión nueva de los exportadores)
//   ← { tipo: 'avance', fase, fraccion, archivos?, detalle? } · { tipo: 'listo', estado } · { tipo: 'error', mensaje }

import { importar } from './importar.js';
import { generarDatos, VERSION_DATOS } from '../datos/generar.js';
import { Fuente } from '../datos/fuente.js';
import { BlobRemoto } from './blob_remoto.js';
import { carpeta, Escritor, Indice, almacenOPFS, leer, borrarTodo, RAIZ } from './opfs.js';

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

async function hacerImportacion(archivos) {
  await borrarTodo();
  const base = await carpeta('', true);
  const recursos = new Escritor(await base.getDirectoryHandle('descifrado', { create: true }));
  const indice = new Indice();
  const r = await importar({
    archivos: archivos.map((f) => ({ blob: f, nombre: f.name })),
    destino: {
      async escribir(ruta, bytes) {
        await recursos.escribir(ruta, bytes);
        indice.agregar(ruta, bytes.length);
      },
      async borrar(ruta) {
        await recursos.borrar(ruta);
        indice.quitar(ruta);
      },
    },
    avance: (a) => enviar({ tipo: 'avance', ...a }),
  });
  const raiz = new Escritor(base);
  await raiz.escribir('indice.json', indice.aJSON());
  await generar(base, indice, r.claves.xxtea);
  // El estado se escribe al final: sin él, la importación no cuenta como hecha.
  const estado = {
    version: VERSION_DATOS, archivos: r.archivos.length, bytes: r.bytes, fecha: new Date().toISOString(),
    fuentes: archivos.map((f) => ({ nombre: f.name, bytes: f.size })), claveDatos: hex(r.claves.xxtea),
  };
  await raiz.escribir('estado.json', JSON.stringify(estado));
  return estado;
}

async function regenerar() {
  const base = await carpeta();
  const estado = base && (await json(base, 'estado.json'));
  const entradas = base && (await json(base, 'indice.json'));
  if (!estado || !entradas) throw new Error(`no hay nada importado en ${RAIZ}`);
  await generar(base, new Indice(entradas), deHex(estado.claveDatos));
  estado.version = VERSION_DATOS;
  estado.regenerado = new Date().toISOString();
  await new Escritor(base).escribir('estado.json', JSON.stringify(estado));
  return estado;
}

onmessage = async (ev) => {
  try {
    let archivos = ev.data.archivos;
    if (ev.data.urls) archivos = await Promise.all(ev.data.urls.map((u) => BlobRemoto.abrir(u)));
    const estado = ev.data.tipo === 'importar' ? await hacerImportacion(archivos) : await regenerar();
    enviar({ tipo: 'listo', estado });
  } catch (e) {
    enviar({ tipo: 'error', mensaje: e?.message ?? String(e), nombre: e?.name });
  }
};
