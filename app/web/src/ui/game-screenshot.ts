/** Export a completed WebGL frame with the application's visible bitmap GUI through browser downloads. */

/** Generate a filesystem-safe native-style timestamp with milliseconds for repeated captures.
 * @param {Date} date Capture time.
 * @return {string} PNG download filename.
 */
export function screenshotName(date=new Date()):string{
    /** Pad a timestamp component. @param {number} n Value. @param {number} width Digit count. @return {string} Padded digits. */
    const pad=(n:number,width=2):string=>String(n).padStart(width,'0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}.${pad(date.getMilliseconds(),3)}.png`;
}
/** Read visible stacking/opacity state while excluding closed dialogs and offscreen controls.
 * @param {HTMLElement} element Candidate raster or background owner.
 * @param {HTMLElement} root Application root.
 * @return {{opacity:number;layer:number}|null} Effective paint state.
 */
function paintState(element:HTMLElement,root:HTMLElement):{opacity:number;layer:number}|null{
    let opacity=1,layer=0;
    for(let p:HTMLElement|null=element;p;p=p.parentElement){const s=getComputedStyle(p);if(p.hidden||s.display==='none'||s.visibility==='hidden'||p instanceof HTMLDialogElement&&!p.open)return null;opacity*=Number(s.opacity);layer+=Number.parseInt(s.zIndex)||0;if(p instanceof HTMLDialogElement&&p.matches(':modal'))layer+=10000;if(p===root)break;}
    return opacity>0?{opacity,layer}:null;
}
/** Composite already-rendered pixels synchronously, before WebGL discards its drawing buffer.
 * @param {HTMLElement} root Application UI owner.
 * @param {HTMLCanvasElement} world Just-rendered world framebuffer.
 * @return {HTMLCanvasElement} Owned screenshot pixels including visible GUI layers.
 */
export function captureGame(root:HTMLElement,world:HTMLCanvasElement):HTMLCanvasElement{
    const bounds=world.getBoundingClientRect(),output=document.createElement('canvas');output.width=world.width;output.height=world.height;
    if(!bounds.width||!bounds.height||!output.width||!output.height)throw Error('screenshot-empty');
    const ctx=output.getContext('2d')!;ctx.drawImage(world,0,0);ctx.scale(output.width/bounds.width,output.height/bounds.height);ctx.imageSmoothingEnabled=false;
    const layers=[...root.querySelectorAll<HTMLElement>('*')].filter(e=>e!==world&&!e.contains(world)).map((element,index)=>({element,index,state:paintState(element,root)})).filter(e=>e.state).sort((a,b)=>a.state!.layer-b.state!.layer||a.index-b.index);
    for(const {element,state} of layers){const r=element.getBoundingClientRect();if(!r.width||!r.height||r.right<=bounds.left||r.left>=bounds.right||r.bottom<=bounds.top||r.top>=bounds.bottom)continue;
        const style=getComputedStyle(element),x=r.left-bounds.left,y=r.top-bounds.top;ctx.save();ctx.globalAlpha=state!.opacity;
        for(let p=element.parentElement;p&&p!==root;p=p.parentElement){const s=getComputedStyle(p);if(['hidden','clip','scroll','auto'].includes(s.overflowX)||['hidden','clip','scroll','auto'].includes(s.overflowY)){const b=p.getBoundingClientRect();ctx.beginPath();ctx.rect(b.left-bounds.left,b.top-bounds.top,b.width,b.height);ctx.clip();}}
        if(element instanceof HTMLCanvasElement){if(element.width&&element.height)ctx.drawImage(element,x,y,r.width,r.height);}
        else{
            if(element.classList.contains('world-navigation')){
                const pseudo=getComputedStyle(element,'::before'),transform=new DOMMatrix(pseudo.transform==='none'?undefined:pseudo.transform);
                ctx.save();ctx.translate(x+transform.e,y+transform.f);ctx.scale(r.width/1000,r.height/120);
                const gradient=ctx.createLinearGradient(0,0,0,120);gradient.addColorStop(0,'#262423');gradient.addColorStop(1,'#171615');ctx.fillStyle=gradient;
                ctx.fill(new Path2D('M18 0H982Q1000 0 994 18L966 102Q962 120 944 120H56Q38 120 34 102L6 18Q0 0 18 0Z'));ctx.restore();
            }
            ctx.beginPath();ctx.roundRect(x,y,r.width,r.height,[style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomRightRadius,style.borderBottomLeftRadius].map(v=>Math.min(Number.parseFloat(v)||0,r.width/2,r.height/2)));
            if(style.backgroundColor!=='rgba(0, 0, 0, 0)'){ctx.fillStyle=style.backgroundColor;ctx.fill();}
            const colors=style.backgroundImage.startsWith('linear-gradient')?style.backgroundImage.match(/rgba?\([^)]+\)/g):null;
            if(colors&&colors.length>=2){const gradient=ctx.createLinearGradient(0,y,0,y+r.height);colors.forEach((color,i)=>gradient.addColorStop(i/(colors.length-1),color));ctx.fillStyle=gradient;ctx.fill();}
            const border=Number.parseFloat(style.borderTopWidth);if(border&&style.borderTopStyle!=='none'){ctx.lineWidth=border;ctx.strokeStyle=style.borderTopColor;ctx.stroke();}
        }
        ctx.restore();
    }
    return output;
}
/** Encode an owned frame and trigger the browser's normal PNG download behavior.
 * @param {HTMLCanvasElement} canvas Completed screenshot pixels.
 * @return {Promise<string>} Requested download filename.
 */
export async function downloadScreenshot(canvas:HTMLCanvasElement):Promise<string>{
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('screenshot-encode')),'image/png'));
    const url=URL.createObjectURL(blob),link=document.createElement('a'),name=screenshotName();link.href=url;link.download=name;link.hidden=true;document.body.append(link);
    try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
    return name;
}
