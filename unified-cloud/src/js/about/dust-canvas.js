/**
 * About dust
 * 2D particle dust on #adust inside the About overlay.
 */
(function(){
var A=document.getElementById('about'),cv=document.getElementById('adust'),cx=cv.getContext('2d'),hd=document.getElementById('hdr'),P=[],W=0,H=0,R=1,mx=.5,my=.5,last=0,open=false;
function size(){R=Math.min(devicePixelRatio||1,2);W=cv.width=innerWidth*R;H=cv.height=innerHeight*R}
function init(){P=[];for(var i=0;i<0;i++){var z=Math.random();P.push({x:Math.random(),y:Math.random(),v:.012+z*.045,ph:Math.random()*6.28,k:1.5+z*4,h:250+Math.random()*60,sz:.5+Math.random()*1.3})}}
function draw(t){if(!open)return;requestAnimationFrame(draw);var dt=Math.min(50,t-last)/1000;last=t;cx.clearRect(0,0,W,H);cx.globalCompositeOperation='lighter';
for(var i=0;i<P.length;i++){var p=P[i];p.y+=p.v*dt;if(p.y>1.02){p.y=-.02;p.x=Math.random()}
var x=p.x+Math.sin(t*.0004+p.ph)*.006,y=p.y,dx=x-mx,dy=y-my,d=Math.sqrt(dx*dx+dy*dy);
if(d<.12){var f=(.12-d)/.12*.04;x+=dx/(d+.001)*f;y+=dy/(d+.001)*f}
var tw=.5+.5*Math.sin(t*.0005*p.k+p.ph*10),px=x*W,py=y*H,r=p.sz*R*.8,l=70+tw*10;
var g=cx.createRadialGradient(px,py,0,px,py,r*2.6);g.addColorStop(0,'hsla('+p.h+',90%,'+l+'%,'+(.28+tw*.22)+')');g.addColorStop(1,'hsla('+p.h+',90%,60%,0)');
cx.fillStyle=g;cx.beginPath();cx.arc(px,py,r*2.6,0,6.283);cx.fill();
if(false){var L=r*(3+tw*5);cx.strokeStyle='hsla('+p.h+',100%,90%,'+(tw*.85)+')';cx.lineWidth=R*.8;cx.beginPath();cx.moveTo(px-L,py);cx.lineTo(px+L,py);cx.moveTo(px,py-L);cx.lineTo(px,py+L);cx.stroke()}}
if((window.__sm||0)>=.86)hd.style.setProperty('--ph',String(Math.round(262+Math.sin(t*.0006)*22)));}
function openA(){if(open)return;open=true;window.__aboutOpen=true;document.body.classList.add('ab');document.body.classList.remove('mmo');A.classList.add('on');A.scrollTop=0;size();init();last=performance.now();requestAnimationFrame(draw)}
function closeA(){if(!open)return;open=false;window.__aboutOpen=false;document.body.classList.remove('ab');A.classList.remove('on')}
function sync(){closeA()}
function route(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'';
if(/\/about$/.test(h)){e.preventDefault();location.hash='about';sync()}
else if(open&&h==='https://unified.it.com/'){e.preventDefault();location.hash='';sync()}}
hd.addEventListener('click',route);document.getElementById('mm').addEventListener('click',route);
document.getElementById('aex').onclick=function(){location.hash='';sync();scrollTo({top:4*innerHeight,behavior:'smooth'})};
addEventListener('hashchange',sync);addEventListener('resize',function(){if(open)size()});
addEventListener('keydown',function(e){if(e.key==='Escape'&&open){location.hash='';sync()}});
addEventListener('pointermove',function(e){mx=e.clientX/innerWidth;my=e.clientY/innerHeight});
sync();
})();
