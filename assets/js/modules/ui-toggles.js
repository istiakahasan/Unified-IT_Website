/**
 * Shared toggles: Microsoft 365 plan sets, "See more details" accordions, and the Monthly
 * | Yearly billing switch (data-m / data-y).
 */
/* ---- Microsoft 365 toggle ---- */
try {
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.mtog button');if(!b)return;var w=b.closest('.dm');
w.querySelectorAll('.mtog button').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-t')===b.getAttribute('data-t'))});
w.querySelectorAll('.mset').forEach(function(x){x.hidden=x.getAttribute('data-s')!==b.getAttribute('data-t')})});
} catch (err) { console.error("[Microsoft 365 toggle]", err); }
/* ---- See more details ---- */
try {
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.mmore');if(!b)return;var c=b.closest('.ms'),o=c.classList.toggle('open');b.setAttribute('aria-expanded',o);b.querySelector('span').textContent=o?'Show less':'See more details'});
} catch (err) { console.error("[See more details]", err); }
/* ---- Billing toggle ---- */
try {
(function(){document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.bill button');if(!b)return;var m=b.getAttribute('data-b')==='m',w=b.closest('.bill').parentNode;w.querySelectorAll('.bill button').forEach(function(x){x.classList.toggle('on',x===b)});w.querySelectorAll('[data-m]').forEach(function(el){el.textContent=m?el.getAttribute('data-m'):el.getAttribute('data-y')})})})();
} catch (err) { console.error("[Billing toggle]", err); }
/* ---- Cyber Security SOC vs Firewall toggle ---- */
try {
document.addEventListener('click', function(e) {
  var b = e.target.closest && e.target.closest('.csec-tog button');
  if (!b) return;
  var P = b.closest('#pg-cyber') || document.getElementById('pg-cyber');
  if (!P) return;
  var sec = b.getAttribute('data-sec'); // 'soc' or 'firewall'
  P.querySelectorAll('.csec-tog button').forEach(function(x) { x.classList.toggle('on', x === b); });
  var soc = P.querySelector('#csec-soc');
  var fw = P.querySelector('#csec-firewall');
  if (soc) soc.style.display = sec === 'soc' ? '' : 'none';
  if (fw) fw.style.display = sec === 'firewall' ? '' : 'none';
  var activeGrid = sec === 'soc' ? soc : fw;
  if (activeGrid) {
    activeGrid.querySelectorAll('.vc').forEach(function(c, i) {
      c.style.animation = 'none';
      void c.offsetWidth;
      c.style.animation = '';
    });
  }
});
} catch (err) { console.error("[Cyber Security toggle]", err); }
/* ---- SSL Provider DigiCert vs Comodo toggle ---- */
try {
document.addEventListener('click', function(e) {
  var b = e.target.closest && e.target.closest('.ssl-tog button, #pg-ssl .btog button');
  if (!b) return;
  var brand = b.getAttribute('data-b') || b.textContent.trim();
  if (window.syncSSLProvider) {
    window.syncSSLProvider(brand, true);
  }
});
} catch (err) { console.error("[SSL Provider toggle]", err); }
