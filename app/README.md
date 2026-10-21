# Formal application — P3

Run commands **inside `app/`**, using Node 25.2.1/npm 11.6.2 (the tested environment). `npm ci` installs the exact existing P2 versions: Three 0.186.1, Vite 8.3.4 and TypeScript 7.0.2. No React or additional runtime library is required.

```powershell
cd app
npm ci
npm run dev
```

- Home: http://127.0.0.1:4183/
- Game: http://127.0.0.1:4183/game/
- `npm run check` and `npm test`: strict compilation and 20 domain/persistence/resource/localization tests.
- `npm run build` / `npm run preview`: root output, preview port 4185.
- `npm run build:pages` / `npm run preview:pages`: `/minecraft-birthday-2026/` output, preview port 4186.
- `npm run test:built`: real HTTP checks against both built outputs, including all 114 original-resource/profile files and excluded internal routes.

The two independent HTML entries share domain commands, save coordination, localization and rendering primitives. They do not import `experiments/`. The game page is a first-person architectural carrier with a shared presentation table, **not the completed farm or four scenes**. There is no player completion shortcut, inventory economy or recipe implementation.

## Data and resources

- `web/src/domain/`: pure state, validation, commands and selectors.
- `web/src/persistence/`: checksummed versioned envelope and exclusive Web Locks transactions.
- `web/src/i18n/en.json`: editable draft English, including story, HTML fallback, accessibility and errors.
- `web/src/birthday.json`: recipient/sender interpolation.
- `web/src/render/`: original-resource loader, model compiler/factory and independent Three.js view.
- `web/src/ui/`: original bitmap font and sprite buttons; no P2 temporary-slot rules.
- `../resources/minecraft/26.3/`: committed originals, verified by the base and additive presentation manifests. Ordinary dev/build/preview needs no client installation or external cache.

The table is an authored prefab assembled from original oak slab/post geometry and textures. Its transforms define a presentation table, not an additional native Minecraft block. The cake uses the original uncut model. Unsupported model features fail explicitly; see the P2 model record and P3 report.

The formal save key is `minecraft-birthday-2026:formal:save`. Reset clears progress only and preserves language, volume and mute. Invalid/future saves are kept unchanged and read-only. There is no destructive recovery flow or silent fallback save. Browsers without Web Locks are read-only, with a localized explanation.

## Isolated verification

```powershell
npm run dev:verify
```

Port **4184** is a separate test origin; open `/__verify__/index.html` and `/` in two tabs on that origin. Explicit fixture controls can grant a cake/place it, queue concurrent commands, test reset fencing and temporarily checkpoint a future-version value. These controls are absent from ordinary dev and every formal build. Restore the checkpoint after the future-version test. The long-copy page is `/__verify__/long.html`.

For two-tab lock testing, reset test progress, click **Slow transaction: unlock log** in the first fixture tab, then **Fixture: unlock charcoal** in the second before the 1.5-second hold ends. Read both snapshots: both items must remain. Use **Run reset-before-stale-write check** for a queued old-generation write that must reject even without relying on event delivery.

The only supported migration sample is the documented synthetic development-v0 envelope; P1/P2 experimental saves are deliberately not imported. Pending GUI, recipe-book and timing product contracts remain unpopulated version reservations. See `../docs/p3/` for evidence, limitations and the storage contract.
