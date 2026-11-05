// WebXR hit-test geometry and physically placed, virtual surface shadows.
// Hit testing is optional. No camera frames or room meshes are stored or uploaded.
export function normalise(v) {
  const l=Math.hypot(v[0],v[1],v[2])||1;
  return [v[0]/l,v[1]/l,v[2]/l];
}
export function planeFromHitMatrix(m,minUp=0.72) {
  if(!m||m.length<16)return null;
  const point=[m[12],m[13],m[14]];
  let normal=normalise([m[4],m[5],m[6]]);
  if(!point.every(Number.isFinite)||!normal.every(Number.isFinite))return null;
  // The Y axis of XRHitTestResult represents its estimated surface normal.
  // Reject walls and steep slopes when placing onto tables/floors.
  if(Math.abs(normal[1])<minUp)return null;
  if(normal[1]<0)normal=normal.map(x=>x===0?0:-x);
  return {point,normal};
}
export function modelClearance(data,scale,height) {
  if(!data||!Number.isFinite(data.min)||!Number.isFinite(data.amp))return 0.75*scale;
  const minLocal=data.min/data.amp*1.12*height;
  return (Math.max(0,-minLocal)+0.055)*scale;
}
export function directionalLight(azimuth=35,elevation=55) {
  const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
  return normalise([Math.cos(a)*Math.cos(e),-Math.sin(e),Math.sin(a)*Math.cos(e)]);
}
export function projectShadowPoint(world,plane,light) {
  const n=plane.normal,p=plane.point;
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const denom=dot(light,n);
  if(Math.abs(denom)<1e-5)return null;
  const t=dot(p.map((v,i)=>v-world[i]),n)/denom;
  if(t<0)return null;
  return world.map((v,i)=>v+light[i]*t);
}
function compile(gl,type,source) {
  const shader=gl.createShader(type);
  gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
  return shader;
}
// The original triangulation is projected by a light ray onto the detected plane.
// This renders a *virtual* shadow in the passthrough compositor; it does NOT change
// real lighting, and does not implement real-world occlusion.
export class XRPlanarShadow {
  constructor(gl) {
    this.gl=gl;
    const vs=compile(gl,gl.VERTEX_SHADER,[
      'attribute vec3 aPosition;',
      'uniform mat4 uViewProjection;',
      'uniform mat4 uModel;',
      'uniform vec3 uPlanePoint;',
      'uniform vec3 uNormal;',
      'uniform vec3 uLight;',
      'varying float vVisible;',
      'void main(){',
      '  vec3 world=(uModel*vec4(aPosition,1.0)).xyz;',
      '  float denom=dot(uLight,uNormal);',
      '  float t=dot(uPlanePoint-world,uNormal)/denom;',
      '  vVisible=step(0.0,t);',
      '  vec3 projected=world+uLight*t+uNormal*0.007;',
      '  gl_Position=uViewProjection*vec4(projected,1.0);',
      '}'
    ].join('\n'));
    const fs=compile(gl,gl.FRAGMENT_SHADER,[
      'precision mediump float;',
      'varying float vVisible;',
      'uniform float uOpacity;',
      'void main(){',
      '  gl_FragColor=vec4(0.015,0.030,0.045,clamp(uOpacity,0.0,0.65)*vVisible);',
      '}'
    ].join('\n'));
    const prog=gl.createProgram();
    gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));
    this.program=prog;
    this.uniforms={
      view:gl.getUniformLocation(prog,'uViewProjection'),model:gl.getUniformLocation(prog,'uModel'),
      point:gl.getUniformLocation(prog,'uPlanePoint'),normal:gl.getUniformLocation(prog,'uNormal'),
      light:gl.getUniformLocation(prog,'uLight'),opacity:gl.getUniformLocation(prog,'uOpacity')
    };
    this.pos=gl.getAttribLocation(prog,'aPosition');
  }
  draw(surface,viewProjection,model,plane,azimuth,opacity) {
    if(!surface?.indices||!surface.count||!plane||opacity<=0)return;
    const gl=this.gl,light=directionalLight(azimuth),n=plane.normal;
    const denom=light.reduce((acc,x,i)=>acc+x*n[i],0);
    if(denom>=-0.08)return;
    const depth=gl.isEnabled(gl.DEPTH_TEST),mask=gl.getParameter(gl.DEPTH_WRITEMASK);
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.view,false,viewProjection);
    gl.uniformMatrix4fv(this.uniforms.model,false,model);
    gl.uniform3fv(this.uniforms.point,plane.point);
    gl.uniform3fv(this.uniforms.normal,n);
    gl.uniform3fv(this.uniforms.light,light);
    gl.uniform1f(this.uniforms.opacity,opacity);
    gl.bindBuffer(gl.ARRAY_BUFFER,surface.buffer);
    for(let a=0;a<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);a++){
      if(a!==this.pos)gl.disableVertexAttribArray(a);
    }
    gl.enableVertexAttribArray(this.pos);
    gl.vertexAttribPointer(this.pos,3,gl.FLOAT,false,28,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,surface.indices);
    gl.drawElements(gl.TRIANGLES,surface.count,gl.UNSIGNED_SHORT,0);
    gl.depthMask(mask);if(depth)gl.enable(gl.DEPTH_TEST);
  }
  dispose(){this.gl.deleteProgram(this.program);}
}
