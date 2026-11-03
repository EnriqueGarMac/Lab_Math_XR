import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSurfaceEquation } from '../parser.mjs';

test('sinusoidal function', () => {
  const f = parseSurfaceEquation('z = sin(x)*cos(y)');
  assert.equal(f.evaluate({x:0,y:5}),0);
  assert.ok(Math.abs(f.evaluate({x:Math.PI/2,y:0})-1)<1e-12);
});

test('quadratic surface with correct exponentiation', () => {
  const f = parseSurfaceEquation('x^2-y^2');
  assert.equal(f.evaluate({x:3,y:2}),5);
});

test('automatic parameters', () => {
  const f = parseSurfaceEquation('A*sin(k*x)*cos(y)');
  assert.deepEqual(f.parameters,['A','k']);
  assert.ok(Math.abs(f.evaluate({x:Math.PI/2,y:0,A:2,k:1})-2)<1e-12);
});

test('invalid expressions are rejected', () => {
  assert.throws(()=>parseSurfaceEquation('sin('));
  assert.throws(()=>parseSurfaceEquation('process.exit(1)'));
});
