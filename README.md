# Unified Cloud: Fly into the Future 🚀

An enterprise cloud infrastructure platform featuring an interactive 3D WebGL flight journey, real-time latency telemetry, modular service catalogues and calculators, a Dhaka Anycast domain search engine, a complete **Cloud Partner Program Platform**, and a dedicated **Centralized Admin Portal** on an isolated subdomain architecture.

---

## 📁 Project Architecture & Directory Structure

```text
unified-it/
├── index.html                          # Public Cloud Website: 3D hero journey, domain search & cloud catalog
├── Fly into the future.html            # Legacy alias redirecting to index.html
├── admin.html                          # Standalone Centralized Admin Portal SPA (RBAC, NOC, CMS, Billing)
├── partners.html                       # Public Cloud Partner Program landing & application portal
├── partner-dashboard.html              # Authenticated Partner Portal (margins, tier roadmap, client isolation)
├── admin-partners.html                 # Partner Desk Control Center (apps, automated directory, rewards)
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
│   ├── api.mjs                         # REST API router: authentication, RBAC guards, cloud, billing, CMS
│   ├── auth.mjs                        # SessionStore with revocation, brute-force lockout, RBAC matrix
│   ├── pricing-engine.mjs              # Multi-tier wholesale pricing engine & automated tier progression
│   ├── reward-service.mjs              # Sales-based reward points engine, ledger & refund handling
│   ├── whmcs-adapter.mjs               # WHMCS enterprise billing, invoice lifecycle & refund approvals
│   └── cloudstack-adapter.mjs          # Apache CloudStack multi-zone VM provisioning & NOC incident engine
├── tests/
│   ├── admin-portal.test.mjs           # Enterprise Admin Portal automated test suite (33 tests)
│   └── partner-system.test.mjs         # Production Partner Program test suite (33 tests)
├── scripts/
│   ├── serve.js                        # `npm start` entrypoint (port 3000)
│   ├── update-digicert-prices.mjs      # Digicert list price scraper & currency converter
│   ├── update-comodo-prices.mjs        # Comodo/Sectigo list price scraper
│   └── fixtures/                       # Test fixtures for price parsers
├── docs/
│   └── ARCHITECTURE.md                 # System load order, data flow, globals, and design patterns
└── assets/
    ├── css/                            # Modular CSS architecture imported by main.css
    ├── js/                             # Interactive controllers, catalog engines, WebGL shaders
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

Implemented in [`server/auth.mjs`](file:///e:/Projects/unified-it/server/auth.mjs) and enforced by default across all administrative endpoints:

| Role | Operational Scope | Permitted Endpoints & Actions | Denied Actions |
| :--- | :--- | :--- | :--- |
| **`SUPER_ADMIN`** | Full Platform Authorization | Unrestricted access to all modules (`*`), role assignment, system configurations. | None |
| **`SECURITY_ADMIN`** | Security, Telemetry & Access | View security audit stream, inspect active sessions, revoke session tokens, manage admin roles. | Cloud VM lifecycle, financial refunds |
| **`INFRASTRUCTURE_ADMIN`** | CloudStack & Datacenter Ops | Inspect Dhaka & Singapore zones, VM lifecycle (start/stop/terminate), log & resolve NOC incidents. | Financial refunds, partner commissions |
| **`FINANCE_ADMIN`** | Billing, Invoices & Payouts | Review gross revenue, MRR, invoices, approve refunds with justification, payment gateways. | Modifying cloud VM state, user role changes |
| **`PARTNER_MANAGER`** | Partner Desk & Agreements | Approve/reject partner applications, manage partner tiers, custom discount agreements, sales rewards. | Modifying customer accounts, VM termination |
| **`SUPPORT_ADMIN`** | Customer Support Helpdesk | View support queue, reply to tickets, change ticket priority, trigger customer password resets. | Approving refunds, modifying infrastructure |
| **`CONTENT_ADMIN`** | Public Website CMS | Manage announcements/banners, cloud service plans & pricing, SEO metadata, promo coupons. | Access to customer/partner accounts, security logs |
| **`AUDITOR`** | Compliance & Audit | Read-only compliance access to audit logs, security events, customer records, billing, and telemetry. | **All state-changing actions** (write/delete/refund) |

---

## 🌟 Key Highlights & Modern Capabilities

### 1. Centralized Admin Portal (`admin.html`)
- **Live Telemetry Dashboard**: Real-time stats calculated from SQLite (customers by status, active VMs across zones, MRR, invoices, open tickets, active sessions). Zero fabricated metrics.
- **Customer Account Management**: Search, filter, inspect details, linked compute instances, and billing history. Account suspension requires documented justification. Secure one-time password reset workflow without exposing passwords or hashes.
- **Cloud Infrastructure Management**: Multi-zone visibility across **Dhaka DC-01** (AMD EPYC & Intel Xeon KVM nodes, BDIX peering) and **Singapore SG-01** (Equinix SG1 peering). VM lifecycle operations (`START`, `STOP` with reason, `TERMINATE` with justification). NOC incident reporting and resolution workflow.
- **Billing & Financial Administration**: Live MRR, revenue totals, and unpaid balance calculations. Invoice listing and search. Refund approval requiring justification reason with immutable audit records.
- **Support Ticket Queue**: Threaded discussion triage, priority management (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), and staff reply dispatching.
- **Public Website CMS**: Manage homepage announcements/maintenance banners, configure cloud service plan specifications (vCPU, RAM, NVMe, BDT/USD pricing), and update page SEO metadata and promo coupons.
- **Security Monitoring & Session Revocation**: Append-only security event audit stream, 5-attempt brute-force protection with 15-minute lockouts, active session inspection with IP and client metadata, and immediate session token revocation.

### 2. Cloud Partner Program Platform
- **Automatic Spend-Based Tier Progression**:
  - **Registered Partner**: 5% wholesale margin (৳0 minimum spend)
  - **Silver Partner**: 10% wholesale margin (৳30,000 monthly spend)
  - **Gold Partner**: 15% wholesale margin (৳120,000 monthly spend)
  - **Platinum Partner**: 20% – 25% wholesale margin (৳360,000 monthly spend)
  - Upgrades trigger automatically as verified infrastructure sales are logged.
- **Mandatory PDF Document Verification**: Trade License and National ID (NID) mandatory PDF uploads enforced with client/server validation.
- **Custom Commercial Discounts**: Bespoke agreements granted by administrators synchronize instantly to partner dashboards.
- **Sales Reward Points Ledger**: 10% reward points earned on eligible cloud sales, with anti-abuse self-referral prevention and refund reversal safety.

### 3. Domain Registration & Search Engine
- High-performance domain search located in [domain-search.js](file:///e:/Projects/unified-it/assets/js/modules/domain-search.js):
  - Provides real-time pricing and availability for top-level domains (`.com`, `.org`, `.ai`, `.to`, `.net`, `.io`, `.xyz`, `.tech`, `.online`, `.com.bd`).
  - Instant Dhaka Anycast DNS routing quotes and favorite bookmarking.
  - Direct integration with `window.UnifiedCart` for instant checkout.

### 4. 3D WebGL Flight Experience & Adaptive Performance
- **Cinematic 3D Hero Scene**: Volumetric raymarched cloud dive, server rack swoop, animated laptop, pulsating rack LEDs, and interactive cursor damping using Three.js r128 and Meshopt compression.
- **Hardware-Adaptive Tiers**: Automatically balances PCF soft shadows, draw calls, and particle density across Discrete, Integrated, and Low-End GPUs.
- **Battery-Saving Throttling**: Pauses frame rendering immediately when the browser tab is hidden (`document.hidden`).
- **Graceful Non-WebGL Fallback**: Fully operable without WebGL via the `runDomScrollDriver()` engine.

---

## 🛠️ Getting Started & Local Development

### 1. Launch Platform Server
```bash
npm start
```
Starts the Node.js server and SQLite backend on `http://localhost:3000`.

- **Public Website:** [http://localhost:3000/](http://localhost:3000/)
- **Centralized Admin Portal:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Partner Dashboard:** [http://localhost:3000/partner/dashboard](http://localhost:3000/partner/dashboard)
- **Partner Application Page:** [http://localhost:3000/partners](http://localhost:3000/partners)
- **Partner Desk & Agreements:** [http://localhost:3000/admin/partners](http://localhost:3000/admin/partners)

### 2. Pre-Seeded Development Admin Credentials

| Role | Email | Password | Scope |
| :--- | :--- | :--- | :--- |
| **Super Administrator** | `superadmin@unified.cloud` | `SuperAdmin2026!` | Full platform control (`*`) |
| **Security Administrator** | `security@unified.cloud` | `SecurityAdmin2026!` | Security telemetry & session revocation |
| **Infrastructure Administrator** | `infra@unified.cloud` | `InfraAdmin2026!` | CloudStack VMs & NOC incidents |
| **Finance Administrator** | `finance@unified.cloud` | `FinanceAdmin2026!` | Billing, invoices & refund approvals |
| **Support Administrator** | `support@unified.cloud` | `SupportAdmin2026!` | Support ticket desk & password resets |
| **Compliance Auditor** | `auditor@unified.cloud` | `AuditorAdmin2026!` | Read-only compliance access |

*(You can also click any of the 1-click **Fast-Fill Role** buttons on the admin login card to authenticate instantly).*

### 3. Run Automated Test Suites
```bash
# Run all test suites (66 tests across 17 suites)
npm run test:all

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

# Start containerized stack
docker compose up -d
```

### 2. Nginx Reverse Proxy
Deploy [`nginx/unified-cloud.conf`](file:///e:/Projects/unified-it/nginx/unified-cloud.conf) into `/etc/nginx/conf.d/unified-cloud.conf`.  
Configured with HTTP/2, Let's Encrypt certificates, strict rate limiting, HSTS, CSP, and canonical 301 redirects.

### 3. Caddy 2 Reverse Proxy (Automated TLS)
Deploy [`caddy/Caddyfile`](file:///e:/Projects/unified-it/caddy/Caddyfile) for zero-config automated Let's Encrypt / ZeroSSL TLS certificates and zstd compression.
