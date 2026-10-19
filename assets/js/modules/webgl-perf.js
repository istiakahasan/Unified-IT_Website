/**
 * Unified Cloud - WebGL Performance & Hardware Compatibility Manager
 * Conservatively assesses device hardware capabilities (Integrated vs Dedicated GPU),
 * manages adaptive rendering quality tiers, context loss/recovery, pixel ratio capping,
 * and background tab throttling.
 */
(function() {
  'use strict';

  var glTier = null;
  var isSupported = null;
  var gpuRenderer = '';
  var isReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function checkSupport() {
    if (window.__FORCE_WEBGL_FALLBACK || (typeof location !== 'undefined' && location.search && location.search.indexOf('fallback=1') > -1)) {
      isSupported = false;
      glTier = 'fallback';
      return false;
    }
    if (isSupported !== null) return isSupported;
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) {
        isSupported = false;
        glTier = 'fallback';
        return false;
      }
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        gpuRenderer = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
      }
      // Clean up test context
      var ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      isSupported = true;
      return true;
    } catch (e) {
      isSupported = false;
      glTier = 'fallback';
      return false;
    }
  }

  function getTier() {
    if (glTier) return glTier;
    if (!checkSupport()) {
      glTier = 'fallback';
      return glTier;
    }

    var mem = navigator.deviceMemory || 4; // in GB
    var cpu = navigator.hardwareConcurrency || 4;
    var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;

    // Detect software emulators / fallback rasterizers
    if (/swiftshader|llvmpipe|softpipe|software/i.test(gpuRenderer)) {
      glTier = 'low';
      return glTier;
    }

    // Detect integrated GPUs: Intel HD/UHD/Iris, Apple M-series without dGPU, or AMD APUs
    var isIntegrated = /intel|uhd|hd graphics|iris|adreno 3|adreno 4|adreno 5|mali-4|mali-t|powervr/i.test(gpuRenderer);
    var isDedicated = /nvidia|geforce|quadro|rtx|gtx|radeon|amd\s*radeon/i.test(gpuRenderer) && !/radeon\s*(r2|r3|r4|r5|vega [3-8]|graphics)/i.test(gpuRenderer);

    if (isDedicated && mem >= 6 && cpu >= 6 && !isMobile) {
      glTier = 'high';
    } else if (isIntegrated || isMobile || mem < 4 || cpu < 4) {
      glTier = (mem <= 2 || cpu <= 2) ? 'low' : 'medium';
    } else {
      glTier = 'medium';
    }

    return glTier;
  }

  function getTargetPixelRatio() {
    var dpr = window.devicePixelRatio || 1;
    var tier = getTier();
    if (tier === 'high') {
      return Math.min(dpr, 1.6);
    } else if (tier === 'medium') {
      return Math.min(dpr, 1.25);
    } else {
      return 1.0;
    }
  }

  function debounce(fn, wait) {
    var timer;
    return function() {
      var context = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function() {
        fn.apply(context, args);
      }, wait);
    };
  }

  function initContextLossHandler(canvas, onLost, onRestored) {
    if (!canvas || !canvas.addEventListener) return;
    canvas.addEventListener('webglcontextlost', function(e) {
      e.preventDefault();
      console.warn('[WebGLPerf] WebGL context lost on canvas:', canvas.id || 'unnamed');
      if (typeof onLost === 'function') onLost(e);
    }, false);

    canvas.addEventListener('webglcontextrestored', function(e) {
      console.info('[WebGLPerf] WebGL context restored on canvas:', canvas.id || 'unnamed');
      if (typeof onRestored === 'function') onRestored(e);
    }, false);
  }

  window.WebGLPerf = {
    checkSupport: checkSupport,
    getTier: getTier,
    getTargetPixelRatio: getTargetPixelRatio,
    isReducedMotion: function() { return isReducedMotion; },
    getRendererName: function() { return gpuRenderer; },
    debounce: debounce,
    initContextLossHandler: initContextLossHandler
  };
})();
