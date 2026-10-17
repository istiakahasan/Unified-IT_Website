/**
 * Cloud instance configurator (#pg-cloud): instance table, filters, storage volume,
 * summary and quote. The instance catalogue is the DATA array at the top of this file.
 */
/* ---- Instance configurator ---- */
try {
(function(){var P=document.getElementById('pg-cloud');if(!P)return;
function $(q){return P.querySelector(q)}
var DATA=[["General Purpose", "uc.nano", 1, 1, 20, 350, "Microservices"], ["General Purpose", "uc.micro", 2, 4, 40, 900, "Web / API"], ["General Purpose", "uc.small", 4, 8, 60, 1800, "General App"], ["General Purpose", "uc.medium", 8, 16, 100, 3600, "Database / Cache"], ["General Purpose", "uc.large", 12, 32, 150, 6200, "Virtualization"], ["General Purpose", "uc.xlarge", 16, 64, 250, 10400, "ERP / CRM"], ["General Purpose", "uc.2xlarge", 32, 128, 500, 20800, "Large DB / OLTP"], ["Compute Optimized", "ucc.c5.nano", 1, 1, 20, 450, "Batch jobs"], ["Compute Optimized", "ucc.c5.micro", 2, 2, 40, 700, "CI/CD"], ["Compute Optimized", "ucc.c5.small", 4, 4, 80, 1400, "Video encoding"], ["Compute Optimized", "ucc.c5.medium", 8, 8, 150, 2800, "HPC"], ["Compute Optimized", "ucc.c5.large", 12, 16, 250, 4600, "Scientific sim"], ["Compute Optimized", "ucc.c5.xlarge", 16, 32, 350, 8000, "ML inference"], ["Compute Optimized", "ucc.c5.2xlarge", 32, 64, 600, 15000, "Big data"], ["Memory Optimized", "ucm.r5.nano", 1, 8, 40, 1050, "Redis / Memcached"], ["Memory Optimized", "ucm.r5.micro", 2, 16, 60, 2100, "In-memory DB"], ["Memory Optimized", "ucm.r5.small", 4, 32, 100, 4200, "SAP HANA"], ["Memory Optimized", "ucm.r5.medium", 8, 64, 200, 8400, "Real-time analytics"], ["Memory Optimized", "ucm.r5.large", 12, 96, 300, 12600, "Large cache"], ["Memory Optimized", "ucm.r5.xlarge", 16, 128, 400, 16800, "High-mem DB"], ["Memory Optimized", "ucm.r5.2xlarge", 32, 256, 800, 33600, "Exascale prep"], ["GPU Accelerated", "ucg.g4dn.micro", 2, 16, 100, 9500, "ML dev"], ["GPU Accelerated", "ucg.g4dn.small", 4, 32, 200, 17000, "AI inference"], ["GPU Accelerated", "ucg.g4dn.medium", 8, 64, 400, 32000, "Model training"], ["GPU Accelerated", "ucg.g4dn.large", 16, 128, 800, 60000, "3D rendering"], ["GPU Accelerated", "ucg.g4dn.xlarge", 32, 256, 1200, 110000, "LLM fine-tuning"]];DATA.push(['Custom','Custom-Offering',0,0,0,0,'Your own size']);
var TITLE={'ALL':'All Instance Families','General Purpose':'General Purpose Instance Types','Compute Optimized':'Compute Optimized Instance Types','Memory Optimized (High-RAM)':'Memory Optimized Instance Types (High-RAM Options for Same CPU)','GPU Accelerated':'GPU Accelerated Instance Types'};
var TFAM={'General Purpose':'General Purpose','Compute Optimized':'Compute Optimized','Memory Optimized (High-RAM)':'Memory Optimized','GPU Accelerated':'GPU Accelerated'};
var cn=$('#cn'),lt=$('#clt'),rg=$('#crg'),cit=$('#cit'),cos=$('#cos'),sm=$('#csum'),bt=$('#cqt'),cc=$('#ccust'),cp=$('#ccpu'),cmm=$('#cmem'),foot=$('#cfoot'),pn=$('#cpn'),ps=$('#cps'),go=$('#cgo'),cis=$('#cis'),cich=$('#cich'),cch=$('#cch'),cbs=$('#cbs'),loc=$('#cloc'),fv=$('#cfv'),fm=$('#cfm'),fs=$('#cfs'),fn=$('#cfn'),tb=$('#ittabs'),itt=$('#itt'),rowsEl=$('#itrows'),tab='ALL',page=1,sel=-1;
function money(v){return '\u09f3'+Number(v).toLocaleString('en-US')}
function match(i){var d=DATA[i],cu=d[0]==='Custom',q=cis.value.trim().toLowerCase();
if(cu){if(tab!=='ALL'||fv.value||fm.value||fs.value)return false;return !q||(d[1]+' '+d[6]).toLowerCase().indexOf(q)>-1}
if(tab!=='ALL'&&d[0]!==TFAM[tab])return false;
if(q&&(d[0]+' '+d[1]+' '+d[6]).toLowerCase().indexOf(q)<0)return false;
if(fv.value&&String(d[2])!==fv.value)return false;if(fm.value&&String(d[3])!==fm.value)return false;if(fs.value&&String(d[4])!==fs.value)return false;if(fn.value&&fn.value!=='25 Gbps')return false;return true}
function list(){var l=[];DATA.forEach(function(d,i){if(match(i))l.push(i)});return l}
function render(){var l=list(),per=+ps.value,np=Math.max(1,Math.ceil(l.length/per));page=Math.min(Math.max(1,page),np);var a=(page-1)*per,pg=l.slice(a,a+per);
itt.textContent=TITLE[tab];
tb.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-t')===tab)});
rowsEl.innerHTML=pg.length?pg.map(function(i){var d=DATA[i],cu=d[0]==='Custom';return '<div class="itrow'+(i===sel?' on':'')+'" data-i="'+i+'"><span class="itrad"></span><span class="itfam">'+d[0]+'</span><b class="itn">'+d[1]+'</b><span>'+(cu?'&ndash;':d[2])+'</span><span>'+(cu?'&ndash;':d[3]+' GB')+'</span><span>'+(cu?'&ndash;':d[4]+' GB')+'</span><span class="itnet">25 Gbps</span><span class="itpr">'+(cu?'Quote':money(d[5]))+'</span><span class="itbf">'+d[6]+'</span></div>'}).join(''):'<div class="cempty" style="padding:26px;text-align:center;color:#9fb0e8">No cloud instances match your filters.</div>';
cich.textContent='('+l.length+')';foot.textContent=l.length?'Showing '+(a+1)+'-'+(a+pg.length)+' of '+l.length+' items':'Showing 0 of 0 items';
var best=l.filter(function(i){return DATA[i][0]!=='Custom'}).sort(function(x,y){return(DATA[x][2]-DATA[y][2])||(DATA[x][3]-DATA[y][3])})[0];
cbs.innerHTML=best!==undefined?'Based on your inputs, this is the smallest cloud instance: <b>'+DATA[best][1]+'</b>':'No cloud instances match your filters.';
var h='<button type="button" data-p="'+(page-1)+'"'+(page<=1?' disabled':'')+' aria-label="Previous page">&lsaquo;</button>';
for(var k=1;k<=np;k++)h+='<button type="button" data-p="'+k+'"'+(k===page?' class="on"':'')+'>'+k+'</button>';
h+='<button type="button" data-p="'+(page+1)+'"'+(page>=np?' disabled':'')+' aria-label="Next page">&rsaquo;</button>';pn.innerHTML=h}
function spRows(){var ac=$('.cxpc.on'),nm=ac.getAttribute('data-n'),rt=ac.querySelector('input[name^=rt]:checked'),py=ac.querySelector('input[name^=pay]:checked');
return rt?[['Savings plan',nm],['Reservation term',rt.value],['Payment option',py.value]]:[['Savings plan',nm],['Reservation term','No commitment']]}
function vRows(n){var sl=$('#vvol'),vt=sl.options[sl.selectedIndex].text,nm=sl.value?(sl.value==='custom'?'Custom size':vt.replace(/ \(.*$/,'')):'Disk offering',amt=parseFloat($('#vamt').value)||0,u=$('#vunit').value,sn=$('#vsnap').value,tp=$('#vtp').value.trim(),tu=$('#vtpu').value,gb=amt*(u==='TB'?1024:1),tot=gb*n,fmt=function(v){return v>=1024?(Math.round(v/1024*100)/100)+' TB':(Math.round(v*100)/100)+' GB'},c=$('#vcalc');
$('#vtpl').textContent=nm;
c.innerHTML=amt?'<div>'+n+' instance'+(n>1?'s':'')+' &times; <b>'+amt+' '+u+'</b> = <b>'+fmt(tot)+'</b> total storage</div>'+(sl.value?'<div>Storage type: <b>'+sl.value+'</b></div>':'')+'<div>Snapshot frequency: <b>'+sn+'</b></div>'+(tp?'<div>Throughput per volume: <b>'+tp+' '+tu+'</b></div>':'')+'<div>Pricing is confirmed in your quote.</div>':'<div>No additional storage selected.</div><div>Pricing is confirmed in your quote.</div>';
if(!amt)return (sl.value?[['Storage type',sl.value]]:[]).concat([['Storage','None']]);
var r=(sl.value?[['Storage type',sl.value]]:[]).concat([['Storage per instance',amt+' '+u],['Total storage',fmt(tot)],['Snapshots',sn]]);if(tp)r.push(['Throughput per volume',tp+' '+tu]);return r}
function upd(){
P.querySelectorAll('.cxr label').forEach(function(l){l.classList.toggle('on',l.querySelector('input').checked)});
loc.hidden=$('input[name=cm]:checked').value==='all';
var no=sel<0,d=no?['','None selected',0,0,0,0,'']:DATA[sel],cu=d[0]==='Custom';cc.hidden=!cu;$('#spt').textContent=d[1];$('#spo').textContent=cos.value;
var n=Math.max(1,Math.min(50,parseInt(cn.value,10)||1)),cores=cu?Math.max(1,parseInt(cp.value,10)||1):d[2],gb=cu?Math.max(1,parseInt(cmm.value,10)||1):d[3];
cch.innerHTML=no?'No instance selected':'Chosen instance: <b>'+d[1]+'</b><em>|</em>Type: <b>'+cit.value+'</b><em>|</em>Family: <b>'+d[0]+'</b><em>|</em><b>'+cores+' vCPU</b><em>|</em><b>'+gb+' GiB Memory</b>';
var all=$('input[name=cm]:checked').value==='all';
var R=[['Location',all?'All locations':lt.value],['Region',all?'All regions':rg.value],['Instance',cit.value],['Operating system',cos.value],['Offering',d[1]]].concat(no?[['Instances',n]]:[['Family',d[0]],['Instances',n],['Total vCPUs',cores*n],['Total memory',(gb*n)+' GB']]);
if(no){}else if(!cu)R=R.concat([['Storage per instance',d[4]+' GB'],['Network','25 Gbps'],['Base price (per instance)',money(d[5])+' / month'],['Estimated monthly total',money(d[5]*n)]]);else R.push(['Base price','Custom quote']);
R=R.concat(vRows(n)).concat(spRows());
sm.innerHTML=R.map(function(r){return '<div><dt>'+r[0]+'</dt><dd>'+r[1]+'</dd></div>'}).join('');
var body='Hello Unified Cloud,\n\nI would like a quote for:\n'+R.map(function(r){return r[0]+': '+r[1]}).join('\n')+'\n\nName:\nCompany:\nPhone:\n';
bt.href='mailto:info@unifiedit.xyz?subject='+encodeURIComponent('Cloud '+cit.value+' quote: '+d[1]+' x '+n)+'&body='+encodeURIComponent(body)}
P.addEventListener('input',function(e){if(e.target===cis){page=1;render()}upd()});
P.addEventListener('change',function(e){var t=e.target;if(t.id==='vvol'&&!t.value)$('#vamt').value='';if(t===ps||t===fv||t===fm||t===fs||t===fn){page=1;render()}upd()});
P.addEventListener('click',function(e){var t=e.target,x;
if((x=t.closest('.itrow'))){var ni=+x.getAttribute('data-i');sel=(sel===ni)?-1:ni;render();upd();return}
if((x=t.closest('#ittabs button'))){tab=x.getAttribute('data-t');page=1;render();return}
if((x=t.closest('.cxpc'))&&!x.classList.contains('on')){P.querySelectorAll('.cxpc').forEach(function(y){y.classList.toggle('on',y===x)});x.querySelector('input[name=sp]').checked=true;upd()}
if((x=t.closest('.cxnum button'))){cn.value=Math.max(1,Math.min(50,(parseInt(cn.value,10)||1)+(+x.getAttribute('data-d'))));upd();return}
if((x=t.closest('.cxpn button'))&&!x.disabled){page=+x.getAttribute('data-p');render()}});
go.addEventListener('keydown',function(e){if(e.key==='Enter'){page=parseInt(go.value,10)||1;render();go.value=''}});
render();upd()})();
} catch (err) { console.error("[Instance configurator]", err); }
