# Unified Cloud: Fly into the Future 🚀

An enterprise cloud hosting website with an interactive 3D WebGL flight journey, a live latency widget, service pages
with pricing and configurators, and a glassmorphic UI. It is plain HTML, CSS and JavaScript with no build step required.

---

## 📁 Project Architecture & Directory Structure

```text
unified-it/
├── index.html                          # Entry point: markup plus script and style load order
├── Fly into the future.html            # Redirects to index.html (keeps the old link working)
├── package.json                        # Dev server, Vite and price-update scripts
├── vite.config.mjs                     # Vite build: copies assets/ into dist/
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       └── update-digicert-prices.yml  # Daily job: refreshes the DigiCert list prices
├── scripts/
│   ├── serve.js                        # `npm start`: small static server (port 3000)
│   ├── update-digicert-prices.mjs      # Reads digicert.com and updates the USD list prices
│   └── fixtures/                       # Page text used to test the price parser
├── docs/
│   └── ARCHITECTURE.md                 # Load order, data flow, shared globals, adding a page
└── assets/
    ├── css/                            # Modular CSS, imported in cascade order by main.css
    │   ├── main.css                    # Master stylesheet (@import list; do not reorder)
    │   ├── variables.css               # Design tokens: colour scheme variables
    │   ├── base.css                    # Reset, html and body defaults
    │   ├── flight-scene.css            # Fixed WebGL canvas, scroll layers, intro copy, services panel
    │   ├── header.css                  # Frosted header, primary nav, CTA buttons, burger and mobile…
    │   ├── latency-widget.css          # Live latency monitor widget
    │   ├── overlays.css                # About and Partner full-page overlays (incl. chips, dust…
    │   ├── mega-menu.css               # Services mega-menu and header dropdowns
    │   ├── services.css                # Cloud VPS, Dedicated Server and Business Email catalogue pages
    │   ├── modal.css                   # Product detail / inquiry modal (#pm)
    │   ├── page-shell.css              # Shared .pg page shell: container, cards and grids
    │   ├── header-logo.css             # Animated header logo
    │   ├── footer.css                  # Service-page footer (.uf)
    │   ├── page-layout.css             # .pg sections, package grids, Microsoft 365 plan sets
    │   ├── email-tabs.css              # Business / Hybrid / Microsoft 365 tab bar
    │   ├── configurators.css           # Instance configurator, SSL brand switch, instance table,…
    │   ├── m365-and-cart.css           # Microsoft 365 hero card, cart drawer and calculators
    │   ├── billing.css                 # Monthly | Yearly billing switch (Business Email and Hybrid…
    │   └── digicert.css                # DigiCert certificate window (SSL page) and priced cart lines
    ├── js/
    │   ├── app.js                      # Entry point: runs last, checks libraries, marks page ready
    │   ├── config.js                   # Site links, asset routes, live-rate API (window.UNIFIED_CONFIG)
    │   ├── data/
    │   │   ├── service-pages.js        # Content and prices for the service pages
    │   │   ├── digicert-prices.js      # DigiCert plans and USD list prices, markup, fallback rate
    │   │   └── model-data.js           # Base64 copy of the 3D model (file:// only)
    │   ├── modules/
    │   │   ├── flight-scene.js         # Three.js hero scene: cloud shader, server racks, camera path; Dedicated Server rack
    │   │   ├── services-gallery.js     # Scroll-driven service slides (#svc)
    │   │   ├── latency-widget.js       # Live latency read-out (#lat)
    │   │   ├── about-page.js           # About overlay: dust canvas, 3D scene, chip glow, reveal
    │   │   ├── header-nav.js           # Link routing, mega-menu hover/placement, header dropdowns
    │   │   ├── partner-page.js         # Partner overlay
    │   │   ├── hosting-overlays.js     # Cloud VPS, Dedicated Server, Business Email overlay pages
    │   │   ├── service-modal.js        # Product detail / order modal (#pm)
    │   │   ├── dynamic-services.js     # Builds the .pg service pages, footer and email tab bar
    │   │   ├── ssl-configurator.js     # SSL page: brand switch and cart drawer (priced items)
    │   │   ├── digicert-catalog.js     # DigiCert certificate window, BDT pricing, Order Now to cart
    │   │   ├── vps-matrix.js           # Cloud instance configurator (#pg-cloud)
    │   │   ├── storage-calc.js         # Cloud Storage calculator (#pg-storage)
    │   │   └── ui-toggles.js           # Microsoft 365 sets, accordions, Monthly | Yearly switch
    │   └── vendor/
    │       ├── three.min.js            # Three.js r128
    │       ├── GLTFLoader.js           # GLB loader for Three.js r128
    │       └── meshopt_decoder.js      # Meshopt decoder
    ├── models/
    │   └── server-rack.glb             # Server rack model (4.1 MB, meshopt glTF)
    └── images/
        └── logo.png                    # Header logo and favicon (660x110)
```

The cloud fragment shader is kept inline in `index.html` (`<script id="cfs">`) so it works on `file://` too.
`assets/images/logo-hd.png` (used for `og:image`) and the `legacy/` folder are not part of this package; keep your own copies.

---

## ⚡ Tech Stack & Highlights

- **3D graphics:** Three.js r128 (vendored), GLTFLoader with Meshopt compression, a volumetric cloud fragment shader.
- **Styling:** vanilla modular CSS, glassmorphism (`backdrop-filter`), flex/grid layouts, responsive media queries.
- **Interaction:** anime.js ambient pulse and click burst on the service slides, canvas dust particles, scroll-driven camera.
- **Service pages:** Cloud VPS, Dedicated Server, Business Email, Hybrid Email, Microsoft 365, SSL, Domain, Cloud Storage,
  Cloud Instances, Cyber Security, Agentic AI.
  - Live latency widget.
  - SSL page: DigiCert certificate window (Single / Multi-Domain, OV / EV) with prices in BDT, Order Now on every card, and an add-to-cart drawer.
  - Cloud instance configurator: filter and search, pagination, storage type (NVMe / SSD / HDD), 25 Gbps networking, quote summary.
  - Cloud Storage calculator: storage type, size, snapshots and quote summary.
  - Monthly | Yearly billing switch on Business Email and Hybrid Email.

---

## 🛠️ Getting Started & Development

### 1. Run the local server
```bash
npm start
```
Open `http://localhost:3000`. This uses `scripts/serve.js`, so there is nothing to install.

### 2. Run with Vite (hot reload and production build)
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # output in dist/
npm run preview
```
Vite prints a warning for each `<script>` ("can't be bundled without type=module"). That is expected: the scripts are
classic files and `vite.config.mjs` copies `assets/` into `dist/` as they are.

### 3. Any static server
```bash
npx serve .
```

### 4. Open `index.html` directly
Opening the file from disk is supported: on `file://` the page loads `assets/js/data/model-data.js` and builds the 3D
model from that embedded copy, because browsers block `fetch()` of local files.

---

## ✏️ Where to change things

| I want to change… | Edit |
|---|---|
| Copy, plans and prices on Hybrid Email, Microsoft 365, SSL, Domain, Storage, Cyber Security, Hosting, Cloud pages | `assets/js/data/service-pages.js` |
| Business Email plans and prices | `index.html` (`#bem` section, `.vc.ml` cards) |
| Cloud instance catalogue (`uc.*`, `ucm.*`, …) | `DATA` array at the top of `assets/js/modules/vps-matrix.js` |
| Storage types (NVMe / SSD / HDD) | the `svol` and `vvol` selects in `assets/js/data/service-pages.js` |
| Monthly / Yearly switch behaviour | "Billing toggle" section of `assets/js/modules/ui-toggles.js`; styles in `assets/css/billing.css` |
| DigiCert plans, descriptions, markup (30%), fallback USD/BDT rate | `assets/js/data/digicert-prices.js` |
| DigiCert window layout and pricing logic | `assets/js/modules/digicert-catalog.js`, `assets/css/digicert.css` |
| Hero 3D scene, camera path, lighting | `assets/js/modules/flight-scene.js` |
| Site URL, services URL, model path | `assets/js/config.js` (links inside the markup and data are still absolute) |

### DigiCert pricing

On the SSL page, **DigiCert** shows the certificates from digicert.com/tls-ssl/tls-ssl-certificates with this price:

```
BDT price = DigiCert 12-month price (USD) x 1.30 x USD/BDT rate
```

- The **markup** (0.30) and a **fallback rate** (123) are in `assets/js/data/digicert-prices.js`.
- The **rate** is fetched live from `UNIFIED_CONFIG.fxApi` (open.er-api.com), cached for 6 hours in the browser, and falls back to the fallback rate if the request fails. Set `fxApi` to `null` in `config.js` to always use the fixed rate.
- The **DigiCert USD prices** cannot be read from a visitor's browser (cross-origin block). `scripts/update-digicert-prices.mjs` reads them on the server side and rewrites the data file. `.github/workflows/update-digicert-prices.yml` runs it every day on GitHub and commits the file when a price changed. It refuses to write if a price is missing or moves by more than 60%, so a changed DigiCert page cannot publish wrong prices. Run it by hand with `npm run update:prices`.
- Multi-domain prices are the standard price x number of domains plus the wildcard price x number of wildcard domains. DigiCert's volume discounts are not modelled.
- **Order Now** adds the configured certificate (name, options, 12-month BDT price) to the cart drawer.

### Other prices
Business Email **yearly** prices are the monthly price × 12, and Hybrid Email **monthly** prices are the yearly price ÷ 12.
They are placeholders until real figures are confirmed. Each price element carries `data-m` (monthly) and `data-y` (yearly) attributes.

---

## 🧩 Notes on this structure

- Every module section runs inside its own `try/catch`, as each used to be its own `<script>`. A failure in one
  (for example no WebGL) is logged to the console and does not stop the others.
- `partner-page.js` is part of the load order in `index.html`; the Partner overlay needs it.
- The header logo keeps its link to `https://unified.it.com/`. Several modules intercept that exact link to scroll to
  the top or close an open overlay, so replacing it with `#home` would disable that behaviour.
- The `#bem` (Business Email) section has no inline `display:none`: its visibility is controlled by the `.on` class,
  and the inline style would keep the page from ever opening.
- The Dedicated Server slide (02 / 9) uses a custom 3D server rack (drive bays, vents, steady power LEDs, power pulse, floor ripple) instead of the generic polyhedron. It is built at the end of `modules/services-gallery.js`; the other slides keep their shapes.
- anime.js still loads from the CDN (pinned 4.0.2). Download it into `assets/js/vendor/` for fully offline use.

Browser support: current Chrome, Edge, Firefox and Safari with WebGL. Without WebGL the hero scene is skipped and the rest of the page keeps working.
