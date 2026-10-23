/** Verified local sound events use one gesture-activated context and generation-fenced decode work. */
import {RESOURCE_BASE} from './resources.ts';
import type {Settings} from '../domain/types.ts';
/** Own decoded buffers, bounded diagnostics and cancellable native UI/world voices. */
export class WorldAudio {
    context: AudioContext|null=null;
    buffers=new Map<string,AudioBuffer>();
    voices=new Map<AudioBufferSourceNode,{gain:GainNode;volume:number}>();
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
    /** Apply committed preferences to already-playing voices and invalidate muted pending decodes. */
    sync():void{const s=this.settings();for(const v of this.voices.values())v.gain.gain.value=s.muted?0:s.volume*v.volume;if(s.muted)this.cancel();}
    /** Decode and schedule an actual native sample, checking lifecycle again after each asynchronous boundary.
     * @param {string} id Native sound event identity.
     * @return {Promise<string>} Scheduling outcome; human audibility is not inferred.
     */
    async play(id:string):Promise<string>{
        const c=this.context,s=this.settings(),epoch=this.epoch;
        if(this.disposed||document.hidden||s.muted||!s.volume){this.record(id,'suppressed');return 'suppressed';}
        if(!c||c.state!=='running'){this.record(id,'blocked');return 'blocked';}
        const definition=this.documents.get('assets/minecraft/world-sounds.json')?.[id]??this.documents.get('$native-sounds')?.[id],raw=definition?.sounds?.[0];
        if(!raw){this.record(id,'missing-event');return 'missing-event';}
        const path='assets/minecraft/sounds/'+(typeof raw==='string'?raw:raw.name).replace('minecraft:','')+'.ogg';
        try{
            let buffer=this.buffers.get(path);
            if(!buffer){
                let entry=this.documents.get('$native-entries')?.find((e:any)=>e.entry===path);
                if(!entry){const manifest=await(await fetch(RESOURCE_BASE+'world-manifest.json')).json();entry=manifest.entries.find((e:any)=>e.entry===path);}
                if(!entry)throw Error('sound-missing');
                const response=await fetch(RESOURCE_BASE+path);if(!response.ok)throw Error('sound-missing');
                const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
                if(hash!==entry.sha256)throw Error('sound-integrity');
                buffer=await c.decodeAudioData(bytes);if(this.disposed||epoch!==this.epoch){this.record(id,'cancelled',{requestEpoch:epoch});return 'cancelled';}this.buffers.set(path,buffer);
            }
            if(this.disposed||epoch!==this.epoch||document.hidden||this.settings().muted){this.record(id,'cancelled');return 'cancelled';}
            const current=this.settings(),source=c.createBufferSource(),gain=c.createGain(),volume=typeof raw==='object'?raw.volume??1:1;
            source.buffer=buffer;source.playbackRate.value=typeof raw==='object'?raw.pitch??1:1;gain.gain.value=current.volume*volume;
            source.connect(gain).connect(c.destination);this.voices.set(source,{gain,volume});
            source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};source.start();
            this.record(id,'scheduled',{sample:path,volume:gain.gain.value,pitch:source.playbackRate.value,duration:buffer.duration});return 'scheduled';
        }catch(error){if(this.disposed||epoch!==this.epoch||document.hidden){this.record(id,'cancelled',{requestEpoch:epoch});return 'cancelled';}const status=error instanceof Error?error.message:'decode-failed';this.record(id,status);return status;}
    }
    /** Cancel live voices and invalidate unfinished decodes without discarding bounded reusable buffers. */
    cancel():void{this.epoch++;for(const v of this.voices.keys()){try{v.stop();}catch{}}this.voices.clear();}
    /** Release the single audio context and all lifecycle listeners. */
    dispose():void{this.disposed=true;this.cancel();this.abort.abort();this.buffers.clear();void this.context?.close();}
}
