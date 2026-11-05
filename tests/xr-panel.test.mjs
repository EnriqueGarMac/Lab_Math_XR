import test from 'node:test';
import assert from 'node:assert/strict';
import {PANEL_W,PANEL_H,SCREEN_W,SCREEN_H,clamp,panelPose,intersectPanel,rayFromMatrix,modelXRMatrix} from '../xr-panel.mjs';

const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

test('panel remains to the left and in front of the viewer',()=>{
  const p=panelPose(identity);
  assert.deepEqual(p.center,[-.78,-.01,-1.15]);
  assert.deepEqual(p.right,[1,0,0]);assert.deepEqual(p.back,[0,0,1]);
});
test('central controller ray hits panel and returns pixel coordinates',()=>{
  const p=panelPose(identity);
  const ray={origin:[-.78,-.01,0],dir:[0,0,-1]};
  const hit=intersectPanel(ray,p);
  assert.ok(hit);assert.ok(Math.abs(hit.u-.5)<1e-6);
  assert.ok(Math.abs(hit.v-.5)<1e-6);
  assert.equal(hit.x,SCREEN_W*.5);assert.equal(hit.y,SCREEN_H*.5);
  assert.ok(hit.distance>1);
});
test('ray pointing away or outside panel is not a menu click',()=>{
  const p=panelPose(identity);
  assert.equal(intersectPanel({origin:[-.78,-.01,0],dir:[0,0,1]},p),null);
  assert.equal(intersectPanel({origin:[0,-.01,0],dir:[0,0,-1]},p),null);
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
