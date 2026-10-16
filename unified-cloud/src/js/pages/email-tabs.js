/**
 * Email tabs
 * Injects the Business Email / Hybrid Email / Microsoft 365 tab bar.
 */
(function(){var B='https://unified.it.com/services/',T=[['Business Email',B+'email-hosting','#bem'],['Hybrid Email',B+'hybrid-email','#pg-hybrid'],['Microsoft 365',B+'microsoft','#pg-m365']];
T.forEach(function(c){var w=document.querySelector(c[2]+' .vw');if(!w)return;w.insertAdjacentHTML('afterbegin','<nav class="etabs" aria-label="Email services">'+T.map(function(t){return '<a href="'+t[1]+'" target="_blank" rel="noopener"'+(t===c?' class="on" aria-current="page"':'')+'>'+t[0]+'</a>'}).join('')+'</nav>')})})();
