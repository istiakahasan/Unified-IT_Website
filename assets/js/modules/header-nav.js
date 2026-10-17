/**
 * Header navigation: mega-menu hover and placement, link routing to scroll positions,
 * header dropdown menus.
 */
/* ---- Mega-menu hover ---- */
try {
(function(){var hd=document.getElementById('hdr'),sv=hd.querySelector('.nv a[href$="/services"]'),mg=document.getElementById('mega'),tm;
function show(){clearTimeout(tm);if(hd.style.pointerEvents==='auto')document.body.classList.add('mgo')}
function hide(){clearTimeout(tm);tm=setTimeout(function(){document.body.classList.remove('mgo')},180)}
sv.addEventListener('pointerenter',show);sv.addEventListener('pointerleave',hide);sv.addEventListener('focus',show);
mg.addEventListener('pointerenter',function(){clearTimeout(tm)});mg.addEventListener('pointerleave',hide);
addEventListener('keydown',function(e){if(e.key==='Escape')document.body.classList.remove('mgo')});
addEventListener('scroll',function(){document.body.classList.remove('mgo')},{passive:true});
})();
} catch (err) { console.error("[Mega-menu hover]", err); }
/* ---- Link routing to service pages ---- */
try {
(function(){
  var hd=document.getElementById('hdr'),mm=document.getElementById('mm'),mg=document.getElementById('mega');
  var ROUTE_MAP={
    'services':'p-cloud',
    'services/cloud-vps':'vps',
    'services/dedicated-server':'vds',
    'services/cloud-storage':'p-storage',
    'services/email-hosting':'email',
    'services/hybrid-email':'p-hybrid',
    'services/microsoft':'p-m365',
    'services/cyber-security':'p-cyber',
    'services/manage-hosting':'p-hosting',
    'services/ssl-certification':'p-ssl',
    'services/domain-registration':'p-domain',
    'agentic-ai':'p-agentic',
    'partner':'partner',
    'contact':'p-contact',
    'signup':'p-signup'
  };

  function nav(e){
    var a=e.target.closest&&e.target.closest('a');
    if(!a)return;
    var h=a.getAttribute('href')||'',B=(window.UNIFIED_CONFIG&&window.UNIFIED_CONFIG.siteUrl)||'https://unified.it.com/';

    // Logo click -> go to homepage
    if(h===B || h===B.replace(/\/$/,'') || a.classList.contains('hlogo')){
      e.preventDefault();
      document.body.classList.remove('mgo','mmo');
      location.hash='';
      scrollTo({top:0,behavior:'smooth'});
      return;
    }

    // Portal login
    if(h.indexOf('billing.unifiedit.xyz')>-1){
      e.preventDefault();
      document.body.classList.remove('mgo','mmo');
      location.hash='p-login';
      return;
    }

    if(h.indexOf(B)===0){
      var slug=h.slice(B.length).replace(/\/$/,'');
      if(ROUTE_MAP.hasOwnProperty(slug)){
        e.preventDefault();
        document.body.classList.remove('mgo','mmo');
        location.hash=ROUTE_MAP[slug];
      }
    }
  }

  [hd,mm,mg].forEach(function(n){if(n)n.addEventListener('click',nav)});
})();
} catch (err) { console.error("[Link routing]", err); }
/* ---- Mega-menu placement ---- */
try {
(function(){var sv=document.querySelector('#hdr .nv a[href$="/services"]'),mg=document.getElementById('mega');
function place(){var r=sv.getBoundingClientRect(),w=mg.offsetWidth||540,h=w/2,x=Math.max(h+12,Math.min(innerWidth-h-12,r.left+r.width/2));mg.style.left=x+'px'}
sv.addEventListener('pointerenter',place);sv.addEventListener('focus',place);addEventListener('resize',place);place();
})();
} catch (err) { console.error("[Mega-menu placement]", err); }
/* ---- Header dropdowns removed: direct navigation to Cyber Security page ---- */

