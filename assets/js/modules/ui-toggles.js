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
