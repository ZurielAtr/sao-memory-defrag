// D85/D108: reconstrucción comunitaria, NO payload oficial del servidor.
// Pools: catálogo de Fanadata (web/js/datos/catalogo_banners.js, 208 fichas). Tasas, coste y repetidos: modelo de
// S-argo (https://github.com/Expugn/S-argo, ScoutSettingsParser/CharacterScout): ★2 65 %, ★3 25 %, ★4 4 %, ★5 3 %,
// ★6 3 %; la parte de una rareza sin personajes pasa a ★2 (con sólo ★4 da 71/25/4, como D85). Los ★4/★5 que el banner
// no destaca salen de los destacados de banners anteriores (randGoldCharacter/randPlatinumCharacter).
// Todos los banners se tratan como «Normal» (sin pasos, cristales de registro ni garantías). Ver docs/banners-d108.md.
// D109: banners de armas. Las armas destacadas salen de Fanadata (cada arma dice de qué banner viene; el catálogo
// guarda sus ids de equipo de la APK). Tasas y coste: modelo de armas de S-argo (WeaponScout/Normal): ★2 71 %
// (cobre 65 + platino 3 + el 3 % sobrante), ★3 25 %, destacadas 4 %, 15/150 diamantes; las ★2/★3 son las listas fijas
// CopperWeapon/SilverWeapon. Sin repetidos: cada arma es una pieza nueva. Ver docs/banners-armas-d109.md.
import { CATALOGO_BANNERS } from './catalogo_banners.js';

// Los tres banners de D85/D90 conservan su id (las partidas guardan banner_id en el último sorteo).
const IDS_ANTERIORES = { 1: 'archivo-start-dash', 2: 'archivo-alo-reborn', 3: 'archivo-wind-jp' };
const NOMBRES_ANTERIORES = { 3: 'Viento · Japón' };
const CARTELES_ANTERIORES = { 1: '001/20011', 2: '002/20021', 3: '003/20031' };
export const MODELO_SARGO = Object.freeze({ 2: 6500, 3: 2500, 4: 400, 5: 300, 6: 300 });
export const REPETIDOS = Object.freeze({ 2: 1, 3: 2, 4: 50, 5: 100, 6: 100 });
export const MODELO_ARMAS = Object.freeze({ 2: 7100, 3: 2500, destacadas: 400 });
export const PRECIOS_ARMAS = Object.freeze({ 1: 15, 11: 150 });
// S-argo CopperWeapon (★2) y SilverWeapon (★3), con el nombre que tienen en la APK.
export const ARMAS_COMUNES = Object.freeze({
  2: ['Gust Katana', 'Brave Gemsword', "Queen's Knightsword", 'Flame Knife', 'Assault Dagger', 'Wind Dagger', 'Mithril Spear', 'Darkness Glaive',
    'Mithril Rapier', 'Flame Rapier', 'Q. Knightsword & B. Gemsword', 'Mithril Mace', 'War Pick', 'Aqua Mace', 'Ethereal Staff', 'Evil Wand',
    'Flame Wand', 'Aqua Spread', 'Dark Bow', 'Flame Shooter', 'Stealth Rifle', 'Double-Stack Magazine', 'Precision Rifle', 'Eliza'],
  3: ['Moonlit Sword', 'Ice Blade', 'Carmine Katana', "Artisan's Longsword", 'Misericorde', 'Moonlight Kukri', 'Midnight Kris', 'Petra Twins',
    'Gale Halbert', 'Chivalrous Rapier', 'Earth Dragon Stinger', 'Brave Rapier', "Dual Artisan's Swords", 'Bloody Club', 'Barbarian Mace',
    'Gale Zaghnal', 'Tidal Rod', 'Crystal Wand', 'Emerald Rod', 'Chivalrous Bow', 'Petra Bow', 'Falcon Shooter', 'Pale Shooter',
    'Behemoth Sniper', 'Long-Range Barrett', 'Rebecca'],
});

/** Ids de equipo de las armas comunes de S-argo (nombre + « R2/R3» en la APK). */
export function armasComunes(equipos) {
  const porNombre = new Map(Object.entries(equipos).map(([id, e]) => [e.nombre, Number(id)]));
  return Object.fromEntries(Object.entries(ARMAS_COMUNES).map(([r, nombres]) => [r, nombres.map((n) => porNombre.get(`${n} R${r}`)).filter(Boolean)]));
}

/** Grupos de un banner de armas: comunes ★2/★3 y destacadas (4 %, repartido por igual entre ellas). */
export function gruposArmas(destacadas, comunes) {
  return [
    { rareza: 2, ratio: MODELO_ARMAS[2], ids: [...comunes[2]] },
    { rareza: 3, ratio: MODELO_ARMAS[3], ids: [...comunes[3]] },
    { rareza: 0, destacadas: true, ratio: MODELO_ARMAS.destacadas, ids: [...destacadas] },
  ];
}
// Hasta dónde llegan los banners de S-argo_Data (Banners.xml, banner 60, finales de 2017): sus tasas se
// documentaron para esos banners; después se aplica el mismo modelo como PROVISIONAL.
const FIN_DOCUMENTADO = '2018-01-01';

/** «NNN/CÓDIGO» (arte grande _scout_top) o «NNN/CÓDIGO:s» (sólo existe el pequeño _scout_top_s). */
export function rutasCartel(a) {
  if (!a) return { arte: null, banner: null };
  const [ruta, variante] = a.split(':');
  const [carpeta, codigo] = ruta.split('/');
  return { arte: `images/lottery/${carpeta}/${codigo}_scout_top${variante === 's' ? '_s' : ''}.png`, banner: `images/lottery/${carpeta}/${codigo}_scout_banner.png` };
}

/** Grupos de un banner con el modelo de S-argo. `previos` = ids destacados por rareza en banners anteriores. */
export function gruposBanner(destacados, personajes, comunes, previos) {
  const porRareza = (r) => destacados.filter((id) => personajes[id]?.rareza === r);
  const maxima = Math.max(0, ...destacados.map((id) => personajes[id]?.rareza ?? 0));
  const ids = {
    2: comunes[2], 3: comunes[3],
    4: porRareza(4).length ? porRareza(4) : previos[4],
    5: porRareza(5).length ? porRareza(5) : maxima >= 6 ? previos[5] : [],
    6: porRareza(6),
  };
  let cobre = MODELO_SARGO[2];
  const grupos = [];
  for (const r of [6, 5, 4, 3]) {
    if (!ids[r]?.length) { cobre += MODELO_SARGO[r]; continue; }
    grupos.unshift({ rareza: r, ratio: MODELO_SARGO[r], ids: [...ids[r]] });
  }
  grupos.unshift({ rareza: 2, ratio: cobre, ids: [...comunes[2]] });
  return grupos;
}

export async function catalogoReclutamiento(fuente, personajes, equipos = {}) {
  const archivo = (await fuente.md('banner') ?? []).map((r) => ({ id: r.f0, imagen: r.f1, categoria: r.f3, referencia: r.f4 }));
  const comunes = { 2: [], 3: [] };
  for (const [id, r] of Object.entries(personajes)) if (Number(id) < 8000000 && (r.rareza === 2 || r.rareza === 3)) comunes[r.rareza].push(Number(id));
  const previos = { 4: new Set(), 5: new Set() };
  const orden = [...CATALOGO_BANNERS].sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : a.f - b.f));
  const banners = [], comunesArmas = armasComunes(equipos);
  for (const b of orden) {
    const destacados = b.d.filter((id) => personajes[id]);
    const grupos = gruposBanner(destacados, personajes, comunes, { 4: [...previos[4]], 5: [...previos[5]] });
    for (const id of destacados) { const r = personajes[id].rareza; if (r === 4 || r === 5) previos[r].add(id); }
    const valido = destacados.length > 0 && grupos.every((g) => g.ids.length > 0 && g.ids.every((id) => personajes[id]?.rareza === g.rareza))
      && grupos.reduce((s, g) => s + g.ratio, 0) === 10000;
    const documentado = b.i < FIN_DOCUMENTADO;
    banners.push({
      id: IDS_ANTERIORES[b.f] ?? `fanadata-${b.f}`, tipo: 'personaje', nombre: NOMBRES_ANTERIORES[b.f] ?? b.n, archivo: b.f, destacados,
      ...rutasCartel(CARTELES_ANTERIORES[b.f] ?? b.a), inicio: b.i, fin: b.e, reconstruido: true, provisional: !documentado,
      procedencia: 'Fanadata · grupos de personajes', fuente: `https://saomd.fanadata.com/banners/${b.f}`,
      nota: documentado
        ? 'Pool destacado: Fanadata. Tasas, coste y repetidos: modelo comunitario S-argo; Fanadata no publica estas reglas.'
        : 'Pool destacado: Fanadata. Tasas PROVISIONALES: modelo comunitario S-argo aplicado a un banner que no documenta; no son las tasas oficiales.',
      disponible: valido, faltan: b.d.length - destacados.length, grupos, precios: { 1: 25, 11: 250 }, duplicados: { ...REPETIDOS },
    });
    // D109: el banner de armas del mismo evento, si Fanadata le asocia armas.
    const destacadas = (b.w ?? []).filter((id) => equipos[id]);
    if (destacadas.length) {
      const gruposA = gruposArmas(destacadas, comunesArmas);
      banners.push({
        id: `armas-fanadata-${b.f}`, tipo: 'arma', nombre: NOMBRES_ANTERIORES[b.f] ?? b.n, archivo: b.f, destacados: destacadas,
        arte: null, banner: null, inicio: b.i, fin: b.e, reconstruido: true, provisional: !documentado,
        procedencia: 'Fanadata · armas del banner', fuente: `https://saomd.fanadata.com/banners/${b.f}`,
        nota: documentado
          ? 'Armas destacadas: Fanadata (coinciden con S-argo_Data). Tasas y coste: modelo de armas de S-argo; no son las tasas oficiales.'
          : 'Armas destacadas: Fanadata. Tasas y coste PROVISIONALES: modelo de armas de S-argo aplicado a un banner que no documenta.',
        disponible: destacadas.length > 0 && gruposA.every((g) => g.ids.length > 0), faltan: b.w.length - destacadas.length,
        grupos: gruposA, precios: { ...PRECIOS_ARMAS }, duplicados: null,
      });
    }
  }
  // Más recientes primero en la Taberna.
  banners.sort((a, b) => (a.inicio > b.inicio ? -1 : a.inicio < b.inicio ? 1 : b.archivo - a.archivo || (a.tipo === 'arma') - (b.tipo === 'arma')));
  const textosArgo = Object.fromEntries((await fuente.md('localization_info') ?? []).filter((r) => r.f0 >= 101501 && r.f0 <= 101506).map((r) => [r.f0, r.f1]));
  const defines = await fuente.md('define') ?? [], activacion = defines.find((r) => r.f0 === 10001), probabilidad = defines.find((r) => r.f0 === 10002);
  const introduccionALO = { activada: activacion?.f1 === 1, inicio: activacion?.f2 ?? null, probabilidad: (probabilidad?.f1 ?? 0) / 10000 };
  return { banners, archivo, textosArgo, introduccionALO };
}
