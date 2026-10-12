// Master data del servidor simulado (F3): web/data/api_master.json, generado por
// herramientas/exportar_api.py. Los significados PROVISIONALES están documentados ahí y en NOTAS.md.

export class Master {
  constructor(data) {
    this.data = data;
    // Exp acumulada para llegar a cada nivel: acumulada[n - 1] = exp total del nivel n.
    this.expAcumulada = [];
    let total = 0;
    for (const e of data.expNivel ?? []) {
      total += e;
      this.expAcumulada.push(total);
    }
  }

  personaje(id) { return this.data.personajes[id] ?? null; }
  objeto(id) { return this.data.objetos[id] ?? null; }
  equipo(id) { return this.data.equipos[id] ?? null; }
  mision(id) { return this.data.misiones[id] ?? null; }
  drop(id) { return this.data.drops[id] ?? null; }
  recompensa(id) { return this.data.recompensas[id] ?? null; }

  nivelMaximo(rareza) { return this.data.nivelMaximo[rareza] ?? this.expAcumulada.length; }

  /** Exp total necesaria para estar en `nivel` (nivel 1 = 0). */
  expParaNivel(nivel) {
    const i = Math.min(nivel, this.expAcumulada.length) - 1;
    return i < 0 ? 0 : this.expAcumulada[i];
  }
}

/** Carga api_master.json (navegador: fetch; node: pasar `fetch` propio o construir Master directo). */
export async function loadMaster(url = 'data/api_master.json', fetchFn = globalThis.fetch) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`no se pudo cargar ${url}: HTTP ${res.status}`);
  return new Master(await res.json());
}
