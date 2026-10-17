/**
 * DigiCert certificate window (#dcw) on the SSL page: tabs (Single / Multi-Domain, OV / EV), cards with an
 * Order Now button, wildcard and domain-count options, and BDT pricing = DigiCert price x (1 + markup) x USD/BDT rate.
 * Prices and plan text come from data/digicert-prices.js; the live rate from UNIFIED_CONFIG.fxApi (cached for 6 hours,
 * falls back to fallbackRate). Order Now adds the configured certificate to the cart drawer (window.UnifiedCart).
 */
try {
(function () {
  var P = document.getElementById('pg-ssl'), D = window.DIGICERT_PRICES;
  if (!P || !D) return;
  var cfg = window.UNIFIED_CONFIG || {};
  var TABS = [
    { label: 'Single Domain - OV', v: 'OV', multi: false },
    { label: 'Single Domain - EV', v: 'EV', multi: false },
    { label: 'Multi-Domain - OV', v: 'OV', multi: true },
    { label: 'Multi-Domain - EV', v: 'EV', multi: true }
  ];
  var S = { tab: 0, rate: D.fallbackRate, live: false, time: null, opt: {} };

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) { return 'BDT ' + Math.round(n).toLocaleString('en-US') + ' Tk'; }
  function opt(tab, plan) { var k = tab + ':' + plan.id; return S.opt[k] || (S.opt[k] = { wild: false, std: 1, wc: 0 }); }

  /* USD list price (12-month subscription) for one card's current options */
  function usd(plan, tab, o) {
    var a = plan.annual, t = TABS[tab];
    if (!t.multi) return (t.v === 'OV' && o.wild) ? a.WILDCARD_OV : a[t.v];
    return o.std * a[t.v] + (t.v === 'OV' ? o.wc * a.WILDCARD_OV : 0);
  }
  function bdt(u) { return Math.round(u * (1 + D.markup) * S.rate); }

  function detail(tab, o) {
    var t = TABS[tab];
    if (!t.multi) return 'Single domain' + (t.v === 'OV' && o.wild ? ', wildcard' : '');
    var s = o.std + ' standard' + (o.wc ? ' + ' + o.wc + ' wildcard' : '') + ' domain' + (o.std + o.wc === 1 ? '' : 's');
    return 'Multi-domain: ' + s;
  }
  function priceLine(tab, o) {
    var t = TABS[tab];
    if (!t.multi) return '/ month / ' + (t.v === 'OV' && o.wild ? 'wildcard' : 'standard') + ' domain';
    var n = o.std + o.wc;
    return '/ month for ' + n + ' domain' + (n === 1 ? '' : 's');
  }

  function stepper(key, field, label, sub, val) {
    return '<div class="dcx-row"><span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
      '<span class="dcx-num"><button class="dcx-step" type="button" data-k="' + key + '" data-f="' + field + '" data-d="-1" aria-label="Fewer ' + label + '">&minus;</button>' +
      '<b>' + val + '</b>' +
      '<button class="dcx-step" type="button" data-k="' + key + '" data-f="' + field + '" data-d="1" aria-label="More ' + label + '">+</button></span></div>';
  }

  function card(plan, tab, idx) {
    var t = TABS[tab], o = opt(tab, plan), key = tab + ':' + plan.id;
    var year = bdt(usd(plan, tab, o)), month = Math.round(year / 12);
    var inc = plan.includes.map(function (x) { return '<li>' + esc(x.replace('{V}', t.v)) + '</li>'; }).join('');
    var opts = '';
    if (!t.multi && t.v === 'OV') {
      opts = '<div class="dcx-opt"><label class="dcx-chk"><input type="checkbox" class="dcx-wild" data-k="' + key + '"' + (o.wild ? ' checked' : '') + '> Convert this to a wildcard domain</label>' +
        (o.wild ? '<p class="dcx-sub">Secures unlimited subdomains, for example mail.mydomain.com and shop.mydomain.com.</p>' : '') + '</div>';
    } else if (t.multi) {
      opts = '<div class="dcx-opt"><b>Number of domains to protect?</b>' + stepper(key, 'std', 'Standard domains', 'mydomain.com', o.std) +
        (t.v === 'OV' ? stepper(key, 'wc', 'Wildcard domains', '*.mydomain.com', o.wc) : '') + '</div>';
    }
    return '<article class="dcx-card' + (plan.recommended ? ' rec' : '') + '" style="--i:' + (idx || 0) + '">' +
      '<button class="dcx-order" type="button" data-k="' + key + '">Order Now <span aria-hidden="true">&rarr;</span></button>' +
      (plan.recommended ? '<span class="dcx-badge">Recommended</span>' : '') +
      '<h3>' + esc(plan.name) + ' - ' + t.v + '</h3>' +
      '<p class="dcx-desc">' + esc(plan.description) + '</p>' + opts +
      '<div class="dcx-price"><b>' + fmt(month) + '</b><span>' + priceLine(tab, o) + '</span></div>' +
      '<p class="dcx-sum">12 month auto-renewing subscription <b>' + fmt(year) + '</b></p>' +
      '<p class="dcx-fine">Renews automatically every 12 months until you cancel. Prices may change.</p>' +
      '<ul class="dcx-inc">' + inc + '</ul>' +
      '<a class="dcx-more" href="' + esc(plan.url) + '" target="_blank" rel="noopener">Learn more</a></article>';
  }

  var w = document.createElement('section');
  w.className = 'dsec dcw'; w.id = 'dcw'; w.style.setProperty('--i', 1);
  var pre = P.querySelector('.dsec');
  if (pre) pre.insertAdjacentElement('afterend', w); else (P.querySelector('.vw') || P).appendChild(w);

  function noteText() {
    var d = new Date(S.live && S.time ? S.time : D.updated + 'T00:00:00');
    var when = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return 'Prices in BDT at 1 USD = ' + S.rate.toFixed(2) + ' BDT (' + (S.live ? 'live rate, ' : 'reference rate, ') + when + '). Based on DigiCert list prices.';
  }
  function render(animate) {
    w.innerHTML = '<div class="dcx-head"><h2 class="dcx-title">Select Your Cert</h2><div class="dcx-tabs" role="tablist">' +
      TABS.map(function (t, i) { return '<button class="dcx-tab' + (i === S.tab ? ' on' : '') + '" type="button" role="tab" aria-selected="' + (i === S.tab) + '" data-t="' + i + '">' + t.label + '</button>'; }).join('') +
      '</div></div><div class="dcx-grid">' + D.plans.map(function (p, i) { return card(p, S.tab, i); }).join('') + '</div><p class="dcx-note">' + noteText() + '</p>';

    if (animate === false) {
      w.querySelectorAll('.dcx-card').forEach(function(c) {
        c.style.animation = 'none';
        c.style.opacity = '1';
      });
    }
  }

  function find(key) { var a = key.split(':'); return { tab: +a[0], plan: D.plans.filter(function (p) { return p.id === a[1]; })[0] }; }

  w.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : e.target.parentNode, b;
    if ((b = t.closest('.dcx-tab'))) {
      S.tab = +b.getAttribute('data-t');
      render(true);
      return;
    }
    if ((b = t.closest('.dcx-step'))) {
      var k = find(b.getAttribute('data-k')), o = opt(k.tab, k.plan), f = b.getAttribute('data-f'), d = +b.getAttribute('data-d');
      o[f] = Math.max(f === 'std' ? 1 : 0, Math.min(99, o[f] + d));
      render(false);
      return;
    }
    if ((b = t.closest('.dcx-order'))) {
      var c = find(b.getAttribute('data-k')), oo = opt(c.tab, c.plan);
      if (window.UnifiedCart) window.UnifiedCart.add({ n: 'DigiCert ' + c.plan.name + ' - ' + TABS[c.tab].v, d: detail(c.tab, oo), p: bdt(usd(c.plan, c.tab, oo)), q: 1 });
    }
  });
  w.addEventListener('change', function (e) {
    var b = e.target.closest && e.target.closest('.dcx-wild');
    if (!b) return;
    var k = find(b.getAttribute('data-k')); opt(k.tab, k.plan).wild = b.checked;
    render(false);
    var again = w.querySelector('.dcx-wild[data-k="' + b.getAttribute('data-k') + '"]'); if (again) again.focus();
  });

  if (window.syncSSLProvider) {
    var onBtn = P.querySelector('.ssl-tog button.on, .btog button.on');
    var b = onBtn ? onBtn.getAttribute('data-b') : 'DigiCert';
    window.syncSSLProvider(b, false);
  } else {
    P.classList.toggle('dc-on', !P.classList.contains('cm-on'));
  }
  render(true);

  /* Live USD to BDT rate: cached for 6 hours, silently falls back to the reference rate */
  (function () {
    var KEY = 'uc_usd_bdt', ttl = 6 * 3600 * 1000;
    try { var c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.r > 50 && Date.now() - c.t < ttl) { S.rate = c.r; S.time = c.t; S.live = true; render(); return; } } catch (err) {}
    if (!cfg.fxApi || !window.fetch) return;
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    fetch(cfg.fxApi, ctl ? { signal: ctl.signal } : {}).then(function (r) { return r.json(); }).then(function (j) {
      var r = j && j.rates && j.rates.BDT;
      if (r > 50 && r < 500) { S.rate = r; S.time = Date.now(); S.live = true; try { localStorage.setItem(KEY, JSON.stringify({ r: r, t: S.time })); } catch (err) {} render(); }
    }).catch(function () {}).then(function () { clearTimeout(to); });
  })();
})();
} catch (err) { console.error("[DigiCert catalog]", err); }
