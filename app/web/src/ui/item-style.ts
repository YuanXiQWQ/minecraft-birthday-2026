/** Project name presentation overrides native rarity without changing native items or stack identity. */
export interface TextRun {text: string; color?: string; underline?: boolean; italic?: boolean}
/** Resolve the native Epic LIGHT_PURPLE mapping for the project completion item.
 * @param {string} id Native item ID.
 * @return {string} Name color only.
 */
export function itemColor(id: string): string {return id === 'minecraft:cake' ? '#FF55FF' : '#FFFFFF';}
