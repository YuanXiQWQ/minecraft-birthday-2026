# Formal application

Use Node 25.2.1/npm 11.6.2 with the pinned dependencies (Three 0.186.1, Vite 8.3.4, TypeScript 7.0.2).

```powershell
cd app
npm ci
npm run dev
```

- Home: http://127.0.0.1:4183/
- Game: http://127.0.0.1:4183/game/
- Checks: `npm run check`, `npm test`, `npm run data:verify`, `node tools/inventory-rules.ts --check`.
- Root build/preview: `npm run build`, `npm run preview` (4185).
- Pages build/preview: `npm run build:pages`, `npm run preview:pages` (4186, /minecraft-birthday-2026/).
- Both HTTP resource/boundary checks: `npm run test:built`.

The game is a real first-person 3D integration room, not the final four scenes. It has no movement, crosshair or pointer lock. Short right-click uses the picked object; right-drag turns the bounded camera. E opens the original screen-space catalogue; Esc/E/Done closes it. Personal and equipment pages contain the native Steve model. Locked catalogue art is masked only over the icon alpha silhouette.

The unlimited acquired directory supplies bounded temporary stacks. Hotbar/equipment/offhand/toolbar presets persist. Personal cursor and 2x2 inputs clear on close or re-entry. Personal 2x2 and instance 3x3 crafting take complete recipe batches without consuming input references; approved remainders return to the directory. A product unlocks only after successful acquisition.

Hold an acquired crafting table, furnace or blast furnace and short right-click the allowed floor to place it. Short right-click opens its native GUI; Shift-right-click removes it and its contents. The carrier region is not a final P7 build area. Workbench inputs persist. Furnaces retain bounded input/fuel references, cook at native times, and store finite outputs. Input allows nonrecipe items; Shift routes by device recipe before fuel. Empty-cursor right-click takes half an actual output; Shift moves its finite content; number/F only take to an empty designated slot. A pending acquisition blocks other carrier changes, while close remains available.

Only visible game-page active time advances all devices, including during GUI/settings. Hidden/offline/home-only time does not count. Multiple game pages share one native Web Lock simulation owner, with separate short save transactions and generation fences. Farming, final scenes, recipe-book discovery, the hopper network and final birthday celebration are not implemented here.

Original Java26.3 models, textures, GUI, font, icons, particles and sounds are committed under ../resources/minecraft/26.3/ and enter ordinary builds via audited manifests. No private cache/client installation is needed at runtime. Builds exclude docs, full clients, historical experiments and verification fixtures. Public release rights remain a separate review.

The versioned save key is minecraft-birthday-2026:formal:save. Current contentVersion is p6-processing-1; P3/P5/P6-crafting data migrates without dropping workbench/player/settings/cake facts. Furnace contents version2 validates producer output separately from unlocked carriers. Reset clears progress while retaining language/volume/mute. Invalid/future or failed saves remain unchanged/read-only. Web Locks absence is explicitly read-only.

## Isolated browser verification

`npm run dev:verify` serves http://127.0.0.1:4184/__verify__/index.html. It is a separate origin/save from ordinary dev. The furnace-source fixture unlocks only source materials/devices and configures the hotbar; no output is granted. Open /__verify__/input.html for actual production UI and bounded trusted-event/state evidence. Existing receipt-arm/release controls can delay an actual committed crafting or furnace receipt only on this verification route. Ordinary dev and both builds exclude every fixture.

Tests and screenshots complement manual checks; physical right/middle drag, real minimization/background throttling, Java-client visual comparison and other browsers are not claimed passed by unit tests. Current implementation and evidence are indexed in ../docs/p6/furnace-review.md.
