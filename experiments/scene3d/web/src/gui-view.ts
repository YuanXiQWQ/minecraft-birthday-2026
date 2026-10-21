/** Screen-plane original GUI renderer and browser-event research; all temporary state is disposable. */
import { drawSprite } from './gui-pack.ts';
import type { GuiPack, Scaling } from './gui-pack.ts';
import { SlotExperiment } from './gui-state.ts';
import type { GuiKind } from './gui-state.ts';
import { GUI_TEXT as G } from './gui-labels.ts';

export interface InputRecord {type:string;trusted:boolean;button?:number;buttons?:number;key?:string;code?:string;shift?:boolean;ctrl?:boolean;detail?:number;slot?:string|null;cancel?:string}
/** Keep one modal binding separate from layout storage, camera controls and official product semantics. */
export class GuiView {
  canvas=document.createElement('canvas'); controls=document.createElement('div'); report=document.createElement('pre');
  unavailable=document.createElement('p'); input=document.createElement('input'); scaleSelect=document.createElement('select');
  pack:GuiPack|null=null; kind:GuiKind='inventory'; activeId:string|null=null; state=new SlotExperiment('inventory');
  records:InputRecord[]=[]; checks:object|null=null; hover:string|null=null; pointer=[0,0]; open=false; scale=3;
  frame={x:0,y:0,width:176,height:166,physicalScale:3,dpr:1,logicalWidth:480,logicalHeight:300,usableCssHeight:900};
  gesture:{id:number;button:number;start:string|null;visited:string[];shift:boolean}|null=null;
  onClose:()=>void; onChange:()=>void;
  /** Mount a fixed screen layer, explicit research controls and bounded metadata-only evidence.
   * @param {HTMLElement} overlay Existing modal input boundary.
   * @param {Function} onClose Close command from E/Esc/button.
   * @param {Function} onChange Diagnostic refresh callback.
   */
  constructor(overlay:HTMLElement,onClose:()=>void,onChange:()=>void){
    this.onClose=onClose;this.onChange=onChange;this.canvas.id='gui-canvas';this.canvas.setAttribute('aria-label',G.canvas);this.canvas.tabIndex=0;
    this.controls.className='gui-controls';this.report.id='gui-evidence';this.report.hidden=true;
    this.unavailable.className='gui-unavailable';this.unavailable.textContent=G.unavailable;
    const note=document.createElement('span');note.textContent=G.title;this.controls.append(note);
    const disclaimer=document.createElement('span');disclaimer.textContent=G.disclaimer;this.controls.append(disclaimer);
    this.input.type='text';this.input.placeholder=G.focus;this.input.setAttribute('aria-label',G.focus);
    this.scaleSelect.setAttribute('aria-label',G.scale);for(const n of [2,3,4]){const option=document.createElement('option');option.value=String(n);option.textContent=`${G.scale} ${n}`;this.scaleSelect.append(option);}this.scaleSelect.value='3';
    this.scaleSelect.addEventListener('change',()=>{this.scale=Number(this.scaleSelect.value);this.cancel('scale');this.draw();});
    for(const [label,action] of [[G.reset,()=>{this.cancel('fixture-reset');this.state=new SlotExperiment(this.kind);this.draw();}], [G.replay,()=>this.syntheticRightDrag()], [G.close,onClose]] as [string,()=>void][]){const b=document.createElement('button');b.textContent=label;b.type='button';b.addEventListener('click',action);this.controls.append(b);}
    this.controls.append(this.scaleSelect,this.input);overlay.append(this.canvas,this.unavailable,this.controls,this.report);
    this.canvas.addEventListener('pointerdown',event=>{
      event.preventDefault();this.canvas.focus();const slot=this.hit(event);this.record(event,slot);
      if(this.gesture||![0,1,2].includes(event.button))return;
      this.gesture={id:event.pointerId,button:event.button,start:slot,visited:slot?[slot]:[],shift:event.shiftKey};
      if(event.isTrusted)this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove',event=>{
      const slot=this.hit(event);this.hover=slot;
      if(this.gesture&&this.gesture.id===event.pointerId){if(slot&&!this.gesture.visited.includes(slot))this.gesture.visited.push(slot);this.record(event,slot);}
      this.draw();
    });
    this.canvas.addEventListener('pointerup',event=>{
      const slot=this.hit(event);this.record(event,slot);const g=this.gesture;this.gesture=null;
      if(g?.id===event.pointerId&&g.button===event.button){if(this.state.cursor&&g.visited.length>1)this.state.drag(g.visited,g.button);else if(g.start&&slot===g.start)this.state.click(slot,event.button,g.shift);}
      this.draw();
    });
    this.canvas.addEventListener('pointercancel',()=>this.cancel('pointercancel'));
    this.canvas.addEventListener('lostpointercapture',()=>{if(this.gesture)this.cancel('lostpointercapture');});
    this.canvas.addEventListener('dblclick',event=>{const slot=this.hit(event);this.record(event,slot);if(slot&&!event.shiftKey)this.state.collect(slot);this.draw();});
    this.canvas.addEventListener('contextmenu',event=>{event.preventDefault();this.record(event,this.hover);});
    overlay.addEventListener('wheel',event=>{if(this.open){event.preventDefault();this.record(event,this.hover);}},{passive:false});
    this.input.addEventListener('input',()=>this.publish());
    window.addEventListener('resize',()=>{if(this.open){this.cancel('resize');this.draw();}});
    window.addEventListener('blur',()=>{if(this.open)this.cancel('blur');});
  }
  /** Bind a new ephemeral screen session to a live instance or the player inventory.
   * @param {GuiKind} kind Menu type.
   * @param {string} id Live scene instance or player sentinel.
   */
  show(kind:GuiKind,id:string):void {this.kind=kind;this.activeId=id;this.open=true;this.state=new SlotExperiment(kind);this.hover=null;this.input.value='';this.cancel('open');this.draw();this.canvas.focus();}
  /** Invalidate the binding and unfinished gestures; this sample does not define product close/drop semantics. */
  close():void {this.cancel('close');this.open=false;this.activeId=null;this.hover=null;this.publish();}
  /** Cancel gestures without distributing a held cursor or touching permanent unlocks.
   * @param {string} reason Diagnostic cancellation source.
   */
  cancel(reason:string):void {const id=this.gesture?.id;this.gesture=null;if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.records.push({type:'cancel',trusted:false,cancel:reason});this.publish();}
  /** Consume modal keyboard events; editable diagnostic focus bypasses inventory shortcuts.
   * @param {KeyboardEvent} event Browser key event.
   * @return {boolean} Whether the GUI owns this event.
   */
  key(event:KeyboardEvent):boolean {
    if(!this.open)return false;this.record(event,this.hover);event.stopPropagation();
    const editable=event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement;
    if(event.key==='Escape'){event.preventDefault();if(event.type==='keydown')this.onClose();return true;}
    if(editable)return true;
    event.preventDefault();if(event.type==='keydown'&&!event.repeat){if(event.code==='KeyE')this.onClose();else if(/^Digit[1-9]$/.test(event.code)&&this.hover)this.state.swap(this.hover,Number(event.code.slice(-1))-1);}
    this.draw();return true;
  }
  /** Convert pointer coordinates through the real canvas/DPR/integer GUI scale.
   * @param {MouseEvent} event Browser pointer or double click.
   * @return {string|null} Hovered logical slot.
   */
  hit(event:MouseEvent):string|null {
    const r=this.canvas.getBoundingClientRect(), f=this.frame;this.pointer=[(event.clientX-r.left)*f.dpr/f.physicalScale,(event.clientY-r.top)*f.dpr/f.physicalScale];
    return this.state.slots.find(s=>this.pointer[0]>=f.x+s.x&&this.pointer[0]<f.x+s.x+16&&this.pointer[1]>=f.y+s.y&&this.pointer[1]<f.y+s.y+16)?.id??null;
  }
  /** Record actual event trust, order and modifiers, excluding typed text values.
   * @param {Event} event Browser event.
   * @param {string|null} slot Logical target.
   */
  record(event:Event,slot:string|null):void {
    const m=event as MouseEvent,k=event as KeyboardEvent;
    this.records.push({type:event.type,trusted:event.isTrusted,button:m.button,buttons:m.buttons,key:k.key,code:k.code,shift:m.shiftKey,ctrl:m.ctrlKey,detail:m.detail,slot});this.publish();
  }
  /** Publish read-only diagnostics and physical slot centers for real browser interaction tests. */
  publish():void {
    this.records=this.records.slice(-160);
    const f=this.frame,r=this.canvas.getBoundingClientRect(),factor=f.physicalScale/f.dpr;
    this.report.textContent=JSON.stringify({status:this.pack?'vanilla-26.3':'BLOCKED:no-vanilla-26.3',kind:this.kind,activeId:this.activeId,open:this.open,candidateOnly:true,
      frame:f,css:{width:r.width,height:r.height},slots:this.state.slots.map(s=>({...s,cx:r.left+(f.x+s.x+8)*factor,cy:r.top+(f.y+s.y+8)*factor})),
      groups:this.state.groups,cursor:this.state.cursor,unlocked:this.state.unlocked,gesture:this.gesture,hover:this.hover,textFocused:document.activeElement===this.input,
      records:this.records,checks:this.checks,loading:this.pack?.loading},null,2);this.onChange();
  }
  /** Draw an original GUI sprite with its supplied scaling metadata.
   * @param {CanvasRenderingContext2D} ctx Target.
   * @param {string} name Sprite resource path without extension.
   * @param {number} x Logical left.
   * @param {number} y Logical top.
   * @param {number} w Logical width.
   * @param {number} h Logical height.
   */
  sprite(ctx:CanvasRenderingContext2D,name:string,x:number,y:number,w:number,h:number):void {
    const path=`assets/minecraft/textures/gui/sprites/${name}.png`,image=this.pack!.images.get(path);if(!image)throw new Error('missing-gui-sprite');
    const metadata=this.pack!.documents.get(path+'.mcmeta') as {gui?:{scaling?:Scaling}}|undefined;drawSprite(ctx,image,metadata?.gui?.scaling,x,y,w,h);
  }
  /** Paint the actual container crop, original icons/font, hover and metadata-scaled Tooltip in screen coordinates. */
  draw():void {
    if(!this.open)return;const width=this.canvas.clientWidth,height=this.canvas.clientHeight,dpr=window.devicePixelRatio;
    const usableCssHeight=Math.max(1,this.controls.getBoundingClientRect().top-this.canvas.getBoundingClientRect().top-12);
    const maxScale=Math.max(1,Math.min(Math.floor(width*dpr/192),Math.floor(usableCssHeight*dpr/((this.kind==='hopper'?133:166)+30)))),physicalScale=Math.min(maxScale,Math.max(1,Math.round(this.scale*dpr)));
    this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);
    const ctx=this.canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;ctx.setTransform(physicalScale,0,0,physicalScale,0,0);
    const lw=this.canvas.width/physicalScale,lh=this.canvas.height/physicalScale,h=this.kind==='hopper'?133:166;
    this.frame={x:Math.floor((lw-176)/2),y:Math.max(0,Math.floor((usableCssHeight*dpr/physicalScale-h-30)/2)),width:176,height:h,physicalScale,dpr,logicalWidth:lw,logicalHeight:lh,usableCssHeight};
    this.unavailable.hidden=Boolean(this.pack);if(!this.pack){this.publish();return;}
    const p=this.pack,f=this.frame,x=f.x,y=f.y,background=p.images.get(`assets/minecraft/textures/gui/container/${this.kind}.png`);if(!background)throw new Error('missing-container');
    ctx.drawImage(background,0,0,176,h,x,y,176,h);
    if(this.kind==='inventory')p.font.draw(ctx,G.menus[this.kind],x+97,y+8,'#404040');
    else if(this.kind==='crafting_table')p.font.draw(ctx,G.menus[this.kind],x+28,y+6,'#404040');
    else p.font.draw(ctx,G.menus[this.kind],x+Math.floor((176-p.font.width(G.menus[this.kind]))/2),y+6,'#404040');
    if(this.kind!=='inventory')p.font.draw(ctx,G.inventoryLabel,x+8,y+(this.kind==='hopper'?39:72),'#404040');
    for(const slot of this.state.slots){
      if(slot.id===this.hover)this.sprite(ctx,'container/slot_highlight_back',x+slot.x-4,y+slot.y-4,24,24);
      const stack=this.state.groups[slot.id];if(stack){ctx.drawImage(p.icons.get(stack.item)!,x+slot.x,y+slot.y,16,16);if(stack.count>1){const text=String(stack.count);p.font.draw(ctx,text,x+slot.x+17-p.font.width(text),y+slot.y+9,'#ffffff',true);}}
      if(slot.id===this.hover)this.sprite(ctx,'container/slot_highlight_front',x+slot.x-4,y+slot.y-4,24,24);
    }
    if(this.kind==='furnace'||this.kind==='blast_furnace'){
      this.sprite(ctx,`container/${this.kind}/lit_progress`,x+56,y+36,14,14);
      const image=p.images.get(`assets/minecraft/textures/gui/sprites/container/${this.kind}/burn_progress.png`)!;
      ctx.drawImage(image,0,0,Math.floor(image.width/2),image.height,x+79,y+34,Math.floor(image.width/2),image.height);
    }
    const buttonHover=this.pointer[0]>=x+38&&this.pointer[0]<x+138&&this.pointer[1]>=y+h+5&&this.pointer[1]<y+h+25;
    this.sprite(ctx,buttonHover?'widget/button_highlighted':'widget/button',x+38,y+h+5,100,20);p.font.draw(ctx,G.button,x+Math.floor((176-p.font.width(G.button))/2),y+h+11,'#ffffff',true);
    const hovered=this.hover?this.state.groups[this.hover]:null;
    if(this.state.cursor){ctx.drawImage(p.icons.get(this.state.cursor.item)!,Math.floor(this.pointer[0])-8,Math.floor(this.pointer[1])-8,16,16);const text=String(this.state.cursor.count);p.font.draw(ctx,text,Math.floor(this.pointer[0])+9-p.font.width(text),Math.floor(this.pointer[1])+1,'#ffffff',true);}
    else if(hovered){const text=G.names[hovered.item],tw=p.font.width(text),th=8;
      let tx=Math.floor(this.pointer[0])+12,ty=Math.floor(this.pointer[1])-12;if(tx+tw+12>lw)tx=Math.floor(this.pointer[0])-tw-12;ty=Math.max(12,Math.min(ty,lh-th-12));
      for(const name of ['background','frame'])this.sprite(ctx,`tooltip/${name}`,tx-12,ty-12,tw+24,th+24);p.font.draw(ctx,text,tx,ty,'#ffffff',true);
    }
    this.publish();
  }
  /** Replay right-drag DOM events explicitly marked untrusted when native automation lacks right-button drag. */
  syntheticRightDrag():void {
    this.state=new SlotExperiment(this.kind);this.state.cursor={item:'egg',count:7};this.cancel('synthetic-replay');this.draw();
    const f=this.frame,r=this.canvas.getBoundingClientRect(),slots=this.state.slots.filter(s=>s.group==='inventory').slice(2,5);
    for(const [i,s] of slots.entries()){const event=new PointerEvent(i===0?'pointerdown':'pointermove',{bubbles:true,pointerId:701,button:i===0?2:-1,buttons:2,clientX:r.left+(f.x+s.x+8)*f.physicalScale/f.dpr,clientY:r.top+(f.y+s.y+8)*f.physicalScale/f.dpr});this.canvas.dispatchEvent(event);}
    const s=slots[2];this.canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:701,button:2,buttons:0,clientX:r.left+(f.x+s.x+8)*f.physicalScale/f.dpr,clientY:r.top+(f.y+s.y+8)*f.physicalScale/f.dpr}));
  }
  /** Check actual decoded resources and rendered pixel invariants without claiming Java screenshot parity.
   * @return {object} Browser raster checks or explicit unavailable status.
   */
  verify():object {
    if(!this.pack)return {status:'BLOCKED',passed:0,reason:G.unavailable};
    const p=this.pack, checks:{id:string;pass:boolean;detail:unknown}[]=[];
    for(const name of ['inventory','crafting_table','furnace','blast_furnace']){const image=p.images.get(`assets/minecraft/textures/gui/container/${name}.png`);checks.push({id:`Q01-${name}`,pass:image?.width===256&&image.height===256,detail:{width:image?.width,height:image?.height,crop:[176,166]}});}
    checks.push({id:'Q02-font',pass:p.font.width('iiii')<p.font.width('WWWW')&&p.font.width(' ' )===4,detail:{narrow:p.font.width('iiii'),wide:p.font.width('WWWW'),space:p.font.width(' ')}});
    for(const item of ['egg','furnace']){const image=p.icons.get(item)!,rgba=image.getContext('2d')!.getImageData(0,0,image.width,image.height).data,alpha=rgba.filter((_,i)=>i%4===3);checks.push({id:`Q03-${item}-alpha`,pass:alpha.some(v=>v===0)&&alpha.some(v=>v>0),detail:{width:image.width,height:image.height,transparent:alpha.filter(v=>v===0).length,visible:alpha.filter(v=>v>0).length}});}
    checks.push({id:'Q04-physical-pixel-scale',pass:Number.isInteger(this.frame.physicalScale),detail:this.frame});
    const base=p.images.get(`assets/minecraft/textures/gui/container/${this.kind}.png`)!,reference=p.images.get('assets/minecraft/textures/gui/sprites/container/slot.png')!;
    const canonical=reference.getContext('2d')!.getImageData(0,0,18,18).data;
    const patch=base.getContext('2d')!.getImageData(7,this.kind==='hopper'?50:83,18,18).data;
    const differing=canonical.filter((v,i)=>v!==patch[i]).length;
    checks.push({id:'Q05-embedded-slot-origin',pass:differing===0,detail:{origin:[8,this.kind==='hopper'?51:84],borderOrigin:[7,this.kind==='hopper'?50:83],rgbaDifferences:differing}});
    const slice=document.createElement('canvas');slice.width=220;slice.height=32;const context=slice.getContext('2d')!;context.imageSmoothingEnabled=false;
    this.sprite(context,'tooltip/frame',0,0,220,32);
    const original=p.images.get('assets/minecraft/textures/gui/sprites/tooltip/frame.png')!;
    const corner=original.getContext('2d')!.getImageData(0,0,10,10).data,rendered=context.getImageData(0,0,10,10).data;
    checks.push({id:'Q06-nine-slice-corner',pass:corner.every((v,i)=>v===rendered[i]),detail:{source:[100,100],target:[220,32],retainedCorner:[10,10]}});
    const snapshot=JSON.stringify(this.state.groups);this.gesture={id:999,button:0,start:'inv-0',visited:['inv-0','inv-2'],shift:false};this.cancel('synthetic-close-cancel-check');
    checks.push({id:'Q07-cancel-without-distribution',pass:this.gesture===null&&JSON.stringify(this.state.groups)===snapshot,detail:'untrusted unfinished-gesture cancellation; native held-drag+Esc still needs manual check'});
    const bottom=(this.frame.y+this.frame.height+25)*this.frame.physicalScale/this.frame.dpr;
    checks.push({id:'Q08-research-controls-separation',pass:bottom<=this.frame.usableCssHeight&&this.frame.x>=0&&(this.frame.x+176)*this.frame.physicalScale/this.frame.dpr<=this.canvas.clientWidth&&this.canvas.getContext('2d')!.imageSmoothingEnabled===false,
      detail:{guiAndSpriteBottom:bottom,usableCssHeight:this.frame.usableCssHeight,smoothing:false}});
    this.checks={status:checks.every(c=>c.pass)?'PASS':'FAIL',passed:checks.filter(c=>c.pass).length,checks,scope:'browser resource/raster evidence, not Java client parity'};this.publish();return this.checks;
  }
}
