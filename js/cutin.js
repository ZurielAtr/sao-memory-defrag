import { rutaWeb } from './rutas.js';
// Cut-in de sword skill (ss/skill_cutin/skill_cutin.ssbp): marco (skill_cutin_base) +
// retrato (skill_cutin_content). La textura de ejemplo del retrato (una ilustración de Leafa
// de 1500x1500) se reemplaza por la ilustración del personaje: images/character/character_<id>.png.

import { loadSSBP, loadImage } from './character.js';
import { buildCharacterQuads } from './renderer.js';

export class SkillCutin {
  static async load(renderer, characterId) {
    const { ssbp, textures } = await loadSSBP(renderer, 'ss/skill_cutin', 'skill_cutin.ssbp');
    const portraitMap = ssbp.cellMaps.findIndex((m) => m.name === 'skill_cutin_character');
    if (portraitMap >= 0 && characterId) {
      try {
        const img = await loadImage(rutaWeb(`/assets/images/character/character_${characterId}.png`));
        renderer.deleteTexture(textures.get(portraitMap));
        textures.set(portraitMap, renderer.createTexture(img));
      } catch { /* se queda el retrato de ejemplo */ }
    }
    return new SkillCutin(ssbp, textures);
  }

  constructor(ssbp, textures) {
    this.ssbp = ssbp;
    this.textures = textures;
    this.layers = ['skill_cutin_base', 'skill_cutin_content']
      .map((name) => ssbp.packs.find((p) => p.name === name))
      .filter(Boolean)
      .map((pack) => ({ pack, anim: pack.anims.find((a) => a.name === 'normal') ?? pack.anims[0] }));
    this.time = -1;
  }

  get active() {
    return this.time >= 0;
  }

  start() {
    this.time = 0;
  }

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    const n = Math.max(...this.layers.map((l) => l.anim.numFrames));
    if (this.time * 30 >= n) this.time = -1;
  }

  // Quads en coordenadas de pantalla centradas en (0, 0).
  quads() {
    if (!this.active) return [];
    const out = [];
    for (const { pack, anim } of this.layers) {
      const f = Math.min(anim.numFrames - 1, Math.floor(this.time * anim.fps));
      out.push(...buildCharacterQuads(this.ssbp, this.textures, pack, anim, f));
    }
    return out;
  }
}
