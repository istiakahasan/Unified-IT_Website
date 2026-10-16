/**
 * Navigation
 * Routes header, mobile-menu and mega-menu links to scroll positions.
 */
(function(){var hd=document.getElementById('hdr'),mm=document.getElementById('mm'),mg=document.getElementById('mega');
var SL=['cloud-vps','dedicated-server','manage-hosting','email-hosting','microsoft','ssl-certification','domain-registration','cloud-storage','cyber-security'];
function go(y){location.hash='';document.body.classList.remove('mgo','mmo');setTimeout(function(){scrollTo({top:y,behavior:'smooth'})},60)}
function nav(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'',B='https://unified.it.com/';
if(h===B+'services'){e.preventDefault();go(4*innerHeight)}
else if(h===B){e.preventDefault();go(0)}
else if(h.indexOf(B+'services/')===0){var i=SL.indexOf(h.slice((B+'services/').length));if(i>-1){e.preventDefault();go((4+i)*innerHeight)}}}
[hd,mm,mg].forEach(function(n){n.addEventListener('click',nav)});
})();
