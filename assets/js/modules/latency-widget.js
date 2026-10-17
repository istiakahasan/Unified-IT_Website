/**
 * Animated latency read-out in #lat.
 */
/* ---- Latency widget ---- */
try {
(function(){var a=document.getElementById('lat'),v1=document.getElementById('v1'),v2=document.getElementById('v2'),ft=document.getElementById('lx'),busy=false,done=false;
function run(){if(busy)return;busy=true;var t1=1.4+Math.random()*.9,t2=47+Math.random()*7,t0=performance.now(),D=1100;
(function step(n){var k=Math.min(1,(n-t0)/D),e=1-Math.pow(1-k,3);v1.textContent=(t1*e).toFixed(1)+'ms';v2.textContent=(t2*e).toFixed(1)+'ms';
if(k<1)requestAnimationFrame(step);else{ft.textContent=Math.round(t2/t1)+'× faster';busy=false;}})(t0);}
document.getElementById('lre').onclick=run;
setInterval(function(){var o=parseFloat(a.style.opacity||0);if(!done&&o>.6){done=true;run();}if(done&&o<.05)done=false;},300);
})();
} catch (err) { console.error("[Latency widget]", err); }
