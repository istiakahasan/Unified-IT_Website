/**
 * Browser tests for the Web Hosting plan cards (#p-hosting): 2 x 2 grid on desktop, one column on a phone,
 * allocation rows, price block next to the Order Now button, and no effect on the other pages' plan cards.
 *
 *   node --test tests/e2e/hosting.e2e.mjs        (set CHROME_PATH if Chrome/Edge is not auto-detected)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PARTNER_DB_PATH = path.join(os.tmpdir(), `hosting-e2e-${process.pid}-${Date.now()}.db`);
const { createServer } = await import('../../server/server.mjs');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const executablePath = CANDIDATES.find(p => fs.existsSync(p));
let pw = null;
try { pw = await import('playwright-core'); } catch { /* optional dev dependency */ }
const skip = !pw ? 'playwright-core is not installed' : (!executablePath ? 'no Chrome/Edge installation found (set CHROME_PATH)' : false);

describe('Web Hosting plan cards (browser)', { skip }, () => {
  let server, base, browser;
  before(async () => {
    server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await pw.chromium.launch({ executablePath, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  });
  after(async () => {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
    for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.PARTNER_DB_PATH + s); } catch { /* not created */ } }
  });

  async function open(viewport) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/#p-hosting', { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    return { page, context, errors };
  }
  const boxes = (page) => page.$$eval('#pg-hosting .wpg-host .wp', els => els.map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), b: Math.round(r.bottom) }; }));

  it('shows four plans in a 2 x 2 grid on desktop with a heading and equal-height cards', async () => {
    const { page, context, errors } = await open({ width: 1366, height: 1000 });
    assert.match(await page.textContent('#pg-hosting .dlab'), /Web Hosting/);
    const b = await boxes(page);
    assert.equal(b.length, 4);
    assert.equal(b[0].y, b[1].y, 'plans 1 and 2 share a row');
    assert.equal(b[2].y, b[3].y, 'plans 3 and 4 share a row');
    assert.ok(b[2].y > b[0].y + 100, 'second row sits below the first');
    assert.equal(b[0].x, b[2].x);
    assert.equal(b[1].x, b[3].x);
    assert.ok(b[1].x > b[0].x + b[0].w - 2, 'two columns, not overlapping');
    assert.equal(b[0].b, b[1].b, 'cards in a row have equal height');
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('each plan lists its allocations and keeps the Order Now button and a price block aligned', async () => {
    const { page, context } = await open({ width: 1366, height: 1000 });
    const plans = await page.$$eval('#pg-hosting .wpg-host .wp', els => els.map(e => ({
      tag: e.querySelector('.wtag').textContent,
      space: e.querySelector('.ek b').textContent,
      rows: [...e.querySelectorAll('.wspec div')].map(r => [r.querySelector('dt').textContent, r.querySelector('dd').textContent]),
      checks: [...e.querySelectorAll('.el li')].map(l => l.textContent),
      price: (e.querySelector('.wprice') || e.querySelector('.wfoot .wprice')).textContent.trim(),
      href: e.querySelector('.wfoot a.vb').getAttribute('href'),
      buttonTop: Math.round(e.querySelector('.wfoot a.vb').getBoundingClientRect().top)
    })));
    assert.deepEqual(plans.map(p => [p.tag, p.space]), [['PLAN 01', '3 GB'], ['PLAN 02', '5 GB'], ['PLAN 03', '10 GB'], ['PLAN 04', '20 GB']]);
    assert.deepEqual(plans[3].rows, [['Hosted domains', '1'], ['Sub-domains', '25'], ['MySQL databases', '30'], ['Email accounts', '20']]);
    for (const p of plans) {
      assert.deepEqual(p.checks, ['Free SSL Certificate', 'cPanel Control Panel', '99.98% Uptime', '24X7 Support']);
      assert.match(p.href, /^mailto:/);
      assert.match(p.price, /^BDT\s*[\d,]+\s*\/ Annually$/);
    }
    assert.equal(plans[0].buttonTop, plans[1].buttonTop, 'Order Now buttons line up in a row');
    assert.equal(plans[2].buttonTop, plans[3].buttonTop);
    await context.close();
  });

  it('shows each plan yearly price as "BDT X / Annually", and falls back to "Pricing on request" when cleared', async () => {
    const { page, context } = await open({ width: 1366, height: 1000 });
    const prices = await page.$$eval('#pg-hosting .wpg-host .wp .wprice', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(prices, ['BDT 2,970 / Annually', 'BDT 6,000 / Annually', 'BDT 8,690 / Annually', 'BDT 16,800 / Annually']);
    const html = await page.evaluate(() => { HOSTING_PLANS[0].price = null; return hostingPlansHtml(); });
    assert.match(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /Pricing on request/);
    await context.close();
  });

  it('Order Now uses the vibrant gradient theme and the cards have a hover effect', async () => {
    const { page, context } = await open({ width: 1366, height: 1000 });
    const bg = await page.$eval('#pg-hosting .wpg-host .wp .wfoot a.vb', e => getComputedStyle(e).backgroundImage);
    assert.ok(bg && bg.includes('gradient'), 'button has vibrant gradient background');
    const card = page.locator('#pg-hosting .wpg-host .wp').first();
    const before = (await card.boundingBox()).y;
    await card.hover();
    await page.waitForTimeout(500);
    assert.ok((await card.boundingBox()).y < before, 'the card lifts on hover');
    await context.close();
  });

  it('stacks into one column on a 390px phone without horizontal scrolling', async () => {
    const { page, context, errors } = await open({ width: 390, height: 900 });
    const b = await boxes(page);
    assert.equal(new Set(b.map(x => x.x)).size, 1, 'all cards share one column');
    assert.ok(b[1].y > b[0].b - 2, 'cards stack vertically');
    const overflow = await page.evaluate(() => { const el = document.getElementById('pg-hosting'); return el.scrollWidth - el.clientWidth; });
    assert.ok(overflow <= 1, `horizontal overflow of ${overflow}px`);
    const buttonVisible = await page.$eval('#pg-hosting .wpg-host .wp .wfoot a.vb', e => { const r = e.getBoundingClientRect(); return r.width > 100 && r.right <= innerWidth; });
    assert.ok(buttonVisible);
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('does not change the plan cards of any other page', async () => {
    const { page, context } = await open({ width: 1366, height: 1000 });
    const others = await page.$$eval('.pg .wpg:not(.wpg-host)', els => els.map(e => ({ id: e.closest('.pg').id, display: getComputedStyle(e).display })));
    assert.ok(others.length > 0, 'another page has plan cards');
    for (const o of others) assert.equal(o.display, 'flex', `${o.id} keeps its original layout`);
    await context.close();
  });
});
