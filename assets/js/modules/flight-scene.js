/**
 * Three.js hero scene: cloud-dive shader, server racks from assets/models, laptop and
 * camera path driven by scroll. Publishes window.__sm (smoothed scroll progress).
 */
/* ---- Hero scene ---- */
try {
(function(){
var T=THREE, canvas=document.getElementById('gl');
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
var renderer;
try{renderer=new T.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});}catch(e){return;}
renderer.autoClear=false;
renderer.outputEncoding=T.sRGBEncoding; renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
var ss=function(a,b,x){x=Math.min(1,Math.max(0,(x-a)/(b-a)));return x*x*(3-2*x);};
var lerp=function(a,b,k){return a+(b-a)*k;};
var ortho=new T.OrthographicCamera(-1,1,1,-1,0,1);
var QV='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
function quad(mat){var m=new T.Mesh(new T.PlaneGeometry(2,2),mat);m.frustumCulled=false;return m;}
var VEIL=new T.Vector3(.66,.72,.88);

/* ---------- Phase 1: volumetric clouds, rendered to a low-res target ---------- */
var cloudRT=new T.WebGLRenderTarget(2,2,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false});
var cu={uRes:{value:new T.Vector2(2,2)},uTravel:{value:0},uDusk:{value:0},uTime:{value:0},uCamY:{value:0},uWhite:{value:0},
  uLook:{value:new T.Vector3()},uSun:{value:new T.Vector3()},uVeil:{value:VEIL}};
var cloudScene=new T.Scene();
cloudScene.add(quad(new T.ShaderMaterial({uniforms:cu,vertexShader:QV,fragmentShader:document.getElementById('cfs').textContent,depthTest:false,depthWrite:false})));
var blit=new T.Scene();
blit.add(quad(new T.ShaderMaterial({uniforms:{t:{value:cloudRT.texture}},vertexShader:QV,depthTest:false,depthWrite:false,
  fragmentShader:'uniform sampler2D t;varying vec2 vUv;void main(){gl_FragColor=texture2D(t,vUv);}'})));

/* ---------- Phase 2: the retro computer scene ---------- */
var pc=new T.Scene(), cam=new T.PerspectiveCamera(38,1,.1,60);
var NOISE='float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}';
// Drifting violet mist backdrop
var bu={uTime:{value:0},uShift:{value:0}};
var bd=quad(new T.ShaderMaterial({uniforms:bu,vertexShader:QV,depthTest:false,depthWrite:false,
 fragmentShader:'uniform float uTime,uShift;varying vec2 vUv;'+NOISE+
 'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n2(p);p=p*2.03+17.;a*=.5;}return s;}'+
 'void main(){vec2 p=vUv*vec2(2.2,1.3)+vec2(uShift,0.);float t=uTime*.03;'+
 'vec2 w=vec2(fbm(p+t),fbm(p+5.2-t));float m=fbm(p*1.3+w*1.6+t*2.);'+
 'float low=smoothstep(.75,.0,vUv.y);float glow=exp(-pow(length((vUv-vec2(.72,.2))*vec2(1.,1.6)),2.)*3.);'+
 'vec3 c=vec3(.008,.012,.03)+vec3(.17,.21,.42)*pow(m,2.2)*(.35+low*1.3)+vec3(.34,.40,.66)*glow*(.25+m*.8);'+
 'c*=smoothstep(1.35,.25,length(vUv-.5)*1.5);gl_FragColor=vec4(c,1.);}'}));
bd.renderOrder=-1; pc.add(bd);

// environment map for believable plastic reflections
var envS=new T.Scene();
envS.add(new T.Mesh(new T.BoxGeometry(20,20,20),new T.MeshBasicMaterial({color:0x1b1224,side:T.BackSide})));
function panel(c,w,h,x,y,z){var m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color().setRGB(c[0],c[1],c[2]),side:T.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);envS.add(m);}
panel([7,5.5,4],6,4,-6,6,6); panel([3,.8,2.2],2,8,8,2,-5); panel([.6,.7,1.4],8,3,0,-3,8);
var pmrem=new T.PMREMGenerator(renderer); pc.environment=pmrem.fromScene(envS,.04).texture;

var rig=new T.Group(); pc.add(rig);
var tc=document.createElement('canvas'); tc.width=640; tc.height=400; var tg=tc.getContext('2d'); var tt=new T.CanvasTexture(tc);
var su={tTerm:{value:tt},uTime:{value:0},uMouse:{value:new T.Vector2()},uUvMin:{value:new T.Vector2(0,0)},uUvMax:{value:new T.Vector2(1,1)}};
var crt=new T.ShaderMaterial({uniforms:su,side:T.DoubleSide,
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform sampler2D tTerm;uniform float uTime;uniform vec2 uMouse;varying vec2 vUv;'+NOISE+'void main(){vec2 c=vUv*2.-1.;c*=1.+.012*dot(c,c);vec2 st=c*.5+.5;float e=step(0.,st.x)*step(st.x,1.)*step(0.,st.y)*step(st.y,1.);vec2 ts=(st-.5)*1.18+.5;float tx=texture2D(tTerm,ts).r;float gl=0.;for(int i=0;i<4;i++){float a=float(i)*1.5708;gl+=texture2D(tTerm,ts+vec2(cos(a),sin(a))*.008).r;}vec3 col=vec3(1.,.74,.38)*(tx+gl*.18);vec2 p=(st-.5)*vec2(1.33,1.)-vec2(.04,0.)-uMouse*.08;vec3 sp=vec3(0.);for(int k=0;k<3;k++){float sc=22.+float(k)*16.;vec2 g=p*sc;vec2 id=floor(g),f=fract(g)-.5;float h=h2(id+float(k)*7.3);vec2 o=(vec2(h2(id+1.3),h2(id+2.7))-.5)*.6;float d=length(f-o);float tw=.5+.5*sin(uTime*(2.+h*6.)+h*40.);float m=smoothstep(.62,.0,length((p+.06*vec2(sin(uTime*.5+p.y*5.),cos(uTime*.4+p.x*5.)))*vec2(1.,1.5)));vec3 tint=mix(vec3(1.,.85,.5),vec3(.4,1.,.55),step(.8,fract(h*13.)));tint=mix(tint,vec3(1.,.35,.5),step(.9,fract(h*7.)));sp+=tint*smoothstep(.13,.0,d)*tw*m*step(.55,h)*(h+.4)*2.2;}col+=sp*.8*smoothstep(.3,.9,.5+.5*sin(uTime*.2));col+=sp*.35;col*=.78+.22*sin(st.y*320.);col*=.95+.05*sin(uTime*55.);col*=smoothstep(1.25,.35,length(c));col+=vec3(.02,.03,.02)+vec3(.05,.045,.04)*smoothstep(.8,.0,length(st-vec2(.15,.12)));gl_FragColor=vec4(col*e,1.);}'});
// one round plinth carries the rack and the TV table, so they move as a single unit
var pl=new T.Mesh(new T.CylinderGeometry(2.35,2.35,.06,128),new T.MeshStandardMaterial({color:0x0b090f,roughness:.5,metalness:.5,envMapIntensity:.4}));
pl.position.y=.03; pl.receiveShadow=true; rig.add(pl);
var ring=new T.Mesh(new T.TorusGeometry(2.35,.014,8,200),new T.MeshBasicMaterial({color:new T.Color().setRGB(3,.5,1.6)})); ring.rotation.x=Math.PI/2; ring.position.y=.062; rig.add(ring);
var floor=new T.Mesh(new T.PlaneGeometry(16,16),new T.ShadowMaterial({opacity:.5})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; pc.add(floor);
function tex(b64,srgb){var t=new T.TextureLoader().load('data:image/jpeg;base64,'+b64);if(srgb){t.encoding=T.sRGBEncoding;}t.anisotropy=8;return t;}
function rod(a,b,r,m){var d=b.clone().sub(a),k=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),10),m);k.position.copy(a).add(b).multiplyScalar(.5);k.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());k.castShadow=true;return k;}
function rr(w,h,r){var s=new T.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.absarc(x+w-r,y+r,r,-Math.PI/2,0);s.lineTo(x+w,y+h-r);s.absarc(x+w-r,y+h-r,r,0,Math.PI/2);s.lineTo(x+r,y+h);s.absarc(x+r,y+h-r,r,Math.PI/2,Math.PI);s.lineTo(x,y+r);s.absarc(x+r,y+r,r,Math.PI,Math.PI*1.5);return s;}
// no table any more: a laptop slides out of the back server rack and opens
var steel=new T.MeshStandardMaterial({color:0x26262b,roughness:.38,metalness:.85,envMapIntensity:.8});
function sh(m){m.castShadow=m.receiveShadow=true;return m;}
var LW=.62,LD=.42,LH=.4,LY=1.0,LZ0=-1.62,LZ1=-1.05,LOPEN=-.2;
var lap=new T.Group(); rig.add(lap);
var lapM=new T.MeshStandardMaterial({color:0x2a2a31,roughness:.35,metalness:.85,envMapIntensity:.9});
var trayM=new T.MeshStandardMaterial({color:0x1b1c21,roughness:.4,metalness:.8,envMapIntensity:.8});
var keyM=new T.MeshStandardMaterial({color:0x0c0c10,roughness:.6,metalness:.3});
var tray=sh(new T.Mesh(new T.BoxGeometry(LW+.1,.02,.9),trayM)); tray.position.set(0,-.012,-.22); lap.add(tray);
var base=sh(new T.Mesh(new T.ExtrudeGeometry(rr(LW,LD,.02),{depth:.018,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:2}),lapM)); base.rotation.x=-Math.PI/2; lap.add(base);
var keys=new T.Mesh(new T.BoxGeometry(LW*.86,.003,LD*.42),keyM); keys.position.set(0,.0245,-.05); lap.add(keys);
var pad=new T.Mesh(new T.BoxGeometry(.17,.003,.1),new T.MeshStandardMaterial({color:0x1a1a22,roughness:.4,metalness:.5})); pad.position.set(0,.0245,.13); lap.add(pad);
var lid=new T.Group(); lid.position.set(0,.026,-LD/2+.01); lap.add(lid);
var lidP=sh(new T.Mesh(new T.ExtrudeGeometry(rr(LW,LH,.02),{depth:.016,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:2}),lapM)); lidP.position.set(0,LH/2,-.016); lid.add(lidP);
var hinge=new T.Mesh(new T.CylinderGeometry(.008,.008,LW*.7,14),trayM); hinge.rotation.z=Math.PI/2; lid.add(hinge);
var sw=LW-.04, sh2=LH-.04, sg=new T.PlaneGeometry(sw,sh2);
var scr=new T.Mesh(sg,crt); scr.position.set(0,LH/2,.0085); lid.add(scr);
lap.position.set(0,LY,LZ1); lid.rotation.x=LOPEN;
rig.updateMatrixWorld(true); var scrCtr=rig.worldToLocal(scr.getWorldPosition(new T.Vector3()));
var ledG=null,ledR=null, rackLight=new T.PointLight(0x40ff95,.3,3,2); rackLight.position.set(0,.8,0); rig.add(rackLight);
var RM={SY_Chrome_shiny:[0xdfe3ea,1,.12],SY_Alum_matte_001:[0xb4b8be,1,.45],SY_Dark_annodized_matte:[0x1b1c21,.9,.5],SY_Dark_annodized_shiny:[0x14151a,.9,.2],SY_Dark_matte:[0x131316,.2,.65],SY_Med_matte:[0x25262b,.3,.6],'Material.009':[0x0b0b0d,.2,.5],SY_Rubber:[0x0e0e10,0,.85],SY_Blue_shiny:[0x1a3d9a,.4,.2],SY_Red_matte:[0x701616,.2,.6],steel:[0x9ea2a8,1,.35],SY_Steel_mat_001:[0x9ea2a8,1,.35],dark_steel:[0x3b3e44,1,.4],White:[0x8d8d96,0,.55]};
function b64buf(b){var t=atob(b),u=new Uint8Array(t.length);for(var i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u.buffer;}
function loadModel(url,ok){
  function fallback(err){if(window.UNIFIED_MODEL_B64)ldr.parse(b64buf(window.UNIFIED_MODEL_B64),'',ok,console.error);else console.error(err);}
  if(location.protocol==='file:'){fallback(new Error('fetch is unavailable on file://'));return;}
  fetch(url).then(function(r){if(!r.ok)throw new Error(url+' '+r.status);return r.arrayBuffer();}).then(function(buf){ldr.parse(buf,'',ok,console.error);}).catch(fallback);
}
function shadows(r){r.traverse(function(o){if(o.isMesh)o.castShadow=o.receiveShadow=true;});}
var ldr=new T.GLTFLoader(); ldr.setMeshoptDecoder(MeshoptDecoder);
// server rack, recoloured by material name (the OBJ shipped without textures)
loadModel((window.UNIFIED_CONFIG&&window.UNIFIED_CONFIG.modelUrl)||'assets/models/server-rack.glb',function(g){
  var root=g.scene; root.scale.setScalar(.66); shadows(root);
  root.traverse(function(o){if(!o.isMesh)return;var n=o.material.name,p=RM[n],m;
   if(/Green_5/.test(n)){m=new T.MeshStandardMaterial({color:0x061a0e,emissive:0x35ff85,emissiveIntensity:1.5,roughness:.4});ledG=m;}
   else if(/Red_5/.test(n)){m=new T.MeshStandardMaterial({color:0x200606,emissive:0xff2a2a,emissiveIntensity:1,roughness:.4});ledR=m;}
   else if(/glass/.test(n)){m=new T.MeshStandardMaterial({color:0x05060a,roughness:.12,transparent:true,opacity:.35,depthWrite:false,envMapIntensity:.8});o.castShadow=false;}
   else{p=p||[0x15161b,.2,.6];m=new T.MeshStandardMaterial({color:p[0],metalness:p[1],roughness:p[2],envMapIntensity:.55});}
   if(!RM[n]||/Green_5|Red_5|Blue/.test(n)){m.polygonOffset=true;m.polygonOffsetFactor=-2;m.polygonOffsetUnits=-2;}
   o.material=m;});
  [0,38,-38,76,-76,114,-114].forEach(function(off,k){var r=k?root.clone(true):root;var ph=(180+off)*Math.PI/180;
   r.position.set(Math.sin(ph)*1.75,.06,Math.cos(ph)*1.75);r.rotation.y=ph+Math.PI;rig.add(r);});
  /* put the laptop in front of wherever the back server really ends, so it never sinks into it */
  rig.updateMatrixWorld(true);
  var bb=new T.Box3().setFromObject(root),fz=bb.max.z-rig.position.z,rh=bb.max.y-bb.min.y;
  LZ1=fz+.62;LZ0=fz-.25;LY=bb.min.y-rig.position.y+rh*.45;
  lap.position.set(0,LY,LZ1);lid.rotation.x=LOPEN;rig.updateMatrixWorld(true);
  scrCtr.copy(rig.worldToLocal(scr.getWorldPosition(new T.Vector3())));glow.position.set(scrCtr.x,scrCtr.y,scrCtr.z+.45);
},console.error);

// lights: warm key, magenta rim, flickering screen glow
var key=new T.SpotLight(0xffd2a6,1.0,0,.6,1); key.position.set(-3.6,4.6,4.8); key.castShadow=true; key.shadow.mapSize.set(2048,2048); key.shadow.radius=5; key.shadow.camera.fov=45; key.shadow.camera.near=2; key.shadow.camera.far=16; key.shadow.bias=-.0005; key.shadow.normalBias=.02; pc.add(key,key.target);
var rim=new T.PointLight(0xff5fb8,.55); rim.position.set(3.4,1.6,-3.2); pc.add(rim);
var glow=new T.PointLight(0xffc27a,.9,4,2); glow.position.set(scrCtr.x,scrCtr.y,scrCtr.z+.45); rig.add(glow);
pc.add(new T.HemisphereLight(0x3b4d7a,0x120a18,.22));
// floating dust
var dp=new Float32Array(900); for(var i=0;i<dp.length;i++)dp[i]=(Math.random()-.5)*(i%3==1?5:9);
var dg=new T.BufferGeometry(); dg.setAttribute('position',new T.BufferAttribute(dp,3));
var dust=new T.Points(dg,new T.PointsMaterial({size:.022,color:0xffe3c4,transparent:true,opacity:.5,depthWrite:false,blending:T.AdditiveBlending})); pc.add(dust);

// terminal text drawn to canvas, typed out live
var LINES=['SHADER SYSTEMS  BASIC 4.0','64K RAM  38911 BYTES FREE','','READY.','LOAD "WORLD",8','SEARCHING FOR WORLD','LOADING','READY.','RUN','','> CLOUDS.OK  LIGHT.OK  PIXELS.OK','> ENTERING UNIFIED.IT.COM'],lastN=-1;
function typeText(sec){var total=LINES.join('\n').length+1,n=Math.floor(sec*16)%(total+60);if(n===lastN)return;lastN=n;
 tg.fillStyle='#000';tg.fillRect(0,0,640,400);tg.font='26px "Courier New",monospace';tg.fillStyle='#fff';
 var left=n,y=54;for(var i=0;i<LINES.length;i++){var s=LINES[i].slice(0,Math.max(0,left));left-=LINES[i].length+1;tg.fillText(s,48,y);y+=30;if(left<0){if(((n>>3)&1)||n>total)tg.fillRect(48+tg.measureText(s).width,y-52,14,26);break;}}
 tt.needsUpdate=true;}

/* ---------- veil: pale cloud colour that lifts to reveal the scene ---------- */
var vu={uA:{value:1},uC:{value:VEIL}}, veil=new T.Scene();
veil.add(quad(new T.ShaderMaterial({uniforms:vu,vertexShader:QV,transparent:true,depthTest:false,depthWrite:false,
 fragmentShader:'uniform float uA;uniform vec3 uC;varying vec2 vUv;void main(){gl_FragColor=vec4(uC,uA);}'})));

/* ---------- sizing, input, loop ---------- */
var scale=.5,ceilS=.9,avg=.016,cool=0,aspect=1,fitD=4,closeD=1.2;
function sizeCloud(){var w=Math.max(2,Math.round(innerWidth*scale)),h=Math.max(2,Math.round(innerHeight*scale));cloudRT.setSize(w,h);cu.uRes.value.set(w,h);}
function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(innerWidth,innerHeight,false);
 aspect=innerWidth/innerHeight;cam.aspect=aspect;cam.fov=38;cam.updateProjectionMatrix();var t=Math.tan(cam.fov*Math.PI/360),ea=aspect>=1?aspect*.5:aspect*.95;fitD=Math.max(1.85/t,1.55/(t*ea));closeD=Math.max(.36/(.62*2*t),.62/(.8*2*t*aspect));sizeCloud();}
addEventListener('resize',resize); resize();
var mx=0,my=0,sx=0,sy=0,travel=0,sm=0,last=performance.now(),t0=last,lastKey=0;
var moved=false; addEventListener('pointermove',function(e){if(e.pointerType==='mouse')moved=true;mx=e.clientX/innerWidth*2-1;my=e.clientY/innerHeight*2-1;});
var el={a:document.getElementById('a'),b:document.getElementById('b'),c:document.getElementById('c')};
function show(n,o,dy){n.style.opacity=o;n.style.transform='translateY('+(1-o)*dy+'px)';}

function frame(now){
 var dt=Math.min((now-last)/1000,.05); last=now; var time=(now-t0)/1000;
 var max=Math.max(1,innerHeight*4), s=(function(f){f=Math.min(1,f);return f<.34?f/.34*.64:.64+(f-.34)/.66*.36})(scrollY/max);
 sm+=(s-sm)*.1; window.__sm=sm; (function(){var h=document.getElementById("hdr"),o=window.__aboutOpen?1:Math.min(1,Math.max(0,(sm-.6)/.08));h.style.opacity=o;h.style.transform="translateY("+(-(1-o)*24)+"px)";h.style.pointerEvents=o>.9?"auto":"none";h.classList.toggle("on",o>.5);if(sm<.86){h.style.setProperty("--hb","hsla(228,50%,14%,.62)");h.style.setProperty("--ph",String(Math.round(222+Math.sin(performance.now()*.0007)*16+sm*10)));}})(); if((window.__svcOpen&&sm>.5)||window.__aboutOpen){requestAnimationFrame(frame);return;} if(!moved)mx=Math.sin(time*.35)*.6; sx+=(mx-sx)*.05; sy+=(my-sy)*.05;
 show(el.a,1-ss(.03,.18,sm),-30); show(el.b,ss(.62,.7,sm)*(1-ss(.8,.88,sm)),30); show(el.c,ss(.92,.98,sm),30); (function(){var d=document.getElementById('lat'),lo=ss(.62,.7,sm)*(1-ss(.8,.88,sm));d.style.opacity=lo;d.style.transform='translateY('+(1-lo)*30+'px)';d.style.pointerEvents=lo>.6?'auto':'none';})();

 if(sm<.5){ // dive through the cloud layer
  avg+=(dt-avg)*.05; cool++;
  if(cool>90){if(avg>.026&&scale>.3){ceilS=Math.min(ceilS,scale*.98);scale*=.86;sizeCloud();cool=0;}
   else if(avg<.0175&&scale<ceilS){scale=Math.min(ceilS,scale*1.06);sizeCloud();cool=0;}}
  var d=ss(.1,.45,sm); travel+=((reduce?.25:.9)+6*ss(.05,.45,sm))*dt;
  var yaw=sx*.4*(1-ss(.3,.5,sm)), el_=lerp(.5,.04,ss(0,.5,sm)), ce=Math.cos(el_);
  cu.uTravel.value=travel; cu.uDusk.value=.78*ss(0,.5,sm); cu.uTime.value=time; cu.uCamY.value=-1.6*d;
  cu.uWhite.value=ss(.34,.5,sm);
  cu.uLook.value.set(yaw,-.1-.45*Math.sin(Math.PI*Math.min(1,sm/.42))-sy*.15*(1-ss(.2,.4,sm)),-yaw*.25);
  cu.uSun.value.set(-.8*ce,Math.sin(el_),-.57*ce);
  renderer.setRenderTarget(cloudRT); renderer.clear(); renderer.render(cloudScene,ortho);
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(blit,ortho);
 } else {   // the retro computer scene
  var u=ss(.55,1,sm);
  typeText(time); su.uTime.value=time; su.uMouse.value.set(sx,-sy); bu.uTime.value=time; bu.uShift.value=u*.6;
  var e=u*u*(3-2*u);
  var lo=ss(.58,.84,sm),slide=ss(0,.55,lo),opn=ss(.45,1,lo);lap.visible=lo>.001;
  lap.position.set(0,LY,lerp(LZ0,LZ1,slide));lap.scale.setScalar(lerp(.55,1,slide));lid.rotation.x=lerp(Math.PI/2,LOPEN,opn);
  glow.intensity=.9+.12*Math.sin(time*47)+.08*Math.sin(time*13);
  if(ledG){var bl=Math.sin(time*3.1)*Math.sin(time*7.3);ledG.emissiveIntensity=1.1+.9*bl;if(ledR)ledR.emissiveIntensity=.8+.8*Math.max(0,Math.sin(time*1.7+Math.sin(time*5)));rackLight.intensity=.5+.25*bl;}
  rig.rotation.y=-.18*(1-e)+sx*.14; rig.rotation.x=sy*.04; rig.position.set(0,Math.sin(time*.6)*.01,0); rig.updateMatrixWorld(true);
  var wide=aspect>=1,tn=Math.tan(cam.fov*Math.PI/360),vw=2*fitD*tn*aspect,vh=2*fitD*tn;
  var mw=rig.localToWorld(scrCtr.clone()), cw=rig.localToWorld(scrCtr.clone().add(new T.Vector3(0,.02,closeD)));
  var tax=0, tay=1.0+(wide?0:.2*vh), pax=tax+fitD*.22, pay=tay+.4+fitD*.07, paz=fitD+.1;
  cam.position.set(lerp(pax,cw.x,e)+sx*.35*(1-e),lerp(pay,cw.y,e)-sy*.12*(1-e),lerp(paz,cw.z,e));
  cam.lookAt(lerp(tax,mw.x,e),lerp(tay,mw.y,e),lerp(.1,mw.z,e));
  key.target.position.set(0,.8,0); dust.rotation.y=time*.02; dust.position.y=Math.sin(time*.3)*.1;
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(pc,cam);
  vu.uA.value=1-ss(.5,.62,sm); if(vu.uA.value>.001)renderer.render(veil,ortho);
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
} catch (err) { console.error("[Hero scene]", err); }
