// Recursos históricos opcionales: sólo imágenes de los tres banners actuales y sus stills.
// Se valida el paquete completo antes de escribir; nunca toca la cuenta ni las tablas.
import{leerDirectorio,bytesEntrada}from'./zip.js';
const permitida=r=>/^images\/lottery\/(?:001\/20011_scout_(?:top|banner)\.png|002\/20021_scout_(?:top|banner)\.png|003\/20031_scout_(?:top|banner)\.png|still\/[123]\/[a-zA-Z0-9_-]+\.(?:jpg|png))$/.test(r);
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
export async function leerRecursosGacha(blob){
 if(!blob||blob.size>8*1024*1024)throw Error('El paquete de gacha es demasiado grande');
 const entradas=await leerDirectorio(blob),meta=entradas.find(e=>e.nombre==='gacha-recursos.json');
 if(!meta||meta.tam>64000||entradas.length>65||new Set(entradas.map(e=>e.nombre)).size!==entradas.length)throw Error('Paquete de recursos de gacha no válido');
 const m=JSON.parse(new TextDecoder().decode(await bytesEntrada(blob,meta)));
 if(m.version!==1||!Array.isArray(m.archivos)||!m.archivos.length||m.archivos.length>64)throw Error('Manifiesto de gacha no válido');
 const archivos=[],vistos=new Set();let total=0;
 for(const r of m.archivos){
  if(!permitida(r.ruta)||vistos.has(r.ruta)||!Number.isSafeInteger(r.bytes)||r.bytes<=0||r.bytes>2*1024*1024||!/^[a-f0-9]{64}$/.test(r.sha256))throw Error('Imagen de gacha no válida');
  vistos.add(r.ruta);total+=r.bytes;if(total>8*1024*1024)throw Error('El paquete de gacha es demasiado grande');
  const e=entradas.find(e=>e.nombre===r.ruta);
  if(!e||e.tam!==r.bytes)throw Error('Falta una imagen del paquete de gacha');
  const b=await bytesEntrada(blob,e);
  const png=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71;
  const jpg=b[0]===255&&b[1]===216&&b[2]===255;
  if((!png&&!jpg)||await hash(b)!==r.sha256)throw Error('Imagen de gacha dañada');
  archivos.push({ruta:r.ruta,bytes:b});
 }
 if(entradas.some(e=>e.nombre!=='gacha-recursos.json'&&!vistos.has(e.nombre)))throw Error('El paquete contiene archivos ajenos al gacha');
 return archivos;
}
