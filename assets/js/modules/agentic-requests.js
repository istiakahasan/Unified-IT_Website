/**
 * Customized Agentic AI and Branded Agentic AI pages: requirement forms that become quotation requests.
 * Nothing is charged here. The request is saved, emailed to our team, analysed, quoted, and only then paid.
 */
(function () {
  'use strict';
  if (!window.AGX) return;
  var A = window.AGX;

  var PAGES = {
    CUSTOMIZED: {
      label: 'Customized Agentic AI',
      badge: 'Customized Agentic AI',
      title: 'An AI agent built around your business',
      text: 'Describe your business, goals and systems. Our engineers analyse the requirements and send you a project-specific quotation before you pay anything.',
      noun: 'Customized'
    },
    BRANDED: {
      label: 'Branded Agentic AI',
      badge: 'Branded Agentic AI',
      title: 'An AI agent that speaks as your brand',
      text: 'Share your brand identity, appearance and deployment preferences. We prepare a quotation for an agent that looks and sounds like your business.',
      noun: 'Branded'
    }
  };
  var FLOW = [
    ['Submit', 'Tell us your requirements'],
    ['We analyse', 'Scope, effort and integrations'],
    ['Quotation', 'Sent to you by email'],
    ['Pay and build', 'Development starts after payment is verified']
  ];

  document.querySelectorAll('[data-agx="CUSTOMIZED"],[data-agx="BRANDED"]').forEach(init);

  function allFields(spec) {
    return spec.sections.reduce(function (a, s) { return a.concat(s.fields); }, []);
  }

  function init(root) {
    var mode = root.getAttribute('data-agx');
    var P = PAGES[mode];
    var S = { cat: null, key: null, busy: false };

    root.innerHTML = '<p class="agx-loading">Loading…</p>';
    A.catalog().then(function (c) { S.cat = c; build(); }).catch(function () {
      root.innerHTML = A.crumb(P.label) + A.hero(P.badge, 'Requests are unavailable right now', 'The service could not be reached from this page. Please try again shortly or contact sales.');
    });

    function filesPanel(spec) {
      var f = spec.files;
      var accept = function (r) { return r.mimes.join(','); };
      return '<div class="agx-grid">' +
        '<label class="agx-f" data-field="logo"><span class="agx-flabel">' + A.esc(f.logo.label) + '</span><input type="file" data-file="logo" accept="' + accept(f.logo) + '"><small class="agx-help">PNG, JPEG or WebP, up to ' + (f.logo.maxBytes / 1048576) + ' MB.</small><small class="agx-ferr" role="alert"></small></label>' +
        '<label class="agx-f" data-field="brandAssets"><span class="agx-flabel">' + A.esc(f.brandAssets.label) + '</span><input type="file" multiple data-file="brandAssets" accept="' + accept(f.brandAssets) + '"><small class="agx-help">PNG, JPEG, WebP or PDF, up to ' + (f.brandAssets.maxBytes / 1048576) + ' MB each.</small><small class="agx-ferr" role="alert"></small></label>' +
        '</div>';
    }

    function build() {
      var spec = S.cat.forms[mode];
      var n = 0;
      var main = spec.sections.map(function (s) {
        return A.panel(++n, s.title, '', A.groupHtml(s.fields, mode));
      }).join('');
      if (spec.files) main += A.panel(++n, 'Logo and brand assets', 'Optional, but they help us design your agent faster.', filesPanel(spec));
      main += A.panel(++n, 'Your contact details', 'Our team and the quotation will reach you here.', '<div data-contact>' + A.groupHtml(S.cat.contactFields, mode + '-c') + '</div>');

      root.innerHTML = A.crumb(P.label) + A.hero(P.badge, P.title, P.text) + A.steps(FLOW) +
        '<div class="agx-layout"><div class="agx-main">' + main +
        '<div class="agx-submit"><p class="agx-formerr agx-ferr" role="alert" data-formerr></p>' +
        '<button class="vb agx-cta" type="button" data-submit>Submit requirements</button>' +
        '<p class="agx-help">Submitting is free and does not commit you to anything. We email you a quotation; you decide whether to accept it.</p></div></div>' +
        '<aside class="agx-aside" aria-label="What happens next"><div class="agx-sum agx-next"><h3>What happens next</h3><ol>' +
        '<li><b>You submit</b><span>Your requirements are saved and sent to our team. You get a reference number.</span></li>' +
        '<li><b>We review</b><span>Our engineers assess scope, integrations, effort and cost.</span></li>' +
        '<li><b>You receive a quotation</b><span>Scope, solution, cost, additional charges, timeline, payment instructions and validity.</span></li>' +
        '<li><b>You approve and pay</b><span>The order stays pending until the payment is verified.</span></li>' +
        '<li><b>We build</b><span>Development starts after verification, and you can follow every status.</span></li></ol></div></aside></div>' +
        '<div data-done></div>';
    }

    function readFiles() {
      var jobs = [];
      root.querySelectorAll('[data-file]').forEach(function (input) {
        Array.prototype.forEach.call(input.files || [], function (f) { jobs.push(A.fileToPayload(f, input.getAttribute('data-file'))); });
      });
      return Promise.all(jobs);
    }

    function submit() {
      var err = root.querySelector('[data-formerr]');
      A.clearErrors(root);
      if (S.busy) return;
      var spec = S.cat.forms[mode];
      var fields = A.readFields(root, allFields(spec));
      var contact = A.readFields(root.querySelector('[data-contact]'), S.cat.contactFields);

      var missing = {};
      allFields(spec).forEach(function (f) { if (f.required && !fields[f.key]) missing[f.key] = f.label + ' is required.'; });
      var bad = {};
      if (!contact.name || contact.name.length < 2) bad.name = 'Enter your full name.';
      if (!contact.email || !/^\S+@\S+\.\S+$/.test(contact.email)) bad.email = 'Enter a valid email address.';
      var any = A.showErrors(root, bad, '[data-contact]');
      any = A.showErrors(root, missing) || any;
      if (any) { err.textContent = 'Please correct the highlighted fields.'; return; }

      var btn = root.querySelector('[data-submit]');
      S.busy = true; btn.disabled = true; btn.textContent = 'Submitting…';
      if (!S.key) S.key = A.newKey();
      readFiles().then(function (files) {
        return A.api('POST', 'requests', { category: mode, idempotencyKey: S.key, customer: contact, fields: fields, files: files });
      }).then(function (r) {
        if (!r.ok) {
          var f = r.data && r.data.fields;
          if (f) { A.showErrors(root, f.contact || {}, '[data-contact]'); A.showErrors(root, f); }
          err.textContent = (r.data && r.data.message) || 'Could not submit your request.';
          return;
        }
        S.key = null;
        var d = r.data, lines = [];
        lines.push(d.notifications && d.notifications.customer
          ? 'We emailed a confirmation to <b>' + A.esc(contact.email) + '</b>.'
          : 'Your request is saved. The confirmation email could not be sent right now, so keep your reference number.');
        lines.push('Status: <b>' + A.esc(d.statusLabel) + '</b>. Our team will review it and email you a quotation.');
        var el = root.querySelector('[data-done]');
        el.innerHTML = A.confirmation('Request submitted', lines, d.requestRef, contact.email);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(function (e) {
        err.textContent = (e && e.message && e.message.indexOf('Could not read') === 0) ? e.message : 'The service is unreachable. Please try again.';
      }).then(function () { S.busy = false; btn.disabled = false; btn.textContent = 'Submit requirements'; });
    }

    root.addEventListener('click', function (e) { if (e.target.closest('[data-submit]')) submit(); });
  }
})();
