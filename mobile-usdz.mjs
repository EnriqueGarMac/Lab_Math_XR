// Prepare the current mathematical surface for Apple AR Quick Look.
// USDZ is generated on-device; no equation or camera data is uploaded.
import * as THREE from 'three';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

export function surfaceToThreeScene({positions,indices,heat,palette=0}){
  if(!positions?.length||!indices?.length)throw new Error('No hay una superficie válida para exportar.');
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  const stops=[
    [[.12,.47,.74],[.27,.80,.76],[.98,.47,.31]],
    [[.04,.47,.57],[.30,.76,.70],[1,.75,.38]],
    [[.43,.29,.81],[.73,.48,.87],[.99,.58,.70]],
    [[.25,.47,.64],[.40,.68,.78],[.68,.86,.90]]
  ][palette]||[[.12,.47,.74],[.27,.80,.76],[.98,.47,.31]];
  const color=new Float32Array(heat.length*3);
  for(let i=0;i<heat.length;i++){
    const t=Math.min(1,Math.max(0,heat[i])),region=t<.5?0:1,k=t<.5?t*2:(t-.5)*2;
    const c=new THREE.Color().setRGB(
      stops[region][0]*(1-k)+stops[region+1][0]*k,
      stops[region][1]*(1-k)+stops[region+1][1]*k,
      stops[region][2]*(1-k)+stops[region+1][2]*k,THREE.SRGBColorSpace);
    color.set([c.r,c.g,c.b],i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(color,3));
  geometry.computeVertexNormals();
  const bounds=new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
  const center=bounds.getCenter(new THREE.Vector3());
  const model=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
    vertexColors:true,roughness:.75,metalness:0,side:THREE.DoubleSide
  }));
  // AR Quick Look anchors the object on the detected plane; it must rest on y=0.
  model.scale.setScalar(.52);
  model.position.set(-center.x*.52,-bounds.min.y*.52,-center.z*.52);
  const scene=new THREE.Scene();
  scene.add(model);
  return scene;
}
export async function exportSurfaceUSDZ(mesh,options={}){
  const scene=surfaceToThreeScene(mesh);
  try{
    const exporter=new USDZExporter();
    const buffer=await exporter.parseAsync(scene,{
      quickLookCompatible:true,
      ar:{anchoring:{type:'plane'},planeAnchoring:{alignment:'horizontal'}},
      maxTextureSize:512
    });
    return new Blob([buffer],{type:'model/vnd.usdz+zip'});
  }finally{
    scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
}
