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
/* ---- Link routing ---- */
try {
(function(){var hd=document.getElementById('hdr'),mm=document.getElementById('mm'),mg=document.getElementById('mega');
var SL=['cloud-vps','dedicated-server','manage-hosting','email-hosting','microsoft','ssl-certification','domain-registration','cloud-storage','cyber-security'];
function go(y){location.hash='';document.body.classList.remove('mgo','mmo');setTimeout(function(){scrollTo({top:y,behavior:'smooth'})},60)}
function nav(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'',B=(window.UNIFIED_CONFIG&&window.UNIFIED_CONFIG.siteUrl)||'https://unified.it.com/';
if(h===B+'services'){e.preventDefault();go(4*innerHeight)}
else if(h===B){e.preventDefault();go(0)}
else if(h.indexOf(B+'services/')===0){var i=SL.indexOf(h.slice((B+'services/').length));if(i>-1){e.preventDefault();go((4+i)*innerHeight)}}}
[hd,mm,mg].forEach(function(n){n.addEventListener('click',nav)});
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

