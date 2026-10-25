/** Java 26.3 control preferences and physical bindings for the implemented game actions. */
/** Native categories and defaults; browser codes preserve the physical left/right modifier distinction. */
export const KEY_BINDINGS = [
    ['forward','KeyW','movement'],['right','KeyD','movement'],['back','KeyS','movement'],['left','KeyA','movement'],
    ['sneak','ShiftLeft','movement'],['sprint','ControlLeft','movement'],['jump','Space','movement'],
    ['screenshot','F2','misc'],['togglePerspective','F5','misc'],
    ...Array.from({length:9},(_,i)=>['hotbar.'+(i+1),'Digit'+(i+1),'inventory']),
    ['inventory','KeyE','inventory'],['swapOffhand','KeyF','inventory'],['drop','KeyQ','inventory'],
    ['attack','Mouse0','gameplay'],['use','Mouse2','gameplay'],
    ['chat','KeyT','multiplayer'],['command','Slash','multiplayer'],
    ['saveToolbarActivator','KeyC','creative'],['loadToolbarActivator','KeyX','creative'],
    ['advancements','KeyL','misc']
] as readonly (readonly string[])[];
export interface ControlSettings {
    version:1; bindings:Record<string,string>;
    toggleCrouch:boolean; toggleSprint:boolean; toggleAttack:boolean; toggleUse:boolean;
    autoJump:boolean; sprintWindow:number; sensitivity:number; mouseWheelSensitivity:number;
    discreteMouseScroll:boolean; invertMouseX:boolean; invertMouseY:boolean; allowCursorChanges:boolean;
}
export type ControlPatch = Partial<Omit<ControlSettings,'version'>>;
/** Values from the locked Options constructor, independent of any player's options.txt. */
export const CONTROL_DEFAULTS:Readonly<ControlSettings> = Object.freeze({version:1,bindings:{},toggleCrouch:false,toggleSprint:false,toggleAttack:false,toggleUse:false,autoJump:false,sprintWindow:7,sensitivity:.5,mouseWheelSensitivity:1,discreteMouseScroll:false,invertMouseX:false,invertMouseY:false,allowCursorChanges:true});
/** Resolve old saves without writing a migration or altering game progress.
 * @param {ControlSettings|undefined} value Optional saved preferences.
 * @return {ControlSettings} Complete independent preferences.
 */
export function controlSettings(value?:ControlSettings):ControlSettings{return {...CONTROL_DEFAULTS,...value,bindings:{...value?.bindings}};}
/** Resolve the physical key for an implemented action, including explicit unbinding.
 * @param {ControlSettings|undefined} settings Saved preferences.
 * @param {string} action Native action suffix.
 * @return {string} Physical code, or empty string when unbound.
 */
export function boundKey(settings:ControlSettings|undefined,action:string):string{return settings?.bindings[action]??KEY_BINDINGS.find(([id])=>id===action)?.[1]??'';}
/** Match one physical press without treating an unbound key as a match.
 * @param {ControlSettings|undefined} settings Saved preferences.
 * @param {string} action Native action suffix.
 * @param {string} code Browser physical code.
 * @return {boolean} Whether the action owns this key.
 */
export function matchesBinding(settings:ControlSettings|undefined,action:string,code:string):boolean{return !!code&&boundKey(settings,action)===code;}
/** Validate a complete control document before accepting durable state.
 * @param {unknown} value Candidate save field.
 * @return {boolean} Whether every field and binding is known and finite.
 */
export function validControls(value:unknown):value is ControlSettings {
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const v=value as ControlSettings;
    if(Object.keys(v).length!==Object.keys(CONTROL_DEFAULTS).length||Object.keys(v).some(k=>!Object.hasOwn(CONTROL_DEFAULTS,k))||v.version!==1||!v.bindings||typeof v.bindings!=='object'||Array.isArray(v.bindings))return false;
    for(const [key,def] of Object.entries(CONTROL_DEFAULTS))if(typeof def==='boolean'&&typeof v[key as keyof ControlSettings]!=='boolean')return false;
    if(!Number.isInteger(v.sprintWindow)||v.sprintWindow<0||v.sprintWindow>10||!Number.isFinite(v.sensitivity)||v.sensitivity<0||v.sensitivity>1||!Number.isFinite(v.mouseWheelSensitivity)||v.mouseWheelSensitivity<.01||v.mouseWheelSensitivity>10)return false;
    return Object.entries(v.bindings).every(([id,code])=>KEY_BINDINGS.some(([key])=>key===id)&&typeof code==='string'&&(code===''||/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Mouse[0-7]|Numpad[A-Za-z0-9]+|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Meta(Left|Right)|Space|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|CapsLock|NumLock|ScrollLock|Pause|PrintScreen|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash|IntlRo|IntlYen|ContextMenu)$/.test(code)));
}
/** Merge only explicitly edited options/bindings into freshly locked preferences.
 * @param {ControlSettings|undefined} current Latest saved controls.
 * @param {ControlPatch} patch One user edit.
 * @return {ControlSettings} Validated merged controls.
 */
export function patchControls(current:ControlSettings|undefined,patch:ControlPatch):ControlSettings {
    if(!patch||!Object.keys(patch).length||Object.keys(patch).some(k=>k==='version'||!Object.hasOwn(CONTROL_DEFAULTS,k)))throw Error('invalid-controls');
    const next={...controlSettings(current),...patch,bindings:{...current?.bindings,...patch.bindings}};
    if(!validControls(next))throw Error('invalid-controls');return next;
}
/** Convert the native cubic mouse sensitivity into radians per relative pixel.
 * @param {number} sensitivity Native unit slider value.
 * @return {number} Radians per physical relative movement unit.
 */
export function lookSensitivity(sensitivity:number):number{return (sensitivity*.6000000238418579+.20000000298023224)**3*8*.15*Math.PI/180;}
/** Adapt browser pixel/line wheel units before applying native discrete scrolling and sensitivity.
 * @param {number} delta Browser wheel delta.
 * @param {number} mode DOM delta mode.
 * @param {ControlSettings} settings Current mouse preferences.
 * @return {number} Signed native wheel units.
 */
export function scrollDelta(delta:number,mode:number,settings:ControlSettings):number{const raw=mode===0?delta/100:mode===1?delta/3:delta;return(settings.discreteMouseScroll?Math.sign(raw):raw)*settings.mouseWheelSensitivity;}
/** Native toggle mappings change on a fresh press, never on repeat or release. */
export class ActionKeys {
    physical=new Set<string>(); active=new Set<string>();
    /** Apply a physical edge to every matching action.
     * @param {string} code Browser key or mouse code.
     * @param {boolean} down Press or release.
     * @param {ControlSettings} settings Current preferences.
     * @return {string[]} Freshly pressed action identities.
     */
    edge(code:string,down:boolean,settings:ControlSettings):string[]{
        const fresh=down&&!this.physical.has(code);if(down)this.physical.add(code);else this.physical.delete(code);
        const actions=KEY_BINDINGS.filter(([id])=>matchesBinding(settings,id,code)).map(([id])=>id);
        for(const id of actions){const toggle=({sneak:settings.toggleCrouch,sprint:settings.toggleSprint,attack:settings.toggleAttack,use:settings.toggleUse} as Record<string,boolean>)[id];
            if(toggle){if(fresh){if(this.active.has(id))this.active.delete(id);else this.active.add(id);}}else if(down)this.active.add(id);else this.active.delete(id);}
        return fresh?actions:[];
    }
    /** Release physical and toggled ownership at GUI, focus, scene and reset boundaries. */
    clear():void{this.physical.clear();this.active.clear();}
}
/** Accumulate fractional native scroll steps and discard the old remainder when direction changes. */
export class ControlScroll {
    remainder=0;
    /** Convert a DOM wheel delta into integral hotbar steps.
     * @param {number} delta Browser vertical wheel delta.
     * @param {number} mode DOM delta mode.
     * @param {ControlSettings} settings Current wheel preferences.
     * @return {number} Signed number of steps.
     */
    steps(delta:number,mode:number,settings:ControlSettings):number{const value=scrollDelta(delta,mode,settings);if(Math.sign(value)!==Math.sign(this.remainder))this.remainder=0;this.remainder+=value;const steps=Math.trunc(this.remainder);this.remainder-=steps;return steps;}
}
