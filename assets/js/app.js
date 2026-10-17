/**
 * Application entry point. Runs last: every module has already initialised itself,
 * so this only verifies the page has what it needs and marks it ready.
 */
(function () {
  var missing = ['THREE', 'anime'].filter(function (g) { return !window[g]; });
  if (missing.length) console.warn('[Unified Cloud] Missing libraries: ' + missing.join(', '));
  document.documentElement.setAttribute('data-app', 'ready');
})();
