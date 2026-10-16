/**
 * Footer taglines
 * Appends the footer (window.__UF) to the VPS, VDS and Business Email pages.
 */
(function(){[['vps','Cloud VPS Hosting · Instant Provisioning · 24/7 Expert Support'],['vds','Dedicated Server Hosting · Bare Metal Performance · 24/7 Expert Support'],['bem','Business Email · Email Hosting · 24/7 Expert Support']].forEach(function(x){var w=document.querySelector('#'+x[0]+' .vw');if(w&&window.__UF)w.insertAdjacentHTML('beforeend',window.__UF(x[1]))})})();
