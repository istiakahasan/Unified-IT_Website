/**
 * About overlay: dust canvas, secondary 3D scene, chip pointer glow and scroll reveal.
 * Optimized with WebGL performance checks, on-demand render loop, tab background pause,
 * and adaptive particle counts.
 */
/* ---- Dust canvas ---- */
try {
(function(){
var A=document.getElementById('about'),cv=document.getElementById('adust'),cx=cv.getContext('2d'),hd=document.getElementById('hdr'),P=[],W=0,H=0,R=1,mx=.5,my=.5,last=0,open=false;
function size(){R=Math.min(devicePixelRatio||1,1.5);W=cv.width=innerWidth*R;H=cv.height=innerHeight*R;}
function init(){P=[];}
function draw(t){
  if(!open)return;
  if(document.hidden){requestAnimationFrame(draw);return;}
  requestAnimationFrame(draw);
  var dt=Math.min(50,t-last)/1000;last=t;cx.clearRect(0,0,W,H);cx.globalCompositeOperation='lighter';
  if((window.__sm||0)>=.86&&hd)hd.style.setProperty('--ph',String(Math.round(262+Math.sin(t*.0006)*22)));
}
function openA(){
  if(open)return;
  open=true;window.__aboutOpen=true;document.body.classList.add('ab');document.body.classList.remove('mmo');A.classList.add('on');A.scrollTop=0;size();init();last=performance.now();requestAnimationFrame(draw);
  if(window.__startAbout3D) window.__startAbout3D();
}
function closeA(){
  if(!open)return;
  open=false;window.__aboutOpen=false;document.body.classList.remove('ab');A.classList.remove('on');
}
function sync(){if(location.hash==='#about')openA();else closeA();}
function route(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'';
if(/\/about$/.test(h)){e.preventDefault();location.hash='about';sync();}
else if(open&&h==='https://unified.it.com/'){e.preventDefault();location.hash='';sync();}}
if(hd) hd.addEventListener('click',route);
var mm = document.getElementById('mm'); if(mm) mm.addEventListener('click',route);
var aex = document.getElementById('aex');
if(aex) aex.onclick=function(){location.hash='';sync();scrollTo({top:4*innerHeight,behavior:'smooth'});};
addEventListener('hashchange',sync);
addEventListener('resize',function(){if(open)size();});
addEventListener('keydown',function(e){if(e.key==='Escape'&&open){location.hash='';sync();}});
addEventListener('pointermove',function(e){mx=e.clientX/innerWidth;my=e.clientY/innerHeight;},{passive:true});
sync();
})();
} catch (err) { console.error("[Dust canvas]", err); }

/* ---- About 3D scene ---- */
try {
(function(){
var perf = window.WebGLPerf;
var tier = perf ? perf.getTier() : 'high';
if(tier==='fallback'||(perf&&!perf.checkSupport())) return;

var A=document.getElementById('about');
if(!A)return;
var cv=document.createElement('canvas');cv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none';A.insertBefore(cv,A.firstChild);
var rd;
try{
  rd=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:false});
}catch(e){
  console.warn('[About 3D] WebGL init failed:',e);
  return;
}
rd.setPixelRatio(perf ? perf.getTargetPixelRatio() : Math.min(devicePixelRatio||1,1.5));
var sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,1,.1,100);cam.position.z=10;

var N = tier==='low'?700:(tier==='medium'?1400:2200);
var pos=new Float32Array(N*3),sd=new Float32Array(N),sz=new Float32Array(N);
for(var i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*30;pos[i*3+1]=(Math.random()-.5)*16;pos[i*3+2]=(Math.random()-.5)*16-2;sd[i]=Math.random();sz[i]=.5+Math.random()*1.8;}
var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(sd,1));g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
var mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
uniforms:{uTime:{value:0},uMouse:{value:new THREE.Vector2()},uPx:{value:rd.getPixelRatio()},uTint:{value:new THREE.Color().setHSL(305/360,.9,.62)}},
vertexShader:'attribute float aSeed;attribute float aSize;uniform float uTime,uPx;uniform vec2 uMouse;varying float vTw;varying float vSeed;void main(){vec3 p=position;float sp=.25+aSeed*.55;p.y=mod(p.y-uTime*sp+8.,16.)-8.;p.x+=sin(uTime*.4+aSeed*20.)*.35;vec2 d=p.xy-uMouse*vec2(11.,6.);float f=exp(-dot(d,d)*.12);p.xy+=normalize(d+1e-4)*f*1.4;vec4 mv=modelViewMatrix*vec4(p,1.);vTw=pow(.5+.5*sin(uTime*(1.5+aSeed*4.)+aSeed*60.),5.);vSeed=aSeed;gl_PointSize=aSize*(1.+vTw*1.8)*(34./-mv.z)*uPx;gl_Position=projectionMatrix*mv;}',
fragmentShader:'uniform vec3 uTint;varying float vTw;varying float vSeed;void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv);float gl=smoothstep(.5,0.,d);float c=max(0.,1.-abs(uv.x)*22.)*max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.y)*22.)*max(0.,1.-abs(uv.x)*2.2);vec3 col=mix(uTint,vec3(1.,.6,.95),vSeed*.6);col=mix(col,vec3(1.),vTw*.8);float a=gl*gl*.55+c*vTw;gl_FragColor=vec4(col*a,a);}'});
sc.add(new THREE.Points(g,mat));
var clock=new THREE.Clock(),m=new THREE.Vector2(),tm=new THREE.Vector2();
addEventListener('pointermove',function(e){tm.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1));},{passive:true});
function size(){
  rd.setPixelRatio(perf ? perf.getTargetPixelRatio() : Math.min(devicePixelRatio||1,1.5));
  rd.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();
}
addEventListener('resize',perf ? perf.debounce(size,80) : size);size();

var animId=null;
function loop(){
  if(!window.__aboutOpen){animId=null;return;}
  animId=requestAnimationFrame(loop);
  if(document.hidden)return;
  m.lerp(tm,.06);mat.uniforms.uTime.value=clock.getElapsedTime();mat.uniforms.uMouse.value.copy(m);mat.uniforms.uPx.value=rd.getPixelRatio();rd.render(sc,cam);
}
window.__startAbout3D=function(){
  if(!animId){animId=requestAnimationFrame(loop);}
};
if(window.__aboutOpen){window.__startAbout3D();}
})();
} catch (err) { console.error("[About 3D scene]", err); }

/* ---- Chip glow ---- */
try {
(function(){var A=document.getElementById('about');if(!A)return;A.addEventListener('pointermove',function(e){var c=e.target.closest&&e.target.closest('.chip');if(!c)return;var r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px');},{passive:true});})();
} catch (err) { console.error("[Chip glow]", err); }

/* ---- Reveal and click handling ---- */
try {
(function(){var A=document.getElementById('about');if(!A)return;
var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}});},{root:A,threshold:.12});
A.querySelectorAll('.rv').forEach(function(n){io.observe(n);});
A.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-go]');if(b){location.hash='';scrollTo({top:4*innerHeight,behavior:'smooth'});}});
})();
} catch (err) { console.error("[Reveal and click handling]", err); }
