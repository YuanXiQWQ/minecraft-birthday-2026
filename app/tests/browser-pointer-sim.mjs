/** Browser tests simulate pointer ownership without invoking Windows or native browser mouse capture. */

/** Install before navigation so game startup and every later UI return use simulation only.
 * @param {import('playwright').BrowserContext|import('playwright').Page} target Test page or independent context.
 * @param {boolean} nativeEscapeRestrictions Whether simulated native Escape enforces Chromium cooldown and real DOM activation.
 * @return {Promise<void>} Pre-navigation installation; this never calls the native Pointer Lock APIs.
 */
export async function installPointerSimulation(target,nativeEscapeRestrictions=false){
    await target.addInitScript(restricted=>{
        let owner=null,lastEscape=-Infinity,releasedByTarget=true;
        Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>owner});
        Element.prototype.requestPointerLock=function(){
            if(restricted&&!releasedByTarget&&(performance.now()-lastEscape<1250||!navigator.userActivation.isActive))return Promise.reject(new DOMException('Simulated native Escape restriction','NotAllowedError'));
            owner=this;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));return Promise.resolve();
        };
        document.exitPointerLock=()=>{if(owner)releasedByTarget=true;owner=null;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));};
        window.__pointerSimulationEscape=()=>{releasedByTarget=false;lastEscape=performance.now();owner=null;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));};
        window.__pointerSimulation=true;
    },nativeEscapeRestrictions);
}
