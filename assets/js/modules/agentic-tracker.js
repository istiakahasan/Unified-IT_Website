/**
 * Order and request tracker on the Agentic AI main page. A customer enters a reference and the email used
 * for it. Priced orders (AGT-...) show charges, usage and invoices; quotation requests (REQ-...) show the
 * progress, the quotation, and the actions the customer is allowed to take at the current status.
 */
(function () {
  'use strict';
  if (!window.AGX) return;
  var A = window.AGX;
  var root = document.querySelector('[data-agx-tracker]');
  if (!root) return;

  var PATH = ['PENDING_ANALYSIS', 'UNDER_REVIEW', 'QUOTATION_SENT', 'AWAITING_PAYMENT', 'PAYMENT_VERIFICATION', 'APPROVED', 'IN_DEVELOPMENT', 'COMPLETED'];
  var LABEL = { PENDING_ANALYSIS: 'Pending Analysis', UNDER_REVIEW: 'Under Review', QUOTATION_SENT: 'Quotation Sent', AWAITING_PAYMENT: 'Awaiting Payment', PAYMENT_VERIFICATION: 'Payment Verification', APPROVED: 'Approved', IN_DEVELOPMENT: 'In Development', COMPLETED: 'Completed' };
  var METHODS = { BANK_TRANSFER: 'Bank transfer', BKASH: 'bKash', NAGAD: 'Nagad', CARD: 'Card', OTHER: 'Other' };
  var CATEGORY = { CUSTOMIZED: 'Customized Agentic AI', BRANDED: 'Branded Agentic AI' };
  var last = { ref: '', email: '' };

  root.innerHTML =
    '<section class="agx-panel agx-trackpanel"><header><span class="agx-pnum">?</span><div><h3>Track an order or request</h3>' +
    '<p class="agx-desc">Enter the reference you received (AGT-… for orders, REQ-… for requests) and the email you used.</p></div></header>' +
    '<div class="agx-pbody"><div class="agx-grid"><label class="agx-f"><span class="agx-flabel">Reference</span><input data-t-ref placeholder="REQ-2026-XXXXXXXX" autocomplete="off"></label>' +
    '<label class="agx-f"><span class="agx-flabel">Email</span><input data-t-email type="email" autocomplete="email"></label></div>' +
    '<div class="agx-actions"><button class="vb" type="button" data-t-go>View status</button><span class="agx-ferr" role="alert" data-t-err></span></div>' +
    '<div data-t-out></div></div></section>';

  var q = function (s) { return root.querySelector(s); };
  var statusClass = function (s) { return /^(REJECTED|CANCELLED|REFUNDED)$/.test(s) ? 'bad' : (/^(COMPLETED|ACTIVE|APPROVED)$/.test(s) ? 'good' : 'mid'); };

  function lookup(ref, email, quiet) {
    var err = q('[data-t-err]'), out = q('[data-t-out]');
    err.textContent = '';
    if (!quiet) out.innerHTML = '';
    ref = (ref || '').trim(); email = (email || '').trim();
    if (!ref || !email) { err.textContent = 'Enter the reference and the email address.'; return Promise.resolve(); }
    last = { ref: ref, email: email };
    return fetch('/api/public/agentic/track?ref=' + encodeURIComponent(ref) + '&email=' + encodeURIComponent(email))
      .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); })
      .then(function (o) {
        if (!o.ok) { err.textContent = o.j.message || 'Lookup failed.'; out.innerHTML = ''; return; }
        out.innerHTML = o.j.kind === 'request' ? renderRequest(o.j) : renderOrder(o.j);
        if (quiet) out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      })
      .catch(function () { err.textContent = 'The service is unreachable. Please try again.'; });
  }

  /* -------------------------------------------------------------- request */

  function stepper(status) {
    var side = status === 'REVISION_REQUESTED' ? 'UNDER_REVIEW' : status;
    var at = PATH.indexOf(side);
    return '<ol class="agx-stepper" aria-label="Progress">' + PATH.map(function (s, i) {
      var cls = at < 0 ? '' : (i < at ? 'done' : (i === at ? 'now' : ''));
      return '<li class="' + cls + '"' + (i === at ? ' aria-current="step"' : '') + '><span>' + (i < at ? '✓' : (i + 1)) + '</span><small>' + LABEL[s] + '</small></li>';
    }).join('') + '</ol>';
  }

  function quotationCard(qt, d) {
    var rows = A.row('Development cost', A.tk(qt.developmentCost)) +
      qt.additionalCharges.map(function (c) { return A.row(c.label, A.tk(c.amount)); }).join('') +
      A.row('Total', A.tk(qt.total), 'tot') +
      A.row('Estimated delivery', qt.timelineDays + ' days after payment is verified') +
      A.row('Valid until', A.esc(qt.validUntil || '-'));
    var h = '<div class="agx-quote"><h4>Quotation v' + qt.version + ' <span class="agx-badge mid">' + A.esc(qt.status.replace(/_/g, ' ').toLowerCase()) + '</span></h4>' +
      '<h5>Project scope</h5><p class="agx-pre">' + A.esc(qt.scope) + '</p><h5>Proposed solution</h5><p class="agx-pre">' + A.esc(qt.proposedSolution) + '</p>' + rows;
    if (['SENT', 'ACCEPTED'].indexOf(qt.status) > -1) h += '<h5>Payment instructions</h5><p class="agx-pre">' + A.esc(qt.paymentInstructions) + '</p>';
    return h + '</div>';
  }

  function respondForm() {
    return '<div class="agx-respond"><h4>Your decision</h4><label class="agx-f full"><span class="agx-flabel">Message (required to request changes)</span><textarea data-r-msg rows="3" maxlength="2000"></textarea></label>' +
      '<div class="agx-actions"><button class="vb" type="button" data-r="accept">Accept quotation</button>' +
      '<button class="agx-ghost" type="button" data-r="revise">Request changes</button>' +
      '<button class="agx-ghost danger" type="button" data-r="decline">Decline</button></div><p class="agx-ferr" role="alert" data-r-err></p></div>';
  }

  function paymentForm(d) {
    var live = d.quotations.filter(function (x) { return x.status === 'ACCEPTED'; })[0];
    var h = '<div class="agx-respond"><h4>Complete your payment</h4>';
    if (live && /^https?:\/\//i.test(live.checkoutUrl || '')) h += '<p><a class="agx-link" href="' + A.esc(live.checkoutUrl) + '" rel="noopener">Pay the invoice online (WHMCS)</a></p>';
    else if (live && live.invoiceId) h += '<p class="agx-help">Invoice ' + A.esc(live.invoiceId) + ' has been created' + (live.sandbox ? ' (sandbox billing, no payment page).' : '.') + '</p>';
    h += '<p class="agx-help">Paid another way? Enter the transaction reference. We verify it with the payment provider before your order is approved; entering it does not mark it paid.</p>' +
      '<div class="agx-grid"><label class="agx-f"><span class="agx-flabel">Method</span><select data-p-method>' + Object.keys(METHODS).map(function (k) { return '<option value="' + k + '">' + METHODS[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="agx-f"><span class="agx-flabel">Transaction / reference number</span><input data-p-ref maxlength="80" autocomplete="off"></label>' +
      '<label class="agx-f"><span class="agx-flabel">Amount paid (BDT)</span><input data-p-amount type="number" min="1" step="0.01" value="' + (live ? live.total : '') + '"></label></div>' +
      '<div class="agx-actions"><button class="vb" type="button" data-pay-ref>Submit payment reference</button></div><p class="agx-ferr" role="alert" data-p-err></p></div>';
    return h;
  }

  function renderRequest(d) {
    var terminal = /^(REJECTED|CANCELLED)$/.test(d.status);
    var h = '<div class="agx-result"><div class="agx-reshead"><div><span class="agx-kicker">' + A.esc(CATEGORY[d.category] || d.category) + '</span><h3>' + A.esc(d.requestRef) + '</h3></div>' +
      '<span class="agx-badge ' + statusClass(d.status) + '">' + A.esc(d.statusLabel) + '</span></div>';
    h += terminal ? '<p class="agx-banner bad">This request is ' + A.esc(d.statusLabel.toLowerCase()) + '.</p>' : stepper(d.status);
    if (d.status === 'REVISION_REQUESTED') h += '<p class="agx-banner">A revised quotation is being prepared.</p>';
    var shown = d.quotations.filter(function (x) { return x.status !== 'SUPERSEDED'; })[0];
    if (shown) h += quotationCard(shown, d);
    if (d.actions.respondToQuotation) h += respondForm();
    if (d.actions.submitPayment) h += paymentForm(d);
    if (d.payments.length) {
      h += '<h4>Payments</h4>' + d.payments.map(function (p) { return A.row(p.method + ' · ' + A.esc(p.reference), A.tk(p.amount) + ' · ' + A.esc(p.status.toLowerCase())); }).join('');
    }
    h += '<details class="agx-details"><summary>Your submitted requirements</summary>' + d.requirements.map(function (r) { return '<div class="agx-req"><b>' + A.esc(r.label) + '</b><p class="agx-pre">' + A.esc(r.value) + '</p></div>'; }).join('') + '</details>';
    h += '<h4>History</h4><ul class="agx-timeline">' + d.events.map(function (e) {
      return '<li><time>' + A.esc((e.at || '').slice(0, 16).replace('T', ' ')) + '</time><span>' + (e.toLabel ? '<b>' + A.esc(e.toLabel) + '</b>' : '') + (e.note ? ' ' + A.esc(e.note) : '') + '</span></li>';
    }).join('') + '</ul></div>';
    return h;
  }

  /* ---------------------------------------------------------------- order */

  function renderOrder(d) {
    var h = '<div class="agx-result"><div class="agx-reshead"><div><span class="agx-kicker">' + A.esc(d.configuration.name) + (d.product ? ' · ' + A.esc(d.product.name) : '') + '</span><h3>' + A.esc(d.orderRef) + '</h3></div>' +
      '<span class="agx-badge ' + statusClass(d.status) + '">' + A.esc(d.status.replace(/_/g, ' ').toLowerCase()) + '</span></div>';
    h += A.row('Service activation', d.activatedAt ? A.esc(d.activatedAt) : 'Not activated yet');
    h += A.row('Voice calling', d.calling.enabled ? 'Enabled (' + A.tk(d.calling.ratePerMinute) + ' / min)' : 'Not included') + A.row('Maintenance', d.maintenance === 'ENABLED' ? 'Enabled' : 'Not required');
    h += A.row('Server', A.tk(d.server.monthly) + ' / month') + A.row('Backup', d.backup.amount === null ? 'Not selected' : A.tk(d.backup.amount) + (d.backup.interval ? ' (' + d.backup.interval.replace('_', ' ') + ')' : ' (interval to be confirmed)'));
    h += '<h4>RAG usage</h4>' + A.row('Characters processed', d.rag.characters.toLocaleString('en-US')) + A.row('RAG cost', A.tk(d.rag.cost));
    d.rag.documents.forEach(function (x) { h += A.row(A.esc(x.name), x.characters.toLocaleString('en-US') + ' chars · ' + A.tk(x.cost)); });
    if (d.calling.enabled) h += '<h4>Calling usage</h4>' + A.row('Calls', d.calling.usage.calls) + A.row('Billed minutes', d.calling.usage.billedMinutes) + A.row('Usage amount', A.tk(d.calling.usage.amount));
    h += '<h4>Invoices</h4>' + (d.invoices.length ? d.invoices.map(function (i) { return A.row('#' + A.esc(i.id) + ' · ' + A.esc(i.kind.toLowerCase()), A.tk(i.amount) + ' · ' + A.esc(i.status.toLowerCase())); }).join('') : A.row('No invoices', ''));
    h += '<h4>Payment history</h4>' + (d.payments.length ? d.payments.map(function (p) { return A.row(A.esc(p.reference), A.esc(p.status.toLowerCase()) + ' · ' + A.esc(p.createdAt)); }).join('') : A.row('No payments yet', ''));
    h += '<h4>Renewal</h4>' + (d.renewal.length ? d.renewal.map(function (s) { return A.row(A.esc(s.kind.toLowerCase()) + ' due ' + A.esc(s.nextDueDate), A.tk(s.amount)); }).join('') : A.row('Starts after activation', ''));
    if (d.requirements && d.requirements.length) h += '<details class="agx-details"><summary>Your configuration</summary>' + d.requirements.map(function (r) { return '<div class="agx-req"><b>' + A.esc(r.label) + '</b><p class="agx-pre">' + A.esc(r.value) + '</p></div>'; }).join('') + '</details>';
    return h + '</div>';
  }

  /* ------------------------------------------------------------- actions */

  function post(path, body, errSel) {
    var err = q(errSel);
    if (err) err.textContent = '';
    return A.api('POST', path, Object.assign({ email: last.email }, body)).then(function (r) {
      if (!r.ok) { if (err) err.textContent = r.data.message || 'That did not work.'; return false; }
      return lookup(last.ref, last.email, true).then(function () { return true; });
    }).catch(function () { if (err) err.textContent = 'The service is unreachable.'; return false; });
  }

  root.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-t-go]')) { lookup(q('[data-t-ref]').value, q('[data-t-email]').value); return; }
    var r = t.closest('[data-r]');
    if (r) {
      var action = r.getAttribute('data-r');
      var msg = (q('[data-r-msg]') || {}).value || '';
      if (action === 'revise' && msg.trim().length < 10) { q('[data-r-err]').textContent = 'Please describe the changes you would like (at least 10 characters).'; return; }
      if (action === 'decline' && !window.confirm('Decline this quotation? The request will be cancelled.')) return;
      r.disabled = true;
      post('requests/' + encodeURIComponent(last.ref) + '/respond', { action: action, message: msg }, '[data-r-err]').then(function () { r.disabled = false; });
      return;
    }
    if (t.closest('[data-pay-ref]')) {
      var btn = t.closest('[data-pay-ref]');
      var err = q('[data-p-err]');
      var ref = q('[data-p-ref]').value.trim(), amount = Number(q('[data-p-amount]').value);
      if (ref.length < 4) { err.textContent = 'Enter the transaction or reference number.'; return; }
      if (!(amount > 0)) { err.textContent = 'Enter the amount you paid.'; return; }
      btn.disabled = true;
      post('requests/' + encodeURIComponent(last.ref) + '/payment', { method: q('[data-p-method]').value, reference: ref, amount: amount }, '[data-p-err]').then(function () { btn.disabled = false; });
    }
  });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('[data-t-ref],[data-t-email]')) lookup(q('[data-t-ref]').value, q('[data-t-email]').value);
  });

  // Called by AGX.goTrack after a submission, and used when this page opens with a stored reference.
  root.__agxFill = function (ref, email) {
    q('[data-t-ref]').value = ref; q('[data-t-email]').value = email;
    lookup(ref, email);
  };
  try {
    var stored = JSON.parse(sessionStorage.getItem('agx-track') || 'null');
    if (stored && stored.ref) { q('[data-t-ref]').value = stored.ref; q('[data-t-email]').value = stored.email; sessionStorage.removeItem('agx-track'); lookup(stored.ref, stored.email); }
  } catch (e) { /* storage unavailable */ }
})();
