/**
 * Partner overlay with its own canvas and open/close handling.
 * Wires the interactive Profit Calculator and the Application Form.
 */
/* ---- Partner overlay ---- */
try {
(function(){
var P=document.getElementById('partner'),AB=document.getElementById('about'),hd=document.getElementById('hdr'),mm=document.getElementById('mm'),open=false;
if(!P)return;

var perf = window.WebGLPerf;
var tier = perf ? perf.getTier() : 'high';
var hasGL = tier !== 'fallback' && (!perf || perf.checkSupport());
var rd = null, sc = null, cam = null, mat = null, animId = null;

if (hasGL) {
  try {
    var cv=document.createElement('canvas');cv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none';P.insertBefore(cv,P.firstChild);
    rd=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:false});
    rd.setPixelRatio(perf ? perf.getTargetPixelRatio() : Math.min(devicePixelRatio||1,1.5));
    sc=new THREE.Scene();cam=new THREE.PerspectiveCamera(50,1,.1,100);cam.position.z=10;
    var N=tier==='low'?700:(tier==='medium'?1400:2200);
    var pos=new Float32Array(N*3),sd=new Float32Array(N),sz=new Float32Array(N);
    for(var i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*30;pos[i*3+1]=(Math.random()-.5)*16;pos[i*3+2]=(Math.random()-.5)*16-2;sd[i]=Math.random();sz[i]=.5+Math.random()*1.8;}
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(sd,1));g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
    mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0},uMouse:{value:new THREE.Vector2()},uPx:{value:rd.getPixelRatio()},uTint:{value:new THREE.Color().setHSL(190/360,.8,.66)}},
    vertexShader:'attribute float aSeed;attribute float aSize;uniform float uTime,uPx;uniform vec2 uMouse;varying float vTw;varying float vSeed;void main(){vec3 p=position;float sp=.25+aSeed*.55;p.y=mod(p.y-uTime*sp+8.,16.)-8.;p.x+=sin(uTime*.4+aSeed*20.)*.35;vec2 d=p.xy-uMouse*vec2(11.,6.);float f=exp(-dot(d,d)*.12);p.xy+=normalize(d+1e-4)*f*1.4;vec4 mv=modelViewMatrix*vec4(p,1.);vTw=pow(.5+.5*sin(uTime*(1.5+aSeed*4.)+aSeed*60.),5.);vSeed=aSeed;gl_PointSize=aSize*(1.+vTw*1.8)*(34./-mv.z)*uPx;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform vec3 uTint;varying float vTw;varying float vSeed;void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv);float gl=smoothstep(.5,0.,d);float c=max(0.,1.-abs(uv.x)*22.)*max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.x)*2.2);vec3 col=mix(uTint,vec3(.75,.95,1.),vSeed*.6);col=mix(col,vec3(1.),vTw*.8);float a=gl*gl*.55+c*vTw;gl_FragColor=vec4(col*a,a);}'});
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
      if((window.__sm||0)>=.86&&hd)hd.style.setProperty('--ph',String(Math.round(200+Math.sin(t*.6)*14)));
    }
  }catch(e){
    console.warn('[Partner overlay] WebGL init fallback:',e);
    rd=null;
  }
}

function startLoop(){if(rd&&!animId)animId=requestAnimationFrame(loop);}
function openP(){if(open)return;open=true;window.__aboutOpen=true;document.body.classList.add('pt');document.body.classList.remove('mmo','mgo');P.classList.add('on');P.scrollTop=0;startLoop();}
function closeP(){if(!open)return;open=false;document.body.classList.remove('pt');P.classList.remove('on');window.__aboutOpen=false;}
function sync(){
  if(location.hash==='#partner'||location.hash==='#pg-partner'||location.hash.indexOf('#partner')===0){
    window.location.replace('/partners');
  } else {
    closeP();
  }
}
function route(e){
  var a=e.target.closest&&e.target.closest('a');
  if(!a)return;
  var href=a.getAttribute('href')||'';
  if(href==='#partner'||href==='/partners'||href==='/partner'||href.indexOf('/partner')>-1){
    e.preventDefault();
    e.stopImmediatePropagation();
    window.location.href='/partners';
  }
}
hd.addEventListener('click',route,true);mm.addEventListener('click',route,true);
addEventListener('hashchange',sync);
addEventListener('keydown',function(e){if(e.key==='Escape'&&open){location.hash='';sync()}});

var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{root:P,threshold:.12});
P.querySelectorAll('.rv').forEach(function(n){io.observe(n)});

P.addEventListener('pointermove',function(e){var c=e.target.closest&&e.target.closest('.chip');if(!c)return;var r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px')});

// Smooth scroll for internal inpage links
P.addEventListener('click',function(e){
  var a=e.target.closest&&e.target.closest('a[href^="#inpage-"]');
  if(a){
    e.preventDefault();
    var targetId=a.getAttribute('href').slice(1);
    var target=document.getElementById(targetId);
    if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
  }
});

// Profit Calculator in #partner overlay
(function(){
  var spendSlider=document.getElementById('in-spend-slider');
  var clientsSlider=document.getElementById('in-clients-slider');
  var spendLabel=document.getElementById('in-spend-label');
  var clientsLabel=document.getElementById('in-clients-label');
  var tierQualifiedEl=document.getElementById('in-tier-qualified');
  var discountPctEl=document.getElementById('in-discount-pct');
  var monthlySavingsEl=document.getElementById('in-monthly-savings');
  var annualProfitEl=document.getElementById('in-annual-profit');

  if(!spendSlider)return;

  function update(){
    var spend=Number(spendSlider.value)||150000;
    var clients=Number(clientsSlider.value)||25;
    spendLabel.textContent='৳'+spend.toLocaleString()+' / month';
    clientsLabel.textContent=clients+' Clients';

    var tier='Registered Partner',disc=0.05;
    if(spend>=360000){tier='Platinum Partner';disc=0.20}
    else if(spend>=120000){tier='Gold Partner';disc=0.15}
    else if(spend>=30000){tier='Silver Partner';disc=0.10}

    var monthly=spend*disc;
    tierQualifiedEl.textContent=tier;
    discountPctEl.textContent=Math.round(disc*100)+'%';
    monthlySavingsEl.textContent='৳'+Math.round(monthly).toLocaleString();
    annualProfitEl.textContent='৳'+Math.round(monthly*12).toLocaleString();
  }

  spendSlider.addEventListener('input',update);
  clientsSlider.addEventListener('input',update);
  update();
})();

// Partner Application Form in #partner overlay
(function(){
  var form=document.getElementById('inpage-partner-form');
  var feedback=document.getElementById('inpage-feedback');
  var submitBtn=document.getElementById('inp-submit-btn');

  if(!form)return;

  function readDataUrl(file){
    return new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onload=function(){resolve(reader.result)};
      reader.onerror=function(){reject(new Error('Failed reading '+file.name))};
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit',async function(e){
    e.preventDefault();
    feedback.className='ptn-form-status';
    feedback.style.display='none';

    var tlInput=document.getElementById('inp-tradeLicense');
    var nidInput=document.getElementById('inp-nidDocument');

    if(!tlInput.files||!tlInput.files.length){
      feedback.textContent='Trade License (PDF) is mandatory. Please upload your company Trade License.';
      feedback.className='ptn-form-status error';
      feedback.style.display='block';
      return;
    }

    if(!nidInput.files||!nidInput.files.length){
      feedback.textContent='National ID (NID) is mandatory. Please upload your NID document in PDF format.';
      feedback.className='ptn-form-status error';
      feedback.style.display='block';
      return;
    }

    var tlFile=tlInput.files[0];
    var nidFile=nidInput.files[0];

    if(!tlFile.name.toLowerCase().endsWith('.pdf')&&tlFile.type!=='application/pdf'){
      feedback.textContent='Trade License must be a PDF file (.pdf).';
      feedback.className='ptn-form-status error';
      feedback.style.display='block';
      return;
    }

    if(!nidFile.name.toLowerCase().endsWith('.pdf')&&nidFile.type!=='application/pdf'){
      feedback.textContent='National ID document must be a PDF file (.pdf).';
      feedback.className='ptn-form-status error';
      feedback.style.display='block';
      return;
    }

    submitBtn.disabled=true;
    submitBtn.textContent='Uploading Documents & Submitting...';

    try {
      var docs=await Promise.all([readDataUrl(tlFile),readDataUrl(nidFile)]);
      var payload={
        fullName:document.getElementById('inp-fullName').value,
        businessName:document.getElementById('inp-bizName').value,
        businessEmail:document.getElementById('inp-email').value,
        phoneNumber:document.getElementById('inp-phone').value,
        country:document.getElementById('inp-country').value,
        businessType:document.getElementById('inp-bizType').value,
        estimatedMonthlySpend:document.getElementById('inp-spend').value,
        expectedCustomers:'10 - 50 Customers',
        partnershipModel:document.getElementById('inp-model').value,
        servicesOfInterest:['Cloud VPS','Dedicated Server','Reseller cPanel'],
        businessDescription:document.getElementById('inp-desc').value,
        agreeTerms:document.getElementById('inp-agree').checked,
        tradeLicense:{name:tlFile.name,data:docs[0],size:tlFile.size},
        nidDocument:{name:nidFile.name,data:docs[1],size:nidFile.size}
      };

      var res=await fetch('/api/public/applications',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      var data=await res.json();
      if(!res.ok||data.error)throw new Error(data.message||'Submission failed');

      feedback.innerHTML='<strong>Application Received!</strong> Reference: <b style="color:var(--ptn-cyan);font-size:16px;">'+data.referenceNo+'</b><br>'+data.message+'<br>Trade License and NID documents securely attached.';
      feedback.className='ptn-form-status success';
      feedback.style.display='block';
      form.reset();
    } catch(err) {
      feedback.textContent=err.message;
      feedback.className='ptn-form-status error';
      feedback.style.display='block';
    } finally {
      submitBtn.disabled=false;
      submitBtn.textContent='Submit Application';
    }
  });
})();

sync();
})();
} catch (err) { console.error("[Partner overlay]", err); }
