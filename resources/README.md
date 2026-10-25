# Minecraft Java Edition 26.3 runtime resources

minecraft/26.3 contains the original and project-derived assets used by the application. They are tracked in Git and included in normal development, build and preview output; running the application requires no local Minecraft installation or private extraction cache.

The manifests identify the source version, official client SHA-1, file sizes, SHA-256 hashes and resource dependencies. Project-derived assets have separate provenance. app/tools/resources.ts validates and emits the supported manifests and their listed files under the configured deployment base path.

Resource exporters live in app/tools. Official download identities are in data/minecraft/26.3/source-lock.json. Preserve model parents, textures, animation metadata, localization, fonts and sound dependencies when changing a resource profile. Check both root and Pages deployment paths and retain old-cache compatibility regressions.

Source documents, test outputs and complete client archives are excluded from the website. Development authorization does not constitute permission from the rights holder for public redistribution.
