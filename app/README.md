# Formal application

Pinned runtime: Node 25.2.1 / npm 11.6.2; Three.js 0.186.1, Vite 8.3.4 and TypeScript 7.0.2.

```powershell
cd app
npm ci
npm run dev
```

Home: `http://127.0.0.1:4183/`; game: `/game/`. Root: `npm run build` / `npm run preview`. Pages: `npm run build:pages` / `npm run preview:pages` at `/minecraft-birthday-2026/`. Each main push runs the existing Pages workflow.

Four authored real first-person 3D scenes have fixed eye positions, bounded look, no movement and no crosshair. Hidden-pointer mode requests Pointer Lock on a user gesture and uses relative look/center ray; visible mode uses a pointer ray and right-drag. Denied/unsupported lock falls back visibly. Short right-click uses an object; empty short right-click switches pointer mode. Hold left to mine using the actual selected tool; hold an allowed device to place on a real legal support. R re-picks before rotating.

E opens native screen-space inventory: compass catalogue, chest player page, shared finite 27+9, armor/offhand and native Steve. The acquired catalogue is unlimited while groups remain finite. Crafting consumes matching inputs and creates real remainders atomically. Normal workbench close returns its real nine input groups; a full bag keeps inputs visible and asks the player to free space before closing. Furnaces consume finite input/fuel and store finite outputs; hoppers move finite groups. Discovery, ghosts, material availability and acquisition remain separate.

Esc opens the viewport-local game menu; T opens bounded local chat. Semantic HTML editors provide clipboard/IME/focus with native bitmap text/selection. English UI is supported; native Unicode glyphs preserve multilingual search and entered chat. Default username `sireoh` is configurable in Options. Reset keeps language, volume/mute and username.

Only a visible game page owning the shared clock advances all scenes, including GUI/options time. Hidden/offline/home-only time does not count. Wheat grows over 12 active seconds. Using an actual cake on the home table saves completion before celebration; reload never auto-replays. Home projects the same cake fact.

Original Java26.3 resources in `../resources/minecraft/26.3/` ship via audited manifests in Git and normal builds, with no private cache at runtime. `tools/experience-assets.py` exports bounded widget/search art, GUI lighting source, the official grass favicon and unchanged native Unihex glyphs with source/license hashes. Publishing rights remain separate from user development authorization.

Save key: `minecraft-birthday-2026:formal:save`; content version: `p8-experience-2`. Old saves migrate without deleting progress. Web Locks/generation fences protect commands, receipts, reset and one clock owner. Invalid/future data and failed writes are never silently overwritten.

Checks: `npm run check`, `npm test`, `npm run data:verify`, both builds, `npm run test:built`; historical P2 tests run under `../experiments/scene3d/`.

## Isolated verification

`npm run dev:verify` enables `/__verify__/` fixtures on a separate origin. Normal builds exclude them. In verification mode, ordinary `/game/?measure&capture-native` adds read-only capture without seeding/editing saves or bypassing player inputs. PNGs export actual canvas backings; full-page screenshots are CSS-resolution JPEGs. `/__verify__/performance.html?layout=chain&joint=1&gpu=1` explicitly seeds an isolated finite chain/completed replay state for load measurement; it is not ordinary completion evidence.

Actual normal-page cake/crop/crafting steps, canvas chains, nine Steve poses and 60-second joint load are indexed in `../docs/p8/experience-19/report.md`. Actual pointer-lock success, physical right/middle drag, OS minimization, hearing, other engines and Java-client visual equivalence are not inferred from unit tests. The user elected to perform physical-computer checks later.
