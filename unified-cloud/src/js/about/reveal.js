/**
 * About reveal
 * IntersectionObserver reveal for .rv blocks and About click handling.
 */
(function(){var A=document.getElementById('about');
var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{root:A,threshold:.12});
A.querySelectorAll('.rv').forEach(function(n){io.observe(n)});
A.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-go]');if(b){location.hash='';scrollTo({top:4*innerHeight,behavior:'smooth'})}});
})();
