**English** | [Español](README.es.md)

# SAO Memory Defrag · Browser Port

**This project is being developed entirely with generative artificial intelligence, using models such as Claude Opus 5.5 and GPT 6.1 Sol.**

An unofficial, fan-made port. It is under development and still differs from the original game.

**[Play in your browser](https://zurielatr.github.io/sao-memory-defrag/)**

## How to play

1. Open the page in a desktop browser. It has been tested in Chromium-based browsers; full Firefox compatibility is still pending.
2. Select your own copy of a compatible APK or `.apks` file (tested with SAO MD Revival).
3. Click **Import** and wait for it to finish. This may take several minutes and requires about 4 GB of free space.
4. Click **Play**. Enable audio with the **Sonido** (Sound) control if your browser requires it.

The import page opens in English by default. Use **Language** to switch between **English** and **Español**; your choice is remembered in this browser. This setting applies to the import page. In-game labels are retained below to help you find the relevant controls.

Your APK is processed on your computer and **is not uploaded to a server**. Imported assets and your save stay in that browser's storage. Do not clear the site's data if you want to keep them; you can export a save backup from the landing page. Switching browsers or devices requires importing the game again.

A computer with a keyboard is recommended. Touch controls are not available yet, and Safari/iPhone/iPad support has not been validated.

On the **Equipo** (Team) screen, click **Equipo** (Equipment) next to a character and choose **Arma** (Weapon), **Armadura** (Armor), or **Accesorio** (Accessory). You can equip or remove compatible items from your inventory. Your choices are saved, and their stats and passive effects apply in combat. If the list is empty, you first need to obtain equipment from quests. In **Upgrade**, select equipment, review requirements and confirm strengthening, evolution, selling or exchange. Changes are saved; canceling consumes nothing.

In **Equipo**, click **Árbol** (Tree) to unlock nodes using the required materials and prerequisites. You can drag the tree in both directions. Character passives require purchasing their node; leveling up alone does not activate them. **Ranuras** (Slots) lets you purchase and upgrade skills available to that character. If alternative materials are offered, choose one before purchasing. Purchased upgrades are saved and apply in combat.

In the quest list, locks show which quest and difficulty you need to complete. You can select a locked quest to view its details. Dialogue quests appear as **Historia** (Story) and open with **Leer** (Read); completing them saves your progress and unlocks the next quest when applicable.

The assignment of skills to nodes and the growth direction of limit-break branches use provisional rules in the local server simulation. Slot assistance, changing the limit-break direction, and diamond purchases are still pending. Equipped items' passive effects apply according to their combat conditions.

## Combat controls

- Arrow keys or WASD: move.
- Z: attack; with a rifle, hold to aim and release to fire. Space: jump.
- Rifle charging cycles through normal, reduced-accuracy, and critical firing windows. A parry can reflect projectiles that support reflection.
- C: guard; C + Space: parry. X: backstep.
- 1–4: skills. Q/E/R: switch to character 1/2/3.

## Dialogue controls

During dialogue, Space/Enter/Z complete the text or advance. Log/L opens the
scrollable dialogue log and lets you replay available voices. Back/Escape closes
the log. When skipping is allowed, Skip/Escape shows the story summary or a
confirmation: Keep reading returns to the dialogue; Skip/Enter ends it.
If skipping is unavailable, Escape shows a notice. Shakes, background gamma, and
animated opening/closing of these menus are included; they respect your system's
reduced-motion preference. Other effects and transitions still need fidelity work.

## What this repository contains

On desktop, menus, dialogue and combat use the original portrait format, centered at the largest size that fits the viewport, with dark side margins. Narrow screens fit the full view without cropping. The back button keeps its original size and orientation; overlaps in the Tavern, Blacksmith, Multi, Map and Skills have been corrected. This update preserves imported resources and saves and does not require data regeneration. Full fidelity of some screens remains pending.

HTML and JavaScript for the port, the importer, and the simulated local server that runs in your browser. It contains no APKs, game assets, generated data tables, or decompiled code, and provides no download links for the original game.

The site is published with GitHub Pages from `main`. To try the code locally, serve this folder with a local HTTP server (for example, `python -m http.server 8000`) and open `http://localhost:8000/`. Opening the HTML directly with `file://` does not support importing.

## Status

From Home, **Town** opens the town shortcuts, **Scout** the Tavern, **Upgrade** the
Blacksmith, and **Multi** the co-op menu. Tab/arrow keys cycle their buttons;
Enter/Space selects and Escape goes back. The Tavern lets you browse your own
collection and manage equipment. Upgrade links to inventory, Team, Tree and Slots.

The Tavern offers reconstructed historical Start Dash, Alfheim Online Reborn and Wind banners with per-character probabilities and×1/×11 draws. Featured pools come from [Fanadata](https://saomd.fanadata.com/banners); rates, costs and duplicates use the community [S-argo](https://github.com/Expugn/S-argo) model, identified on screen. These are not official server responses. Duplicates preserve upgraded characters and grant general crystals, available as an alternative payment source on eligible Tree limit-break nodes. Choose one source; this balance is not combined with inventory materials.

New accounts receive **600 recruitment diamonds**, a provisional amount that may change for future players. Existing saves keep their balance. Draws are saved before each result animation; **Mostrar/Siguiente** reveals or advances and **Ver lista/Escape** ends the sequence. **Último sorteo → Ver animación** replays it without paying again. Reduced motion is respected; some effects, the introduction and original recruitment audio remain pending.

All remaining banners still need to be added; expanding this catalog is deferred to a later stage.

Upgrade supports strengthening, evolution, selling and exchange with requirements and saved transactions.
Multi lets you prepare your local team and open solo quests; searching rooms,
friends or parties requires a server that has not been implemented yet. Town
currently provides local shortcuts; the animated town is still pending.

Includes local importing, quests, combat, UI, dialogue, music, sound effects, and voices. Combat, UI, and audio fidelity still need work; some quests or assets may not work yet. Multiplayer is not implemented.

## Credits

Sword Art Online and the game assets belong to their respective owners. This project is not affiliated with Bandai Namco or the owners of Sword Art Online.

The ADPCM decoder is based on [Cricket Audio](https://github.com/sjmerel/ck) and retains its zlib license notice in `js/audio/ckb.js`. The UI reader follows the format used by [cocos2d-x](https://github.com/cocos2d/cocos2d-x), released under the MIT license. Each player supplies the game files from their own copy.
