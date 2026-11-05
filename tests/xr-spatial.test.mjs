import test from 'node:test';
import assert from 'node:assert/strict';
import {planeFromHitMatrix,modelClearance,directionalLight,projectShadowPoint,normalise} from '../xr-spatial.mjs';

const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

test('hit-test pose on horizontal surfaces yields point and upward normal',()=>{
  const m=identity.slice();m[12]=2;m[13]=.75;m[14]=-1;
  const p=planeFromHitMatrix(m);
  assert.deepEqual(p.point,[2,.75,-1]);
  assert.deepEqual(p.normal,[0,1,0]);
});
test('reject wall hits and steep surfaces instead of calling them tables',()=>{
  const m=identity.slice();m[4]=1;m[5]=0;m[6]=0;
  assert.equal(planeFromHitMatrix(m),null);
  m[4]=.8;m[5]=.6;
  assert.equal(planeFromHitMatrix(m),null);
});
test('a downward normal is flipped consistently upward',()=>{
  const m=identity.slice();m[4]=0;m[5]=-1;m[6]=0;
  const hit=planeFromHitMatrix(m);
  assert.deepEqual(hit.normal,[0,1,0]);
});
test('invalid hits do not create planes',()=>{
  assert.equal(planeFromHitMatrix(null),null);
  const m=identity.slice();m[12]=NaN;
  assert.equal(planeFromHitMatrix(m),null);
});
test('model clearance respects the lowest point of the generated surface',()=>{
  const a=modelClearance({min:-3,max:4,amp:4},.5,1.5);
  assert.ok(Math.abs(a-(3/4*1.12*1.5+.055)*.5)<1e-6);
  assert.ok(modelClearance({min:1,max:2,amp:2},.5,1)>.02);
});
test('light is a unit vector pointing toward the plane',()=>{
  for(const az of [0,35,90,180,270]){
    const d=directionalLight(az);
    assert.ok(Math.abs(Math.hypot(...d)-1)<1e-10);
    assert.ok(d[1]<-.2);
  }
});
test('projected surface shadow intersects the support plane',()=>{
  const plane={point:[0,.7,0],normal:[0,1,0]}, light=directionalLight(0,55);
  const q=projectShadowPoint([0,1.7,0],plane,light);
  assert.ok(q);
  assert.ok(Math.abs(q[1]-.7)<1e-8);
  assert.ok(q[0]>0);
});
test('shadow does not appear for geometry below plane',()=>{
  const plane={point:[0,0,0],normal:[0,1,0]};
  assert.equal(projectShadowPoint([0,-1,0],plane,directionalLight(30)),null);
});
test('normalise handles axes',()=>assert.deepEqual(normalise([0,5,0]),[0,1,0]));
