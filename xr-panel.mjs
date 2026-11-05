// In-world UI for WebXR. Uses WebGL directly, with no external dependencies.
export const PANEL_W = 0.65;
export const PANEL_H = 0.94;
export const SCREEN_W = 768;
export const SCREEN_H = 1111;

export function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
export function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
export function rayFromMatrix(m){
  const d=[-m[8],-m[9],-m[10]],len=Math.hypot(...d)||1;
  return {origin:[m[12],m[13],m[14]],dir:d.map(v=>v===0?0:v/len)};
}
export function panelPose(viewerMatrix) {
  const m=viewerMatrix, right=[m[0],m[1],m[2]],up=[m[4],m[5],m[6]],back=[m[8],m[9],m[10]];
  const eye=[m[12],m[13],m[14]];
  const center=eye.map((v,i)=>v-right[i]*0.30-up[i]*0.02-back[i]*1.30);
  return {center,right,up,back};
}
export function intersectPanel(ray,pose,width=PANEL_W,height=PANEL_H) {
  if(!ray||!pose)return null;
  const diff=ray.origin.map((v,i)=>v-pose.center[i]);
  const rz=dot(ray.dir,pose.back),z=dot(diff,pose.back);
  if(Math.abs(rz)<1e-7)return null;
  const distance=-z/rz;
  if(distance<0.04||distance>5)return null;
  const px=dot(diff,pose.right)+distance*dot(ray.dir,pose.right);
  const py=dot(diff,pose.up)+distance*dot(ray.dir,pose.up);
  if(Math.abs(px)>width/2||Math.abs(py)>height/2)return null;
  return {u:px/width+0.5,v:0.5-py/height,distance,x:(px/width+0.5)*SCREEN_W,y:(0.5-py/height)*SCREEN_H};
}
// Quaternions are [x,y,z,w]. Full controller rotation includes yaw, pitch and roll.
export function normaliseQuat(q){
  const len=Math.hypot(...q)||1;return q.map(v=>v/len);
}
export function quatMultiply(a,b){
  const [x,y,z,w]=a,[u,v,t,r]=b;
  return normaliseQuat([w*u+x*r+y*t-z*v,w*v-x*t+y*r+z*u,w*t+x*v-y*u+z*r,w*r-x*u-y*v-z*t]);
}
export function quatInverse(q){
  const n=q.reduce((v,x)=>v+x*x,0)||1;
  return [-q[0]/n,-q[1]/n,-q[2]/n,q[3]/n];
}
export function quatAxisAngle(axis,angle){
  const n=Math.hypot(...axis)||1,s=Math.sin(angle/2)/n;
  return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(angle/2)];
}
export function quaternionFromPose(pose){
  const q=pose?.transform?.orientation;
  return q?[q.x,q.y,q.z,q.w]:null;
}
export function relativeControllerRotation(initial,current,modelAtStart){
  return quatMultiply(quatMultiply(current,quatInverse(initial)),modelAtStart);
}
export function modelXRMatrix(model) {
  const s=model.scale;
  if(model.rotation){
    const [x,y,z,w]=normaliseQuat(model.rotation);
    return new Float32Array([
      s*(1-2*(y*y+z*z)),s*(2*(x*y+z*w)),s*(2*(x*z-y*w)),0,
      s*(2*(x*y-z*w)),s*(1-2*(x*x+z*z)),s*(2*(y*z+x*w)),0,
      s*(2*(x*z+y*w)),s*(2*(y*z-x*w)),s*(1-2*(x*x+y*y)),0,
      model.position[0],model.position[1],model.position[2],1
    ]);
  }
  // Legacy yaw/pitch representation remains available for existing callers.
  const a=model.yaw||0,b=model.pitch||0;
  const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
  return new Float32Array([
    ca*s,0,-sa*s,0,
    sa*sb*s,cb*s,ca*sb*s,0,
    sa*cb*s,-sb*s,ca*cb*s,0,
    model.position[0],model.position[1],model.position[2],1
  ]);
}
function makeShader(gl,type,src){
  const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function rounded(ctx,x,y,w,h,r,fill,stroke){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
}
const PRESETS=[
  ['Ondas','sin(1.5*x)*cos(1.5*y)'],
  ['Silla','x^2-y^2'],
  ['Gaussiana','2*exp(-(x^2+y^2))'],
  ['Ondas radiales','sin(3*sqrt(x^2+y^2))'],
  ['Semiesfera','sqrt(9-x^2-y^2)'],
  ['Con parámetros','A*sin(k*x)*cos(k*y)']
];
const KEYS=[
  ['sin(','cos(','tan(','sqrt(','exp(','log('],
  ['7','8','9','(',')','^'],
  ['4','5','6','*','/','x'],
  ['1','2','3','+','-','y'],
  ['0','.','A','k','pi','←']
];
export class XRPanel {
  constructor(gl,getState,onCommand) {
    this.gl=gl;this.getState=getState;this.onCommand=onCommand;
    this.page='main';this.editValue='';this.error='';this.dirty=true;
    this.hoverId=null;this.hits=[];this.pose=null;
    this.canvas=document.createElement('canvas');this.canvas.width=SCREEN_W;this.canvas.height=SCREEN_H;
    this.ctx=this.canvas.getContext('2d');
    const vs=makeShader(gl,gl.VERTEX_SHADER,'attribute vec3 aPosition;attribute vec2 aUV;uniform mat4 uMVP;varying vec2 vUV;void main(){gl_Position=uMVP*vec4(aPosition,1.0);vUV=aUV;}');
    const fs=makeShader(gl,gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 vUV;uniform sampler2D uTex;void main(){gl_FragColor=texture2D(uTex,vUV);}');
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
    this.attrib={p:gl.getAttribLocation(this.program,'aPosition'),uv:gl.getAttribLocation(this.program,'aUV'),
      mvp:gl.getUniformLocation(this.program,'uMVP'),tex:gl.getUniformLocation(this.program,'uTex')};
    this.quad=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      -0.5,-0.5,0,0,0, 0.5,-0.5,0,1,0, -0.5,0.5,0,0,1,
      -0.5,0.5,0,0,1, 0.5,-0.5,0,1,0, 0.5,0.5,0,1,1
    ]),gl.STATIC_DRAW);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  // Anchor in room coordinates instead of following the viewer every frame.
  setPose(matrix,force=false){if(!this.pose||force)this.pose=panelPose(matrix);}
  placeAt(center,matrix){
    const view=panelPose(matrix);
    this.pose={...view,center:[...center]};
    this.dirty=true;
  }
  moveBy(delta){if(this.pose)this.pose.center=this.pose.center.map((v,i)=>v+delta[i]);}
  hit(ray){
    const v=intersectPanel(ray,this.pose);
    if(!v)return null;
    const item=this.hits.find(b=>v.x>=b.x&&v.x<=b.x+b.w&&v.y>=b.y&&v.y<=b.y+b.h);
    return {...v,id:item?.id??null};
  }
  hover(id){if(id!==this.hoverId){this.hoverId=id;this.dirty=true;}}
  button(id,label,x,y,w,h,accent=false) {
    const ctx=this.ctx;this.hits.push({id,x,y,w,h});
    const active=id===this.hoverId;
    rounded(ctx,x,y,w,h,12,active?'#427887':accent?'#245365':'#1d3647',active?'#9cf3e9':'#426171');
    ctx.fillStyle='#effaff';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=(accent?'bold 23px':'22px')+' system-ui, sans-serif';
    ctx.fillText(label,x+w/2,y+h/2,w-18);
  }
  text(t,x,y,size=22,color='#c6dbe5',align='left') {
    const ctx=this.ctx;ctx.fillStyle=color;ctx.font=size+'px system-ui,sans-serif';
    ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(t,x,y,SCREEN_W-70);
  }
  adj(label,value,minus,plus,y) {
    this.text(label,40,y+5,19,'#96bac8');
    this.button(minus,'−',40,y+18,115,55);
    this.text(String(value),384,y+47,26,'#e6f7fb','center');
    this.button(plus,'+',613,y+18,115,55);
  }
  repaint() {
    this.hits=[];
    const ctx=this.ctx;ctx.clearRect(0,0,SCREEN_W,SCREEN_H);
    rounded(ctx,0,0,SCREEN_W,SCREEN_H,26,'rgba(8,25,40,0.96)','#4c7186');
    rounded(ctx,17,17,SCREEN_W-34,80,18,'#123748');
    this.text('∿  SURFACE LAB  ·  QUEST XR',38,56,29,'#79eff0');
    this.text('ARRASTRAR ⇆',714,56,16,'#b3d8e6','right');
    // The heading can be grabbed with the trigger; do not interpret it as a button click.
    this.hits.push({id:'menu-handle',x:17,y:17,w:734,h:81});
    const s=this.getState();
    if(this.page==='main'){
      this.text('z = '+(s.expression||'').slice(0,36),42,132,24,'#f5fcff');
      this.text('Gatillo: rotar objeto · agarre: mover · cabecera: mover menú',42,176,17,'#a3c9d3');
      PRESETS.forEach(([name],i)=>{
        const col=i%2,row=Math.floor(i/2);
        this.button('preset:'+i,name,39+col*352,213+row*75,333,62);
      });
      this.adj('Dominio (±)',s.domain.toFixed(1),'domain:-','domain:+',440);
      this.adj('Altura vertical',s.height.toFixed(1)+' ×','height:-','height:+',530);
      this.adj('Tamaño en la habitación',s.scale.toFixed(2)+' ×','scale:-','scale:+',620);
      const keys=Object.keys(s.params);
      if(keys.length){
        keys.slice(0,2).forEach((k,i)=>{
          const y=727+i*69;this.text('Parámetro '+k,40,y-7,19,'#a7c3d0');
          this.button('param:'+k+':-', '−',235,y-31,87,54);
          this.text(Number(s.params[k]).toFixed(2),390,y-4,23,'#e6f7fb','center');
          this.button('param:'+k+':+', '+',460,y-31,87,54);
        });
      }else this.text('Puedes probar una función con parámetros A y k',40,755,19,'#a7c3d0');
      this.button('style','Estilo: '+(s.style==='both'?'Malla + sólido':s.style==='wire'?'Malla':'Sólido'),39,865,335,61);
      this.button('palette','Cambiar color',395,865,333,61);
      this.button('edit','⌨ Editar ecuación',39,947,333,61,true);
      this.button('recenter','Centrar modelo',395,947,158,61);
      this.button('menu-place','Mover menú',565,947,163,61,true);
      this.button('scene','Mesa / suelo / sombra',39,1021,478,56,true);
      this.button('exit','Salir',530,1021,198,56);
      this.text('Stick izq.: girar  ·  Stick dcho.: tamaño',384,1098,17,'#95b1be','center');
    }else if(this.page==='scene'){
      this.button('back','‹ Volver a funciones',38,119,349,66);
      this.text('SUPERFICIES REALES',42,226,30,'#e4f8ff');
      this.text('Detección mediante WebXR hit-test (si disponible)',42,267,19,'#96bfcb');
      if(!s.hitAvailable){
        this.text('Tu navegador no ofrece detección espacial.',42,333,23,'#ffbcae');
        this.text('Las funciones 3D siguen disponibles.',42,374,21,'#bdd7df');
      }else{
        this.button('place-mode',s.scanning?'Cancelar detección':'Detectar mesa o suelo',39,315,689,79,true);
        this.text(s.scanning?(s.hitReady?'Mesa/suelo detectado: aprieta el gatillo':'Apunta al suelo o mesa con el mando')
          :(s.placed?'Modelo colocado sobre un plano detectado':'Activa la detección para colocar la función'),
          42,449,21,s.hitReady?'#71e9bf':'#d0dfe9');
      }
      this.button('shadow','Sombra: '+(s.shadowOn?'activada':'desactivada'),39,518,689,74);
      this.text('Proyección virtual sobre el plano seleccionado',42,615,19,'#a2c9d4');
      this.adj('Orientación de la luz',s.lightAngle+'°','light:-','light:+',647);
      this.adj('Intensidad de la sombra',Math.round(s.opacity*100)+' %','opacity:-','opacity:+',761);
      this.button('reset-plane','Quitar plano detectado',39,901,689,67);
      this.text('No proyecta luz física ni oculta objetos reales.',42,1006,18,'#9fc0c9');
      this.button('exit','Salir de realidad mixta',39,1031,689,59);
    }else{
      this.button('back','‹ Volver',40,118,196,63);
      this.text('EDITOR DE ECUACIONES',260,150,26,'#d2eaf2');
      rounded(ctx,38,198,690,103,12,'#091a2a','#477080');
      const v=this.editValue;
      this.text('z = '+(v.length>41?'…'+v.slice(-41):v),58,250,24,'#e7feff');
      KEYS.forEach((row,r)=>row.forEach((key,c)=>{
        const x=38+c*119,y=339+r*119;
        this.button('key:'+key,key,x,y,108,102);
      }));
      this.button('clear','Borrar todo',38,954,215,73);
      this.button('apply','✓ Representar',264,954,464,73,true);
      this.text(this.error?this.error.slice(0,54):'Incluye paréntesis; los ángulos son radianes.',40,1073,19,this.error?'#ffb9a6':'#a6c6d0');
    }
    this.dirty=false;
    const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  }
  activate(id){
    if(!id)return;
    if(this.page==='edit'){
      if(id==='back'){this.page='main';this.error='';}
      else if(id==='clear'){this.editValue='';this.error='';}
      else if(id==='apply'){
        const error=this.onCommand('equation',this.editValue);
        if(!error){this.page='main';this.error='';}
        else this.error=error;
      } else if(id.startsWith('key:')){
        const key=id.slice(4);
        if(key==='←')this.editValue=this.editValue.slice(0,-1);
        else if(this.editValue.length<245)this.editValue+=key;
        this.error='';
      }
    }else if(this.page==='scene'){
      if(id==='back')this.page='main';
      else this.onCommand(id);
    }else if(id==='scene'){this.page='scene';}
    else if(id==='edit'){this.page='edit';this.editValue=this.getState().expression;this.error='';}
    else if(id.startsWith('preset:'))this.onCommand('equation',PRESETS[Number(id.split(':')[1])][1]);
    else this.onCommand(id);
    this.hoverId=null;this.dirty=true;
  }
  draw(viewProjection,mul){
    const gl=this.gl;if(this.dirty)this.repaint();
    if(!this.pose)return;
    const {center,right,up,back}=this.pose;
    const m=new Float32Array([
      right[0]*PANEL_W,right[1]*PANEL_W,right[2]*PANEL_W,0,
      up[0]*PANEL_H,up[1]*PANEL_H,up[2]*PANEL_H,0,
      back[0],back[1],back[2],0,
      center[0],center[1],center[2],1
    ]);
    const oldDepth=gl.isEnabled(gl.DEPTH_TEST),oldDepthMask=gl.getParameter(gl.DEPTH_WRITEMASK);
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.attrib.mvp,false,mul(viewProjection,m));
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.uniform1i(this.attrib.tex,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
    // Attribute arrays are global context state, not per-program.
    for(let i=0;i<Math.min(gl.getParameter(gl.MAX_VERTEX_ATTRIBS),8);i++)if(i!==this.attrib.p&&i!==this.attrib.uv)gl.disableVertexAttribArray(i);
    gl.enableVertexAttribArray(this.attrib.p);gl.enableVertexAttribArray(this.attrib.uv);
    gl.vertexAttribPointer(this.attrib.p,3,gl.FLOAT,false,20,0);
    gl.vertexAttribPointer(this.attrib.uv,2,gl.FLOAT,false,20,12);
    gl.drawArrays(gl.TRIANGLES,0,6);
    gl.depthMask(oldDepthMask);
    if(oldDepth)gl.enable(gl.DEPTH_TEST);
  }
  dispose(){
    const gl=this.gl;gl.deleteBuffer(this.quad);gl.deleteTexture(this.texture);gl.deleteProgram(this.program);
  }
}
