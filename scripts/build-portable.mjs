import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'AFTERLIGHT.html');
const assetManifest=JSON.parse(await readFile(path.join(root,'assets-manifest.json'),'utf8'));
if(!Array.isArray(assetManifest.images)||assetManifest.images.length===0)throw new Error('Expected a nonempty generated image asset list in assets-manifest.json');
if(new Set(assetManifest.images.map(image=>image.name)).size!==assetManifest.images.length)throw new Error('Duplicate asset name');
const fontDir=path.join(root,'public','fonts');
await mkdir(fontDir,{recursive:true});
// Keep the portable stylesheet in the same order as the browser entry point.
const cssImports=[...((await readFile(path.join(root,'src/main.js'),'utf8')).matchAll(/^import\s+['"](.+\.css)['"];?$/gm))].map(match=>match[1]);
if(!cssImports.length)throw new Error('No entry stylesheets found');
let css=(await Promise.all(cssImports.map(file=>readFile(path.resolve(root,'src',file),'utf8')))).join('\n');
const fontImport=css.match(/@import\s+url\(['"]([^'"]+)['"]\);/);
let fontCSS='';
if(fontImport){
 const cache=path.join(fontDir,'portable-fonts.css'),cacheSource=path.join(fontDir,'portable-fonts.source.json');
 try{const source=JSON.parse(await readFile(cacheSource,'utf8'));if(source.url!==fontImport[1])throw new Error('Font import changed');fontCSS=await readFile(cache,'utf8')}catch{
  const response=await fetch(fontImport[1],{headers:{'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'}});
  if(!response.ok)throw new Error('Font stylesheet download failed: '+response.status);
  const remoteCSS=await response.text();
  // Embed Latin ranges used by the interface; system fallbacks cover rare symbols.
  const blocks=remoteCSS.split('}').map(b=>b+'}').filter(b=>/\/\* latin \*\//.test(b));
  if(!blocks.length)throw new Error('No Latin font faces returned');
  fontCSS=blocks.join('\n');
  const urls=[...new Set([...fontCSS.matchAll(/url\((https:[^)]+)\)/g)].map(m=>m[1]))];
  for(const url of urls){
   const r=await fetch(url);if(!r.ok)throw new Error('Font download failed: '+r.status);
   const bytes=Buffer.from(await r.arrayBuffer()),name=createHash('sha256').update(url).digest('hex').slice(0,16)+'.woff2';
   await writeFile(path.join(fontDir,name),bytes);fontCSS=fontCSS.replaceAll(url,name);
  }
  await writeFile(cache,fontCSS);
  await writeFile(cacheSource,JSON.stringify({url:fontImport[1]},null,2)+'\n');
 }
 const urls=[...new Set([...fontCSS.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1]))];
 for(const name of urls){if(name.startsWith('https:'))throw new Error('Remote font remained in cache');const bytes=await readFile(path.join(fontDir,name));fontCSS=fontCSS.replaceAll(name,'data:font/woff2;base64,'+bytes.toString('base64'))}
 css=css.replace(fontImport[0],()=>fontCSS);
}
const assets={};
const imageFiles={};
let embeddedImageBytes=0;
for(const {name,file,mime} of assetManifest.images){
 if(!/^[a-z0-9-]+$/.test(name)||path.basename(file)!==file||!['image/png','image/webp'].includes(mime))throw new Error('Invalid image manifest entry: '+name);
 const bytes=await readFile(path.join(root,'public/assets',file));
 if(!bytes.length)throw new Error('Empty asset: '+file);
 assets[name]=`data:${mime};base64,`+bytes.toString('base64');
 imageFiles[name]=file;embeddedImageBytes+=bytes.length;
 const escaped=file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const sourceURL=new RegExp(`url\\(\\s*(['"]?)(?:\\/|\\.\\/)?assets\\/${escaped}\\1\\s*\\)`,'g');
 css=css.replace(sourceURL,()=>`var(--afterlight-${name})`);
}
if(/url\(\s*['"]?(?:\/|\.\/)?assets\//.test(css))throw new Error('A CSS asset was not included in assets-manifest.json');
const result=await build({absWorkingDir:root,entryPoints:['src/main.js'],bundle:true,write:false,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'inline',define:{'import.meta.env.BASE_URL':JSON.stringify('./')},loader:{'.css':'empty'}});
const js=result.outputFiles[0].text;
if(/^\s*import\s/m.test(js))throw new Error('Unexpected external import');
const escapeScript=s=>s.replace(/<\/script/gi,'<\\/script');
// Decode each embedded image once. Short Blob URLs avoid huge CSS variable values,
// keep CSS parsing reliable, and give both Image() and CSS the same local resource.
const assetBootstrap=String.raw`(()=>{
 const node=document.getElementById('afterlight-embedded-art');
 const embedded=JSON.parse(node.textContent),local=Object.create(null);
 for(const [name,uri]of Object.entries(embedded)){
  const comma=uri.indexOf(','),header=uri.slice(0,comma),mime=header.slice(5,header.indexOf(';'));
  const decoded=atob(uri.slice(comma+1)),bytes=new Uint8Array(decoded.length);
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}));
  local[name]=url;document.documentElement.style.setProperty('--afterlight-'+name,'url("'+url+'")');
 }
 window.AFTERLIGHT_ASSETS=local;
 node.remove();
})();`;
let html=await readFile(path.join(root,'index.html'),'utf8');
html=html.replace(/<script\b[^>]*\bsrc="\/src\/main\.js"[^>]*><\/script>/,()=>`<script type="application/json" id="afterlight-embedded-art">${JSON.stringify(assets)}</script>\n<script>${assetBootstrap}</script>\n<script type="module">${escapeScript(js)}</script>`);
html=html.replace('</head>',()=>`<style>${css.replace(/<\/style/gi,'<\\/style')}</style></head>`);
if((html.match(/<!doctype html>/gi)||[]).length!==1)throw new Error('HTML wrapper corrupted');
if(/<script\b[^>]*\bsrc\s*=|<link\b[^>]*rel="stylesheet"|@import\s/.test(html))throw new Error('External runtime asset remains');
await writeFile(out,html);
const manifest={file:'AFTERLIGHT.html',bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),embeddedImages:Object.keys(assets),embeddedImageFiles:imageFiles,embeddedImageBytes,imageRuntimeURLs:'blob',embeddedFonts:[...new Set([...fontCSS.matchAll(/data:font\/woff2;base64,([^)]*)/g)].map(m=>m[1]))].length,createdAt:new Date().toISOString()};
await mkdir(path.join(root,'verification'),{recursive:true});
await writeFile(path.join(root,'verification/portable-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
