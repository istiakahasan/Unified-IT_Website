/**
 * CSP-safe replacement for inline event-handler attributes.
 *
 * The Content-Security-Policy forbids inline script (onclick="…", javascript: URLs), so markup uses
 *   data-onclick="switchAdminView('users')"   data-onsubmit="handleLogin(event)"   data-onchange="load(1)"
 * This file finds those attributes with delegated listeners and calls the named global function.
 * The attribute is PARSED, never evaluated: only `name(arg, …)` or `obj.name(arg, …)` is accepted, and
 * arguments may only be string / number / boolean / null literals or the word `event`. A value taken from
 * the database therefore can never become code, even if it contains quotes (it was injectable before).
 *
 * Extra declarative helpers that replace the few handlers that were not plain calls:
 *   data-hide-on-error           <img>: hide the image when it fails to load
 *   data-click-target="selector" clicking this element clicks the element matching selector
 *
 * Loaded as a classic script before the page scripts; works for elements added later via innerHTML.
 */
(function () {
  'use strict';
  if (window.__cspHandlers) return;
  window.__cspHandlers = true;

  var EVENTS = ['click', 'submit', 'change', 'input'];
  var cache = Object.create(null);

  // Parses "fn('a', 1, true, event)" into { path: ['fn'], args: [...] }; returns null when not a plain call.
  function parse(src) {
    if (src in cache) return cache[src];
    var s = String(src).trim().replace(/;$/, '');
    var m = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(([\s\S]*)\)$/.exec(s);
    var result = null;
    if (m) {
      var args = parseArgs(m[2]);
      if (args) result = { path: m[1].split('.'), args: args };
    }
    cache[src] = result;
    if (!result) console.error('[csp-handlers] Unsupported handler (must be a plain function call):', src);
    return result;
  }

  function parseArgs(s) {
    var out = [], i = 0, n = s.length;
    function ws() { while (i < n && /\s/.test(s[i])) i++; }
    ws();
    if (i === n) return out;
    while (i < n) {
      ws();
      var c = s[i], tok;
      if (c === '"' || c === "'") {
        var str = '';
        i++;
        while (i < n && s[i] !== c) {
          if (s[i] === '\\' && i + 1 < n) { i++; var e = s[i]; str += e === 'n' ? '\n' : e === 't' ? '\t' : e; }
          else str += s[i];
          i++;
        }
        if (i >= n) return null; // unterminated string
        i++;
        tok = { v: str };
      } else {
        var mm = /^(-?\d+(?:\.\d+)?|true|false|null|undefined|event)/.exec(s.slice(i));
        if (!mm) return null;
        i += mm[0].length;
        var w = mm[0];
        tok = w === 'event' ? { ev: true }
          : w === 'true' ? { v: true } : w === 'false' ? { v: false }
          : w === 'null' ? { v: null } : w === 'undefined' ? { v: undefined } : { v: Number(w) };
      }
      out.push(tok);
      ws();
      if (i < n) { if (s[i] !== ',') return null; i++; }
    }
    return out;
  }

  function resolve(path) {
    var ctx = window, fn = window;
    for (var k = 0; k < path.length; k++) {
      if (k === 0 && path[0] === 'window') continue;
      ctx = fn;
      fn = fn == null ? undefined : fn[path[k]];
    }
    return typeof fn === 'function' ? { fn: fn, ctx: ctx === window ? window : ctx } : null;
  }

  function run(el, attr, event) {
    var call = parse(el.getAttribute(attr));
    if (!call) return;
    var target = resolve(call.path);
    if (!target) { console.error('[csp-handlers] Handler function not found:', call.path.join('.')); return; }
    var args = call.args.map(function (a) { return a.ev ? event : a.v; });
    return target.fn.apply(target.ctx, args);
  }

  // Emulates inline-handler bubbling: run every matching ancestor from the target upwards, honouring stopPropagation().
  EVENTS.forEach(function (type) {
    var attr = 'data-on' + type;
    document.addEventListener(type, function (event) {
      for (var el = event.target; el && el !== document; el = el.parentNode) {
        if (el.nodeType !== 1) continue;
        if (el.hasAttribute(attr)) {
          // A data-onclick link that points nowhere must not change the location hash (it would close the open page)
          if (type === 'click' && el.tagName === 'A' && (el.getAttribute('href') || '#') === '#') event.preventDefault();
          var ret = run(el, attr, event);
          if (ret === false) event.preventDefault();
        }
        if (type === 'click' && el.hasAttribute('data-click-target')) {
          var t = document.querySelector(el.getAttribute('data-click-target'));
          if (t) t.click();
        }
        if (event.cancelBubble) break;
      }
    });
  });

  // 'error' does not bubble, so listen in the capture phase.
  document.addEventListener('error', function (event) {
    var el = event.target;
    if (el && el.nodeType === 1 && el.hasAttribute('data-hide-on-error')) el.style.display = 'none';
  }, true);

  // Exposed for tests
  window.__cspParseHandler = parse;
})();
