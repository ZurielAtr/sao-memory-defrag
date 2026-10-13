// D83: shader de fondo original: pow(v_fragmentColor * texture.rgb, 1/u_gamma).
// Sólo transforma la textura del nodo afectado; conserva alpha y reutiliza el resultado.
const imagenes = new WeakMap();
const tablas = new Map();

export function tablaGamma(gamma) {
  if (!Number.isFinite(gamma) || gamma <= 0) throw new RangeError('Gamma inválido');
  if (!tablas.has(gamma)) tablas.set(gamma, Uint8ClampedArray.from({length:256}, (_,i)=>255*Math.pow(i/255,1/gamma)));
  return tablas.get(gamma);
}

export function aplicarGammaRGBA(bytes, gamma) {
  const tabla=tablaGamma(gamma);
  for(let i=0;i<bytes.length;i+=4){bytes[i]=tabla[bytes[i]];bytes[i+1]=tabla[bytes[i+1]];bytes[i+2]=tabla[bytes[i+2]];}
  return bytes;
}

export function imagenGamma(img, gamma=1) {
  if(gamma===1 || !img)return img;
  let variantes=imagenes.get(img);
  if(!variantes){variantes=new Map();imagenes.set(img,variantes);}
  if(!variantes.has(gamma)){
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    const pixeles=ctx.getImageData(0,0,c.width,c.height);
    aplicarGammaRGBA(pixeles.data,gamma);ctx.putImageData(pixeles,0,0);
    variantes.set(gamma,c);
  }
  return variantes.get(gamma);
}
