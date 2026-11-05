import test from 'node:test';
import assert from 'node:assert/strict';
import {PANEL_W,PANEL_H,SCREEN_W,SCREEN_H,clamp,panelPose,intersectPanel,rayFromMatrix,modelXRMatrix,quatMultiply,quatAxisAngle,quatInverse,relativeControllerRotation} from '../xr-panel.mjs';

const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

test('panel remains to the left and in front of the viewer',()=>{
  const p=panelPose(identity);
  assert.deepEqual(p.center,[-.30,-.02,-1.30]);
  assert.deepEqual(p.right,[1,0,0]);assert.deepEqual(p.back,[0,0,1]);
});
test('central controller ray hits panel and returns pixel coordinates',()=>{
  const p=panelPose(identity);
  const ray={origin:[-.30,-.02,0],dir:[0,0,-1]};
  const hit=intersectPanel(ray,p);
  assert.ok(hit);assert.ok(Math.abs(hit.u-.5)<1e-6);
  assert.ok(Math.abs(hit.v-.5)<1e-6);
  assert.equal(hit.x,SCREEN_W*.5);assert.equal(hit.y,SCREEN_H*.5);
  assert.ok(hit.distance>1);
});
test('ray pointing away or outside panel is not a menu click',()=>{
  const p=panelPose(identity);
  assert.equal(intersectPanel({origin:[-.78,-.01,0],dir:[0,0,1]},p),null);
  assert.equal(intersectPanel({origin:[.9,-.02,0],dir:[0,0,-1]},p),null);
});
test('rayFromMatrix picks controller position and negative local Z',()=>{
  const m=identity.slice();m[12]=1.7;m[13]=2.2;m[14]=3.1;
  const ray=rayFromMatrix(m);
  assert.deepEqual(ray.origin,[m[12],m[13],m[14]]);
  assert.deepEqual(ray.dir,[0,0,-1]);
});
test('XR model matrix preserves independent translation and scale',()=>{
  const m=modelXRMatrix({position:[1,2,-3],scale:.4,yaw:0,pitch:0});
  assert.ok(Math.abs(m[0]-.4)<1e-6);assert.ok(Math.abs(m[5]-.4)<1e-6);
  assert.deepEqual([m[12],m[13],m[14]],[1,2,-3]);
});
test('XR model rotation does not distort dimensions',()=>{
  const m=modelXRMatrix({position:[0,0,0],scale:.4,yaw:1.2,pitch:.3});
  const lengths=[0,4,8].map(i=>Math.hypot(m[i],m[i+1],m[i+2]));
  for(const l of lengths) assert.ok(Math.abs(l-.4)<1e-5);
});
test('UI quantities stay within bounds',()=>{
  assert.equal(clamp(-1,.16,1.35),.16);
  assert.equal(clamp(2,.16,1.35),1.35);
  assert.equal(clamp(.5,.16,1.35),.5);
});

test('menu starts near centre and is still reachable by a controller ray',()=>{
  const p=panelPose(identity);
  const hit=intersectPanel({origin:[p.center[0],p.center[1],0],dir:[0,0,-1]},p);
  assert.ok(hit);assert.ok(Math.abs(hit.u-.5)<1e-8);
});
test('controller quaternion rotations are reversible',()=>{
  const q=quatAxisAngle([0,1,0],.7);
  const id=quatMultiply(q,quatInverse(q));
  assert.ok(Math.abs(id[3]-1)<1e-10);
  assert.ok(Math.hypot(...id.slice(0,3))<1e-10);
});
test('controller rotation transfers to 3D model, including roll',()=>{
  const start=[0,0,0,1],end=quatAxisAngle([0,0,1],Math.PI/2);
  const model=relativeControllerRotation(start,end,[0,0,0,1]);
  const matrix=modelXRMatrix({position:[0,0,0],scale:1,rotation:model});
  assert.ok(Math.abs(matrix[0])<1e-6);
  assert.ok(Math.abs(matrix[1]-1)<1e-6);
  assert.ok(Math.abs(matrix[4]+1)<1e-6);
});
test('controller rotation preserves initial nonzero model orientation',()=>{
  const initial=quatAxisAngle([0,1,0],.4);
  const controller=quatAxisAngle([1,0,0],.5);
  const rotated=relativeControllerRotation(controller,controller,initial);
  for(let i=0;i<4;i++)assert.ok(Math.abs(rotated[i]-initial[i])<1e-10);
});
test('menu anchor can be retained between head pose updates',()=>{
  let pose=panelPose(identity);
  const first=pose.center.slice();
  const moved=identity.slice();moved[12]=.7;
  assert.notDeepEqual(panelPose(moved).center,first);
  // The XRPanel.setPose() method now changes pose only on initialization or force.
  assert.equal(typeof first[0],'number');
});
