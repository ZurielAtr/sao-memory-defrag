// D76: getters0069944c/0067d548. Stats son pares int32 dentro de campos de64bits.
import { get, o } from './py.js';

export function parStatEquipo(v = 0) {
  if (typeof v === 'number' && !Number.isSafeInteger(v)) throw new TypeError('Stat de equipo sin precisión entera');
  const d = new DataView(new ArrayBuffer(8)); d.setBigInt64(0, BigInt(v), true);
  return [d.getInt32(0, true), d.getInt32(4, true)];
}

export async function catalogoEquipo(fuente) {
  const maximos = new Map((await fuente.md('equipment_max_level_rarity')).map((r) => [r.f1, r.f2]));
  const campos = { hp: 'f16', mp: 'f17', atk: 'f12', def: 'f13', crit: 'f14',
    stat3: 'f15', velocidadAtaque: 'f18', velocidad: 'f19' };
  return Object.fromEntries((await fuente.md('equipment')).map((r) => [r.f0, {
    nombre: get(r, 'f6'), imagen: get(r, 'f11'), tipo: get(r, 'f1', 0), subtipo: get(r, 'f2', 0), rareza: get(r, 'f5', 0),
    elemento: get(r, 'f4', 0), crecimiento: get(r, 'f3', 1), nivelMax: maximos.get(get(r, 'f5')) ?? 1,
    stats: Object.fromEntries(Object.entries(campos).map(([n, f]) => [n, parStatEquipo(get(r, f, 0))])),
    pasivas: o(get(r, 'f20'), []).filter((id) => Number.isSafeInteger(id) && id > 0),
    correccionSalida: get(r, 'f26', 0),
    evolucion:get(r,'f8',0),rarezaMax:get(r,'f9',0),precioVenta:get(r,'f10',0),grupoFortalecer:get(r,'f21',0),intercambiable:get(r,'f23',0)!==0,
  }]));
}
