/**
 * SSL brand toggle
 * Brand filter for the SSL certificate cards (#pg-ssl).
 */
(function(){var P=document.getElementById('pg-ssl');if(!P)return;
function set(b){P.querySelectorAll('.btog button').forEach(function(x){x.classList.toggle('on',x===b)});var br=b.getAttribute('data-b');P.querySelectorAll('.vc h3').forEach(function(h){if(!h.dataset.n)h.dataset.n=h.textContent;h.textContent=br+' '+h.dataset.n})}
P.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.btog button');if(b)set(b)});
var f=P.querySelector('.btog button');if(f)set(f)})();
