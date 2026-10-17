/**
 * Comodo / Sectigo & Namecheap SSL certificate window (#ccw) on the SSL page:
 * - Selectable duration years (1 to 5 years)
 * - Sorting (Recommended, Price low/high, Warranty)
 * - Filtering by Validation Level (DV, OV, EV) and Coverage (Single, Wildcard, Multi-Domain)
 * - Real-time keyword search
 * - Namecheap package price + 30% markup, auto-converted to BDT with live FX rate
 * - Integration with UnifiedCart drawer
 */
try {
  (function () {
    var P = document.getElementById('pg-ssl');
    var C = window.COMODO_PRICES;
    if (!P || !C) return;

    var cfg = window.UNIFIED_CONFIG || {};

    var S = {
      years: 1,
      validation: 'ALL',
      type: 'ALL',
      sort: 'recommended',
      search: '',
      rate: C.fallbackRate || 123.00,
      live: false,
      time: null
    };

    function esc(t) {
      return String(t || '').replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function fmtBDT(n) {
      return 'BDT ' + Math.round(n).toLocaleString('en-US') + ' Tk';
    }

    function fmtUSD(n) {
      return '$' + Number(n).toFixed(2);
    }

    /* Container element for the Comodo catalogue */
    var w = document.createElement('section');
    w.className = 'dsec ccw';
    w.id = 'ccw';
    w.style.setProperty('--i', 1);

    var dcw = P.querySelector('#dcw');
    if (dcw) {
      dcw.insertAdjacentElement('afterend', w);
    } else {
      var pre = P.querySelector('.dsec');
      if (pre) pre.insertAdjacentElement('afterend', w);
      else (P.querySelector('.vw') || P).appendChild(w);
    }

    function calculatePrices(plan, years) {
      var baseUsdPerYear = plan.prices[years] !== undefined ? plan.prices[years] : plan.prices[1];
      var markedUpUsdPerYear = baseUsdPerYear * (1 + C.markup); // +30% markup
      var totalUsd = markedUpUsdPerYear * years;
      var bdtPerYear = Math.round(markedUpUsdPerYear * S.rate);
      var totalBdt = Math.round(totalUsd * S.rate);

      // Multi-year savings comparison against 1-year rate
      var base1YearUsd = plan.prices[1];
      var savingsPct = 0;
      if (years > 1 && base1YearUsd > baseUsdPerYear) {
        savingsPct = Math.round((1 - (baseUsdPerYear / base1YearUsd)) * 100);
      }

      return {
        baseUsdPerYear: baseUsdPerYear,
        markedUpUsdPerYear: markedUpUsdPerYear,
        totalUsd: totalUsd,
        bdtPerYear: bdtPerYear,
        totalBdt: totalBdt,
        savingsPct: savingsPct
      };
    }

    function filterAndSortPlans() {
      var list = C.plans.slice();

      // Filter by validation
      if (S.validation !== 'ALL') {
        list = list.filter(function (p) {
          return p.validation === S.validation;
        });
      }

      // Filter by type
      if (S.type !== 'ALL') {
        list = list.filter(function (p) {
          return p.type === S.type;
        });
      }

      // Filter by search query
      if (S.search.trim()) {
        var q = S.search.trim().toLowerCase();
        list = list.filter(function (p) {
          return p.name.toLowerCase().indexOf(q) !== -1 ||
                 p.description.toLowerCase().indexOf(q) !== -1 ||
                 p.validationName.toLowerCase().indexOf(q) !== -1 ||
                 p.typeName.toLowerCase().indexOf(q) !== -1;
        });
      }

      // Sorting
      list.sort(function (a, b) {
        var pa = calculatePrices(a, S.years);
        var pb = calculatePrices(b, S.years);

        if (S.sort === 'price-asc') {
          return pa.totalBdt - pb.totalBdt;
        }
        if (S.sort === 'price-desc') {
          return pb.totalBdt - pa.totalBdt;
        }
        if (S.sort === 'warranty-desc') {
          return b.warranty - a.warranty;
        }
        // Recommended default
        if (a.recommended && !b.recommended) return -1;
        if (!a.recommended && b.recommended) return 1;
        return 0;
      });

      return list;
    }

    function card(plan) {
      var pr = calculatePrices(plan, S.years);
      var valClass = plan.validation.toLowerCase();
      var includesHtml = plan.includes.map(function (it) {
        return '<li>' + esc(it) + '</li>';
      }).join('');

      var discountBadge = pr.savingsPct > 0 ?
        '<span class="ccx-discount-pill">Save ' + pr.savingsPct + '% with ' + S.years + '-year plan</span>' : '';

      return '<article class="ccx-card' + (plan.recommended ? ' rec' : '') + '">' +
        (plan.badge ? '<span class="ccx-badge">' + esc(plan.badge) + '</span>' : '') +
        '<div class="ccx-pill-tags">' +
          '<span class="ccx-tag ' + valClass + '">' + esc(plan.validationName) + '</span>' +
          '<span class="ccx-tag">' + esc(plan.typeName) + '</span>' +
        '</div>' +
        '<h3>' + esc(plan.name) + '</h3>' +
        '<p class="ccx-desc">' + esc(plan.description) + '</p>' +
        '<div class="ccx-specs-box">' +
          '<div class="ccx-spec-item"><span>Warranty</span><b>$' + plan.warranty.toLocaleString('en-US') + '</b></div>' +
          '<div class="ccx-spec-item"><span>Issuance</span><b>' + esc(plan.issuanceTime) + '</b></div>' +
          '<div class="ccx-spec-item"><span>Coverage</span><b>' + esc(plan.domains) + '</b></div>' +
          '<div class="ccx-spec-item"><span>Site Seal</span><b>' + esc(plan.seal) + '</b></div>' +
        '</div>' +
        '<div class="ccx-price-section">' +
          '<div class="ccx-price-line"><b>' + fmtBDT(pr.bdtPerYear) + '</b><span>/ year (' + fmtUSD(pr.markedUpUsdPerYear) + ')</span></div>' +
          '<p class="ccx-package-total">' + S.years + '-Year Plan Total: <b>' + fmtBDT(pr.totalBdt) + '</b> <small>(' + fmtUSD(pr.totalUsd) + ' USD)</small></p>' +
          discountBadge +
          '<button class="ccx-order" type="button" data-id="' + esc(plan.id) + '">Order Now <span aria-hidden="true">&rarr;</span></button>' +
        '</div>' +
        '<ul class="ccx-features">' + includesHtml + '</ul>' +
        '<a class="ccx-learn" href="' + esc(plan.url) + '" target="_blank" rel="noopener">Learn more on Namecheap &rarr;</a>' +
      '</article>';
    }

    function render() {
      var filteredPlans = filterAndSortPlans();
      var d = new Date(S.live && S.time ? S.time : C.updated + 'T00:00:00');
      var when = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

      var yearsButtons = [1, 2, 3, 4, 5].map(function (y) {
        return '<button class="ccx-year-tab' + (S.years === y ? ' on' : '') + '" type="button" data-year="' + y + '">' +
          y + ' ' + (y === 1 ? 'Year' : 'Years') + '</button>';
      }).join('');

      var validationButtons = [
        { id: 'ALL', label: 'All Validations' },
        { id: 'DV', label: 'Domain Validation (DV)' },
        { id: 'OV', label: 'Organization (OV)' },
        { id: 'EV', label: 'Extended (EV)' }
      ].map(function (b) {
        return '<button class="ccx-filter-btn' + (S.validation === b.id ? ' on' : '') + '" type="button" data-val="' + b.id + '">' + b.label + '</button>';
      }).join('');

      var typeButtons = [
        { id: 'ALL', label: 'All Types' },
        { id: 'single', label: 'Single Domain' },
        { id: 'wildcard', label: 'Wildcard (*.domain)' },
        { id: 'multidomain', label: 'Multi-Domain (SAN)' }
      ].map(function (b) {
        return '<button class="ccx-filter-btn' + (S.type === b.id ? ' on' : '') + '" type="button" data-type="' + b.id + '">' + b.label + '</button>';
      }).join('');

      var cardsHtml = filteredPlans.length ?
        filteredPlans.map(function (p) { return card(p); }).join('') :
        '<div class="ccx-empty">No SSL certificates match your filter criteria. Try clearing search or filters.</div>';

      w.innerHTML =
        '<div class="ccx-head">' +
          '<div class="ccx-header-row">' +
            '<div>' +
              '<h2 class="ccx-title">Comodo &amp; Sectigo SSL Certificates</h2>' +
              '<p class="ccx-subtitle">Enterprise-grade encryption powered by Namecheap &amp; Comodo / Sectigo CA with 24/7 technical deployment.</p>' +
            '</div>' +
          '</div>' +

          '<div class="ccx-years-wrapper">' +
            '<span class="ccx-years-label">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
              'Select Subscription Term:' +
            '</span>' +
            '<div class="ccx-years-tabs">' + yearsButtons + '</div>' +
            '<span class="ccx-years-badge">Multi-year discounts up to 45% applied</span>' +
          '</div>' +

          '<div class="ccx-toolbar">' +
            '<div class="ccx-filter-group">' + validationButtons + '</div>' +
            '<div class="ccx-filter-group">' + typeButtons + '</div>' +
            '<div class="ccx-tools-right">' +
              '<div class="ccx-search">' +
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>' +
                '<input id="ccx-q" type="text" placeholder="Search certificates..." value="' + esc(S.search) + '" autocomplete="off">' +
              '</div>' +
              '<select class="ccx-sort" id="ccx-sort" aria-label="Sort certificates">' +
                '<option value="recommended"' + (S.sort === 'recommended' ? ' selected' : '') + '>Recommended</option>' +
                '<option value="price-asc"' + (S.sort === 'price-asc' ? ' selected' : '') + '>Price: Low to High</option>' +
                '<option value="price-desc"' + (S.sort === 'price-desc' ? ' selected' : '') + '>Price: High to Low</option>' +
                '<option value="warranty-desc"' + (S.sort === 'warranty-desc' ? ' selected' : '') + '>Highest Warranty</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="ccx-grid">' + cardsHtml + '</div>' +

        '<div class="ccx-note">' +
          '<strong>Pricing Transparency:</strong> Package prices reflect official Namecheap list rates + 30% Unified IT technical management &amp; setup fee. ' +
          'Calculated in BDT at 1 USD = ' + S.rate.toFixed(2) + ' BDT (' + (S.live ? 'live bank rate, ' : 'reference rate, ') + when + '). ' +
          'Includes 24/7 dedicated SSL installation, certificate reissues, and renewal monitoring.' +
        '</div>';
    }

    /* Event delegation for interactive elements */
    w.addEventListener('click', function (e) {
      var t = e.target;
      var yBtn = t.closest('.ccx-year-tab');
      if (yBtn) {
        S.years = parseInt(yBtn.getAttribute('data-year'), 10) || 1;
        render();
        return;
      }

      var valBtn = t.closest('.ccx-filter-btn[data-val]');
      if (valBtn) {
        S.validation = valBtn.getAttribute('data-val');
        render();
        return;
      }

      var typeBtn = t.closest('.ccx-filter-btn[data-type]');
      if (typeBtn) {
        S.type = typeBtn.getAttribute('data-type');
        render();
        return;
      }

      var orderBtn = t.closest('.ccx-order');
      if (orderBtn) {
        var planId = orderBtn.getAttribute('data-id');
        var plan = C.plans.filter(function (p) { return p.id === planId; })[0];
        if (plan && window.UnifiedCart) {
          var pr = calculatePrices(plan, S.years);
          window.UnifiedCart.add({
            n: 'Comodo ' + plan.name + ' (' + S.years + ' ' + (S.years === 1 ? 'Year' : 'Years') + ')',
            d: plan.typeName + ' · ' + plan.validationName + ' · ' + plan.domains + ' · $' + plan.warranty.toLocaleString('en-US') + ' Warranty',
            p: pr.totalBdt,
            q: 1
          });
        }
      }
    });

    w.addEventListener('input', function (e) {
      if (e.target.id === 'ccx-q') {
        S.search = e.target.value;
        var grid = w.querySelector('.ccx-grid');
        if (grid) {
          var filtered = filterAndSortPlans();
          grid.innerHTML = filtered.length ?
            filtered.map(function (p) { return card(p); }).join('') :
            '<div class="ccx-empty">No SSL certificates match your search query.</div>';
        }
      }
    });

    w.addEventListener('change', function (e) {
      if (e.target.id === 'ccx-sort') {
        S.sort = e.target.value;
        render();
      }
    });

    /* Brand synchronization: DigiCert vs Comodo */
    function syncBrand() {
      var onBtn = P.querySelector('.btog button.on');
      var brand = onBtn ? onBtn.getAttribute('data-b') : 'DigiCert';
      var isComodo = brand === 'Comodo';
      var isDigiCert = brand === 'DigiCert' || !isComodo;

      P.classList.toggle('cm-on', isComodo);
      P.classList.toggle('dc-on', isDigiCert);
    }

    P.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.btog button')) {
        setTimeout(syncBrand, 10);
      }
    });

    syncBrand();
    render();

    /* Live USD to BDT rate synchronization */
    (function () {
      var KEY = 'uc_usd_bdt', ttl = 6 * 3600 * 1000;
      try {
        var c = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (c && c.r > 50 && Date.now() - c.t < ttl) {
          S.rate = c.r;
          S.time = c.t;
          S.live = true;
          render();
          return;
        }
      } catch (err) {}

      if (!cfg.fxApi || !window.fetch) return;
      var ctl = window.AbortController ? new AbortController() : null;
      var to = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);

      fetch(cfg.fxApi, ctl ? { signal: ctl.signal } : {})
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var r = j && j.rates && j.rates.BDT;
          if (r > 50 && r < 500) {
            S.rate = r;
            S.time = Date.now();
            S.live = true;
            try { localStorage.setItem(KEY, JSON.stringify({ r: r, t: S.time })); } catch (err) {}
            render();
          }
        })
        .catch(function () {})
        .then(function () { clearTimeout(to); });
    })();
  })();
} catch (err) {
  console.error('[Comodo catalog]', err);
}
