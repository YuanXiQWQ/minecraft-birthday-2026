/** Native game-music scheduling streams one audited original track through the shared browser audio context. */
import {RESOURCE_BASE} from './resources.ts';
import {WorldAudio,soundSample} from './world-audio.ts';
import {soundGain} from '../domain/audio-settings.ts';
import {NativeRandom} from '../domain/environment.ts';

/** Keep music outside save state, with native client-tick delays and generation-fenced asynchronous loads. */
export class GameMusic {
    media:HTMLAudioElement|null=null;node:MediaElementAudioSourceNode|null=null;gain:GainNode|null=null;url:string|null=null;
    epoch=0;pending=false;disposed=false;last=0;remainder=0;delay=100;sampleVolume=1;track:string|null=null;
    random:NativeRandom;abort=new AbortController();
    /** Use one existing context and an injectable native random stream.
     * @param {WorldAudio} audio Shared gesture-activated sound owner.
     * @param {number} seed Session music selection seed.
     */
    constructor(public audio:WorldAudio,seed=Date.now()%2147483647){this.random=new NativeRandom(seed);document.addEventListener('visibilitychange',()=>{this.last=0;if(document.hidden)this.cancel();},{signal:this.abort.signal});}
    /** Advance native client time only while visible and activated, retaining GUI playback.
     * @param {number} now Monotonic frame timestamp.
     */
    update(now:number):void{
        if(this.disposed||document.hidden)return;
        const gain=soundGain(this.audio.settings(),'music.game');if(this.gain)this.gain.gain.value=gain*this.sampleVolume;
        if(!gain){if(this.media||this.pending)this.cancel();this.last=now;return;}
        if(this.audio.context?.state!=='running'){this.last=now;return;}
        if(this.last){const elapsed=now-this.last+this.remainder,ticks=Math.floor(elapsed/50);this.remainder=elapsed-ticks*50;if(!this.media&&!this.pending)this.delay-=ticks;}
        this.last=now;if(this.delay<=0&&!this.media&&!this.pending)void this.start();
    }
    /** Verify one original weighted streaming asset before attaching it to the shared audio graph.
     * @return {Promise<void>} Current load/play attempt.
     */
    async start():Promise<void>{
        const context=this.audio.context,owner=this.epoch;if(!context||context.state!=='running'||this.pending||this.disposed)return;this.pending=true;
        const raw=soundSample(this.audio.definition('music.game')?.sounds??[],this.random.double());
        try{
            if(!raw)throw Error('music-event-missing');const path='assets/minecraft/sounds/'+raw.name+'.ogg',entry=this.audio.documents.get('$native-entries')?.find((e:any)=>e.entry===path);
            if(!entry)throw Error('music-resource-missing');const response=await fetch(RESOURCE_BASE+path);if(!response.ok)throw Error('music-resource-missing');const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
            if(bytes.byteLength!==entry.size||hash!==entry.sha256)throw Error('music-integrity');if(owner!==this.epoch||this.disposed||document.hidden)return;
            const media=this.media=new Audio(),url=this.url=URL.createObjectURL(new Blob([bytes],{type:'audio/ogg'})),node=this.node=context.createMediaElementSource(media),gain=this.gain=context.createGain();
            this.track=raw.name;this.sampleVolume=raw.volume??1;gain.gain.value=soundGain(this.audio.settings(),'music.game')*this.sampleVolume;node.connect(gain).connect(context.destination);media.src=url;media.preload='auto';
            media.onended=()=>{if(owner!==this.epoch)return;this.release();this.delay=this.random.integer(12000,24000);this.audio.record('music.game','ended');};
            media.onerror=()=>{if(owner!==this.epoch)return;this.audio.record('music.game','media-error');this.cancel();};
            await media.play();if(owner!==this.epoch||this.disposed)return;this.audio.record('music.game','scheduled',{sample:path,category:'musicVolume',stream:true,volume:gain.gain.value});
        }catch(error){if(owner===this.epoch&&!this.disposed){this.audio.record('music.game',error instanceof Error?error.message:'music-failed');this.release();this.delay=100;}}
        finally{if(owner===this.epoch)this.pending=false;}
    }
    /** Release streaming media and every associated node/object URL without clearing game progress. */
    release():void{if(this.media){this.media.onended=this.media.onerror=null;this.media.pause();this.media.removeAttribute('src');this.media.load();}this.node?.disconnect();this.gain?.disconnect();if(this.url)URL.revokeObjectURL(this.url);this.track=null;this.media=null;this.node=null;this.gain=null;this.url=null;}
    /** Invalidate pending loads and wait the native initial interval before another visible playback. */
    cancel():void{this.epoch++;this.pending=false;this.release();this.delay=100;this.last=0;this.remainder=0;}
    /** Stop music and remove the visibility listener permanently. */
    dispose():void{this.disposed=true;this.cancel();this.abort.abort();}
}
