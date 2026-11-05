/**
 * Shared helpers for the Agentic AI pages (hub, the four option pages and the tracker).
 * Exposes window.AGX. No framework: small string templates, one delegated listener per mount.
 */
(function () {
  'use strict';

  var API = '/api/public/agentic/';
  var catalogPromise = null;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function tk(n) {
    return '৳' + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-US');
  }

  function newKey() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'k-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  /* Same rule as the server: Unicode code points after NFC, whitespace kept, a leading BOM removed. */
  function countChars(text) {
    var n = 0;
    var s = String(text).replace(/^﻿/, '').normalize('NFC');
    for (var ch of s) { n++; }
    return n;
  }

  function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(API + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function catalog(force) {
    if (!catalogPromise || force) {
      catalogPromise = api('GET', 'catalog').then(function (r) {
        if (!r.ok) throw new Error('catalog');
        return r.data;
      });
      catalogPromise.catch(function () { catalogPromise = null; });
    }
    return catalogPromise;
  }

  /* ---------------------------------------------------------------- layout */

  function crumb(label) {
    return '<nav class="agx-crumb" aria-label="Breadcrumb"><a href="#p-agentic">&larr; Agentic AI</a><span aria-hidden="true">/</span><span aria-current="page">' + esc(label) + '</span></nav>';
  }

  function hero(badge, title, text) {
    return '<section class="dsec agx-hero" style="--i:0"><div class="dlab">' + esc(badge) + '</div><h2 class="dh">' + esc(title) + '</h2><p class="dp">' + esc(text) + '</p></section>';
  }

  function steps(list) {
    return '<ol class="agx-steps">' + list.map(function (s, i) {
      return '<li><span class="agx-stepnum">' + (i + 1) + '</span><span><b>' + esc(s[0]) + '</b><small>' + esc(s[1]) + '</small></span></li>';
    }).join('') + '</ol>';
  }

  function panel(num, title, desc, inner, extraClass) {
    return '<section class="agx-panel' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<header><span class="agx-pnum">' + esc(num) + '</span><div><h3>' + esc(title) + '</h3>' + (desc ? '<p class="agx-desc">' + esc(desc) + '</p>' : '') + '</div></header>' +
      '<div class="agx-pbody">' + inner + '</div></section>';
  }

  function row(label, value, cls) {
    return '<div class="agx-row' + (cls ? ' ' + cls : '') + '"><span>' + esc(label) + '</span><b>' + value + '</b></div>';
  }

  /* ---------------------------------------------------------------- fields */

  function fieldHtml(f, value, ns) {
    var id = 'agx-' + ns + '-' + f.key;
    var req = f.required ? ' <i class="agx-req" aria-hidden="true">*</i>' : '';
    var attrs = ' data-k="' + esc(f.key) + '" id="' + id + '"' + (f.required ? ' required aria-required="true"' : '') + (f.max ? ' maxlength="' + f.max + '"' : '');
    var v = value == null ? '' : value;
    var control;
    if (f.type === 'textarea') {
      control = '<textarea' + attrs + ' rows="4">' + esc(v) + '</textarea>';
    } else if (f.type === 'select') {
      control = '<select' + attrs + '><option value="">Select…</option>' + f.options.map(function (o) {
        return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select>';
    } else {
      var type = f.type === 'email' ? 'email' : (f.type === 'url' ? 'url' : 'text');
      control = '<input type="' + type + '"' + attrs + ' value="' + esc(v) + '"' + (f.type === 'domain' ? ' autocapitalize="off" spellcheck="false"' : '') + '>';
    }
    return '<label class="agx-f' + (f.type === 'textarea' ? ' full' : '') + '" data-field="' + esc(f.key) + '"><span class="agx-flabel">' + esc(f.label) + req + '</span>' +
      control + (f.help ? '<small class="agx-help">' + esc(f.help) + '</small>' : '') + '<small class="agx-ferr" role="alert"></small></label>';
  }

  function groupHtml(fields, ns) {
    return '<div class="agx-grid">' + fields.map(function (f) { return fieldHtml(f, '', ns); }).join('') + '</div>';
  }

  function readFields(root, fields) {
    var out = {};
    fields.forEach(function (f) {
      var el = root.querySelector('[data-k="' + f.key + '"]');
      if (el && el.value.trim() !== '') out[f.key] = el.value.trim();
    });
    return out;
  }

  function clearErrors(root) {
    root.querySelectorAll('.agx-f.bad').forEach(function (l) { l.classList.remove('bad'); });
    root.querySelectorAll('.agx-ferr').forEach(function (e) { e.textContent = ''; });
    var top = root.querySelector('.agx-formerr');
    if (top) top.textContent = '';
  }

  /* messages: { fieldKey: 'text' } ; scope limits lookups so two forms on one page do not collide */
  function showErrors(root, messages, scope) {
    var first = null;
    Object.keys(messages || {}).forEach(function (k) {
      var holder = scope ? root.querySelector(scope) : root;
      var label = (holder || root).querySelector('[data-field="' + k + '"]');
      if (!label) return;
      label.classList.add('bad');
      label.querySelector('.agx-ferr').textContent = messages[k];
      if (!first) first = label;
    });
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var input = first.querySelector('input,textarea,select');
      if (input) input.focus({ preventScroll: true });
    }
    return !!first;
  }

  function fileToPayload(file, kind) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onload = function () {
        resolve({ kind: kind, name: file.name, mime: file.type, dataBase64: String(rd.result).split(',')[1] || '' });
      };
      rd.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      rd.readAsDataURL(file);
    });
  }

  /* After a submission the customer follows it in the tracker on the Agentic AI main page. */
  function goTrack(ref, email) {
    try { sessionStorage.setItem('agx-track', JSON.stringify({ ref: ref, email: email })); } catch (e) { /* private mode */ }
    var fill = document.querySelector('[data-agx-tracker]');
    if (fill && fill.__agxFill) fill.__agxFill(ref, email);
    location.hash = '#p-agentic';
  }

  function confirmation(title, lines, ref, email) {
    return '<div class="agx-done" role="status"><div class="agx-tick" aria-hidden="true">✓</div><div><b>' + esc(title) + '</b>' +
      '<div class="agx-refline">Reference <code>' + esc(ref) + '</code></div>' +
      lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') +
      '<div class="agx-actions"><button class="vb" type="button" data-agx-track="' + esc(ref) + '" data-agx-email="' + esc(email) + '">Track this ' + (ref.indexOf('REQ-') === 0 ? 'request' : 'order') + '</button>' +
      '<a class="agx-link" href="#p-agentic">Back to Agentic AI</a></div></div></div>';
  }

  window.AGX = {
    esc: esc, tk: tk, newKey: newKey, countChars: countChars, api: api, catalog: catalog,
    crumb: crumb, hero: hero, steps: steps, panel: panel, row: row,
    fieldHtml: fieldHtml, groupHtml: groupHtml, readFields: readFields,
    clearErrors: clearErrors, showErrors: showErrors, fileToPayload: fileToPayload,
    goTrack: goTrack, confirmation: confirmation
  };

  // The confirmation panels use a data attribute so no inline handlers are needed (CSP).
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-agx-track]');
    if (b) goTrack(b.getAttribute('data-agx-track'), b.getAttribute('data-agx-email'));
  });
})();
