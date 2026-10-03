import * as THREE from 'three';
import {generateMaterialMaps} from './materials.js';
import {sceneLighting} from './scene-lighting.js';
import {paperPalette} from './paper-palette.js';
import {paperReliefData,paperWingData,paperAlphaContours} from './paper-geometry.js';

/**
 * One reusable 3D paper theater for the board and all twenty-four minigames.
 * Gameplay remains in its authoritative 960×540 plane; this scene supplies real
 * perspective, folded edge faces, contact shadows and depth behind that plane.
 */
export function createPaperWorld(art={}){
  let renderer=null,canvas=null,disposed=false,lost=false,frames=0,lastId='',lastTime=-1;
  let width=960,height=540,lastCalls=0,lastTriangles=0,maxCalls=0,lastLightingKey='',lastShadowTime=-1;
  const features={ao:true,normals:true,metallic:true,lighting:true},shaderErrors=[];
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(n)?n:lo));
  const geometryPool=new Set(),materialPool=new Set(),texturePool=new Map(),atlasTextures=new Map(),cutoutGeometries=new Map(),realmGeometryCache=new Map();
  let depthEnabled=true,currentRelief=null;
  const unavailable={draw:()=>false,dispose(){},setDepth(){return false},setFeatures(next={}){for(const key of Object.keys(features))if(typeof next[key]==='boolean')features[key]=next[key];return {...features};},get stats(){return {available:false,frames:0,calls:0,triangles:0,geometries:0,textures:0,lastId:'',width:0,height:0,features:{...features},materials:{pbr:0,normalMapped:0,aoMapped:0,roughnessMapped:0,metalnessMapped:0,paperMetalness:0},materialMaps:{ready:false,size:0},dynamicLights:0,diorama:{depthEnabled:false,depthLayers:0,reliefVertices:0,contourMeshes:0,texturedMeshes:0,geometryDepth:0,cachedRealms:0},shaderErrors:[...shaderErrors]};}};
  if(typeof document==='undefined')return unavailable;
  try{
    canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
    const context=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'low-power',premultipliedAlpha:false,preserveDrawingBuffer:true});
    if(!context)return unavailable;
    renderer=new THREE.WebGLRenderer({canvas,context,alpha:false,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
    renderer.setPixelRatio(1);renderer.setSize(960,540,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate=false;
    renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{shaderErrors.push({program:gl.getProgramInfoLog(program)||'',vertex:gl.getShaderInfoLog(vertex)||'',fragment:gl.getShaderInfoLog(fragment)||''});};
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;});
  }catch{renderer?.dispose();return unavailable;}

  const scene=new THREE.Scene();scene.background=new THREE.Color('#aaa79e');
  scene.fog=new THREE.Fog('#aaa59b',31,74);
  const camera=new THREE.PerspectiveCamera(39,16/9,.1,110);
  const ownGeometry=g=>{if(g.attributes.uv&&!g.attributes.uv1)g.setAttribute('uv1',g.attributes.uv.clone());geometryPool.add(g);return g;};
  const measuredMaps=generateMaterialMaps({size:128});
  const surfaceTextures={};
  for(const kind of ['paper','corrugation','foil']){
    surfaceTextures[kind]={};
    for(const name of ['normal','ao','roughness','metalness']){
      const texture=new THREE.CanvasTexture(measuredMaps[kind][name]);texture.colorSpace=THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
      if(name==='ao')texture.channel=1;
      surfaceTextures[kind][name]=texture;atlasTextures.set('surface:'+kind+':'+name,texture);
    }
  }
  function bindSurface(material,kind='paper',metalMask=null){
    material.userData.surfaceKind=kind;material.userData.surface=surfaceTextures[kind];material.userData.metalMask=metalMask;material.userData.baseMetalness=metalMask?1:kind==='foil'?1:0;
    material.normalScale.setScalar(kind==='corrugation'?.65:kind==='foil'?.34:.5);material.roughness=1;material.aoMapIntensity=kind==='corrugation'?.85:.72;
    material.roughnessMap=surfaceTextures[kind].roughness;applyFeatures(material);return material;
  }
  function applyFeatures(material){
    const surface=material.userData.surface;if(!surface)return;
    material.normalMap=features.normals?surface.normal:null;material.aoMap=features.ao?surface.ao:null;
    material.metalness=features.metallic?material.userData.baseMetalness:0;
    material.metalnessMap=features.metallic?(material.userData.metalMask||surface.metalness):null;
    material.needsUpdate=true;
  }
  const ownMaterial=m=>{
    if(m.isMeshStandardMaterial){
      // Grade the lit cardstock toward neutral ivory without altering the saved
      // generated artwork. The metallic-roughness BRDF remains Three's own.
      m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat paperLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(paperLuma) * vec3(1.0, 0.995, 0.975), '+(m.userData.grade??.42).toFixed(2)+');');};
      m.customProgramCacheKey=()=> 'afterlight-pbr-paper-v3-'+(m.userData.grade??.42);
      bindSurface(m);
    }
    materialPool.add(m);return m;
  };
  const box=ownGeometry(new THREE.BoxGeometry(1,1,1));
  const plane=ownGeometry(new THREE.PlaneGeometry(1,1));
  const paper=ownMaterial(new THREE.MeshStandardMaterial({color:'#e6dfd0',flatShading:true}));
  const edge=bindSurface(ownMaterial(new THREE.MeshStandardMaterial({color:'#80796f',flatShading:true})),'corrugation');
  const ink=bindSurface(ownMaterial(new THREE.MeshStandardMaterial({color:'#827c71',flatShading:true})),'foil');
  const pale=ownMaterial(new THREE.MeshStandardMaterial({color:'#eee8da',flatShading:true}));
  const faded=ownMaterial(new THREE.MeshStandardMaterial({color:'#c3bdb0',flatShading:true}));
  const accent=ownMaterial(new THREE.MeshStandardMaterial({color:'#9c9d8b',flatShading:true}));

  const ambient=new THREE.HemisphereLight('#e5e5e3','#70706c',2.0);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#fffef9',2.35);sun.position.set(-16,24,19);sun.target.position.set(0,-1,-1);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-24,right:24,top:22,bottom:-16,near:1,far:75});
  sun.shadow.bias=-.00035;sun.shadow.normalBias=.035;sun.shadow.radius=3;scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight('#d9dbd0',.65);fill.position.set(16,8,-8);scene.add(fill);
  const points=Array.from({length:4},()=>{const light=new THREE.PointLight('#eee9dc',0,40,2);scene.add(light);return light;});
  // A neutral photographed-studio style radiance field supplies broad metal
  // reflections. It is authored radiance data, not another illustrated asset.
  const environmentPixels=new Float32Array(128*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<128;x++){
    const u=x/128,v=y/64,softbox=Math.exp(-((u-.22)**2/.008+(v-.30)**2/.026))*1.7+Math.exp(-((u-.74)**2/.004+(v-.42)**2/.045))*.75;
    const radiance=.11+Math.max(0,Math.cos(v*Math.PI))*.18+softbox,i=(y*128+x)*4;
    environmentPixels[i]=radiance;environmentPixels[i+1]=radiance*.994;environmentPixels[i+2]=radiance*.98;environmentPixels[i+3]=1;
  }
  const radianceTexture=new THREE.DataTexture(environmentPixels,128,64,THREE.RGBAFormat,THREE.FloatType);radianceTexture.mapping=THREE.EquirectangularReflectionMapping;radianceTexture.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer),environmentTarget=pmrem.fromEquirectangular(radianceTexture);scene.environment=environmentTarget.texture;scene.environmentIntensity=.68;radianceTexture.dispose();pmrem.dispose();

  function mesh(geometry,material,parent=scene){const value=new THREE.Mesh(geometry,material);parent.add(value);return value;}
  function block(parent,material,x,y,z,sx,sy,sz){const value=mesh(box,material,parent);value.position.set(x,y,z);value.scale.set(sx,sy,sz);value.receiveShadow=true;return value;}
  function archGeometry(){
    const shape=new THREE.Shape();shape.moveTo(-1.7,0);shape.lineTo(-1.7,6.45);shape.quadraticCurveTo(-1.6,8.12,0,9.8);shape.quadraticCurveTo(1.6,8.12,1.7,6.45);shape.lineTo(1.7,0);shape.closePath();
    const hole=new THREE.Path();hole.moveTo(-1.03,.64);hole.lineTo(1.03,.64);hole.lineTo(1.03,6.32);hole.quadraticCurveTo(.92,7.58,0,8.65);hole.quadraticCurveTo(-.92,7.58,-1.03,6.32);hole.closePath();shape.holes.push(hole);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.38,bevelEnabled:true,bevelSize:.045,bevelThickness:.035,bevelSegments:1,curveSegments:5,steps:1});geometry.center();return ownGeometry(geometry);
  }
  function islandGeometry(){
    const shape=new THREE.Shape();shape.moveTo(-2.1,-1.1);shape.lineTo(-1.64,-1.5);shape.lineTo(1.56,-1.45);shape.lineTo(2.1,-.88);shape.lineTo(1.92,.95);shape.lineTo(1.15,1.38);shape.lineTo(-1.48,1.23);shape.lineTo(-2.18,.55);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.26,bevelEnabled:false,curveSegments:1,steps:1});geometry.rotateX(-Math.PI/2);return ownGeometry(geometry);
  }
  function foldedGeometry(){
    // The central fold protrudes in Z, giving each face a different light value.
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([
      -1,1,0, 0,1,.23, -1,-.75,0, 0,1,.23, 0,-1,.23, -1,-.75,0,
      0,1,.23, 1,1,0, 0,-1,.23, 1,1,0, 1,-.73,0, 0,-1,.23,
    ],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,.5,1,0,0,.5,1,.5,0,0,0,.5,1,1,1,.5,0,1,1,1,0,.5,0],2));geometry.computeVertexNormals();return ownGeometry(geometry);
  }
  const archGeo=archGeometry(),islandGeo=islandGeometry(),foldGeo=foldedGeometry();
  const floor=mesh(box,faded);floor.position.set(0,-18,3);floor.scale.set(65,.18,24);floor.receiveShadow=true;floor.visible=false;
  const stage=new THREE.Group();stage.visible=false;scene.add(stage);
  const stageLower=block(stage,edge,0,-6.95,3,38,.55,13);
  block(stage,paper,0,-6.60,3,38.3,.16,13.15);
  block(stage,pale,0,-6.46,3,38.04,.10,13.02);
  stageLower.castShadow=true;

  const arches=[];
  for(let n=0;n<4;n++){
    const group=new THREE.Group();scene.add(group);
    const frame=mesh(archGeo,[paper,edge],group);frame.castShadow=true;frame.receiveShadow=true;
    const shoe=block(group,ink,0,-5.05,0,3.78,.15,1.15);shoe.castShadow=true;
    block(group,pale,0,-4.89,0,3.66,.17,1.09);
    const fold=mesh(foldGeo,accent,group);fold.material.side=THREE.DoubleSide;fold.position.set(0,2.12,.3);fold.scale.set(.61,1.13,1);fold.castShadow=true;
    arches.push({group,frame,fold,baseY:0,phase:n*1.1});
  }

  const islands=[];
  for(let n=0;n<4;n++){
    const group=new THREE.Group();scene.add(group);
    const bottom=mesh(islandGeo,edge,group);bottom.position.y=-.30;bottom.scale.set(1.015,1.1,1.02);bottom.castShadow=true;bottom.receiveShadow=true;
    const top=mesh(islandGeo,paper,group);top.castShadow=true;top.receiveShadow=true;
    const fold=mesh(foldGeo,faded,group);fold.position.set(0,-.55,.1);fold.rotation.x=.18;fold.scale.set(.61,.48,1);
    islands.push({group,baseY:0,phase:n*1.7});
  }

  const backdropMaterial=ownMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',fog:false}));backdropMaterial.userData.grade=.14;backdropMaterial.normalScale.setScalar(.18);backdropMaterial.aoMapIntensity=.34;backdropMaterial.emissive.set('#ffffff');backdropMaterial.emissiveIntensity=.19;
  const backdrop=mesh(plane,backdropMaterial);backdrop.position.set(0,3,-20);backdrop.scale.set(72,40.5,1);
  backdrop.receiveShadow=true;
  // Four contoured, closed cardstock wings use the SAME printed image and UVs
  // as the distant relief, with real depth and exposed corrugated edge faces.
  const wingPrint=ownMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',fog:false,vertexColors:true,transparent:true,depthWrite:false,alphaTest:.025}));wingPrint.userData.grade=.14;wingPrint.normalScale.setScalar(.18);wingPrint.aoMapIntensity=.34;wingPrint.emissive.set('#ffffff');wingPrint.emissiveIntensity=.19;
  const wingEdge=bindSurface(ownMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,transparent:true,depthWrite:false,alphaTest:.025})),'corrugation');
  const wings=[];
  for(const near of[false,true])for(const side of[-1,1]){
    const panel=mesh(plane,[wingPrint,wingEdge]);panel.castShadow=false;panel.receiveShadow=true;panel.visible=false;
    panel.userData={near,side};wings.push(panel);
  }
  function fromData(data){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));geometry.setIndex(new THREE.BufferAttribute(data.indices,1));if(data.colors)geometry.setAttribute('color',new THREE.BufferAttribute(data.colors,4));
    for(const group of data.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
    geometry.computeVertexNormals();geometry.computeBoundingSphere();return ownGeometry(geometry);
  }
  function prepareRealmRelief(texture){
    const key=texture.image;
    if(realmGeometryCache.has(key)){const found=realmGeometryCache.get(key);realmGeometryCache.delete(key);realmGeometryCache.set(key,found);return found;}
    const scan=document.createElement('canvas');scan.width=192;scan.height=108;const c=scan.getContext('2d',{willReadFrequently:true});c.drawImage(texture.image,0,0,192,108);const image=c.getImageData(0,0,192,108);
    const relief=paperReliefData(image),wingData=wings.map(p=>paperWingData(image,p.userData));
    const sceneDepth=[...relief.positions.filter((_,i)=>i%3===2)].map(z=>z-20);for(const data of wingData)for(let i=2;i<data.positions.length;i+=3)sceneDepth.push(data.positions[i]);
    const depthSpan=Math.max(...sceneDepth)-Math.min(...sceneDepth);
    const value={relief:fromData(relief),wings:wingData.map(fromData),reliefVertices:relief.positions.length/3,depthRange:relief.depthRange,depthSpan,sourceWidth:texture.image.width,sourceHeight:texture.image.height};realmGeometryCache.set(key,value);
    while(realmGeometryCache.size>5){const oldest=realmGeometryCache.keys().next().value,entry=realmGeometryCache.get(oldest);for(const geometry of[entry.relief,...entry.wings]){geometry.dispose();geometryPool.delete(geometry);}realmGeometryCache.delete(oldest);}
    return value;
  }
  function applyRealmDepth(){
    backdrop.geometry=depthEnabled&&currentRelief?currentRelief.relief:plane;backdrop.scale.set(depthEnabled?1:72,depthEnabled?1:40.5,1);
    for(let n=0;n<wings.length;n++){wings[n].visible=depthEnabled&&!!currentRelief;if(currentRelief)wings[n].geometry=currentRelief.wings[n];}
  }

  const stands=[];
  const standMaterials=[];
  for(let n=0;n<6;n++){
    const material=ownMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',transparent:false,alphaTest:.22,side:THREE.DoubleSide}));
    const value=mesh(plane,material);value.castShadow=true;value.receiveShadow=true;value.visible=false;
    stands.push(value);standMaterials.push(material);
  }
  const scraps=new THREE.InstancedMesh(foldGeo,faded,16);scraps.frustumCulled=false;scene.add(scraps);
  const scratch=new THREE.Object3D();
  let currentConfig={seed:1,phase:0,theme:'stone'},atlasReady=false,printedPaper=false;
  const hash=value=>{let seed=2166136261;for(let n=0;n<value.length;n++){seed^=value.charCodeAt(n);seed=Math.imul(seed,16777619);}return seed>>>0;};
  const fraction=(seed,offset)=>{let x=(seed+Math.imul(offset+1,2654435761))>>>0;x^=x>>>16;x=Math.imul(x,2246822507);x^=x>>>13;return(x>>>0)/4294967296;};
  const nature=new Set(['mothlight','rhythm','maze','hollow-horde','tower-relay','gullet-gala']);
  const workshop=new Set(['inkfall','sweep','gallery','relic-launch','spark-heist','fuse-festival','bellows-boxing']);
  const celestial=new Set(['trace','meteor-melee','rift-ball','raft','colossus-wake']);

  function realmTexture(id){
    const im=id==='world'?art.world||art.city:art['scene-'+id]||art.world||art.city;
    if(!im?.width)return null;
    const cacheKey=im;
    if(texturePool.has(cacheKey)){const found=texturePool.get(cacheKey);texturePool.delete(cacheKey);texturePool.set(cacheKey,found);return found;}
    const texture=new THREE.Texture(im);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
    texturePool.set(cacheKey,texture);
    // Thumbnails visit many realms in succession; keep GPU image memory bounded.
    while(texturePool.size>5){const oldest=texturePool.keys().next().value;texturePool.get(oldest).dispose();texturePool.delete(oldest);}
    return texture;
  }
  function atlasTexture(name,col,row,cols,rows){
    const im=art[name];if(!im?.width)return null;
    const key=[name,col,row,cols,rows].join(':');if(atlasTextures.has(key))return atlasTextures.get(key);
    const crop=document.createElement('canvas'),cellW=im.width/cols,cellH=im.height/rows;
    crop.width=Math.min(640,Math.round(cellW));crop.height=Math.max(1,Math.round(crop.width*cellH/cellW));
    const c=crop.getContext('2d');if(!c)return null;
    c.drawImage(im,col*cellW,row*cellH,cellW,cellH,0,0,crop.width,crop.height);
    const texture=new THREE.CanvasTexture(crop);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;atlasTextures.set(key,texture);return texture;
  }
  function paperSurfaces(){
    if(printedPaper)return;
    const sign=atlasTexture('paper-objects',0,2,3,3),platform=art['paper-platforms'];
    if(!sign||!platform)return;
    const grainCanvas=document.createElement('canvas');grainCanvas.width=128;grainCanvas.height=128;
    // Sample the generated sign's unlettered paper center, retaining its fibers.
    grainCanvas.getContext('2d').drawImage(sign.image,sign.image.width*.26,sign.image.height*.35,sign.image.width*.42,sign.image.height*.25,0,0,128,128);
    const grain=new THREE.CanvasTexture(grainCanvas);grain.colorSpace=THREE.SRGBColorSpace;grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(3,3);atlasTextures.set('generated-paper-grain',grain);
    for(const material of [paper,pale,faded,accent,ink]){material.map=grain;material.needsUpdate=true;}
    const edgeCanvas=document.createElement('canvas');edgeCanvas.width=512;edgeCanvas.height=32;
    edgeCanvas.getContext('2d').drawImage(platform,platform.width*.075,platform.height*.042,platform.width*.85,platform.height*.019,0,0,512,32);
    const corrugation=new THREE.CanvasTexture(edgeCanvas);corrugation.colorSpace=THREE.SRGBColorSpace;corrugation.wrapS=THREE.RepeatWrapping;corrugation.repeat.set(2,1);atlasTextures.set('generated-card-edge',corrugation);edge.map=corrugation;edge.needsUpdate=true;wingEdge.map=corrugation;wingEdge.needsUpdate=true;
    printedPaper=true;
  }
  function printedMetalMask(texture,type='trim'){
    const key='printed-metal:'+type+':'+texture.uuid;if(atlasTextures.has(key))return atlasTextures.get(key);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const c=canvas.getContext('2d');c.drawImage(texture.image,0,0,128,128);const image=c.getImageData(0,0,128,128),source=new Uint8ClampedArray(image.data);
    const luma=(x,y)=>{const i=(Math.max(0,Math.min(127,y))*128+Math.max(0,Math.min(127,x)))*4;return(source[i]*.2126+source[i+1]*.7152+source[i+2]*.0722)/255;};
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const i=(y*128+x)*4,l=luma(x,y),gradient=Math.abs(luma(x+1,y)-luma(x-1,y))+Math.abs(luma(x,y+1)-luma(x,y-1));
      const onTrim=type==='foil'||Math.abs(x/128-.5)>.22||y<48;
      // Only printed edge ink and ornament gets metallic response. White stock
      // and transparent air remain exactly non-metallic.
      const value=source[i+3]>170&&onTrim&&l>.12&&l<.86?Math.min(.92,gradient*3.8+(type==='foil'?.3:0)):0;
      image.data[i]=image.data[i+1]=image.data[i+2]=value*255;image.data[i+3]=255;
    }
    c.putImageData(image,0,0);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.NoColorSpace;map.minFilter=THREE.LinearMipmapLinearFilter;atlasTextures.set(key,map);return map;
  }
  function cutoutGeometry(texture){
    if(cutoutGeometries.has(texture))return cutoutGeometries.get(texture);
    const scan=document.createElement('canvas');scan.width=64;scan.height=64;const c=scan.getContext('2d');c.drawImage(texture.image,0,0,64,64);
    const contours=paperAlphaContours(c.getImageData(0,0,64,64));
    if(contours.outer.length<3)return plane;
    const vector=points=>points.map(p=>new THREE.Vector2(...p)),shape=new THREE.Shape(vector(contours.outer));
    for(const hole of contours.holes)shape.holes.push(new THREE.Path(vector(hole)));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.11,bevelEnabled:false,curveSegments:1,steps:1});
    const position=geometry.attributes.position,uv=geometry.attributes.uv;for(let n=0;n<uv.count;n++)uv.setXY(n,position.getX(n)+.5,position.getY(n)+.5);
    geometry.userData={alphaOutline:true,holes:contours.holes.length,pixelArea:contours.pixelArea};ownGeometry(geometry);cutoutGeometries.set(texture,geometry);return geometry;
  }
  function applyStandees(seed){
    paperSurfaces();
    const portal=atlasTexture('paper-objects',1,1,3,3);
    if(portal){
      const geometry=cutoutGeometry(portal);
      for(const arch of arches){
        if(arch.frame.geometry!==geometry){
          const printed=bindSurface(ownMaterial(new THREE.MeshStandardMaterial({map:portal,color:'#dedbd3',alphaTest:.2,side:THREE.DoubleSide})),'paper',printedMetalMask(portal));
          arch.frame.geometry=geometry;arch.frame.material=[printed,edge];arch.frame.scale.set(4.1,9.8,5);
        }
        for(const child of arch.group.children)if(child!==arch.frame)child.visible=false;
      }
    }
    let count=0;
    // The printed fronts follow real extruded floating islands in three axes.
    for(let n=0;n<4;n++){
      const texture=atlasTexture('paper-platforms',0,(n+(seed%3))%4,1,4);
      if(!texture)continue;
      const value=stands[count],material=standMaterials[count];material.map=texture;bindSurface(material,'paper',printedMetalMask(texture));value.visible=true;
      for(const child of islands[n].group.children)child.visible=false;
      islands[n].group.add(value);value.visible=true;value.geometry=cutoutGeometry(texture);value.material=[material,edge];value.position.set(0,-.1,0);value.rotation.set(-.05,0,0);value.scale.set(4.55,1.65,4.2);count++;
    }
    // Dedicated generated paper objects are a 3×3 sheet, in reading order:
    // gauge, rope, altar; star, portal, pedestal; sign, crate, crown.
    // The original 4×3 prop sheet remains a temporary asset-loading fallback.
    const objectImage=art['paper-objects'];
    for(let n=0;n<2;n++){
      const choices=currentConfig.theme==='workshop'?[0,7]:currentConfig.theme==='grove'?[3,6]:currentConfig.theme==='astral'?[3,4]:[2,8];
      const index=objectImage?choices[n]:(seed+n*5)%12,columns=objectImage?3:4;
      const texture=atlasTexture(objectImage?'paper-objects':'props',index%columns,Math.floor(index/columns),columns,3);
      if(!texture)continue;
      const value=stands[count],material=standMaterials[count],side=n?-1:1;material.map=texture;bindSurface(material,'paper',printedMetalMask(texture,[0,3,8].includes(index)?'foil':'trim'));value.visible=true;
      scene.add(value);value.geometry=cutoutGeometry(texture);value.material=[material,edge];value.position.set(side*16.3,-3.5,n?-1.5:1.4);value.rotation.set(0,side*-.36,side*.05);value.scale.set(2.1,2.1,3.5);count++;
    }
    for(;count<stands.length;count++)stands[count].visible=false;
    atlasReady=!!art['paper-platforms']||!!art.props||!!art['paper-objects'];
  }
  function configure(id){
    const seed=hash(id),theme=nature.has(id)?'grove':workshop.has(id)?'workshop':celestial.has(id)?'astral':'cathedral';
    currentConfig={seed,theme,phase:fraction(seed,0)*Math.PI*2};
    const map=realmTexture(id);if(!map)return false;
    backdropMaterial.map=map;backdropMaterial.emissiveMap=map;backdropMaterial.needsUpdate=true;wingPrint.map=map;wingPrint.emissiveMap=map;wingPrint.needsUpdate=true;
    currentRelief=prepareRealmRelief(map);applyRealmDepth();
    const palette=paperPalette(id);paper.color.set(palette.paper);pale.color.set(palette.paper);faded.color.set(palette.bounce);edge.color.set(palette.edge);wingEdge.color.set(palette.edge);ink.color.set(palette.ink);accent.color.set(palette.accent);scene.background.set(palette.ambient);scene.fog.color.set(palette.ambient);
    const board=id==='world';
    for(let n=0;n<arches.length;n++){
      const side=n%2?-1:1,far=n>=2,arch=arches[n],heightScale=(far?.62:.97)*(theme==='workshop'?.82:theme==='astral'?1.08:1);
      arch.group.position.set(side*(far?21.0:17.15)+(fraction(seed,n+1)-.5)*.50,far?.1:-.1,far?-8.5:2.3);
      arch.group.scale.set(far?.92:board?1.15:1.25,heightScale,far?.75:1);arch.group.rotation.y=-side*(far?.34:.57);arch.group.rotation.z=side*(.014+fraction(seed,n+5)*.018);
      arch.baseY=arch.group.position.y;arch.phase=fraction(seed,n+10)*Math.PI*2;
    }
    for(let n=0;n<islands.length;n++){
      const side=n%2?-1:1,island=islands[n];island.group.position.set(side*(9.7+fraction(seed,n+17)*2.8),2.8+fraction(seed,n+24)*4.6,-8-n*2.8);
      const scale=.62+fraction(seed,n+30)*.44;island.group.scale.set(scale,scale,scale);island.group.rotation.y=(fraction(seed,n+34)-.5)*1.7;island.group.rotation.z=side*.03;
      island.baseY=island.group.position.y;island.phase=fraction(seed,n+39)*Math.PI*2;
    }
    stage.position.y=board?-10.6:-10.2;
    applyStandees(seed);renderer.shadowMap.needsUpdate=true;lastId=id;lastTime=-1;return true;
  }

  function updateLighting(profile,time,force){
    const color=(target,value,fallback)=>target.color.set(typeof value==='string'?value:fallback);
    if(features.lighting){
      color(ambient,profile.ambient?.color,'#dedbd1');ambient.intensity=clamp(profile.ambient?.intensity??.56,.1,1.5)*3.1;
      for(const [light,data,factor] of [[sun,profile.key,2.7],[fill,profile.fill,1.8]]){
        color(light,data?.color,'#eee9df');light.intensity=clamp(data?.intensity??.6,0,3)*factor;
        light.position.set((clamp(data?.x??240,-960,1920)-480)/24,(270-clamp(data?.y??80,-540,1080))/24,clamp(data?.z??400,40,1400)/24);
      }
      for(let n=0;n<points.length;n++){
        const light=points[n],data=profile.points?.[n];light.visible=!!data;
        if(!data){light.intensity=0;continue;}
        color(light,data.color,'#eee8dc');light.position.set((clamp(data.x,-960,1920)-480)/24,(270-clamp(data.y,-540,1080))/24,clamp(data.z??120,-300,1000)/24);
        light.intensity=clamp(data.intensity,0,4)*44;light.distance=clamp(data.radius??280,40,1600)/24*2.4;
      }
      scene.environmentIntensity=.68;
    }else{
      ambient.color.set('#e5e5e3');ambient.intensity=2.1;sun.intensity=0;fill.intensity=0;for(const point of points){point.intensity=0;point.visible=false;}scene.environmentIntensity=.35;
    }
    // Directional shadows follow changing realm lights at a bounded cadence.
    if(force||time<lastShadowTime||time-lastShadowTime>=.15){renderer.shadowMap.needsUpdate=true;lastShadowTime=time;}
  }
  function setDepth(enabled=true){depthEnabled=!!enabled;applyRealmDepth();lastTime=-1;renderer.shadowMap.needsUpdate=true;return depthEnabled;}
  function setFeatures(next={}){
    let changed=false;for(const key of Object.keys(features))if(typeof next[key]==='boolean'&&features[key]!==next[key]){features[key]=next[key];changed=true;}
    if(changed){for(const material of materialPool)applyFeatures(material);lastTime=-1;lastLightingKey='';renderer.shadowMap.needsUpdate=true;}
    return {...features};
  }
  function draw(ctx,id='world',time=0,w=960,h=540,lightingProfile=null){
    if(disposed||lost||!ctx?.drawImage||!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return false;
    if(!Number.isFinite(time))time=0;id=String(id||'world');
    try{
      const targetWidth=Math.max(1,Math.min(960,Math.round(w))),targetHeight=Math.max(1,Math.min(540,Math.round(h)));
      let resized=false;if(targetWidth!==width||targetHeight!==height){width=targetWidth;height=targetHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();resized=true;}
      if(id!==lastId&&!configure(id))return false;
      if(!atlasReady&&(art['paper-platforms']||art.props||art['paper-objects']))applyStandees(currentConfig.seed);
      const profile=lightingProfile||sceneLighting({id,time}),lightingKey=JSON.stringify([profile.ambient,profile.key,profile.fill,profile.points]);
      if(time!==lastTime||resized||lightingKey!==lastLightingKey){
        updateLighting(profile,time,lastTime<0||resized);
        const phase=currentConfig.phase;
        camera.position.set(Math.sin(time*.14+phase)*.82,4.45+Math.sin(time*.11+phase)*.23,26.1+Math.cos(time*.10+phase)*.13);
        camera.lookAt(Math.sin(time*.095+phase)*.15,1.72,-2.0);
        for(const island of islands){island.group.position.y=island.baseY+Math.sin(time*.63+island.phase)*.16;island.group.rotation.x=Math.sin(time*.34+island.phase)*.035;}
        for(const arch of arches)arch.fold.rotation.z=Math.sin(time*.68+arch.phase)*.025;
        for(let n=0;n<16;n++){
          const seed=currentConfig.seed,side=n%2?-1:1;
          scratch.position.set(side*(11+fraction(seed,n+60)*5),((fraction(seed,n+85)*18-time*(.10+fraction(seed,n+99)*.11)+18)%18)-5,-8+fraction(seed,n+115)*13);
          scratch.rotation.set(time*.11+n*.5,time*.13+n*.6,time*.22+n);const scale=.035+fraction(seed,n+133)*.05;scratch.scale.setScalar(scale);scratch.updateMatrix();scraps.setMatrixAt(n,scratch.matrix);
        }
        scraps.instanceMatrix.needsUpdate=true;
        renderer.render(scene,camera);frames++;lastTime=time;lastLightingKey=lightingKey;lastCalls=renderer.info.render.calls;lastTriangles=renderer.info.render.triangles;maxCalls=Math.max(maxCalls,lastCalls);
      }
      ctx.drawImage(canvas,0,0,w,h);return true;
    }catch(error){shaderErrors.push({runtime:String(error?.message||error)});lost=true;return false;}
  }
  function dispose(){
    if(disposed)return;disposed=true;
    for(const texture of texturePool.values())texture.dispose();for(const texture of atlasTextures.values())texture.dispose();
    for(const geometry of geometryPool)geometry.dispose();for(const material of materialPool)material.dispose();
    texturePool.clear();atlasTextures.clear();realmGeometryCache.clear();currentRelief=null;environmentTarget.dispose();scene.environment=null;scene.clear();renderer.dispose();renderer.forceContextLoss();canvas.width=1;canvas.height=1;
  }
  return {draw,dispose,setFeatures,setDepth,get stats(){const active=[...materialPool].filter(m=>m.isMeshStandardMaterial);let texturedMeshes=0,untexturedMeshes=0;scene.traverseVisible(node=>{if(node.isMesh){const materials=Array.isArray(node.material)?node.material:[node.material];if(materials.every(m=>!!m.map))texturedMeshes++;else untexturedMeshes++;}});return {available:!disposed&&!lost,frames,calls:lastCalls,maxCalls,triangles:lastTriangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,cachedRealmTextures:texturePool.size,lastId,width,height,features:{...features},materials:{pbr:active.length,normalMapped:active.filter(m=>m.normalMap).length,aoMapped:active.filter(m=>m.aoMap).length,roughnessMapped:active.filter(m=>m.roughnessMap).length,metalnessMapped:active.filter(m=>m.metalnessMap&&m.metalness>0).length,paperMetalness:paper.metalness},materialMaps:{ready:!disposed,size:measuredMaps.size,kinds:['paper','corrugation','foil'],colorSpace:'linear'},dynamicLights:features.lighting?2+points.filter(p=>p.visible&&p.intensity>0).length:0,diorama:{depthEnabled,depthLayers:depthEnabled?5:1,reliefVertices:depthEnabled?currentRelief?.reliefVertices||0:0,contourMeshes:depthEnabled?wings.filter(p=>p.visible).length:0,texturedMeshes,untexturedMeshes,geometryDepth:depthEnabled?currentRelief?.depthSpan||0:0,cachedRealms:realmGeometryCache.size,alphaExtrusions:cutoutGeometries.size,cutoutHoles:[...cutoutGeometries.values()].reduce((sum,g)=>sum+(g.userData.holes||0),0),portalHoles:cutoutGeometries.get(atlasTextures.get('paper-objects:1:1:3:3'))?.userData.holes||0,sourceWidth:currentRelief?.sourceWidth||0,sourceHeight:currentRelief?.sourceHeight||0,palette:paperPalette(lastId).id},shaderErrors:[...shaderErrors]};}};
}
