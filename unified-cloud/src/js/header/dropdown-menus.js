/**
 * Header dropdowns
 * Icon set and dropdown menus (Cyber Security, etc.).
 */
(function(){
var hd=document.getElementById('hdr'),SL=['cloud-vps','dedicated-server','manage-hosting','email-hosting','microsoft','ssl-certification','domain-registration','cloud-storage','cyber-security'];
var IC={mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',at:'<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8"/>',grid:'<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>',soc:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><circle cx="12" cy="10" r="2.2"/>',fw:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.3h18M3 14.6h18M9 4v5.3M15 9.3v5.3M9 14.6V20"/>',shield:'<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',cert:'<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5L7 21l5-3 5 3-1.5-7.5"/>'};
var DD=[
{sel:'/services/cyber-security',t:'CYBER SECURITY',i:[['SOC','Security Operations','cyber-security','#475569','soc'],['Firewall','Network Protection','cyber-security','#be123c','fw']]}];
var all=[],tm;
function closeAll(){all.forEach(function(x){x.classList.remove('open')})}
function go(slug){var i=SL.indexOf(slug);if(i<0)return;closeAll();location.hash='';document.body.classList.remove('mgo','mmo');setTimeout(function(){scrollTo({top:(4+i)*innerHeight,behavior:'smooth'})},60)}
DD.forEach(function(c){var link=hd.querySelector('.nv a[href$="'+c.sel+'"]');if(!link)return;var n=c.i.length,w=n*170;
var h='<div class="dd" role="menu" style="width:min('+w+'px,94vw)"><div class="mgh">'+c.t+'</div><div class="mgg" style="grid-template-columns:repeat('+n+',1fr)">'+c.i.map(function(x,k){return '<a class="sv" data-s="'+x[2]+'" style="--c:'+x[3]+';--i:'+k+'" href="https://unified.it.com/services/'+x[2]+'" target="_blank" rel="noopener"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[x[4]]+'</svg></span><b>'+x[0]+'</b><small>'+x[1]+'</small><i>Order Now</i></a>'}).join('')+'</div></div>';
var w0=document.createElement('div');w0.innerHTML=h;var p=w0.firstChild;document.body.appendChild(p);all.push(p);
function place(){var r=link.getBoundingClientRect(),hw=(p.offsetWidth||w)/2;p.style.left=Math.max(hw+12,Math.min(innerWidth-hw-12,r.left+r.width/2))+'px'}
function show(){clearTimeout(tm);if(hd.style.pointerEvents!=='auto')return;closeAll();document.body.classList.remove('mgo');place();p.classList.add('open')}
function hide(){clearTimeout(tm);tm=setTimeout(function(){p.classList.remove('open')},180)}
link.addEventListener('pointerenter',show);link.addEventListener('pointerleave',hide);link.addEventListener('focus',show);
p.addEventListener('pointerenter',function(){clearTimeout(tm)});p.addEventListener('pointerleave',hide);
p.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.sv');if(a){e.preventDefault();go(a.getAttribute('data-s'))}});
addEventListener('resize',place)});
var cl=hd.querySelector('.nv a[href$="/services"]');if(cl)cl.addEventListener('pointerenter',closeAll);
addEventListener('keydown',function(e){if(e.key==='Escape')closeAll()});addEventListener('scroll',closeAll,{passive:true});
})();
