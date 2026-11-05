import test from 'node:test';
import assert from 'node:assert/strict';
import {tableFromPlane,findTableFit,fitScaleFromWidth,measureShortEdge,pointInPolygon} from '../xr-table-fit.mjs';

const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,.75,0,1]);
const rectangle=(w,d)=>[
 {x:-w/2,z:-d/2},{x:w/2,z:-d/2},{x:w/2,z:d/2},{x:-w/2,z:d/2}
];

test('automatic tabletop fit keeps model entirely within a 1.2 by .7 m table',()=>{
 const t=tableFromPlane(rectangle(1.2,.7),identity(),[0,.75,0],'table');
 assert.ok(t);
 assert.ok(Math.abs(t.width-1.2)<1e-6);
 assert.ok(Math.abs(t.depth-.7)<1e-6);
 assert.ok(t.scale*2.4 < .7);
 assert.ok(t.scale*2.4 > .35);
 assert.deepEqual(t.center,[0,.75,0]);
});
test('automatic fit uses uniform scale and retains square proportions',()=>{
 const t=tableFromPlane(rectangle(.8,.5),identity(),[0,.75,0],'desk');
 assert.ok(t);
 assert.ok(t.scale>0);
 assert.ok(t.scale*2.4<.5);
});
test('floor and oversized/vertical surfaces are not classified as tabletop sizing',()=>{
 assert.equal(tableFromPlane(rectangle(1.2,.7),identity(),[0,.75,0],'floor'),null);
 assert.equal(tableFromPlane(rectangle(5,5),identity(),[0,.75,0],''),null);
 const wall=identity();wall[4]=1;wall[5]=0;wall[6]=0;
 assert.equal(tableFromPlane(rectangle(1.2,.7),wall,[0,.75,0],'table'),null);
});
test('a hit outside polygon should not resize to an unrelated table',()=>{
 assert.equal(tableFromPlane(rectangle(1.2,.7),identity(),[2,.75,2],'table'),null);
 assert.equal(pointInPolygon(0,0,rectangle(1.2,.7)),true);
 assert.equal(pointInPolygon(5,5,rectangle(1.2,.7)),false);
});
test('can estimate a non-axis-aligned table in the room',()=>{
 const angle=Math.PI/4,c=Math.cos(angle),s=Math.sin(angle);
 const m=identity();m[0]=c;m[2]=-s;m[8]=s;m[10]=c;
 const fit=tableFromPlane(rectangle(1.2,.7),m,[0,.75,0],'table');
 assert.ok(fit);
 assert.ok(fit.scale<.4);
});
test('no plane detection means no fabricated automatic table dimensions',()=>{
 assert.equal(findTableFit({},null,[0,0,0]),null);
 const unknown={detectedPlanes:new Set()};
 assert.equal(findTableFit(unknown,null,[0,0,0]),null);
});
test('selects a table rather than coincident unlabeled plane',()=>{
 const table={planeSpace:{name:'table'},polygon:rectangle(1.2,.7),semanticLabel:'table'};
 const other={planeSpace:{name:'other'},polygon:rectangle(.8,.5),semanticLabel:null};
 const frame={detectedPlanes:new Set([other,table]),
  getPose:()=>({transform:{matrix:identity()}})};
 const fit=findTableFit(frame,{},[0,.75,0]);
 assert.equal(fit.semantic,'table');
});
test('manual fallback measures short edge between two horizontal hits',()=>{
 const a={point:[.1,.75,-.2],normal:[0,1,0]};
 const b={point:[.1,.75,.5],normal:[0,1,0]};
 const width=measureShortEdge(a,b);
 assert.ok(Math.abs(width-.7)<1e-9);
 const scale=fitScaleFromWidth(width);
 assert.ok(scale*2.4 < width);
});
test('manual sizing rejects different levels and unreasonable widths',()=>{
 const a={point:[0,.75,0],normal:[0,1,0]};
 assert.equal(measureShortEdge(a,{point:[0,.9,.5],normal:[0,1,0]}),null);
 assert.equal(measureShortEdge(a,{point:[.05,.75,0],normal:[0,1,0]}),null);
 assert.equal(measureShortEdge(a,{point:[10,.75,0],normal:[0,1,0]}),null);
 assert.equal(fitScaleFromWidth(-1),null);
});

test('a plane at tabletop height is not selected for a ray hit on the floor below',()=>{
  const m=identity();
  const fit=tableFromPlane(rectangle(1.2,.7),m,[0,-.7,0],'table');
  assert.equal(fit,null);
});
test('too narrow a measured surface does not force a minimum model that overflows it',()=>{
  assert.equal(fitScaleFromWidth(.25),null);
});
