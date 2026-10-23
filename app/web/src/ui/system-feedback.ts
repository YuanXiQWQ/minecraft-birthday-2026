/** Automatic system chat is allowlisted separately from Toasts, tooltips and container feedback. */
/** Java ChatFormatting.RED is the native failure-message color. */
export const FAILURE_COLOR = '#FF5555';
/** Nonfailure chat permitted by the current user contract. */
const INFORMATION = new Set(['game.worldHint', 'chat.tutorial', 'game.acquired', 'game.cakePlaced', 'status.ready', 'status.migrated']);
/** Project action failures that do not use the general error namespace. */
const ACTION_FAILURES = new Set(['game.actionFailed', 'game.inventoryFull', 'game.invalidPosition', 'game.pointerFailed', 'game.tableNeedsCake', 'game.harvestOverflow', 'status.unknown']);
/** Classify only automatic chat; other presentation channels do not pass this policy.
 * @param {string} key Localized message identity.
 * @return {'information'|'failure'|'omit'} Chat disposition.
 */
export function systemFeedback(key: string): 'information'|'failure'|'omit' {
    if (key === 'error.contextRestored') return 'omit';
    if (key.startsWith('error.') || key.startsWith('audio.') || ACTION_FAILURES.has(key)) return 'failure';
    return INFORMATION.has(key) || /^scene\.(plains|cave|farm|home)$/.test(key) ? 'information' : 'omit';
}
