import test from 'node:test';
import assert from 'node:assert/strict';
import {PALETTES,paletteRGB,palettePixels} from '../mobile-colors.mjs';

test('all four mathematical palettes retain their blue/teal/coral etc stops',()=>{
  assert.equal(PALETTES.length,4);
  for(let i=0;i<4;i++){
    assert.deepEqual(paletteRGB(i,0),PALETTES[i][0]);
    assert.deepEqual(paletteRGB(i,.5),PALETTES[i][1]);
    assert.deepEqual(paletteRGB(i,1),PALETTES[i][2]);
  }
});
test('gradient texture is opaque and preserves visibly nonwhite pixels',()=>{
  const pixels=palettePixels(0,128);
  assert.equal(pixels.length,512);
  for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],255);
  assert.notDeepEqual(Array.from(pixels.slice(0,3)),[255,255,255]);
  assert.notDeepEqual(Array.from(pixels.slice(0,3)),Array.from(pixels.slice(-4,-1)));
});
test('heat values outside [0,1] clamp and create stable endpoints',()=>{
  assert.deepEqual(paletteRGB(2,-3),paletteRGB(2,0));
  assert.deepEqual(paletteRGB(2,7),paletteRGB(2,1));
});
