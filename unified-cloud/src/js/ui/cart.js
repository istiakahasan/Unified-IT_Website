/**
 * Cart drawer
 * Add-to-cart drawer for the SSL page (#cart).
 */
(function(){var P=document.getElementById('pg-ssl');if(!P)return;
var cart=[],el=document.createElement('div');el.id='cart';
el.innerHTML='<div class="cbk"></div><aside class="cpn" role="dialog" aria-label="Added to cart"><div class="ch"><h2>Added to cart</h2><button class="cx" type="button" aria-label="Close">&times;</button></div><div class="cl"></div><div class="ctot"><div><b>Total</b><span>Quote on request</span></div><i>Pricing is confirmed in your quote.</i></div><div class="cf"><div class="cc"></div><div class="cb"><button class="ck" type="button">Keep Shopping</button><a class="cg" href="mailto:info@unifiedit.xyz"></a></div></div></aside>';
document.body.appendChild(el);
var list=el.querySelector('.cl'),cc=el.querySelector('.cc'),go=el.querySelector('.cg');
var TR='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
function esc(t){return String(t).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
function render(){var n=cart.reduce(function(a,c){return a+c.q},0);
list.innerHTML=cart.length?cart.map(function(c,i){return '<div class="ci"><div class="cih"><b>'+esc(c.n)+'</b><button class="cd" type="button" data-r="'+i+'" aria-label="Remove">'+TR+'</button></div><div class="ciq"><span>Quantity</span><span class="cqn"><button type="button" data-m="'+i+'" aria-label="Fewer">&minus;</button><span>'+c.q+'</span><button type="button" data-p="'+i+'" aria-label="More">+</button></span><span class="cpr">Quote on request</span></div></div>'}).join(''):'<div class="cempty">Your cart is empty.</div>';
cc.textContent=n+' item'+(n===1?'':'s')+' in cart';go.textContent='Go to cart ('+n+')';
var body='Hello Unified Cloud,\n\nI would like a quote for:\n'+cart.map(function(c){return c.q+' x '+c.n}).join('\n')+'\n\nName:\nCompany:\nPhone:\n';
go.href='mailto:info@unifiedit.xyz?subject='+encodeURIComponent('SSL certificate quote')+'&body='+encodeURIComponent(body)}
function open(){render();el.classList.add('on')}function close(){el.classList.remove('on')}
P.addEventListener('click',function(e){var t=e.target;
var b=t.closest&&t.closest('.cartsec .cxnum button');if(b){var q=P.querySelector('#sqty');q.value=Math.max(1,Math.min(50,(parseInt(q.value,10)||1)+(+b.getAttribute('data-d'))));return}
if(t.closest&&t.closest('#addcart')){var br=(P.querySelector('.btog button.on')||{getAttribute:function(){return 'DigiCert'}}).getAttribute('data-b'),nm=br+' '+P.querySelector('#ssel').value,q2=Math.max(1,Math.min(50,parseInt(P.querySelector('#sqty').value,10)||1)),f=cart.filter(function(c){return c.n===nm})[0];
if(f)f.q=Math.min(99,f.q+q2);else cart.push({n:nm,q:q2});open();return}
if(t.closest&&t.closest('#learn')){var v=P.querySelector('.vg');if(v)v.scrollIntoView({behavior:'smooth',block:'start'})}});
el.addEventListener('click',function(e){var t=e.target;
if(t.classList.contains('cbk')||t.closest('.cx')||t.closest('.ck')){close();return}
var r=t.closest('[data-r]');if(r){cart.splice(+r.getAttribute('data-r'),1);render();if(!cart.length)close();return}
var m=t.closest('[data-m]');if(m){var i=+m.getAttribute('data-m');cart[i].q=Math.max(1,cart[i].q-1);render();return}
var p=t.closest('[data-p]');if(p){var j=+p.getAttribute('data-p');cart[j].q=Math.min(99,cart[j].q+1);render()}});
addEventListener('keydown',function(e){if(e.key==='Escape'&&el.classList.contains('on')){e.stopImmediatePropagation();close()}},true);
})();
