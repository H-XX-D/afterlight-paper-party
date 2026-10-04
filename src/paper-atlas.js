/** Isolate printed grid pieces without hiding parts that cross their grid cell.
 * Central seeds compete along connected alpha. That also separates two pieces
 * whose antialiased edges happen to touch at a grid boundary. */
export function createPaperAtlasFrames(image,{columns,rows,overflow=48}={}){
 const {width,height,data}=image||{};
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data?.length!==width*height*4||!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns>width||rows>height)throw new RangeError('A complete RGBA atlas and positive grid dimensions are required.');
 const margin=Math.max(0,Math.min(48,Math.floor(Number.isFinite(overflow)?overflow:0))),cellWidth=width/columns,cellHeight=height/rows,owners=new Int16Array(width*height),queue=new Int32Array(width*height),coreLabels=new Int32Array(width*height);
 let tail=0,head=0,serial=0;
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const owner=row*columns+col+1,left=Math.ceil((col+.23)*cellWidth),right=Math.floor((col+.77)*cellWidth),top=Math.ceil((row+.23)*cellHeight),bottom=Math.floor((row+.77)*cellHeight);
  let best=[],bestMass=0;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const start=y*width+x;if(coreLabels[start]||data[start*4+3]<20)continue;
   serial++;const component=[start];coreLabels[start]=serial;let mass=0;
   for(let n=0;n<component.length;n++){
    const at=component[n],xx=at%width,yy=Math.floor(at/width);mass+=data[at*4+3];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     if(!dx&&!dy)continue;const nx=xx+dx,ny=yy+dy;if(nx<left||nx>=right||ny<top||ny>=bottom)continue;
     const next=ny*width+nx;if(coreLabels[next]||data[next*4+3]<20)continue;coreLabels[next]=serial;component.push(next);
    }
   }
   if(mass>bestMass){best=component;bestMass=mass;}
  }
  // Very thin pieces may miss the core. Their strongest original-cell alpha
  // pixel still gives them one seed, never a seed in a neighboring cell.
  if(!best.length){let mass=0,at=-1;for(let y=Math.floor(row*cellHeight);y<Math.min(height,Math.ceil((row+1)*cellHeight));y++)for(let x=Math.floor(col*cellWidth);x<Math.min(width,Math.ceil((col+1)*cellWidth));x++){const index=y*width+x;if(data[index*4+3]>mass){mass=data[index*4+3];at=index;}}if(mass>=20)best=[at];}
  for(const at of best){owners[at]=owner;queue[tail++]=at;}
 }
 // A one-pixel touch between two printed outlines is much harder to cross
 // than a path through a solid torso. This avoids lending a drone's rotor to
 // the umbrella next door while keeping thin handles attached to their owner.
 const clearance=new Uint16Array(width*height);let edgeTail=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=y*width+x;if(data[at*4+3]<20)continue;
  if(!x||!y||x===width-1||y===height-1||data[(at-1)*4+3]<20||data[(at+1)*4+3]<20||data[(at-width)*4+3]<20||data[(at+width)*4+3]<20){clearance[at]=1;coreLabels[edgeTail++]=at;}
 }
 for(let n=0;n<edgeTail;n++){const at=coreLabels[n],x=at%width,y=Math.floor(at/width);for(const next of[x?at-1:-1,x<width-1?at+1:-1,y?at-width:-1,y<height-1?at+width:-1])if(next>=0&&!clearance[next]&&data[next*4+3]>=20){clearance[next]=clearance[at]+1;coreLabels[edgeTail++]=next;}}
 const distances=new Float64Array(width*height);distances.fill(Infinity);for(let n=0;n<tail;n++)distances[queue[n]]=0;
 const heapNodes=[],heapCosts=[];
 const push=(at,cost)=>{let n=heapNodes.length;heapNodes.push(at);heapCosts.push(cost);while(n){const parent=(n-1)>>1;if(heapCosts[parent]<=cost)break;heapNodes[n]=heapNodes[parent];heapCosts[n]=heapCosts[parent];n=parent;}heapNodes[n]=at;heapCosts[n]=cost;};
 const pop=()=>{const at=heapNodes[0],cost=heapCosts[0],last=heapNodes.pop(),lastCost=heapCosts.pop();if(heapNodes.length){let n=0;while(n*2+1<heapNodes.length){let child=n*2+1;if(child+1<heapNodes.length&&heapCosts[child+1]<heapCosts[child])child++;if(heapCosts[child]>=lastCost)break;heapNodes[n]=heapNodes[child];heapCosts[n]=heapCosts[child];n=child;}heapNodes[n]=last;heapCosts[n]=lastCost;}return {at,cost};};
 const expand=(at,cost)=>{
  const owner=owners[at],x=at%width,y=Math.floor(at/width),col=(owner-1)%columns,row=Math.floor((owner-1)/columns);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height||xx<col*cellWidth-margin||xx>=(col+1)*cellWidth+margin||yy<row*cellHeight-margin||yy>=(row+1)*cellHeight+margin)continue;
   const next=yy*width+xx;if(data[next*4+3]<20||distances[next]===0)continue;const step=1+Math.floor(64/Math.max(1,clearance[next])**2),distance=cost+step*(dx&&dy?1.4:1);
   if(distance>=distances[next])continue;distances[next]=distance;owners[next]=owner;push(next,distance);
  }
 };
 while(head<tail)expand(queue[head++],0);
 while(heapNodes.length){const {at,cost}=pop();if(cost!==distances[at])continue;expand(at,cost);}
 // Keep the original antialias alpha on the immediate outside of each owner.
 // It cannot become a path connecting otherwise separate illustrations.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=y*width+x,a=data[at*4+3];if(!a||a>=20||owners[at])continue;
  let owner=0,distance=Infinity;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const next=yy*width+xx;if(data[next*4+3]<20||!owners[next])continue;const d=dx*dx+dy*dy;if(d<distance){distance=d;owner=owners[next];}}
  owners[at]=owner;
 }
 const frames=[];
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const owner=row*columns+col+1,nominal={x:col*cellWidth,y:row*cellHeight,width:cellWidth,height:cellHeight};let left=width,top=height,right=-1,bottom=-1,alphaPixels=0,recoveredPixels=0;
  const scanLeft=Math.max(0,Math.floor(nominal.x-margin)-1),scanTop=Math.max(0,Math.floor(nominal.y-margin)-1),scanRight=Math.min(width,Math.ceil(nominal.x+cellWidth+margin)+1),scanBottom=Math.min(height,Math.ceil(nominal.y+cellHeight+margin)+1);
  for(let y=scanTop;y<scanBottom;y++)for(let x=scanLeft;x<scanRight;x++){const at=y*width+x;if(owners[at]!==owner)continue;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);alphaPixels++;if(x<nominal.x||x>=nominal.x+cellWidth||y<nominal.y||y>=nominal.y+cellHeight)recoveredPixels++;}
  const empty=right<left;if(empty){left=Math.floor(nominal.x);top=Math.floor(nominal.y);right=left;bottom=top;}
  const w=right-left+1,h=bottom-top+1,pixels=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=(top+y)*width+left+x;if(owners[at]===owner)pixels.set(data.subarray(at*4,at*4+4),(y*w+x)*4);}
  frames.push({pixels,width:w,height:h,sourceX:left,sourceY:top,nominal,empty,alphaPixels,recoveredPixels,draw:{x:(left-nominal.x)/cellWidth,y:(top-nominal.y)/cellHeight,width:w/cellWidth,height:h/cellHeight}});
 }
 return {frames,columns,rows,overflow:margin,frame(col,row){return frames[row*columns+col]||null;}};
}

/** A tight cached raster still occupies its original nominal grid rectangle. */
export function paperAtlasDrawRect(frame,x,y,width,height){
 const draw=frame?.draw||{x:0,y:0,width:1,height:1};return {x:x+draw.x*width,y:y+draw.y*height,width:draw.width*width,height:draw.height*height};
}
