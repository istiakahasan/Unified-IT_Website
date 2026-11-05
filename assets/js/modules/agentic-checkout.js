/**
 * Ready-Made AI and Chat-Only AI pages: fixed-price configurators that end in a WHMCS order.
 * The prices shown are a preview; the server recomputes every price, the RAG character count and the
 * voice rule when the order is placed (server/agentic-ai.mjs).
 */
(function () {
  'use strict';
  if (!window.AGX) return;
  var A = window.AGX;

  document.querySelectorAll('[data-agx="READY_MADE"],[data-agx="CHAT_ONLY"]').forEach(init);

  function flat(spec) {
    return spec.sections ? spec.sections.reduce(function (a, s) { return a.concat(s.fields); }, []) : spec.fields;
  }

  function init(root) {
    var mode = root.getAttribute('data-agx');
    var ready = mode === 'READY_MADE';
    var S = { cat: null, cfg: null, product: null, backup: true, maintenance: false, voice: false, docs: [], skipped: 0, key: null, busy: false, compare: false };

    root.innerHTML = '<p class="agx-loading">Loading…</p>';
    A.catalog().then(function (c) {
      S.cat = c;
      S.cfg = c.configurations.filter(function (x) { return x.code === mode; })[0];
      if (!S.cfg) throw new Error('config');
      S.product = ready && c.products.length ? c.products[0].code : null;
      build();
    }).catch(function () {
      root.innerHTML = A.crumb(ready ? 'Ready-Made AI' : 'Chat-Only AI') +
        A.hero(ready ? 'Ready-Made AI' : 'Chat-Only AI', 'Ordering is unavailable right now', 'The ordering service could not be reached from this page. Please try again shortly or contact sales.');
    });

    /* ----------------------------------------------------------- pricing */

    function product() {
      return S.cat.products.filter(function (p) { return p.code === S.product; })[0] || null;
    }

    function preview() {
      var r = S.cat.rates, p = product(), voice = S.voice && S.cfg.voiceAllowed;
      var chars = S.docs.reduce(function (s, d) { return s + d.chars; }, 0);
      var oneTime = [], recurring = [{ label: 'Server', amount: r.serverMonthly }], backupPending = null;
      if (S.cfg.developmentCost > 0) oneTime.push({ label: S.cfg.name + ' development', amount: S.cfg.developmentCost });
      if (p && p.setupFee > 0) oneTime.push({ label: p.name + ' setup', amount: p.setupFee });
      if (p && p.monthlyFee > 0) recurring.push({ label: p.name, amount: p.monthlyFee });
      if (S.backup) {
        if (r.backupInterval === 'one_time') oneTime.push({ label: 'Backup', amount: r.backupAmount });
        else if (r.backupInterval === 'monthly') recurring.push({ label: 'Backup', amount: r.backupAmount });
        else backupPending = r.backupAmount;
      }
      if (S.maintenance) recurring.push({ label: 'Maintenance', amount: r.maintenanceMonthly });
      var ot = oneTime.reduce(function (s, l) { return s + l.amount; }, 0);
      var rc = recurring.reduce(function (s, l) { return s + l.amount; }, 0);
      var rag = chars * r.ragPerCharacter;
      return { voice: voice, oneTime: oneTime, recurring: recurring, backupPending: backupPending, chars: chars, rag: rag, initial: ot + rc + rag, rc: rc };
    }

    /* ------------------------------------------------------------ markup */

    function productCards() {
      return '<div class="cxr agx-products" role="radiogroup" aria-label="Ready-Made solutions">' + S.cat.products.map(function (p) {
        var price = (p.setupFee > 0 ? A.tk(p.setupFee) + ' setup' : 'No setup fee') + (p.monthlyFee > 0 ? ' · +' + A.tk(p.monthlyFee) + ' / month' : '');
        return '<label class="' + (S.product === p.code ? 'on' : '') + '"><input type="radio" name="agx-prod-' + mode + '" value="' + A.esc(p.code) + '"' + (S.product === p.code ? ' checked' : '') + '>' +
          '<span class="cxd"></span><span>' + (p.badge ? '<span class="agx-chip">' + A.esc(p.badge) + '</span>' : '') +
          '<b>' + A.esc(p.name) + '</b><small>' + A.esc(p.description) + '</small>' +
          '<ul class="agx-caps">' + p.capabilities.map(function (c) { return '<li>' + A.esc(c) + '</li>'; }).join('') + '</ul>' +
          '<span class="agx-price">' + A.esc(price) + '</span></span></label>';
      }).join('') + '</div>' +
        (S.cat.products.length > 1 ? '<button type="button" class="agx-linkbtn" data-compare aria-expanded="false">Compare solutions</button><div data-compare-table hidden></div>' : '');
    }

    function compareTable() {
      var ps = S.cat.products, caps = [];
      ps.forEach(function (p) { p.capabilities.forEach(function (c) { if (caps.indexOf(c) < 0) caps.push(c); }); });
      return '<div class="agx-tablewrap"><table class="agx-compare"><thead><tr><th scope="col">Capability</th>' + ps.map(function (p) { return '<th scope="col">' + A.esc(p.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        caps.map(function (c) {
          return '<tr><th scope="row">' + A.esc(c) + '</th>' + ps.map(function (p) {
            return p.capabilities.indexOf(c) > -1 ? '<td><span aria-label="Included">✓</span></td>' : '<td><span aria-label="Not included">—</span></td>';
          }).join('') + '</tr>';
        }).join('') +
        '<tr><th scope="row">One-time setup</th>' + ps.map(function (p) { return '<td>' + (p.setupFee > 0 ? A.tk(p.setupFee) : 'None') + '</td>'; }).join('') + '</tr>' +
        '<tr><th scope="row">Monthly add-on</th>' + ps.map(function (p) { return '<td>' + (p.monthlyFee > 0 ? A.tk(p.monthlyFee) : 'None') + '</td>'; }).join('') + '</tr>' +
        '</tbody></table></div><p class="agx-help">Server, backup, maintenance and usage charges apply to every solution and are shown in your summary.</p>';
    }

    function optionCards() {
      var r = S.cat.rates;
      var interval = r.backupInterval === 'one_time' ? 'one-time' : r.backupInterval === 'monthly' ? 'per month' : 'billing interval to be confirmed';
      var h = '<div class="cxr agx-two">';
      if (S.cfg.voiceAllowed) {
        h += '<label data-opt="voice"><input type="checkbox" data-voice><span class="cxd"></span><span><b>Voice calling</b><small>' + A.tk(r.callPerMinute) + ' per minute, billed after use from recorded call minutes.</small>' +
          (S.cat.telephony.configured ? '' : '<small class="agx-note">' + A.esc(S.cat.telephony.notice) + '</small>') + '</span></label>';
      }
      h += '<label data-opt="backup" class="on"><input type="checkbox" data-backup checked><span class="cxd"></span><span><b>Backup</b><small>' + A.tk(r.backupAmount) + ' (' + interval + ').</small></span></label>' +
        '<label data-opt="mon"><input type="radio" name="agx-mnt-' + mode + '" value="1"><span class="cxd"></span><span><b>Enable Maintenance</b><small>' + A.tk(r.maintenanceMonthly) + ' per month.</small></span></label>' +
        '<label data-opt="nomon" class="on"><input type="radio" name="agx-mnt-' + mode + '" value="0" checked><span class="cxd"></span><span><b>Do Not Require Maintenance</b><small>No maintenance charge or subscription.</small></span></label></div>';
      if (!S.cfg.voiceAllowed) h += '<p class="agx-help">Voice calling is not part of the Chat-Only option.</p>';
      return h;
    }

    function ragPanel() {
      var L = S.cat.ragLimits, r = S.cat.rates;
      return '<div class="agx-grid"><label class="agx-f"><span class="agx-flabel">Upload text documents</span><input type="file" multiple data-files accept="' + L.extensions.join(',') + '"></label>' +
        '<label class="agx-f"><span class="agx-flabel">Or paste text</span><textarea data-paste rows="4"></textarea></label></div>' +
        '<p class="agx-help">' + A.tk(r.ragPerCharacter) + ' per character. Every character counts: letters (English and Bengali), digits, symbols, spaces, tabs and line breaks, nothing is trimmed. Up to ' + L.maxDocuments + ' documents, ' + (L.maxFileBytes / 1048576) + ' MB each. Supported: ' + A.esc(L.extensions.join(', ')) + '. PDF and Word files are not supported yet; paste their text. The server recounts before billing.</p>' +
        '<div data-docs></div><p class="agx-ferr agx-docerr" role="alert" data-docerr></p>';
    }

    function build() {
      var spec = S.cat.forms[mode];
      var contact = S.cat.contactFields;
      var label = ready ? 'Ready-Made AI' : 'Chat-Only AI';
      var main = '';
      var n = 0;
      if (ready) {
        main += A.panel(++n, 'Choose your solution', 'Pick the pre-built agent that fits best. You can compare them side by side.', productCards());
        main += A.panel(++n, 'Options', 'Add what you need. Each option is priced separately in your summary.', optionCards());
        main += A.panel(++n, 'Knowledge base', 'Optional. Give the agent your own content.', ragPanel());
        main += A.panel(++n, 'About your use', 'Optional notes that help us prepare your deployment.', A.groupHtml(flat(spec), mode));
      } else {
        main += A.panel(++n, 'Configure your chatbot', 'Tell us what the chatbot should do and how it should talk.',
          spec.sections.map(function (s) { return '<h4 class="agx-sub">' + A.esc(s.title) + '</h4>' + A.groupHtml(s.fields, mode); }).join(''));
        main += A.panel(++n, 'Options', 'Server and backup are included below; maintenance is optional.', optionCards());
        main += A.panel(++n, 'Knowledge base', 'Optional. Documents the chatbot should answer from.', ragPanel());
      }
      main += A.panel(++n, 'Your details', 'We use these to create your order and send your invoice.', '<div data-contact>' + A.groupHtml(contact, mode + '-c') + '</div>');

      root.innerHTML = A.crumb(label) +
        (ready
          ? A.hero('Ready-Made AI', 'Pre-built AI agents, ready to deploy', 'Choose a proven agent, add the options you need and order online. Pricing is fixed and shown before you pay.')
          : A.hero('Chat-Only AI', 'A focused chatbot for your conversations', 'Conversational AI for your website and customers, without autonomous automation. Configure it, review the price and order online.')) +
        A.steps(ready
          ? [['Choose', 'Pick a solution'], ['Configure', 'Options and knowledge base'], ['Review', 'See every charge'], ['Pay', 'Secure WHMCS checkout']]
          : [['Configure', 'Purpose, language, tone'], ['Add knowledge', 'Optional documents'], ['Review', 'See every charge'], ['Pay', 'Secure WHMCS checkout']]) +
        '<div class="agx-layout"><div class="agx-main">' + main + '</div>' +
        '<aside class="agx-aside" aria-label="Order summary"><div class="agx-sum" data-sum></div>' +
        '<p class="agx-formerr agx-ferr" role="alert" data-formerr></p>' +
        '<button class="vb agx-cta" type="button" data-pay>Proceed to Payment</button>' +
        '<p class="agx-help">You pay on the WHMCS invoice. Your service is activated only after the payment is confirmed.</p></aside></div>' +
        '<div data-done></div>';
      sync();
    }

    /* ----------------------------------------------------------- updates */

    function sync() {
      var q = root.querySelector('[data-voice]');
      if (q) q.checked = S.voice;
      root.querySelectorAll('.cxr label').forEach(function (l) {
        var i = l.querySelector('input');
        if (i.type === 'radio' && i.name.indexOf('agx-prod') === 0) l.classList.toggle('on', i.value === S.product);
      });
      var set = function (sel, on) { var el = root.querySelector(sel); if (el) el.classList.toggle('on', on); };
      set('[data-opt="voice"]', S.voice); set('[data-opt="backup"]', S.backup); set('[data-opt="mon"]', S.maintenance); set('[data-opt="nomon"]', !S.maintenance);
      summary();
    }

    function summary() {
      var q = preview(), p = product(), r = S.cat.rates;
      var h = '<h3>Order summary</h3>';
      h += A.row('Option', A.esc(S.cfg.name));
      if (ready) h += A.row('Solution', p ? A.esc(p.name) : 'Not selected');
      h += A.row('Voice calling', q.voice ? 'Enabled' : (S.cfg.voiceAllowed ? 'Not selected' : 'Not available'));
      h += A.row('Maintenance', S.maintenance ? 'Enabled' : 'Not required');
      h += '<h4>One-time charges</h4>' + (q.oneTime.length ? q.oneTime.map(function (l) { return A.row(l.label, A.tk(l.amount)); }).join('') : A.row('Development cost', A.tk(0)));
      h += '<h4>Recurring charges</h4>' + q.recurring.map(function (l) { return A.row(l.label, A.tk(l.amount) + ' / month'); }).join('');
      if (q.backupPending !== null) h += A.row('Backup (interval to be confirmed)', A.tk(q.backupPending)) + '<p class="agx-help">Backup is listed separately and is not included in the estimates until its billing interval is confirmed.</p>';
      h += '<h4>Usage-based charges</h4>' + A.row('RAG characters', q.chars.toLocaleString('en-US')) + A.row('Estimated RAG cost', A.tk(q.rag));
      if (q.voice) h += A.row('Voice calling rate', A.tk(r.callPerMinute) + ' / minute (billed after use)');
      h += '<h4>Payment estimates</h4>' + A.row('Initial payment', A.tk(q.initial), 'tot') + A.row('Recurring payment', A.tk(q.rc) + ' / month', 'tot');
      h += '<p class="agx-help">Initial payment = one-time charges + first month of recurring charges + RAG processing. Voice minutes are never charged in advance. The server confirms the final amounts before you pay.</p>';
      root.querySelector('[data-sum]').innerHTML = h;
    }

    function renderDocs() {
      var el = root.querySelector('[data-docs]');
      if (!S.docs.length) { el.innerHTML = ''; return; }
      var rate = S.cat.rates.ragPerCharacter;
      el.innerHTML = '<div class="agx-docs"><div class="h"><span>Document</span><span>Characters</span><span>Status</span><span>Est. cost</span></div>' +
        S.docs.map(function (d, i) {
          return '<div><span>' + A.esc(d.name) + ' <a href="#" data-rm="' + i + '">remove</a></span><span>' + d.chars.toLocaleString('en-US') + '</span><span>Ready</span><span>' + A.tk(d.chars * rate) + '</span></div>';
        }).join('') + '</div>' + (S.skipped ? '<p class="agx-help">' + S.skipped + ' duplicate document(s) skipped so identical content is not billed twice.</p>' : '');
    }

    function addDoc(name, text) {
      var err = root.querySelector('[data-docerr]');
      if (text.indexOf('\u0000') > -1) { err.textContent = '"' + name + '" looks like a binary file. Only readable text is accepted.'; return; }
      if (S.docs.some(function (d) { return d.text === text; })) { S.skipped++; return; }
      if (S.docs.length >= S.cat.ragLimits.maxDocuments) { err.textContent = 'At most ' + S.cat.ragLimits.maxDocuments + ' documents per order.'; return; }
      S.docs.push({ name: name, text: text, chars: A.countChars(text) });
    }

    function readFiles(files) {
      var err = root.querySelector('[data-docerr]'); err.textContent = '';
      var L = S.cat.ragLimits;
      return Promise.all(Array.prototype.map.call(files, function (f) {
        var ext = (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (L.extensions.indexOf(ext) < 0) { err.textContent = '"' + f.name + '": unsupported file type.'; return null; }
        if (f.size > L.maxFileBytes) { err.textContent = '"' + f.name + '" is larger than ' + (L.maxFileBytes / 1048576) + ' MB.'; return null; }
        return f.arrayBuffer().then(function (buf) {
          try { addDoc(f.name, new TextDecoder('utf-8', { fatal: true }).decode(buf)); } catch (e) { err.textContent = '"' + f.name + '" is not valid UTF-8 text.'; }
        });
      })).then(function () { renderDocs(); summary(); });
    }

    function pasted() {
      S.docs = S.docs.filter(function (d) { return d.name !== 'pasted-text.txt'; });
      var t = root.querySelector('[data-paste]').value;
      if (t) S.docs.push({ name: 'pasted-text.txt', text: t, chars: A.countChars(t) });
    }

    /* ------------------------------------------------------------ submit */

    function submit() {
      var err = root.querySelector('[data-formerr]');
      A.clearErrors(root);
      if (S.busy) return;
      var contact = A.readFields(root.querySelector('[data-contact]'), S.cat.contactFields);
      var spec = S.cat.forms[mode];
      var requirements = A.readFields(root, flat(spec));
      var bad = {};
      if (!contact.name || contact.name.length < 2) bad.name = 'Enter your full name.';
      if (!contact.email || !/^\S+@\S+\.\S+$/.test(contact.email)) bad.email = 'Enter a valid email address.';
      if (A.showErrors(root, bad, '[data-contact]')) { err.textContent = 'Please complete your contact details.'; return; }
      var missing = {};
      flat(spec).forEach(function (f) { if (f.required && !requirements[f.key]) missing[f.key] = f.label + ' is required.'; });
      if (A.showErrors(root, missing)) { err.textContent = 'Please complete the required fields.'; return; }
      if (ready && !S.product) { err.textContent = 'Choose a solution first.'; return; }

      var btn = root.querySelector('[data-pay]');
      S.busy = true; btn.disabled = true; btn.textContent = 'Preparing your invoice…';
      if (!S.key) S.key = A.newKey();
      var pre = preview();
      var body = {
        idempotencyKey: S.key, configCode: mode, productCode: ready ? S.product : undefined,
        backup: S.backup, maintenance: S.maintenance, voice: pre.voice, expectedInitialTotal: pre.initial,
        customer: contact, requirements: requirements,
        documents: S.docs.filter(function (d) { return d.name !== 'pasted-text.txt'; }).map(function (d) { return { name: d.name, text: d.text }; }),
        ragText: root.querySelector('[data-paste]').value
      };
      A.api('POST', 'orders', body).then(function (r) {
        if (!r.ok) {
          if (r.data && r.data.code === 'price_changed') {
            err.textContent = r.data.message + ' New initial payment: ' + A.tk(r.data.quote.totals.initialPayment) + '.';
            A.catalog(true).then(function (c) { S.cat = c; summary(); });
          } else {
            if (r.data && r.data.fields) A.showErrors(root, r.data.fields);
            err.textContent = (r.data && r.data.message) || 'Could not place the order.';
          }
          return;
        }
        done(r.data, contact.email);
      }).catch(function () { err.textContent = 'The ordering service is unreachable. Please try again.'; })
        .then(function () { S.busy = false; btn.disabled = false; btn.textContent = 'Proceed to Payment'; });
    }

    function done(j, email) {
      S.key = null;
      var inv = j.invoice || {};
      var safe = /^https?:\/\//i.test(j.checkoutUrl || '');
      var lines = ['Invoice ' + A.esc(inv.id) + ' for <b>' + A.tk(inv.amount) + '</b> is awaiting payment. Your service is activated only after the payment is confirmed.'];
      if (safe) lines.push('<a class="agx-link" href="' + A.esc(j.checkoutUrl) + '" rel="noopener">Continue to payment</a>');
      else lines.push('The billing system is in sandbox mode, so there is no payment page yet. Keep your reference and email to track this order.');
      var el = root.querySelector('[data-done]');
      el.innerHTML = A.confirmation('Order created', lines, j.orderRef, email);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (safe) window.location.href = j.checkoutUrl;
    }

    /* ---------------------------------------------------------- listeners */

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name && t.name.indexOf('agx-prod') === 0) { S.product = t.value; sync(); }
      else if (t.hasAttribute('data-voice')) { S.voice = t.checked; sync(); }
      else if (t.hasAttribute('data-backup')) { S.backup = t.checked; sync(); }
      else if (t.name && t.name.indexOf('agx-mnt') === 0) { S.maintenance = t.value === '1'; sync(); }
      else if (t.hasAttribute('data-files')) { readFiles(t.files).then(function () { t.value = ''; }); }
    });
    root.addEventListener('input', function (e) { if (e.target.hasAttribute('data-paste')) { pasted(); renderDocs(); summary(); } });
    root.addEventListener('click', function (e) {
      var rm = e.target.closest && e.target.closest('[data-rm]');
      if (rm) {
        e.preventDefault();
        var d = S.docs.splice(+rm.getAttribute('data-rm'), 1)[0];
        if (d && d.name === 'pasted-text.txt') root.querySelector('[data-paste]').value = '';
        renderDocs(); summary(); return;
      }
      var cmp = e.target.closest && e.target.closest('[data-compare]');
      if (cmp) {
        S.compare = !S.compare;
        var box = root.querySelector('[data-compare-table]');
        box.hidden = !S.compare; box.innerHTML = S.compare ? compareTable() : '';
        cmp.setAttribute('aria-expanded', String(S.compare));
        cmp.textContent = S.compare ? 'Hide comparison' : 'Compare solutions';
        return;
      }
      if (e.target.closest('[data-pay]')) submit();
    });
  }
})();
