/* Moved out of index.html so the Content-Security-Policy can forbid inline script. */
if (location.hash === '#partner' || location.hash === '#pg-partner' || location.hash.indexOf('#partner') === 0) {
  location.replace('/partners');
}
window.addEventListener('hashchange', function() {
  if (location.hash === '#partner' || location.hash === '#pg-partner' || location.hash.indexOf('#partner') === 0) {
    location.replace('/partners');
  }
});
