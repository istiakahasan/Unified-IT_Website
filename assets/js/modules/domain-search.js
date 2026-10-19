/**
 * Unified Cloud - Namecheap-inspired Interactive Domain Search Module
 * Handles domain query lookups, exact match evaluation, TLD suggestions with icons & prices,
 * category tabs, favorites, and cart additions.
 */
try {
  (function() {
    function initDomainSearch() {
      var P = document.getElementById('pg-domain');
      if (!P) return;

      var searchInput = P.querySelector('#dom-search-input');
      var searchBtn = P.querySelector('#dom-search-btn');
      var clearBtn = P.querySelector('#dom-search-clear');
      var resultsWrap = P.querySelector('#dom-results-card');
      var exactBanner = P.querySelector('#dom-exact-banner');
      var resultsList = P.querySelector('#dom-results-list');
      var toggleSuggested = P.querySelector('#dom-toggle-suggested');
      var tabsBar = P.querySelector('#dom-tabs-bar');
      var quickChips = P.querySelectorAll('.dom-chip');
      var favCountEl = P.querySelector('#dom-fav-count');

      if (!searchInput || !searchBtn || !resultsList) return;

      var currentTab = 'domains';
      var favorites = {};
      var isSuggestedHidden = false;

      // Picture SVGs
      var ICONS = {
        cocktail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8M12 11v11M3 3h18l-9 8-9-8zM17 5l-2 2"/></svg>',
        sprout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-8M12 14c-3.5 0-6-2.5-6-6 4 0 6 2.5 6 6zM12 10c3.5 0 6-2.5 6-6-4 0-6 2.5-6 6z"/></svg>',
        robot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="4"/><circle cx="9" cy="13" r="1.5" fill="currentColor"/><circle cx="15" cy="13" r="1.5" fill="currentColor"/><path d="M10 16.5c1 .5 3 .5 4 0M12 2v4M8 2h8"/></svg>',
        lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>',
        globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
        lightning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4zM19 17l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></svg>',
        cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
        laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 19h20M8 15h8"/></svg>',
        bd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="10.5" cy="12" r="4" fill="currentColor" stroke="none"/></svg>',
        cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.1L21 7H6"/></svg>',
        star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        offer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
      };

      // TLD Database with BDT / Taka pricing matching user request
      var TLD_CATALOG = [
        {
          tld: '.to',
          pic: 'pic-to',
          icon: ICONS.cocktail,
          price: 'BDT 4,790/yr',
          retail: 'BDT 4,790/yr',
          discount: null,
          star: false,
          info: false,
          category: 'domains'
        },
        {
          tld: '.org',
          pic: 'pic-org',
          icon: ICONS.sprout,
          price: 'BDT 1,020/yr',
          retail: 'BDT 1,740/yr',
          discount: '41% OFF',
          star: false,
          info: false,
          category: 'domains'
        },
        {
          tld: '.ai',
          pic: 'pic-ai',
          icon: ICONS.robot,
          price: 'BDT 10,790/yr',
          retail: 'BDT 10,790/yr',
          discount: '14% OFF',
          star: false,
          info: true,
          category: 'premium'
        },
        {
          tld: '.net',
          pic: 'pic-net',
          icon: ICONS.globe,
          price: 'BDT 1,440/yr',
          retail: 'BDT 1,920/yr',
          discount: '25% OFF',
          star: false,
          info: false,
          category: 'domains'
        },
        {
          tld: '.io',
          pic: 'pic-io',
          icon: ICONS.lightning,
          price: 'BDT 4,200/yr',
          retail: 'BDT 5,160/yr',
          discount: '18% OFF',
          star: false,
          info: true,
          category: 'premium'
        },
        {
          tld: '.xyz',
          pic: 'pic-xyz',
          icon: ICONS.sparkle,
          price: 'BDT 360/yr',
          retail: 'BDT 1,560/yr',
          discount: '77% OFF',
          star: false,
          info: false,
          category: 'domains'
        },
        {
          tld: '.online',
          pic: 'pic-online',
          icon: ICONS.cloud,
          price: 'BDT 240/yr',
          retail: 'BDT 3,960/yr',
          discount: '94% OFF',
          star: false,
          info: false,
          category: 'generator'
        },
        {
          tld: '.tech',
          pic: 'pic-tech',
          icon: ICONS.laptop,
          price: 'BDT 600/yr',
          retail: 'BDT 2,640/yr',
          discount: '77% OFF',
          star: false,
          info: false,
          category: 'generator'
        },
        {
          tld: '.com.bd',
          pic: 'pic-bd',
          icon: ICONS.bd,
          price: 'BDT 1,500/yr',
          retail: 'BDT 1,800/yr',
          discount: '16% OFF',
          star: false,
          info: true,
          category: 'domains'
        }
      ];

      function parseQuery(raw) {
        var q = (raw || '').trim().toLowerCase();
        if (!q) q = 'istiak.com';
        // strip http / https / www / trailing slashes
        q = q.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
        var parts = q.split('.');
        var base = parts[0] || 'istiak';
        var ext = parts.length > 1 ? '.' + parts.slice(1).join('.') : '.com';
        return { full: base + ext, base: base, ext: ext };
      }

      function renderExactMatch(parsed) {
        var isTaken = (parsed.base === 'istiak' && parsed.ext === '.com') || parsed.full === 'unified.it' || parsed.full === 'google.com';
        var regYear = 2019;

        var statusBadge = isTaken
          ? '<span class="dom-status-badge registered">REGISTERED IN ' + regYear + '</span>'
          : '<span class="dom-status-badge available">AVAILABLE</span>';

        var ctaHtml = isTaken
          ? '<button class="dom-btn-offer" type="button" data-action="offer" data-domain="' + parsed.full + '">' + ICONS.offer + ' Make offer</button>'
          : '<div class="dom-exact-price-tag"><div class="p-main">BDT 1,320/yr</div><div class="p-sub">Retail BDT 1,740/yr</div></div>' +
            '<button class="dom-cart-btn" type="button" data-domain="' + parsed.full + '" data-price="BDT 1,320/yr">' + ICONS.cart + ' Order Now</button>';

        var isFav = !!favorites[parsed.full];

        exactBanner.innerHTML =
          '<div class="dom-exact-left">' +
            '<div class="dom-exact-name">' + parsed.full + '</div>' +
            statusBadge +
            '<button class="dom-icon-btn" type="button" title="Domain details" aria-label="Details">' + ICONS.info + '</button>' +
            '<button class="dom-icon-btn dom-star-btn ' + (isFav ? 'active' : '') + '" type="button" data-fav="' + parsed.full + '" title="Favorite" aria-label="Favorite">' + ICONS.star + '</button>' +
          '</div>' +
          '<div class="dom-exact-right">' +
            ctaHtml +
          '</div>';
      }

      function renderSuggested(parsed) {
        var filtered = TLD_CATALOG.filter(function(item) {
          if (currentTab === 'favorites') {
            var itemDomain = item.type === 'addon' ? item.name : parsed.base + item.tld;
            return !!favorites[itemDomain];
          }
          if (currentTab === 'auctions') {
            return item.tld === '.ai' || item.tld === '.to' || item.tld === '.io';
          }
          if (currentTab === 'premium') {
            return item.category === 'premium' || item.tld === '.ai' || item.tld === '.io';
          }
          if (currentTab === 'generator') {
            return item.tld === '.online' || item.tld === '.tech' || item.tld === '.xyz';
          }
          if (currentTab === 'beast') {
            return true; // shows all in beast mode
          }
          return true; // default 'domains' tab
        });

        if (filtered.length === 0) {
          resultsList.innerHTML =
            '<div class="dom-empty-state">' +
              ICONS.star +
              '<h4>No items found in this tab</h4>' +
              '<p>Try selecting another tab or starring domains to view favorites.</p>' +
            '</div>';
          return;
        }

        resultsList.innerHTML = filtered.map(function(item) {
          var domainName = parsed.base + item.tld;
          var titleHtml = '<span class="dom-domain-title">' + parsed.base + '<span class="tld">' + item.tld + '</span></span>';

          var discountBadge = item.discount
            ? '<span class="dom-discount-badge">' + item.discount + '</span>'
            : '';

          var infoBtn = item.info
            ? '<button class="dom-icon-btn" type="button" title="Details" aria-label="Details">' + ICONS.info + '</button>'
            : '';

          var isFav = !!favorites[domainName];
          var starBtn = '<button class="dom-icon-btn dom-star-btn ' + (isFav ? 'active' : '') + '" type="button" data-fav="' + domainName + '" title="Favorite" aria-label="Favorite">' + ICONS.star + '</button>';

          var retailHtml = item.retail
            ? '<div class="dom-retail-price">Retail <span>' + item.retail + '</span></div>'
            : '';

          return (
            '<div class="dom-row" data-domain="' + domainName + '">' +
              '<div class="dom-row-left">' +
                '<div class="dom-pic ' + item.pic + '">' + item.icon + '</div>' +
                '<div class="dom-name-box">' +
                  titleHtml +
                  discountBadge +
                  infoBtn +
                  starBtn +
                '</div>' +
              '</div>' +
              '<div class="dom-row-right">' +
                '<div class="dom-price-col">' +
                  '<div class="dom-current-price">' + item.price + '</div>' +
                  retailHtml +
                '</div>' +
                '<button class="dom-cart-btn" type="button" data-domain="' + domainName + '" data-price="' + item.price + '">' +
                  ICONS.cart + ' Order Now' +
                '</button>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      }

      function doSearch() {
        var query = searchInput.value.trim() || 'istiak.com';
        var parsed = parseQuery(query);

        // Visual click feedback on search button
        searchBtn.classList.add('loading');
        setTimeout(function() {
          searchBtn.classList.remove('loading');
        }, 200);

        renderExactMatch(parsed);
        renderSuggested(parsed);
        resultsWrap.hidden = false;
      }

      // Input event to toggle clear button
      searchInput.addEventListener('input', function() {
        if (searchInput.value.trim().length > 0) {
          clearBtn.classList.add('visible');
        } else {
          clearBtn.classList.remove('visible');
        }
      });

      // Clear button
      clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        clearBtn.classList.remove('visible');
        searchInput.focus();
      });

      // Enter key triggers search
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSearch();
        }
      });

      // Search button click
      searchBtn.addEventListener('click', function(e) {
        e.preventDefault();
        doSearch();
      });

      // Quick chips click
      quickChips.forEach(function(chip) {
        chip.addEventListener('click', function() {
          var tld = chip.getAttribute('data-tld') || '.com';
          var currentVal = searchInput.value.trim();
          var parsed = parseQuery(currentVal || 'istiak.com');
          searchInput.value = parsed.base + tld;
          clearBtn.classList.add('visible');
          doSearch();
        });
      });

      // Tabs bar click
      if (tabsBar) {
        tabsBar.addEventListener('click', function(e) {
          var tabBtn = e.target.closest('.dom-tab');
          if (!tabBtn) return;
          tabsBar.querySelectorAll('.dom-tab').forEach(function(btn) {
            btn.classList.remove('active');
          });
          tabBtn.classList.add('active');
          currentTab = tabBtn.getAttribute('data-tab') || 'domains';
          var parsed = parseQuery(searchInput.value.trim() || 'istiak.com');
          renderSuggested(parsed);
        });
      }

      // Toggle Suggested Results Hide / Show
      if (toggleSuggested) {
        toggleSuggested.addEventListener('click', function() {
          isSuggestedHidden = !isSuggestedHidden;
          resultsList.style.display = isSuggestedHidden ? 'none' : 'flex';
          toggleSuggested.textContent = isSuggestedHidden ? 'Show' : 'Hide';
        });
      }

      // Event delegation for Cart, Favorite stars, and Make Offer
      resultsWrap.addEventListener('click', function(e) {
        // Favorite star toggle
        var starBtn = e.target.closest('.dom-star-btn');
        if (starBtn) {
          var dom = starBtn.getAttribute('data-fav');
          favorites[dom] = !favorites[dom];
          starBtn.classList.toggle('active', !!favorites[dom]);
          var count = Object.keys(favorites).filter(function(k) { return favorites[k]; }).length;
          if (favCountEl) favCountEl.textContent = count;
          return;
        }

        // Add to cart button
        var cartBtn = e.target.closest('.dom-cart-btn');
        if (cartBtn) {
          var domain = cartBtn.getAttribute('data-domain');
          var price = cartBtn.getAttribute('data-price');
          var wasAdded = cartBtn.classList.contains('added');

          if (window.UnifiedCart) {
            window.UnifiedCart.add({
              name: domain,
              details: 'Domain Registration (1 Year)',
              price: price,
              period: '/yr',
              quantity: 1
            });
          }

          if (!wasAdded) {
            cartBtn.classList.add('added');
            cartBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Ordered';
            setTimeout(function() {
              cartBtn.classList.remove('added');
              cartBtn.innerHTML = ICONS.cart + ' Order Now';
            }, 2500);
          }
          return;
        }

        // Make offer button
        var offerBtn = e.target.closest('.dom-btn-offer');
        if (offerBtn) {
          var offDomain = offerBtn.getAttribute('data-domain');
          location.href = 'mailto:info@unifiedit.xyz?subject=' + encodeURIComponent('Domain Acquisition Offer: ' + offDomain) +
            '&body=' + encodeURIComponent('Hello Unified Cloud Team,\n\nI would like to submit an offer for the domain: ' + offDomain + '.\n\nOffer Amount: $\nName:\nPhone:\n');
          return;
        }
      });

      // Pre-fill initial query 'istiak.com' matching user's screenshot
      searchInput.value = 'istiak.com';
      clearBtn.classList.add('visible');
      doSearch();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDomainSearch);
    } else {
      initDomainSearch();
    }
  })();
} catch (err) {
  console.error('[Domain Search]', err);
}
