/**
 * SSL page (#pg-ssl): brand switch and add-to-cart drawer (priced and quote-only items).
 */
/* ---- Reactive SSL Provider switch (DigiCert vs Comodo) ---- */
try {
  (function() {
    function setSSLProvider(brand, reanimate) {
      var P = document.getElementById('pg-ssl');
      if (!P) return;
      var isComodo = brand === 'Comodo';

      // Update toggle buttons active state (.ssl-tog or .btog)
      P.querySelectorAll('.ssl-tog button, .btog button').forEach(function(btn) {
        var b = btn.getAttribute('data-b') || btn.textContent.trim();
        btn.classList.toggle('on', isComodo ? b === 'Comodo' : b === 'DigiCert');
      });

      // Synchronously toggle provider container classes on #pg-ssl
      P.classList.toggle('cm-on', isComodo);
      P.classList.toggle('dc-on', !isComodo);

      // Re-trigger reactive staggered entrance animation on active catalog cards
      var activeContainer = isComodo ? P.querySelector('#ccw') : P.querySelector('#dcw');
      if (activeContainer && reanimate !== false) {
        var cards = activeContainer.querySelectorAll('.dcx-card, .ccx-card');
        cards.forEach(function(card, idx) {
          card.style.setProperty('--i', idx);
          card.style.animation = 'none';
          void card.offsetWidth;
          card.style.animation = '';
        });
      }
    }

    window.syncSSLProvider = setSSLProvider;

    document.addEventListener('click', function(e) {
      var b = e.target.closest && e.target.closest('#pg-ssl .ssl-tog button, #pg-ssl .btog button');
      if (!b) return;
      var brand = b.getAttribute('data-b') || b.textContent.trim();
      setSSLProvider(brand, true);
    });

    var P = document.getElementById('pg-ssl');
    if (P) {
      var activeBtn = P.querySelector('.ssl-tog button.on, .btog button.on');
      var initBrand = activeBtn ? (activeBtn.getAttribute('data-b') || activeBtn.textContent.trim()) : 'DigiCert';
      setSSLProvider(initBrand, false);
    }
  })();
} catch (err) { console.error("[SSL Provider switch]", err); }
/* ---- Cart drawer ---- */
try {
(function(){var P=document.getElementById('pg-ssl');if(!P)return;
var cart=[],el=document.createElement('div');el.id='cart';
el.innerHTML='<div class="cbk"></div><aside class="cpn" role="dialog" aria-label="Added to cart"><div class="ch"><h2>Added to cart</h2><button class="cx" type="button" aria-label="Close">&times;</button></div><div class="cl"></div><div class="ctot"><div><b>Total</b><span>Quote on request</span></div><i>Pricing is confirmed in your quote.</i></div><div class="cf"><div class="cc"></div><div class="cb"><button class="ck" type="button">Keep Shopping</button><a class="cg" href="mailto:info@unifiedit.xyz"></a></div></div></aside>';
document.body.appendChild(el);
var list=el.querySelector('.cl'),cc=el.querySelector('.cc'),go=el.querySelector('.cg'),tot=el.querySelector('.ctot');
var TR='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
function money(n){return 'BDT '+Math.round(n).toLocaleString('en-US')+' Tk'}
function esc(t){return String(t).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
function render(){var n=cart.reduce(function(a,c){return a+c.q},0);
list.innerHTML=cart.length?cart.map(function(c,i){return '<div class="ci"><div class="cih"><b>'+esc(c.n)+'</b><button class="cd" type="button" data-r="'+i+'" aria-label="Remove">'+TR+'</button></div>'+(c.d?'<div class="cid">'+esc(c.d)+'</div>':'')+'<div class="ciq"><span>Quantity</span><span class="cqn"><button type="button" data-m="'+i+'" aria-label="Fewer">&minus;</button><span>'+c.q+'</span><button type="button" data-p="'+i+'" aria-label="More">+</button></span><span class="cpr">'+(c.p?money(c.p*c.q):'Quote on request')+'</span></div></div>'}).join(''):'<div class="cempty">Your cart is empty.</div>';
var priced=0,quoted=0;cart.forEach(function(c){if(c.p)priced+=c.p*c.q;else quoted+=c.q});
tot.innerHTML=priced?'<div><b>Total</b><span>'+money(priced)+(quoted?' + quote':'')+'</span></div><i>'+(quoted?'Items without a price are confirmed in your quote.':'12-month subscription pricing, confirmed in your quote.')+'</i>':'<div><b>Total</b><span>Quote on request</span></div><i>Pricing is confirmed in your quote.</i>';
cc.textContent=n+' item'+(n===1?'':'s')+' in cart';go.textContent='Go to cart ('+n+')';
var body='Hello Unified Cloud,\n\nI would like a quote for:\n'+cart.map(function(c){return c.q+' x '+c.n+(c.d?' ('+c.d+')':'')+(c.p?' - '+money(c.p*c.q):'')}).join('\n')+'\n\nName:\nCompany:\nPhone:\n';
go.href='mailto:info@unifiedit.xyz?subject='+encodeURIComponent('SSL certificate quote')+'&body='+encodeURIComponent(body)}
function open(){render();el.classList.add('on')}
/* add({n:name, d:details, p:unit price in BDT (0 = quote on request), q:quantity}) - also used by modules/digicert-catalog.js */
function add(it){var q=Math.max(1,Math.min(50,it.q||1)),d=it.d||'',p=it.p||0,f=cart.filter(function(c){return c.n===it.n&&c.d===d&&c.p===p})[0];if(f)f.q=Math.min(99,f.q+q);else cart.push({n:it.n,d:d,p:p,q:q});open()}
window.UnifiedCart={add:add};function close(){el.classList.remove('on')}
P.addEventListener('click',function(e){var t=e.target;
var b=t.closest&&t.closest('.cartsec .cxnum button');if(b){var q=P.querySelector('#sqty');q.value=Math.max(1,Math.min(50,(parseInt(q.value,10)||1)+(+b.getAttribute('data-d'))));return}
if(t.closest&&t.closest('#addcart')){var br=(P.querySelector('.btog button.on')||{getAttribute:function(){return 'DigiCert'}}).getAttribute('data-b'),nm=br+' '+P.querySelector('#ssel').value,q2=Math.max(1,Math.min(50,parseInt(P.querySelector('#sqty').value,10)||1));
add({n:nm,q:q2});return}
if(t.closest&&t.closest('#learn')){var v=P.querySelector('.vg');if(v)v.scrollIntoView({behavior:'smooth',block:'start'})}});
el.addEventListener('click',function(e){var t=e.target;
if(t.classList.contains('cbk')||t.closest('.cx')||t.closest('.ck')){close();return}
var r=t.closest('[data-r]');if(r){cart.splice(+r.getAttribute('data-r'),1);render();if(!cart.length)close();return}
var m=t.closest('[data-m]');if(m){var i=+m.getAttribute('data-m');cart[i].q=Math.max(1,cart[i].q-1);render();return}
var p=t.closest('[data-p]');if(p){var j=+p.getAttribute('data-p');cart[j].q=Math.min(99,cart[j].q+1);render()}});
addEventListener('keydown',function(e){if(e.key==='Escape'&&el.classList.contains('on')){e.stopImmediatePropagation();close()}},true);
})();
} catch (err) { console.error("[Cart drawer]", err); }
