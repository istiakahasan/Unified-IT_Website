/**
 * Unified Cloud - Universal Shopping Cart & Taka System
 * Stores every purchase / selected option across all service options (Domains, Hosting, VPS, Dedicated,
 * Email, M365, SSL, Cyber Security), displays running total sum in Taka (BDT / ৳), and powers the
 * header cart flyout dropdown and full cart drawer.
 */
(function() {
  'use strict';

  var STORAGE_KEY = 'unified_cloud_cart_v1';
  var cart = [];

  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) cart = JSON.parse(raw);
    if (!Array.isArray(cart)) cart = [];
  } catch (e) {
    cart = [];
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {}
  }

  function esc(t) {
    return String(t || '').replace(/[&<>"]/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function formatMoney(num) {
    if (!num || isNaN(num)) return '৳0.00';
    return '৳' + Math.round(num).toLocaleString('en-US');
  }

  function parsePrice(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    var s = String(val).replace(/,/g, '');
    // Check if USD ($)
    if (s.indexOf('$') > -1) {
      var m = s.match(/[\d.]+/);
      return m ? Math.round(parseFloat(m[0]) * 120) : 0;
    }
    // Check if BDT or Tk
    var m2 = s.match(/[\d.]+/);
    return m2 ? parseFloat(m2[0]) : 0;
  }

  // Ensure DOM container for Full Cart Drawer #cart exists
  var drawerEl = document.getElementById('cart');
  if (!drawerEl) {
    drawerEl = document.createElement('div');
    drawerEl.id = 'cart';
    drawerEl.innerHTML =
      '<div class="cbk"></div>' +
      '<aside class="cpn" role="dialog" aria-label="Shopping Cart">' +
        '<div class="ch">' +
          '<h2>Your Cart (৳ BDT)</h2>' +
          '<button class="cx" type="button" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="cl"></div>' +
        '<div class="ctot">' +
          '<div><b>Total Sum</b><span id="drawer-total-val">৳0.00</span></div>' +
          '<i>Prices in Bangladeshi Taka (BDT). All packages include 24/7 Dhaka support.</i>' +
        '</div>' +
        '<div class="cf">' +
          '<div class="cc"></div>' +
          '<div class="cb">' +
            '<button class="ck" type="button">Keep Shopping</button>' +
            '<a class="cg" id="drawer-checkout-btn" href="mailto:info@unifiedit.xyz">Proceed to Checkout</a>' +
          '</div>' +
        '</div>' +
      '</aside>';
    document.body.appendChild(drawerEl);
  }

  // Ensure Floating Toast exists
  var toastEl = document.getElementById('cart-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'cart-toast';
    toastEl.className = 'cart-toast';
    toastEl.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' +
      '<div class="cart-toast-body">' +
        '<b id="cart-toast-title">Added to cart</b>' +
        '<span id="cart-toast-sub">Total: ৳0.00</span>' +
      '</div>';
    document.body.appendChild(toastEl);
  }

  var toastTimer = null;
  function showToast(title, sub) {
    var tTitle = toastEl.querySelector('#cart-toast-title');
    var tSub = toastEl.querySelector('#cart-toast-sub');
    if (tTitle) tTitle.textContent = title || 'Added to cart';
    if (tSub) tSub.textContent = sub || ('Total: ' + formatMoney(getTotal()));
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      toastEl.classList.remove('show');
    }, 2800);
  }

  function getTotal() {
    return cart.reduce(function(sum, item) {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);
  }

  function getCount() {
    return cart.reduce(function(sum, item) {
      return sum + (item.quantity || 1);
    }, 0);
  }

  function renderDropdown() {
    var dropdownList = document.getElementById('hcd-items-list');
    var subtotalVal = document.getElementById('hcd-subtotal-val');
    var badge = document.getElementById('hdr-cart-badge');
    var mmBadge = document.getElementById('mm-cart-badge');

    var totalCount = getCount();
    var totalSum = getTotal();

    if (badge) {
      badge.textContent = totalCount;
      badge.style.display = totalCount > 0 ? 'inline-flex' : 'none';
    }
    if (mmBadge) mmBadge.textContent = totalCount;

    if (subtotalVal) {
      subtotalVal.textContent = formatMoney(totalSum);
    }

    if (dropdownList) {
      if (cart.length === 0) {
        dropdownList.innerHTML = '<div class="hcd-empty">Your cart is empty.</div>';
      } else {
        dropdownList.innerHTML = cart.map(function(item, idx) {
          var lineTotal = (item.price || 0) * (item.quantity || 1);
          return (
            '<div class="hcd-item">' +
              '<div class="hcd-item-info">' +
                '<div class="hcd-item-name">' + esc(item.name) + '</div>' +
                '<div class="hcd-item-detail">' + (item.quantity > 1 ? item.quantity + ' &times; ' : '') + esc(item.details || 'Service Option') + '</div>' +
              '</div>' +
              '<div class="hcd-item-right">' +
                '<span class="hcd-item-price">' + (lineTotal ? formatMoney(lineTotal) : 'Quote') + '</span>' +
                '<button class="hcd-item-del" type="button" data-del="' + idx + '" title="Remove item" aria-label="Remove">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
                '</button>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      }
    }
  }

  function renderDrawer() {
    if (!drawerEl) return;
    var list = drawerEl.querySelector('.cl');
    var tot = drawerEl.querySelector('#drawer-total-val') || drawerEl.querySelector('.ctot span');
    var cc = drawerEl.querySelector('.cc');
    var go = drawerEl.querySelector('#drawer-checkout-btn') || drawerEl.querySelector('.cg');

    var totalCount = getCount();
    var totalSum = getTotal();

    if (list) {
      list.innerHTML = cart.length ? cart.map(function(c, i) {
        var lineTotal = (c.price || 0) * (c.quantity || 1);
        return (
          '<div class="ci">' +
            '<div class="cih">' +
              '<b>' + esc(c.name) + '</b>' +
              '<button class="cd" type="button" data-r="' + i + '" aria-label="Remove">' +
                '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>' +
              '</button>' +
            '</div>' +
            (c.details ? '<div class="cid">' + esc(c.details) + '</div>' : '') +
            '<div class="ciq">' +
              '<span>Quantity</span>' +
              '<span class="cqn">' +
                '<button type="button" data-m="' + i + '" aria-label="Fewer">&minus;</button>' +
                '<span>' + (c.quantity || 1) + '</span>' +
                '<button type="button" data-p="' + i + '" aria-label="More">+</button>' +
              '</span>' +
              '<span class="cpr">' + (lineTotal ? formatMoney(lineTotal) : 'Quote on request') + '</span>' +
            '</div>' +
          '</div>'
        );
      }).join('') : '<div class="cempty">Your cart is empty.</div>';
    }

    if (tot) {
      tot.textContent = formatMoney(totalSum);
    }
    if (cc) {
      cc.textContent = totalCount + ' item' + (totalCount === 1 ? '' : 's') + ' in cart · Total: ' + formatMoney(totalSum);
    }

    if (go) {
      var body = 'Hello Unified Cloud Team,\n\nI would like to order the following services:\n\n' +
        cart.map(function(c, i) {
          var lt = (c.price || 0) * (c.quantity || 1);
          return (i + 1) + '. ' + c.name + ' (' + (c.details || 'Standard') + ') x ' + (c.quantity || 1) + ' = ' + (lt ? formatMoney(lt) : 'Quote on request');
        }).join('\n') +
        '\n\nTotal Sum: ' + formatMoney(totalSum) +
        '\n\nName:\nCompany:\nPhone:\n';

      go.href = 'mailto:info@unifiedit.xyz?subject=' + encodeURIComponent('Unified Cloud Order - ' + totalCount + ' item(s) - ' + formatMoney(totalSum)) +
        '&body=' + encodeURIComponent(body);
      go.textContent = 'Proceed to Checkout (' + formatMoney(totalSum) + ')';
    }
  }

  function renderAll() {
    renderDropdown();
    renderDrawer();
  }

  function add(item) {
    if (!item || !item.name) return;
    var name = String(item.name).trim();
    var details = item.details || item.d || '';
    var price = parsePrice(item.price !== undefined ? item.price : item.p);
    var qty = Math.max(1, parseInt(item.quantity || item.q || 1, 10));

    // Check if matching item exists
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].name === name && (cart[i].details || '') === details) {
        existing = cart[i];
        break;
      }
    }

    if (existing) {
      existing.quantity = (existing.quantity || 1) + qty;
    } else {
      cart.push({
        name: name,
        details: details,
        price: price,
        period: item.period || '',
        quantity: qty
      });
    }

    save();
    renderAll();

    // Bump badge
    var badge = document.getElementById('hdr-cart-badge');
    if (badge) {
      badge.classList.remove('bump');
      void badge.offsetWidth;
      badge.classList.add('bump');
    }

    showToast('✓ Added ' + name + ' to cart', 'Total: ' + formatMoney(getTotal()));
  }

  function remove(index) {
    if (index >= 0 && index < cart.length) {
      cart.splice(index, 1);
      save();
      renderAll();
    }
  }

  function updateQty(index, delta) {
    if (index >= 0 && index < cart.length) {
      var q = (cart[index].quantity || 1) + delta;
      if (q <= 0) {
        remove(index);
      } else {
        cart[index].quantity = Math.min(99, q);
        save();
        renderAll();
      }
    }
  }

  function openDropdown() {
    var dd = document.getElementById('hdr-cart-dropdown');
    if (dd) dd.classList.add('open');
  }

  function closeDropdown() {
    var dd = document.getElementById('hdr-cart-dropdown');
    if (dd) dd.classList.remove('open');
  }

  function toggleDropdown() {
    var dd = document.getElementById('hdr-cart-dropdown');
    if (dd) dd.classList.toggle('open');
  }

  function openDrawer() {
    closeDropdown();
    if (drawerEl) {
      renderDrawer();
      drawerEl.classList.add('on');
    }
  }

  function closeDrawer() {
    if (drawerEl) drawerEl.classList.remove('on');
  }

  // Public API
  window.UnifiedCart = {
    add: add,
    remove: remove,
    updateQty: updateQty,
    open: openDrawer,
    close: closeDrawer,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    openDropdown: openDropdown,
    closeDropdown: closeDropdown,
    toggleDropdown: toggleDropdown,
    getTotal: getTotal,
    getCount: getCount,
    getItems: function() { return cart; },
    formatMoney: formatMoney,
    parsePrice: parsePrice
  };

  // Wire UI event listeners
  document.addEventListener('click', function(e) {
    var t = e.target;

    // Header Cart Button Click -> Toggle Flyout Dropdown
    if (t.closest('#hdr-cart-btn')) {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown();
      return;
    }

    // Dropdown Close Button
    if (t.closest('#hcd-close-btn')) {
      e.preventDefault();
      closeDropdown();
      return;
    }

    // View Cart / Checkout in dropdown -> Open Full Drawer
    if (t.closest('#hcd-view-cart-btn')) {
      e.preventDefault();
      openDrawer();
      return;
    }

    // Delete item inside dropdown
    var delBtn = t.closest('[data-del]');
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      var idx = parseInt(delBtn.getAttribute('data-del'), 10);
      remove(idx);
      return;
    }

    // Mobile menu cart link
    if (t.closest('#mm-cart-link')) {
      e.preventDefault();
      document.body.classList.remove('mmo');
      openDrawer();
      return;
    }

    // Click outside dropdown closes it
    var dropdown = document.getElementById('hdr-cart-dropdown');
    if (dropdown && dropdown.classList.contains('open') && !t.closest('#hdr-cart-wrap')) {
      closeDropdown();
    }

    // Full Drawer #cart interactions
    if (drawerEl && drawerEl.classList.contains('on')) {
      if (t.classList.contains('cbk') || t.closest('.cx') || t.closest('.ck')) {
        closeDrawer();
        return;
      }
      var rBtn = t.closest('[data-r]');
      if (rBtn) {
        remove(parseInt(rBtn.getAttribute('data-r'), 10));
        return;
      }
      var mBtn = t.closest('[data-m]');
      if (mBtn) {
        updateQty(parseInt(mBtn.getAttribute('data-m'), 10), -1);
        return;
      }
      var pBtn = t.closest('[data-p]');
      if (pBtn) {
        updateQty(parseInt(pBtn.getAttribute('data-p'), 10), 1);
        return;
      }
    }

    // Intercept Order Now / Purchase buttons across EVERY service option!
    // 1. Web Hosting (.vc.wp .vb) or Reseller Hosting (#partner .vc.wp .vb)
    var wpBtn = t.closest('.vc.wp .vb');
    if (wpBtn) {
      e.preventDefault();
      e.stopPropagation();
      var card = wpBtn.closest('.vc.wp');
      var title = (card.querySelector('h3') || {}).textContent || 'Web Hosting Plan';
      var priceText = (card.querySelector('.vd b') || card.querySelector('.ek b') || {}).textContent || 'BDT 2,400 Tk';
      var specText = (card.querySelector('.ek span') || {}).textContent || 'SSD Hosting';
      add({
        name: title.trim(),
        details: specText.trim(),
        price: priceText,
        quantity: 1
      });
      return;
    }

    // 2. Email Hosting (.vc.ml .vb)
    var mlBtn = t.closest('.vc.ml .vb');
    if (mlBtn) {
      e.preventDefault();
      e.stopPropagation();
      var mlCard = mlBtn.closest('.vc.ml');
      var mlTitle = (mlCard.querySelector('h3') || {}).textContent || 'Email Hosting';
      var mlPriceEl = mlCard.querySelector('.vd b');
      var mlPrice = mlPriceEl ? mlPriceEl.textContent : 'BDT 250 Tk';
      var mlDetail = (mlCard.querySelector('.ek') || {}).textContent || 'Mailbox';
      add({
        name: 'Email Hosting (' + mlTitle.trim() + ')',
        details: mlDetail.trim(),
        price: mlPrice,
        quantity: 1
      });
      return;
    }

    // 3. Microsoft 365 (.mhero .vb)
    var m365Btn = t.closest('.mhero .vb');
    if (m365Btn) {
      e.preventDefault();
      e.stopPropagation();
      add({
        name: 'Microsoft 365 Business Basic',
        details: 'Exchange, Web & Mobile Office, OneDrive 1TB',
        price: 4500,
        period: '/yr',
        quantity: 1
      });
      return;
    }

    // 4. Cloud VPS (#vps .vc .vb)
    var vpsBtn = t.closest('#vps .vc .vb');
    if (vpsBtn) {
      e.preventDefault();
      e.stopPropagation();
      var vCard = vpsBtn.closest('#vps .vc');
      var vTitle = (vCard.querySelector('h3') || {}).textContent || 'Cloud VPS';
      var vPrices = {
        'Starter VPS': 950,
        'Business VPS': 1850,
        'Professional VPS': 3600,
        'Enterprise VPS': 7200
      };
      var vPrice = vPrices[vTitle.trim()] || 1850;
      add({
        name: vTitle.trim(),
        details: 'Instant Provisioning, NVMe SSD, Dhaka Low Latency',
        price: vPrice,
        period: '/mo',
        quantity: 1
      });
      return;
    }

    // 5. Dedicated Server (#vds .vc .vb)
    var vdsBtn = t.closest('#vds .vc .vb');
    if (vdsBtn) {
      e.preventDefault();
      e.stopPropagation();
      var vdCard = vdsBtn.closest('#vds .vc');
      var vdTitle = (vdCard.querySelector('h3') || {}).textContent || 'Dedicated Server';
      var vdPrices = {
        'Essential Server': 18500,
        'Business Server': 28000,
        'Professional Server': 45000,
        'Enterprise Server': 85000
      };
      var vdPrice = vdPrices[vdTitle.trim()] || 28000;
      add({
        name: vdTitle.trim(),
        details: 'Bare Metal Xeon/EPYC, ECC RAM, 1 Gbps Dhaka Port',
        price: vdPrice,
        period: '/mo',
        quantity: 1
      });
      return;
    }

    // 6. Cyber Security (#csec-soc .vc .vb, #csec-firewall .vc .vb)
    var secBtn = t.closest('.csec-group .vc .vb');
    if (secBtn) {
      e.preventDefault();
      e.stopPropagation();
      var secCard = secBtn.closest('.vc');
      var secTitle = (secCard.querySelector('h3') || {}).textContent || 'Cyber Security';
      var secSub = (secCard.querySelector('.ek') || {}).textContent || 'Enterprise Security';
      add({
        name: secTitle.trim(),
        details: secSub.trim(),
        price: 0, // Quote on request
        quantity: 1
      });
      return;
    }

    // 7. Cloud Configurator (#cqt) & Storage (#sqt)
    var cqtBtn = t.closest('#cqt') || t.closest('#sqt');
    if (cqtBtn) {
      e.preventDefault();
      e.stopPropagation();
      var pCloud = document.getElementById('pg-cloud');
      if (pCloud && t.closest('#cqt')) {
        var instName = (pCloud.querySelector('#spt') || {}).textContent || '1 Core-1GB RAM-HDD';
        var osName = (pCloud.querySelector('#spo') || {}).textContent || 'Linux';
        var citVal = (pCloud.querySelector('#cit') || {}).value || 'VPS';
        var qtyVal = parseInt((pCloud.querySelector('#cn') || {}).value, 10) || 1;
        add({
          name: 'Cloud ' + citVal + ' - ' + instName,
          details: osName + ' (Configured Instance)',
          price: 350,
          period: '/mo',
          quantity: qtyVal
        });
        openDrawer();
      }
      return;
    }
  });

  // Close dropdown on Escape key
  addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeDropdown();
      closeDrawer();
    }
  });

  // Initial render when script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }
})();
