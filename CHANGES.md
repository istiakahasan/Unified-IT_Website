# CHANGES — Agentic AI restructured into four options with separate workflows

**Date:** 2026-11-05
**Scope:** the Agentic AI service only. The existing visual identity (palette, typography, header, footer, animations, other pages) is unchanged; the new pages reuse the existing page shell, `.dm`/`.dsec` hero, `.vc` cards, `.cxr` option cards and `.vb` buttons.

## What changed

The single Agentic AI configurator was replaced by a hub and four independent pages, each with its own form, ordering process and order category:

| Option | URL | Workflow |
|---|---|---|
| Ready-Made AI | `#p-agentic-ready` | Product catalog (admin-managed), comparison, options, fixed-price WHMCS order |
| Customized Agentic AI | `#p-agentic-custom` | Requirements form, review, quotation, WHMCS invoice, verified payment, development |
| Branded Agentic AI | `#p-agentic-branded` | Brand requirements and assets, then the same quotation workflow, stored as a separate category |
| Chat-Only AI | `#p-agentic-chat` | Chatbot configuration, fixed-price WHMCS order, no voice |

The old fixed-price "Customized / Branded" configuration (৳25,000) no longer exists as a purchasable option: Customized and Branded are quoted individually. Its database row is kept inactive for historical orders.

## New files
- `server/agentic-forms.mjs`: form specifications and server-side validation shared by the API and the browser forms.
- `server/agentic-requests.mjs`: quotation workflow (requests, files, status machine, quotations, payment verification, webhook handling for quotation invoices).
- `server/mailer.mjs`: SMTP client and the persistent email outbox.
- `assets/js/modules/agentic-common.js`, `agentic-checkout.js`, `agentic-requests.js`, `agentic-tracker.js`: shared helpers, Ready-Made/Chat-Only pages, Customized/Branded pages, tracker.
- `tests/agentic-requests.test.mjs` (26 tests) and `tests/e2e/agentic.e2e.mjs` (18 browser tests).

## Removed files
- `assets/js/modules/agentic-ai.js` (replaced by the four modules above).

## Modified files
- `server/agentic-ai.mjs`: products table and seed, `product_code` and `requirements_json` on orders (with `ALTER TABLE` upgrade), product fees in the quote, requirement validation, business-inbox notification on every order, product admin functions, `CUSTOM_BRANDED` deactivated, catalog now returns products and form specifications.
- `server/api.mjs`, `server/db.mjs`: new public and admin routes, schema initialisation.
- `assets/js/data/service-pages.js`: hub page and four subpage keys. `assets/js/modules/dynamic-services.js`: footer taglines for the new pages. `assets/js/modules/service-modal.js`: the plan pop-up now skips `.agx-hub` (it swallowed the hub card links). `index.html`: new scripts.
- `assets/css/agentic-ai.css` (rewritten for the new pages), `admin.html`, `assets/js/pages/admin.js` (custom requests, products, outbox).
- `tests/agentic-ai.test.mjs` (updated to the new rules), `package.json` (`test:agentic`, `test:e2e`), `.env.example`, `.env.production.example`, `docker-compose.yml`, README, architecture.md, this file.

## Database changes
New tables: `agentic_products`, `agentic_requests`, `agentic_request_files`, `agentic_quotations`, `agentic_request_payments`, `agentic_request_events`, `agentic_email_outbox`. New columns on `agentic_orders`: `product_code`, `requirements_json`. Existing databases are upgraded when the server starts.

## New API
Public: `POST /api/public/agentic/requests`, `GET /api/public/agentic/track`, `POST /api/public/agentic/requests/:ref/respond`, `POST /api/public/agentic/requests/:ref/payment`. Admin: requests list, detail, file download, status, note, quotation save and send, payment verify and reject; products list, create, update; email outbox list and resend. The webhook now also settles quotation invoices. Full table in architecture.md section 13a.

## New environment variables
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `AGENTIC_NOTIFY_EMAIL` (documented in `.env.example`, passed through `docker-compose.yml`). Nothing is hard-coded.

## Testing
- `npm run lint`: 65/65 files parse.
- Unit and integration suites: 243 tests pass (`npm run test:all`), including 33 + 26 Agentic AI tests. They cover validation of every field type, idempotent submission, per-email rate limit, upload checks, category separation, the full status path, forbidden transitions, quotation versions and expiry, WHMCS invoice creation and signed-webhook approval (amount mismatch flagged, duplicates ignored), manual payment verification (amount must cover the quote), customer isolation and lookup throttling, admin permissions, product management, Chat-Only requirements, and real SMTP delivery against a local test server (including outbox retry and header-injection protection).
- Browser tests (`npm run test:e2e`, Chrome): 28 pass (10 existing + 18 new). They cover the hub, opening each option from the hub, direct URL, refresh and Back for all four pages, a 390px phone layout without horizontal scroll, the Ready-Made, Chat-Only, Customized and Branded workflows end to end, the Customized quotation through payment verification, and the admin UI (review, quotation, payment verification, product management).
- `npm run build` succeeds.

## Known limitations
- **WHMCS live mode is untested** (no WHMCS server was available). The live calls follow the WHMCS API and run in sandbox mode here. Before go-live: create the Ready-Made and Chat-Only products, set `AGENTIC_WHMCS_PID_*`, `AGENTIC_WHMCS_PAYMENT_METHOD` and `AGENTIC_WEBHOOK_SECRET`, install `docs/whmcs-agentic-hook.php` (a sample) and test an invoice end to end.
- **SMTP delivery is tested against a local test server**, not a real provider. Configure `SMTP_*`, `MAIL_FROM` and `AGENTIC_NOTIFY_EMAIL`; until then messages wait in the outbox.
- **Voice calling is not operational:** no telephony provider exists in the repository. Usage can be recorded and billed.
- **Agent deployment is not automated.** An approved or active order records the status; building and deploying the agent is a manual or external step.
- **Backup billing interval** is intentionally unset until you choose `one_time` or `monthly` in Admin → Agentic AI.
- **No customer login exists**, so tracking uses a reference plus the email.
- **RAG files** are plain text only (no PDF or Word parser).
- Customer-facing quotation emails contain the payment instructions you write; no payment credentials are generated or stored by this code.
- The three seeded Ready-Made solutions are starter content taken from the page's earlier descriptions, with no extra fees; edit them in the admin panel.


---

# CHANGES — Agentic AI page layout aligned with Business Email

**Date:** 2026-11-05
**Scope:** presentation of `#p-agentic` only. Pricing, RAG counting, WHMCS checkout, API and database are unchanged.

- `assets/js/modules/agentic-ai.js`: `#agx` content is wrapped in `<div class="dm">` and starts with the Business Email style hero (`.dsec` / `.dlab` "Agentic AI & Automation" / `.dh` "Build and deploy your AI agent" / `.dp`). `#agx` is inserted before any `.vg` cards so the hero is the first thing on the page. Rebased onto `main`, which had already removed the static cards and reformatted the module; those changes were kept. The unreachable-service fallback uses the same hero. All event handlers, server-authoritative pricing, RAG counting and order submission are untouched.
- `assets/css/agentic-ai.css`: `.pg #agx` is `max-width:1180px`, centered, 16px padding; hero styles scoped to `#agx` (the email page's equivalents are scoped to `#pg-email` only); 24px grid gaps; 34px step spacing; configuration and option cards use rounded 18px borders with the `--a1`/`--a2` glow when selected.
- Fixed while verifying in the browser: the site-wide `.pg label` rule uppercased all card text, so card labels reset `text-transform`; a later `.agx-grid` rule was overriding the new 24px gap.
- Fixed an intermittent bug found by the test suite: the sandbox WHMCS adapter used random invoice numbers, so two orders could occasionally receive the same number and the second order's invoice row was silently dropped (`INSERT OR IGNORE`). Sandbox invoice numbers are now sequential and unique, and the invoice insert fails loudly (the order goes to `BILLING_ERROR`) instead of ignoring conflicts.
- Verified: `node scripts/check-syntax.mjs` (57/57 files), `npm test` and `node --test tests/agentic-ai.test.mjs`, the full suite, and a real-browser run (hero, card selection, voice hidden for Chat-Only, order placement and tracking, no console or CSP errors, no horizontal overflow at 390px).

---

# CHANGES — Agentic AI module (WHMCS purchasing, RAG billing, usage, admin)

**Date:** 2026-11-05
**Scope:** Agentic AI only (no Offline AI, ERP Analyzer or Custom Request). Existing images, layout, colours, typography and navigation were not changed. The new section is injected into the existing `#pg-agentic` page and reuses its card/radio styles.

## What was added

- **Backend** `server/agentic-ai.mjs`: pricing, three configurations, RAG character counting, order creation, WHMCS hand-off, verified payment activation, call usage and usage invoicing, read models, audit log.
- **Database**: ten `agentic_*` tables with foreign keys, `CHECK` constraints and unique indexes for duplicate protection (created idempotently by `initAgenticSchema`, so existing databases upgrade on start).
- **API** (`server/api.mjs`): public catalog, quote, order, lookup, signed WHMCS webhook; admin overview, orders, pricing, subscriptions, usage and service actions.
- **WHMCS adapter**: `createAgenticOrder`, `getInvoice`, `createUsageInvoice`, `getInvoiceUrl` (and a sandbox `CreateInvoice`).
- **RBAC**: new `agentic:read` / `agentic:manage` permissions.
- **Server**: `server.mjs` passes the raw request body to the API layer so webhook signatures can be verified.
- **Frontend**: `assets/js/modules/agentic-ai.js` and `assets/css/agentic-ai.css` (configurator, live pricing summary, RAG upload, order tracking). Admin: new **Agentic AI** view in `admin.html` / `assets/js/pages/admin.js`.
- **Tests**: `tests/agentic-ai.test.mjs` (32 tests). Whole suite: 213 tests pass; `npm run lint` passes.
- **Config and docs**: `.env.example`, `.env.production.example`, `docker-compose.yml` (new variables), `docs/whmcs-agentic-hook.php`, README, architecture.md, this file.

## Decisions made without confirmation (change them in Admin → Agentic AI or in code)

1. **Backup billing interval is unset by default.** The brief did not say whether ৳500 is one-time or recurring, so it is displayed but excluded from the payment estimates until an admin sets `one_time` or `monthly`.
2. **RAG is billed on the initial invoice** using the characters actually processed (it is exact, not an estimate). Voice calling is billed after use through a separate usage invoice.
3. **Initial payment** = one-time charges + first month of recurring charges + RAG.
4. **Voice minutes**: every started minute of a call is billed (configurable to exact seconds).
5. **Customer access** is order reference + email, because the application has no customer login. A real customer session would be a separate piece of work.
6. **Supported RAG files** are plain-text formats only; PDF/Word are rejected because no parser dependency was added.

## Not verified / not done

- **Live WHMCS was not available.** The live path (`AddOrder`, `UpdateInvoice`, `GetInvoice`, `CreateInvoice`) follows the WHMCS API but has only been exercised in sandbox mode. Before go-live: create the three products, set `AGENTIC_WHMCS_PID_*`, `AGENTIC_WHMCS_PAYMENT_METHOD`, `AGENTIC_WEBHOOK_SECRET`, install `docs/whmcs-agentic-hook.php` (a sample, to be checked against your WHMCS version) and test one real invoice end to end. The adapter compares the WHMCS invoice total with the expected amount and refuses to proceed on a mismatch (for example tax settings).
- **Voice calling is not operational**: there is no telephony provider in the repository, so none was invented. Usage can be recorded and billed; placing calls needs a provider integration.
- **Agent provisioning is not automated.** Activation records the service as active and sets `provisioning_status = QUEUED`; deploying the actual agent is outside this repository.
- **No customer self-service dashboard exists** in the application, so customer management is the tracking panel on the Agentic AI page.

---

# CHANGES — Navigation freeze fix, security hardening and performance

**Date:** 2026-10-29
**Branch:** `fix/navigation-freeze-hardening` (based on `main` @ `e184364`)
**Scope:** public website navigation, Node.js server, admin login pages, build and deployment configuration.

All findings below were reproduced on the original code before changing anything. Each fix was then verified, either in a real Chrome browser (driven by Playwright) or with real HTTP requests against the running server. Assumptions and unverified items are listed separately at the end.

---

## 1. Original symptoms

- The first page opened from the header (for example **Cloud Service**) worked. The next option (for example **Email**) froze the whole tab. Nothing could be clicked and the animations stopped.
- Opening a deep link such as `/#p-cloud`, `/#vps` or `/#about` froze the page immediately.
- `/partners` froze on its first interaction.
- On phones there was no way to reach the header navigation.

## 2. Confirmed root causes

### 2.1 Navigation freeze: self-triggering `MutationObserver` (critical)

**File:** `assets/js/modules/support-ticket.js` (`setupPageEntryPoints` and `syncFloatingButtonWithCart`)

The floating **Support Tickets** button hides itself while the cart is open. To do that, the module observed `class` changes on *every element* in `<body>` (`subtree: true`). On every change it called `trigger.classList.add('cart-hidden')` or `.remove('cart-hidden')`.

Under the DOM specification, `classList.add/remove` always rewrite the `class` attribute, even when the token is already present or absent. Each call therefore queued a new mutation record on the button, which is itself inside the observed subtree. That re-ran the callback, forever, inside a single microtask checkpoint. The main thread never returned to the event loop: no clicks, no rendering, no `requestAnimationFrame`.

**Why the first page worked:** the observer is only attached on the first hash change that leaves the homepage. That happens *after* the clicked page's `body.pgo` class has been set. The next class change anywhere (the next navigation) started the loop. On `/partners` and on deep links, the button exists from page load, so the first class change froze the page.

**Evidence** (Chrome 1366×800, measuring whether the page can run script within 8 s of a click):

| Scenario | Original `main` | This branch |
|---|---|---|
| Cloud Service → Email | 2nd click: **unresponsive > 8 s** | 15 ms |
| Email → Cloud Service | 2nd click: **unresponsive > 8 s** | responsive |
| SSL → Domain | 2nd click: **unresponsive > 8 s** | responsive |
| 9 header navigations in a row | froze at #2 | all 9 within 8–28 ms |
| `/partners`, then any class change | **unresponsive > 8 s** | responsive |
| Deep links `/#about`, `/#vps`, `/#vds`, `/#p-cloud`, `/#p-email` | page froze; even a screenshot timed out | responsive |

**Fix:**
1. `syncFloatingButtonWithCart()` only writes to `classList` when the hidden state actually changes. A write that changes nothing no longer happens, so no mutation is queued.
2. The observer now watches only the two elements whose classes mean "cart open": `<body>` (`cart-drawer-open`) and `#cart` (`on`), without `subtree`. Before, it also fired for the header, slide panels and overlays, which change class on every animation frame.

The behavior is unchanged: the button still hides while the cart drawer is open and reappears when it closes.

### 2.2 Mobile navigation unreachable

**File:** `assets/css/header.css`

`@media(max-width:820px){.nv{display:none}.burger{display:inline-flex}}` appeared *before* the base rule `.burger{display:none}`. Both have the same specificity, so the later base rule always won. Below 820 px the desktop nav was hidden *and* the hamburger button was hidden, leaving phones with no header navigation.

**Fix:** a `max-width:820px` rule that shows `.burger` now follows the base rule. Verified in Chrome at 390×844: the button shows, the menu opens with its original styling, and choosing **SSL** opens `#p-ssl` and closes the menu.

### 2.3 One malformed request crashed the whole server (all pages then fail to load)

**Files:** `server/server.mjs`, `server/auth.mjs`

`decodeURIComponent()` ran on the request path (and on cookies) without error handling, inside an `async` request handler. `GET /%E0%A4%A` threw `URIError: URI malformed`, an unhandled rejection that terminates Node. After that every navigation and API call failed until someone restarted the server.

**Fix:** paths and cookies are decoded safely: a bad path returns `400` and a bad cookie value is kept raw. The whole request handler now runs inside a `.catch()` that answers `500` for that one request. Malformed HTTP is answered with `400` through the server's `clientError` hook.

## 3. Security audit

Severity uses a practical scale (Critical / High / Medium / Low). "Verified" means it was reproduced against the running server before the fix and re-tested after it.

| # | Severity | Finding | File(s) | Status |
|---|---|---|---|---|
| S1 | **Critical** | The static server served **any file in the repository**. `GET /data/partner-system.db` downloaded the whole SQLite database (users with password hashes, customers, invoices, tickets). `/.git/config`, `/server/*.mjs`, `/tests/*`, `/.env.example` and `/package.json` were also public, as were uploaded support attachments under `/data/attachments/`, bypassing the authorised download endpoint. | `server/server.mjs` | Verified, fixed |
| S2 | **Critical** | Seeded admin accounts use passwords published in `README.md` and in the login pages' "fast-fill" buttons (for example Super Admin). Seeding is unconditional, so a production deployment (`NODE_ENV=production` in `docker-compose.yml`) accepted them. | `server/db.mjs`, `admin.html`, `admin-partners.html` | Verified in code, fixed |
| S3 | High | Unauthenticated remote crash (denial of service) through a malformed URL or cookie (see 2.3). | `server/server.mjs`, `server/auth.mjs` | Verified, fixed |
| S4 | High | CORS reflected **any** `Origin` together with `Access-Control-Allow-Credentials: true`. | `server/server.mjs` | Verified, fixed |
| S5 | High | Stored XSS through support attachments: the stored and served `Content-Type` came from the client (`mimeType`), files were served `inline`, and `.svg` was allowed. Uploading `note.txt` with `mimeType: text/html` would render as HTML on the site's origin. | `server/api.mjs` | Verified in code, fixed |
| S6 | Medium | CSRF: a CSRF token was issued at login but never checked. State-changing calls authenticated by the `uct_session` cookie had no origin check (mitigated only by `SameSite=Lax`, which does not cover sibling subdomains). | `server/server.mjs` | Fixed |
| S7 | Medium | Rate limits and audit logs trusted `X-Forwarded-For` as-is, so any client could forge a new IP per request and bypass the ticket and upload rate limits. | `server/api.mjs` | Fixed |
| S8 | Medium | No request body size limit: an unbounded JSON body was buffered in memory. | `server/server.mjs` | Fixed |
| S9 | Medium | Dependency advisories: `vite@5.4` / `esbuild` (1 high, 1 moderate: dev-server file access and path traversal). | `package.json` | Fixed |
| S10 | Low | Password hash comparison was not constant-time (`===`). | `server/db.mjs` | Fixed |
| S11 | Low | The session cookie had no `Secure` flag. | `server/api.mjs` | Fixed (production / `COOKIE_SECURE=true`) |

### Remediation details

- **S1:** `server/server.mjs` now serves an explicit allow-list: the six public HTML pages plus everything under `assets/`. Dotfiles and every other path return `404`, and the root-containment check still applies. The legacy `download_url` in the attachment metadata, which pointed at `/data/attachments/…`, now points at the authorised `/api/support/attachments/:id` endpoint.
- **S2:** `secureDemoCredentials()` in `server/db.mjs` runs at startup. When `NODE_ENV=production` (and `ALLOW_DEMO_CREDENTIALS` is not `1`), every account that still accepts its published demo password gets a random, unknown password instead. This also covers **existing** production databases. `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (12+ characters) create or re-key a real Super Admin. The fast-fill buttons are removed from the DOM outside `localhost`, and the pre-filled admin email and password in `admin-partners.html` are gone. Development and tests are unchanged.
  **Action required:** if a public deployment has ever run with these seeded accounts, treat those accounts as compromised. Review the `security_events` and `partner_audit_logs` tables for logins you don't recognise, and rotate any real credentials (WHMCS, CloudStack, payment gateways) that an admin could have viewed.
- **S4:** CORS headers are only sent for allow-listed origins: the five configured domains, the request's own host, `localhost` outside production, and `CORS_ALLOWED_ORIGINS`. A `Vary: Origin` header is added.
- **S5:** the MIME type is derived from the file extension on upload and on download. A client-supplied type outside the allow-list is rejected. Only PNG, JPEG, WebP and PDF are served `inline`; SVG, text, JSON and ZIP are served as `attachment`. Every download carries `Content-Security-Policy: default-src 'none'; sandbox` and `nosniff`. The file path is reduced to its basename inside `data/attachments/`.
- **S6:** for `POST/PUT/PATCH/DELETE` requests that carry a session cookie and no `Authorization: Bearer` header, the `Origin` (or `Referer`) must be an allowed origin, otherwise the response is `403`. Same-origin pages (partner dashboard, admin) are unaffected; the admin SPA uses Bearer tokens.
- **S7:** `getClientIp()` uses the socket address. Only when `TRUST_PROXY=1` does it use `X-Real-IP` (set by the bundled nginx config), or else the *last* `X-Forwarded-For` hop. `docker-compose.yml` sets `TRUST_PROXY=1` because the app is only reachable through nginx there.
- **S8:** request bodies are limited to 15 MB, which fits a 10 MB attachment as base64. Larger bodies get `413` with `Connection: close`.
- **S9:** `vite` upgraded to `^6.4.5`. `npm audit`: **0 vulnerabilities** (before: 2, 1 high + 1 moderate).
- **S10:** `verifyPassword()` uses `crypto.timingSafeEqual`.
- **S11:** `Secure` is added to `uct_session` when `NODE_ENV=production` (unless `COOKIE_SECURE=false`) or when `COOKIE_SECURE=true`.

### Checked with no issue found or no change needed

- SQL: all reviewed queries in `server/` use prepared statements with `?` placeholders. No string-built SQL with request data was found.
- Tenant isolation, internal-note masking and guest ticket lookup (number + email) are already covered by the existing test suites, which still pass.
- No real secrets are committed. `.env*.example` files contain placeholders only.
- `dangerouslySetInnerHTML` / Next.js-specific risks: not applicable. This is not a React or Next.js project (see `architecture.md`).

### Initially deferred, resolved in follow-up round (see §12)

- ~~PBKDF2 at 10,000 iterations~~: now 600,000 with upgrade on login (§12.1).
- ~~No Content-Security-Policy on public pages~~: now enforced on every HTML page (§12.2).
- ~~`COOKIE_SAME_SITE`, `COOKIE_DOMAIN`, `PARTNER_DB_PATH` documented but not read~~: now implemented (§12.4).
- ~~anime.js from a CDN without SRI~~: the CDN URL actually returned 404; the library is now vendored (§12.3).

## 4. Performance

All numbers come from Chrome with GPU acceleration on the development machine, homepage at 1366×800 (3 runs each, original `main` vs this branch).

| Metric | Before | After | Notes |
|---|---|---|---|
| WebGL contexts created at page load | **9** | **4** | Overlay renderers are now created on first open |
| Load event (warm runs) | 1296–1357 ms | 1183–1245 ms | Within run-to-run noise. Not claimed as an improvement |
| Long tasks during load (total, warm) | 429–530 ms | 420–524 ms | No significant change |
| JS heap after load | 33.3 MB | 32.8–32.9 MB | Small |
| Repeat requests for unchanged JS/CSS/HTML | full re-download (`no-store`) | `304 Not Modified` (ETag) | Verified with `If-None-Match` |

**Why the WebGL change matters:** browsers cap the number of live WebGL contexts and discard the *oldest* one first, which is the hero scene. Four overlays (`#about`, `#vps`, `#vds`, `#bem`) and the never-displayed Partner overlay each held a context and 700–2,200 particles from page load. Partner and `#bem` immediately redirect to `/partners` and `#p-email`, so their contexts were never used. Each overlay now creates its renderer the first time it opens, with identical shaders, particle counts, colours and timing. The About scene also stops rendering once `#about` closes. Before, it kept rendering invisibly underneath a service page opened from About, because it checked the shared `__aboutOpen` flag.

**Caching:** `Cache-Control: no-cache, no-store` on every JS/CSS/HTML file meant `three.min.js` (603 KB) and all modules were re-downloaded on every visit. The server now sends `ETag` / `Last-Modified` with `no-cache` (always revalidate, so deployments are still picked up immediately) and answers unchanged files with `304`.

## 5. Animation and visual-effect preservation

No animation, shader, particle system, transition, timing or easing was removed or altered:

- `flight-scene.js` (hero cloud dive, server racks, laptop, CRT shader, dust, cursor parallax), `services-gallery.js` (3D shapes, particles, anime.js pulse and burst), `dynamic-services.js` (per-page particle field) and all CSS transitions are untouched.
- The overlay particle scenes (`about-page.js`, `hosting-overlays.js`, `partner-page.js`) keep the same code; only *when* the renderer is created changed. Screenshots of `#vps` and `#about` after the change show the particle fields rendering.
- Browser tests confirm the animation loop keeps running (more than 20 frames per second in headless Chrome), the hero canvas is present, overlay canvases are created when overlays open, and the no-WebGL DOM fallback still drives the page.
- `prefers-reduced-motion` handling is unchanged.

## 6. Other fixes

| File | Defect | Fix |
|---|---|---|
| `vite.config.mjs` | `npm run build` only emitted `index.html`. On a static deployment, the **Partner** link (`/partners`), admin and partner dashboard all returned 404. | All five HTML pages are build inputs. Verified with `vite preview`: `/partners` serves the Partner page. |
| `docker-compose.yml` | Used `node:20-alpine`, but `server/db.mjs` imports `node:sqlite` (Node ≥ 22.5), so the container could not start. | `node:22-alpine`, `TRUST_PROXY=1`, optional bootstrap-admin variables. |
| `package.json` | No runtime requirement or lint/e2e scripts | `engines.node >=22.5.0`; scripts `lint`, `test:security`, `test:e2e`, `audit`. |
| `.gitignore` | `data/attachments/` (customer uploads) was not ignored | Ignored |
| `.env.production.example` | New settings undocumented | Documents `TRUST_PROXY`, `CORS_ALLOWED_ORIGINS`, `BOOTSTRAP_ADMIN_*`, `ALLOW_DEMO_CREDENTIALS`, `COOKIE_SECURE` |

## 7. Files changed

| File | Change |
|---|---|
| `assets/js/modules/support-ticket.js` | Root-cause fix for the freeze (2.1) |
| `assets/css/header.css` | Mobile burger visibility (2.2) |
| `assets/js/modules/about-page.js`, `hosting-overlays.js`, `partner-page.js` | Lazy WebGL creation; About loop stops when About closes |
| `server/server.mjs` | Request pipeline: crash guard, safe decoding, static allow-list, CORS allow-list, CSRF origin check, body limit, ETag/304 |
| `server/api.mjs` | Attachment MIME/disposition/CSP, `getClientIp()`, `Secure` cookie |
| `server/auth.mjs` | Safe cookie decoding |
| `server/db.mjs` | Production demo-credential lockout, bootstrap admin, constant-time hash compare |
| `admin.html`, `admin-partners.html` | Fast-fill credentials hidden outside localhost; pre-filled credentials removed |
| `vite.config.mjs`, `docker-compose.yml`, `package.json`, `package-lock.json`, `.gitignore`, `.env.production.example` | See section 6 |
| `tests/security-hardening.test.mjs` | **New:** 31 HTTP-level security regression tests |
| `tests/e2e/navigation.e2e.mjs` | **New:** 8 browser regression tests |
| `scripts/check-syntax.mjs` | **New:** `npm run lint` (syntax check of all first-party JS) |
| `README.md`, `architecture.md`, `docs/ARCHITECTURE.md`, `CHANGES.md` | Documentation |

## 8. Dependencies

| Package | Before | After | Reason |
|---|---|---|---|
| `vite` (dev) | `^5.4.0` | `^6.4.5` | Fixes the vite/esbuild advisories (S9). The build config is unchanged apart from the extra inputs. |
| `playwright-core` (dev, new) | none | `^1.48.2` | Drives an installed Chrome or Edge for `npm run test:e2e`. It does not download browsers. |

## 9. Tests executed (actual results)

| Check | Command | Result |
|---|---|---|
| Existing + new unit/integration tests | `npm run test:all` | **123 / 123 pass** (92 existing + 31 new) |
| Browser navigation regression | `npm run test:e2e` | **8 / 8 pass** on this branch. The same suite on original `main` **fails on the first test** (the browser freezes) |
| Syntax lint | `npm run lint` | 43 / 43 files parse |
| Dependency audit | `npm audit` | **0 vulnerabilities** (before: 2) |
| Production build | `npm run build` | Succeeds; emits all 5 HTML pages + `assets/` |
| Production build in browser | `vite preview` + navigation script | Cloud → Email → SSL → Domain → Hosting all responsive; `/partners` serves the Partner page |
| Manual HTTP checks | `curl` against `npm start` | DB/.git/server/tests → 404; `/%E0%A4%A` → 400 and the server stays up; foreign Origin gets no CORS headers; ETag → 304 |

The browser tests cover: every header service page (two rounds), deep links, `/partners`, back/back/forward between hash pages and `/partners`, rapid repeated clicks, the mobile menu at 390×844, the overlay particle canvases being created on open, the animation loop running, the no-WebGL fallback, and no uncaught page errors.

**Not available:** there is no TypeScript in the project (no type-check step exists) and no ESLint configuration. `npm run lint` is a syntax check, not a style linter.

## 10. Remaining limitations and risks

*(Updated after the third round, §13.)*

- No production environment or deployment credentials were available. Nothing was deployed, and the live sites were not tested. Deploying needs access to the server (see `architecture.md` §14 for the steps and rollback).
- Browsers: the e2e suite passes on Chrome, Microsoft Edge, Firefox (Playwright build) and WebKit (Playwright's build of Safari's engine) on Windows. Real Safari on macOS/iOS and real mobile devices were not available. WebKit has no switch to disable WebGL, so the no-WebGL test is exercised on Chromium and Firefox only.
- The overlays still coordinate through the shared global `window.__aboutOpen` flag and several independent `hashchange` listeners. They work in every sequence tested on all four engines. A single router module would be easier to maintain, but that is a refactor, not a defect, and was left out deliberately to avoid changing transition behaviour.
- `style-src` still allows `'unsafe-inline'` (style attributes are used in hundreds of places). Inline styles cannot execute script. Scripts are fully restricted (§13).

## 11. Commit

- Implementation commit: `5903504` (`fix: resolve navigation freezes and harden application`) on branch `fix/navigation-freeze-hardening`, parent `e184364` (`main`).
- This hash note was added in a separate follow-up commit on the same branch.
- Follow-up round (§12) committed on the same branch; see `git log`.

---

## 12. Follow-up round: deferred items resolved (2026-10-29)

### 12.1 Password hashing raised to OWASP strength without blocking the server

**Files:** `server/db.mjs`, `server/auth.mjs`, `server/api.mjs`

- **Measured cost on the development machine:** PBKDF2-SHA256 at 10,000 iterations takes 8.8 ms; at 600,000 (OWASP 2023), 494 ms. Doing that synchronously, as the old code did, would block **every** request for half a second per login attempt.
- New hashes are stored as `pbkdf2_sha256$600000$<hex>`. Existing bare-hex hashes are read as 10,000 iterations, keep working, and are **re-hashed at 600,000 on the user's next successful login** (`needsRehash()` + `handleLoginAsync()`). No migration step or downtime is needed.
- `POST /api/auth/login`, admin-user creation and partner creation now hash with the async `crypto.pbkdf2` (libuv thread pool). Test: while a login performs two full-cost hashes, the event loop never stalled for 150 ms or more.
- A login for an unknown email now derives a throw-away key at the same cost, so response time no longer reveals which emails have accounts (tested).
- Failed-attempt counting is now an atomic `UPDATE … SET failed_login_attempts = failed_login_attempts + 1`. With async verification, concurrent wrong guesses could otherwise overwrite each other's count and slip past the 5-attempt lockout.
- Seeded demo accounts keep a cheap hash (their passwords are public anyway). Production re-keys them to a random 256-bit secret, which needs no work factor to resist guessing. This keeps start-up and the test suite fast; seeding also no longer computes hashes for accounts that already exist.
- `BOOTSTRAP_ADMIN_*` now only **creates** the account. Re-keying on every restart would have silently undone a password change made in the portal; set `BOOTSTRAP_ADMIN_RESET=1` to force a reset.
- The IP stored with each session now uses the same proxy-aware `getClientIp()` as rate limiting (it previously trusted a raw `X-Forwarded-For`).
- `handleLogin()` (sync) is kept for scripts and the existing tests; the HTTP route uses `handleLoginAsync()`.

### 12.2 Content-Security-Policy on every HTML page

**File:** `server/server.mjs` (`buildContentSecurityPolicy()`)

*(As introduced in this round. §13 removed `'unsafe-inline'` from `script-src`.)*

```
default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com;
img-src 'self' data: blob: https:; connect-src 'self' https://open.er-api.com; worker-src 'self' blob:;
object-src 'none'; base-uri 'self'; form-action 'self' mailto:; frame-ancestors 'self'
(+ upgrade-insecure-requests in production)
```

Every allowance maps to a real use found in the code: WebAssembly for the Meshopt model decoder, `data:`/`blob:` textures inside the GLB, Google Fonts, and the open.er-api.com exchange rate used by the SSL catalogs. Verification in Chrome with the policy **enforced**:
- A full homepage scroll, all 16 overlays/service pages, the cart, the support modal, the FX-rate fetch, `/partners`, partner dashboard login, admin login and `/admin/partners` produced **0 violations and 0 page errors**.
- An injected `https://evil.example/x.js` was blocked and reported, proving the crawler detects violations.
- Screenshots of the hero clouds and the server-rack / laptop scene match the pre-CSP rendering.
- A repository-wide search found no `eval`, `new Function` or string timers (all blocked by this policy).

`CSP_REPORT_ONLY=1` switches to `Content-Security-Policy-Report-Only` for a cautious rollout.

### 12.3 anime.js was never loading: now vendored

**Files:** `index.html`, `assets/js/vendor/anime.umd.min.js` (new, anime.js 4.0.2, MIT, 76 KB)

`index.html` loaded `https://cdn.jsdelivr.net/npm/animejs@4.0.2/dist/bundles/anime.umd.min.js`, which returns **HTTP 404** (in 4.0.2 the file lives at `lib/anime.umd.min.js`). In the browser, `window.anime` was `undefined`, and `app.js` logged `Missing libraries: anime`. As a result, the **services gallery's ambient pulse and the particle burst on click / slide change** (`services-gallery.js`) never ran. The CSS slide-change flash did not depend on anime.js and was unaffected. The file is now served from `assets/js/vendor/`, like three.js, which removes the third-party runtime dependency and lets the CSP drop jsDelivr.

**Verification:** `window.anime.animate` is a function. The gallery's pulse now drives the header tint: sampled lightness went 15.7% → 18.0% → 17.6% over 3 s, where before it stayed constant at 16.4%. This restores an animation already in the code; it does not add a new one.

### 12.4 Documented settings that were ignored now work

**Files:** `server/auth.mjs` (`buildSessionCookie()`), `server/api.mjs`, `server/db.mjs` (`resolveDbPath()`)

- `COOKIE_SAME_SITE` (`Strict` / `Lax` / `None`; `None` is downgraded to `Lax` without `Secure`, as browsers require), `COOKIE_DOMAIN` (validated, so header injection is not possible), and `COOKIE_SECURE`. Login and logout use the same attributes, so logout clears a domain cookie correctly.
- `PARTNER_DB_PATH` (absolute, or relative to the project root; its directory is created if needed).

### 12.5 Tests in this round

| Check | Result |
|---|---|
| `npm run test:all` | **134 / 134 pass** (+11: hashing format, legacy upgrade on login, event loop not blocked, no timing enumeration, malformed hashes, bootstrap reset rule, CSP header, cookie attributes, DB path) |
| `npm run test:e2e` in **Chrome** | **9 / 9 pass** (+1: zero CSP violations across all pages) |
| `npm run test:e2e` in **Microsoft Edge** (`CHROME_PATH=…msedge.exe`) | **9 / 9 pass** |
| `npm run lint` / `npm audit` / `npm run build` | 43/43 parse / 0 vulnerabilities / OK (vendored anime.js included in `dist/`) |

One test-harness change: Playwright's `page.waitForFunction()` evaluates a string, which the new CSP correctly blocks, so the e2e helpers now poll with `page.evaluate()`. The CSP is **not** bypassed in the tests.

---

## 13. Third round: strict script CSP, cross-browser testing, no-WebGL navigation fix (2026-10-29)

### 13.1 No inline script anywhere: `'unsafe-inline'` removed from `script-src`

**Policy now:** `script-src 'self' 'wasm-unsafe-eval'`. Only script *files* from this site can run: no inline `<script>`, no `on…=` attributes, no `javascript:` URLs, no `eval`.

| What | Before | After |
|---|---|---|
| Inline `<script>` blocks | 9 (in 6 pages) | 0. Moved verbatim to `assets/js/pages/*.js` and loaded from the same position, so execution order and globals are unchanged |
| `on…=` handler attributes in pages | 98 (88 plain calls + 10 special: burger, rewards shortcut, 2 image `onerror`, 6 hover) | 0. `data-onclick` / `data-onsubmit` / `data-onchange` / `data-oninput` |
| Inline handlers created by JS templates | 3 in `support-ticket.js` (support modal) | 0 |
| `javascript:` URLs | 2 (footer and partners "Support Tickets") | 0 |

**`assets/js/csp-handlers.js` (new):** delegated listeners that run `data-on…` attributes. The attribute is **parsed, not evaluated**: only `name(…)` / `obj.name(…)` with string, number, boolean or null literals, or `event`, is accepted. Bubbling order and `stopPropagation()` behave as inline handlers did. A `data-onclick` on `<a href="#">` prevents the hash change, so a footer link can't close the open page. Two declarative helpers replace the non-call handlers: `data-click-target` (partner-dashboard rewards shortcut, support-modal dropzone) and `data-hide-on-error` (admin logos). The admin export-menu hover moved to CSS. The burger uses `toggleMobileMenu()` (`header-nav.js`).

**Security fix that came with it: stored XSS in the admin portal.** Row buttons were built as `onclick="promptCustomerStatus('${c.id}', '${c.status}', '${c.company_name || c.email}')"`, with database values (company names, emails, VM names, invoice numbers, session tokens) dropped straight into JavaScript. A customer named `x'); …; ('` would run code in a Super Admin's browser session. Two layers now prevent this: the dispatcher never executes attribute text, and every interpolation goes through `handlerArg()` (JS-string escaping, then HTML-attribute escaping), so a name like *O'Brien Ltd* still works. Numeric arguments are coerced with `Number()`.

**Verified in the browser under the enforced policy (0 violations):**
- Admin: fast-fill chip login, every admin view, customer rows → detail modal, close modal, live search (`data-oninput`).
- Partner desk: fast-fill + login.
- Partner dashboard: login + rewards shortcut.
- Support modal: open from `/partners` and from a service-page footer (the page stays open), dropzone file chooser, attachment remove, Cancel.
- Mobile burger; Fly page redirect.
- A full-site crawl of all pages and overlays.

### 13.2 Real bug found by cross-browser testing: no service pages without WebGL

**File:** `assets/js/modules/dynamic-services.js`

The shared particle field was created with an unguarded `new THREE.WebGLRenderer(...)`. Where WebGL is unavailable (GPU blocked, some VMs and remote desktops, hardened browser settings), the constructor throws, which **aborted the entire page builder**: no `section.pg` was ever created, so every menu option changed the URL but showed nothing. Firefox with WebGL disabled exposed it (`[Page builder] Error`). The earlier no-WebGL test only checked the URL hash, so it missed it.

**Fix:** the renderer is created in `try`/`catch`. Without WebGL, all pages are still built and open normally; only the decorative particle field is skipped (the header tint animation still runs). The no-WebGL test now asserts that the page is actually visible and that the pages were built. It **fails on the previous code and passes on the fix** (verified).

### 13.3 Cross-browser e2e

`tests/e2e/navigation.e2e.mjs` takes `BROWSER=chromium|firefox|webkit` (Chromium uses the installed Chrome or Edge; Firefox/WebKit use Playwright's builds: `npx playwright-core install firefox webkit`). Harness changes found along the way, none of which weaken the checks:
- Scrolling uses `scrollTo` instead of `mouse.wheel`. Wheel deltas are engine-specific: Firefox scrolled 722 px for a 3,400 px wheel.
- The animation test asserts the loop *runs* (more than 2 frames/s) instead of more than 20. Playwright's Windows WebKit renders WebGL at about 7 fps in software, which says nothing about the site.
- New test: the inline-handler replacements keep their behaviour under the strict CSP.

### 13.4 Tests (actual results)

| Check | Result |
|---|---|
| `npm run test:all` | **180 / 180 pass** (+46 in `tests/csp-handlers.test.mjs`: parser accepts/rejects, no inline script, no `on…=`, no `javascript:` in any page or script) |
| `npm run test:e2e`, Chrome | **10 / 10** |
| Microsoft Edge | **10 / 10** |
| Firefox (`BROWSER=firefox`) | **10 / 10** |
| WebKit (`BROWSER=webkit`) | **10 / 10** (no-WebGL test not applicable) |
| `npm run lint` / `npm audit` / `npm run build` | 54/54 / 0 vulnerabilities / OK |

One existing assertion in `tests/support-ticketing.test.mjs` looked for the literal text `openSupportTicketModal()`. It now accepts the call with an argument and additionally asserts that no `javascript:` URL remains.
