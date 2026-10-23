/** Styled text retains native component hovers; project item colors do not change item or stack identity. */
export interface TextRun {text: string; color?: string; underline?: boolean; italic?: boolean; hover?:{text:string;color?:string}[]}
/** Resolve the native Epic LIGHT_PURPLE mapping for the project completion item.
 * @param {string} id Native item ID.
 * @return {string} Name color only.
 */
export function itemColor(id: string): string {return id === 'minecraft:cake' ? '#FF55FF' : '#FFFFFF';}
