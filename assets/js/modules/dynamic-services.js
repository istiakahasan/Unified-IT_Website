/**
 * Builds the .pg service pages from window.SERVICE_PAGES (assets/js/data/service-
 * pages.js), the shared footer, and the Business / Hybrid / Microsoft 365 tab bar.
 */
/* ---- Page builder ---- */
try {
(function(){
var D=window.SERVICE_PAGES;
var IC={backup:'<ellipse cx="12" cy="5.5" rx="7" ry="3"/><path d="M5 5.5v12c0 1.7 3.1 3 7 3M19 5.5v5M5 11.5c0 1.7 3.1 3 7 3"/><path d="M19.5 20a3.6 3.6 0 1 1-1.2-6.3M17 12.5v3.2h3.2"/>',building:'<path d="M6 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M6 21h12M16 9h2a1 1 0 0 1 1 1v11M9.5 7.5h3M9.5 11h3M9.5 14.5h3"/>',spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',shield:'<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',gear:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',lock:'<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>',globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',cloud:'<path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 9.2 4.4 4.4 0 0 0 7 18z"/><path d="M12 15v-4M10 12.5l2-2 2 2"/>',grid:'<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>'};
var CH='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
function esc(t){return String(t).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
var hd=document.getElementById('hdr'),AB=document.getElementById('about'),PT=document.getElementById('partner'),V1=document.getElementById('vps'),V2=document.getElementById('vds'),V3=document.getElementById('bem');
var TAG={cloud:'Cloud VPS · Dedicated Server · Cloud Storage · 24/7 Expert Support',email:'Business Email · Email Hosting · Custom Domain · 24/7 Support',hybrid:'Hybrid Email · Business Email · Microsoft 365 · 24/7 Support',cyber:'Firewall · DDoS Protection · WAF · Malware Protection · Monitoring · 24/7 Support',hosting:'Web Hosting · Managed Hosting · 24/7 Expert Support',ssl:'DigiCert · Comodo · SSL Certificates · 24/7 Support',domain:'Domain Registration · Transfer · DNS Management',storage:'Cloud Storage · Object Storage · Backup Integration',m365:'Microsoft 365 · Deployment · Migration · Ongoing Management',backup:'Cloud Backup · Disaster Recovery · 24/7 Monitoring',industry:'Education · Government · Healthcare · Finance · Retail · Enterprise',agentic:'Agentic AI · Automation · Secure Deployment'};
function UF(tag){var B=(window.UNIFIED_CONFIG&&window.UNIFIED_CONFIG.siteUrl)||'https://unified.it.com/',lg=(document.querySelector('#hdr a.hlogo img')||{}).src||'';
function col(t,a){return '<div><h4>'+t+'</h4>'+a.map(function(x){return x[1]?'<a href="'+x[1]+'" target="_blank" rel="noopener">'+x[0]+'</a>':'<span>'+x[0]+'</span>'}).join('')+'</div>'}
var ic=function(d){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>'};
return '<footer class="uf"><div class="uft"><span class="ufn"><svg viewBox="0 0 24 24" fill="none" stroke="#6ea8ff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-3-6.2"/><circle cx="21" cy="4" r=".9" fill="#c27bff" stroke="none"/></svg>Unified Information Technology Limited</span><span class="ufg">'+tag+'</span></div><div class="ufm"><div class="ufb"><span class="ufl"><img alt="Unified Cloud" src="'+lg+'"></span><p>Bangladesh\'s enterprise cloud — built on Dhaka soil for garments, banking, and healthcare that cannot afford latency.</p><a href="tel:09617200800">'+ic('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>')+'09617-200800</a><a href="mailto:info@unifiedit.xyz">'+ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>')+'info@unifiedit.xyz</a><span class="ufa">'+ic('<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>')+'Mannan Tower (3rd Floor), Ka 96/3 Progati Sharani, Dhaka 1229, Bangladesh</span></div>'
+col('Products',[['Cloud Service',B+'services'],['Hosting',B+'services/manage-hosting'],['Email',B+'services/email-hosting'],['Microsoft 365',B+'services/microsoft'],['SSL Certificates',B+'services/ssl-certification'],['Domain Registration',B+'services/domain-registration'],['Cloud Storage',B+'services/cloud-storage'],['Cyber Security Services',B+'services/cyber-security']])
+col('Company',[['Services',B+'services'],['Pricing',B+'pricing'],['Blog',B+'blog'],['Careers',B+'career']])
+col('Support',[['Client Portal','https://billing.unifiedit.xyz'],['Submit Ticket',''],['Knowledge Base',''],['SLA Policy',''],['Contact Sales',B+'contact']])
+'</div><div class="ufz"><span>© 2026 Unified Information Technology Limited. All rights reserved.</span><span class="ufc"><i>ISO 27001</i><i>ISO 22301</i><i>PCI DSS</i></span></div></footer>'}
window.__UF=UF;
var pages={},curK=null,anchor=document.getElementById('lat');
Object.keys(D).forEach(function(k){var d=D[k],el=document.createElement('section');el.className='pg';el.id='pg-'+k;
el.style.setProperty('--a1',d.a1);el.style.setProperty('--a2',d.a2);
el.style.background='radial-gradient(ellipse at 40% 38%,hsl('+d.h+',52%,26%) 0%,hsl('+(d.h-4)+',62%,12%) 42%,hsl('+(d.h-8)+',72%,4%) 86%)';
var ico='<svg class="ei" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[d.ic]+'</svg>';
var logo='<div class="vlogo" aria-hidden="true"><svg viewBox="0 0 200 200"><defs><linearGradient id="lg-'+k+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+d.a1+'"/><stop offset="1" stop-color="'+d.a2+'"/></linearGradient></defs><g class="orb" fill="none" stroke="url(#lg-'+k+')" stroke-width="1.6" stroke-linecap="round"><circle cx="100" cy="100" r="92" stroke-dasharray="2 9" opacity=".7"/><circle cx="100" cy="8" r="3.5" fill="'+d.a1+'" stroke="none"/><circle cx="192" cy="100" r="2.5" fill="'+d.a2+'" stroke="none"/></g><g transform="translate(24 24) scale(6.33)" fill="none" stroke="url(#lg-'+k+')" stroke-width=".56" stroke-linecap="round" stroke-linejoin="round">'+IC[d.ic]+'</g></svg></div>';
var cards=d.cards.map(function(c,i){return '<div class="vc'+(c[4]?' pop':'')+'" style="--i:'+i+'">'+(c[4]?'<span class="badge">MOST POPULAR</span>':'')+ico+'<h3>'+esc(c[0])+'</h3><div class="ek">'+esc(c[1])+'</div><p class="vd">'+esc(c[2])+'</p><div class="vsp"></div><div class="eh">INCLUDES</div><ul class="el">'+c[3].map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul><a class="vb" href="mailto:info@unifiedit.xyz">Learn more '+CH+'</a></div>'}).join('');
el.innerHTML='<main class="vw">'+logo+(d.html?d.html:(d.pre||'')+'<div class="vg">'+cards+'</div>'+(d.post||''))+(d.noft?'':UF(TAG[k]||''))+'</main>';
document.body.insertBefore(el,anchor);pages[k]=el});
/* one shared dust field that moves into whichever page is open */
var cv=document.createElement('canvas');cv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none';
var rd=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:false});rd.setPixelRatio(Math.min(devicePixelRatio||1,2));
var sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,1,.1,100);cam.position.z=10;
var N=2200,pos=new Float32Array(N*3),sd=new Float32Array(N),sz=new Float32Array(N);
for(var i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*30;pos[i*3+1]=(Math.random()-.5)*16;pos[i*3+2]=(Math.random()-.5)*16-2;sd[i]=Math.random();sz[i]=.5+Math.random()*1.8}
var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(sd,1));g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
var mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
uniforms:{uTime:{value:0},uMouse:{value:new THREE.Vector2()},uPx:{value:rd.getPixelRatio()},uTint:{value:new THREE.Color().setHSL(.75,.9,.62)}},
vertexShader:'attribute float aSeed;attribute float aSize;uniform float uTime,uPx;uniform vec2 uMouse;varying float vTw;varying float vSeed;void main(){vec3 p=position;float sp=.25+aSeed*.55;p.y=mod(p.y-uTime*sp+8.,16.)-8.;p.x+=sin(uTime*.4+aSeed*20.)*.35;vec2 d=p.xy-uMouse*vec2(11.,6.);float f=exp(-dot(d,d)*.12);p.xy+=normalize(d+1e-4)*f*1.4;vec4 mv=modelViewMatrix*vec4(p,1.);vTw=pow(.5+.5*sin(uTime*(1.5+aSeed*4.)+aSeed*60.),5.);vSeed=aSeed;gl_PointSize=aSize*(1.+vTw*1.8)*(34./-mv.z)*uPx;gl_Position=projectionMatrix*mv;}',
fragmentShader:'uniform vec3 uTint;varying float vTw;varying float vSeed;void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv);float gl=smoothstep(.5,0.,d);float c=max(0.,1.-abs(uv.x)*22.)*max(0.,1.-abs(uv.y)*2.2)+max(0.,1.-abs(uv.y)*22.)*max(0.,1.-abs(uv.x)*2.2);vec3 col=mix(uTint,vec3(1.,.6,.95),vSeed*.6);col=mix(col,vec3(1.),vTw*.8);float a=gl*gl*.55+c*vTw;gl_FragColor=vec4(col*a,a);}'});
sc.add(new THREE.Points(g,mat));
var clock=new THREE.Clock(),m=new THREE.Vector2(),tm=new THREE.Vector2();
addEventListener('pointermove',function(e){tm.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1))});
function size(){rd.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()}
addEventListener('resize',size);size();
(function loop(){requestAnimationFrame(loop);if(!curK)return;m.lerp(tm,.06);var t=clock.getElapsedTime();mat.uniforms.uTime.value=t;mat.uniforms.uMouse.value.copy(m);mat.uniforms.uPx.value=rd.getPixelRatio();rd.render(sc,cam);
if((window.__sm||0)>=.86)hd.style.setProperty('--ph',String(Math.round(D[curK].h+Math.sin(t*.6)*12)))})();
function others(){return AB.classList.contains('on')||PT.classList.contains('on')||V1.classList.contains('on')||V2.classList.contains('on')||V3.classList.contains('on')}
function openP(k){Object.keys(pages).forEach(function(x){if(x!==k)pages[x].classList.remove('on')});var el=pages[k];
if(curK!==k){curK=k;el.insertBefore(cv,el.firstChild);mat.uniforms.uTint.value.setHSL(D[k].h/360,.9,.62);size();el.scrollTop=0}
window.__aboutOpen=true;document.body.classList.add('pgo');document.body.classList.remove('mmo','mgo');el.classList.add('on')}
function closeP(){if(!curK)return;pages[curK].classList.remove('on');curK=null;document.body.classList.remove('pgo');if(!others())window.__aboutOpen=false}
function sync(){var h=location.hash;if(h==='#email'||h==='#bem'){location.replace('#p-email');return}if(h.indexOf('#p-')===0&&D[h.slice(3)])openP(h.slice(3));else closeP()}
addEventListener('hashchange',sync);
addEventListener('keydown',function(e){if(e.key==='Escape'&&curK){location.hash='';sync()}});
/* every service link opens its own page here instead of the live site */
var MAP={'signup':'p-signup','services/hybrid-email':'p-hybrid','agentic-ai':'p-agentic','contact':'p-contact','portal':'p-login','partner':'partner','services':'p-cloud','services/cloud-vps':'vps','services/dedicated-server':'vds','services/email-hosting':'p-email','services/email':'p-email','services/microsoft':'p-m365','services/cyber-security':'p-cyber','services/manage-hosting':'p-hosting','services/ssl-certification':'p-ssl','services/domain-registration':'p-domain','services/cloud-storage':'p-storage'};
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="https://unified.it.com/"],a[href^="https://billing.unifiedit.xyz"]');if(!a)return;
var hr=a.getAttribute('href'),key=hr.indexOf('billing.')>0?'portal':hr.replace('https://unified.it.com/','').replace(/\/$/,'');if(!MAP.hasOwnProperty(key))return;
e.preventDefault();e.stopImmediatePropagation();document.querySelectorAll('.dd.open').forEach(function(x){x.classList.remove('open')});document.body.classList.remove('mgo','mmo');
location.hash=MAP[key];sync()},true);
document.addEventListener('submit',function(e){var f=e.target.closest&&e.target.closest('form[data-f]');if(!f)return;e.preventDefault();
if(f.getAttribute('data-f')==='signup'){var n2=f.querySelector('.ln'),pw=f.querySelectorAll('input[type=password]');n2.hidden=false;n2.textContent=pw[0].value!==pw[1].value?'The passwords do not match.':'Sign-up is not connected in this preview, so nothing was sent.';return}
if(f.getAttribute('data-f')==='login'){var n=f.querySelector('.ln');n.hidden=false;n.textContent='Sign-in is not connected in this preview, so nothing was sent.';return}
var q=function(x){return f.querySelector('[name='+x+']').value};
location.href='mailto:info@unifiedit.xyz?subject='+encodeURIComponent('Website enquiry from '+q('n'))+'&body='+encodeURIComponent(q('m')+'\n\nName: '+q('n')+'\nEmail: '+q('e')+'\nPhone: '+q('p'))});
sync();
})();
} catch (err) { console.error("[Page builder]", err); }
/* ---- Footer taglines ---- */
try {
(function(){[['vps','Cloud VPS Hosting · Instant Provisioning · 24/7 Expert Support'],['vds','Dedicated Server Hosting · Bare Metal Performance · 24/7 Expert Support'],['bem','Business Email · Email Hosting · 24/7 Expert Support']].forEach(function(x){var w=document.querySelector('#'+x[0]+' .vw');if(w&&window.__UF)w.insertAdjacentHTML('beforeend',window.__UF(x[1]))})})();
} catch (err) { console.error("[Footer taglines]", err); }
/* ---- Email tabs ---- */
try {
(function(){var B=(window.UNIFIED_CONFIG&&window.UNIFIED_CONFIG.servicesUrl)||'https://unified.it.com/services/',T=[['Business Email',B+'email-hosting','#pg-email'],['Hybrid Email',B+'hybrid-email','#pg-hybrid'],['Microsoft 365',B+'microsoft','#pg-m365']];
T.forEach(function(c){var w=document.querySelector(c[2]+' .vw');if(!w)return;w.insertAdjacentHTML('afterbegin','<nav class="etabs" aria-label="Email services">'+T.map(function(t){return '<a href="'+t[1]+'" target="_blank" rel="noopener"'+(t===c?' class="on" aria-current="page"':'')+'>'+t[0]+'</a>'}).join('')+'</nav>')})})();
} catch (err) { console.error("[Email tabs]", err); }
