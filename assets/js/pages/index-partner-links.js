/* Moved out of index.html so the Content-Security-Policy can forbid inline script. */
(function() {
  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (h === '/partners' || h === '/partner' || h === '/partners/' || h === '/partner/' ||
        h === '#partner' || h === '#pg-partner' ||
        h === 'https://unified.it.com/partner' || h === 'https://unified.it.com/partners' ||
        (h.indexOf('/partner') > -1 && h.indexOf('/partner/dashboard') === -1 && h.indexOf('/admin/partner') === -1)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      document.body.classList.remove('mgo', 'mmo');
      window.location.href = '/partners';
    }
  }, true);
})();
