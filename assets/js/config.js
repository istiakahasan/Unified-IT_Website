/**
 * Application configuration: site links and asset routes.
 * Links inside the page markup and in assets/js/data/service-pages.js are still absolute URLs;
 * search for "unified.it.com" if the domain changes.
 */
window.UNIFIED_CONFIG = {
  siteUrl: 'https://unified.it.com/',
  servicesUrl: 'https://unified.it.com/services/',
  modelUrl: 'assets/models/server-rack.glb',
  // Live USD to BDT rate for the DigiCert prices (null = always use the fallbackRate in data/digicert-prices.js)
  fxApi: 'https://open.er-api.com/v6/latest/USD'
};
