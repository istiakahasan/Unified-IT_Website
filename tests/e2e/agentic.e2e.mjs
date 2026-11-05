/**
 * Browser tests for the four Agentic AI options: routing (hub, direct URLs, refresh, back), each ordering
 * workflow end to end, quotation actions, validation and responsive overflow.
 *
 *   node --test tests/e2e/agentic.e2e.mjs        (uses an installed Chrome or Edge; set CHROME_PATH otherwise)
 *
 * Runs against its own temporary SQLite database. Skipped (not failed) when no browser is available.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), `agentic-e2e-${process.pid}-${Date.now()}.db`);
process.env.PARTNER_DB_PATH = dbFile;
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

const PAGES = {
  ready: { hash: '#p-agentic-ready', mount: 'READY_MADE', title: /Pre-built AI agents/i },
  custom: { hash: '#p-agentic-custom', mount: 'CUSTOMIZED', title: /built around your business/i },
  branded: { hash: '#p-agentic-branded', mount: 'BRANDED', title: /speaks as your brand/i },
  chat: { hash: '#p-agentic-chat', mount: 'CHAT_ONLY', title: /focused chatbot/i }
};
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

describe('Agentic AI four-option pages (browser)', { skip }, () => {
  let server, base, browser, adminToken;

  before(async () => {
    server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await pw.chromium.launch({ executablePath, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: base }, body: JSON.stringify({ email: 'superadmin@unified.cloud', password: 'SuperAdmin2026!' }) });
    adminToken = (await login.json()).token;
  });
  after(async () => {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
    for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + s); } catch { /* not created */ } }
  });

  async function open(hash = '', viewport = { width: 1366, height: 900 }) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(base + '/' + hash, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    return { page, context, errors };
  }
  const visiblePage = (page) => page.evaluate(() => { const el = document.querySelector('.pg.on'); return el ? el.id : null; });
  const admin = (method, p, body) => fetch(base + '/api/admin/agentic/' + p, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, origin: base }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, data: await r.json() }));
  const uniqueEmail = () => `buyer${Math.random().toString(36).slice(2, 8)}@example.com`;

  it('the hub shows the four options with a link to each subpage and a way to compare them', async () => {
    const { page, context, errors } = await open('#p-agentic');
    assert.equal(await visiblePage(page), 'pg-agentic');
    const cards = await page.$$eval('#pg-agentic .agx-hub .vc', els => els.map(e => ({ title: e.querySelector('h3').textContent, href: e.querySelector('a.vb').getAttribute('href') })));
    assert.deepEqual(cards, [
      { title: 'Ready-Made AI', href: '#p-agentic-ready' },
      { title: 'Customized Agentic AI', href: '#p-agentic-custom' },
      { title: 'Branded Agentic AI', href: '#p-agentic-branded' },
      { title: 'Chat-Only AI', href: '#p-agentic-chat' }
    ]);
    assert.ok(await page.$('#pg-agentic .agx-chooser table'));
    assert.ok(await page.$('#pg-agentic [data-agx-tracker] [data-t-go]'));
    assert.deepEqual(errors, []);
    await context.close();
  });

  for (const [name, spec] of Object.entries(PAGES)) {
    it(`${name}: opens from the hub, shows its own form, and links back to Agentic AI`, async () => {
      const { page, context, errors } = await open('#p-agentic');
      await page.click(`#pg-agentic .agx-hub a[href="${spec.hash}"]`);
      await page.waitForTimeout(800);
      assert.equal(await visiblePage(page), 'pg-' + spec.hash.slice(3));
      const root = `#pg-${spec.hash.slice(3)} [data-agx="${spec.mount}"]`;
      await page.waitForSelector(`${root} .agx-hero`);
      assert.match(await page.textContent(`${root} .agx-hero h2`), spec.title);
      assert.ok(await page.$(`${root} .agx-crumb a[href="#p-agentic"]`), 'breadcrumb back to the main section');
      await page.click(`${root} .agx-crumb a`);
      await page.waitForTimeout(500);
      assert.equal(await visiblePage(page), 'pg-agentic');
      assert.deepEqual(errors, []);
      await context.close();
    });

    it(`${name}: a direct URL works, survives a refresh, and Back returns to the previous page`, async () => {
      const { page, context, errors } = await open(spec.hash);
      assert.equal(await visiblePage(page), 'pg-' + spec.hash.slice(3));
      await page.waitForSelector(`[data-agx="${spec.mount}"] .agx-hero`);
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(1500);
      assert.equal(await visiblePage(page), 'pg-' + spec.hash.slice(3));
      await page.waitForSelector(`[data-agx="${spec.mount}"] .agx-hero`);
      await page.evaluate(() => { location.hash = '#p-agentic'; });
      await page.waitForTimeout(500);
      assert.equal(await visiblePage(page), 'pg-agentic');
      await page.goBack();
      await page.waitForTimeout(500);
      assert.equal(await visiblePage(page), 'pg-' + spec.hash.slice(3));
      assert.deepEqual(errors, []);
      await context.close();
    });

    it(`${name}: fits a 390px phone without horizontal scrolling`, async () => {
      const { page, context } = await open(spec.hash, { width: 390, height: 800 });
      await page.waitForSelector(`[data-agx="${spec.mount}"] .agx-hero`);
      const overflow = await page.evaluate((id) => { const el = document.getElementById(id); return el.scrollWidth - el.clientWidth; }, 'pg-' + spec.hash.slice(3));
      assert.ok(overflow <= 1, `horizontal overflow of ${overflow}px`);
      await context.close();
    });
  }

  it('Ready-Made: compare solutions, choose one, see its price, and place an order', async () => {
    const { page, context, errors } = await open('#p-agentic-ready');
    const root = '[data-agx="READY_MADE"]';
    await page.waitForSelector(`${root} .agx-products`);
    assert.equal((await page.$$(`${root} .agx-products label`)).length, 3);
    await page.click(`${root} [data-compare]`);
    assert.ok(await page.isVisible(`${root} .agx-compare`));
    await page.click(`${root} .agx-products label:nth-child(2)`);
    assert.match(await page.textContent(`${root} [data-sum]`), /Knowledge Assistant/);
    assert.match(await page.textContent(`${root} [data-sum]`), /Initial payment/);
    await page.click(`${root} [data-pay]`);
    assert.match(await page.textContent(`${root} [data-formerr]`), /contact details/i);
    const email = uniqueEmail();
    await page.fill(`${root} [data-k="name"]`, 'Test Buyer');
    await page.fill(`${root} [data-k="email"]`, email);
    await page.click(`${root} [data-pay]`);
    await page.waitForSelector(`${root} .agx-done`);
    assert.match(await page.textContent(`${root} .agx-done`), /AGT-\d{4}-[A-Z0-9]{8}/);
    const order = (await admin('GET', 'orders?search=' + encodeURIComponent(email))).data.orders[0];
    assert.equal(order.configCode, 'READY_MADE');
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('Chat-Only: validates required fields, hides voice, and saves the chatbot configuration', async () => {
    const { page, context, errors } = await open('#p-agentic-chat');
    const root = '[data-agx="CHAT_ONLY"]';
    await page.waitForSelector(`${root} [data-pay]`);
    assert.equal(await page.$(`${root} [data-voice]`), null, 'no voice option for chat-only');
    const email = uniqueEmail();
    await page.fill(`${root} [data-k="name"]`, 'Chat Buyer');
    await page.fill(`${root} [data-k="email"]`, email);
    await page.click(`${root} [data-pay]`);
    assert.match(await page.textContent(`${root} [data-field="purpose"] .agx-ferr`), /required/i);
    await page.fill(`${root} [data-k="purpose"]`, 'Answer product questions on our website');
    await page.fill(`${root} [data-k="languages"]`, 'English, Bengali');
    await page.fill(`${root} [data-k="websiteUrl"]`, 'https://www.example.com');
    await page.fill(`${root} [data-paste]`, 'বাংলা  text\n123');
    assert.match(await page.textContent(`${root} [data-docs]`), /\b15\b/);
    await page.click(`${root} [data-pay]`);
    await page.waitForSelector(`${root} .agx-done`);
    const found = (await admin('GET', 'orders?search=' + encodeURIComponent(email))).data.orders[0];
    assert.equal(found.configCode, 'CHAT_ONLY');
    assert.equal(found.ragChars, 15);
    assert.equal(found.initialTotal, 21015);
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('Customized: validates, submits, and the customer follows the quotation through payment verification', async () => {
    const { page, context, errors } = await open('#p-agentic-custom');
    const root = '[data-agx="CUSTOMIZED"]';
    await page.waitForSelector(`${root} [data-submit]`);
    const email = uniqueEmail();
    await page.fill(`${root} [data-k="name"]`, 'Custom Buyer');
    await page.fill(`${root} [data-k="email"]`, email);
    await page.click(`${root} [data-submit]`);
    assert.match(await page.textContent(`${root} [data-field="businessName"] .agx-ferr`), /required/i);
    await page.fill(`${root} [data-k="businessName"]`, 'Acme Trading');
    await page.fill(`${root} [data-k="businessDescription"]`, 'We import and sell goods across Bangladesh.');
    await page.fill(`${root} [data-k="objectives"]`, 'Reduce support load by half');
    await page.fill(`${root} [data-k="aiCapabilities"]`, 'Answer questions and look up orders');
    await page.fill(`${root} [data-k="integrations"]`, 'Odoo ERP, WhatsApp Business');
    await page.click(`${root} [data-submit]`);
    await page.waitForSelector(`${root} .agx-done`);
    const ref = (await page.textContent(`${root} .agx-refline code`)).trim();
    assert.match(ref, /^REQ-\d{4}-[A-Z0-9]{8}$/);

    // The confirmation hands over to the tracker on the main page.
    await page.click(`${root} [data-agx-track]`);
    await page.waitForSelector('#pg-agentic [data-t-out] .agx-stepper');
    assert.equal(await visiblePage(page), 'pg-agentic');
    assert.match(await page.textContent('#pg-agentic [data-t-out]'), /Pending Analysis/);

    // Admin: review, quote, send.
    const list = (await admin('GET', 'requests?search=' + encodeURIComponent(email))).data.requests;
    assert.equal(list.length, 1);
    assert.equal(list[0].category, 'CUSTOMIZED');
    const id = list[0].id;
    await admin('POST', `requests/${id}/quotation`, { scope: 'Support agent', proposedSolution: 'RAG agent with order lookup', developmentCost: 40000, additionalCharges: [{ label: 'Integration', amount: 5000 }], timelineDays: 30, validityDays: 14, paymentInstructions: 'Bank transfer; use the invoice number as reference.' });
    assert.equal((await admin('POST', `requests/${id}/quotation/send`)).status, 200);

    // Customer: sees the quotation and accepts it.
    await page.click('#pg-agentic [data-t-go]');
    await page.waitForSelector('#pg-agentic [data-r="accept"]');
    const quote = await page.textContent('#pg-agentic .agx-quote');
    assert.match(quote, /৳45,000/);
    assert.match(quote, /30 days/);
    await page.click('#pg-agentic [data-r="accept"]');
    await page.waitForSelector('#pg-agentic [data-pay-ref]');
    assert.match(await page.textContent('#pg-agentic [data-t-out]'), /Awaiting Payment/);

    // Customer reports a payment reference. That alone never approves the order.
    await page.fill('#pg-agentic [data-p-ref]', 'BKASH' + Date.now());
    await page.click('#pg-agentic [data-pay-ref]');
    await page.waitForTimeout(800);
    assert.match(await page.textContent('#pg-agentic [data-t-out]'), /Payment Verification/);
    assert.equal((await admin('GET', `requests/${id}`)).data.status, 'PAYMENT_VERIFICATION');

    // Admin verifies; the customer sees Approved.
    const detail = (await admin('GET', `requests/${id}`)).data;
    assert.equal((await admin('POST', `requests/${id}/payments/${detail.payments[0].id}/verify`, { verifiedAmount: 45000 })).status, 200);
    await page.click('#pg-agentic [data-t-go]');
    await page.waitForTimeout(800);
    assert.match(await page.textContent('#pg-agentic [data-t-out]'), /Approved/);
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('Branded: uploads a logo, submits, and the request is stored as Branded with its file', async () => {
    const { page, context, errors } = await open('#p-agentic-branded');
    const root = '[data-agx="BRANDED"]';
    await page.waitForSelector(`${root} [data-submit]`);
    const email = uniqueEmail();
    await page.fill(`${root} [data-k="brandName"]`, 'Acme');
    await page.fill(`${root} [data-k="brandColors"]`, 'red');
    await page.fill(`${root} [data-k="requiredCapabilities"]`, 'Greet visitors and capture leads');
    await page.fill(`${root} [data-k="name"]`, 'Brand Buyer');
    await page.fill(`${root} [data-k="email"]`, email);
    await page.click(`${root} [data-submit]`);
    await page.waitForTimeout(800);   // the server validates the colors; its answer arrives asynchronously
    assert.match(await page.textContent(`${root} [data-field="brandColors"] .agx-ferr`), /hex/i, 'invalid colors are rejected by the server and shown on the field');
    await page.fill(`${root} [data-k="brandColors"]`, '#0A2540, #5cf0ff');
    await page.setInputFiles(`${root} [data-file="logo"]`, { name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await page.click(`${root} [data-submit]`);
    await page.waitForSelector(`${root} .agx-done`);
    const found = (await admin('GET', 'requests?search=' + encodeURIComponent(email))).data.requests[0];
    assert.equal(found.category, 'BRANDED');
    const detail = (await admin('GET', `requests/${found.id}`)).data;
    assert.equal(detail.files.length, 1);
    assert.equal(detail.files[0].kind, 'logo');
    assert.ok(detail.requirements.some(r => r.key === 'brandColors' && r.value === '#0a2540, #5cf0ff'));
    // The only console noise allowed is the 400 this test provokes on purpose with an invalid colour.
    assert.deepEqual(errors.filter(e => !/status of 400/.test(e)), []);
    await context.close();
  });

  it('Admin: reviews a request, writes and sends a quotation, verifies a payment, and manages a Ready-Made product', async () => {
    const email = uniqueEmail();
    const created = await (await fetch(base + '/api/public/agentic/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'CUSTOMIZED', idempotencyKey: 'admin-ui-' + Date.now(), customer: { name: 'Admin UI Buyer', email }, fields: { businessName: 'Acme', businessDescription: 'We sell goods.', objectives: 'Fewer tickets', aiCapabilities: 'Answer questions' } })
    })).json();

    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const login = await context.request.post(base + '/api/auth/login', { data: { email: 'superadmin@unified.cloud', password: 'SuperAdmin2026!' }, headers: { origin: base } });
    assert.equal(login.status(), 200);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept(d.defaultValue()));
    await page.goto(base + '/admin', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => switchAdminView('agentic'));
    await page.waitForTimeout(1200);

    // the request appears in the table and opens
    const row = page.locator('#agxReqBody tr', { hasText: created.requestRef });
    await row.waitFor();
    assert.match(await row.textContent(), /Pending Analysis/);
    await row.locator('button').click();
    await page.waitForSelector('#agxQuoteForm');
    assert.match(await page.textContent('#agxReqBodyDetail'), /Acme/);

    // write the quotation; sending it moves the request to Quotation Sent
    await page.fill('#agxQuoteForm [name="scope"]', 'Support agent for the web shop');
    await page.fill('#agxQuoteForm [name="proposedSolution"]', 'RAG agent with order lookup');
    await page.fill('#agxQuoteForm [name="developmentCost"]', '40000');
    await page.fill('#agxQuoteForm [name="timelineDays"]', '30');
    await page.fill('#agxQuoteForm [name="additionalCharges"]', 'Integration | 5000');
    await page.fill('#agxQuoteForm [name="paymentInstructions"]', 'Bank transfer to the account on the invoice.');
    await page.click('#agxQuoteForm button[type="submit"]');
    await page.waitForTimeout(1000);
    assert.match(await page.textContent('#agxReqBodyDetail'), /v1 · DRAFT · ৳45,000/);
    await page.click('#agxQuoteForm button:has-text("Send quotation")');
    await page.waitForTimeout(1200);
    const afterSend = (await admin('GET', 'requests?search=' + encodeURIComponent(email))).data.requests[0];
    assert.equal(afterSend.status, 'QUOTATION_SENT');

    // the customer accepts and reports a payment through the public API; the admin verifies it in the UI
    const track = async (path, body) => (await fetch(base + '/api/public/agentic/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ...body }) })).json();
    await track(`requests/${created.requestRef}/respond`, { action: 'accept' });
    await track(`requests/${created.requestRef}/payment`, { method: 'BANK_TRANSFER', reference: 'TT' + Date.now(), amount: 45000 });
    await page.evaluate((id) => openAgenticRequest(id), afterSend.id);
    await page.waitForSelector('#agxReqBodyDetail button:has-text("Verify")');
    await page.click('#agxReqBodyDetail button:has-text("Verify")');
    await page.waitForTimeout(1200);
    assert.equal((await admin('GET', `requests/${afterSend.id}`)).data.status, 'APPROVED');

    // manage a Ready-Made product from the form
    await page.fill('#agxProdForm [name="name"]', 'Sales Assistant');
    await page.fill('#agxProdForm [name="capabilities"]', 'Lead capture\nMeeting booking');
    await page.fill('#agxProdForm [name="setupFee"]', '2500');
    await page.click('#agxProdSave');
    await page.waitForTimeout(1000);
    assert.match(await page.textContent('#agxProdBody'), /Sales Assistant/);
    const catalog = await (await fetch(base + '/api/public/agentic/catalog')).json();
    assert.ok(catalog.products.some(p => p.code === 'SALES_ASSISTANT' && p.setupFee === 2500));
    assert.deepEqual(errors, []);
    await context.close();
  });
});
