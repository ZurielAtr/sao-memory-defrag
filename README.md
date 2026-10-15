**English** | [Español](README.es.md)

# SAO Memory Defrag · Browser Port

> **Project ended (October 14, 2026).** Development has stopped: the team that revived *Naruto Shippuden: Ultimate Ninja Blazing* announced on Reddit that they will revive SAO Memory Defrag, which was exactly this port's goal. The page stays online as it is (version D109), but it will receive no further changes or fixes.

**This project was developed entirely with generative artificial intelligence, using models such as Claude Opus 5.5 and GPT 6.1 Sol.**

An unofficial, fan-made port. It still differs from the original game; the sections below describe its final state.

**[Play in your browser](https://zurielatr.github.io/sao-memory-defrag/)**

## How to play

1. Open the page in a desktop browser. It has been tested in Chromium-based browsers; full Firefox compatibility is still pending.
2. Select your own copy of a compatible APK or `.apks` file (tested with SAO MD Revival).
3. Click **Import** and wait for it to finish. This may take several minutes and requires about 4 GB of free space.
4. Click **Play**. Enable audio with the **Sonido** (Sound) control if your browser requires it.

The import page opens in English by default. Use **Language** to switch between **English** and **Español**; your choice is remembered in this browser. This setting applies to the import page. In-game labels are retained below to help you find the relevant controls.

Your APK is processed on your computer and **is not uploaded to a server**. Imported assets and your save stay in that browser's storage. Do not clear the site's data if you want to keep them; you can export a save backup from the landing page. Switching browsers or devices requires importing the game again.

You can play with a keyboard or with touch controls. Phones (especially iPhone/Safari) are experimental: keep the page open and the screen on while importing. If the import stops, press **Import** again with the same file and it will continue where it left off. On phones the game goes fullscreen with the first tap. On iPhone, open the page from the Home Screen (Share → “Add to Home Screen”) before importing: that app keeps its data separate from Safari. **Settings → Reroll** deletes only the account (not the imported files) to start a new one.

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

Touch (as in the original game):

- Tap: attack.
- Drag in any direction: walk; drag further to run.
- Flick up: jump. Flick down while jumping: Head Splitter.
- Flick left or right: quick-step (a backstep when it is opposite to where the character faces).
- Press and hold without moving: guard (charge with a rifle, bow, or rod). While guarding, drag and release: parry.
- Bottom buttons: skills and character switch. MENU: pause.

## Dialogue controls

During dialogue, Space/Enter/Z complete the text or advance. Log/L opens the
scrollable dialogue log and lets you replay available voices. Back/Escape closes
the log. When skipping is allowed, Skip/Escape shows the story summary or a
confirmation: Keep reading returns to the dialogue; Skip/Enter ends it.
If skipping is unavailable, Escape shows a notice. Shakes, background gamma, and
animated opening/closing of these menus are included. Animations (scouting and
dialogue) play in full by default, as in the original; use **Ajustes → Animaciones**
to reduce them or follow your system preference. Other effects and transitions still need fidelity work.

## What this repository contains

On desktop, menus, dialogue and combat use the original portrait format, centered at the largest size that fits the viewport, with dark side margins. Narrow screens fit the full view without cropping. The back button keeps its original size and orientation; overlaps in the Tavern, Blacksmith, Multi, Map and Skills have been corrected. The catalog update preserves imported resources and saves. Full fidelity of some screens remains pending.

HTML and JavaScript for the port, the importer, and the simulated local server that runs in your browser. It contains no APKs, game assets, generated data tables, or decompiled code, and provides no download links for the original game.

The site is published with GitHub Pages from `main`. To try the code locally, serve this folder with a local HTTP server (for example, `python -m http.server 8000`) and open `http://localhost:8000/`. Opening the HTML directly with `file://` does not support importing.

## Status

From Home, **Town** opens the town shortcuts, **Scout** the Tavern, **Upgrade** the
Blacksmith, and **Multi** the co-op menu. Tab/arrow keys cycle their buttons;
Enter/Space selects and Escape goes back. The Tavern lets you browse your own
collection and manage equipment. Upgrade links to inventory, Team, Tree and Slots.

The Tavern offers the **207 historical character banners** documented by [Fanadata](https://saomd.fanadata.com/banners) and **194 weapon banners** (Equipment tab, 15/150 diamonds), newest first, with per-character probabilities and×1/×11 draws. Featured pools come from Fanadata; rates, costs and duplicates use the community [S-argo](https://github.com/Expugn/S-argo) model, identified on screen. No source documents the rates from 2018 on, so those banners are marked as **provisional**. Drawn weapons go to your equipment storage; their animated presentation is not ported yet. These are not official server responses. Duplicates preserve upgraded characters and grant general crystals, available as an alternative payment source on eligible Tree limit-break nodes. Choose one source; this balance is not combined with inventory materials.

New accounts receive **600 diamonds for scouting**, a provisional amount that may change for future players. Existing saves keep their balance. Draws are saved before the introduction and individual reveals. The presentation includes Argo, gates, stars, NEW/crystals, particles, music, effects and available original voices. Tap to continue or speed up the gate; **Skip**, at the bottom right during the gate, or **Escape** return to the list. **Último sorteo → Ver animación** (Last draw → Replay animation) replays without payment. Choosing **Ajustes → Animaciones → Reducidas** displays static results with names and rarity.

Everything comes from the APK: no other file is needed. Introduction stills are the story illustrations the game also used for scouting. Historical banner posters are absent from every APK (the game downloaded them from its server); instead your browser **builds a poster** from pieces of your APK: a stage sky, the featured characters' or weapons' artwork, their stars and the weapon icon. It is not the original poster and no artwork is published. The local catalog uses v19 and the account remains schema5. Full comparison against Android is still pending.

Upgrade supports strengthening, evolution, selling and exchange with requirements and saved transactions.
Multi lets you prepare your local team and open solo quests; searching rooms,
friends or parties requires a server that has not been implemented yet. Town
currently provides local shortcuts; the animated town is still pending.

Includes local importing, quests, combat, UI, dialogue, music, sound effects, and voices. Combat, UI, and audio fidelity still need work; some quests or assets may not work yet. Multiplayer is not implemented.

## Credits

Sword Art Online and the game assets belong to their respective owners. This project is not affiliated with Bandai Namco or the owners of Sword Art Online.

The ADPCM decoder is based on [Cricket Audio](https://github.com/sjmerel/ck) and retains its zlib license notice in `js/audio/ckb.js`. The UI reader follows the format used by [cocos2d-x](https://github.com/cocos2d/cocos2d-x), released under the MIT license. Each player supplies the game files from their own copy.

The particle player retains the MIT license from [SpriteStudio/ssbpLib](https://github.com/SpriteStudio/ssbpLib) in `js/ssbp_effects.js`.
