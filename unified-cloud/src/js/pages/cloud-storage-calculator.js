/**
 * Cloud storage calculator
 * Storage type, size, snapshots, summary and quote (#pg-storage).
 */
(function(){var P=document.getElementById('pg-storage');if(!P)return;
var DATA=[['TerraLite-20GB','TerraLite',20],['TerraLite-40GB','TerraLite',40],['TerraCore-60GB','TerraCore',60],['BlazeDisk-100GB','BlazeDisk',100],['HyperDisk-500GB','HyperDisk',500],['QuantumVault-1024GB','QuantumVault',1024],['QuantumVault-2000GB','QuantumVault',2000]];
var FAM=['All','TerraLite','TerraCore','BlazeDisk','HyperDisk','QuantumVault'],S={fam:'All',q:'',st:'Active',k:null,d:1,page:1,per:5},sel={};
var rows=P.querySelector('#dkrows'),th=P.querySelector('#dkth'),ch=P.querySelector('#dkchips'),foot=P.querySelector('#dkfoot'),pn=P.querySelector('#dkpn'),sm=P.querySelector('#ssum'),bt=P.querySelector('#sqt'),lt=P.querySelector('#slt'),rg=P.querySelector('#srg'),sloc=P.querySelector('#sloc'),sq=P.querySelector('#sq'),dq=P.querySelector('#dkq');
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function list(){var l=DATA.filter(function(r){return(S.fam==='All'||r[1]===S.fam)&&(!S.q||(r[0]+' '+r[2]).toLowerCase().indexOf(S.q)>-1)});
if(S.k){var i={name:0,size:2}[S.k];l=l.slice().sort(function(a,b){var x=a[i],y=b[i];return(x<y?-1:x>y?1:0)*S.d})}return l}
function summary(){var all=P.querySelector('input[name=sm]:checked').value==='all',ks=Object.keys(sel).filter(function(k){return sel[k]}),gb=0;
ks.forEach(function(k){DATA.forEach(function(r){if(r[0]===k)gb+=r[2]})});
var R=[['Location',all?'All locations':lt.value],['Region',all?'All regions':rg.value],['Selected offerings',ks.length||'None selected'],['Offerings',ks.length?ks.join(', '):'-'],['Total disk size',gb+' GB']].concat(stRows());
sm.innerHTML=R.map(function(r){return '<div><dt>'+r[0]+'</dt><dd>'+esc(r[1])+'</dd></div>'}).join('');
var body='Hello Unified Cloud,\n\nI would like a quote for these disk offerings:\n'+R.map(function(r){return r[0]+': '+r[1]}).join('\n')+'\n\nName:\nCompany:\nPhone:\n';
bt.href='mailto:info@unifiedit.xyz?subject='+encodeURIComponent('Cloud storage service quote')+'&body='+encodeURIComponent(body)}
function stRows(){var n=Math.max(1,Math.min(50,parseInt(P.querySelector('#sinst').value,10)||1)),amt=parseFloat(P.querySelector('#samt').value)||0,un=P.querySelector('#sunit').value,sn=P.querySelector('#ssnap').value,gb=amt*(un==='TB'?1024:1),tot=gb*n,fmt=function(v){return v>=1024?(Math.round(v/1024*100)/100)+' TB':(Math.round(v*100)/100)+' GB'},c=P.querySelector('#scalc');
c.innerHTML=amt?'<div>'+n+' instance'+(n>1?'s':'')+' &times; <b>'+amt+' '+un+'</b> = <b>'+fmt(tot)+'</b> total storage</div>'+(P.querySelector('#svol').value?'<div>Storage type: <b>'+P.querySelector('#svol').value+'</b></div>':'')+'<div>Snapshot frequency: <b>'+sn+'</b></div><div>Pricing is confirmed in your quote.</div>':'<div>No additional storage selected.</div><div>Pricing is confirmed in your quote.</div>';
var ty=P.querySelector('#svol').value;return (ty?[['Storage type',ty]]:[]).concat(amt?[['Storage per instance',amt+' '+un],['Instances',n],['Total storage',fmt(tot)],['Snapshots',sn]]:[])}
function render(){var l=list(),np=Math.max(1,Math.ceil(l.length/S.per));S.page=Math.min(Math.max(1,S.page),np);var a=(S.page-1)*S.per,pg=l.slice(a,a+S.per);
th.innerHTML='<span class="dkcb'+(pg.length&&pg.every(function(r){return sel[r[0]]})?' on':'')+'" data-all="1"></span><span data-k="name" class="'+(S.k==='name'?(S.d>0?'asc':'desc'):'')+'">Name</span><span>Description</span><span>State</span><span data-k="size" class="'+(S.k==='size'?(S.d>0?'asc':'desc'):'')+'">Disk size (in GB)</span>';
rows.innerHTML=pg.length?pg.map(function(r){return '<div class="dkrow'+(sel[r[0]]?' on':'')+'" data-n="'+esc(r[0])+'"><span class="dkcb"></span><b class="dknm">'+esc(r[0])+'</b><span>'+esc(r[0])+'</span><span class="dkstt"><i></i>Active</span><span>'+r[2]+'</span></div>'}).join(''):'<div class="dkempty">No disk offerings match your search.</div>';
ch.innerHTML=FAM.map(function(f){return '<button type="button" data-f="'+f+'"'+(S.fam===f?' class="on"':'')+'>'+f+'</button>'}).join('');
foot.textContent=l.length?'Showing '+(a+1)+'-'+(a+pg.length)+' of '+l.length+' items':'Showing 0 of 0 items';
var h='<button type="button" data-p="'+(S.page-1)+'"'+(S.page<=1?' disabled':'')+' aria-label="Previous page">&lsaquo;</button>';for(var i=1;i<=np;i++)h+='<button type="button" data-p="'+i+'"'+(i===S.page?' class="on"':'')+'>'+i+'</button>';
h+='<button type="button" data-p="'+(S.page+1)+'"'+(S.page>=np?' disabled':'')+' aria-label="Next page">&rsaquo;</button>';pn.innerHTML=h;
P.querySelectorAll('.cxr label').forEach(function(x){x.classList.toggle('on',x.querySelector('input').checked)});sloc.hidden=P.querySelector('input[name=sm]:checked').value==='all';
summary()}
P.addEventListener('click',function(e){var t=e.target,x;
if((x=t.closest('.dkrow'))){var n=x.getAttribute('data-n');sel[n]=!sel[n];render();return}
if((x=t.closest('[data-all]'))){var l=list(),a=(S.page-1)*S.per,pg=l.slice(a,a+S.per),all=pg.every(function(r){return sel[r[0]]});pg.forEach(function(r){sel[r[0]]=!all});render();return}
if((x=t.closest('[data-k]'))){var k=x.getAttribute('data-k');if(S.k===k)S.d=-S.d;else{S.k=k;S.d=1}render();return}
if((x=t.closest('[data-f]'))){S.fam=x.getAttribute('data-f');S.page=1;render();return}
if((x=t.closest('.dkpn button'))&&!x.disabled){S.page=+x.getAttribute('data-p');render();return}
if((x=t.closest('#dkref'))){x.classList.add('spin');setTimeout(function(){x.classList.remove('spin');render()},650)}});
P.addEventListener('input',function(e){if(e.target.closest&&e.target.closest('.cxsm'))summary();if(e.target.id==='dkq'||e.target.id==='sq'){S.q=e.target.value.trim().toLowerCase();dq.value=sq.value=e.target.value;S.page=1;render()}});
P.addEventListener('change',function(e){var id=e.target.id;if(id==='svol'&&!e.target.value)P.querySelector('#samt').value='';if(e.target.closest&&e.target.closest('.cxsm'))summary();if(id==='dkps'){S.per=+e.target.value;S.page=1;render()}else if(id==='dkst'){S.st=e.target.value;render()}else if(id==='slt'||id==='srg'||e.target.name==='sm'){render()}});
render()})();
