/** Keep mutable native manifests aligned with the JavaScript build across browser HTTP caches. */

/** Vite owns root and repository Pages deployment prefixes. */
export const RESOURCE_BASE = (import.meta.env?.BASE_URL ?? '/') + 'minecraft/26.3/';

/** Fetch the current build's manifest and revalidate cached metadata before consuming it.
 * Resource payloads retain their existing hash checks and cacheable original URLs.
 * @param {string} name Native manifest filename.
 * @return {Promise<Response>} Revalidated manifest response; callers validate status and native version.
 */
export function fetchManifest(name: string): Promise<Response> {
    const build = import.meta.env?.BUILD_ID ?? 'development';
    return fetch(RESOURCE_BASE + name + '?build=' + encodeURIComponent(build), {cache: 'no-cache'});
}

/** Revalidate mutable derived documents while retaining ordinary caching for immutable original pixels and audio.
 * @param {string} path Audited relative asset path.
 * @return {Promise<Response>} Response whose bytes still require the manifest's integrity check.
 */
export function fetchAsset(path: string): Promise<Response> {
    return fetch(RESOURCE_BASE + path, path.endsWith('.json') ? {cache: 'no-cache'} : undefined);
}
