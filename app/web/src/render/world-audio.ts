/** Verified local sound events use one gesture-activated context and generation-fenced decode work. */
import {soundGain,soundChannel} from '../domain/audio-settings.ts';
import {RESOURCE_BASE} from './resources.ts';
import type {Settings} from '../domain/types.ts';
/** Static source ownership stays bounded; streaming game music uses its separate media node. */
const MAX_STATIC_VOICES=256;
export interface SoundOptions {volume?:number;pitch?:number;variant?:number;position?:[number,number,number]}
/** Select an original weighted sample without replacing its definition parameters.
 * @param {any[]} sounds Native event choices.
 * @param {number} value Uniform zero-to-one random value.
 * @return {any} Original choice normalized to an object.
 */
export function soundSample(sounds:any[],value=Math.random()):any{const list=sounds.map(s=>typeof s==='string'?{name:s}:s),total=list.reduce((n,s)=>n+(s.weight??1),0);let pick=Math.min(.9999999999999999,Math.max(0,value))*total;for(const s of list){pick-=s.weight??1;if(pick<0)return s;}return list.at(-1);}
/** Own decoded buffers, bounded diagnostics and cancellable native UI/world voices. */
export class WorldAudio {
    context: AudioContext|null=null;
    buffers=new Map<string,AudioBuffer>();
    loading=new Map<string,Promise<AudioBuffer>>();
    weatherRequests=new Map<string,number>();
    weatherStarts=new Map<string,number>();
    voices=new Map<AudioBufferSourceNode,{gain:GainNode;volume:number;event:string;panner:PannerNode|null}>();
    disposed=false;
    epoch=0;
    records:object[]=[];
    abort=new AbortController();
    /** Retain source manifests and live settings without taking ownership of progression.
     * @param {Map<string,any>} documents Verified native definitions and hash metadata.
     * @param {Function} settings Latest preferences.
     */
    constructor(public documents:Map<string,any>,public settings:()=>Settings){
        document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();},{signal:this.abort.signal});
    }
    /** Record an actual scheduling outcome without asserting human audibility.
     * @param {string} event Native event or activation marker.
     * @param {string} status Actual browser outcome.
     * @param {object} parameters Actual scheduled sample parameters.
     */
    record(event:string,status:string,parameters:object={}):void{this.records.push({event,status,...parameters,at:performance.now(),audioTime:this.context?.currentTime??null,epoch:this.epoch});if(this.records.length>100)this.records.shift();}
    /** Resume the audio context only within an actual input gesture. */
    activate():void{if(this.disposed)return;try{this.context??=new AudioContext();void this.context.resume().then(()=>this.record('activation',this.context!.state)).catch(()=>this.record('activation','blocked'));}catch{this.record('activation','unavailable');}}
    /** Apply effective local preferences to playing voices and invalidate muted pending decodes. */
    sync():void{const s=this.settings();for(const v of this.voices.values())v.gain.gain.value=soundGain(s,v.event)*v.volume;if(s.muted)this.cancel();}
    /** Share one verified decode per immutable resource rather than issuing parallel fetch/decoder bursts.
     * @param {string} path Audited sound path.
     * @param {AudioContext} context Existing context.
     * @return {Promise<AudioBuffer>} Cached or in-flight native buffer.
     */
    async buffer(path:string,context:AudioContext):Promise<AudioBuffer>{
        const cached=this.buffers.get(path);if(cached)return cached;
        const pending=this.loading.get(path);if(pending)return pending;
        const owner=this.epoch,work=(async()=>{let entry=this.documents.get('$native-entries')?.find((e:any)=>e.entry===path);if(!entry){const manifest=await(await fetch(RESOURCE_BASE+'world-manifest.json')).json();entry=manifest.entries.find((e:any)=>e.entry===path);}if(!entry)throw Error('sound-missing');const response=await fetch(RESOURCE_BASE+path);if(!response.ok)throw Error('sound-missing');const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==entry.sha256||bytes.byteLength!==entry.size)throw Error('sound-integrity');const value=await context.decodeAudioData(bytes);if(!this.disposed&&owner===this.epoch)this.buffers.set(path,value);return value;})();
        this.loading.set(path,work);try{return await work;}finally{if(this.loading.get(path)===work)this.loading.delete(path);}
    }
    /** Share audited decodes, coalesce weather bursts by client playback time, and fence every asynchronous voice.
     * @param {string} id Native sound event identity.
     * @param {SoundOptions} options Native caller parameters and optional world position.
     * @return {Promise<string>} Scheduling outcome; human audibility is not inferred.
     */
    async play(id:string,options:SoundOptions={}):Promise<string>{
        const c=this.context,s=this.settings(),epoch=this.epoch;
        if(this.disposed||document.hidden||!soundGain(s,id)){this.record(id,'suppressed');return 'suppressed';}
        if(!c||c.state!=='running'){this.record(id,'blocked');return 'blocked';}
        const weather=id.startsWith('weather.rain')?'rain':id.startsWith('entity.lightning_bolt.')?id:null,requested=performance.now();
        if(weather){if(requested-(this.weatherRequests.get(weather)??-Infinity)<50){this.record(id,'coalesced');return 'coalesced';}this.weatherRequests.set(weather,requested);}
        const definition=this.definition(id),raw=definition?.sounds?.length?soundSample(definition.sounds,options.variant):null;
        if(!raw){this.record(id,'missing-event');return 'missing-event';}
        const path='assets/minecraft/sounds/'+(typeof raw==='string'?raw:raw.name).replace('minecraft:','')+'.ogg';
        try{
            const buffer=await this.buffer(path,c);
            if(this.disposed||epoch!==this.epoch||document.hidden||this.settings().muted){this.record(id,'cancelled');return 'cancelled';}
            if(weather){const now=performance.now();if(now-(this.weatherStarts.get(weather)??-Infinity)<50){this.record(id,'coalesced');return 'coalesced';}this.weatherStarts.set(weather,now);}
            if(this.voices.size>=MAX_STATIC_VOICES){this.record(id,'channel-full');return 'channel-full';}
            const current=this.settings(),source=c.createBufferSource(),gain=c.createGain(),rawVolume=(raw.volume??1)*(options.volume??1),volume=Math.min(1,rawVolume);
            source.buffer=buffer;source.playbackRate.value=(raw.pitch??1)*(options.pitch??1);gain.gain.value=soundGain(current,id)*volume;
            const panner=options.position?c.createPanner():null;source.connect(gain);if(panner){panner.panningModel='equalpower';panner.distanceModel='linear';panner.refDistance=0;panner.maxDistance=Math.max(1,rawVolume)*16;panner.rolloffFactor=1;[panner.positionX.value,panner.positionY.value,panner.positionZ.value]=options.position!;gain.connect(panner).connect(c.destination);}else gain.connect(c.destination);this.voices.set(source,{gain,volume,event:id,panner});
            source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();panner?.disconnect();};source.start();
            this.record(id,'scheduled',{sample:path,volume:gain.gain.value,pitch:source.playbackRate.value,duration:buffer.duration,category:soundChannel(id),sourceVolume:rawVolume,position:options.position});return 'scheduled';
        }catch(error){if(this.disposed||epoch!==this.epoch||document.hidden){this.record(id,'cancelled',{requestEpoch:epoch});return 'cancelled';}const status=error instanceof Error?error.message:'decode-failed';this.record(id,status);return status;}
    }
    /** Resolve audited world, weather and interface definitions without a network discovery fallback.
     * @param {string} id Native event identity.
     * @return {any} Original event definition when available.
     */
    definition(id:string):any{return this.documents.get('assets/minecraft/ambience-sounds.json')?.[id]??this.documents.get('assets/minecraft/world-sounds.json')?.[id]??this.documents.get('$native-sounds')?.[id];}
    /** Update the stationary listener from the real camera.
     * @param {number[]} position Current three-dimensional eye.
     * @param {number[]} forward Current camera forward direction.
     */
    listener(position:number[],forward=[0,0,-1]):void{const l=this.context?.listener;if(l?.positionX){l.positionX.value=position[0];l.positionY.value=position[1];l.positionZ.value=position[2];l.forwardX.value=forward[0];l.forwardY.value=forward[1];l.forwardZ.value=forward[2];l.upX.value=0;l.upY.value=1;l.upZ.value=0;}}
    /** Cancel live voices and invalidate unfinished decodes without discarding bounded reusable buffers. */
    cancel():void{this.epoch++;this.loading.clear();this.weatherRequests.clear();this.weatherStarts.clear();for(const v of this.voices.keys()){try{v.stop();}catch{}}this.voices.clear();}
    /** Release the single audio context and all lifecycle listeners. */
    dispose():void{this.disposed=true;this.cancel();this.abort.abort();this.buffers.clear();void this.context?.close();}
}
