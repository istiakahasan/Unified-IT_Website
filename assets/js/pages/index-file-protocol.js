/* Moved out of index.html so the Content-Security-Policy can forbid inline script. */
/* Opened from disk (file://)? fetch() cannot read the .glb, so load the embedded copy instead. */
if (location.protocol === 'file:') document.write('<script src="assets/js/data/model-data.js"><\/script>');
