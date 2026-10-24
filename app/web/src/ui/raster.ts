/** Shared physical-pixel sizing and placement for bitmap GUI surfaces. */

/** Round a measured framebuffer size without promoting floating-point noise to an extra pixel.
 * @param {number} logical Logical dimension.
 * @param {number} density Physical pixels per logical pixel.
 * @return {number} Positive integer framebuffer dimension.
 */
export function rasterSize(logical:number,density:number):number{return Math.max(1,Math.round(logical*density));}

/** Fit bitmap sizing and significant origin offsets while retaining native snapping within layout precision.
 * Offsets within one eighth of a physical pixel retain the browser's own raster phase.
 * @param {HTMLCanvasElement} canvas Connected GUI surface; detached intermediate canvases need no placement.
 * @param {boolean} fit Whether an already physical-resolution framebuffer should have a one-to-one display size.
 */
export function alignRaster(canvas:HTMLCanvasElement,fit=false):void {
    if(!canvas.isConnected)return;
    canvas.style.imageRendering='crisp-edges';
    canvas.style.translate='none';
    const rect=canvas.getBoundingClientRect(),style=getComputedStyle(canvas),width=parseFloat(style.width),height=parseFloat(style.height),dpr=globalThis.devicePixelRatio??1;
    if(!rect.width||!rect.height||!width||!height)return;
    if(fit){
        const dx=canvas.width-rect.width*dpr,dy=canvas.height-rect.height*dpr;
        if(Math.abs(dx)>.01&&Math.abs(dx)<1.01)canvas.style.width=canvas.width/(dpr*rect.width/width)+'px';
        if(Math.abs(dy)>.01&&Math.abs(dy)<1.01)canvas.style.height=canvas.height/(dpr*rect.height/height)+'px';
    }
    const positioned=canvas.getBoundingClientRect(),dx=Math.round(positioned.left*dpr)-positioned.left*dpr,dy=Math.round(positioned.top*dpr)-positioned.top*dpr,
        x=Math.abs(dx)<=.125001?0:dx/dpr/(rect.width/width),y=Math.abs(dy)<=.125001?0:dy/dpr/(rect.height/height);
    if(x||y)canvas.style.translate=x+'px '+y+'px';
}
