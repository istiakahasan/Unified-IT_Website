/**
 * Billing toggle
 * Monthly | Yearly switch for Business Email and Hybrid Email (uses data-m / data-y
 * attributes).
 */
(function(){document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.bill button');if(!b)return;var m=b.getAttribute('data-b')==='m',w=b.closest('.bill').parentNode;w.querySelectorAll('.bill button').forEach(function(x){x.classList.toggle('on',x===b)});w.querySelectorAll('[data-m]').forEach(function(el){el.textContent=m?el.getAttribute('data-m'):el.getAttribute('data-y')})})})();
