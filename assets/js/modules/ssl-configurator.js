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
/* ---- SSL add to cart delegation to global UnifiedCart ---- */
try {
(function(){var P=document.getElementById('pg-ssl');if(!P)return;
P.addEventListener('click',function(e){var t=e.target;
var b=t.closest&&t.closest('.cartsec .cxnum button');if(b){var q=P.querySelector('#sqty');if(q)q.value=Math.max(1,Math.min(50,(parseInt(q.value,10)||1)+(+b.getAttribute('data-d'))));return}
if(t.closest&&t.closest('#addcart')){var br=(P.querySelector('.btog button.on')||{getAttribute:function(){return 'DigiCert'}}).getAttribute('data-b'),nm=br+' '+(P.querySelector('#ssel')?P.querySelector('#ssel').value:'SSL Certificate'),q2=Math.max(1,Math.min(50,parseInt((P.querySelector('#sqty')||{}).value,10)||1));
if(window.UnifiedCart)window.UnifiedCart.add({name:nm,details:'SSL Certificate (1 Year)',price:0,quantity:q2});return}
if(t.closest&&t.closest('#learn')){var v=P.querySelector('.vg');if(v)v.scrollIntoView({behavior:'smooth',block:'start'})}});
})();
} catch (err) { console.error("[SSL Cart]", err); }
