/** Deterministic Java 26.3 weather countdowns share the existing active-game tick transaction. */
export interface EnvironmentState {
    version: 2;
    clearWeatherTime: number;
    control: SimulationControl;
    dayTicks: number;
    random: number;
    rainTime: number;
    thunderTime: number;
    raining: boolean;
    thundering: boolean;
    rainLevel: number;
    thunderLevel: number;
}
/** Persist command-controlled server tick and overworld clock identities independently of render frames. */
export interface SimulationControl {
    epoch:number; tickRate:number; frozen:boolean; stepTicks:number; sprintTicks:number; sprintRestore:boolean;
    advanceTime:boolean; advanceWeather:boolean; clockPaused:boolean; clockRate:number; clockFraction:number;
}
/** Native defaults: twenty server ticks per second and one advancing overworld clock tick per game tick.
 * @return {SimulationControl} Independent command state.
 */
export function emptyControl():SimulationControl{return{epoch:0,tickRate:20,frozen:false,stepTicks:0,sprintTicks:0,sprintRestore:false,advanceTime:true,advanceWeather:true,clockPaused:false,clockRate:1,clockFraction:0};}
export interface SkySettings {time: 'game'|'real'; weather: 'game'|'real'}
/** Default world seed is an authored reproducibility choice; sampling uses native Java's 48-bit generator. */
export const WEATHER_SEED=60426;
/** Native UniformInt bounds from ServerLevel's 26.3 static initialization, inclusive at both ends. */
export const WEATHER_TIMERS={rainDelay:[12000,180000],rainDuration:[12000,24000],thunderDelay:[12000,180000],thunderDuration:[3600,15600]} as const;

/** Implement Java Legacy/SingleThreadedRandomSource without changing integer distribution. */
export class NativeRandom {
    state: bigint;
    /** Initialize from a Java seed or an already persisted internal state.
     * @param {number} seed Seed or unsigned 48-bit state.
     * @param {boolean} internal Whether to restore internal bits without re-scrambling.
     */
    constructor(seed:number,internal=false){this.state=(BigInt(seed)^(internal?0n:0x5DEECE66Dn))&((1n<<48n)-1n);}
    /** Advance one native LCG step. @param {number} bits Number of high-order bits. @return {number} Exact requested unsigned bits. */
    next(bits:number):number{this.state=(this.state*0x5DEECE66Dn+11n)&((1n<<48n)-1n);return Number(this.state>>BigInt(48-bits));}
    /** Sample an inclusive bounded integer using Java's overflow rejection branch.
     * @param {number} min Inclusive lower bound.
     * @param {number} max Inclusive upper bound.
     * @return {number} Uniform integer.
     */
    integer(min:number,max:number):number{
        const bound=max-min+1;if((bound&-bound)===bound)return min+Math.floor(bound*this.next(31)/2147483648);
        let bits:number,value:number;do{bits=this.next(31);value=bits%bound;}while(((bits-value+bound-1)|0)<0);return min+value;
    }
    /** Sample native nextFloat. @return {number} Uniform 24-bit fraction. */
    float():number{return this.next(24)/16777216;}
    /** Sample native nextDouble. @return {number} Uniform 53-bit fraction. */
    double():number{return (this.next(26)*134217728+this.next(27))/9007199254740992;}
}

/** Start at the native day marker with uninitialized clear-weather counters.
 * @return {EnvironmentState} Independent durable environment state.
 */
export function emptyEnvironment():EnvironmentState{return{version:2,clearWeatherTime:0,control:emptyControl(),dayTicks:1000,random:Number(new NativeRandom(WEATHER_SEED).state),rainTime:0,thunderTime:0,raining:false,thundering:false,rainLevel:0,thunderLevel:0};}

/** Apply exactly one advanceWeatherCycle step; zero counters choose a duration on the following tick.
 * @param {EnvironmentState} state Transaction-local environment.
 */
export function tickEnvironment(state:EnvironmentState):void{
    const c=state.control;
    if(c.advanceTime&&!c.clockPaused){const total=Math.fround(c.clockFraction+c.clockRate),whole=Math.floor(total);state.dayTicks+=whole;c.clockFraction=Math.fround(total-whole);}

    const rng=new NativeRandom(state.random,true);
    if(c.advanceWeather){
    if(state.clearWeatherTime>0){state.clearWeatherTime--;state.thunderTime=state.thundering?0:1;state.rainTime=state.raining?0:1;state.thundering=state.raining=false;}
    else {
    if(state.thunderTime>0){if(--state.thunderTime===0)state.thundering=!state.thundering;}
    else {const range=state.thundering?WEATHER_TIMERS.thunderDuration:WEATHER_TIMERS.thunderDelay;state.thunderTime=rng.integer(range[0],range[1]);}
    if(state.rainTime>0){if(--state.rainTime===0)state.raining=!state.raining;}
    else {const range=state.raining?WEATHER_TIMERS.rainDuration:WEATHER_TIMERS.rainDelay;state.rainTime=rng.integer(range[0],range[1]);}
    }
    state.random=Number(rng.state);
    }
    state.rainLevel=Math.max(0,Math.min(1,Math.fround(state.rainLevel+(state.raining?Math.fround(.01):-Math.fround(.01)))));
    state.thunderLevel=Math.max(0,Math.min(1,Math.fround(state.thunderLevel+(state.thundering?Math.fround(.01):-Math.fround(.01)))));
}

/** Reject malformed timers, flags, additional fields and non-finite persisted clock values.
 * @param {unknown} value Candidate environment.
 */
export function validateEnvironment(value:unknown):asserts value is EnvironmentState{
    const s=value as EnvironmentState;
    if(!s||Object.keys(s).sort().join('|')!=='clearWeatherTime|control|dayTicks|rainLevel|rainTime|raining|random|thunderLevel|thunderTime|thundering|version'||s.version!==2||
        ![s.dayTicks,s.rainTime,s.thunderTime,s.clearWeatherTime,s.random].every(n=>Number.isSafeInteger(n)&&n>=0)||s.random>=281474976710656||s.rainTime>2147483647||s.thunderTime>2147483647||s.clearWeatherTime>2147483647||
        ![s.rainLevel,s.thunderLevel].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||typeof s.raining!=='boolean'||typeof s.thundering!=='boolean')throw Error('invalid-environment');
    const c=s.control;
    if(!c||Object.keys(c).sort().join('|')!=='advanceTime|advanceWeather|clockFraction|clockPaused|clockRate|epoch|frozen|sprintRestore|sprintTicks|stepTicks|tickRate'||
      ![c.epoch,c.stepTicks,c.sprintTicks].every(n=>Number.isSafeInteger(n)&&n>=0)||c.stepTicks>2147483647||c.sprintTicks>2147483647||
      ![c.advanceTime,c.advanceWeather,c.clockPaused,c.frozen,c.sprintRestore].every(n=>typeof n==='boolean')||
      !Number.isFinite(c.tickRate)||c.tickRate<1||c.tickRate>10000||!Number.isFinite(c.clockRate)||c.clockRate<Math.fround(.00001)||c.clockRate>1000||
      !Number.isFinite(c.clockFraction)||c.clockFraction<0||c.clockFraction>=1)throw Error('invalid-environment-control');
}

/** Validate independent time/weather preferences without storing location or network observations.
 * @param {unknown} value Preference value.
 */
export function validateSkySettings(value:unknown):asserts value is SkySettings{
    const s=value as SkySettings;
    if(!s||Object.keys(s).sort().join('|')!=='time|weather'||!['game','real'].includes(s.time)||!['game','real'].includes(s.weather))throw Error('invalid-sky-settings');
}

/** Map browser-local civil time to the native 06:00 origin while preserving lunar day progression.
 * @param {Date} date Explicit local civil time.
 * @return {number} Native time within the day.
 */
export function realDayTicks(date:Date):number{return ((date.getHours()*3600+date.getMinutes()*60+date.getSeconds()+date.getMilliseconds()/1000-21600+86400)%86400)/3.6;}

/** Validate the previous exact environment before adding native command defaults during a versioned migration.
 * @param {unknown} value Checksummed previous environment.
 * @return {EnvironmentState} New validated environment without changing existing time or weather.
 */
export function migrateEnvironment(value:unknown):EnvironmentState {
 const old=value as Record<string,unknown>;
 if(!old||old.version!==1||Object.keys(old).sort().join('|')!=='dayTicks|rainLevel|rainTime|raining|random|thunderLevel|thunderTime|thundering|version')throw Error('invalid-old-environment');
 const result={...old,version:2,clearWeatherTime:0,control:emptyControl()} as EnvironmentState;validateEnvironment(result);return result;
}
