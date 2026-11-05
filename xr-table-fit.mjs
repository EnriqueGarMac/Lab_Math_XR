// Optional WebXR plane-detection table sizing (hit-test alone has no dimensions).
// The functions below are independent of the browser and do not access camera data.
export function fitScaleFromWidth(width, margin=0.72, footprint=2.4) {
  if(!Number.isFinite(width)||width<=0)return null;
  const scale=width*margin/footprint;
  // Never silently enlarge a very small tabletop beyond its measured width.
  return scale<0.08?null:Math.min(1.35,scale);
}
export function measureShortEdge(a,b) {
  if(!a?.point||!b?.point||Math.abs(a.point[1]-b.point[1])>0.12)return null;
  if(a.normal?.[1]<0.7||b.normal?.[1]<0.7)return null;
  const width=Math.hypot(a.point[0]-b.point[0],a.point[2]-b.point[2]);
  return width>=0.25&&width<=3.0?width:null;
}
export function pointInPolygon(x,z,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
function distSegment(x,z,a,b){
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}
function localFromWorld(point,m) {
  // XRPlane pose is an orthonormal rigid transform, so transpose its rotation.
  const diff=[point[0]-m[12],point[1]-m[13],point[2]-m[14]];
  return {x:diff[0]*m[0]+diff[1]*m[1]+diff[2]*m[2],
          z:diff[0]*m[8]+diff[1]*m[9]+diff[2]*m[10]};
}
function worldFromLocal(x,z,m) {
  return [m[12]+x*m[0]+z*m[8],m[13]+x*m[1]+z*m[9],m[14]+x*m[2]+z*m[10]];
}
export function tableFromPlane(polygon,poseMatrix,hitPoint,label='') {
  if(!polygon||polygon.length<3||!poseMatrix||!hitPoint)return null;
  const yaxis=[poseMatrix[4],poseMatrix[5],poseMatrix[6]];
  if(Math.abs(yaxis[1])<0.84)return null; // reject vertical planes
  const semantic=String(label||'').toLowerCase();
  if(/floor|wall|ceiling|door|window/.test(semantic))return null;
  const poly=polygon.map(p=>({x:Number(p.x),z:Number(p.z)}));
  if(poly.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)))return null;
  const xs=poly.map(p=>p.x),zs=poly.map(p=>p.z);
  const width=Math.max(...xs)-Math.min(...xs);
  const depth=Math.max(...zs)-Math.min(...zs);
  // Limit to tabletop-like surfaces; never auto-fit to an entire floor.
  if(width<0.20||depth<0.20||width>3.0||depth>2.4)return null;
  const hit=localFromWorld(hitPoint,poseMatrix);
  if(!pointInPolygon(hit.x,hit.z,poly))return null;
  const center={x:(Math.max(...xs)+Math.min(...xs))/2,z:(Math.max(...zs)+Math.min(...zs))/2};
  if(!pointInPolygon(center.x,center.z,poly)){
    center.x=hit.x;center.z=hit.z;
  }
  const clearance=Math.min(...poly.map((p,i)=>distSegment(center.x,center.z,p,poly[(i+1)%poly.length])));
  if(clearance<0.09)return null;
  // A square of half diagonal <= nearest boundary is guaranteed to fit
  // a convex tabletop polygon, regardless of its orientation in the room.
  // 10% additional margin is reserved for measurement uncertainty.
  const side=2*clearance/Math.SQRT2*0.90;
  const scale=fitScaleFromWidth(side,1);
  if(scale===null)return null;
  return {scale,width,depth,center:worldFromLocal(center.x,center.z,poseMatrix),
    source:'plane',semantic};
}
export function findTableFit(frame,space,hitPoint) {
  let planes;
  try{planes=frame.detectedPlanes;}catch{return null;}
  if(!planes)return null;
  let selected=null,priority=-1;
  for(const plane of planes) {
    try {
      if(!plane.planeSpace||!plane.polygon?.length)continue;
      const pose=frame.getPose(plane.planeSpace,space);
      if(!pose)continue;
      const result=tableFromPlane(plane.polygon,pose.transform.matrix,hitPoint,plane.semanticLabel);
      if(!result)continue;
      const label=(plane.semanticLabel||'').toLowerCase();
      const score=/(table|desk|counter)/.test(label)?4:label?0:2;
      // Prefer labeled tables, then largest recognized footprint among matches.
      if(score>priority||(score===priority&&result.width*result.depth>(selected?.width*selected?.depth||0))){
        selected=result;priority=score;
      }
    } catch { /* Missing scene information must never block manual placement. */ }
  }
  return selected;
}
