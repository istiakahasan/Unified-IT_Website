# Unified Cloud: Fly into the Future 🚀

An enterprise cloud infrastructure platform featuring an interactive 3D WebGL flight journey, real-time latency telemetry, modular service catalogues and calculators, a Dhaka Anycast domain search engine, a complete **Cloud Partner Program Platform**, a production **Role-Based Support Ticketing System**, and a dedicated **Centralized Admin Portal** on an isolated subdomain architecture.

📐 Architecture: [`architecture.md`](architecture.md) · 📝 Latest changes (navigation freeze fix, security hardening): [`CHANGES.md`](CHANGES.md)

---

## 🧰 Technology Stack & Requirements

| Area | What is actually used |
|---|---|
| Runtime | **Node.js 22.5 or newer** (the server uses the built-in `node:sqlite` module). npm 10+ |
| Front end | Plain HTML + classic browser scripts (no framework), Three.js r128 + GLTFLoader + Meshopt decoder + anime.js 4.0.2, all vendored in `assets/js/vendor/` (no runtime CDN) |
| Back end | Node.js `http` server (`server/`), SQLite database at `data/partner-system.db` (created on first start, git-ignored) |
| Build | Vite 6 (copies `assets/`, emits all five HTML pages to `dist/`) |
| Tests | Node test runner; browser tests use `playwright-core` with your installed Chrome or Edge |

---

## 📁 Project Architecture & Directory Structure

```text
unified-it/
├── index.html                          # Public Cloud Website: 3D hero journey, domain search & cloud catalog
├── Fly into the future.html            # Legacy alias redirecting to index.html
├── admin.html                          # Standalone Centralized Admin Portal SPA (RBAC, NOC, CMS, Billing, Support)
├── partners.html                       # Public Cloud Partner Program landing & application portal
├── partner-dashboard.html              # Authenticated Partner Portal (margins, tier roadmap, client ticket desk)
├── admin-partners.html                 # Partner Desk Control Center (apps, automated directory, rewards)
├── architecture.md                     # System architecture, load order, schema relations & test coverage
├── package.json                        # Scripts: start, test, test:admin, test:all, dev, build
├── vite.config.mjs                     # Vite build configuration (asset pipeline)
├── docker-compose.yml                  # Turnkey containerized stack (Node app + Nginx proxy)
├── .env.production.example             # Production environment template (domains, CloudStack, WHMCS)
├── nginx/
│   └── unified-cloud.conf              # Production Nginx reverse proxy (subdomains, SSL, rate-limits)
├── caddy/
│   └── Caddyfile                       # Caddy 2 reverse proxy with automated TLS certificates
├── server/                             # Node.js backend platform & API microservices
│   ├── server.mjs                      # Main HTTP server: Vhost routing, static server, API dispatch
│   ├── db.mjs                          # SQLite database: multi-tenant schemas, indexes, migrations, seeds
│   ├── api.mjs                         # REST API router: authentication, RBAC guards, cloud, billing, ticketing
│   ├── auth.mjs                        # SessionStore with revocation, brute-force lockout, RBAC matrix
│   ├── tickets-service.mjs             # Ticketing domain engine: SLA timer, multi-tenant isolation, audit log
│   ├── pricing-engine.mjs              # Multi-tier wholesale pricing engine & automated tier progression
│   ├── reward-service.mjs              # Sales-based reward points engine, ledger & refund handling
│   ├── whmcs-adapter.mjs               # WHMCS enterprise billing, invoice lifecycle & refund approvals
│   ├── agentic-ai.mjs                  # Agentic AI: pricing, RAG character billing, WHMCS orders, verified activation, usage
│   └── cloudstack-adapter.mjs          # Apache CloudStack multi-zone VM provisioning & NOC incident engine
├── CHANGES.md                          # Change log: root causes, fixes, security audit, measured results
├── tests/
│   ├── admin-portal.test.mjs           # Enterprise Admin Portal automated test suite (33 tests)
│   ├── partner-system.test.mjs         # Production Partner Program test suite (33 tests)
│   ├── support-ticketing.test.mjs      # Role-Based Support Ticketing System test suite (26 tests)
│   ├── agentic-ai.test.mjs             # Agentic AI module test suite (32 tests)
│   ├── security-hardening.test.mjs     # HTTP security, CSP, hashing & cookie regression suite (42 tests)
│   ├── csp-handlers.test.mjs           # data-on… parser + "no inline script anywhere" guard (46 tests)
│   └── e2e/navigation.e2e.mjs          # Browser navigation / animation / CSP suite (10 tests; Chrome, Edge, Firefox, WebKit)
├── data/                               # SQLite database + support attachments (runtime only, git-ignored, never served)
├── scripts/
│   ├── serve.js                        # `npm start` entrypoint (port 3000)
│   ├── check-syntax.mjs                # `npm run lint`: syntax check of all first-party JS
│   ├── update-digicert-prices.mjs      # Digicert list price scraper & currency converter
│   ├── update-comodo-prices.mjs        # Comodo/Sectigo list price scraper
│   └── fixtures/                       # Test fixtures for price parsers
├── docs/
│   └── ARCHITECTURE.md                 # System load order, data flow, globals, and design patterns
└── assets/
    ├── css/                            # Modular CSS architecture imported by main.css
    │   ├── support-ticket.css          # Support ticket modal, badges, conversation threads & SLA timers
    │   └── universal-cart.css          # Shopping cart flyout dropdown, trash bin buttons & slide-out drawer
    ├── js/                             # Interactive controllers, catalog engines, WebGL shaders
    │   ├── csp-handlers.js             # Runs data-onclick/-onsubmit/-onchange/-oninput attributes (no inline JS allowed)
    │   ├── pages/                      # Page scripts (formerly inline <script> blocks): admin.js, partners.js, …
    │   ├── vendor/                     # three.js, GLTFLoader, Meshopt decoder, anime.js (no runtime CDN)
    │   ├── modules/support-ticket.js   # Client ticket controller: submission, lookup, validation & upload
    │   ├── modules/agentic-ai.js       # Agentic AI configurator, live pricing summary, RAG upload, order tracking
    │   └── modules/universal-cart.js   # Universal cart manager: flyout dropdown, trash bin removal & toast
    ├── models/                         # 3D Datacenter server rack model (meshopt glTF)
    └── images/                         # Brand logos, icons, and textures
```

---

## 🌐 Production Domain & Subdomain Architecture

The platform supports a production multi-subdomain topology configured via environment variables:

| Subdomain | Environment Variable | Target View / Purpose | Security & Isolation Controls |
| :--- | :--- | :--- | :--- |
| **`example.com`** | `PUBLIC_DOMAIN` | Public Cloud Website (`index.html`) | Publicly accessible. Admin routes return `404`. |
| **`www.example.com`** | `WWW_DOMAIN` | Canonical Redirect | 301 Permanent Redirect to `https://example.com`. |
| **`admin.example.com`** | `ADMIN_DOMAIN` | Centralized Admin Portal (`admin.html`) | Authenticated administrative access only. Hardened CSP, frame-ancestors 'none', session timeout, rate-limited auth. |
| **`partners.example.com`** | `PARTNER_DOMAIN` | Partner Portal (`partner-dashboard.html`) | Isolated partner tenant workspace. Strict cross-partner tenant isolation enforced by database queries. |
| **`api.example.com`** | `API_DOMAIN` | Shared Microservices Backend (`server/server.mjs`) | REST API router with domain-aware CORS, Bearer/Cookie authentication, CSRF validation, and DDoS rate-limiting. |

---

## 🛡️ Role-Based Access Control (RBAC) Matrix

Implemented in [`server/auth.mjs`](server/auth.mjs) and [`server/tickets-service.mjs`](server/tickets-service.mjs), enforced by default across all administrative and portal endpoints:

| Role | Operational Scope | Permitted Endpoints & Actions | Denied Actions |
| :--- | :--- | :--- | :--- |
| **`SUPER_ADMIN`** | Full Platform Authorization | Unrestricted access to all modules (`*`), role assignment, system configurations, and support workspace. | None |
| **`SECURITY_ADMIN`** | Security, Telemetry & Access | View security audit stream, inspect active sessions, revoke session tokens, manage admin roles. | Cloud VM lifecycle, financial refunds |
| **`INFRASTRUCTURE_ADMIN`** | CloudStack & Datacenter Ops | Inspect Dhaka & Singapore zones, VM lifecycle (start/stop/terminate), log & resolve NOC incidents. | Financial refunds, partner commissions |
| **`FINANCE_ADMIN`** | Billing, Invoices & Payouts | Review gross revenue, MRR, invoices, approve refunds with justification, payment gateways. | Modifying cloud VM state, user role changes |
| **`PARTNER_MANAGER`** | Partner Desk & Agreements | Approve/reject partner applications, manage partner tiers, custom discount agreements, sales rewards. | Modifying customer accounts, VM termination |
| **`SUPPORT_ADMIN`** | Customer Support Helpdesk | View support queue, triage tickets, assign staff, post internal notes, adjust priority/SLA, resolve issues. | Approving refunds, modifying infrastructure |
| **`CONTENT_ADMIN`** | Public Website CMS | Manage announcements/banners, cloud service plan specifications (vCPU, RAM, NVMe, BDT/USD pricing), and update page SEO metadata and promo coupons. | Access to customer/partner accounts, security logs |
| **`AUDITOR`** | Compliance & Audit | Read-only compliance access to audit logs, security events, customer records, billing, telemetry, and tickets. | **All state-changing actions** (write/delete/refund) |
| **`PARTNER`** (Reseller) | Partner Tenant Scope | View/manage own buyer customer relationships, submit tickets for buyers, reply, resolve, or escalate to Platform NOC. | Access to other resellers' data, internal staff notes |
| **`CUSTOMER` / Guest** | Own Ticket Scope | Submit tickets, verify ownership by ticket reference + email, view public replies, post follow-ups. | Administrative actions, internal notes, other buyers |

---

## 🌟 Key Highlights & Modern Capabilities

### 1. Production Role-Based Support Ticketing System
- **Universal Public Entry Point**:
  - Accessible via header navigation and footer across all applicable public pages (`partners.html`, and dynamic service pages via `dynamic-services.js`).
  - Strict exclusion rule: Not rendered on the 3D WebGL homepage root layers (`#`, `#a`, `#b`, `#c`) or the introductory page (`Fly into the future.html`).
  - **Zero-Flash Architecture**: Styles are imported upfront in `assets/css/main.css`, and modal construction is deferred lazily with inline `display: none` guards, preventing any glimpse of the form upon refreshing the homepage.
  - **Cart-Aware Visibility & Dynamic Hiding**: Whenever the cart drawer (`#cart.on`) or the header flyout dropdown (`#hdr-cart-dropdown.open`) is open, the floating support ticket trigger automatically hides (`opacity: 0`, `visibility: hidden`, `pointer-events: none`) so it never obscures "Proceed to Checkout" or drawer controls. It smoothly reappears once the cart is closed.
- **Interactive Ticket Submission Experience**:
  - Validates subject, category, priority, related services/orders, contact preferences, and detailed descriptions.
  - Generates unique human-readable ticket numbers (`TCK-YYYY-XXXXX`).
  - Dynamic SLA computation: Critical (2h), High (4h), Normal (12h), Low (24h).
  - Secure file attachment handling: Max 10MB, extension whitelist (`png`, `jpg`, `pdf`, `txt`, `log`, `zip`), blocking dangerous executables.
  - Secure guest lookup requiring both `ticket_number` and verified `buyer_email` to eliminate Insecure Direct Object References (IDOR).
- **Reseller-to-Buyer Support Desk (`partner-dashboard.html`)**:
  - Resellers can view their associated buyers, submit tickets on behalf of buyers, reply, request details, and resolve issues.
  - Built-in **Platform NOC Escalation**: Resellers can escalate complex underlying infrastructure issues directly to administrative engineers.
  - Strict tenant isolation: Resellers are blocked with `403 Forbidden` if attempting to view or modify tickets owned by other partners.
- **Centralized Admin Support Workspace (`admin.html`)**:
  - 8 real database-backed KPI counters (Total, Unassigned, In-Progress, High/Critical, Waiting Buyer, Waiting Reseller, Escalated, Resolved).
  - Searchable, filterable, and paginated ticket queue with live status badges.
  - Complete ticket detail workspace: Staff dispatch/reassignment, priority modification, status transitions, NOC escalation toggling, and customer/service context.
  - **Private Internal Notes**: Platform engineers and support agents can post internal notes completely hidden from buyers and resellers.
  - Full audit event stream tracking actor, previous state, new state, and reason.

### 2. Universal Shopping Cart & Flyout Dropdown
- **Header Flyout Dropdown (`#hdr-cart-dropdown`)**:
  - Displays quick line-item list, selected options, live running total in BDT (`৳`), and a **standard trash bin icon**.
  - Clicking the trash bin icon (`.hcd-item-del`) immediately removes the item, syncs `localStorage`, recomputes the total, and shows an instant toast alert.
- **Slide-Out Full Drawer (`#cart`)**:
  - Interactive cart drawer positioned at elevated `z-index: 995` with item quantity modifiers (`-` / `+`), item deletion, and automated order email generation.
  - Body synchronization (`cart-drawer-open`, `cart-dropdown-open`) for dynamic coexistence with fixed UI triggers.
- **Catalog Integration**:
  - Seamlessly integrates with Domain Registration, Cloud VPS (`vps-matrix.js`), Dedicated Servers, Email Hosting, SSL, Storage, and Microsoft 365.

### 3. Business Email Hosting (`#p-email`) & Microsoft 365 (`#p-m365`)
- **Affordable Enterprise Email (`#p-email`)**:
  - **Basic Plan**: **BDT 100 Tk** / Month (BDT 1,200 Tk / Year) with 5 GB mailbox.
  - **Standard Plan**: BDT 250 Tk / Month (20 GB mailbox).
  - **Premium Plan**: BDT 300 Tk / Month (50 GB mailbox).
  - Features: ActiveSync mobile synchronization, AI anti-spam filtering, custom domain alignment (SPF, DKIM, DMARC), calendar service, and 30-day retention.
- **Microsoft 365 Cloud Suite (`#p-m365`)**:
  - **Microsoft 365 Business Basic**: **BDT 4,500 Tk** / Year.
  - Direct 1-click **Order Now** integration placing Exchange, Web & Mobile Office, and OneDrive 1TB straight into the Universal Cart drawer.

### 4. Centralized Admin Portal (`admin.html`)
- **Live Telemetry Dashboard**: Real-time stats calculated from SQLite (customers by status, active VMs across zones, MRR, invoices, open tickets, active sessions). Zero fabricated metrics.
- **Customer Account Management**: Search, filter, inspect details, linked compute instances, and billing history. Account suspension requires documented justification. Secure one-time password reset workflow without exposing passwords or hashes.
- **Cloud Infrastructure Management**: Multi-zone visibility across **Dhaka DC-01** (AMD EPYC & Intel Xeon KVM nodes, BDIX peering) and **Singapore SG-01** (Equinix SG1 peering). VM lifecycle operations (`START`, `STOP` with reason, `TERMINATE` with justification). NOC incident reporting and resolution workflow.
- **Billing & Financial Administration**: Live MRR, revenue totals, and unpaid balance calculations. Invoice listing and search. Refund approval requiring justification reason with immutable audit records.
- **Public Website CMS**: Manage homepage announcements/maintenance banners, configure cloud service plan specifications (vCPU, RAM, NVMe, BDT/USD pricing), and update page SEO metadata and promo coupons.
- **Security Monitoring & Session Revocation**: Append-only security event audit stream, 5-attempt brute-force protection with 15-minute lockouts, active session inspection with IP and client metadata, and immediate session token revocation.

### 5. Cloud Partner Program Platform
- **Automatic Spend-Based Tier Progression**:
  - **Registered Partner**: 5% wholesale margin (৳0 minimum spend)
  - **Silver Partner**: 10% wholesale margin (৳30,000 monthly spend)
  - **Gold Partner**: 15% wholesale margin (৳120,000 monthly spend)
  - **Platinum Partner**: 20% – 25% wholesale margin (৳360,000 monthly spend)
  - Upgrades trigger automatically as verified infrastructure sales are logged.
- **Mandatory PDF Document Verification**: Trade License and National ID (NID) mandatory PDF uploads enforced with client/server validation.
- **Custom Commercial Discounts**: Bespoke agreements granted by administrators synchronize instantly to partner dashboards.
- **Sales Reward Points Ledger**: 10% reward points earned on eligible cloud sales, with anti-abuse self-referral prevention and refund reversal safety.

### 6. Domain Registration & Search Engine
- High-performance domain search located in [domain-search.js](assets/js/modules/domain-search.js):
  - Provides real-time pricing and availability for top-level domains (`.com`, `.org`, `.ai`, `.to`, `.net`, `.io`, `.xyz`, `.tech`, `.online`, `.com.bd`).
  - Instant Dhaka Anycast DNS routing quotes and favorite bookmarking.
  - Direct integration with `window.UnifiedCart` for instant checkout.

### 7. 3D WebGL Flight Experience & Adaptive Performance
- **Cinematic 3D Hero Scene**: Volumetric raymarched cloud dive, server rack swoop, animated laptop, pulsating rack LEDs, and interactive cursor damping using Three.js r128 and Meshopt compression.
- **Hardware-Adaptive Tiers**: Automatically balances PCF soft shadows, draw calls, and particle density across Discrete, Integrated, and Low-End GPUs.
- **Battery-Saving Throttling**: Pauses frame rendering immediately when the browser tab is hidden (`document.hidden`).
- **Graceful Non-WebGL Fallback**: Fully operable without WebGL via the `runDomScrollDriver()` engine.

### 8. Agentic AI Module (`#p-agentic`)
A complete purchasing flow for AI agents, built into the existing Agentic AI service page. The page follows the same layout as the Business Email page: a `.dm` container (max 1180px) with a centered hero (`.dsec` with the `.dlab` badge, `.dh` headline and `.dp` paragraph) first, then the configurator steps. The static information cards were removed from the page data, so the configurator is shown directly. Backend: [`server/agentic-ai.mjs`](server/agentic-ai.mjs). Frontend: [`assets/js/modules/agentic-ai.js`](assets/js/modules/agentic-ai.js).

| Configuration | Development (one-time) | Server | Backup | RAG | Maintenance (optional) | Voice calling |
|---|---|---|---|---|---|---|
| Ready-Made AI Agent | ৳0 | ৳1,000 / month | ৳500 | ৳1 per character | ৳5,000 / month | ৳5 / minute |
| Customized / Branded AI Agent | ৳25,000 | ৳1,000 / month | ৳500 | ৳1 per character | ৳5,000 / month | ৳5 / minute |
| Chat-Only AI Agent | ৳20,000 | ৳1,000 / month | ৳500 | ৳1 per character | ৳5,000 / month | Not available (hidden and rejected by the server) |

All amounts are stored in the database (`agentic_pricing_config`, `agentic_configurations`) and editable in **Admin → Agentic AI**. A price change applies to new orders only; every order keeps a snapshot of the prices it was sold at.

- **Pricing summary** keeps one-time charges, recurring charges, usage-based charges and the two payment estimates (initial and recurring) separate. Initial payment = one-time charges + first month of recurring charges + RAG processing. Voice minutes are never charged in advance.
- **Backup billing interval is not assumed.** The ৳500 is displayed as its own line, and the interval (`one_time` or `monthly`) is a setting in Admin → Agentic AI. While it is unset, backup is shown but left out of both payment estimates and no backup subscription is created. Set it once the business rule is confirmed.
- **RAG billing.** Upload `.txt .md .csv .json .log .xml .yaml .yml` files (max 5 documents, 2 MB each, 2,000,000 characters per order) or paste text. Billable characters are the Unicode code points of the extracted text after NFC normalisation, so English, Bengali, digits, symbols, spaces, tabs and line breaks all count and nothing is trimmed (a leading byte-order mark is not text and is removed). File names and metadata are never billed, binary and non-UTF-8 files are rejected, and identical content in one order is billed once. The browser shows a live estimate; the server recounts from the uploaded text and ignores any client-supplied number. PDF and Word files are not parsed (the server has no runtime dependencies); paste their text instead.
- **Voice calling.** Selecting voice and the ৳5/minute rate work, and usage is tracked and billed after use. **No telephony provider exists in this repository, so live calls are not operational.** Call records are entered through `POST /api/admin/agentic/orders/:id/calling-usage` (a provider integration can call the same function) and are invoiced with the "Invoice call usage" action. Every started minute of a call is billed (`call_rounding` can be switched to exact seconds/60).
- **Checkout and activation.** `POST /api/public/agentic/orders` validates the request, recomputes every price, stores the order and creates the WHMCS order and invoice (idempotent per request). The customer is sent to the WHMCS invoice. The service becomes `ACTIVE` only when WHMCS reports the payment through the signed webhook `POST /api/webhooks/whmcs/agentic`. See [`docs/whmcs-agentic-hook.php`](docs/whmcs-agentic-hook.php) for the WHMCS side.
- **WHMCS mapping.** WHMCS product IDs come from the environment (`AGENTIC_WHMCS_PID_*`). No IDs are invented: with a live WHMCS connection, an unmapped product makes order creation fail with a clear billing error and nothing is charged. Development, RAG and one-time backup are added to the invoice as lines; server, maintenance and monthly backup form the recurring amount. Without WHMCS credentials the adapter runs in its existing sandbox mode (no real invoices, no payment page).
- **Customer tracking.** There is no customer login in this application, so customers track an order from the same page with the order reference and email (same model as support-ticket lookup, with failed-lookup throttling): status, features, charges, RAG documents and costs, call usage, invoices, payments and renewal dates. Document text is never returned.
- **Admin.** Orders, pricing, RAG and call usage, subscriptions, invoice and payment references, suspend/activate (activation is refused without a verified payment) and an audit trail. Permissions: `agentic:read` (Finance, Support, Auditor) and `agentic:manage` (Finance, Super Admin).


---

## 🛠️ Getting Started & Local Development

### 1. Install & Launch Platform Server
```bash
git clone https://github.com/istiakahasan/Unified-IT_Website.git
cd Unified-IT_Website
npm ci          # dev tooling only (vite, playwright-core); the server itself has no runtime dependencies
npm start       # or: node scripts/serve.js 4000   (custom port)
```
Starts the Node.js server and SQLite backend on `http://localhost:3000`.

`npm run dev` starts the Vite dev server for the static pages only. The `/api/*` routes, `/partners` and `/admin` need `npm start`.

- **Public Website:** [http://localhost:3000/](http://localhost:3000/)
- **Centralized Admin Portal:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Partner Dashboard:** [http://localhost:3000/partner/dashboard](http://localhost:3000/partner/dashboard)
- **Partner Application Page:** [http://localhost:3000/partners](http://localhost:3000/partners)
- **Partner Desk & Agreements:** [http://localhost:3000/admin/partners](http://localhost:3000/admin/partners)

### 2. Pre-Seeded Development Admin Credentials

> ⚠️ **Local development only.** These passwords are public. When `NODE_ENV=production`, the server automatically replaces them with random passwords at startup, and the fast-fill buttons are hidden on any host other than `localhost`. For production, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (12+ characters) to create the first Super Admin.

| Role | Email | Password | Scope |
| :--- | :--- | :--- | :--- |
| **Super Administrator** | `superadmin@unified.cloud` | `SuperAdmin2026!` | Full platform control (`*`) |
| **Security Administrator** | `security@unified.cloud` | `SecurityAdmin2026!` | Security telemetry & session revocation |
| **Infrastructure Administrator** | `infra@unified.cloud` | `InfraAdmin2026!` | CloudStack VMs & NOC incidents |
| **Finance Administrator** | `finance@unified.cloud` | `FinanceAdmin2026!` | Billing, invoices & refund approvals |
| **Support Administrator** | `support@unified.cloud` | `SupportAdmin2026!` | Support ticket desk, triage & internal notes |
| **Compliance Auditor** | `auditor@unified.cloud` | `AuditorAdmin2026!` | Read-only compliance access |

*(You can also click any of the 1-click **Fast-Fill Role** buttons on the admin login card to authenticate instantly).*

### 3. Quality Checks & Automated Test Suites
```bash
npm run lint        # syntax check of every first-party .js/.mjs file (no TypeScript/ESLint in this project)
npm audit           # dependency advisories
npm run build       # production build into dist/

# Run all unit/integration suites (180 tests)
npm run test:all

# HTTP security regression suite only (42 tests)
npm run test:security

# Browser navigation, animation & CSP regression tests (10 tests).
# Uses an installed Chrome/Edge; set CHROME_PATH if it is not auto-detected. Skipped when none is found.
# e.g. CHROME_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" npm run test:e2e
# Other engines (one-time download of the Playwright builds):
#   npx playwright-core install firefox webkit
#   BROWSER=firefox npm run test:e2e
#   BROWSER=webkit  npm run test:e2e      # Safari's engine
npm run test:e2e

# Run Agentic AI module test suite only (32 tests)
npm run test:agentic

# Run Support Ticketing System test suite only (26 tests)
node --test tests/support-ticketing.test.mjs

# Run Admin Portal test suite only (33 tests)
npm run test:admin

# Run Partner Program test suite only (33 tests)
npm test
```

---

## 🚀 Production Deployment & Containers

### 1. Docker Compose (Recommended)
```bash
# Copy and configure environment variables
cp .env.production.example .env.production

# Start containerized stack (Node 22 app + nginx proxy)
docker compose up -d
```

Pushing to GitHub does **not** deploy. The only workflow in `.github/workflows/` refreshes SSL prices. To roll back, redeploy the previous commit (`git checkout <sha> && docker compose up -d`). No database migration is involved.

### Environment Variables

Names only; never commit real values. See `.env.production.example` for the full list.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `production` enables the demo-credential lockout and the `Secure` session cookie |
| `PORT` | HTTP port (default 3000) |
| `PUBLIC_DOMAIN`, `WWW_DOMAIN`, `ADMIN_DOMAIN`, `PARTNER_DOMAIN`, `API_DOMAIN` | Subdomain routing; also the CORS and CSRF allow-list |
| `CORS_ALLOWED_ORIGINS` | Extra comma-separated origins allowed to call the API with credentials |
| `TRUST_PROXY` | `1` only behind the bundled nginx/Caddy: rate limiting then uses the proxy's `X-Real-IP` |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | Create the first production Super Admin (only if that email does not exist yet) |
| `BOOTSTRAP_ADMIN_RESET` | `1` re-keys an existing bootstrap admin to `BOOTSTRAP_ADMIN_PASSWORD` on start |
| `ALLOW_DEMO_CREDENTIALS` | `1` keeps the public demo passwords in production (disposable demos only) |
| `COOKIE_SECURE` | Force (`true`) or disable (`false`) the `Secure` cookie flag |
| `COOKIE_SAME_SITE`, `COOKIE_DOMAIN` | Session cookie `SameSite` (`Strict`/`Lax`/`None`, default `Lax`) and optional shared `Domain` |
| `PARTNER_DB_PATH` | SQLite file (default `data/partner-system.db`) |
| `CSP_REPORT_ONLY` | `1` sends the Content-Security-Policy as report-only (rollout aid) |
| `WHMCS_API_*`, `CLOUDSTACK_*`, `BKASH_*`, `NAGAD_*`, `SSLCOMMERZ_*` | Integration credentials |
| `AGENTIC_WEBHOOK_SECRET` | Shared secret that signs WHMCS payment notifications for Agentic AI (HMAC-SHA256). Required: without it the webhook answers 503 and nothing can be activated |
| `AGENTIC_WHMCS_PID_READY_MADE`, `AGENTIC_WHMCS_PID_CUSTOM_BRANDED`, `AGENTIC_WHMCS_PID_CHAT_ONLY` | WHMCS product IDs for the three configurations (live billing refuses to create an order if the product is not mapped) |
| `AGENTIC_WHMCS_ADDON_MAINTENANCE`, `AGENTIC_WHMCS_ADDON_BACKUP`, `AGENTIC_WHMCS_PAYMENT_METHOD`, `WHMCS_CLIENT_AREA_URL` | Optional WHMCS addon IDs, the payment gateway module name, and the client-area base URL used for the checkout link |
| `AGENTIC_TELEPHONY_PROVIDER` | Label of the telephony provider that supplies call records (informational; see the Agentic AI section) |

### 2. Nginx Reverse Proxy
Deploy [`nginx/unified-cloud.conf`](nginx/unified-cloud.conf) into `/etc/nginx/conf.d/unified-cloud.conf`.  
Configured with HTTP/2, Let's Encrypt certificates, strict rate limiting, HSTS, CSP, and canonical 301 redirects.

### 3. Caddy 2 Reverse Proxy (Automated TLS)
Deploy [`caddy/Caddyfile`](caddy/Caddyfile) for zero-config automated Let's Encrypt / ZeroSSL TLS certificates and zstd compression.

---

## 🧭 Navigation & Animation Notes

- `index.html` hosts every public "page" as a full-screen overlay. Navigation is **hash-based** (`#p-cloud`, `#p-email`, `#vps`, `#about`, …), so page changes are instant cross-fades without reloads, and back/forward work through the browser's hash history. Partner (`/partners`), admin and dashboard pages are separate HTML documents served by the Node server.
- Header and footer links keep their real `https://unified.it.com/...` URLs as a no-JavaScript fallback. Capture-phase click handlers in `dynamic-services.js` / `header-nav.js` turn them into hashes.
- The header becomes clickable once you scroll past the hero intro (or whenever an overlay is open). Below 820 px it collapses into the ☰ menu.
- WebGL effects: the hero scene, service slides and the service-page particle field start at page load. The About, VPS and Dedicated Server particle scenes are created the first time those overlays open, keeping the browser well under its WebGL context limit. Without WebGL, a DOM fallback drives the same scroll animations.
- Details: [`architecture.md`](architecture.md) §10 (navigation) and §11 (animation & WebGL lifecycle).

## 🔐 Security Practices

- The server only serves the public HTML pages and `assets/`. The database, attachments, source code, tests and dotfiles are never reachable over HTTP.
- CORS is limited to the configured domains. Cookie-authenticated write requests must come from an allowed origin (CSRF protection).
- Malformed URLs or cookies cannot crash the server. Request bodies are capped at 15 MB.
- Uploaded attachments are typed by extension (never by the client), served with a sandboxing CSP, and downloaded only through the authorised API endpoint.
- The public demo passwords are disabled automatically in production.
- Every HTML page is served with a Content-Security-Policy: only script **files** from this site may run (no inline `<script>`, no `onclick=`, no `javascript:` links, no `eval`), WebAssembly allowed for the 3D model decoder, no plugins, no framing by other sites. All third-party libraries are vendored, so the pages make no runtime CDN requests.
- Passwords are hashed with PBKDF2-SHA256 at 600,000 iterations on a background thread (never blocking the server). Older hashes are upgraded on the next successful login.
- Run `npm audit` and `npm run test:security` before releases. See [`CHANGES.md`](CHANGES.md) §3 for the full audit, and §12 for the follow-up hardening. §13 for the strict script policy.

## ⚡ Performance Considerations

- Overlay WebGL renderers are created on demand (9 → 4 contexts at page load) without changing any visual.
- HTML/JS/CSS are served with `ETag` + `Cache-Control: no-cache`: browsers revalidate and get `304` instead of re-downloading three.js (603 KB) and every module on each visit, while new deployments still show up immediately.
- The hero adapts render resolution and shadow quality to the GPU tier (`webgl-perf.js`) and pauses while the tab is hidden.

## 🩺 Troubleshooting

| Symptom | Likely cause & fix |
|---|---|
| The page freezes when you open a second menu option | Fixed in this release (self-triggering `MutationObserver` in `support-ticket.js`). Hard-refresh (Ctrl+F5) to drop a cached old script. Never write unconditionally to an attribute your own `MutationObserver` watches. |
| Header links do nothing at the top of the homepage | Intended: the header becomes clickable after you scroll past the intro (`#hdr` has `pointer-events:none` until then). |
| No menu on a phone | Fixed (`.burger` CSS order in `assets/css/header.css`). Check that the deployed CSS is current. |
| Every page suddenly fails to load / the server stopped | Check the server log. Before this release a single malformed URL crashed Node. Upgrade, and run under a supervisor (`restart: always` in Docker). |
| `/partners` or `/admin` returns 404 | You are serving `dist/` or the repo with a static server. Use `npm start` (the routes live in `server/server.mjs`), or rebuild with `npm run build`, which now includes all pages. |
| Server fails at start with `No such built-in module: node:sqlite` | Node is older than 22.5. Upgrade, and use the `node:22-alpine` image. |
| API calls from another site get blocked | CORS and CSRF only allow the configured domains. Add the origin to `CORS_ALLOWED_ORIGINS` if it is legitimate. |
| Admin login fails in production with the README passwords | Intended. Set `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` and restart. |
| A new inline `<script>`, `onclick="…"` or external library does nothing (console: "Refused to execute…" / "Refused to load…") | The Content-Security-Policy (`buildContentSecurityPolicy` in `server/server.mjs`) only runs script files from this site. Put page code in `assets/js/pages/`, write handlers as `data-onclick="myFunction('arg', 1)"` (a plain call to a global function with literal arguments, run by `assets/js/csp-handlers.js`), and vendor libraries into `assets/js/vendor/`. `CSP_REPORT_ONLY=1` helps you test. `npm run test:all` fails if inline script is reintroduced. |
| A `data-onclick` button does nothing; console shows `[csp-handlers] Unsupported handler` or `Handler function not found` | The attribute must be one plain call like `fn('a', 2, true, event)`, and `fn` must be a global (`function fn…` in a classic script, or `window.fn = …`). Expressions, multiple statements or variables as arguments are rejected on purpose. |
| Menu links change the URL but no page appears (browser without WebGL) | Fixed: the service pages are now built even when WebGL is unavailable (`dynamic-services.js`). |
| Services gallery has no pulse or burst effect / console says "Missing libraries: anime" | `assets/js/vendor/anime.umd.min.js` is missing from the deployment (it was previously loaded from a CDN URL that returned 404). |
| Login takes about half a second | Expected: passwords use 600,000 PBKDF2 iterations, computed off the main thread so other requests are unaffected. |
| 3D scene missing / flat background | WebGL is unavailable or the context was lost. The DOM fallback keeps navigation working; check `chrome://gpu`. |
