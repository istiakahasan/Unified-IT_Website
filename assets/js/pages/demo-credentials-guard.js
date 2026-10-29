/* Demo credentials only work in local development (production disables them server-side); hide the shortcuts elsewhere. */
(function(){var h=location.hostname;if(!(h==='localhost'||h==='127.0.0.1'||/\.localhost$/.test(h))){document.querySelectorAll('.quick-role-selector,.admin-quick-creds-box').forEach(function(b){b.remove();});}})();
