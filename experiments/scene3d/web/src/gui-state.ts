/** Disposable finite-slot candidates for browser input research; no product inventory or recipe economy. */
export type GuiKind='inventory'|'crafting_table'|'furnace'|'blast_furnace'|'hopper';
export type Stack={item:'egg'|'furnace';count:number}|null;
export interface GuiSlot {id:string;x:number;y:number;group:'grid'|'result'|'inventory'|'hotbar'|'equipment'|'fuel'}
/** Sample capacities are experiment parameters, not an approved D04 contract or a full item registry. */
export const CAP={egg:16,furnace:64};

/** Describe menu coordinates located in the same-version menu bytecode; icon origins are 16px squares.
 * @param {GuiKind} kind Menu sample.
 * @return {GuiSlot[]} Stable sample slots; no recipe or equipment implementation.
 */
export function guiSlots(kind:GuiKind):GuiSlot[] {
  const slots:GuiSlot[]=[];
  if(kind==='inventory'||kind==='crafting_table') {
    const n=kind==='inventory'?2:3,x=kind==='inventory'?98:30,y=kind==='inventory'?18:17;
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)slots.push({id:`grid-${r*n+c}`,x:x+c*18,y:y+r*18,group:'grid'});
    slots.push({id:'result',x:kind==='inventory'?154:124,y:kind==='inventory'?28:35,group:'result'});
    if(kind==='inventory'){
      for(let i=0;i<4;i++)slots.push({id:`armor-${i}`,x:8,y:8+i*18,group:'equipment'});
      slots.push({id:'offhand',x:77,y:62,group:'equipment'});
    }
  } else if(kind==='hopper')for(let i=0;i<5;i++)slots.push({id:`grid-${i}`,x:44+i*18,y:20,group:'grid'});
  else slots.push({id:'input',x:56,y:17,group:'grid'},{id:'fuel',x:56,y:53,group:'fuel'},{id:'result',x:116,y:35,group:'result'});
  const y=kind==='hopper'?51:84;
  for(let r=0;r<3;r++)for(let c=0;c<9;c++)slots.push({id:`inv-${r*9+c}`,x:8+c*18,y:y+r*18,group:'inventory'});
  for(let c=0;c<9;c++)slots.push({id:`hot-${c}`,x:8+c*18,y:y+58,group:'hotbar'});
  return slots;
}

/** Own temporary groups separately from permanent unlock identities and scene instances. */
export class SlotExperiment {
  slots:GuiSlot[]; groups:Record<string,Stack>={}; cursor:Stack=null;
  readonly unlocked=['egg','furnace'];
  /** Create a deterministic research fixture; reopening explicitly resets this fixture.
   * @param {GuiKind} kind Screen sample kind.
   */
  constructor(kind:GuiKind){this.slots=guiSlots(kind);this.groups['inv-0']={item:'egg',count:9};this.groups['inv-1']={item:'furnace',count:12};}
  /** Reject unimplemented result/equipment and fuel semantics rather than inventing production rules.
   * @param {string} id Candidate slot.
   * @return {boolean} Whether the temporary input sample accepts a stack.
   */
  accepts(id:string):boolean {return this.slots.some(s=>s.id===id&&!['result','equipment','fuel'].includes(s.group));}
  /** Apply one finite pick/place, split, clone or bounded research Shift transfer.
   * @param {string} id Source/destination slot.
   * @param {number} button DOM mouse button.
   * @param {boolean} shift Research transfer modifier, without workstation routing claims.
   */
  click(id:string,button:number,shift=false):void {
    if(!this.accepts(id))return;const stack=this.groups[id]??null;
    if(shift&&stack){
      const source=this.slots.find(s=>s.id===id)!.group;
      for(const target of this.slots.filter(s=>source==='hotbar'?s.group==='inventory':s.group==='hotbar')){
        const existing=this.groups[target.id];if(existing&&existing.item!==stack.item)continue;
        const n=Math.min(stack.count,CAP[stack.item]-(existing?.count??0));if(n<=0)continue;
        this.groups[target.id]={item:stack.item,count:(existing?.count??0)+n};stack.count-=n;if(!stack.count)break;
      }this.groups[id]=stack.count?stack:null;return;
    }
    if(button===1){if(!this.cursor&&stack)this.cursor={item:stack.item,count:CAP[stack.item]};return;}
    if(!this.cursor){if(stack){const n=button===2?Math.ceil(stack.count/2):stack.count;this.cursor={item:stack.item,count:n};this.groups[id]=stack.count===n?null:{item:stack.item,count:stack.count-n};}return;}
    if(!stack||stack.item===this.cursor.item){const n=Math.min(button===2?1:this.cursor.count,CAP[this.cursor.item]-(stack?.count??0));this.groups[id]={item:this.cursor.item,count:(stack?.count??0)+n};this.cursor.count-=n;if(!this.cursor.count)this.cursor=null;}
    else if(button===0){this.groups[id]=this.cursor;this.cursor=stack;}
  }
  /** Distribute a finite cursor snapshot once per distinct legal slot; never refill from unlocks.
   * @param {string[]} ids Visited slots.
   * @param {number} button Left evenly distributes, right places one per slot.
   */
  drag(ids:string[],button:number):void {
    if(!this.cursor||![0,2].includes(button))return;
    const stack=this.cursor, targets=[...new Set(ids)].filter(id=>this.accepts(id)&&(!this.groups[id]||this.groups[id]!.item===stack.item));
    const share=button===2?1:Math.floor(stack.count/Math.max(1,targets.length));
    for(const id of targets){const before=this.groups[id]?.count??0,n=Math.min(share,CAP[stack.item]-before,stack.count);if(n>0){this.groups[id]={item:stack.item,count:before+n};stack.count-=n;}}
    if(!stack.count)this.cursor=null;
  }
  /** Swap a hovered finite slot with a hotbar slot; result/equipment behavior is excluded.
   * @param {string} id Hovered sample slot.
   * @param {number} index Hotbar index 0–8.
   */
  swap(id:string,index:number):void {if(!this.accepts(id)||index<0||index>8)return;const target=`hot-${index}`,before=this.groups[id]??null;this.groups[id]=this.groups[target]??null;this.groups[target]=before;}
  /** Collect matching finite groups only; the permanent directory is never scanned.
   * @param {string} id Hovered sample slot used when the cursor is empty.
   */
  collect(id:string):void {if(!this.cursor)this.click(id,0);if(!this.cursor)return;for(const slot of this.slots){const s=this.groups[slot.id];if(!s||s.item!==this.cursor.item||!this.accepts(slot.id))continue;const n=Math.min(s.count,CAP[s.item]-this.cursor.count);this.cursor.count+=n;s.count-=n;if(!s.count)this.groups[slot.id]=null;}}
}
