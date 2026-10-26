# Application maintenance

Runtime: Node 25.2.1 / npm 11.6.2. Dependencies are pinned in package-lock.json.

From this directory:

```powershell
npm ci
npm run dev
```

Home: http://127.0.0.1:4183/; game: /game/.

Chat supports `/give <targets> <item> [count]`, for example `/give @s minecraft:egg 17`.
The single-player targets are the current username, `@s`, `@p`, `@a`, and `@r`.
Tab completes every implemented item, including `jerrys_farm:ekac`; the `minecraft:` namespace and count (default 1) are optional.
Java 26.3 limits each command to 100 stacks of the chosen item. Items merge into the selected slot, offhand, and remaining inventory before filling hotbar/backpack vacancies; overflow remains as collectible ground drops.
This item-ID form does not implement item-component overrides or selector filters. Native behavior evidence is recorded in `../data/minecraft/26.3/give-sources.json`.

The authored cake uses `jerrys_farm:ekac` (`/give @s jerrys_farm:ekac`). Loading a checksummed save migrates its former `jerrys_farm:upside_down_cake` item/recipe identities and `upside_down_cake` placed blocks before validation. Migration preserves stack components, quantities, placement/bite state, recipe visibility and completed challenges, and persists once under the save lock. The former ID is accepted only when reading saves.

- Root deployment: `npm run build` and `npm run preview`.
- GitHub Pages: `npm run build:pages` and `npm run preview:pages`, under /minecraft-birthday-2026/.
- Validation: `npm run check`, `npm test`, `npm run data:verify`, both builds, then `npm run test:built`.
- The Pages workflow runs these checks and deploys pushes to main.

## Source layout

- web/src: game rules, authored worlds, rendering, UI, localization and persistence.
- tests: automated regressions and fixtures, including old resource manifests for cache-upgrade checks.
- tools: resource and rule exporters, build plugins and output validation.
- ../resources/minecraft/26.3: runtime assets and integrity manifests.
- ../data/minecraft/26.3: rule data, official source identities and extraction metadata.

The game supports four bounded 3D scenes, free movement, English and Simplified Chinese, crafting, farming and a saved birthday celebration. Player-facing names are in web/src/birthday.json; UI strings are in web/src/i18n/.

Save key: minecraft-birthday-2026:formal:save. Preserve existing saves and transactional writes when changing persistence.

## Browser checks

`npm run dev:verify` serves isolated /__verify__/ fixtures on port 4184. These fixtures are excluded from normal builds. Browser test scripts accept their own browser/runtime arguments; generated results belong in the ignored ../.test-results/ directory.

On the user's Windows desktop, install tests/browser-pointer-sim.mjs before navigation. Do not invoke native Pointer Lock without verified independent input isolation. Simulated ownership and events do not establish native input success; physical interaction and listening checks remain manual.

Normal builds use committed resources and require no Minecraft installation or extraction step. Export tools are maintenance utilities for the locked official client. Keep source hashes, file sizes and runtime manifests consistent when updating assets.

Control settings: `node tools/control-settings-sources.ts <verified-client-jar>` regenerates bounded native translations and source identities. After both production builds, run `node --experimental-transform-types tests/control-settings-production.mjs <playwright-package-directory> <browser-executable>` for the root/Pages control regression with simulated Pointer Lock.
