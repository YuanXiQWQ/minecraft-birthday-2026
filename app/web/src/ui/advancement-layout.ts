/** Java 26.3 TreeNodePosition layout and AdvancementWidget text sizing in native GUI pixels. */
import {ADVANCEMENTS,type AdvancementDefinition} from '../domain/advancements.ts';
import {wrap} from './pixels.ts';

/** A display node carries the contour threads and accumulated shifts of the native tree walk. */
class TreePosition {
    children:TreePosition[]=[];
    ancestor:TreePosition=this;
    thread:TreePosition|null=null;
    y=-1;mod=0;change=0;shift=0;
    /** Build the ordered display tree, including hidden nodes in its stable layout.
     * @param {string} id Advancement ID.
     * @param {TreePosition|null} parent Parent node.
     * @param {TreePosition|null} previous Previous sibling.
     * @param {number} index One-based sibling index.
     * @param {number} x Depth.
     * @param {Record<string,AdvancementDefinition>} definitions Registered display definitions.
     */
    constructor(public id:string,public parent:TreePosition|null,public previous:TreePosition|null,public index:number,public x:number,definitions:Record<string,AdvancementDefinition>){
        for(const [child,node] of Object.entries(definitions))if(node.parent===id)this.children.push(new TreePosition(child,this,this.children.at(-1)??null,this.children.length+1,x+1,definitions));
    }
    /** Follow the left contour or its native thread. @return {TreePosition|null} Next contour node. */
    left():TreePosition|null{return this.thread??this.children[0]??null;}
    /** Follow the right contour or its native thread. @return {TreePosition|null} Next contour node. */
    right():TreePosition|null{return this.thread??this.children.at(-1)??null;}
    /** Space siblings and apportion their descendant contours. */
    first():void{
        if(!this.children.length){this.y=this.previous?this.previous.y+1:0;return;}
        let ancestor=this.children[0];
        for(const child of this.children){child.first();ancestor=child.apportion(ancestor);}
        let shift=0,change=0;
        for(const child of [...this.children].reverse()){child.y+=shift;child.mod+=shift;shift+=child.shift+(change+=child.change);}
        const midpoint=(this.children[0].y+this.children.at(-1)!.y)/2;
        if(this.previous){this.y=this.previous.y+1;this.mod=this.y-midpoint;}else this.y=midpoint;
    }
    /** Shift overlapping contours using the native ancestor and thread rules.
     * @param {TreePosition} fallback Default ancestor.
     * @return {TreePosition} Ancestor for the next sibling.
     */
    apportion(fallback:TreePosition):TreePosition{
        if(!this.previous)return fallback;
        let innerRight:TreePosition=this,outerRight:TreePosition=this,innerLeft=this.previous,outerLeft=this.parent!.children[0];
        let sir=this.mod,sor=this.mod,sil=innerLeft.mod,sol=outerLeft.mod;
        while(innerLeft.right()&&innerRight.left()){
            innerLeft=innerLeft.right()!;innerRight=innerRight.left()!;outerLeft=outerLeft.left()!;outerRight=outerRight.right()!;outerRight.ancestor=this;
            const shift=innerLeft.y+sil-innerRight.y-sir+1;
            if(shift>0){
                const ancestor=this.parent!.children.includes(innerLeft.ancestor)?innerLeft.ancestor:fallback,count=this.index-ancestor.index;
                if(count){this.change-=shift/count;ancestor.change+=shift/count;}
                this.shift+=shift;this.y+=shift;this.mod+=shift;sir+=shift;sor+=shift;
            }
            sil+=innerLeft.mod;sir+=innerRight.mod;sol+=outerLeft.mod;sor+=outerRight.mod;
        }
        if(innerLeft.right()&&!outerRight.right()){outerRight.thread=innerLeft.right();outerRight.mod+=sil-sor;}
        else{if(innerRight.left()&&!outerLeft.left()){outerLeft.thread=innerRight.left();outerLeft.mod+=sir-sol;}fallback=this;}
        return fallback;
    }
    /** Accumulate modifiers before normalizing the topmost row.
     * @param {number} sum Ancestor shifts.
     * @return {number} Minimum row in this subtree.
     */
    second(sum:number):number{this.y+=sum;return Math.min(this.y,...this.children.map(child=>child.second(sum+this.mod)));}
    /** Emit floored native widget coordinates.
     * @param {number} offset Nonnegative row normalization.
     * @param {Map<string,{x:number;y:number}>} result Output coordinates.
     */
    finish(offset:number,result:Map<string,{x:number;y:number}>):void{result.set(this.id,{x:this.x*28,y:Math.floor((this.y+offset)*27)});for(const child of this.children)child.finish(offset,result);}
}

/** Position the registered tree independently of saved completion and visibility.
 * @param {string} root Root identity.
 * @param {Record<string,AdvancementDefinition>} definitions Display tree.
 * @return {Map<string,{x:number;y:number}>} Native widget positions.
 */
export function advancementPositions(root:string,definitions=ADVANCEMENTS):Map<string,{x:number;y:number}>{
    const tree=new TreePosition(root,null,null,1,0,definitions),result=new Map<string,{x:number;y:number}>();tree.first();const min=tree.second(0);tree.finish(Math.max(0,-min),result);return result;
}

/** Fit title and description using the native five candidate wrapping widths.
 * @param {string} title Localized title.
 * @param {string} description Localized description.
 * @param {Function} measure Native font width.
 * @param {number} progressWidth Reserved criterion counter width including its spacing.
 * @return {object} Native text lines and box dimensions.
 */
export function advancementTooltipLayout(title:string,description:string,measure:(text:string)=>number,progressWidth=0){
    const titles=wrap(title,163,measure),preferred=29+Math.max(80,...titles.map(measure))+progressWidth;
    let lines:string[]=[],distance=Infinity;
    for(const margin of [0,10,-10,25,-25]){const candidate=wrap(description,preferred-margin,measure),delta=Math.abs(Math.max(...candidate.map(measure))-preferred);if(delta<distance){lines=candidate;distance=delta;}if(delta<=10){lines=candidate;break;}}
    return{titles,lines,width:Math.max(preferred,...lines.map(measure))+8,titleHeight:titles.length*9+17,descriptionHeight:lines.length*9+6};
}
