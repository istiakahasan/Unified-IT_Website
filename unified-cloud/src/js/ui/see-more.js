/**
 * See more details
 * Expands/collapses plan details (.mmore).
 */
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.mmore');if(!b)return;var c=b.closest('.ms'),o=c.classList.toggle('open');b.setAttribute('aria-expanded',o);b.querySelector('span').textContent=o?'Show less':'See more details'});
