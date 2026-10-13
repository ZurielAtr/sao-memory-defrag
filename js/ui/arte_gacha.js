import{imagen}from'./recursos.js';
/** Cartel completo, sin deformar variantes de distinta resolución histórica. */
export async function montarArteGacha(p,pagina,ruta){
 const img=ruta&&await imagen(ruta);if(!img)return false;
 const escala=Math.min(pagina.ancho/img.width,pagina.alto/img.height);
 pagina.imagen=null;
 pagina.hijos.push({clase:'Sprite',nombre:'arte_original_gacha',visible:true,alpha:255,
  x:pagina.ancho/2,y:pagina.alto,ancho:img.width,alto:img.height,anclaX:.5,anclaY:1,
  escalaX:escala,escalaY:escala,rotX:0,rotY:0,zOrder:-1,color:{r:255,g:255,b:255},hijos:[],
  imagen:{path:ruta,tipo:0,plist:null}});
 p.arteGacha={ruta,ancho:img.width,alto:img.height};return true;
}
