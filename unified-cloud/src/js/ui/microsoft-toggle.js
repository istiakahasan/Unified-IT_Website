/**
 * Microsoft 365 toggle
 * Switches between Microsoft 365 plan sets (.mtog / .mset).
 */
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.mtog button');if(!b)return;var w=b.closest('.dm');
w.querySelectorAll('.mtog button').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-t')===b.getAttribute('data-t'))});
w.querySelectorAll('.mset').forEach(function(x){x.hidden=x.getAttribute('data-s')!==b.getAttribute('data-t')})});
