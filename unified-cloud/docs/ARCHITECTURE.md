# Architecture

## Overview

A static site with no bundler. `index.html` contains the page markup, loads the stylesheets in cascade order, loads three
CDN libraries, then runs the application scripts in a fixed order. Each script is an IIFE that finds its elements by id and
wires itself up, so a script must come **after** the markup it uses.

```
index.html
 ├─ <link> src/css/00 … 16                 styles (order matters)
 ├─ <body> markup                          hero layers, header, About, Partner, VPS / VDS / Business Email pages
 ├─ <script id="cfs" type="x-shader/…">    cloud fragment shader (read by hero-scene.js)
 ├─ CDN: three r128, GLTFLoader, meshopt, anime.js
 └─ application scripts (table below)
```

## Script load order

| # | File | Purpose |
|---|---|---|
| 1 | `src/js/scene/hero-scene.js` | Hero 3D scene: Three.js scene: cloud-dive shader, server racks (loaded from assets/models), laptop, camera path driven by scroll. Publishes window.__sm (smoothed scroll) used by the header. |
| 2 | `src/js/hero/service-slides.js` | Service slides: Builds the scroll-driven service panels inside #svc from the SV list. |
| 3 | `src/js/hero/latency-widget.js` | Latency widget: Animated latency read-out in #lat. |
| 4 | `src/js/about/dust-canvas.js` | About dust: 2D particle dust on #adust inside the About overlay. |
| 5 | `src/js/about/about-scene.js` | About 3D scene: Secondary Three.js canvas rendered behind the About overlay. |
| 6 | `src/js/about/chip-glow.js` | Chip glow: Pointer-follow glow on .chip elements in About. |
| 7 | `src/js/header/mega-menu-hover.js` | Mega menu hover: Opens/closes the services mega-menu from the header link. |
| 8 | `src/js/about/reveal.js` | About reveal: IntersectionObserver reveal for .rv blocks and About click handling. |
| 9 | `src/js/header/navigation.js` | Navigation: Routes header, mobile-menu and mega-menu links to scroll positions. |
| 10 | `src/js/partner/partner-section.js` | Partner overlay: Partner overlay with its own canvas and open/close handling. |
| 11 | `src/js/header/mega-menu-position.js` | Mega menu position: Centres the mega-menu under the Services link. |
| 12 | `src/js/header/dropdown-menus.js` | Header dropdowns: Icon set and dropdown menus (Cyber Security, etc.). |
| 13 | `src/js/pages/vps-page.js` | Cloud VPS page: Overlay page #vps: canvas, open/close and scroll hand-off. |
| 14 | `src/js/pages/vds-page.js` | Dedicated Server page: Overlay page #vds: canvas, open/close and scroll hand-off. |
| 15 | `src/js/pages/business-email-page.js` | Business Email page: Overlay page #bem: canvas, open/close and scroll hand-off. |
| 16 | `src/js/ui/product-modal.js` | Product modal: Creates #pm and opens it from any package "Order" button. |
| 17 | `src/data/service-pages.js` | Content for every service page (`window.SERVICE_PAGES`) |
| 18 | `src/js/pages/service-pages.js` | Service pages builder: Builds the .pg pages (Cyber Security, Hosting, SSL, Domain, Storage, Microsoft 365, Agentic AI, Contact, Login, Hybrid Email, Cloud, Sign up) from window.SERVICE_PAGES. |
| 19 | `src/js/pages/footer-taglines.js` | Footer taglines: Appends the footer (window.__UF) to the VPS, VDS and Business Email pages. |
| 20 | `src/js/ui/microsoft-toggle.js` | Microsoft 365 toggle: Switches between Microsoft 365 plan sets (.mtog / .mset). |
| 21 | `src/js/ui/see-more.js` | See more details: Expands/collapses plan details (.mmore). |
| 22 | `src/js/pages/email-tabs.js` | Email tabs: Injects the Business Email / Hybrid Email / Microsoft 365 tab bar. |
| 23 | `src/js/pages/ssl-brand-toggle.js` | SSL brand toggle: Brand filter for the SSL certificate cards (#pg-ssl). |
| 24 | `src/js/pages/cloud-instance-configurator.js` | Cloud instance configurator: Instance table, filters, storage volume, summary and quote (#pg-cloud). Instance catalogue lives in the DATA array at the top of this file. |
| 25 | `src/js/pages/cloud-storage-calculator.js` | Cloud storage calculator: Storage type, size, snapshots, summary and quote (#pg-storage). |
| 26 | `src/js/ui/cart.js` | Cart drawer: Add-to-cart drawer for the SSL page (#cart). |
| 27 | `src/js/ui/billing-toggle.js` | Billing toggle: Monthly / Yearly switch for Business Email and Hybrid Email (uses data-m / data-y attributes). |

## Data flow

1. `src/data/service-pages.js` defines `window.SERVICE_PAGES`: one entry per page (`cyber`, `hosting`, `ssl`, `domain`,
   `storage`, `m365`, `agentic`, `contact`, `login`, `hybrid`, `cloud`, `signup`) with its accent colours, icon, cards and
   HTML sections.
2. `src/js/pages/service-pages.js` reads it and creates the `.pg` overlay pages (`#pg-<name>`), the shared footer
   (`window.__UF`) and the header dropdown links.
3. Page-specific scripts then attach behaviour to those pages: `email-tabs.js`, `cloud-instance-configurator.js`,
   `cloud-storage-calculator.js`, `ssl-brand-toggle.js`, `cart.js`, `billing-toggle.js`.
4. `hero-scene.js` fetches `assets/models/server-rack.glb`, builds the scene and publishes `window.__sm` (smoothed scroll
   progress). The header, service slides and overlays read it to fade in at the right scroll position.

## Shared globals

| Global | Set by | Read by |
|---|---|---|
| `window.SERVICE_PAGES` | `src/data/service-pages.js` | `pages/service-pages.js` |
| `window.__sm` (smoothed scroll progress, 0 to 1) | `scene/hero-scene.js` | `hero/service-slides.js`, `about/dust-canvas.js`, `partner/partner-section.js`, `pages/*` |
| `window.__aboutOpen` (an overlay is open) | `about/*`, `partner/partner-section.js`, `pages/vps-page.js`, `vds-page.js`, `business-email-page.js`, `service-pages.js` | `scene/hero-scene.js`, `hero/service-slides.js` |
| `window.__UF` (footer builder) | `pages/service-pages.js` | `pages/footer-taglines.js` |
| `window.anime` | anime.js (CDN) | `hero/service-slides.js` (ambient pulse and click burst) |

## Adding a new service page

1. Add an entry to `src/data/service-pages.js` (copy an existing one such as `hybrid`).
2. Add its slug to the `SL` / `DD` lists in `src/js/header/navigation.js` and `src/js/header/dropdown-menus.js`
   if it should appear in the menus.
3. Put behaviour in a new file under `src/js/pages/` and add a `<script>` tag after `service-pages.js`.
4. Add styles to the closest file in `src/css/` (or a new numbered file at the end).

## Conventions

- No globals other than the `window.__*` ones above; everything else lives inside an IIFE.
- Prices use `data-m` / `data-y` attributes so the billing toggle can swap them without re-rendering.
- Keep `assets/models/*.glb` under version control with Git LFS if the model grows.
