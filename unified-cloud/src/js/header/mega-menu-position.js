/**
 * Mega menu position
 * Centres the mega-menu under the Services link.
 */
(function(){var sv=document.querySelector('#hdr .nv a[href$="/services"]'),mg=document.getElementById('mega');
function place(){var r=sv.getBoundingClientRect(),w=mg.offsetWidth||540,h=w/2,x=Math.max(h+12,Math.min(innerWidth-h-12,r.left+r.width/2));mg.style.left=x+'px'}
sv.addEventListener('pointerenter',place);sv.addEventListener('focus',place);addEventListener('resize',place);place();
})();
