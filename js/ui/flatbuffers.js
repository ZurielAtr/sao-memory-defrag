// Lector mínimo de FlatBuffers (solo lectura, sin dependencias) para los .csb de Cocos Studio (D49).
// Formato público de FlatBuffers: la raíz es un uoffset (uint32) al primer table; cada table empieza con
// un soffset (int32) a su vtable; la vtable lista, en uint16, el desplazamiento de cada campo (0 = ausente,
// vale el valor por defecto). Strings y vectores van fuera de línea (uoffset → uint32 longitud + datos);
// los structs van en línea.
//
// Esquema: { nombre: [[campo, tipo, defecto?], …] } con tipo = 'bool' | 'ubyte' | 'int' | 'float' |
// 'string' | ['struct', nombre] | ['table', nombre] | ['vector', tipo].

const texto = new TextDecoder('utf-8');

export class LectorFB {
  constructor(buffer, structs = {}, tablas = {}) {
    this.dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset ?? 0, buffer.byteLength);
    this.bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset, this.dv.byteLength);
    this.structs = structs;
    this.tablas = tablas;
  }

  raiz() {
    return this.dv.getUint32(0, true);
  }

  // Desplazamiento (desde el inicio del table) del campo número `i`, o 0 si no está.
  campo(tabla, i) {
    const vt = tabla - this.dv.getInt32(tabla, true);
    const largo = this.dv.getUint16(vt, true);
    const o = 4 + 2 * i;
    return o < largo ? this.dv.getUint16(vt + o, true) : 0;
  }

  indirecto(pos) {
    return pos + this.dv.getUint32(pos, true);
  }

  string(pos) {
    const p = this.indirecto(pos);
    const n = this.dv.getUint32(p, true);
    return texto.decode(this.bytes.subarray(p + 4, p + 4 + n));
  }

  escalar(tipo, pos) {
    switch (tipo) {
      case 'bool': return this.dv.getUint8(pos) !== 0;
      case 'ubyte': return this.dv.getUint8(pos);
      case 'int': return this.dv.getInt32(pos, true);
      case 'float': return this.dv.getFloat32(pos, true);
      default: throw new Error(`tipo escalar desconocido: ${tipo}`);
    }
  }

  struct(nombre, pos) {
    const out = {};
    let p = pos;
    for (const [campo, tipo] of this.structs[nombre]) {
      out[campo] = this.escalar(tipo, p);
      p += tipo === 'ubyte' || tipo === 'bool' ? 1 : 4;
    }
    return out;
  }

  // Lee el table `pos` con el esquema `nombre` (solo los campos presentes o con defecto).
  tabla(nombre, pos) {
    const esquema = this.tablas[nombre];
    if (!esquema) throw new Error(`table desconocido: ${nombre}`);
    const out = {};
    esquema.forEach(([campo, tipo, defecto], i) => {
      const o = this.campo(pos, i);
      if (!o) {
        if (defecto !== undefined) out[campo] = defecto;
        return;
      }
      out[campo] = this.valor(tipo, pos + o);
    });
    return out;
  }

  valor(tipo, pos) {
    if (typeof tipo === 'string') return tipo === 'string' ? this.string(pos) : this.escalar(tipo, pos);
    const [clase, arg] = tipo;
    if (clase === 'struct') return this.struct(arg, pos);
    if (clase === 'table') return this.tabla(arg, this.indirecto(pos));
    if (clase === 'vector') {
      const v = this.indirecto(pos);
      const n = this.dv.getUint32(v, true);
      const out = [];
      for (let i = 0; i < n; i++) {
        const p = v + 4 + 4 * i; // vectores de strings y tables (los únicos que usa el .csb)
        out.push(this.valor(arg, p));
      }
      return out;
    }
    throw new Error(`tipo desconocido: ${JSON.stringify(tipo)}`);
  }
}
