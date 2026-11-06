// Prepare the current mathematical surface for Apple AR Quick Look.
// USDZ is generated locally; no equation or camera data is uploaded.
import * as THREE from 'three';
import {USDZExporter} from 'three/addons/exporters/USDZExporter.js';
import {palettePixels} from './mobile-colors.mjs';

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
export async function exportSurfaceUSDZ(mesh){
  const scene=surfaceToThreeScene(mesh);
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
