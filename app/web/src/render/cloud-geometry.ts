/** Native cloud texture alpha becomes 12×4×12 cells, with only exposed side walls and visible undersides. */
export interface CloudData {positions:Float32Array;colors:Float32Array;indices:Uint32Array;quads:number}
/** Compile one complete repeating native texture tile without per-frame geometry allocation.
 * @param {Uint8ClampedArray} rgba Original cloud PNG pixels.
 * @param {number} width Original texture width.
 * @param {number} height Original texture height.
 * @return {CloudData} Transferable packed geometry and native directional shades.
 */
export function cloudGeometry(rgba:Uint8ClampedArray,width:number,height:number):CloudData{
 const p:number[]=[],c:number[]=[],ix:number[]=[];
 /** Test the native ten-alpha threshold with wraparound neighbors. @param {number} x Texture column. @param {number} z Texture row. @return {boolean} Occupied native cell. */
 const filled=(x:number,z:number)=>rgba[((((z%height+height)%height)*width+(x%width+width)%width)*4)+3]>=10;
 /** Append one outward-wound native quad. @param {number[][]} vertices Cell corners. @param {number} shade Native face multiplier. */
 const face=(vertices:number[][],shade:number)=>{const base=p.length/3;for(const v of vertices){p.push(...v);c.push(shade,shade,shade);}ix.push(base,base+1,base+2,base,base+2,base+3);};
 for(let z=0;z<height;z++)for(let x=0;x<width;x++)if(filled(x,z)){
  const a=x*12,b=z*12;face([[a+12,0,b],[a+12,0,b+12],[a,0,b+12],[a,0,b]],.7);
  if(!filled(x,z-1))face([[a,0,b],[a,4,b],[a+12,4,b],[a+12,0,b]],.8);
  if(!filled(x,z+1))face([[a+12,0,b+12],[a+12,4,b+12],[a,4,b+12],[a,0,b+12]],.8);
  if(!filled(x-1,z))face([[a,0,b+12],[a,4,b+12],[a,4,b],[a,0,b]],.9);
  if(!filled(x+1,z))face([[a+12,0,b],[a+12,4,b],[a+12,4,b+12],[a+12,0,b+12]],.9);
 }
 return{positions:new Float32Array(p),colors:new Float32Array(c),indices:new Uint32Array(ix),quads:ix.length/6};
}
