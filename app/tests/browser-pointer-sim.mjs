/** Browser tests simulate pointer ownership without invoking Windows or native browser mouse capture. */

/** Install before navigation so game startup and every later UI return use simulation only.
 * @param {import('playwright').BrowserContext|import('playwright').Page} target Test page or independent context.
 * @return {Promise<void>} Pre-navigation installation; this never calls the native Pointer Lock APIs.
 */
export async function installPointerSimulation(target){
    await target.addInitScript(()=>{
        let owner=null;
        Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>owner});
        Element.prototype.requestPointerLock=function(){owner=this;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));return Promise.resolve();};
        document.exitPointerLock=()=>{owner=null;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));};
        window.__pointerSimulation=true;
    });
}
