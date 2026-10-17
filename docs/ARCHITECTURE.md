# Architecture

## Overview

A static site with no bundler. `index.html` holds the page markup, links `assets/css/main.css` (which imports the CSS files
in cascade order), loads the libraries, then runs the application scripts in a fixed order. Each module finds its
elements by id and wires itself up when it runs, so a module must come **after** the markup it uses and after any
module that builds that markup.

```
index.html
 ├─ assets/css/main.css                  → imports 18 CSS files in cascade order
 ├─ <body> markup                        hero layers, header, About, Partner, VPS / VDS / Business Email pages
 ├─ <script id="cfs" type="x-shader/…">  cloud fragment shader (read by modules/flight-scene.js)
 ├─ vendor: three r128, GLTFLoader, meshopt (local), anime.js 4.0.2 (CDN)
 └─ scripts in the order below
```

## Script load order

| # | File |
|---|---|
| 1 | `assets/js/vendor/three.min.js` |
| 2 | `assets/js/vendor/GLTFLoader.js` |
| 3 | `assets/js/vendor/meshopt_decoder.js` |
| 4 | `assets/js/config.js` |
| 5 | `assets/js/data/service-pages.js` |
| 6 | `assets/js/data/digicert-prices.js` |
| 7 | `assets/js/data/comodo-prices.js` |
| 8 | `assets/js/modules/flight-scene.js` |
| 9 | `assets/js/modules/services-gallery.js` |
| 10 | `assets/js/modules/latency-widget.js` |
| 11 | `assets/js/modules/about-page.js` |
| 12 | `assets/js/modules/header-nav.js` |
| 13 | `assets/js/modules/partner-page.js` |
| 14 | `assets/js/modules/hosting-overlays.js` |
| 15 | `assets/js/modules/service-modal.js` |
| 16 | `assets/js/modules/dynamic-services.js` |
| 17 | `assets/js/modules/ssl-configurator.js` |
| 18 | `assets/js/modules/digicert-catalog.js` |
| 19 | `assets/js/modules/comodo-catalog.js` |
| 20 | `assets/js/modules/vps-matrix.js` |
| 21 | `assets/js/modules/storage-calc.js` |
| 22 | `assets/js/modules/ui-toggles.js` |
| 23 | `assets/js/app.js` |

(`data/model-data.js` is added by a small inline script only when the page runs on `file://`.)

## Data flow

1. `data/service-pages.js` defines `window.SERVICE_PAGES`: one entry per page (`cyber`, `hosting`, `ssl`, `domain`,
   `storage`, `m365`, `agentic`, `contact`, `login`, `hybrid`, `cloud`, `signup`) with accent colours, icon, cards and HTML sections.
2. `modules/dynamic-services.js` builds the `.pg` pages (`#pg-<name>`), the shared footer (`window.__UF`) and the
   Business Email / Hybrid Email / Microsoft 365 tab bar.
3. Page modules attach behaviour to those pages: `ssl-configurator.js` (`#pg-ssl`) and `digicert-catalog.js` (the DigiCert window inside it), `vps-matrix.js` (`#pg-cloud`),
   `storage-calc.js` (`#pg-storage`), `ui-toggles.js` (Microsoft 365 sets, accordions, billing switch).
4. `flight-scene.js` loads `assets/models/server-rack.glb` (via `fetch`, or the base64 copy on `file://`), builds the scene
   and publishes `window.__sm` (smoothed scroll progress). Other modules read it to appear at the right scroll position.

## Shared globals

| Global | Set by | Read by |
|---|---|---|
| `window.UNIFIED_CONFIG` | `config.js` | `flight-scene`, `services-gallery`, `header-nav`, `dynamic-services` |
| `window.SERVICE_PAGES` | `data/service-pages.js` | `dynamic-services` |
| `window.UNIFIED_MODEL_B64` | `data/model-data.js` (file:// only) | `flight-scene` |
| `window.__sm` (smoothed scroll, 0 to 1) | `flight-scene` | `services-gallery`, `about-page`, `partner-page`, `hosting-overlays`, `dynamic-services` |
| `window.__aboutOpen` (an overlay is open) | `about-page`, `partner-page`, `hosting-overlays`, `dynamic-services` | `flight-scene`, `services-gallery` |
| `window.__UF` (footer builder) | `dynamic-services` | `dynamic-services` |
| `window.anime` | anime.js | `services-gallery` |
| `window.DIGICERT_PRICES` | `data/digicert-prices.js` (rewritten daily by `scripts/update-digicert-prices.mjs`) | `digicert-catalog` |
| `window.COMODO_PRICES` | `data/comodo-prices.js` (rewritten daily by `scripts/update-comodo-prices.mjs`) | `comodo-catalog` |
| `window.UnifiedCart` (`add({n, d, p, q})`) | `ssl-configurator` (cart drawer) | `digicert-catalog`, `comodo-catalog` |

## Adding a service page

1. Add an entry to `assets/js/data/service-pages.js` (copy an existing one such as `hybrid`).
2. If it should appear in the menus, add its slug to the `SL` and `DD` lists in `modules/header-nav.js`.
3. Put behaviour in a new module under `assets/js/modules/` and add its `<script>` after `dynamic-services.js`.
4. Add styles to the closest file in `assets/css/`, or a new file imported at the end of `main.css`.

## Conventions

- Modules are classic scripts. Each section inside a module is wrapped in `try/catch` so one failure cannot stop the others.
- Prices use `data-m` / `data-y` attributes so the billing switch can swap them without re-rendering.
- CSS files are imported in the order of the original stylesheet; reordering them changes the cascade.
