// Deferred material pass for the actual paper actors and interactive props.
// Two full-resolution surface buffers share the exact Canvas transforms of the
// visible sprites; one GPU pass lights the finished scene. No pixel readback or
// per-actor shader compilation is performed during play.
import {paperPalette,paperColorRGB} from './paper-palette.js';
import {characterPaperRelief} from './paper-pigment.js';
export const DEFAULT_FEATURES=Object.freeze({ao:true,normals:true,metallic:true,lighting:true});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
/** Fixed-size shader inputs. Palette selection is public scene data only. */
export function spriteMaterialUniforms(profile={}){
 const palette=paperPalette(profile?.palette?.id),positions=new Float32Array(24),colors=new Float32Array(24);
 const lights=[profile?.key,profile?.fill,...(Array.isArray(profile?.points)?profile.points.slice(0,4):[])];
 for(let i=0;i<6;i++){
  const light=lights[i]||{},z=clamp(finite(light.z,250),12,400),radius=clamp(finite(light.radius,1000),24,1000);
  positions.set([clamp(finite(light.x,480),-96,1056),clamp(finite(light.y,50),-60,600),z,radius+(light.radius?z:0)],i*4);
  colors.set([...paperColorRGB(light.color),clamp(finite(light.intensity,0),0,2.4)],i*4);
 }
 return {palette:palette.id,ambientColor:paperColorRGB(profile?.ambient?.color||palette.ambient),ambientStrength:clamp(finite(profile?.ambient?.intensity,.54),0,2),positions,colors,edgeColor:paperColorRGB(palette.edge),bounceColor:paperColorRGB(palette.bounce),metalColor:paperColorRGB(palette.metal),tintStrength:palette.spriteTint};
}
export function spriteMaterialPixels(pixels,width,height,kind='paper'){
 const normal=new Uint8ClampedArray(pixels.length),orm=new Uint8ClampedArray(pixels.length),luma=new Float32Array(width*height);
 const character=String(kind).startsWith('character'),foil=kind==='foil'||String(kind).startsWith('character-foil'),characterId=Number(String(kind).split(':')[1]||0),fold=character?characterPaperRelief(pixels,width,height,{character:characterId}):null;
 for(let i=0;i<luma.length;i++)luma[i]=(pixels[i*4]*.2126+pixels[i*4+1]*.7152+pixels[i*4+2]*.0722)/255;
 const sample=(x,y)=>luma[clamp(y,0,height-1)*width+clamp(x,0,width-1)];
 const folded=(x,y)=>fold?.relief[clamp(y,0,height-1)*width+clamp(x,0,width-1)]||0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,o=i*4,v=luma[i],a=pixels[o+3];
  const fibre=Math.sin(x*1.79+y*.23)*Math.sin(y*2.13-x*.18)*.028;
  const printedX=(sample(x-1,y)-sample(x+1,y))*.58+fibre,printedY=(sample(x,y-1)-sample(x,y+1))*.58-fibre*.7;
  const dx=printedX+(character?(folded(x-1,y)-folded(x+1,y))*.92:0),dy=printedY+(character?(folded(x,y-1)-folded(x,y+1))*.92:0);
  const norm=1/Math.hypot(dx,dy,1);normal[o]=(dx*norm*.5+.5)*255;normal[o+1]=(dy*norm*.5+.5)*255;normal[o+2]=(norm*.5+.5)*255;normal[o+3]=a;
  // Printed recesses catch ambient shadow. Worn foil is restricted to bright,
  // raised detail on ornament/armour; every paper character remains dielectric.
  const recess=Math.max(0,(sample(x-2,y)+sample(x+2,y)+sample(x,y-2)+sample(x,y+2))/4-v);
  orm[o]=clamp(.78+v*.2-recess*.8-(fold?fold.crease[i]*.16+fold.edge[i]*.09:0))*255;
  orm[o+1]=(foil?.53+(.5-Math.min(.5,v))*.48:.91+fibre)*255;
  orm[o+2]=foil?clamp((v-.29)*1.9)*.76*255:0;orm[o+3]=a;
 }
 return {normal,orm};
}
const VERTEX=`attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const FRAGMENT=`precision highp float;
varying vec2 uv;uniform sampler2D imageMap,normalMap,ormMap;
uniform vec4 enabled;uniform vec3 ambientColor;uniform float ambientStrength;
uniform vec4 lightPosition[6];uniform vec4 lightColor[6];
uniform vec3 paperEdgeColor,paperBounceColor,paperMetalColor;uniform float paperTintStrength;
vec3 contribution(vec3 p,vec3 n,vec3 albedo,float rough,float metal,vec4 position,vec4 color,float local){
 vec3 delta=position.xyz-p;float d=length(delta);vec3 l=normalize(delta);
 float atten=mix(1.,pow(max(0.,1.-d/max(position.w,1.)),2.),local);
 float diffuse=max(dot(n,l),0.);vec3 h=normalize(l+vec3(0.,0.,1.));
 float shine=pow(max(dot(n,h),0.),mix(48.,5.,rough));
 vec3 f0=mix(vec3(.035),albedo*.92,metal);
 return ((albedo*(1.-metal*.34)*diffuse)+(f0*shine*(1.-rough*.48)))*color.rgb*color.a*atten;
}
void main(){
 vec4 original=texture2D(imageMap,uv),normalTex=texture2D(normalMap,uv),orm=texture2D(ormMap,uv);
 if(normalTex.a<.01){gl_FragColor=original;return;}
 vec3 n=normalize(mix(vec3(0.,0.,1.),normalTex.rgb*2.-1.,enabled.y));
 float ao=mix(1.,orm.r,enabled.x),rough=orm.g,metal=orm.b*enabled.z;
 vec3 albedo=original.rgb,p=vec3(uv.x*960.,(1.-uv.y)*540.,0.);
 vec3 lit=albedo*ambientColor*ambientStrength*ao;
 for(int i=0;i<6;i++)lit+=contribution(p,n,albedo,rough,metal,lightPosition[i],lightColor[i],i<2?0.:1.);
 // Pigment lives on raised edges and the soft bounce from nearby paper, not
 // a full-screen color wash. Dark ink receives no extra colored emission.
 float ink=smoothstep(.07,.38,dot(albedo,vec3(.2126,.7152,.0722)));
 float edge=clamp(length(n.xy)*1.7+(1.-ao)*.7,0.,1.);
 vec3 edgePigment=paperEdgeColor/max(max(paperEdgeColor.r,paperEdgeColor.g),paperEdgeColor.b);
 lit*=mix(vec3(1.),edgePigment,edge*paperTintStrength*ink);
 lit+=albedo*paperBounceColor*(.03+.075*edge)*ink*(1.-metal*.65);
 // Selective worn foil catches the realm's pigment; paper stays dielectric.
 lit+=albedo*paperMetalColor*metal*(.11+.15*n.z)*(1.-rough*.4);
 vec3 neutral=albedo*(.80+.2*n.z)*ao+albedo*metal*.06;
 vec3 result=mix(neutral,lit,enabled.w);
 gl_FragColor=vec4(mix(original.rgb,clamp(result,0.,1.),normalTex.a),original.a);
}`;
export function createSpriteMaterials(){
 const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
 const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,premultipliedAlpha:false,powerPreference:'high-performance'});
 const features={...DEFAULT_FEATURES},cache=new WeakMap();let active=false,profile=null,sprites=0,frames=0,normalMaps=0,metallicMaps=0,characterFoldMaps=0;
 const buffers=['normal','orm'].map(()=>{const c=document.createElement('canvas');c.width=960;c.height=540;const cx=c.getContext('2d');cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';return cx;});
 if(!gl)return {begin(){},record(){},end(){},clip(){},restoreClip(){},setFeatures(v){Object.assign(features,v)},get features(){return {...features}},get stats(){return {available:false}}};
 const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader};
 const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 const textures=['imageMap','normalMap','ormMap'].map((name,i)=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.uniform1i(gl.getUniformLocation(program,name),i);return texture});
 const uniforms=Object.fromEntries(['enabled','ambientColor','ambientStrength','lightPosition[0]','lightColor[0]','paperEdgeColor','paperBounceColor','paperMetalColor','paperTintStrength'].map(n=>[n,gl.getUniformLocation(program,n)]));
 function maps(source,kind){let entry=cache.get(source);if(entry?.[kind])return entry[kind];if(!entry){entry={};cache.set(source,entry)}
  const c=document.createElement('canvas'),scale=Math.min(1,384/Math.max(source.width,source.height));c.width=Math.ceil(source.width*scale);c.height=Math.ceil(source.height*scale);const cx=c.getContext('2d',{willReadFrequently:true});cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(source,0,0,c.width,c.height);const pixels=cx.getImageData(0,0,c.width,c.height),data=spriteMaterialPixels(pixels.data,c.width,c.height,kind);
  entry[kind]=[data.normal,data.orm].map(bytes=>{const out=document.createElement('canvas');out.width=c.width;out.height=c.height;out.getContext('2d').putImageData(new ImageData(bytes,c.width,c.height),0,0);return out});normalMaps++;if(kind==='foil'||String(kind).startsWith('character-foil'))metallicMaps++;if(String(kind).startsWith('character'))characterFoldMaps++;return entry[kind];
 }
 return {
  begin(value,ctx){if(ctx){if(canvas.width!==ctx.canvas.width||canvas.height!==ctx.canvas.height){canvas.width=ctx.canvas.width;canvas.height=ctx.canvas.height;for(const cx of buffers){cx.canvas.width=canvas.width;cx.canvas.height=canvas.height;cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';}}}profile=value;active=true;sprites=0;for(const cx of buffers){cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,cx.canvas.width,cx.canvas.height)}},
  clip(ctx,x,y,w,h){const m=ctx.getTransform();for(const cx of buffers){cx.save();cx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);cx.beginPath();cx.rect(x,y,w,h);cx.clip()}},
  restoreClip(){for(const cx of buffers)cx.restore()},
  record(ctx,source,x,y,w,h,kind='paper'){
   if(!active||!source)return;const surfaces=maps(source,kind),m=ctx.getTransform();
   for(let i=0;i<2;i++){const cx=buffers[i];cx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);cx.globalAlpha=ctx.globalAlpha;cx.drawImage(surfaces[i],x,y,w,h)}sprites++;
  },
  end(ctx){if(!active)return;active=false;if(!sprites)return;
   gl.useProgram(program);gl.viewport(0,0,canvas.width,canvas.height);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
   for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,i===0?ctx.canvas:buffers[i-1].canvas)}
   gl.uniform4f(uniforms.enabled,+features.ao,+features.normals,+features.metallic,+features.lighting);
   const data=spriteMaterialUniforms(profile);
   gl.uniform3fv(uniforms.ambientColor,data.ambientColor);gl.uniform1f(uniforms.ambientStrength,data.ambientStrength);
   gl.uniform3fv(uniforms.paperEdgeColor,data.edgeColor);gl.uniform3fv(uniforms.paperBounceColor,data.bounceColor);gl.uniform3fv(uniforms.paperMetalColor,data.metalColor);gl.uniform1f(uniforms.paperTintStrength,data.tintStrength);
   gl.uniform4fv(uniforms['lightPosition[0]'],data.positions);gl.uniform4fv(uniforms['lightColor[0]'],data.colors);gl.drawArrays(gl.TRIANGLES,0,6);
   ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.drawImage(canvas,0,0);ctx.restore();frames++;
  },
  setFeatures(value){for(const key of Object.keys(features))if(key in value)features[key]=!!value[key];},
  get features(){return {...features}},
  get stats(){return {available:true,renderer:'deferred paper-sprite normal/ORM lighting',normalMaps,aoMaps:normalMaps,roughnessMaps:normalMaps,metallicMaps,characterFoldMaps,paperMetalness:0,sprites,frames,drawCalls:sprites?1:0,bufferSize:[canvas.width,canvas.height],surfaceResolution:384,filtering:'linear/high-quality',dynamicLights:Math.min(6,2+(profile?.points?.length||0)),palette:paperPalette(profile?.palette?.id).id,paletteVariants:5,features:{...features}}}
 };
}
