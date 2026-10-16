/**
 * Partner overlay
 * Partner overlay with its own canvas and open/close handling.
 */
(function(){
var P=document.getElementById('partner'),AB=document.getElementById('about'),hd=document.getElementById('hdr'),mm=document.getElementById('mm'),open=false;
var cv=document.createElement('canvas');cv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none';P.insertBefore(cv,P.firstChild);
var rd=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:false});rd.setPixelRatio(Math.min(devicePixelRatio||1,2));
var sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,1,.1,100);cam.position.z=10;
var N=2200,pos=new Float32Array(N*3),sd=new Float32Array(N),sz=new Float32Array(N);
for(var i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*30;pos[i*3+1]=(Math.random()-.5)*16;pos[i*3+2]=(Math.random()-.5)*16-2;sd[i]=Math.random();sz[i]=.5+Math.random()*1.8}
var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(sd,1));g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
var mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
uniforms:{uTime:{value:0},uMouse:{value:new THREE.Vector2()},uPx:{value:rd.getPixelRatio()},uTint:{value:new THREE.Color().setHSL(190/360,.8,.66)}},
vertexShader:'attribute float aSeed;attribute float aSize;uniform float uTime,uPx;uniform vec2 uMouse;varying float vTw;varying float vSeed;void main(){vec3 p=position;float sp=.25+aSeed*.55;p.y=mod(p.y-uTime*sp+8.,16.)-8.;p.x+=sin(uTime*.4+aSeed*20.)*.35;vec2 d=p.xy-uMouse*vec2(11.,6.);float f=exp(-dot(d,d)*.12);p.xy+=normalize(d+1e-4)*f*1.4;vec4 mv=modelViewMatrix*vec4(p,1.);vTw=pow(.5+.5*sin(uTime*(1.5+aSeed*4.)+aSeed*60.),5.);vSeed=aSeed;gl_PointSize=aSize*(1.+vTw*1.8)*(34./-mv.z)*uPx;gl_Position=projectionMatrix*mv;}',
fragmentShader:'uniform vec3 uTint;varying float vTw;varying float vSeed;void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv);float gl=smoothstep(.5,0.,d);float c=max(0.,1.-abs(uv.x)*22.)*max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.y)*22.)*max(0.,1.-abs(uv.x)*2.2);vec3 col=mix(uTint,vec3(.75,.95,1.),vSeed*.6);col=mix(col,vec3(1.),vTw*.8);float a=gl*gl*.55+c*vTw;gl_FragColor=vec4(col*a,a);}'});
sc.add(new THREE.Points(g,mat));
var clock=new THREE.Clock(),m=new THREE.Vector2(),tm=new THREE.Vector2();
addEventListener('pointermove',function(e){tm.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1))});
function size(){rd.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()}
addEventListener('resize',size);size();
(function loop(){requestAnimationFrame(loop);if(!open)return;m.lerp(tm,.06);var t=clock.getElapsedTime();mat.uniforms.uTime.value=t;mat.uniforms.uMouse.value.copy(m);mat.uniforms.uPx.value=rd.getPixelRatio();rd.render(sc,cam);
if((window.__sm||0)>=.86)hd.style.setProperty('--ph',String(Math.round(200+Math.sin(t*.6)*14)))})();
function openP(){if(open)return;open=true;window.__aboutOpen=true;document.body.classList.add('pt');document.body.classList.remove('mmo','mgo');P.classList.add('on');P.scrollTop=0}
function closeP(){if(!open)return;open=false;document.body.classList.remove('pt');P.classList.remove('on');if(!AB.classList.contains('on'))window.__aboutOpen=false}
function sync(){if(location.hash==='#partner')openP();else closeP()}
function route(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;if(/\/partner$/.test(a.getAttribute('href')||'')){e.preventDefault();location.hash='partner';sync()}}
hd.addEventListener('click',route);mm.addEventListener('click',route);
addEventListener('hashchange',sync);
addEventListener('keydown',function(e){if(e.key==='Escape'&&open){location.hash='';sync()}});
var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{root:P,threshold:.12});
P.querySelectorAll('.rv').forEach(function(n){io.observe(n)});
P.addEventListener('pointermove',function(e){var c=e.target.closest&&e.target.closest('.chip');if(!c)return;var r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px')});
P.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-ps]');if(b){var t=document.getElementById(b.getAttribute('data-ps'));if(t)t.scrollIntoView({behavior:'smooth',block:'start'})}});
sync();
})();
