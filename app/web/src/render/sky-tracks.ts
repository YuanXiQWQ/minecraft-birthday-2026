/** Sample original timeline tracks with circular boundaries and native cubic-bezier easing. */
export interface Track {keyframes:{ticks:number;value:any}[];ease?:'constant'|{cubic_bezier:number[]};modifier?:string}
/** Evaluate a parametric cubic coordinate. @param {number} t Curve parameter. @param {number} a First handle. @param {number} b Second handle. @return {number} Coordinate. */
function cubic(t:number,a:number,b:number):number{return 3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;}
/** Invert native easing X before evaluating Y. @param {number} progress Linear interval. @param {number[]} control Original four handles. @return {number} Eased interval. */
export function bezier(progress:number,control:number[]):number{if(progress<=0)return 0;if(progress>=1)return 1;let lo=0,hi=1;for(let i=0;i<30;i++){const t=(lo+hi)/2;if(cubic(t,control[0],control[2])<progress)lo=t;else hi=t;}return cubic((lo+hi)/2,control[1],control[3]);}
/** Parse native RGB or ARGB color strings. @param {string} text Native color. @return {number[]} R/G/B/A components. */
export function rgba(text:string):number[]{const h=text.slice(1),v=parseInt(h,16);return[(v>>>16&255)/255,(v>>>8&255)/255,(v&255)/255,h.length===8?(v>>>24&255)/255:1];}
/** Sample one original track without guessing keyframes, angle offsets or durations.
 * @param {Track} track Native track.
 * @param {number} ticks Clock ticks.
 * @param {number} period Native period.
 * @return {any} Interpolated scalar, color, boolean or discrete phase.
 */
export function trackAt(track:Track,ticks:number,period:number):any{
    const frames=track.keyframes,time=((ticks%period)+period)%period;
    let i=-1;for(let n=0;n<frames.length;n++)if(frames[n].ticks<=time)i=n;
    if(i<0)i=frames.length-1;
    const a=frames[i],b=frames[(i+1)%frames.length];let span=(b.ticks-a.ticks+period)%period;if(span===0)span=period;
    let t=((time-a.ticks+period)%period)/span;
    if(track.ease==='constant'||typeof a.value==='boolean'||typeof a.value==='string'&&!a.value.startsWith('#'))return a.value;
    if(track.ease&&typeof track.ease==='object')t=bezier(t,track.ease.cubic_bezier);
    if(typeof a.value==='number')return a.value+(b.value-a.value)*t;
    const ac=rgba(a.value),bc=rgba(b.value);return ac.map((v,j)=>v+(bc[j]-v)*t);
}
/** Apply WeatherAttributes' BLEND_TO_GRAY modifier using native luminance weights.
 * @param {number[]} rgb Input encoded components.
 * @param {number} brightness Native grayscale brightness.
 * @param {number} factor Modifier blend factor.
 * @return {number[]} Modified components.
 */
export function grayWeather(rgb:number[],brightness:number,factor:number):number[]{const gray=(rgb[0]*.3+rgb[1]*.59+rgb[2]*.11)*brightness;return rgb.map((v,i)=>i<3?v+(gray-v)*factor:v);}
