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

### Not fixed: theoretical or needs a product decision

- PBKDF2 uses 10,000 iterations, below current OWASP guidance (600,000 for PBKDF2-SHA256). Raising it requires a re-hash-on-login migration, so it is not changed here.
- No Content-Security-Policy on the public pages. The pages rely on inline scripts and handlers, and a CDN (`cdn.jsdelivr.net` for anime.js), so a safe CSP needs a refactor. The nginx admin vhost already sends a CSP.
- `COOKIE_SAME_SITE`, `COOKIE_DOMAIN` and `PARTNER_DB_PATH` appear in `.env.production.example` but are not read by the server. Comments now say so.
- anime.js loads from a CDN without Subresource Integrity.

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

- No production environment or deployment credentials were available. Nothing was deployed, and the live sites were not tested.
- The e2e tests ran on Windows with Chrome. Safari and Firefox were not tested.
- The overlays still coordinate through the shared global `window.__aboutOpen` flag and several independent `hashchange` listeners. They now work in every sequence tested, but a single router module would be easier to maintain. That refactor was deliberately left out to avoid changing transition behaviour.
- See "Not fixed" in section 3 (PBKDF2 iterations, public-page CSP, unread cookie variables, no SRI on the anime.js CDN script).

## 11. Commit

Recorded in the commit that adds this file on branch `fix/navigation-freeze-hardening`. The final hash is in `git log` and in the delivery report.
