/** Summarize unchanged raw P2 frame records without silently removing long frames or warm-up evidence. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
/** Compute actual numeric distributions and the explicitly requested strict thresholds.
 * @param {number[]} values Millisecond samples.
 * @return {object} Distribution and threshold counts.
 */
function stats(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return {n:v.length,mean:v.reduce((n,x)=>n+x,0)/v.length,p50:v[Math.floor((v.length-1)*.5)],p95:v[Math.floor((v.length-1)*.95)],p99:v[Math.floor((v.length-1)*.99)],max:v.at(-1),over16_7:v.filter(x=>x>16.7).length,over33_3:v.filter(x=>x>33.3).length,over50:v.filter(x=>x>50).length};}
/** Summarize a recorded series, keeping warm-up exclusion explicit and every long frame attributable by index.
 * @param {string} directory Folder containing the series summary and one JSON per run.
 * @return {object} Numerical analysis; no unsupported GC or automation causality is inferred.
 */
function summarize(directory){const meta=JSON.parse(readFileSync(join(directory,'summary.json'))),all=Array.from({length:meta.runs},(_,i)=>JSON.parse(readFileSync(join(directory,`run-${i}.json`))));const runs=all.slice(meta.warmups),frames=runs.flatMap(r=>r.frames);const phases=Object.fromEntries(Object.keys(frames[0].cpu).map(k=>[k,stats(frames.map(f=>f.cpu[k]))]));
 return {protocol:meta,warmupSeconds:all.slice(0,meta.warmups).reduce((n,r)=>n+r.summary.elapsed,0),measuredSeconds:runs.reduce((n,r)=>n+r.summary.elapsed,0),environment:runs[0].environment,frameIntervals:stats(frames.map(f=>f.frameMs)),phases,scheduling:stats(runs.map(r=>r.schedulingMs)),gpu:stats(frames.flatMap(f=>f.gpuMs===null?[]:[f.gpuMs])),peakParticles:Math.max(...frames.map(f=>f.particles)),peakVisible:Math.max(...frames.map(f=>f.visible)),peakCalls:Math.max(...frames.map(f=>f.calls)),runs:runs.map(r=>r.summary),longFrames:runs.flatMap((r,run)=>r.frames.flatMap((f,index)=>f.frameMs>33.3?[{run,index,...f,precedingCpu:r.frames[index-1]?.cpu??null}]:[])),attribution:'Measured application phase durations and preceding callback work are evidence; browser/automation/GC causes remain unproven without their own trace'};
}
const directory=resolve(process.argv[2]),result=summarize(directory);writeFileSync(join(directory,'analysis.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({frames:result.frameIntervals,phases:result.phases,gpu:result.gpu,longFrames:result.longFrames.length,seconds:result.measuredSeconds}));
