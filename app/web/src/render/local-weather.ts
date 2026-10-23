/** Opt-in browser geolocation and transient real-weather observations never enter the save or load automatically. */
export interface LocalObservation {rain:number;thunder:number;snow:boolean;code:number;received:number}
/** Interpret provider WMO codes as native precipitation states, leaving world generation and blocks untouched.
 * @param {number} code Documented WMO weather code.
 * @return {object} Native rain/thunder intensity and precipitation type.
 */
export function wmoWeather(code:number){const snow=[71,73,75,77,85,86].includes(code),thunder=[95,96,99].includes(code);return{rain:snow||thunder||[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)?1:0,thunder:thunder?1:0,snow};}

/** Own only one page's explicitly requested location, fetch cancellation and observation refresh. */
export class LocalWeather {
    observation:LocalObservation|null=null;
    coordinates:[number,number]|null=null;
    controller:AbortController|null=null;
    epoch=0;timer:ReturnType<typeof setInterval>|null=null;disposed=false;
    /** Bind presentation callbacks without accessing browser location or the network.
     * @param {Function} update Fresh local observation or cleared projection.
     * @param {Function} status Localized status/error key.
     */
    constructor(public update:(value:LocalObservation|null)=>void,public status:(key:string)=>void){}
    /** Request native permission only from the user's weather-setting action. */
    request():void{
        if(this.disposed)return;
        this.stop();const ticket=++this.epoch;
        if(!navigator.geolocation){this.status('weather.locationUnavailable');return;}
        this.status('weather.locating');
        try{navigator.geolocation.getCurrentPosition(position=>{
            if(this.disposed||ticket!==this.epoch)return;
            this.coordinates=[Math.round(position.coords.latitude*100)/100,Math.round(position.coords.longitude*100)/100];
            void this.refresh(ticket);
            this.timer=setInterval(()=>{if(!document.hidden)void this.refresh(ticket);},900000);
        },()=>{if(!this.disposed&&ticket===this.epoch)this.status('weather.locationDenied');},{enableHighAccuracy:false,timeout:15000,maximumAge:0});}catch{if(!this.disposed&&ticket===this.epoch)this.status('weather.locationUnavailable');}
    }
    /** Query only rounded, page-memory coordinates and ignore any stale response.
     * @param {number} ticket Current explicit request identity.
     * @return {Promise<void>} Observation or visible fallback status.
     */
    async refresh(ticket:number):Promise<void>{
        if(this.disposed||ticket!==this.epoch||!this.coordinates)return;
        this.controller?.abort();const controller=this.controller=new AbortController();
        const url=new URL('https://api.open-meteo.com/v1/forecast');url.searchParams.set('latitude',String(this.coordinates[0]));url.searchParams.set('longitude',String(this.coordinates[1]));url.searchParams.set('current','weather_code');
        try{
            const r=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error('weather-http');const body=await r.json(),code=body.current?.weather_code;
            if(!Number.isInteger(code)||![0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(code))throw Error('weather-data');
            if(this.disposed||controller.signal.aborted||ticket!==this.epoch)return;
            this.observation={...wmoWeather(code),code,received:Date.now()};this.update(this.observation);this.status('weather.localReady');
        }catch{if(this.disposed||controller.signal.aborted||ticket!==this.epoch)return;this.observation=null;this.update(null);this.status('weather.fetchFailed');}
    }
    /** Cancel requests and forget location without changing durable game progress or preferences. */
    stop():void{this.epoch++;this.controller?.abort();this.controller=null;if(this.timer!==null)clearInterval(this.timer);this.timer=null;this.coordinates=null;this.observation=null;this.update(null);}
    /** Release all page-owned observations and callbacks. */
    dispose():void{this.disposed=true;this.stop();}
}
