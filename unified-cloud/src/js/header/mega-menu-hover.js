/**
 * Mega menu hover
 * Opens/closes the services mega-menu from the header link.
 */
(function(){var hd=document.getElementById('hdr'),sv=hd.querySelector('.nv a[href$="/services"]'),mg=document.getElementById('mega'),tm;
function show(){clearTimeout(tm);if(hd.style.pointerEvents==='auto')document.body.classList.add('mgo')}
function hide(){clearTimeout(tm);tm=setTimeout(function(){document.body.classList.remove('mgo')},180)}
sv.addEventListener('pointerenter',show);sv.addEventListener('pointerleave',hide);sv.addEventListener('focus',show);
mg.addEventListener('pointerenter',function(){clearTimeout(tm)});mg.addEventListener('pointerleave',hide);
addEventListener('keydown',function(e){if(e.key==='Escape')document.body.classList.remove('mgo')});
addEventListener('scroll',function(){document.body.classList.remove('mgo')},{passive:true});
})();
