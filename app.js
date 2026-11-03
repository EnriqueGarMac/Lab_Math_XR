import {parseSurfaceEquation} from './parser.mjs';

const $=id=>document.getElementById(id);
const canvas=$('gl-canvas'), stage=$('stage-wrap'), video=$('camera-video');
const equation=$('equation'), feedback=$('feedback'), notice=$('notice');
const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,preserveDrawingBuffer:true,xrCompatible:true}) || canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true,xrCompatible:true});
if(!gl){$('surface-stats').textContent='Este navegador no dispone de WebGL.';throw new Error('WebGL no disponible');}

// All maths and rendering operate locally; no external services or dependencies.
const state={domain:5,height:1,resolution:55,style:'both',palette:0,axes:true,grid:true,mode:'3d',
  yaw:0.7,pitch:0.48,distance:5.8,target:[0,0,0],compiled:null,parameters:{},data:null,
  pointer:null,cameraStream:null,xrSession:null,xrSpace:null,xrModel:null,xrPose:null,
  program:null,lineProgram:null,surface:null,wire:null,axesBuffer:null,gridBuffer:null};

function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function program(v,f){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
const vert=`attribute vec3 aPosition;attribute vec3 aNormal;attribute float aHeat;
uniform mat4 uMVP;varying vec3 vNormal;varying float vHeat;
void main(){gl_Position=uMVP*vec4(aPosition,1.0);vNormal=aNormal;vHeat=aHeat;}`;
const frag=`precision mediump float;varying vec3 vNormal;varying float vHeat;uniform float uPalette;
vec3 getColor(float t){
  vec3 low=vec3(.12,.47,.74),mid=vec3(.27,.80,.76),high=vec3(.98,.47,.31);
  if(uPalette>2.5){low=vec3(.25,.47,.64);mid=vec3(.40,.68,.78);high=vec3(.68,.86,.90);}
  else if(uPalette>1.5){low=vec3(.43,.29,.81);mid=vec3(.73,.48,.87);high=vec3(.99,.58,.70);}
  else if(uPalette>.5){low=vec3(.04,.47,.57);mid=vec3(.30,.76,.70);high=vec3(1.0,.75,.38);}
  return t<.5?mix(low,mid,t*2.0):mix(mid,high,(t-.5)*2.0);
}
void main(){vec3 n=normalize(vNormal);vec3 l=normalize(vec3(-.38,.85,.47));float light=.53+.47*abs(dot(n,l));
  vec3 color=getColor(clamp(vHeat,0.,1.));float highlight=pow(max(dot(n,normalize(vec3(.15,1.,.65))),0.),12.)*.13;
  gl_FragColor=vec4(color*light+highlight,1.0);}`;
const lineVert=`attribute vec3 aPosition;attribute vec3 aColor;uniform mat4 uMVP;varying vec3 vColor;
void main(){gl_Position=uMVP*vec4(aPosition,1.0);vColor=aColor;}`;
const lineFrag=`precision mediump float;varying vec3 vColor;uniform float uOpacity;void main(){gl_FragColor=vec4(vColor,uOpacity);}`;
state.program=program(vert,frag);state.lineProgram=program(lineVert,lineFrag);
const attribs={surf:{p:gl.getAttribLocation(state.program,'aPosition'),n:gl.getAttribLocation(state.program,'aNormal'),t:gl.getAttribLocation(state.program,'aHeat'),mvp:gl.getUniformLocation(state.program,'uMVP'),palette:gl.getUniformLocation(state.program,'uPalette')},
  line:{p:gl.getAttribLocation(state.lineProgram,'aPosition'),c:gl.getAttribLocation(state.lineProgram,'aColor'),mvp:gl.getUniformLocation(state.lineProgram,'uMVP'),opacity:gl.getUniformLocation(state.lineProgram,'uOpacity')}};
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

function createBuffer(values){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);return {buffer:b,count:values.length/6};}
function drop(b){if(b?.buffer)gl.deleteBuffer(b.buffer);if(b?.indices)gl.deleteBuffer(b.indices);}
const vec=(x,y,z)=>[x,y,z];
function pushLine(dest,a,b,color){dest.push(...a,...color,...b,...color);}
function heightAt(x,y,params){try{const v=state.compiled.evaluate({...params,x,y});return typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e9?v:null;}catch{return null;}}
function paramDefault(key){return key.toLowerCase()==='k'?1.5:key.toLowerCase()==='a'?1:1;}
function regenerate() {
  if(!state.compiled)return;
  const res=state.resolution,n=res+1,D=state.domain, vals=new Array(n*n);let min=Infinity,max=-Infinity,valid=0;
  const params=state.parameters;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const x=-D+2*D*j/res,y=-D+2*D*i/res,v=heightAt(x,y,params);
    vals[i*n+j]=v;
    if(v!==null){min=Math.min(min,v);max=Math.max(max,v);valid++;}
  }
  if(!valid)throw new Error('La ecuación no tiene valores reales y finitos en este dominio.');
  const amp=Math.max(Math.abs(min),Math.abs(max),1e-8),elev=v=>v/amp*1.12*state.height;
  const pos=[],norm=[],heat=[];
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const v=vals[i*n+j],h=v===null?0:elev(v),x=-1.2+2.4*j/res,z=-1.2+2.4*i/res;
    const current=i*n+j;
    let dx=0,dz=0;
    if(v!==null){const L=j>0?vals[current-1]:null,R=j<res?vals[current+1]:null,
      B=i>0?vals[current-n]:null,F=i<res?vals[current+n]:null;
      if(L!==null&&R!==null)dx=(elev(R)-elev(L))/(4.8/res);
      else if(R!==null)dx=(elev(R)-h)/(2.4/res);
      else if(L!==null)dx=(h-elev(L))/(2.4/res);
      if(B!==null&&F!==null)dz=(elev(F)-elev(B))/(4.8/res);
      else if(F!==null)dz=(elev(F)-h)/(2.4/res);
      else if(B!==null)dz=(h-elev(B))/(2.4/res);
    }
    const len=Math.hypot(dx,1,dz)||1;
    pos.push(x,h,z);norm.push(-dx/len,1/len,-dz/len);heat.push(v===null?0:(v/amp+1)/2);
  }
  const verts=[],tri=[],lines=[];
  for(let k=0;k<pos.length/3;k++)verts.push(...pos.slice(k*3,k*3+3),...norm.slice(k*3,k*3+3),heat[k]);
  const wireCol=[.18,.32,.41];
  const p=(k)=>pos.slice(k*3,k*3+3);
  for(let i=0;i<res;i++)for(let j=0;j<res;j++){
    const a=i*n+j,b=a+1,c=a+n,d=c+1;
    if(vals[a]!==null&&vals[b]!==null&&vals[c]!==null)tri.push(a,c,b);
    if(vals[b]!==null&&vals[c]!==null&&vals[d]!==null)tri.push(b,c,d);
  }
  // Sparse overlay lines keep the mesh readable even for high-resolution surfaces.
  const step=Math.max(1,Math.round(res/24));
  function segment(a,b){if(vals[a]===null||vals[b]===null)return;const pa=p(a),pb=p(b);pa[1]+=.003;pb[1]+=.003;pushLine(lines,pa,pb,wireCol);}
  for(let i=0;i<=res;i+=step)for(let j=0;j<res;j++)segment(i*n+j,i*n+j+1);
  for(let j=0;j<=res;j+=step)for(let i=0;i<res;i++)segment(i*n+j,(i+1)*n+j);
  drop(state.surface);drop(state.wire);
  const vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STATIC_DRAW);
  const ibo=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(tri),gl.STATIC_DRAW);
  state.surface={buffer:vbo,indices:ibo,count:tri.length};state.wire=createBuffer(lines);
  state.data={min,max,valid,total:n*n,triangles:tri.length/3,amp};
  $('surface-stats').textContent=`${valid.toLocaleString('es-ES')} puntos válidos · ${Math.round(tri.length/3).toLocaleString('es-ES')} triángulos · z ∈ [${fmt(min)}, ${fmt(max)}]`;
}
function fmt(v){return Math.abs(v)>=1000?v.toExponential(2):Number(v.toFixed(3)).toLocaleString('es-ES');}
function axesBuffers(){const axes=[],grid=[];
  pushLine(axes,[-1.45,0,0],[1.47,0,0],[1,.44,.42]); // mathematical x
  pushLine(axes,[0,0,-1.45],[0,0,1.47],[.45,.88,.62]); // mathematical y
  pushLine(axes,[0,-1.52,0],[0,1.62,0],[.39,.66,1]); // mathematical z
  for(let i=-6;i<=6;i++){
    const c=i===0?[.16,.34,.39]:[.12,.21,.27];const a=i*.2;
    pushLine(grid,[a,-.015,-1.2],[a,-.015,1.2],c);
    pushLine(grid,[-1.2,-.015,a],[1.2,-.015,a],c);
  }
  state.axesBuffer=createBuffer(axes);state.gridBuffer=createBuffer(grid);
}
axesBuffers();

function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),r=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*r,-1,0,0,2*far*near*r,0]);}
function lookAt(eye,at,up=[0,1,0]){
  const normalize=v=>{const n=Math.hypot(...v)||1;return v.map(e=>e/n);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const z=normalize(eye.map((e,i)=>e-at[i])),x=normalize(cross(up,z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1]);
}
function mul(a,b){const c=new Float32Array(16);for(let j=0;j<4;j++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)c[j*4+i]+=a[k*4+i]*b[j*4+k];return c;}
function modelMatrix(tx=0,ty=0,tz=0,scale=1){return new Float32Array([scale,0,0,0,0,scale,0,0,0,0,scale,0,tx,ty,tz,1]);}
function drawLines(buffer,mvp,opacity=1){if(!buffer||!buffer.count)return;
  for(const index of [attribs.surf.p,attribs.surf.n,attribs.surf.t])if(index!==attribs.line.p&&index!==attribs.line.c)gl.disableVertexAttribArray(index);
  gl.useProgram(state.lineProgram);gl.uniformMatrix4fv(attribs.line.mvp,false,mvp);gl.uniform1f(attribs.line.opacity,opacity);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer.buffer);gl.enableVertexAttribArray(attribs.line.p);gl.enableVertexAttribArray(attribs.line.c);
  gl.vertexAttribPointer(attribs.line.p,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(attribs.line.c,3,gl.FLOAT,false,24,12);
  gl.drawArrays(gl.LINES,0,buffer.count);
}
function drawSurface(mvp){if(!state.surface?.count)return;
  for(const index of [attribs.line.p,attribs.line.c])if(index!==attribs.surf.p&&index!==attribs.surf.n&&index!==attribs.surf.t)gl.disableVertexAttribArray(index);
  gl.useProgram(state.program);gl.uniformMatrix4fv(attribs.surf.mvp,false,mvp);gl.uniform1f(attribs.surf.palette,state.palette);
  gl.bindBuffer(gl.ARRAY_BUFFER,state.surface.buffer);
  gl.enableVertexAttribArray(attribs.surf.p);gl.enableVertexAttribArray(attribs.surf.n);gl.enableVertexAttribArray(attribs.surf.t);
  gl.vertexAttribPointer(attribs.surf.p,3,gl.FLOAT,false,28,0);
  gl.vertexAttribPointer(attribs.surf.n,3,gl.FLOAT,false,28,12);
  gl.vertexAttribPointer(attribs.surf.t,1,gl.FLOAT,false,28,24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,state.surface.indices);
  gl.drawElements(gl.TRIANGLES,state.surface.count,gl.UNSIGNED_SHORT,0);
}
function drawScene(mvp){
  if(state.grid){gl.disable(gl.DEPTH_TEST);drawLines(state.gridBuffer,mvp,state.mode==='camera'?.65:.52);gl.enable(gl.DEPTH_TEST);}
  if(state.style!=='wire')drawSurface(mvp);
  if(state.style!=='solid'){if(state.style==='wire')gl.disable(gl.DEPTH_TEST);drawLines(state.wire,mvp,state.style==='wire'?1:.75);gl.enable(gl.DEPTH_TEST);}
  if(state.axes){gl.disable(gl.DEPTH_TEST);drawLines(state.axesBuffer,mvp,.95);gl.enable(gl.DEPTH_TEST);}
}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
  const bw=Math.max(1,Math.round(w*dpr)),bh=Math.max(1,Math.round(h*dpr));
  if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}}
function frame(){if(state.xrSession)return;resize();gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const x=state.target[0]+Math.sin(state.yaw)*Math.cos(state.pitch)*state.distance;
  const y=state.target[1]+Math.sin(state.pitch)*state.distance;
  const z=state.target[2]+Math.cos(state.yaw)*Math.cos(state.pitch)*state.distance;
  const vp=mul(perspective(Math.PI/4,canvas.width/canvas.height,.03,100),lookAt([x,y,z],state.target));
  drawScene(vp);requestAnimationFrame(frame);
}

function setFeedback(message,error=false){feedback.textContent=message;feedback.classList.toggle('error',error);}
let noticeTimer;
function showNotice(msg){notice.textContent=msg;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.hidden=true,7000);}
function makeParams(keys){const parent=$('params');parent.replaceChildren();$('params-section').classList.toggle('hidden',!keys.length);
  for(const key of keys){if(!(key in state.parameters))state.parameters[key]=paramDefault(key);
    const wrap=document.createElement('div'),hdr=document.createElement('div'),lab=document.createElement('label'),out=document.createElement('output'),r=document.createElement('input');
    wrap.className='param-item';hdr.className='field-head';lab.textContent=key;out.textContent=Number(state.parameters[key]).toFixed(1);
    r.type='range';r.min='-5';r.max='5';r.step='0.1';r.value=state.parameters[key];r.setAttribute('aria-label',`Parámetro ${key}`);
    r.addEventListener('input',()=>{state.parameters[key]=Number(r.value);out.textContent=Number(r.value).toFixed(1);try{regenerate();setFeedback('Parámetros actualizados.');}catch(e){setFeedback(e.message,true);}});
    hdr.append(lab,out);wrap.append(hdr,r);parent.append(wrap);
  }
}
function submitExpression(){try{
  const next=parseSurfaceEquation(equation.value);const prev=state.compiled,oldParams=state.parameters;
  state.compiled=next;state.parameters={};for(const key of next.parameters)state.parameters[key]=oldParams[key]??paramDefault(key);
  try{regenerate();}catch(e){state.compiled=prev;state.parameters=oldParams;throw e;}
  makeParams(next.parameters);setFeedback('Superficie generada correctamente.');
  $('scene-name').textContent='SUPERFICIE · z = '+next.expression.slice(0,44);
}catch(e){setFeedback(e.message,true);}}
$('equation-form').addEventListener('submit',e=>{e.preventDefault();submitExpression();});
$('presets').addEventListener('click',e=>{const btn=e.target.closest('[data-expression]');if(btn){equation.value=btn.dataset.expression;submitExpression();}});
for(const [id,prop,transform] of [['domain','domain',Number],['height','height',Number],['resolution','resolution',Number]]){
  $(id).addEventListener('input',()=>{state[prop]=transform($(id).value);$('domain-label').textContent='±'+state.domain;$('height-label').textContent=state.height.toFixed(1)+'×';$('resolution-label').textContent=state.resolution+' × '+state.resolution;try{regenerate();setFeedback('Vista actualizada.');}catch(e){setFeedback(e.message,true);}});
}
$('style').addEventListener('change',e=>state.style=e.target.value);
$('palette').addEventListener('change',e=>state.palette=Number(e.target.value));
$('axes').addEventListener('change',e=>state.axes=e.target.checked);
$('grid').addEventListener('change',e=>state.grid=e.target.checked);
function resetView(){state.yaw=.7;state.pitch=.48;state.distance=5.8;state.target=[0,0,0];}
$('reset-view').addEventListener('click',resetView);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(state.xrSession)return;state.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,button:e.button};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{const p=state.pointer;if(!p||p.id!==e.pointerId)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(p.button===2 || e.shiftKey){const scale=state.distance*.0016;state.target[0]-=dx*scale;state.target[1]+=dy*scale;}
  else{state.yaw-=dx*.008;state.pitch=Math.max(-1.2,Math.min(1.45,state.pitch+dy*.008));}
});
for(const t of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(t,()=>state.pointer=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();state.distance=Math.max(2.0,Math.min(19,state.distance*Math.exp(e.deltaY*.001)));},{passive:false});

async function stopCamera(){if(state.cameraStream){state.cameraStream.getTracks().forEach(track=>track.stop());state.cameraStream=null;}video.srcObject=null;stage.classList.remove('camera-on');$('camera-badge').hidden=true;}
function setMode(mode){state.mode=mode;$('view-3d').classList.toggle('active',mode==='3d');$('view-camera').classList.toggle('active',mode==='camera');}
$('view-3d').addEventListener('click',async()=>{await stopCamera();setMode('3d');$('stage-help').textContent='Arrastra para girar · Rueda para acercar · Botón derecho para desplazar';});
$('view-camera').addEventListener('click',async()=>{
  if(!navigator.mediaDevices?.getUserMedia){showNotice('La webcam requiere Chrome/Edge en https:// o http://localhost.');return;}
  try{await stopCamera();const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});
    state.cameraStream=s;video.srcObject=s;await video.play();stage.classList.add('camera-on');$('camera-badge').hidden=false;setMode('camera');
    $('stage-help').textContent='Vista de webcam superpuesta · puedes mover la superficie con ratón · no hay seguimiento espacial';
    s.getVideoTracks()[0]?.addEventListener('ended',()=>{stopCamera();setMode('3d');});
  }catch(e){showNotice('No se pudo activar la cámara. Comprueba sus permisos y que ninguna otra app la esté utilizando.');setMode('3d');}
});

// Export an actual composite PNG, including webcam pixels if webcam access was granted.
$('save-image').addEventListener('click',()=>{
  const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;
  const cx=c.getContext('2d');cx.fillStyle='#0c1926';cx.fillRect(0,0,c.width,c.height);
  if(state.mode==='camera'&&video.readyState>=2){const vw=video.videoWidth,vh=video.videoHeight;
    const scale=Math.max(c.width/vw,c.height/vh),w=vw*scale,h=vh*scale;
    cx.save();cx.translate(c.width,0);cx.scale(-1,1);cx.drawImage(video,(c.width-w)/2,(c.height-h)/2,w,h);cx.restore();}
  cx.drawImage(canvas,0,0);const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='surface-lab.png';a.click();
});

function placeXRModel(pose){const m=pose.views[0].transform.matrix,p=pose.views[0].transform.position;
  const fx=-m[8],fy=-m[9],fz=-m[10];
  state.xrModel=modelMatrix(p.x+fx*1.55,p.y+fy*1.55-.42,p.z+fz*1.55,.48);
}
async function enterXR(){
  if(!navigator.xr){showNotice('WebXR no está disponible aquí. Abre esta web desde Meta Quest Browser (HTTPS).');return;}
  let session;
  try{
    session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['local'],optionalFeatures:['dom-overlay'],domOverlay:{root:document.body}});
    await stopCamera();setMode('3d');
    if(gl.makeXRCompatible)await gl.makeXRCompatible();
    const layer=new XRWebGLLayer(session,gl,{alpha:true,antialias:true,depth:true});
    session.updateRenderState({baseLayer:layer});const space=await session.requestReferenceSpace('local');
    state.xrSession=session;state.xrSpace=space;state.xrModel=null;
    session.addEventListener('select',()=>{if(state.xrPose)placeXRModel(state.xrPose);});
    session.addEventListener('end',()=>{state.xrSession=null;state.xrSpace=null;state.xrModel=null;state.xrPose=null;
      $('view-xr').classList.remove('active');$('stage-help').textContent='Arrastra para girar · Rueda para acercar · Botón derecho para desplazar';requestAnimationFrame(frame);});
    $('view-xr').classList.add('active');session.requestAnimationFrame(xrFrame);
  }catch(e){if(session&&!state.xrSession)await session.end().catch(()=>{});showNotice('No se pudo iniciar realidad mixta: '+e.message+' Comprueba que Quest Browser admita immersive-ar y que uses HTTPS.');}
}
function xrFrame(t,frame){const session=frame.session;if(!state.xrSession)return;session.requestAnimationFrame(xrFrame);
  const pose=frame.getViewerPose(state.xrSpace);if(!pose)return;
  state.xrPose=pose;if(!state.xrModel)placeXRModel(pose);
  const layer=session.renderState.baseLayer;
  gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);
  gl.enable(gl.SCISSOR_TEST);
  for(const view of pose.views){const vp=layer.getViewport(view);gl.viewport(vp.x,vp.y,vp.width,vp.height);gl.scissor(vp.x,vp.y,vp.width,vp.height);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    drawScene(mul(mul(view.projectionMatrix,view.transform.inverse.matrix),state.xrModel));}
  gl.disable(gl.SCISSOR_TEST);
}
$('view-xr').addEventListener('click',()=>{if(state.xrSession)state.xrSession.end();else enterXR();});
async function checkXR(){const text=$('device-status'),btn=$('view-xr');
  if(!navigator.xr){text.textContent='PC: vista 3D y webcam disponibles · WebXR no detectado';btn.title='Abre esta página en Quest Browser con HTTPS';return;}
  try{const ok=await navigator.xr.isSessionSupported('immersive-ar');text.textContent=ok?'WebXR immersive-ar disponible':'WebXR presente · immersive-ar no disponible en este navegador';
    if(!ok)btn.title='Este navegador no admite immersive-ar (prueba con Quest Browser)';}
  catch{text.textContent='No se pudo comprobar WebXR';}
}
submitExpression();requestAnimationFrame(frame);checkXR();
