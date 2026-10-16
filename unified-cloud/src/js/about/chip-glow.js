/**
 * Chip glow
 * Pointer-follow glow on .chip elements in About.
 */
(function(){var A=document.getElementById('about');A.addEventListener('pointermove',function(e){var c=e.target.closest&&e.target.closest('.chip');if(!c)return;var r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px')})})();
