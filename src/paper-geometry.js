/** Pure geometry data cut from existing illustration pixels. No DOM or randomness. */
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
function check(image){if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<2||image.height<2||image.data?.length<image.width*image.height*4)throw new RangeError('A complete RGBA image is required');}
function pigment(image,u,v){const x=clamp(Math.round(u*(image.width-1)),0,image.width-1),y=clamp(Math.round(v*(image.height-1)),0,image.height-1),i=(y*image.width+x)*4;return (image.data[i]*.2126+image.data[i+1]*.7152+image.data[i+2]*.0722)/255;}
function softened(image,u,v){let sum=0,weight=0;for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const w=ox===0&&oy===0?4:1;sum+=pigment(image,u+ox/image.width*2,v+oy/image.height*2)*w;weight+=w;}return sum/weight;}
function finiteOptions(values){if(values.some(v=>!Number.isFinite(v)))throw new RangeError('Geometry dimensions must be finite');}
/** A printed, folded relief wall: broad architecture rises from its own ink. */
export function paperReliefData(image,{columns=48,rows=28,width=72,height=40.5,depth=2.3,fold=.38}={}){
 check(image);finiteOptions([columns,rows,width,height,depth,fold]);columns=clamp(Math.floor(columns),2,80);rows=clamp(Math.floor(rows),2,48);
 const positions=[],uv=[],indices=[];
 for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
  const u=x/columns,v=y/rows,dark=1-softened(image,u,v),edge=Math.abs(u-.5)*2;
  // Low-frequency folds bend the printed sheet, while ink relief models its
  // architecture. The center stays quieter than the stage's outer contours.
  const crease=Math.max(0,edge-.64)**2/.1296,relief=dark*dark*depth*(.35+edge*.65)+crease*fold;
  const alignment=(46.1-relief)/46.1;
  positions.push((u-.5)*width*alignment,1.45+((.5-v)*height-1.45)*alignment,relief);uv.push(u,1-v);
 }
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;indices.push(a,c,b,b,c,d);}
 return {positions:new Float32Array(positions),uv:new Float32Array(uv),indices:new Uint16Array(indices),groups:[{start:0,count:indices.length,materialIndex:0}],columns,rows,depthRange:[Math.min(...positions.filter((_,i)=>i%3===2)),Math.max(...positions.filter((_,i)=>i%3===2))]};
}
/** Layered scene wings follow the ink contour; front/back/edge are physical faces. */
export function paperWingData(image,{side=-1,near=false,rows=36,columns=6,thickness=.2}={}){
 check(image);finiteOptions([side,rows,columns,thickness]);rows=clamp(Math.floor(rows),4,60);columns=clamp(Math.floor(columns),2,10);side=side<0?-1:1;
 const positions=[],uv=[],indices=[],colors=[],range=near?[.055,.125]:[.15,.26],baseZ=near?-6:-13.5,eyeZ=26.1,eyeY=4.45,sourceZ=-20;
 const contour=[],iw=image.width,ih=image.height,limit=Math.ceil(iw*range[1]),visited=new Uint8Array(iw*ih),queue=new Int32Array(iw*ih);let head=0,tail=0;
 // Only architecture physically connected to the picture's outer edge becomes
 // a wing. A dark distant castle floating in clouds must stay on the relief.
 const belongs=(x,y)=>{if(x<0||x>=iw||y<0||y>=ih||(side<0?x>=limit:x<iw-limit))return false;return pigment(image,x/(iw-1),y/(ih-1))<.39;};
 const offer=(x,y)=>{if(!belongs(x,y))return;const at=y*iw+x;if(!visited[at]){visited[at]=1;queue[tail++]=at;}};
 for(let y=0;y<ih;y++)for(let n=0;n<3;n++)offer(side<0?n:iw-1-n,y);
 while(head<tail){const at=queue[head++],x=at%iw,y=Math.floor(at/iw);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]])offer(x+dx,y+dy);}
 for(let row=0;row<=rows;row++){
  const v=row/rows,py=Math.round(v*(ih-1));let extent=near?.018:.025;
  for(let y=Math.max(0,py-1);y<=Math.min(ih-1,py+1);y++)for(let n=0;n<limit;n++){const x=side<0?n:iw-1-n;if(visited[y*iw+x])extent=Math.max(extent,Math.min(range[1],(n+1)/iw));}
  contour.push(extent);
 }
 // A tiny three-sample smoothing keeps fibers from turning into saw teeth.
 const smooth=contour.map((value,n)=>(value*2+(contour[n-1]??value)+(contour[n+1]??value))/4);
 for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
  const v=row/rows,t=col/columns,edge=t*smooth[row],u=side<0?edge:1-edge;
  const fold=(1-t)**2*(near?2.5:1.8)+Math.sin(v*Math.PI*3)*.15,relief=(1-softened(image,u,v))*.24,z=baseZ+fold+relief,alignment=(eyeZ-z)/(eyeZ-sourceZ);
  positions.push((u-.5)*72*alignment,eyeY+(3+(.5-v)*40.5-eyeY)*alignment,z);uv.push(u,1-v);
  const fade=clamp((1-t)*2.5,0,1);colors.push(1,1,1,fade*fade*(3-2*fade));
 }
 const frontCount=(rows+1)*(columns+1);
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const a=row*(columns+1)+col,b=a+1,c=a+columns+1,d=c+1;side<0?indices.push(a,c,b,b,c,d):indices.push(a,b,c,b,d,c);}
 const frontIndices=indices.length;
 // A second printed rear face and corrugated cut rim expose genuine thickness.
 for(let n=0;n<frontCount;n++){positions.push(positions[n*3],positions[n*3+1],positions[n*3+2]-thickness);uv.push(uv[n*2],uv[n*2+1]);colors.push(...colors.slice(n*4,n*4+4));}
 for(let n=0;n<frontIndices;n+=3)indices.push(indices[n+2]+frontCount,indices[n+1]+frontCount,indices[n]+frontCount);
 const printCount=indices.length;
 const border=[];for(let col=0;col<=columns;col++)border.push(col);for(let row=1;row<=rows;row++)border.push(row*(columns+1)+columns);for(let col=columns-1;col>=0;col--)border.push(rows*(columns+1)+col);for(let row=rows-1;row>0;row--)border.push(row*(columns+1));
 for(let n=0;n<border.length;n++){const a=border[n],b=border[(n+1)%border.length];indices.push(a,b,b+frontCount,a,b+frontCount,a+frontCount);}
 return {positions:new Float32Array(positions),uv:new Float32Array(uv),indices:new Uint16Array(indices),groups:[{start:0,count:printCount,materialIndex:0},{start:printCount,count:indices.length-printCount,materialIndex:1}],colors:new Float32Array(colors),contour:smooth,side,near,thickness,depthRange:[baseZ-thickness,baseZ+(near?2.5:1.8)+.39],frontCount};
}
function signedArea(points){let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a[0]*b[1]-b[0]*a[1];}return sum/2;}
function contains(points,p){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
/** Trace alpha-cell boundaries, retaining real portal holes rather than a box hull. */
export function paperAlphaContours(image,{threshold=150,minArea=5,maxHoles=12}={}){
 check(image);const w=image.width,h=image.height,filled=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&image.data[(y*w+x)*4+3]>=threshold,edges=new Map(),key=(x,y)=>x+','+y;
 const add=(ax,ay,bx,by)=>{const k=key(ax,ay),list=edges.get(k)||[];list.push([bx,by]);edges.set(k,list);};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(filled(x,y)){if(!filled(x,y-1))add(x,y,x+1,y);if(!filled(x+1,y))add(x+1,y,x+1,y+1);if(!filled(x,y+1))add(x+1,y+1,x,y+1);if(!filled(x-1,y))add(x,y+1,x,y);}
 const loops=[];
 while(edges.size){const first=edges.keys().next().value,start=first.split(',').map(Number),points=[start];let current=start,closed=false;
  for(let guard=0;guard<w*h*4;guard++){const k=key(...current),list=edges.get(k);if(!list?.length)break;const next=list.pop();if(!list.length)edges.delete(k);if(next[0]===start[0]&&next[1]===start[1]){closed=true;break;}points.push(next);current=next;}
  if(!closed||points.length<4)continue;
  const simplified=points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);});
  const area=signedArea(simplified);if(Math.abs(area)>=minArea)loops.push({points:simplified,area});
 }
 loops.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));if(!loops.length)return {outer:[],holes:[],pixelArea:0};
 const outer=loops[0],holes=loops.slice(1).filter(p=>Math.sign(p.area)!==Math.sign(outer.area)&&contains(outer.points,p.points[0])).slice(0,maxHoles),normalize=p=>p.map(([x,y])=>[x/w-.5,.5-y/h]);
 return {outer:normalize(outer.points),holes:holes.map(p=>normalize(p.points)),pixelArea:Math.abs(outer.area)-holes.reduce((sum,p)=>sum+Math.abs(p.area),0)};
}
