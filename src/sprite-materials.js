// Deferred material pass for the actual paper actors and interactive props.
// Two half-resolution surface buffers share the exact Canvas transforms of the
// visible sprites; one GPU pass lights the finished scene. No pixel readback or
// per-actor shader compilation is performed during play.
export const DEFAULT_FEATURES=Object.freeze({ao:true,normals:true,metallic:true,lighting:true});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function spriteMaterialPixels(pixels,width,height,kind='paper'){
 const normal=new Uint8ClampedArray(pixels.length),orm=new Uint8ClampedArray(pixels.length),luma=new Float32Array(width*height);
 for(let i=0;i<luma.length;i++)luma[i]=(pixels[i*4]*.2126+pixels[i*4+1]*.7152+pixels[i*4+2]*.0722)/255;
 const sample=(x,y)=>luma[clamp(y,0,height-1)*width+clamp(x,0,width-1)];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,o=i*4,v=luma[i],a=pixels[o+3];
  const fibre=Math.sin(x*1.79+y*.23)*Math.sin(y*2.13-x*.18)*.028;
  const dx=(sample(x-1,y)-sample(x+1,y))*.58+fibre,dy=(sample(x,y-1)-sample(x,y+1))*.58-fibre*.7;
  const norm=1/Math.hypot(dx,dy,1);normal[o]=(dx*norm*.5+.5)*255;normal[o+1]=(dy*norm*.5+.5)*255;normal[o+2]=(norm*.5+.5)*255;normal[o+3]=a;
  // Printed recesses catch ambient shadow. Worn foil is restricted to bright,
  // raised detail on ornament/armour; every paper character remains dielectric.
  const recess=Math.max(0,(sample(x-2,y)+sample(x+2,y)+sample(x,y-2)+sample(x,y+2))/4-v);
  orm[o]=clamp(.78+v*.2-recess*.8)*255;
  orm[o+1]=(kind==='foil'?.53+(.5-Math.min(.5,v))*.48:.91+fibre)*255;
  orm[o+2]=kind==='foil'?clamp((v-.29)*1.9)*.76*255:0;orm[o+3]=a;
 }
 return {normal,orm};
}
const VERTEX=`attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const FRAGMENT=`precision highp float;
varying vec2 uv;uniform sampler2D imageMap,normalMap,ormMap;
uniform vec4 enabled;uniform vec3 ambientColor;uniform float ambientStrength;
uniform vec4 lightPosition[6];uniform vec4 lightColor[6];
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
 // Broad neutral studio reflection supplies a soft worn-metal response, never
 // a glass/plastic coat on paper. Disabling lighting retains neutral relief.
 lit+=albedo*vec3(.9,.86,.76)*metal*(.11+.15*n.z)*(1.-rough*.4);
 vec3 neutral=albedo*(.80+.2*n.z)*ao+albedo*metal*.06;
 vec3 result=mix(neutral,lit,enabled.w);
 gl_FragColor=vec4(mix(original.rgb,clamp(result,0.,1.),normalTex.a),original.a);
}`;
export function createSpriteMaterials(){
 const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
 const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,premultipliedAlpha:false,powerPreference:'high-performance'});
 const features={...DEFAULT_FEATURES},cache=new WeakMap();let active=false,profile=null,sprites=0,frames=0,normalMaps=0,metallicMaps=0;
 const buffers=['normal','orm'].map(()=>{const c=document.createElement('canvas');c.width=480;c.height=270;return c.getContext('2d')});
 if(!gl)return {begin(){},record(){},end(){},clip(){},restoreClip(){},setFeatures(v){Object.assign(features,v)},get features(){return {...features}},get stats(){return {available:false}}};
 const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader};
 const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 const textures=['imageMap','normalMap','ormMap'].map((name,i)=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.uniform1i(gl.getUniformLocation(program,name),i);return texture});
 const uniforms=Object.fromEntries(['enabled','ambientColor','ambientStrength','lightPosition[0]','lightColor[0]'].map(n=>[n,gl.getUniformLocation(program,n)]));
 const rgb=hex=>{const s=(hex||'#ffffff').slice(1);return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255)};
 function maps(source,kind){let entry=cache.get(source);if(entry?.[kind])return entry[kind];if(!entry){entry={};cache.set(source,entry)}
  const c=document.createElement('canvas'),scale=Math.min(1,256/Math.max(source.width,source.height));c.width=Math.ceil(source.width*scale);c.height=Math.ceil(source.height*scale);const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(source,0,0,c.width,c.height);const pixels=cx.getImageData(0,0,c.width,c.height),data=spriteMaterialPixels(pixels.data,c.width,c.height,kind);
  entry[kind]=[data.normal,data.orm].map(bytes=>{const out=document.createElement('canvas');out.width=c.width;out.height=c.height;out.getContext('2d').putImageData(new ImageData(bytes,c.width,c.height),0,0);return out});normalMaps++;if(kind==='foil')metallicMaps++;return entry[kind];
 }
 return {
  begin(value){profile=value;active=true;sprites=0;for(const cx of buffers){cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,480,270)}},
  clip(ctx,x,y,w,h){const m=ctx.getTransform();for(const cx of buffers){cx.save();cx.setTransform(m.a*.5,m.b*.5,m.c*.5,m.d*.5,m.e*.5,m.f*.5);cx.beginPath();cx.rect(x,y,w,h);cx.clip()}},
  restoreClip(){for(const cx of buffers)cx.restore()},
  record(ctx,source,x,y,w,h,kind='paper'){
   if(!active||!source)return;const surfaces=maps(source,kind),m=ctx.getTransform();
   for(let i=0;i<2;i++){const cx=buffers[i];cx.setTransform(m.a*.5,m.b*.5,m.c*.5,m.d*.5,m.e*.5,m.f*.5);cx.globalAlpha=ctx.globalAlpha;cx.drawImage(surfaces[i],x,y,w,h)}sprites++;
  },
  end(ctx){if(!active)return;active=false;if(!sprites)return;
   gl.useProgram(program);gl.viewport(0,0,960,540);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
   for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,i===0?ctx.canvas:buffers[i-1].canvas)}
   gl.uniform4f(uniforms.enabled,+features.ao,+features.normals,+features.metallic,+features.lighting);
   gl.uniform3fv(uniforms.ambientColor,rgb(profile?.ambient?.color||'#dedbd1'));gl.uniform1f(uniforms.ambientStrength,profile?.ambient?.intensity??.54);
   const positions=new Float32Array(24),colors=new Float32Array(24),lights=[profile?.key,profile?.fill,...(profile?.points||[])];
   for(let i=0;i<6;i++){const l=lights[i]||{};positions.set([l.x??480,l.y??50,l.z??250,l.radius?l.radius+Math.abs(l.z||0):1000],i*4);colors.set([...rgb(l.color),l.intensity??0],i*4)}
   gl.uniform4fv(uniforms['lightPosition[0]'],positions);gl.uniform4fv(uniforms['lightColor[0]'],colors);gl.drawArrays(gl.TRIANGLES,0,6);
   ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.drawImage(canvas,0,0);ctx.restore();frames++;
  },
  setFeatures(value){for(const key of Object.keys(features))if(key in value)features[key]=!!value[key];},
  get features(){return {...features}},
  get stats(){return {available:true,renderer:'deferred paper-sprite normal/ORM lighting',normalMaps,aoMaps:normalMaps,roughnessMaps:normalMaps,metallicMaps,paperMetalness:0,sprites,frames,drawCalls:sprites?1:0,bufferSize:[480,270],dynamicLights:Math.min(6,2+(profile?.points?.length||0)),features:{...features}}}
 };
}
