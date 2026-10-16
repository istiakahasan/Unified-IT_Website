# Unified Cloud: landing page

Scroll-driven 3D landing page for **Unified Cloud**. A WebGL scene (Three.js) opens the page, and the header, mega-menu
and service overlays (Cloud VPS, Dedicated Server, Business Email, Hybrid Email, Microsoft 365, Cloud Storage,
Cloud Instances, SSL, Domain, Cyber Security, Agentic AI) sit on top of it. There is no build step: it is plain
HTML, CSS and JavaScript.

## Run it

The 3D model is loaded with `fetch()`, so the project must be served over HTTP. Opening `index.html` from the file
system (`file://`) will not load the model.

```bash
npm install        # installs the tiny dev server (serve)
npm start          # http://localhost:3000
```

No Node? Any static server works, for example `python3 -m http.server 3000`.

## Project structure

```
unified-cloud/
├── index.html                      Page markup + script/style load order
├── assets/
│   ├── images/logo-unified-cloud.png
│   └── models/server-rack.glb      Server rack model (meshopt-compressed glTF)
├── src/
│   ├── css/                        Stylesheets, numbered in cascade order (00 to 16)
│   ├── data/
│   │   └── service-pages.js        All content for the service pages (cards, prices, features)
│   └── js/
│       ├── scene/                  Hero Three.js scene
│       ├── hero/                   Service slides, latency widget
│       ├── about/                  About overlay (dust, 3D scene, reveal, chip glow)
│       ├── partner/                Partner overlay
│       ├── header/                 Navigation, mega-menu, dropdowns
│       ├── pages/                  Service pages, configurators, email tabs
│       └── ui/                     Modal, cart, toggles
├── docs/ARCHITECTURE.md            Load order, data flow, conventions
├── package.json
├── .editorconfig
└── .gitignore
```

## Where to change things

| I want to change… | Edit |
|---|---|
| Copy, plans and prices on Hybrid Email, Microsoft 365, SSL, Domain, Storage, Cyber Security, Hosting, Cloud pages | `src/data/service-pages.js` |
| Business Email plans and prices | `index.html` (`#bem` section, `.vc.ml` cards) |
| Cloud instance catalogue (`uc.*`, `ucm.*`, …) | `DATA` array at the top of `src/js/pages/cloud-instance-configurator.js` |
| Storage types (NVMe / SSD / HDD) | `svol` and `vvol` selects in `src/data/service-pages.js` |
| Colours, spacing, animations | the matching file in `src/css/` |
| Monthly / Yearly switch behaviour | `src/js/ui/billing-toggle.js` |
| Hero 3D scene, camera path, lighting | `src/js/scene/hero-scene.js` |

### Pricing note

Business Email **yearly** prices are the monthly price × 12, and Hybrid Email **monthly** prices are the yearly price ÷ 12.
These are placeholders until real figures are confirmed. Each price element carries `data-m` (monthly) and `data-y` (yearly)
attributes, so updating a price means editing those two attributes.

## Third-party libraries

Loaded from a CDN with pinned versions (see the bottom of `index.html`):

| Library | Version | Used for |
|---|---|---|
| three.js | r128 | Hero and overlay 3D scenes |
| GLTFLoader, meshopt_decoder | three@0.128.0 | Loading `server-rack.glb` |
| anime.js | 4.0.2 | Ambient pulse and click burst on the hero service slides |

To work offline, download these files into `assets/vendor/` and point the `<script>` tags in `index.html` at them.

## Browser support

Current Chrome, Edge, Firefox and Safari with WebGL enabled. If WebGL is unavailable the hero scene is skipped
(`hero-scene.js` returns early) and the rest of the page still works.

## Conventions

- Scripts are classic (non-module) IIFEs and run in the order listed in `index.html`; keep that order when adding files.
- CSS files are numbered because the cascade depends on order.
- Shared state is exposed on `window.__*` (for example `window.__sm`, `window.__UF`) and documented in `docs/ARCHITECTURE.md`.
