# Unified Cloud: Fly into the Future 🚀

An enterprise cloud infrastructure platform featuring an interactive 3D WebGL flight journey, real-time latency telemetry, modular service catalogues and calculators, a Dhaka Anycast domain search engine, and a complete **Cloud Partner Program Platform** with automated spend-based tier progression and sales reward ledgers.

---

## 📁 Project Architecture & Directory Structure

```text
unified-it/
├── index.html                          # Entry point: 3D hero journey, domain search & cloud catalog
├── Fly into the future.html            # Legacy alias redirecting to index.html
├── partners.html                       # Public Cloud Partner Program landing & application portal
├── partner-dashboard.html              # Authenticated Partner Portal (live margins, tier roadmap, clients)
├── admin-partners.html                 # Central Admin Control Center (apps, automated directory, rewards)
├── package.json                        # Scripts: start, test, dev, build, price updates
├── vite.config.mjs                     # Vite build configuration (assets asset pipeline)
├── README.md                           # Documentation & system overview
├── .gitignore
├── .github/
│   └── workflows/
│       └── update-digicert-prices.yml  # Daily workflow: refreshes upstream DigiCert list prices
├── server/                             # Node.js backend platform & API microservices
│   ├── server.mjs                      # Main HTTP server: routing, static file server, CORS, API dispatch
│   ├── db.mjs                          # SQLite database: multi-tenant schemas, indexes, seed data
│   ├── api.mjs                         # REST API router: authentication, partner, admin, rewards endpoints
│   ├── auth.mjs                        # Session authentication & Role-Based Access Control (RBAC)
│   ├── pricing-engine.mjs              # Multi-tier wholesale pricing engine & automated tier progression
│   ├── reward-service.mjs              # Sales-based reward points engine, ledger & refund handling
│   ├── whmcs-adapter.mjs               # WHMCS enterprise billing & account adapter
│   └── cloudstack-adapter.mjs          # Apache CloudStack infrastructure & VM provisioning adapter
├── tests/
│   └── partner-system.test.mjs         # Production automated test suite (29 tests)
├── scripts/
│   ├── serve.js                        # `npm start` entrypoint (port 3000)
│   ├── update-digicert-prices.mjs      # Digicert list price scraper & currency converter
│   ├── update-comodo-prices.mjs        # Comodo/Sectigo list price scraper
│   └── fixtures/                       # Test fixtures for price parsers
├── docs/
│   └── ARCHITECTURE.md                 # System load order, data flow, globals, and design patterns
└── assets/
    ├── css/                            # Modular CSS architecture imported by main.css
    │   ├── main.css                    # Master stylesheet (@import list)
    │   ├── variables.css               # Design tokens: palette, HSL accents, glow variables
    │   ├── base.css                    # Typography, resets, body styling
    │   ├── flight-scene.css            # WebGL fixed canvas, scroll cameras, intro flight copy
    │   ├── header.css                  # Frosted glass header, primary navigation, CTA buttons
    │   ├── domain-search.css           # Domain search bar, quick TLD chips, suggested rows & styling
    │   ├── latency-widget.css          # Live Dhaka Anycast latency monitor widget
    │   ├── overlays.css                # Full-page modal overlays (About, Partner, Solutions)
    │   ├── mega-menu.css               # Services mega-menu and dropdown panels
    │   ├── services.css                # Cloud VPS, VDS, and Business Email catalogue cards
    │   ├── modal.css                   # Interactive service inquiry / checkout modal (#pm)
    │   ├── page-shell.css              # Shared .pg container, hero headings, responsive grids
    │   ├── header-logo.css             # Animated header branding logo
    │   ├── footer.css                  # Enterprise footer (.uf)
    │   ├── page-layout.css             # Package comparison grids, Microsoft 365 plan layouts
    │   ├── email-tabs.css              # Business / Hybrid / Microsoft 365 tab switches
    │   ├── configurators.css           # Instance configurators, SSL brand switches, spec tables
    │   ├── m365-and-cart.css           # Microsoft 365 hero cards, slide-out cart drawer
    │   ├── billing.css                 # Monthly | Yearly billing toggles
    │   └── digicert.css                # DigiCert SSL certificate window & multi-domain pricing
    ├── js/
    │   ├── app.js                      # Application bootstrap & readiness verification
    │   ├── config.js                   # Site links, asset routes, currency FX API configuration
    │   ├── data/
    │   │   ├── service-pages.js        # Content, features, specs and pricing for service pages
    │   │   ├── digicert-prices.js      # DigiCert plans, USD list prices, markup, fallback FX rate
    │   │   ├── comodo-prices.js        # Comodo SSL catalog plans and pricing
    │   │   └── model-data.js           # Embedded 3D model fallback (for file:// protocol)
    │   ├── modules/
    │   │   ├── flight-scene.js         # Three.js hero: cloud shader, server racks, camera fly-through
    │   │   ├── services-gallery.js     # Scroll-driven service showcase slides (#svc)
    │   │   ├── latency-widget.js       # Live Anycast ping read-out (#lat)
    │   │   ├── domain-search.js        # Instant domain search: TLD suggestions, Dhaka DNS, cart add
    │   │   ├── about-page.js           # About overlay: particle canvas, 3D scene, reveal animations
    │   │   ├── header-nav.js           # Navigation routing, mega-menu placement, anchor handling
    │   │   ├── partner-page.js         # Partner overlay & profit calculator
    │   │   ├── hosting-overlays.js     # VPS, Dedicated Server (VDS), Business Email overlays
    │   │   ├── service-modal.js        # Product order / inquiry modal (#pm)
    │   │   ├── dynamic-services.js     # Builds dynamic service pages, footer, email tab bar
    │   │   ├── ssl-configurator.js     # SSL certificate configurator & cart drawer
    │   │   ├── digicert-catalog.js     # DigiCert window, live BDT calculation, Order Now to cart
    │   │   ├── comodo-catalog.js       # Comodo/Sectigo SSL plan selector
    │   │   ├── vps-matrix.js           # Cloud VPS / Compute matrix & storage selector (#pg-cloud)
    │   │   ├── storage-calc.js         # Cloud Storage interactive calculator (#pg-storage)
    │   │   └── ui-toggles.js           # Accordions, plan sets, monthly/yearly price toggles
    │   └── vendor/
    │       ├── three.min.js            # Three.js r128 WebGL library
    │       ├── GLTFLoader.js           # GLTF / GLB model loader
    │       └── meshopt_decoder.js      # Meshopt compression decoder
    ├── models/
    │   └── server-rack.glb             # 3D Datacenter server rack model (meshopt glTF)
    └── images/
        └── logo.png                    # Unified Cloud brand logo & favicon
```

---

## 🌟 Key Highlights & Modern Capabilities

### 1. Cloud Partner Program Platform
A complete wholesale reseller and partner ecosystem backed by SQLite and a REST API:
- **Automatic Spend-Based Tier Progression**:
  Partners automatically qualify for wholesale tiers based on cumulative monthly eligible infrastructure spending in BDT:
  - **Registered Partner**: 5% wholesale margin (৳0 minimum spend)
  - **Silver Partner**: 10% wholesale margin (৳30,000 monthly spend)
  - **Gold Partner**: 15% wholesale margin (৳120,000 monthly spend)
  - **Platinum Partner**: 20% – 25% wholesale margin (৳360,000 monthly spend)
  - Spend upgrades trigger automatically as verified sales are logged.
- **Mandatory PDF Verification Documents (Trade License & NID)**:
  - Both **Trade License** and **National ID (NID)** are mandatory uploads for all partner registrations in [partners.html](file:///e:/Projects/unified-it/partners.html) and [index.html](file:///e:/Projects/unified-it/index.html).
  - Documents must be uploaded strictly in **PDF format** (`.pdf`), enforced with client-side drag-and-drop validation and server-side MIME/signature checks in `POST /api/public/applications`.
  - Stored securely in the SQLite `partner_applications` table (`trade_license_pdf`, `trade_license_filename`, `nid_document_pdf`, `nid_document_filename`) with automatic schema migration.
  - In [admin-partners.html](file:///e:/Projects/unified-it/admin-partners.html), administrators can inspect applicant credentials with **PDF Preview** (opens in a new tab) and **Download PDF** buttons in the Application Details modal, accompanied by verification badges in the Applications directory table.
- **Admin Governance & Custom Discounts**:
  - In [admin-partners.html](file:///e:/Projects/unified-it/admin-partners.html), the **Assigned Tier** and **Monthly Spend** are strictly read-only and governed automatically by verified infrastructure sales.
  - Administrators can grant bespoke **Custom Commercial Discounts** (e.g. 20%, 25%) via the `[Give Discount]` management action.
  - When saved, custom discounts synchronize immediately to the [partner-dashboard.html](file:///e:/Projects/unified-it/partner-dashboard.html), displaying a special approved discount badge while preserving automatic spend progression toward future tiers.
- **Partner Sales Reward Points System**:
  - Reseller partners automatically earn **10% reward points** on eligible cloud sales (1 point per ৳10 spent in BDT).
  - Supports category alias mapping (`VPS` / `Cloud VPS`, `VDS` / `Dedicated Server`).
  - Strict anti-abuse rules prevent partners from earning points on self-purchases.
  - Idempotent webhook processing prevents duplicate rewards, with safe reversal handling for refunds.
- **Enterprise Integrations**:
  - Mock WHMCS and Apache CloudStack adapters manage client organizations, tenant isolation, and VM provisioning quotas.

### 2. Domain Registration & Search Engine
- Clean, high-performance domain search located in [domain-search.js](file:///e:/Projects/unified-it/assets/js/modules/domain-search.js):
  - Provides real-time pricing and availability for top-level domains (`.com`, `.org`, `.ai`, `.to`, `.net`, `.io`, `.xyz`, `.tech`, `.online`, `.com.bd`).
  - Instant Dhaka Anycast DNS routing quotes and favorite bookmarking.
  - Dedicated exclusively to domain TLD options (standalone SSL addon rows excluded to prevent clutter).
  - Direct integration with `window.UnifiedCart` for instant checkout.

### 3. 3D WebGL Flight Experience & Design System
- Volumetric cloud fragment shader rendered with Three.js r128 and Meshopt-compressed server rack models.
- Deep space cosmic backdrop, ambient glow particles, and glassmorphism styling (`backdrop-filter`).
- Dynamic interactive calculators for Cloud VPS, VDS, Cloud Storage, and Microsoft 365 licensing.

---

## 🛠️ Getting Started & Local Development

### 1. Launch Platform Server
```bash
npm start
```
Starts the Node.js server and SQLite backend on `http://localhost:3000`.
- **Public Portal:** `http://localhost:3000/`
- **Partner Program:** `http://localhost:3000/partners`
- **Partner Dashboard:** `http://localhost:3000/partner/dashboard`
  - Demo login: `partner@unified.test` / `PartnerInitial2026!`
- **Admin Control Center:** `http://localhost:3000/admin/partners`
  - Admin login: `admin@unified.test` / `UnifiedAdmin2026!`

### 2. Run Automated Test Suite
```bash
npm test
```
Executes the production test suite (`tests/partner-system.test.mjs`) verifying 33 automated tests:
1. Multi-tenant database initialization & tier configurations
2. Partner application workflow & mandatory PDF document validation (Trade License & NID)
3. Pricing engine & anti-stacking protections
4. Partner-to-customer data isolation
5. WHMCS & CloudStack adapter idempotency and provisioning quotas
6. Sales-based reward points ledger, anti-abuse, refunds, and VPS/VDS aliases
7. Automatic spend-based tier progression

### 3. Run with Vite (Alternative Bundler)
```bash
npm install
npm run dev        # Starts Vite dev server at http://localhost:5173
npm run build      # Generates production bundle in dist/
npm run preview    # Previews production build
```

---

## ⚙️ REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/partner/overview` | Retrieves partner metrics, active tier, effective margin, and spend roadmap |
| `GET` | `/api/partner/customers` | Lists managed client accounts for the authenticated partner |
| `GET` | `/api/partner/services` | Lists running CloudStack VM instances and monthly fees |
| `GET` | `/api/partner/rewards/summary` | Retrieves reward points balance, lifetime earnings, and history |
| `GET` | `/api/admin/partners` | Lists all partner accounts with automated tiers and tracked spend |
| `POST` | `/api/admin/partners/:id/discount` | Grants a custom commercial discount percentage to a partner |
| `POST` | `/api/admin/partners/:id/status` | Toggles partner account between `ACTIVE` and `SUSPENDED` |
| `POST` | `/api/admin/rewards/simulate-sale` | Simulates an infrastructure purchase and credits partner reward points |
| `POST` | `/api/admin/rewards/refund` | Reverses earned reward points for refunded sales |
| `POST` | `/api/pricing/calculate` | Calculates wholesale net prices, applies tier/custom discounts and safeguards |

---

## 🧩 Browser Support & Compatibility

- Compatible with modern Chromium-based browsers (Chrome, Edge, Brave), Firefox, and Safari with WebGL 2.0.
- Fallback mechanics ensure full catalog functionality and direct checkout if WebGL is disabled or unsupported.
