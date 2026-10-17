/**
 * Scroll-driven service slides inside #svc (with anime.js ambient pulse and click burst).
 */
/* ---- Service slides ---- */
try {
(function(){
  var B=(window.UNIFIED_CONFIG&&window.UNIFIED_CONFIG.servicesUrl)||'https://unified.it.com/services/',WR=document.getElementById('svc'),INTRO=4;
  var SV=[
    ['Cloud VPS Hosting','cloud-vps','Flexible virtual servers you can spin up fast and scale as your project grows.',270],
    ['Agentic AI','agentic-ai','Autonomous AI agents that plan, reason, use tools, and execute workflows for your business.',255],
    ['Managed Hosting','manage-hosting','Hosting that is looked after for you, so your team can focus on the product.',285],
    ['Email Hosting','email-hosting','Professional email on your own domain for you and your team.',305],
    ['Microsoft 365','microsoft','Productivity and collaboration tools for your whole organisation.',240],
    ['SSL Certificates','ssl-certification','Encrypt traffic and show visitors your site can be trusted.',275],
    ['Domain Registration','domain-registration','Find and secure the web address that carries your brand.',225],
    ['Cloud Storage','cloud-storage','Store, share and reach your files from anywhere.',265],
    ['Cyber Security Services','cyber-security','Protection and monitoring to help keep your systems and data safe.',292]
  ];
  var N=SV.length, mobile=function(){return innerWidth<760};
  
  // ---- DOM panels + dots ----
  var panels=[], dots=[], dotsEl=document.getElementById('dots');
  SV.forEach(function(s,i){
    var d=document.createElement('div');
    d.className='panel '+(i%2?'l':'r');
    var isAgentic = s[1] === 'agentic-ai';
    var href = isAgentic ? 'https://unified.it.com/agentic-ai' : B + s[1];
    var cta = isAgentic ? 'Explore Agents →' : 'Order Now →';
    d.innerHTML='<div class="n">'+String(i+1).padStart(2,'0')+' / '+N+'</div>'+
      '<h2><a class="t" href="'+href+'" target="_blank" rel="noopener">'+s[0]+'</a></h2>'+
      '<p>'+s[2]+'</p><a class="go" href="'+href+'" target="_blank" rel="noopener">'+cta+'</a>';
    WR.appendChild(d); panels.push(d);
    var b=document.createElement('button'); b.setAttribute('aria-label',s[0]);
    b.onclick=function(){scrollTo({top:(INTRO+i)*innerHeight,behavior:'smooth'})};
    dotsEl.appendChild(b); dots.push(b);
  });

  // ---- animated service logos (stroke-drawn SVG) ----
  var ICONS=[
    '<path d="M28 62h46a14 14 0 0 0 2-27.8A20 20 0 0 0 38 30a17 17 0 0 0-10 32z"/><path d="M40 72h20M50 62v10M38 48h24"/>',
    '<path d="M50 14L81.2 32v36L50 86 18.8 68V32Z"/><circle cx="50" cy="50" r="16"/><circle cx="50" cy="50" r="7"/><path d="M50 14v20M50 66v20M81.2 32L64 42M18.8 68L36 58M81.2 68L64 58M18.8 32L36 42"/><circle cx="50" cy="14" r="3.5"/><circle cx="81.2" cy="32" r="3.5"/><circle cx="81.2" cy="68" r="3.5"/><circle cx="50" cy="86" r="3.5"/><circle cx="18.8" cy="68" r="3.5"/><circle cx="18.8" cy="32" r="3.5"/><path d="M50 46l2 4-2 4-2-4z"/>',
    '<circle cx="50" cy="50" r="13"/><circle cx="50" cy="50" r="28"/><path d="M50 14v8M50 78v8M14 50h8M78 50h8M24.5 24.5l6 6M69.5 69.5l6 6M75.5 24.5l-6 6M30.5 69.5l-6 6"/>',
    '<rect x="14" y="26" width="72" height="48" rx="6"/><path d="M16 30l34 26 34-26"/>',
    '<rect x="22" y="12" width="42" height="56" rx="5"/><path d="M31 26h24M31 36h24M31 46h14"/><circle cx="68" cy="66" r="9"/><path d="M52 90c2-12 10-16 16-16s14 4 16 16"/>',
    '<rect x="24" y="44" width="52" height="40" rx="6"/><path d="M34 44V32a16 16 0 0 1 32 0v12M50 58v12"/>',
    '<circle cx="50" cy="50" r="34"/><ellipse cx="50" cy="50" rx="14" ry="34"/><path d="M16 50h68M22 32h56M22 68h56"/>',
    '<path d="M28 66h44a14 14 0 0 0 2-27.8A20 20 0 0 0 36 34a17 17 0 0 0-8 32z"/><path d="M50 78V50M40 59l10-10 10 10"/>',
    '<path d="M50 14l32 12v22c0 20-14 32-32 38-18-6-32-18-32-38V26z"/><path d="M36 50l10 10 18-20"/>'
  ];
  var logos=ICONS.map(function(s){
    var d=document.createElement('div');d.className='logo';
    d.innerHTML='<svg viewBox="0 0 100 100">'+s+'</svg>';
    d.querySelectorAll('svg *').forEach(function(n){n.setAttribute('pathLength','1')});
    WR.appendChild(d);return d});
  var flashEl=document.createElement('div');flashEl.className='flash';WR.appendChild(flashEl);

  // ---- three.js ----
  var renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  WR.appendChild(renderer.domElement);
  var scene=new THREE.Scene();
  var cam=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,100); cam.position.z=10;

  var NP=2200,pos=new Float32Array(NP*3),sd=new Float32Array(NP),sz=new Float32Array(NP);
  for(var i=0;i<NP;i++){pos[i*3]=(Math.random()-.5)*30;pos[i*3+1]=(Math.random()-.5)*16;pos[i*3+2]=(Math.random()-.5)*16-2;sd[i]=Math.random();sz[i]=.5+Math.random()*1.8}
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('aSeed',new THREE.BufferAttribute(sd,1));
  g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
  var dm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0},uMouse:{value:new THREE.Vector2()},uBurst:{value:0},uScroll:{value:0},uVel:{value:0},uTint:{value:new THREE.Color(0x8a3dff)},uPx:{value:renderer.getPixelRatio()}},
    vertexShader:['attribute float aSeed;attribute float aSize;',
    'uniform float uTime,uBurst,uScroll,uVel,uPx;uniform vec2 uMouse;varying float vTw;varying float vSeed;',
    'void main(){vec3 p=position;float sp=.25+aSeed*.55+uVel*1.6;',
    'p.y=mod(p.y-uTime*sp+uScroll*(.4+aSeed)*1.5+8.,16.)-8.;',
    'p.x+=sin(uTime*.4+aSeed*20.)*.35;',
    'vec2 d=p.xy-uMouse*vec2(11.,6.);float f=exp(-dot(d,d)*.12);',
    'p.xy+=normalize(d+1e-4)*f*(1.4+uBurst*3.);p.xy+=normalize(p.xy+1e-4)*uBurst*aSeed*2.;',
    'vec4 mv=modelViewMatrix*vec4(p,1.);vTw=pow(.5+.5*sin(uTime*(.55+aSeed*1.5)+aSeed*60.),7.);vSeed=aSeed;',
    'gl_PointSize=aSize*(1.+vTw*1.8+uBurst)*(34./-mv.z)*uPx;gl_Position=projectionMatrix*mv;}'].join('\n'),
    fragmentShader:['uniform vec3 uTint;varying float vTw;varying float vSeed;',
    'void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv);float gl=smoothstep(.5,0.,d);',
    'float c=max(0.,1.-abs(uv.x)*22.)*max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.y)*22.)*max(0.,1.-abs(uv.x)*2.2);',
    'vec3 col=mix(uTint,vec3(1.,.6,.95),vSeed*.6);col=mix(col,vec3(1.),vTw*.8);',
    'float a=gl*gl*.55+c*vTw;gl_FragColor=vec4(col*a,a);}'].join('\n')});
  scene.add(new THREE.Points(g,dm));

  scene.add(new THREE.AmbientLight(0x7a4ac0,.8));
  var key=new THREE.DirectionalLight(0xe6c8ff,1);key.position.set(4,5,6);scene.add(key);
  var rim=new THREE.PointLight(0xa855ff,6,20);rim.position.set(-3,1,3);scene.add(rim);

  var geos=[new THREE.BoxGeometry(2.2,3.2,2.2,2,3,2),new THREE.IcosahedronGeometry(2.1,1),new THREE.TorusGeometry(1.5,.55,16,48),
    new THREE.OctahedronGeometry(2),new THREE.DodecahedronGeometry(1.8),new THREE.TorusKnotGeometry(1.2,.4,100,14,2,3),
    new THREE.CylinderGeometry(1.4,1.4,2.8,18,3),new THREE.ConeGeometry(1.7,3,6,3),new THREE.SphereGeometry(1.8,20,14),
    new THREE.TetrahedronGeometry(2.3),new THREE.TorusKnotGeometry(1.2,.35,120,14,3,5)];
  var shapes=geos.map(function(geo){
    var gr=new THREE.Group();
    var solid=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x2a0f4d,metalness:.6,roughness:.3,transparent:true,opacity:.55,emissive:0x3a1470,emissiveIntensity:.6}));
    var wire=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xc08cff,wireframe:true,transparent:true,opacity:.7}));
    gr.add(solid);gr.add(wire);gr.userData={solid:solid,wire:wire};gr.scale.setScalar(.001);scene.add(gr);return gr});

  // Inner nested neural lattice for Agentic AI background shape (slide 2)
  var innerAIWire = new THREE.Mesh(new THREE.OctahedronGeometry(1.3), new THREE.MeshBasicMaterial({color:0x5cf0ff,wireframe:true,transparent:true,opacity:.65}));
  shapes[1].add(innerAIWire);
  shapes[1].userData.tick = function(t, hue, w, S) {
    innerAIWire.rotation.x = -t * 0.65;
    innerAIWire.rotation.y = t * 0.85;
    innerAIWire.material.color.setHSL((hue + 0.1) % 1, 0.9, 0.75);
    innerAIWire.material.opacity = 0.45 + S.pulse * 0.35;
  };


  // ---- anime.js: ambient pulse + click burst ----
  var S={pulse:.6,burst:0},A=window.anime;
  if(A&&A.animate)A.animate(S,{pulse:[.4,1],duration:2400,loop:true,alternate:true,ease:'inOutSine'});
  addEventListener('pointerdown',function(e){
    if(!window.__svcOpen||(e.target.closest&&e.target.closest('a,button')))return;
    if(A&&A.animate){S.burst=1;A.animate(S,{burst:0,duration:1600,ease:'outExpo'})}
  });

  // ---- interaction ----
  var m=new THREE.Vector2(),tm=new THREE.Vector2();
  addEventListener('pointermove',function(e){tm.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1))});
  addEventListener('resize',function(){renderer.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()});

  var bgEl=document.getElementById('bg'),countEl=document.getElementById('count'),hintEl=document.getElementById('hint');
  var sp=0,prev=0,vel=0,clock=new THREE.Clock(),tint=new THREE.Color(),lastIdx=-1;
  function ease(x){return x*x*(3-2*x)}

  (function loop(){
    requestAnimationFrame(loop);
    if(window.__aboutOpen)return;var t=clock.getElapsedTime(),H=innerHeight;
    var p=ease(Math.min(1,Math.max(0,((window.__sm||0)-.86)/.14)));
    if(p<=.002){WR.style.display='none';window.__svcOpen=false;return;}
    WR.style.display='block';document.getElementById('count').style.opacity=p;var isOpen=p>=.999;window.__svcOpen=isOpen;WR.classList.toggle('open',isOpen);
    var rr=p*100,mk=isOpen?'none':'radial-gradient(circle at 50% 50%,#000 '+rr+'%,transparent '+(rr+12)+'%)';
    WR.style.webkitMaskImage=mk;WR.style.maskImage=mk;
    var target=Math.min(Math.max((scrollY-INTRO*H)/H,0),N-1);
    sp+=(target-sp)*.075;
    vel+=((Math.abs(sp-prev)*14)-vel)*.1;prev=sp;
    m.lerp(tm,.06);
    var i0=Math.floor(sp),i1=Math.min(i0+1,N-1),fr=ease(sp-i0);
    var hue=(SV[i0][3]*(1-fr)+SV[i1][3]*fr)/360;
    bgEl.style.background='radial-gradient(ellipse at 50% 40%,hsl('+(hue*360)+',68%,30%) 0%,hsl('+(hue*360-10)+',75%,14%) 40%,hsl('+(hue*360-20)+',80%,4%) 85%)';
    tint.setHSL(hue,.9,.62);
    document.getElementById('hdr').style.setProperty('--hb','hsla('+(228+(hue*360-228)*p)+',55%,'+(14+S.pulse*4)+'%,.62)');document.getElementById('hdr').style.setProperty('--ph',String(Math.round(228+(hue*360-228)*p+S.pulse*14)));
    dm.uniforms.uTint.value.copy(tint);
    dm.uniforms.uTime.value=t;dm.uniforms.uMouse.value.copy(m);
    dm.uniforms.uBurst.value=S.burst;dm.uniforms.uScroll.value=sp;dm.uniforms.uVel.value=Math.min(vel,1.2);
    rim.color.setHSL(hue,.9,.6);rim.intensity=3+S.pulse*5+S.burst*12;
    cam.position.x+=(m.x*.8-cam.position.x)*.04;cam.position.y+=(m.y*.5-cam.position.y)*.04;
    cam.position.z=10-Math.min(vel,1)*1.2;cam.lookAt(0,0,0);

    var mob=mobile();
    shapes.forEach(function(s,i){
      var d=Math.abs(sp-i),w=Math.max(0,1-d);w=ease(w);
      var side=(i%2?1:-1)*-1; // shape opposite the text panel
      var tx=mob?0:(i%2?2.8:-2.8)*-1;tx+=mob?0:(s.userData.dx||0);
      var sc=(mob?.62:1)*w;
      s.scale.setScalar(Math.max(sc,.001));s.visible=w>.01;
      var dir=sp-i; // slide in/out along scroll
      s.position.set(tx+ (mob?0:dir*-2), (mob?1.9:0)+dir*1.6+Math.sin(t*.8+i)*.15, -Math.abs(dir)*3);
      s.rotation.y=t*.35+sp*1.4+m.x*.5+i;s.rotation.x=sp*.9-m.y*.4+Math.sin(t*.3+i)*.1;
      var u=s.userData;
      if(u.upright){s.rotation.y=Math.sin(t*.45)*.55+m.x*.35;s.rotation.x=.08+Math.sin(t*.3)*.03-m.y*.1;}
      u.wire.material.color.setHSL(hue,.85,.7);u.wire.material.opacity=.45+S.pulse*.3;
      u.solid.material.emissive.setHSL(hue,.8,.18+S.pulse*.08);
      if(u.tick)u.tick(t,hue,w,S);
    });

    logos.forEach(function(L,i){
      var d=sp-i,w=ease(Math.max(0,1-Math.abs(d)*1.15));
      var draw=ease(Math.min(1,Math.max(0,(w-.12)/.72)));
      L.style.left=mob?'50%':(i%2?'73%':'27%');L.style.top=mob?'25%':'50%';
      L.style.opacity=Math.min(1,w*1.6);
      L.style.setProperty('--p',draw.toFixed(3));
      L.style.setProperty('--g','hsl('+(hue*360)+',90%,65%)');
      L.style.transform='translate(-50%,-50%) scale('+((mob?.7:1)*(.72+.28*w+S.burst*.14))+') rotate('+(-d*28)+'deg)';
    });
    var act=Math.round(sp);
    panels.forEach(function(p,i){
      var d=sp-i,a=Math.max(0,1-Math.abs(d)*1.7);a=ease(a);
      var ty=mob?(-d*40):(-50+(-d*40));
      p.style.opacity=a;
      p.style.transform=mob?('translateY('+(-d*40)+'px)'):('translateY(calc(-50% + '+(-d*40)+'px)) translateX('+(d*(i%2?-1:1)*-30)+'px)');
      p.style.filter='blur('+((1-a)*8)+'px)';
      p.classList.toggle('on',a>.6);
    });
    if(act!==lastIdx){
      if(lastIdx>=0){
        if(A&&A.animate){S.burst=1;A.animate(S,{burst:0,duration:1400,ease:'outExpo'})}
        flashEl.style.left=mob?'50%':(act%2?'73%':'27%');flashEl.style.top=mob?'25%':'50%';
        flashEl.classList.remove('go');void flashEl.offsetWidth;flashEl.classList.add('go');
      }
      lastIdx=act;countEl.textContent=String(act+1).padStart(2,'0')+' / '+N;dots.forEach(function(b,i){b.classList.toggle('a',i===act)})}
    hintEl.style.opacity=sp<.3?.55:0;
    renderer.render(scene,cam);
  })();
})();
} catch (err) { console.error("[Service slides]", err); }
