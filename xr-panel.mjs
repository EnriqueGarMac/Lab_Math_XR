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
export function menuPositionFromRay(ray,distance=1.2){
  return ray.origin.map((v,i)=>v+ray.dir[i]*distance);
}
export function translatedMenuCenter(center,controllerStart,controllerNow){
  return center.map((v,i)=>v+controllerNow[i]-controllerStart[i]);
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
const MATH_KEYS=[
  ['sin(','cos(','tan(','sqrt(','exp(','log('],
  ['7','8','9','(',')','^'],
  ['4','5','6','*','/','x'],
  ['1','2','3','+','-','y'],
  ['0','.','A','k','pi','←']
];
const LETTER_KEYS=[
  ['a','b','c','d','e','f'],
  ['g','h','i','j','k','l'],
  ['m','n','o','p','q','r'],
  ['s','t','u','v','w','x'],
  ['y','z','A','B','_','←']
];
export function nextMeshResolution(current,step){
  const n=Math.round((current+step)/5)*5;
  return clamp(n,20,100);
}
export class XRPanel {
  constructor(gl,getState,onCommand) {
    this.gl=gl;this.getState=getState;this.onCommand=onCommand;
    this.page='main';this.editValue='';this.keyLayout='math';this.error='';this.dirty=true;
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
      this.text('z = '+(s.expression||'').slice(0,37),42,132,24,'#f5fcff');
      // Editing is prominent rather than hidden below all the mesh controls.
      this.button('edit','✎ ESCRIBIR MI ECUACIÓN',39,169,689,72,true);
      this.text('O elige una función de ejemplo:',42,269,21,'#b5d3df');
      PRESETS.forEach(([name],i)=>{
        const col=i%2,row=Math.floor(i/2);
        this.button('preset:'+i,name,39+col*352,293+row*66,333,56);
      });
      this.adj('Densidad de malla (20–100)',s.resolution+' × '+s.resolution,
        'resolution:-','resolution:+',502);
      this.adj('Dominio (±)',s.domain.toFixed(1),'domain:-','domain:+',596);
      this.adj('Escala vertical',s.height.toFixed(1)+' ×','height:-','height:+',690);
      this.adj('Tamaño en la habitación',s.scale.toFixed(2)+' ×','scale:-','scale:+',784);
      this.button('settings','Aspecto y parámetros',39,887,331,67);
      this.button('menu-place','Mover menú',390,887,338,67,true);
      this.button('scene','Mesa / suelo / sombra',39,976,478,66);
      this.button('exit','Salir de RM',530,976,198,66);
      this.text('Cabecera: mover panel · gatillo: rotar función',384,1085,18,'#95b1be','center');
    }else if(this.page==='settings'){
      this.button('back','‹ Volver a funciones',39,122,350,66);
      this.text('ASPECTO DE LA SUPERFICIE',40,235,29,'#e1f8ff');
      this.button('style','Estilo: '+(s.style==='both'?'Sólido y malla':s.style==='wire'?'Malla':'Sólido'),
        39,281,689,78,true);
      this.button('palette','Cambiar colores',39,387,689,78);
      this.button('axes','Ejes: '+(s.axes?'visibles':'ocultos'),39,493,331,75);
      this.button('grid','Plano base: '+(s.grid?'visible':'oculto'),390,493,338,75);
      this.text('PARÁMETROS DE LA ECUACIÓN',40,628,26,'#e1f8ff');
      const keys=Object.keys(s.params);
      if(!keys.length)this.text('Esta ecuación no tiene parámetros libres.',40,691,21,'#b4d3de');
      else keys.slice(0,4).forEach((key,i)=>{
        const y=659+i*93;
        this.text('Parámetro '+key,40,y+7,21,'#acd2de');
        this.button('param:'+key+':-','−',216,y+21,106,58);
        this.text(Number(s.params[key]).toFixed(2),403,y+50,24,'#e6f7fb','center');
        this.button('param:'+key+':+','+',565,y+21,106,58);
      });
      this.button('edit','✎ Nueva ecuación',39,1031,689,59,true);
        }else if(this.page==='scene'){
      this.button('back','‹ Volver a funciones',38,115,363,64);
      this.text('MESA, SUELO Y SOMBRAS',42,213,29,'#e4f8ff');
      this.text('Ajuste del modelo según la superficie detectada',42,260,18,'#96bfcb');
      if(!s.hitAvailable){
        this.text('Detección espacial no disponible en este navegador.',42,340,21,'#ffbcae');
        this.text('Puedes seguir moviendo y escalando la función.',42,400,20,'#bdd7df');
      }else{
        this.button('place-mode',s.scanning&&!s.measuring?'Cancelar detección':'Detectar mesa / suelo',
          39,301,689,72,true);
        this.button('fit-toggle','Ajuste automático: '+(s.autoFit?'ACTIVADO':'DESACTIVADO'),
          39,392,689,58);
        this.button('measure-width',s.measuring?'Cancelar medición':'Medir borde corto (2 puntos)',
          39,466,689,57);
        this.text((s.measureProgress===1?'Primer punto marcado. Señala el segundo extremo.':
          s.scanning?'Apunta y pulsa gatillo sobre mesa o suelo.':
          s.fitStatus||'El modelo se ajustará si la mesa tiene contorno detectable.')
          .slice(0,68),42,558,19,s.measureProgress===1?'#74e7be':'#c7dce6');
      }
      this.button('shadow','Sombra: '+(s.shadowOn?'activada':'desactivada'),
        39,601,689,68);
      this.adj('Dirección de luz',s.lightAngle+'°','light:-','light:+',688);
      this.adj('Opacidad de sombra',Math.round(s.opacity*100)+' %',
        'opacity:-','opacity:+',784);
      this.button('reset-plane','Quitar plano detectado',39,901,689,64);
      this.text('Escala uniforme · conserva las proporciones de la función',
        42,991,18,'#9fc0c9');
      this.button('exit','Salir de realidad mixta',39,1022,689,59);
    }else{
      this.button('back','‹ Volver',39,119,190,63);
      this.button('layout',this.keyLayout==='math'?'ABC':'123 / f(x)',244,119,173,63);
      this.button('current','Cargar ecuación actual',432,119,296,63);
      this.text('ESCRIBE z = f(x, y)',42,226,28,'#d2eaf2');
      rounded(ctx,38,259,690,80,12,'#091a2a','#477080');
      const v=this.editValue;
      this.text('z = '+(v.length>42?'…'+v.slice(-42):v),56,300,25,'#e7feff');
      (this.keyLayout==='math'?MATH_KEYS:LETTER_KEYS).forEach((row,r)=>row.forEach((key,c)=>{
        const x=38+c*119,y=362+r*112;
        this.button('key:'+key,key,x,y,108,96);
      }));
      this.button('clear','Borrar todo',38,944,215,77);
      this.button('apply','✓ REPRESENTAR',264,944,464,77,true);
      this.text(this.error?this.error.slice(0,57):
        'Gatillo para escribir · ABC para letras · ← para borrar',
        40,1072,19,this.error?'#ffb9a6':'#a6c6d0');
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
      else if(id==='layout')this.keyLayout=this.keyLayout==='math'?'letters':'math';
      else if(id==='current'){this.editValue=this.getState().expression;this.error='';}
      else if(id==='apply'){
        const error=this.onCommand('equation',this.editValue);
        if(!error){this.page='main';this.error='';}
        else this.error=error;
      }else if(id.startsWith('key:')){
        const key=id.slice(4);
        if(key==='←')this.editValue=this.editValue.slice(0,-1);
        else if(this.editValue.length+key.length<=245)this.editValue+=key;
        this.error='';
      }
    }else if(this.page==='scene'||this.page==='settings'){
      if(id==='back')this.page='main';
      else if(id==='edit'){this.page='edit';this.editValue='';this.keyLayout='math';this.error='';}
      else this.onCommand(id);
    }else if(id==='scene'){this.page='scene';}
    else if(id==='settings'){this.page='settings';}
    else if(id==='edit'){this.page='edit';this.editValue='';this.keyLayout='math';this.error='';}
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
