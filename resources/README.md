# Minecraft Java Edition 26.3 runtime resources

This directory contains the bounded original resource cohort used by the existing prototype. It is tracked in Git and included in normal development, build and preview output. No local Minecraft installation, private cache, environment variable or manual extraction is required to run the implemented features.

`minecraft/26.3/manifest.json` records source version, provenance, file sizes, SHA-256 values, original sound object identities and the explicitly derived twelve-event sound definition subset. The 95 resource files preserve the used model parents, textures, UV/state inputs, animation metadata, GUI assets, ASCII font subset, item definitions, particle frames and Ogg samples. The complete client and unrelated resources are not included.

The current font adapter intentionally supports the ASCII bitmap provider, not every provider referenced by the original font definitions. The model adapter supports the already validated five block families only. Broader game content remains future work.

Development use is approved by the project owner. This statement is not a claim of permission from the rights holder for public redistribution. Public-release terms remain a separate review; there is no mandatory replacement with hand-drawn assets. Any later custom replacement must be explicitly requested and audited per resource category, including audio separately.

The Vite plugin emits only manifest-listed runtime files under its configured base path. This README, project documents, test records, JAR files and personal extraction paths are not runtime assets.