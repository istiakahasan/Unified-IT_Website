/**
 * Agentic AI configurator and order tracking inside #pg-agentic.
 * Prices shown here are an on-screen preview only: the server recomputes every price, the RAG character
 * count and the voice rule from its own configuration when the order is placed (server/agentic-ai.mjs).
 */

try {
  (function () {
    var P = document.getElementById('pg-agentic');
    if (!P) return;

    var wrap = P.querySelector('.vw');
    if (!wrap) return;

    var CAT = null;
    var S = {
      cfg: 'READY_MADE',
      backup: true,
      maintenance: false,
      voice: false,
      docs: [],
      skipped: 0,
      busy: false,
      key: null
    };

    var root = document.createElement('section');
    root.id = 'agx';
    root.setAttribute('aria-label', 'Agentic AI configurator');

    // Hero first, like the Business Email page; any info cards (.vg) follow the configurator.
    var cards = wrap.querySelector('.vg');
    wrap.insertBefore(root, cards || wrap.querySelector('.uf') || null);

    function esc(t) {
      return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[c];
      });
    }

    function tk(n) {
      return '৳' + (Math.round(Number(n) * 100) / 100).toLocaleString('en-US');
    }

    function newKey() {
      return (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'k-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }

    /* Same rule as the server: Unicode code points after NFC, whitespace kept, a leading BOM removed. */
    function countChars(text) {
      var n = 0;
      var s = String(text).replace(/^﻿/, '').normalize('NFC');
      for (var ch of s) {
        n++;
      }
      return n;
    }

    function cfg() {
      return CAT.configurations.filter(function (c) {
        return c.code === S.cfg;
      })[0];
    }

    function ragChars() {
      return S.docs.reduce(function (s, d) {
        return s + d.chars;
      }, 0);
    }

    function preview() {
      var c = cfg();
      var r = CAT.rates;
      var chars = ragChars();
      var voice = S.voice && c.voiceAllowed;
      var oneTime = [];
      var recurring = [{ label: 'Server', amount: r.serverMonthly }];
      var backupNote = null;

      if (c.developmentCost > 0) {
        oneTime.push({ label: 'Development (one-time)', amount: c.developmentCost });
      }

      if (S.backup) {
        if (r.backupInterval === 'one_time') {
          oneTime.push({ label: 'Backup (one-time)', amount: r.backupAmount });
        } else if (r.backupInterval === 'monthly') {
          recurring.push({ label: 'Backup', amount: r.backupAmount });
        } else {
          backupNote = r.backupAmount;
        }
      }

      if (S.maintenance) {
        recurring.push({ label: 'Maintenance', amount: r.maintenanceMonthly });
      }

      var ot = oneTime.reduce(function (s, l) { return s + l.amount; }, 0);
      var rc = recurring.reduce(function (s, l) { return s + l.amount; }, 0);
      var rag = chars * r.ragPerCharacter;

      return {
        c: c,
        voice: voice,
        oneTime: oneTime,
        recurring: recurring,
        backupNote: backupNote,
        chars: chars,
        rag: rag,
        ot: ot,
        rc: rc,
        initial: ot + rc + rag
      };
    }

    function cfgCard(c) {
      var sub = c.developmentCost > 0
        ? tk(c.developmentCost) + ' one-time development'
        : 'No development fee';

      return '<label class="' + (S.cfg === c.code ? 'on' : '') + '">' +
        '<input type="radio" name="agx-cfg" value="' + esc(c.code) + '"' + (S.cfg === c.code ? ' checked' : '') + '>' +
        '<span class="cxd"></span>' +
        '<span>' +
          '<b>' + esc(c.name) + '</b>' +
          '<small>' + esc(c.description) + '</small>' +
          '<span class="agx-price">' + sub + '</span>' +
          '<small>' + (c.voiceAllowed ? 'Voice calling available' : 'Text chat only, no voice calling') + '</small>' +
        '</span>' +
      '</label>';
    }

    function build() {
      var r = CAT.rates;
      var intervalTxt = r.backupInterval === 'one_time'
        ? 'one-time'
        : r.backupInterval === 'monthly'
        ? 'per month'
        : 'billing interval to be confirmed';

      root.innerHTML =
        '<div class="dm">' +
        '<section class="dsec" style="--i:0;text-align:center;margin-bottom:34px">' +
          '<div class="dlab">Agentic AI &amp; Automation</div>' +
          '<h2 class="dh">Build and deploy your AI agent</h2>' +
          '<p class="dp">Autonomous AI agents that plan, reason, use tools, and execute business workflows on private, enterprise cloud infrastructure.</p>' +
        '</section>' +
        '<p class="agx-sub">Choose a configuration, add your knowledge base, and review exactly what is charged once, monthly and by usage. All prices are in BDT (৳).</p>' +

        '<div class="agx-step">1 · Agent configuration</div>' +
        '<div class="cxr" id="agx-cfgs">' + CAT.configurations.map(cfgCard).join('') + '</div>' +

        '<div class="agx-step">2 · Options</div>' +
        '<div class="cxr agx-two">' +
          '<label id="agx-l-voice">' +
            '<input type="checkbox" id="agx-voice">' +
            '<span class="cxd"></span>' +
            '<span><b>Voice calling</b><small>' + tk(r.callPerMinute) + ' per minute, billed after use from recorded call minutes.</small><small id="agx-voice-note"></small></span>' +
          '</label>' +
          '<label class="on" id="agx-l-backup">' +
            '<input type="checkbox" id="agx-backup" checked>' +
            '<span class="cxd"></span>' +
            '<span><b>Backup</b><small>' + tk(r.backupAmount) + ' (' + intervalTxt + ').</small></span>' +
          '</label>' +
          '<label id="agx-l-mon">' +
            '<input type="radio" name="agx-mnt" value="1">' +
            '<span class="cxd"></span>' +
            '<span><b>Enable Maintenance</b><small>' + tk(r.maintenanceMonthly) + ' per month.</small></span>' +
          '</label>' +
          '<label class="on" id="agx-l-nomon">' +
            '<input type="radio" name="agx-mnt" value="0" checked>' +
            '<span class="cxd"></span>' +
            '<span><b>Do Not Require Maintenance</b><small>No maintenance charge or subscription.</small></span>' +
          '</label>' +
        '</div>' +

        '<div id="agx-brand" hidden>' +
          '<div class="agx-step">3 · Branding and business details</div>' +
          '<div class="agx-grid">' +
            '<label class="agx-f">Brand / company name *<input id="agx-b-name" maxlength="120"></label>' +
            '<label class="agx-f">Logo and brand assets (PNG, JPEG or WebP, max 1 MB)<input id="agx-b-logo" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
            '<label class="agx-f">Business identity<textarea id="agx-b-ident" maxlength="1000"></textarea></label>' +
            '<label class="agx-f">Agent personality<textarea id="agx-b-pers" maxlength="1000"></textarea></label>' +
            '<label class="agx-f full">Business-specific information<textarea id="agx-b-info" maxlength="4000"></textarea></label>' +
            '<label class="agx-f">Customized responses<textarea id="agx-b-resp" maxlength="4000"></textarea></label>' +
            '<label class="agx-f">Business workflows<textarea id="agx-b-flow" maxlength="4000"></textarea></label>' +
          '</div>' +
        '</div>' +

        '<div class="agx-step">Knowledge base (RAG processing, ' + tk(r.ragPerCharacter) + ' per character)</div>' +
        '<div class="agx-grid">' +
          '<label class="agx-f">Upload text documents<input id="agx-files" type="file" multiple accept=".txt,.md,.csv,.json,.log,.xml,.yaml,.yml"></label>' +
          '<label class="agx-f">Or paste text<textarea id="agx-paste"></textarea></label>' +
        '</div>' +
        '<p class="agx-note">Every character is billed: letters (English and Bengali), digits, symbols, spaces, tabs and line breaks. Nothing is trimmed. Up to ' + CAT.ragLimits.maxDocuments + ' documents, ' + (CAT.ragLimits.maxFileBytes / 1048576) + ' MB each. Supported: ' + esc(CAT.ragLimits.extensions.join(', ')) + '. PDF and Word files are not supported yet; paste their text instead. The server recounts every character before billing.</p>' +
        '<div id="agx-docs"></div>' +
        '<div class="agx-err" id="agx-doc-err" role="alert"></div>' +

        '<div class="agx-step">Your details</div>' +
        '<div class="agx-grid">' +
          '<label class="agx-f">Full name *<input id="agx-c-name" maxlength="120" autocomplete="name"></label>' +
          '<label class="agx-f">Email *<input id="agx-c-email" type="email" maxlength="254" autocomplete="email"></label>' +
          '<label class="agx-f">Phone<input id="agx-c-phone" maxlength="30" autocomplete="tel"></label>' +
          '<label class="agx-f">Company<input id="agx-c-co" maxlength="120" autocomplete="organization"></label>' +
        '</div>' +

        '<div class="agx-sum" id="agx-sum"></div>' +
        '<div class="agx-actions">' +
          '<button class="vb" type="button" id="agx-pay">Proceed to Payment</button>' +
          '<span class="agx-err" id="agx-err" role="alert"></span>' +
        '</div>' +
        '<div id="agx-done"></div>' +

        '<div class="agx-track">' +
          '<div class="agx-step">Track an order</div>' +
          '<div class="agx-grid">' +
            '<label class="agx-f">Order reference<input id="agx-t-ref" placeholder="AGT-2026-XXXXXXXX"></label>' +
            '<label class="agx-f">Email used for the order<input id="agx-t-email" type="email"></label>' +
          '</div>' +
          '<div class="agx-actions">' +
            '<button class="vb" type="button" id="agx-track">View order</button>' +
            '<span class="agx-err" id="agx-t-err" role="alert"></span>' +
          '</div>' +
          '<div id="agx-t-out"></div>' +
        '</div></div>';

      sync();
    }

    function sync() {
      var c = cfg();
      if (!c.voiceAllowed) {
        S.voice = false;
      }

      var vox = root.querySelector('#agx-voice');
      vox.checked = S.voice;
      vox.disabled = !c.voiceAllowed;

      var lv = root.querySelector('#agx-l-voice');
      lv.classList.toggle('agx-off', !c.voiceAllowed);
      lv.classList.toggle('on', S.voice);
      lv.hidden = !c.voiceAllowed; // Chat-Only: voice is neither shown nor chargeable

      root.querySelector('#agx-voice-note').textContent = CAT.telephony.configured ? '' : CAT.telephony.notice;
      root.querySelector('#agx-brand').hidden = !c.brandingAllowed;

      root.querySelectorAll('#agx-cfgs label').forEach(function (l) {
        var i = l.querySelector('input');
        l.classList.toggle('on', i.value === S.cfg);
        i.checked = i.value === S.cfg;
      });

      root.querySelector('#agx-l-backup').classList.toggle('on', S.backup);
      root.querySelector('#agx-l-mon').classList.toggle('on', S.maintenance);
      root.querySelector('#agx-l-nomon').classList.toggle('on', !S.maintenance);

      summary();
    }

    function row(l, v, cls) {
      return '<div class="agx-row' + (cls ? ' ' + cls : '') + '"><span>' + esc(l) + '</span><b>' + v + '</b></div>';
    }

    function summary() {
      var q = preview();
      var r = CAT.rates;
      var h = '<h3>Pricing summary</h3>';

      h += row('Selected agent type', esc(q.c.name));
      h += row('Voice calling', q.voice ? 'Enabled' : (q.c.voiceAllowed ? 'Not selected' : 'Not available'));
      h += row('Maintenance', S.maintenance ? 'Enabled' : 'Not required');

      h += '<h4>One-time charges</h4>' + (q.oneTime.length
        ? q.oneTime.map(function (l) { return row(l.label, tk(l.amount)); }).join('')
        : row('Development cost', tk(0)));

      h += '<h4>Recurring charges (monthly)</h4>' + q.recurring.map(function (l) {
        return row(l.label, tk(l.amount) + ' / month');
      }).join('');

      if (q.backupNote !== null) {
        h += row('Backup (interval to be confirmed)', tk(q.backupNote)) +
          '<p class="agx-note">The backup billing interval has not been confirmed yet, so backup is not included in the payment estimates below.</p>';
      }

      h += '<h4>Usage-based charges</h4>' +
        row('RAG characters', q.chars.toLocaleString('en-US')) +
        row('Estimated RAG cost', tk(q.rag));

      if (q.voice) {
        h += row('Voice calling rate', tk(r.callPerMinute) + ' / minute (billed after use)');
      }

      h += '<h4>Payment estimates</h4>' +
        row('Initial payment', tk(q.initial), 'tot') +
        row('Recurring payment', tk(q.rc) + ' / month', 'tot');

      h += '<p class="agx-note">Initial payment = one-time charges + first month of recurring charges + RAG processing. Voice minutes are never charged in advance. The final amounts are confirmed by the server before you pay.</p>';

      root.querySelector('#agx-sum').innerHTML = h;
    }

    function renderDocs() {
      var el = root.querySelector('#agx-docs');
      if (!S.docs.length) {
        el.innerHTML = '';
        return;
      }

      var rate = CAT.rates.ragPerCharacter;
      el.innerHTML = '<div class="agx-docs"><div class="h"><span>Document</span><span>Characters</span><span>Status</span><span>Est. cost</span></div>' +
        S.docs.map(function (d, i) {
          return '<div><span>' + esc(d.name) + ' <a href="#" data-agx-rm="' + i + '" aria-label="Remove ' + esc(d.name) + '">remove</a></span><span>' + d.chars.toLocaleString('en-US') + '</span><span>Ready</span><span>' + tk(d.chars * rate) + '</span></div>';
        }).join('') +
        '</div>' +
        (S.skipped ? '<p class="agx-note">' + S.skipped + ' duplicate document(s) skipped so the same content is not billed twice.</p>' : '');
    }

    function addDoc(name, text) {
      var err = root.querySelector('#agx-doc-err');
      if (text.indexOf('\u0000') > -1) {
        err.textContent = '"' + name + '" looks like a binary file. Only readable text is accepted.';
        return;
      }
      if (S.docs.some(function (d) { return d.text === text; })) {
        S.skipped++;
        return;
      }
      if (S.docs.length >= CAT.ragLimits.maxDocuments) {
        err.textContent = 'At most ' + CAT.ragLimits.maxDocuments + ' documents per order.';
        return;
      }
      S.docs.push({ name: name, text: text, chars: countChars(text) });
    }

    function readFiles(files) {
      var err = root.querySelector('#agx-doc-err');
      err.textContent = '';

      var jobs = Array.prototype.map.call(files, function (f) {
        var ext = (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (CAT.ragLimits.extensions.indexOf(ext) < 0) {
          err.textContent = '"' + f.name + '": unsupported file type.';
          return Promise.resolve();
        }
        if (f.size > CAT.ragLimits.maxFileBytes) {
          err.textContent = '"' + f.name + '" is larger than ' + (CAT.ragLimits.maxFileBytes / 1048576) + ' MB.';
          return Promise.resolve();
        }
        return f.arrayBuffer().then(function (buf) {
          try {
            addDoc(f.name, new TextDecoder('utf-8', { fatal: true }).decode(buf));
          } catch (e) {
            err.textContent = '"' + f.name + '" is not valid UTF-8 text.';
          }
        });
      });

      return Promise.all(jobs).then(function () {
        renderDocs();
        summary();
      });
    }

    function readLogo(file) {
      return new Promise(function (resolve) {
        if (!file) return resolve(null);
        var rd = new FileReader();
        rd.onload = function () {
          resolve({
            mime: file.type,
            dataBase64: String(rd.result).split(',')[1] || ''
          });
        };
        rd.onerror = function () {
          resolve(null);
        };
        rd.readAsDataURL(file);
      });
    }

    function val(id) {
      return (root.querySelector(id) || {}).value || '';
    }

    function pasted() {
      // The pasted text is a document of its own; it is replaced (not duplicated) on every edit
      S.docs = S.docs.filter(function (d) {
        return d.name !== 'pasted-text.txt';
      });
      var t = val('#agx-paste');
      if (t) {
        S.docs.push({ name: 'pasted-text.txt', text: t, chars: countChars(t) });
      }
    }

    function submit() {
      var err = root.querySelector('#agx-err');
      err.textContent = '';
      if (S.busy) return;

      var name = val('#agx-c-name').trim(),
        email = val('#agx-c-email').trim();

      if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
        err.textContent = 'Enter your name and a valid email address.';
        return;
      }
      if (cfg().brandingAllowed && !val('#agx-b-name').trim()) {
        err.textContent = 'Brand / company name is required for the Customized agent.';
        return;
      }

      var btn = root.querySelector('#agx-pay');
      S.busy = true;
      btn.disabled = true;
      btn.textContent = 'Preparing your invoice…';

      if (!S.key) S.key = newKey();

      var logoFile = (root.querySelector('#agx-b-logo') || {}).files;
      readLogo(cfg().brandingAllowed && logoFile && logoFile[0]).then(function (logo) {
        var pre = preview();
        var body = {
          idempotencyKey: S.key,
          configCode: S.cfg,
          backup: S.backup,
          maintenance: S.maintenance,
          voice: pre.voice,
          expectedInitialTotal: pre.initial,
          customer: {
            name: name,
            email: email,
            phone: val('#agx-c-phone'),
            company: val('#agx-c-co')
          },
          documents: S.docs
            .filter(function (d) { return d.name !== 'pasted-text.txt'; })
            .map(function (d) { return { name: d.name, text: d.text }; }),
          ragText: val('#agx-paste')
        };

        if (cfg().brandingAllowed) {
          body.branding = {
            brandName: val('#agx-b-name'),
            businessIdentity: val('#agx-b-ident'),
            agentPersonality: val('#agx-b-pers'),
            businessInformation: val('#agx-b-info'),
            customResponses: val('#agx-b-resp'),
            workflows: val('#agx-b-flow')
          };
          if (logo) body.logo = logo;
        }

        return fetch('/api/public/agentic/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (res) {
          return res.json().then(function (j) {
            return { ok: res.ok, status: res.status, j: j };
          });
        });
      }).then(function (o) {
        if (!o.ok) {
          if (o.j && o.j.code === 'price_changed') {
            err.textContent = o.j.message + ' New initial payment: ' + tk(o.j.quote.totals.initialPayment) + '.';
            refreshCatalog();
          } else {
            err.textContent = (o.j && o.j.message) || 'Could not place the order.';
          }
          return;
        }
        done(o.j, email);
      }).catch(function () {
        err.textContent = 'The ordering service is unreachable. Please try again.';
      }).then(function () {
        S.busy = false;
        btn.disabled = false;
        btn.textContent = 'Proceed to Payment';
      });
    }

    function done(j, email) {
      S.key = null;
      var inv = j.invoice || {};
      var h = '<div class="agx-done">' +
        '<b>Order ' + esc(j.orderRef) + ' created.</b><br>' +
        'Invoice ' + esc(inv.id) + ' for ' + tk(inv.amount) + ' (awaiting payment). Your service is activated only after the payment is confirmed.';

      var safe = /^https?:\/\//i.test(j.checkoutUrl || '');
      if (safe) {
        h += '<br><a href="' + esc(j.checkoutUrl) + '" rel="noopener">Continue to payment</a>';
      } else {
        h += '<br><span class="agx-note">The billing system is running in sandbox mode, so there is no payment page yet. Keep your order reference and email to track this order.</span>';
      }
      h += '</div>';

      root.querySelector('#agx-done').innerHTML = h;
      root.querySelector('#agx-t-ref').value = j.orderRef;
      root.querySelector('#agx-t-email').value = email;

      if (safe) {
        window.location.href = j.checkoutUrl;
      }
    }

    function track() {
      var err = root.querySelector('#agx-t-err'),
        out = root.querySelector('#agx-t-out');
      err.textContent = '';
      out.innerHTML = '';

      var ref = val('#agx-t-ref').trim(),
        email = val('#agx-t-email').trim();

      if (!ref || !email) {
        err.textContent = 'Enter the order reference and email.';
        return;
      }

      fetch('/api/public/agentic/orders/lookup?ref=' + encodeURIComponent(ref) + '&email=' + encodeURIComponent(email))
        .then(function (res) {
          return res.json().then(function (j) {
            return { ok: res.ok, j: j };
          });
        })
        .then(function (o) {
          if (!o.ok) {
            err.textContent = o.j.message || 'Lookup failed.';
            return;
          }

          var d = o.j;
          var h = '<div class="agx-sum">' +
            '<h3>' + esc(d.orderRef) + ' · ' + esc(d.status.replace(/_/g, ' ')) + '</h3>';

          h += row('Configuration', esc(d.configuration.name));
          h += row('Service activation', d.activatedAt ? esc(d.activatedAt) : 'Not activated yet');
          h += row('Voice calling', d.calling.enabled ? 'Enabled (' + tk(d.calling.ratePerMinute) + ' / min)' : 'Not included');
          h += row('Maintenance', d.maintenance === 'ENABLED' ? 'Enabled' : 'Not required');
          h += row('Server', tk(d.server.monthly) + ' / month');
          h += row('Backup', d.backup.amount === null
            ? 'Not selected'
            : tk(d.backup.amount) + (d.backup.interval ? ' (' + d.backup.interval.replace('_', ' ') + ')' : ' (interval to be confirmed)'));

          h += '<h4>RAG usage</h4>';
          h += row('Characters processed', d.rag.characters.toLocaleString('en-US'));
          h += row('RAG cost', tk(d.rag.cost));
          d.rag.documents.forEach(function (x) {
            h += row(x.name, x.characters.toLocaleString('en-US') + ' chars · ' + tk(x.cost));
          });

          if (d.calling.enabled) {
            h += '<h4>Calling usage</h4>';
            h += row('Calls', d.calling.usage.calls);
            h += row('Billed minutes', d.calling.usage.billedMinutes);
            h += row('Usage amount', tk(d.calling.usage.amount));
          }

          h += '<h4>Invoices</h4>';
          h += (d.invoices.length
            ? d.invoices.map(function (i) {
                return row('#' + i.id + ' · ' + i.kind.toLowerCase(), tk(i.amount) + ' · ' + esc(i.status));
              }).join('')
            : row('No invoices', ''));

          h += '<h4>Payment history</h4>';
          h += (d.payments.length
            ? d.payments.map(function (p) {
                return row(esc(p.reference), esc(p.status) + ' · ' + esc(p.createdAt));
              }).join('')
            : row('No payments yet', ''));

          h += '<h4>Renewal</h4>';
          h += (d.renewal.length
            ? d.renewal.map(function (s) {
                return row(s.kind.toLowerCase() + ' due ' + esc(s.nextDueDate), tk(s.amount));
              }).join('')
            : row('Starts after activation', ''));

          out.innerHTML = h + '</div>';
        })
        .catch(function () {
          err.textContent = 'The ordering service is unreachable.';
        });
    }

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'agx-cfg') {
        S.cfg = t.value;
        sync();
      } else if (t.id === 'agx-voice') {
        S.voice = t.checked;
        sync();
      } else if (t.id === 'agx-backup') {
        S.backup = t.checked;
        sync();
      } else if (t.name === 'agx-mnt') {
        S.maintenance = t.value === '1';
        sync();
      } else if (t.id === 'agx-files') {
        readFiles(t.files).then(function () {
          t.value = '';
        });
      }
    });

    root.addEventListener('input', function (e) {
      if (e.target.id === 'agx-paste') {
        pasted();
        renderDocs();
        summary();
      }
    });

    root.addEventListener('click', function (e) {
      var rm = e.target.closest && e.target.closest('[data-agx-rm]');
      if (rm) {
        e.preventDefault();
        var d = S.docs.splice(+rm.getAttribute('data-agx-rm'), 1)[0];
        if (d && d.name === 'pasted-text.txt') {
          root.querySelector('#agx-paste').value = '';
        }
        renderDocs();
        summary();
        return;
      }
      if (e.target.closest('#agx-pay')) submit();
      if (e.target.closest('#agx-track')) track();
    });

    function refreshCatalog() {
      return fetch('/api/public/agentic/catalog')
        .then(function (r) {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then(function (c) {
          CAT = c;
        });
    }

    refreshCatalog()
      .then(build)
      .catch(function () {
        root.innerHTML =
          '<div class="dm"><section class="dsec" style="--i:0;text-align:center;margin-bottom:34px">' +
          '<div class="dlab">Agentic AI &amp; Automation</div><h2 class="dh">Build and deploy your AI agent</h2>' +
          '<p class="dp">The ordering service is not reachable from this page (it needs the Unified Cloud server). Please contact sales to order an Agentic AI agent.</p>' +
          '</section></div>';
      });
  })();
} catch (err) {
  console.error('[Agentic AI]', err);
}
