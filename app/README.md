# Formal application — P5 base UI

Run commands **inside `app/`**, using Node 25.2.1/npm 11.6.2 (the tested environment). `npm ci` installs the exact existing P2 versions: Three 0.186.1, Vite 8.3.4 and TypeScript 7.0.2. No React or additional runtime library is required.

```powershell
cd app
npm ci
npm run dev
```

- Home: http://127.0.0.1:4183/
- Game: http://127.0.0.1:4183/game/
- `npm run check` and `npm test`: strict compilation and 50 domain/persistence/resource/localization/look/rule/inventory tests.
- `npm run data:verify`: verify committed data/source hashes, replay all 112 reachable recipes and the 18-step cake chain. No client installation or external cache is needed.
- `npm run build` / `npm run preview`: root output, preview port 4185.
- `npm run build:pages` / `npm run preview:pages`: `/minecraft-birthday-2026/` output, preview port 4186.
- `npm run test:built`: real HTTP checks against both built outputs, including all 474 original-resource/profile files and excluded internal routes.

The two independent HTML entries share domain commands, save coordination, localization and rendering primitives. They do not import `experiments/`. The game page is a first-person architectural carrier with a shared presentation table, **not the completed farm or four scenes**. Pure recipe rules are available for later integration; no player completion shortcut, inventory economy or interactive crafting/processing business is included.

## Data and resources

- `web/src/domain/`: pure state, validation, commands and selectors.
- `web/src/persistence/`: checksummed versioned envelope and exclusive Web Locks transactions.
- `web/src/i18n/en.json`: editable draft English, including story, HTML fallback, accessibility and errors.
- `web/src/birthday.json`: recipient/sender interpolation.
- `web/src/render/`: original-resource loader, model compiler/factory and independent Three.js view.
- `web/src/ui/`: original bitmap font and sprite buttons; no P2 temporary-slot rules.
- `web/src/rules/`: pure matching, remainders, component predicates, native fuel/speed and tool/drop rules. `findCrafting`/`matchCrafting`/`matchCooking` return facts without unlocking items, discovering recipes or changing saves. `loadRules` loads the versioned normal-build data.
- `../data/minecraft/26.3/`: complete classification and causal source proofs. Builds emit only the bounded `rules.json` and small runtime manifest at `BASE_URL + rules/minecraft/26.3/`; full catalogs and internal evidence stay out of the website.
- `../resources/minecraft/26.3/`: committed originals, verified by the base and additive presentation manifests. Ordinary dev/build/preview needs no client installation or external cache.

The table is an authored prefab assembled from original oak slab/post geometry and textures. Its transforms define a presentation table, not an additional native Minecraft block. The cake uses the original uncut model. Unsupported model features fail explicitly; see the P2 model record and P3 report.

Both pages start frontally inside a materially wider real 3D room. The home remains frontal. On the game page, a short right click selects the visible table; dragging at least 6 CSS pixels changes bounded yaw/pitch without moving the eye or emitting the click. This user-selected gesture is gated by the settings and inventory GUIs. The sensitivity and limits remain engineering values for later scene review, with no pointer lock or crosshair. A workstation menu is not implemented at P4.

The formal save key is `minecraft-birthday-2026:formal:save`. Reset clears progress only and preserves language, volume and mute. Invalid/future saves are kept unchanged and read-only. There is no destructive recovery flow or silent fallback save. Browsers without Web Locks are read-only, with a localized explanation.

## Isolated verification

The formal game has an original-style unlimited catalogue (E / **Items (E)**), nine-slot HUD, offhand HUD, and equipment tab. Esc closes the screen; scene 1–9/wheel select a slot, while a catalogue item plus a number copies its native maximum into that hotbar slot. Left/right basic temporary pickup, splitting, merging and equipment validation use approved D04; middle click on an empty cursor clones the native maximum. Locked items remain inspectable but reject every implemented acquisition path.

`web/src/domain/slots.ts` and `inventory.ts` own pure carrier rules; `web/src/ui/inventory-input.ts` and `slot-gesture.ts` own GUI gestures; `ui/inventory.ts` renders and submits locked semantic transactions. `icon-model.ts`/`icons.ts` read actual item definitions, parents, GUI transforms, tint and special/composite branches. `web/src/i18n/items.en.json` holds original English names with a separate fallback interface. No generic substitute image is used. Catalogue resources are loaded automatically from the committed third manifest.

Hotbar, selected slot, equipment/offhand and nine C/X toolbar presets now persist in p5-layout-1. Exact checksummed P3 player reservations migrate to an empty layout without losing progress/settings/cake facts. Cursor remains page-local; **D07 has been asked but is not approved**, so current close/reload behavior is an unfinished contract, not the final policy. Native-style held-stack drag, middle clone/fill, double collect, finite Shift routing, hovered numeric exchange and F/Q/C/X use the shared domain reducer. C + 1-9 saves, X + 1-9 loads; Q removes one temporary unit and Ctrl+Q clears the stack, never an unlock. Without an open container, Shift from hotbar only autoequips valid armor; equipment returns to the finite hotbar. P6 supplies station routes. Physical right/middle drag and cancellation combinations still require manual validation; this is not full P5 acceptance.

```powershell
npm run dev:verify
```

Port **4184** is a separate test origin; open `/__verify__/index.html` and `/` in two tabs on that origin. Explicit fixture controls can grant a cake/place it, queue concurrent commands, test reset fencing and temporarily checkpoint a future-version value. These controls are absent from ordinary dev and every formal build. Restore the checkpoint after the future-version test. The long-copy page is `/__verify__/long.html`.

**Fixture: unlock catalogue** grants all 113 identities only on this separate test origin. Open its `/game/` for visual/input testing; acquisition order in the fixture follows its commands, not a production alphabetical sort. `/__verify__/icons.html` renders a native-icon contact sheet, with per-item coverage in its hidden read-only record. The `/__verify__/input.html` page mounts the formal game with a bounded trusted-event recorder in hidden `#input-evidence`. All verification routes are unavailable in ordinary dev/build. Maintainers may regenerate resources with `node tools/catalogue-assets.ts --client <locked-26.3-client.jar>`; normal clone/build needs no client or external cache.

**Read P4 rule data** checks browser loading/hash validation, native iron drops, adult-cow interaction, stick fuel and the cake grid/three bucket remainders. It compares the save bytes before and after the query. No rule-test action grants an item. Ordinary dev and verification use separate Vite caches to support simultaneous servers.

Data regeneration (maintainers only) uses `npm run data:export -- --client <official-26.3-client.jar>` and an existing JDK25 `javap`; the tool rejects other input hashes and never executes Minecraft. See `../data/minecraft/26.3/README.md` and `../docs/p4/` for field limits, candidate sources and reproducibility. Updating sources requires regenerating the registry and reviewing save compatibility; alternate tree/egg profiles are not approved P7 layouts.

For two-tab lock testing, reset test progress, click **Slow transaction: unlock log** in the first fixture tab, then **Fixture: unlock charcoal** in the second before the 1.5-second hold ends. Read both snapshots: both items must remain. Use **Run reset-before-stale-write check** for a queued old-generation write that must reject even without relying on event delivery.

Both P3 foundation and its synthetic development-v0 envelope migrate their exact empty player reservation. P1/P2 experimental saves are deliberately not imported. Recipe-book, station contents and timing contracts remain unpopulated version reservations. The new same-slot pickup and reset-before-stale-inventory fixture buttons use real Web Locks; their test cursors are recorded, not player gameplay policy. See `../docs/p5/part2-report.md` and `storage-input-contract.md` for the matrix and unresolved D07/manual items. See `../docs/p3/` for evidence, limitations and the storage contract.
