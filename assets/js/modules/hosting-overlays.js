/**
 * Cloud VPS (#vps), Dedicated Server (#vds) and Business Email (#bem) overlay pages:
 * canvas, open/close, on-demand render loops, WebGL compatibility, and tab-hidden throttling.
 */
/* ---- Cloud VPS page ---- */
try {
(function(){
var V=document.getElementById('vps'),AB=document.getElementById('about'),PT=document.getElementById('partner'),hd=document.getElementById('hdr'),mg=document.getElementById('mega'),open=false;
if(!V)return;
var perf = window.WebGLPerf;
var tier = perf ? perf.getTier() : 'high';
var hasGL = tier !== 'fallback' && (!perf || perf.checkSupport());
var rd = null, sc = null, cam = null, mat = null, animId = null;

if (hasGL) {
  try {
    var cv=document.createElement('canvas');cv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none';V.insertBefore(cv,V.firstChild);
    rd=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:false});
    rd.setPixelRatio(perf ? perf.getTargetPixelRatio() : Math.min(devicePixelRatio||1,1.5));
    sc=new THREE.Scene();cam=new THREE.PerspectiveCamera(50,1,.1,100);cam.position.z=10;
    var N=tier==='low'?700:(tier==='medium'?1400:2200);
    var pos=new Float32Array(N*3),sd=new Float32Array(N),sz=new Float32Array(N);
    for(var i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*30;pos[i*3+1]=(Math.random()-.5)*16;pos[i*3+2]=(Math.random()-.5)*16-2;sd[i]=Math.random();sz[i]=.5+Math.random()*1.8;}
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(sd,1));g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
    mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0},uMouse:{value:new THREE.Vector2()},uPx:{value:rd.getPixelRatio()},uTint:{value:new THREE.Color().setHSL(270/360,.9,.62)}},
    vertexShader:'attribute float aSeed;attribute float aSize;uniform float uTime,uPx;uniform vec2 uMouse;varying float vTw;varying float vSeed;void main(){vec3 p=position;float sp=.25+aSeed*.55;p.y=mod(p.y-uTime*sp+8.,16.)-8.;p.x+=sin(uTime*.4+aSeed*20.)*.35;vec2 d=p.xy-uMouse*vec2(11.,6.);float f=exp(-dot(d,d)*.12);p.xy+=normalize(d+1e-4)*f*1.4;vec4 mv=modelViewMatrix*vec4(p,1.);vTw=pow(.5+.5*sin(uTime*(1.5+aSeed*4.)+aSeed*60.),5.);vSeed=aSeed;gl_PointSize=aSize*(1.+vTw*1.8)*(34./-mv.z)*uPx;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform vec3 uTint;varying float vTw;varying float vSeed;void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv);float gl=smoothstep(.5,0.,d);float c=max(0.,1.-abs(uv.x)*22.)*max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.y)*22.)*max(0.,1.-abs(uv.x)*2.2);vec3 col=mix(uTint,vec3(1.,.6,.95),vSeed*.6);col=mix(col,vec3(1.),vTw*.8);float a=gl*gl*.55+c*vTw;gl_FragColor=vec4(col*a,a);}'});
    sc.add(new THREE.Points(g,mat));

    var clock=new THREE.Clock(),m=new THREE.Vector2(),tm=new THREE.Vector2();
    addEventListener('pointermove',function(e){tm.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1));},{passive:true});
    function size(){
      if(!rd||!cam)return;
      rd.setPixelRatio(perf ? perf.getTargetPixelRatio() : Math.min(devicePixelRatio||1,1.5));
      rd.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();
    }
    addEventListener('resize',perf ? perf.debounce(size,80) : size);size();

    function loop(){
      if(!open){animId=null;return;}
      animId=requestAnimationFrame(loop);
      if(document.hidden)return;
      m.lerp(tm,.06);var t=clock.getElapsedTime();mat.uniforms.uTime.value=t;mat.uniforms.uMouse.value.copy(m);mat.uniforms.uPx.value=rd.getPixelRatio();rd.render(sc,cam);
      if((window.__sm||0)>=.86&&hd)hd.style.setProperty('--ph',String(Math.round(268+Math.sin(t*.6)*14)));
    }
  }catch(e){
    console.warn('[VPS overlay] WebGL init fallback:',e);
    rd=null;
  }
}

function startLoop(){if(rd&&!animId)animId=requestAnimationFrame(loop);}
function others(){return (AB&&AB.classList.contains('on'))||(PT&&PT.classList.contains('on'))||(document.getElementById('vds')&&document.getElementById('vds').classList.contains('on'))||(document.getElementById('bem')&&document.getElementById('bem').classList.contains('on'));}
function openV(){if(open)return;open=true;window.__aboutOpen=true;document.body.classList.add('vp');document.body.classList.remove('mmo','mgo');V.classList.add('on');V.scrollTop=0;startLoop();}
function closeV(){if(!open)return;open=false;document.body.classList.remove('vp');V.classList.remove('on');if(!others())window.__aboutOpen=false;}
function sync(){if(location.hash==='#vps')openV();else closeV();}
if(mg)mg.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.sv');if(a&&/cloud-vps$/.test(a.getAttribute('href')||'')){e.preventDefault();e.stopPropagation();document.body.classList.remove('mgo');location.hash='vps';sync();}},true);
addEventListener('hashchange',sync);
addEventListener('keydown',function(e){if(e.key==='Escape'&&open){location.hash='';sync();}});
sync();
})();
} catch (err) { console.error("[Cloud VPS page]", err); }

/* ---- Dedicated Server page ---- */
try {
(function(){
var V=document.getElementById('vds'),AB=document.getElementById('about'),PT=document.getElementById('partner'),hd=document.getElementById('hdr'),mg=document.getElementById('mega'),open=false;
if(!V)return;
var perf = window.WebGLPerf;
var tier = perf ? perf.getTier() : 'high';
var hasGL = tier !== 'fallback' && (!perf || perf.checkSupport());
var rd = null, sc = null, cam = null, mat = null, animId = null;

if (hasGL) {
  try {
    var cv=document.createElement('canvas');cv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none';V.insertBefore(cv,V.firstChild);
    rd=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:false});
    rd.setPixelRatio(perf ? perf.getTargetPixelRatio() : Math.min(devicePixelRatio||1,1.5));
    sc=new THREE.Scene();cam=new THREE.PerspectiveCamera(50,1,.1,100);cam.position.z=10;
    var N=tier==='low'?700:(tier==='medium'?1400:2200);
    var pos=new Float32Array(N*3),sd=new Float32Array(N),sz=new Float32Array(N);
    for(var i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*30;pos[i*3+1]=(Math.random()-.5)*16;pos[i*3+2]=(Math.random()-.5)*16-2;sd[i]=Math.random();sz[i]=.5+Math.random()*1.8;}
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(sd,1));g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
    mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0},uMouse:{value:new THREE.Vector2()},uPx:{value:rd.getPixelRatio()},uTint:{value:new THREE.Color().setHSL(255/360,.9,.62)}},
    vertexShader:'attribute float aSeed;attribute float aSize;uniform float uTime,uPx;uniform vec2 uMouse;varying float vTw;varying float vSeed;void main(){vec3 p=position;float sp=.25+aSeed*.55;p.y=mod(p.y-uTime*sp+8.,16.)-8.;p.x+=sin(uTime*.4+aSeed*20.)*.35;vec2 d=p.xy-uMouse*vec2(11.,6.);float f=exp(-dot(d,d)*.12);p.xy+=normalize(d+1e-4)*f*1.4;vec4 mv=modelViewMatrix*vec4(p,1.);vTw=pow(.5+.5*sin(uTime*(1.5+aSeed*4.)+aSeed*60.),5.);vSeed=aSeed;gl_PointSize=aSize*(1.+vTw*1.8)*(34./-mv.z)*uPx;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform vec3 uTint;varying float vTw;varying float vSeed;void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv);float gl=smoothstep(.5,0.,d);float c=max(0.,1.-abs(uv.x)*22.)*max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.x)*2.2);vec3 col=mix(uTint,vec3(1.,.6,.95),vSeed*.6);col=mix(col,vec3(1.),vTw*.8);float a=gl*gl*.55+c*vTw;gl_FragColor=vec4(col*a,a);}'});
    sc.add(new THREE.Points(g,mat));

    var clock=new THREE.Clock(),m=new THREE.Vector2(),tm=new THREE.Vector2();
    addEventListener('pointermove',function(e){tm.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1));},{passive:true});
    function size(){
      if(!rd||!cam)return;
      rd.setPixelRatio(perf ? perf.getTargetPixelRatio() : Math.min(devicePixelRatio||1,1.5));
      rd.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();
    }
    addEventListener('resize',perf ? perf.debounce(size,80) : size);size();

    function loop(){
      if(!open){animId=null;return;}
      animId=requestAnimationFrame(loop);
      if(document.hidden)return;
      m.lerp(tm,.06);var t=clock.getElapsedTime();mat.uniforms.uTime.value=t;mat.uniforms.uMouse.value.copy(m);mat.uniforms.uPx.value=rd.getPixelRatio();rd.render(sc,cam);
      if((window.__sm||0)>=.86&&hd)hd.style.setProperty('--ph',String(Math.round(255+Math.sin(t*.6)*14)));
    }
  }catch(e){
    console.warn('[VDS overlay] WebGL init fallback:',e);
    rd=null;
  }
}

function startLoop(){if(rd&&!animId)animId=requestAnimationFrame(loop);}
function others(){return (AB&&AB.classList.contains('on'))||(PT&&PT.classList.contains('on'))||(document.getElementById('vps')&&document.getElementById('vps').classList.contains('on'))||(document.getElementById('bem')&&document.getElementById('bem').classList.contains('on'));}
function openV(){if(open)return;open=true;window.__aboutOpen=true;document.body.classList.add('vd');document.body.classList.remove('mmo','mgo');V.classList.add('on');V.scrollTop=0;startLoop();}
function closeV(){if(!open)return;open=false;document.body.classList.remove('vd');V.classList.remove('on');if(!others())window.__aboutOpen=false;}
function sync(){if(location.hash==='#vds')openV();else closeV();}
if(mg)mg.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.sv');if(a&&/dedicated-server$/.test(a.getAttribute('href')||'')){e.preventDefault();e.stopPropagation();document.body.classList.remove('mgo');location.hash='vds';sync();}},true);
addEventListener('hashchange',sync);
addEventListener('keydown',function(e){if(e.key==='Escape'&&open){location.hash='';sync();}});
sync();
})();
} catch (err) { console.error("[Dedicated Server page]", err); }

/* ---- Business Email page ---- */
try {
(function(){
var V=document.getElementById('bem'),AB=document.getElementById('about'),PT=document.getElementById('partner'),hd=document.getElementById('hdr'),mg=document.getElementById('mega'),open=false;
if(!V)return;
var perf = window.WebGLPerf;
var tier = perf ? perf.getTier() : 'high';
var hasGL = tier !== 'fallback' && (!perf || perf.checkSupport());
var rd = null, sc = null, cam = null, mat = null, animId = null;

if (hasGL) {
  try {
    var cv=document.createElement('canvas');cv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none';V.insertBefore(cv,V.firstChild);
    rd=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:false});
    rd.setPixelRatio(perf ? perf.getTargetPixelRatio() : Math.min(devicePixelRatio||1,1.5));
    sc=new THREE.Scene();cam=new THREE.PerspectiveCamera(50,1,.1,100);cam.position.z=10;
    var N=tier==='low'?700:(tier==='medium'?1400:2200);
    var pos=new Float32Array(N*3),sd=new Float32Array(N),sz=new Float32Array(N);
    for(var i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*30;pos[i*3+1]=(Math.random()-.5)*16;pos[i*3+2]=(Math.random()-.5)*16-2;sd[i]=Math.random();sz[i]=.5+Math.random()*1.8;}
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(sd,1));g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
    mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0},uMouse:{value:new THREE.Vector2()},uPx:{value:rd.getPixelRatio()},uTint:{value:new THREE.Color().setHSL(305/360,.9,.62)}},
    vertexShader:'attribute float aSeed;attribute float aSize;uniform float uTime,uPx;uniform vec2 uMouse;varying float vTw;varying float vSeed;void main(){vec3 p=position;float sp=.25+aSeed*.55;p.y=mod(p.y-uTime*sp+8.,16.)-8.;p.x+=sin(uTime*.4+aSeed*20.)*.35;vec2 d=p.xy-uMouse*vec2(11.,6.);float f=exp(-dot(d,d)*.12);p.xy+=normalize(d+1e-4)*f*1.4;vec4 mv=modelViewMatrix*vec4(p,1.);vTw=pow(.5+.5*sin(uTime*(1.5+aSeed*4.)+aSeed*60.),5.);vSeed=aSeed;gl_PointSize=aSize*(1.+vTw*1.8)*(34./-mv.z)*uPx;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform vec3 uTint;varying float vTw;varying float vSeed;void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv);float gl=smoothstep(.5,0.,d);float c=max(0.,1.-abs(uv.x)*22.)*max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.x)*2.2);vec3 col=mix(uTint,vec3(1.,.6,.95),vSeed*.6);col=mix(col,vec3(1.),vTw*.8);float a=gl*gl*.55+c*vTw;gl_FragColor=vec4(col*a,a);}'});
    sc.add(new THREE.Points(g,mat));

    var clock=new THREE.Clock(),m=new THREE.Vector2(),tm=new THREE.Vector2();
    addEventListener('pointermove',function(e){tm.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1));},{passive:true});
    function size(){
      if(!rd||!cam)return;
      rd.setPixelRatio(perf ? perf.getTargetPixelRatio() : Math.min(devicePixelRatio||1,1.5));
      rd.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();
    }
    addEventListener('resize',perf ? perf.debounce(size,80) : size);size();

    function loop(){
      if(!open){animId=null;return;}
      animId=requestAnimationFrame(loop);
      if(document.hidden)return;
      m.lerp(tm,.06);var t=clock.getElapsedTime();mat.uniforms.uTime.value=t;mat.uniforms.uMouse.value.copy(m);mat.uniforms.uPx.value=rd.getPixelRatio();rd.render(sc,cam);
      if((window.__sm||0)>=.86&&hd)hd.style.setProperty('--ph',String(Math.round(300+Math.sin(t*.6)*14)));
    }
  }catch(e){
    console.warn('[BEM overlay] WebGL init fallback:',e);
    rd=null;
  }
}

function startLoop(){if(rd&&!animId)animId=requestAnimationFrame(loop);}
function others(){return (AB&&AB.classList.contains('on'))||(PT&&PT.classList.contains('on'))||(document.getElementById('vps')&&document.getElementById('vps').classList.contains('on'))||(document.getElementById('vds')&&document.getElementById('vds').classList.contains('on'));}
function openV(){if(open)return;open=true;window.__aboutOpen=true;document.body.classList.add('be');document.body.classList.remove('mmo','mgo');V.classList.add('on');V.scrollTop=0;startLoop();}
function closeV(){if(!open)return;open=false;document.body.classList.remove('be');V.classList.remove('on');if(!others())window.__aboutOpen=false;}
function sync(){if(location.hash==='#email'){location.replace('#p-email');return;}closeV();}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('.dd a.sv');if(a){var b=a.querySelector('b');if(b&&b.textContent==='Basic Email'){e.preventDefault();e.stopImmediatePropagation();document.querySelectorAll('.dd.open').forEach(function(x){x.classList.remove('open');});location.hash='p-email';}}},true);
addEventListener('hashchange',sync);
addEventListener('keydown',function(e){if(e.key==='Escape'&&open){location.hash='';sync();}});
sync();
})();
} catch (err) { console.error("[Business Email page]", err); }
