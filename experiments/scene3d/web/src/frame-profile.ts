/** Owned CPU phase timing, asynchronous GPU queries and long-task evidence for the P2 handoff. */
export interface CpuPhases {simulation:number;filter:number;sort:number;vertices:number;audioFrame:number;audioSchedule:number;submit:number;dom:number;serialize:number}
/** Create a fresh set of measured phase durations in milliseconds.
 * @return {CpuPhases} Zeroed timings, not estimated execution costs.
 */
export function emptyPhases():CpuPhases{return {simulation:0,filter:0,sort:0,vertices:0,audioFrame:0,audioSchedule:0,submit:0,dom:0,serialize:0};}
/** Keep a bounded GPU query queue and real browser long-task observations; never block on the GPU. */
export class FrameProfile {
  phases=emptyPhases();previousWork=0;frameStart=0;rafLag=0;gpuMs:number|null=null;gpuSamples:{frame:number;ms:number}[]=[];
  gl:WebGL2RenderingContext;extension:any;pending:{query:WebGLQuery;frame:number}[]=[];active:WebGLQuery|null=null;count=0;observer:PerformanceObserver|null=null;longTasks:object[]=[];
  /** Observe only supported browser evidence types and the actual WebGL2 timer extension.
   * @param {WebGL2RenderingContext} gl Existing renderer context.
   */
  constructor(gl:WebGL2RenderingContext){this.gl=gl;this.extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){this.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())this.longTasks.push({start:e.startTime,duration:e.duration,name:e.name});if(this.longTasks.length>300)this.longTasks.splice(0,this.longTasks.length-300);});this.observer.observe({type:'longtask',buffered:true});}}
  /** Start a measured application callback and poll finished GPU queries without forcing completion.
   * @param {number} rafTime Browser RAF timestamp.
   */
  begin(rafTime:number):void{this.phases=emptyPhases();this.frameStart=performance.now();this.rafLag=this.frameStart-rafTime;this.gpuMs=null;const gl=this.gl;if(this.extension&&!gl.isContextLost())for(let i=this.pending.length-1;i>=0;i--){const p=this.pending[i];if(gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(this.extension.GPU_DISJOINT_EXT)){const ms=Number(gl.getQueryParameter(p.query,gl.QUERY_RESULT))/1e6;this.gpuMs=ms;this.gpuSamples.push({frame:p.frame,ms});if(this.gpuSamples.length>1000)this.gpuSamples.shift();}gl.deleteQuery(p.query);this.pending.splice(i,1);}}}
  /** Begin one sparse asynchronous GPU sample around actual renderer submission. */
  beforeSubmit():void{this.count++;if(!this.extension||this.pending.length>=6||this.count%30!==0||this.gl.isContextLost())return;const q=this.gl.createQuery();if(q){this.active=q;this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT,q);}}
  /** Close a sampled GPU query; returned CPU submit time remains a separate metric. */
  afterSubmit():void{if(this.active){this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.pending.push({query:this.active,frame:this.count});this.active=null;}}
  /** Discard invalid query handles after an actual context loss. */
  lost():void{this.pending=[];this.active=null;}
  /** Reacquire the extension after the browser restores the same canvas context. */
  restored():void{this.extension=this.gl.getExtension('EXT_disjoint_timer_query_webgl2');}
  /** Release observers and outstanding query objects owned by this renderer. */
  dispose():void{this.observer?.disconnect();if(!this.gl.isContextLost())for(const p of this.pending)this.gl.deleteQuery(p.query);this.pending=[];}
}
