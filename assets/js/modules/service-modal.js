/**
 * Product detail modal: creates #pm and opens it from any package "Order" button.
 */
/* ---- Product modal ---- */
try {
(function(){
var pm=document.createElement('div');pm.id='pm';pm.innerHTML='<div class="pmc" role="dialog" aria-modal="true"><button class="pmx" aria-label="Close">×</button><div class="pmb"></div></div>';document.body.appendChild(pm);
var box=pm.querySelector('.pmb');
function close(){pm.classList.remove('on')}
function T(n){return n?n.textContent.trim():''}
function esc(t){return t.replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
document.addEventListener('click',function(e){
var b=e.target.closest&&e.target.closest('#vps .vb,#vds .vb,#bem .vb,.pg .vc:not(.cf):not(.lf) .vb');
if(!b){if(pm.classList.contains('on')&&(e.target===pm||(e.target.closest&&e.target.closest('.pmx'))))close();return}
e.preventDefault();e.stopPropagation();
var c=b.closest('.vc'),page=b.closest('section').id,name=T(c.querySelector('h3')),desc=T(c.querySelector('.vd')),kick=T(c.querySelector('.ek'));
var rows=[].map.call(c.querySelectorAll('.vr'),function(r){return[T(r.children[0]),T(r.children[1])]});
var inc=[].map.call(c.querySelectorAll('.el li'),T),chips=[].map.call(c.querySelectorAll('.vch span'),T);
var h='<h3>'+esc(name)+'</h3>'+(kick?'<div class="pmk">'+esc(kick)+'</div>':'')+'<p>'+esc(desc)+'</p>';
if(rows.length)h+='<div class="pmr">'+rows.map(function(r){return '<div><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>'}).join('')+'</div>';
if(inc.length)h+='<ul class="pml">'+inc.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>';
if(chips.length)h+='<div class="pmt">'+chips.map(function(x){return '<span>'+esc(x)+'</span>'}).join('')+'</div>';
var sub=encodeURIComponent('Plan enquiry: '+name),bod=encodeURIComponent('Hello Unified Cloud,\n\nI would like to know more about the '+name+' plan.\n\nName:\nCompany:\nPhone:\n');
h+='<div class="pma"><a class="pm1" href="mailto:info@unifiedit.xyz?subject='+sub+'&body='+bod+'">Request this plan</a><a class="pm2" href="tel:09617200800">Call 09617-200800</a></div>';
box.innerHTML=h;pm.setAttribute('data-p',page);pm.classList.add('on');
},true);
addEventListener('keydown',function(e){if(e.key==='Escape'&&pm.classList.contains('on')){e.stopImmediatePropagation();close()}},true);
})();
} catch (err) { console.error("[Product modal]", err); }
