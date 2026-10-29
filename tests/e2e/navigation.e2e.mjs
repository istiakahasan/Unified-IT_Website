/**
 * Browser regression tests for the navigation freeze (see CHANGES.md).
 * Drives a locally installed Chrome / Edge through playwright-core against the real Node server.
 *
 *   npm run test:e2e                         # auto-detects Chrome or Edge
 *   CHROME_PATH=/path/to/chrome npm run test:e2e
 *
 * The suite is skipped (not failed) when no Chromium-based browser is installed.
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

let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch { /* optional dev dependency */ }
const skip = !executablePath || !chromium ? 'no Chromium browser or playwright-core available' : false;

const SERVICE_LINKS = ['Cloud Service', 'Email', 'Agentic AI', 'Cyber Security', 'Hosting', 'SSL', 'Domain'];
const EXPECTED_HASH = { 'Cloud Service': '#p-cloud', 'Email': '#p-email', 'Agentic AI': '#p-agentic', 'Cyber Security': '#p-cyber', 'Hosting': '#p-hosting', 'SSL': '#p-ssl', 'Domain': '#p-domain' };

describe('Navigation and animation regression (browser)', { skip }, () => {
  let server, base, browser;

  before(async () => {
    server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
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

  async function scrollToHeader(page) {
    await page.mouse.wheel(0, 3400);
    await page.waitForFunction(() => document.getElementById('hdr').style.pointerEvents === 'auto', null, { timeout: 15000 });
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
    await page.mouse.wheel(0, 3400);
    await page.waitForFunction(() => document.getElementById('hdr').style.pointerEvents === 'auto', null, { timeout: 15000 });
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
    assert.ok(frames > 20, `animation loop is running (${frames} frames/s)`);
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

  it('works without WebGL (DOM scroll fallback)', async () => {
    const noGl = await chromium.launch({ executablePath, args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
    try {
      const page = await noGl.newPage({ viewport: { width: 1366, height: 800 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/', { waitUntil: 'load' });
      await page.mouse.wheel(0, 3400);
      await page.waitForFunction(() => document.getElementById('hdr').style.pointerEvents === 'auto', null, { timeout: 15000 });
      await page.click('#hdr .nv a:text-is("Email")');
      await page.click('#hdr .nv a:text-is("SSL")');
      assert.equal(await assertResponsive(page, 'no-WebGL nav'), '/#p-ssl');
      assert.deepEqual(errors, []);
    } finally {
      await noGl.close();
    }
  });
});
