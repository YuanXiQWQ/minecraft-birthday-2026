# P2 realtime 3D prototype

This is the existing isolated P2 experiment, not the formal birthday game. It retains the approved first-person camera, centered scene, no crosshair, free-pointer ray picking, scheme B and screen-space original GUI.

## Run after cloning

From `experiments/scene3d/`, using the pinned lockfile:

```powershell
npm ci
npm run dev
```

Open `http://127.0.0.1:4178/game/`; `/` is independent. Implemented Java26.3 models/textures/GUI/ASCII/icons/particles/sounds load automatically from tracked `resources/minecraft/26.3/`. No Minecraft installation, MC_LOCAL_SAMPLES, private cache or resource-loading button is required. Audio playback still needs a user gesture. Developer tools can trigger effects, reload resources or explicitly select diagnostic geometry; none of these buttons completes the game or places cake.

```powershell
npm run check
npm test
npm run build
npm run preview
npm run build:subpath
npm run test:built
npm run preview:subpath
```

The subpath preview uses `/minecraft-birthday-2026/game/`. Both builds emit the same hash-verified resource namespace relative to Vite base, including models, texture/animation dependencies, original GUI, ASCII subset, two icon paths, particle sprites and twelve sound events. Only the twelve used sound definitions are selected; Ogg samples are unchanged. Complete clients, docs, personal paths, test evidence and unrelated assets are excluded. Public deployment is not part of this task.

## Diagnostics and evidence

`Run browser checks`, `Run vanilla browser checks`, `Run GUI foundation checks` and `Run celebration checks` inspect the existing slice. `Particle batch implementation` exposes the reference and pooled paths for before/after evidence only. `Run joint continuous profile` keeps the original GUI open, runs two complete warm-up cycles and ten measured five-shape cycles with the same seed, then publishes `#joint-profile-summary` and raw `#profile-run-0` through `#profile-run-11`. Do not interact, capture screenshots, run tests/builds or change the viewport during a timed series. CPU phase times, asynchronous GPU queries and browser long tasks are separate evidence; missing extensions are reported, not replaced with CPU guesses.

The GUI remains an experimental finite-slot fixture. Reload/close semantics do not approve D04–D07. There is no complete recipe system, inventory economy, four-scene production, XP/advancement gameplay or birthday finale. The product celebration still requires cake placement on the home table. Camera-control gestures D24 remain undecided.

Resource provenance/current rules: [resource index](../../docs/p2/resource-replacement-index.md). Historical P1/P2 reports and failure records remain in docs; their external-only resource restrictions have been superseded. Manual hearing/background/right-drag/Java comparison tasks remain pending in [manual checklist](../../docs/p2/manual-checklist.md). No mandatory hand-drawn replacement is assumed, and development authorization is not represented as a rights-holder license.

Closeout evidence and reuse boundaries: [P2 handoff](../../docs/p2/handoff-review.md), [performance analysis](../../docs/p2/performance-closeout.md). The native context-loss probe uses `WEBGL_lose_context` on the same canvas; after recovery, explicitly resume or cancel audio/effects. Resource failure checks inject invalid responses without editing assets. Raw frame exports stay in hidden diagnostic DOM to avoid rendering large JSON blocks. All hearing and real background/minimize checks require a person; signal energy is not listening evidence.
