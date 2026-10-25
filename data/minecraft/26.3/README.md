# Java 26.3 rule data

This directory is versioned source data, not a public-directory mirror. `app/tools/rule-data.ts` emits only `rules.json` and the small `runtime-manifest.json` (renamed `manifest.json`) at `BASE_URL + rules/minecraft/26.3/`. The full catalog, source witnesses, extraction hashes and this README stay outside the site.

- `catalog.json`: all 2,042 native recipe records, original and expanded item/block tags, selected loot/predicates, recipe discovery advancements, contextual providers and the statically resolved rule-relevant registration subset. The P1 convention is 1,763 nonbrewing records/21 types; all 279 brewing records are separately classified.
- `coverage.json`: the explicitly candidate oak/ordinary-egg profile, every item witness, every recipe classification and all 34 reachable fuel timings. It is a least fixed point of source, tool, station and recipe capabilities, not a main-path allowlist.
- `source-profiles.json`: ten log species from native tags and two alternative egg scenarios, with independent proofs and recipe sets. These are **not approved P7 scene definitions**.
- `cake-chain.json`: 112 actual recipe checks and the 18-step cake witness, including concrete grids/results/remainders.
- `rules.json`: bounded runtime rules; 113 candidate-profile item definitions, 112 recipes, needed expanded tags, source loot/predicates, native block tool flags, cow interaction and contextual providers. It does not decide permanent acquisition, recipe discovery or temporary-container behavior.
- `manifest.json`: official input identity, per-entry JSON/class SHA-256, exporter source hashes, exact output sizes/hashes and registry hash.

From **`app/`**, run `npm run data:verify` after cloning; no Minecraft installation or external cache is needed. To regenerate, use the already installed JDK25 `javap` and Node25:

```powershell
npm run data:export -- --client <path-to-official-26.3-client.jar>
```

The exporter rejects a client whose SHA-1 is not `e877b6a07acd633fb3bb475002175cec036e7b87`. Official URL: `https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar`. `--javap <path>` selects an existing executable. It reads ZIP/JSON and disassembles classes without executing Minecraft initialization or launching a client/server. No dependency installation is part of export.

Only P4-relevant defaults are interpreted: stack size, durability identity, equipment slot, crafting remainder, fuel and tool/drop tags, plus component identities. This is not a complete runtime registry/component simulator. Unsupported default component values and out-of-profile custom repair variants fail explicitly. Recipes and discovery facts are kept separate from project behavior candidates D04–D07. Source additions require regeneration and save compatibility review.

`.gitattributes` preserves generated JSON bytes across checkout. Development use of original data/resources is authorized by the project owner; public-release conditions remain a separate matter, without requiring a wholesale custom-asset replacement.

- `source-lock.json`: pinned official metadata, client/server downloads and asset-index identities used by resource exporters.
- `advancement-sources.json`: original advancement/class identities and generated-data hashes used by the advancement exporter and regression tests.
