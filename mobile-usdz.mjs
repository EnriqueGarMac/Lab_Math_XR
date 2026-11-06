// Prepare the current mathematical surface for Apple AR Quick Look.
// USDZ is generated locally; no equation or camera data is uploaded.
import * as THREE from 'three';
import {USDZExporter} from 'three/addons/exporters/USDZExporter.js';

// Bundled iPhone helpers prevent Safari's dynamic import from failing when
// GitHub Pages briefly serves different revisions of dependent .mjs files.
// Colour gradient used by both the desktop math shader and the iPhone USDZ texture.
// A colour texture is used instead of USDZ vertex colours (unreliable in Quick Look).
const PALETTES = Object.freeze([
  [[.12,.47,.74],[.27,.80,.76],[.98,.47,.31]],
  [[.04,.47,.57],[.30,.76,.70],[1,.75,.38]],
  [[.43,.29,.81],[.73,.48,.87],[.99,.58,.70]],
  [[.25,.47,.64],[.40,.68,.78],[.68,.86,.90]]
]);
function paletteRGB(palette,value){
  const stops=PALETTES[palette]||PALETTES[0];
  const t=Math.max(0,Math.min(1,Number(value)||0));
  const group=t<.5?0:1,weight=t<.5?t*2:(t-.5)*2;
  return stops[group].map((channel,i)=>channel*(1-weight)+stops[group+1][i]*weight);
}
function palettePixels(palette,width=512){
  const arr=new Uint8ClampedArray(width*4);
  for(let j=0;j<width;j++){
    const col=paletteRGB(palette,j/(width-1));
    for(let i=0;i<3;i++)arr[j*4+i]=Math.round(col[i]*255);
    arr[j*4+3]=255;
  }
  return arr;
}

// Generate an optional soft shadow as a textured decal at y=0 in the USDZ.
// This is a STATIC projection attached to the 3D asset, not real-world
// lighting. Quick Look sometimes omits its own automatic contact shadow.
function projectOntoGround(x,y,z,lightX=.34,lightZ=.27){
  return [x-y*lightX,z-y*lightZ];
}
function computeShadowFootprint(scene){
  scene.updateMatrixWorld(true);
  const verts=[];
  let count=0;
  const min=[Infinity,Infinity],max=[-Infinity,-Infinity];
  scene.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.visible||mesh.userData.isBakedShadow)return;
    const position=mesh.geometry?.getAttribute('position');
    if(!position)return;
    const samples=new Float32Array(position.count*2);
    const p=new THREE.Vector3();
    for(let i=0;i<position.count;i++){
      p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      const [x,z]=projectOntoGround(p.x,p.y,p.z);
      samples[2*i]=x;samples[2*i+1]=z;
      min[0]=Math.min(min[0],x);max[0]=Math.max(max[0],x);
      min[1]=Math.min(min[1],z);max[1]=Math.max(max[1],z);
    }
    verts.push({samples,index:mesh.geometry.index});
    count+=mesh.geometry.index?.count??position.count;
  });
  if(!verts.length||!Number.isFinite(min[0]))return null;
  const rawW=Math.max(.01,max[0]-min[0]),rawD=Math.max(.01,max[1]-min[1]);
  const pad=Math.max(.07,Math.max(rawW,rawD)*.10);
  return {verts,count,min,max,
    left:min[0]-pad,right:max[0]+pad,
    top:min[1]-pad,bottom:max[1]+pad};
}
function createBakedShadow(scene,{size=384,opacity=.42}={}){
  const footprint=computeShadowFootprint(scene);
  if(!footprint)return null;
  const width=footprint.right-footprint.left;
  const depth=footprint.bottom-footprint.top;
  const mask=document.createElement('canvas');
  mask.width=mask.height=size;
  const ctx=mask.getContext('2d');
  const result=document.createElement('canvas');
  result.width=result.height=size;
  const out=result.getContext('2d');
  if(!ctx||!out)throw Error('Canvas no disponible para generar la sombra.');
  ctx.fillStyle='#ffffff';
  const cx=x=>(x-footprint.left)/width*size;
  const cy=z=>(z-footprint.top)/depth*size;
  for(const {samples,index} of footprint.verts){
    const indexCount=index?.count??samples.length/2;
    for(let i=0;i+2<indexCount;i+=3){
      const a=index?index.getX(i):i;
      const b=index?index.getX(i+1):i+1;
      const c=index?index.getX(i+2):i+2;
      ctx.beginPath();
      ctx.moveTo(cx(samples[2*a]),cy(samples[2*a+1]));
      ctx.lineTo(cx(samples[2*b]),cy(samples[2*b+1]));
      ctx.lineTo(cx(samples[2*c]),cy(samples[2*c+1]));
      ctx.closePath();ctx.fill();
    }
  }
  // Semi-transparent charcoal pixels surrounded by a feathered penumbra.
  // The diffuse colour remains close to neutral under AR Quick Look lighting.
  out.globalAlpha=Math.max(0,Math.min(1,opacity));
  out.filter='blur(6px)';
  out.drawImage(mask,0,0);
  out.globalAlpha=1;out.filter='none';
  out.globalCompositeOperation='source-in';
  out.fillStyle='#17222a';
  out.fillRect(0,0,size,size);
  out.globalCompositeOperation='source-over';
  const texture=new THREE.CanvasTexture(result);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({
    color:0xffffff,map:texture,transparent:true,opacity:1,
    metalness:0,roughness:1,depthWrite:false,
    side:THREE.FrontSide
  });
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),material);
  shadow.rotation.x=-Math.PI/2;
  shadow.position.set((footprint.left+footprint.right)/2,.003,
    (footprint.top+footprint.bottom)/2);
  shadow.name='Sombra virtual suave / Soft ground shadow';
  shadow.userData.isBakedShadow=true;
  scene.add(shadow);
  return shadow;
}


// Quick Look has inconsistent support for imported vertex colours. Bake the
// same continuous heat palette into a tiny PNG texture using vertex UVs.
export function makePaletteTexture(palette=0,width=512){
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=4;
  const ctx=canvas.getContext('2d',{willReadFrequently:false});
  if(!ctx)throw Error('Canvas 2D no disponible para preparar los colores.');
  const image=ctx.createImageData(width,4);
  const pixels=palettePixels(palette,width);
  for(let y=0;y<4;y++)image.data.set(pixels,y*width*4);
  ctx.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearFilter;
  texture.wrapS=THREE.ClampToEdgeWrapping;
  texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.needsUpdate=true;
  return texture;
}
export function surfaceToThreeScene({positions,indices,heat,palette=0}){
  if(!positions?.length||!indices?.length||!heat?.length)
    throw new Error('No hay una superficie válida para exportar.');
  if(positions.length!==heat.length*3)
    throw new Error('La malla y los colores tienen tamaños incompatibles.');
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  const uvs=new Float32Array(heat.length*2);
  for(let i=0;i<heat.length;i++){
    uvs[i*2]=Math.min(1,Math.max(0,Number(heat[i])||0));
    uvs[i*2+1]=.5;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
  geometry.computeVertexNormals();
  const bounds=new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
  const center=bounds.getCenter(new THREE.Vector3());
  const model=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
    color:0xffffff,map:makePaletteTexture(palette),vertexColors:false,
    roughness:.76,metalness:0,side:THREE.DoubleSide
  }));
  model.castShadow=true;
  // The model rests on y=0; iOS Quick Look creates the real-world
  // contact shadow and ground plane automatically.
  model.scale.setScalar(.52);
  model.position.set(-center.x*.52,-bounds.min.y*.52,-center.z*.52);
  const scene=new THREE.Scene();scene.add(model);
  return scene;
}
export async function exportSurfaceUSDZ(mesh,options={}){
  const scene=surfaceToThreeScene(mesh);
  if(options.includeShadow!==false)createBakedShadow(scene);
  try{
    const buffer=await new USDZExporter().parseAsync(scene,{
      quickLookCompatible:true,
      ar:{anchoring:{type:'plane'},planeAnchoring:{alignment:'horizontal'}},
      maxTextureSize:512
    });
    return new Blob([buffer],{type:'model/vnd.usdz+zip'});
  }finally{
    scene.traverse(o=>{
      o.geometry?.dispose();
      if(o.material){
        (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
          m.map?.dispose();m.dispose();
        });
      }
    });
  }
}
