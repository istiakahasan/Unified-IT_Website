/**
 * Browser regression tests for the navigation freeze (see CHANGES.md).
 * Drives a browser through playwright-core against the real Node server.
 *
 *   npm run test:e2e                         # Chromium engine: auto-detects installed Chrome or Edge
 *   CHROME_PATH=/path/to/chrome npm run test:e2e
 *   BROWSER=firefox npm run test:e2e         # Firefox engine  } need the Playwright builds once:
 *   BROWSER=webkit  npm run test:e2e         # WebKit (Safari) }   npx playwright-core install firefox webkit
 *
 * The suite is skipped (not failed) when the selected browser is not available.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from '../../server/server.mjs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const executablePath = CANDIDATES.find(p => fs.existsSync(p));

const ENGINE = (process.env.BROWSER || 'chromium').toLowerCase();
let pw = null;
try { pw = await import('playwright-core'); } catch { /* optional dev dependency */ }
const engine = pw && pw[ENGINE];
let skip = false;
if (!engine) skip = `playwright-core or engine "${ENGINE}" not available`;
else if (ENGINE === 'chromium' && !executablePath) skip = 'no Chrome/Edge installation found (set CHROME_PATH)';
else if (ENGINE !== 'chromium') {
  try { if (!fs.existsSync(engine.executablePath())) skip = `${ENGINE} not installed: npx playwright-core install ${ENGINE}`; }
  catch { skip = `${ENGINE} not installed: npx playwright-core install ${ENGINE}`; }
}

// Launch options per engine; withoutWebGL() returns options that disable WebGL, or null if the engine has no switch for it.
function launchOptions() {
  return ENGINE === 'chromium' ? { executablePath, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] } : {};
}
function withoutWebGL() {
  if (ENGINE === 'chromium') return { executablePath, args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] };
  if (ENGINE === 'firefox') return { firefoxUserPrefs: { 'webgl.disabled': true } };
  return null;
}

const SERVICE_LINKS = ['Cloud Service', 'Email', 'Agentic AI', 'Cyber Security', 'Hosting', 'SSL', 'Domain'];
const EXPECTED_HASH = { 'Cloud Service': '#p-cloud', 'Email': '#p-email', 'Agentic AI': '#p-agentic', 'Cyber Security': '#p-cyber', 'Hosting': '#p-hosting', 'SSL': '#p-ssl', 'Domain': '#p-domain' };

describe(`Navigation and animation regression (${ENGINE})`, { skip }, () => {
  let server, base, browser;

  before(async () => {
    server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await engine.launch(launchOptions());
  });

  after(async () => {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  });

  async function openPage(path = '/', viewport = { width: 1366, height: 800 }, launchArgs) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + path, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    return { page, context, errors };
  }

  // Resolves only if the page's main thread can run script within the deadline.
  async function assertResponsive(page, label, ms = 5000) {
    const result = await Promise.race([
      page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(location.pathname + location.hash)))),
      new Promise(r => setTimeout(() => r('__FROZEN__'), ms))
    ]);
    assert.notEqual(result, '__FROZEN__', `${label}: main thread froze`);
    return result;
  }

  // page.waitForFunction() evaluates a string, which the site's CSP (no 'unsafe-eval') rightly blocks,
  // so poll with page.evaluate() instead.
  async function waitForHeader(page, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await page.evaluate(() => document.getElementById('hdr').style.pointerEvents === 'auto')) return;
      await page.waitForTimeout(100);
    }
    throw new Error('header never became interactive');
  }

  async function scrollToHeader(page) {
    await page.evaluate(() => scrollTo(0, innerHeight * 4.3));
    await waitForHeader(page);
  }

  it('navigates through every header service page repeatedly without freezing', async () => {
    const { page, context, errors } = await openPage('/');
    await scrollToHeader(page);
    for (const round of [1, 2]) {
      for (const text of SERVICE_LINKS) {
        await page.click(`#hdr .nv a:text-is("${text}")`, { timeout: 5000 });
        const where = await assertResponsive(page, `round ${round} -> ${text}`);
        assert.equal(where, '/' + EXPECTED_HASH[text]);
        assert.ok(await page.$(`#pg-${EXPECTED_HASH[text].slice(3)}.on`), `${text} page is visible`);
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('stays responsive after a deep link to a service page or overlay', async () => {
    for (const hash of ['#p-cloud', '#vps', '#vds', '#about', '#p-email']) {
      const { page, context, errors } = await openPage('/' + hash);
      // Any class change used to start the MutationObserver loop
      await page.evaluate(() => { document.body.classList.add('e2e-probe'); });
      await assertResponsive(page, `deep link ${hash}`);
      assert.deepEqual(errors, [], `errors on ${hash}`);
      await context.close();
    }
  });

  it('keeps /partners responsive', async () => {
    const { page, context, errors } = await openPage('/partners');
    await page.evaluate(() => { document.body.classList.add('e2e-probe'); });
    await assertResponsive(page, '/partners');
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('supports browser back and forward between pages', async () => {
    const { page, context } = await openPage('/');
    await scrollToHeader(page);
    await page.click('#hdr .nv a:text-is("SSL")');
    await page.click('#hdr .nv a:text-is("Domain")');
    await page.click('#hdr .nv a:text-is("Partner")');
    await page.waitForURL(/\/partners$/);
    await page.goBack();
    assert.equal(await assertResponsive(page, 'back 1'), '/#p-domain');
    assert.ok(await page.$('#pg-domain.on'));
    await page.goBack();
    assert.equal(await assertResponsive(page, 'back 2'), '/#p-ssl');
    assert.ok(await page.$('#pg-ssl.on'));
    await page.goForward();
    assert.equal(await assertResponsive(page, 'forward'), '/#p-domain');
    await context.close();
  });

  it('settles on the last destination after rapid repeated clicks', async () => {
    const { page, context, errors } = await openPage('/');
    await scrollToHeader(page);
    await page.evaluate(names => {
      const links = [...document.querySelectorAll('#hdr .nv a')];
      names.forEach(n => links.find(a => a.textContent.trim() === n).click());
    }, ['Cloud Service', 'Email', 'SSL', 'Hosting', 'Domain', 'Email', 'Cloud Service']);
    assert.equal(await assertResponsive(page, 'rapid clicks'), '/#p-cloud');
    assert.equal((await page.$$('.pg.on')).length, 1, 'exactly one service page visible');
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('opens a page from the mobile menu', async () => {
    const { page, context, errors } = await openPage('/', { width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, innerHeight * 4.3));
    await waitForHeader(page);
    await page.click('[aria-label="Menu"]');
    assert.ok(await page.evaluate(() => document.body.classList.contains('mmo')), 'mobile menu opened');
    await page.click('#mm a:text-is("SSL")');
    assert.equal(await assertResponsive(page, 'mobile nav'), '/#p-ssl');
    assert.equal(await page.evaluate(() => document.body.classList.contains('mmo')), false, 'menu closed after navigation');
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('keeps the animations running and creates overlay effects on demand', async () => {
    const { page, context } = await openPage('/');
    const frames = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); (function f() { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); })(); }));
    // The loop must keep running; the frame rate itself depends on the GPU (software WebGL in CI can be ~7 fps)
    assert.ok(frames > 2, `animation loop is running (${frames} frames/s)`);
    assert.ok(await page.$('#gl'), 'hero WebGL canvas present');
    await page.evaluate(() => { location.hash = 'vps'; });
    await page.waitForTimeout(600);
    assert.ok(await page.$('#vps.on canvas'), 'VPS particle canvas is created when the overlay opens');
    await page.evaluate(() => { location.hash = 'about'; });
    await page.waitForTimeout(600);
    assert.ok(await page.$('#about.on canvas'), 'About particle canvas is created when the overlay opens');
    await assertResponsive(page, 'overlay switching');
    await context.close();
  });

  it('runs every page and overlay without Content-Security-Policy violations', async () => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    const page = await context.newPage();
    const violations = [];
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.log('CSPV|' + e.violatedDirective + '|' + e.blockedURI)));
    page.on('console', m => { if (m.text().startsWith('CSPV|')) violations.push(m.text()); });
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForTimeout(2500); // model fetch + WebAssembly decode
    for (const h of ['#about', '#vps', '#vds', '#p-cloud', '#p-email', '#p-ssl', '#p-domain', '#p-m365', '']) {
      await page.evaluate(h => { location.hash = h; }, h);
      await page.waitForTimeout(400);
    }
    for (const p of ['/partners', '/partner/dashboard', '/admin', '/admin/partners']) {
      await page.goto(base + p, { waitUntil: 'load' });
      await page.waitForTimeout(500);
    }
    assert.deepEqual(violations, []);
    await context.close();
  });

  it('replaces inline handlers without losing behaviour (strict CSP: admin, support modal, footer link)', async () => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    const page = await context.newPage();
    const problems = [];
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.log('CSPV|' + e.violatedDirective)));
    page.on('console', m => { if (/^CSPV\||csp-handlers/.test(m.text())) problems.push(m.text()); });
    page.on('pageerror', e => problems.push(e.message));

    // Admin: fast-fill chip (data-onclick) logs in; nav buttons and rendered row buttons work
    await page.goto(base + '/admin', { waitUntil: 'load' });
    await page.click('.role-chip >> nth=0');
    for (let i = 0; i < 50 && !(await page.evaluate(() => !!localStorage.getItem('uct_admin_token'))); i++) await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => !!localStorage.getItem('uct_admin_token')), 'admin login via data-onclick chip');
    await page.click('[data-onclick="switchAdminView(\'customers\')"] >> nth=0');
    await page.waitForSelector('[data-onclick^="inspectCustomer("]', { timeout: 10000 });
    await page.click('[data-onclick^="inspectCustomer("] >> nth=0');
    await page.waitForTimeout(800);
    assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('customerDetailModal')).display !== 'none'), 'row button opened the detail modal');

    // Service page footer: support link opens the modal without closing the page
    await page.goto(base + '/#p-cloud', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await page.click('#pg-cloud a[data-onclick^="openSupportTicketModal"]');
    await page.waitForTimeout(600);
    assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector('.spt-modal-overlay')).display !== 'none'), 'support modal opened');
    assert.equal(await page.evaluate(() => location.hash), '#p-cloud', 'service page stayed open');
    await page.click('.spt-btn-secondary:has-text("Cancel")');
    await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector('.spt-modal-overlay')).display === 'none'), 'Cancel closed the modal');

    assert.deepEqual(problems, []);
    await context.close();
  });

  it('works without WebGL (DOM scroll fallback)', async () => {
    const opts = withoutWebGL();
    if (!opts) return; // WebKit has no switch to disable WebGL; covered on Chromium and Firefox
    const noGl = await engine.launch(opts);
    try {
      const page = await noGl.newPage({ viewport: { width: 1366, height: 800 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && /\[Page builder\]/.test(m.text())) errors.push(m.text()); });
      await page.goto(base + '/', { waitUntil: 'load' });
      await page.evaluate(() => scrollTo(0, innerHeight * 4.3));
      await waitForHeader(page);
      await page.click('#hdr .nv a:text-is("Email")');
      await page.click('#hdr .nv a:text-is("SSL")');
      assert.equal(await assertResponsive(page, 'no-WebGL nav'), '/#p-ssl');
      // The page must really open: without WebGL the page builder used to abort, leaving no service pages at all
      assert.ok(await page.$('#pg-ssl.on'), 'SSL page is built and visible without WebGL');
      assert.equal(await page.evaluate(() => document.querySelectorAll('section.pg').length > 5), true, 'service pages were built');
      assert.deepEqual(errors, []);
    } finally {
      await noGl.close();
    }
  });
});
