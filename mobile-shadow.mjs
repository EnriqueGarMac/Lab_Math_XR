import * as THREE from 'three';

// Generate an optional soft shadow as a textured decal at y=0 in the USDZ.
// This is a STATIC projection attached to the 3D asset, not real-world
// lighting. Quick Look sometimes omits its own automatic contact shadow.
export function projectOntoGround(x,y,z,lightX=.34,lightZ=.27){
  return [x-y*lightX,z-y*lightZ];
}
export function computeShadowFootprint(scene){
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
export function createBakedShadow(scene,{size=384,opacity=.42}={}){
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
