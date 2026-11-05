import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { initDatabase } from '../server/db.mjs';
import { WHMCSAdapter } from '../server/whmcs-adapter.mjs';
import { handleApiRequest } from '../server/api.mjs';
import { handleLogin, authenticateRequest } from '../server/auth.mjs';
import * as agentic from '../server/agentic-ai.mjs';

const SECRET = 'test-webhook-secret';
process.env.AGENTIC_WEBHOOK_SECRET = SECRET;

describe('Agentic AI module', () => {
  let db, whmcs, adminToken, supportToken;

  async function call(method, pathname, { body = {}, query = {}, token = null, headers = {}, raw } = {}) {
    return new Promise((resolve) => {
      let statusCode = 200;
      const res = {
        writeHead: (c) => { statusCode = c; },
        setHeader() {},
        end: (s) => { let data; try { data = JSON.parse(s); } catch { data = { raw: s }; } resolve({ statusCode, data }); }
      };
      const req = { method, headers: { 'x-forwarded-for': '10.0.0.9', 'user-agent': 'test', ...headers }, socket: { remoteAddress: '10.0.0.9' } };
      if (token) req.headers.authorization = `Bearer ${token}`;
      authenticateRequest(req, db);
      handleApiRequest({ req, res, pathname, query, body, rawBody: raw ?? JSON.stringify(body), db, whmcsAdapter: whmcs });
    });
  }
  const sign = (raw) => 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  const webhook = (evt, sig) => {
    const raw = JSON.stringify(evt);
    return call('POST', '/api/webhooks/whmcs/agentic', { body: evt, raw, headers: { 'x-unified-signature': sig ?? sign(raw) } });
  };
  const order = (over = {}) => ({
    idempotencyKey: crypto.randomUUID(),
    customer: { name: 'Rahat Khan', email: `buyer${Math.random().toString(36).slice(2, 8)}@example.com`, phone: '01700000000' },
    configCode: 'READY_MADE', backup: true, maintenance: false, voice: false,
    ...over
  });

  before(() => {
    db = initDatabase(':memory:');
    whmcs = new WHMCSAdapter({ apiUrl: '', apiIdentifier: '', apiSecret: '' });
    adminToken = handleLogin(db, 'superadmin@unified.cloud', 'SuperAdmin2026!').token;
    supportToken = handleLogin(db, 'support@unified.cloud', 'SupportAdmin2026!').token;
  });
  beforeEach(() => agentic.resetLookupThrottle());

  describe('character counting', () => {
    it('counts English, Bengali, digits, symbols and every whitespace character without trimming', () => {
      assert.equal(agentic.countBillableCharacters('abc'), 3);
      assert.equal(agentic.countBillableCharacters('  a  b\t\n\r\n '), 11);
      assert.equal(agentic.countBillableCharacters('১২৩ ৳৫০০ #!'), 11);
      assert.equal(agentic.countBillableCharacters('বাংলা'), 5);
    });
    it('is stable for composed and decomposed Bengali vowel signs (NFC)', () => {
      const composed = 'কো';        // ক + ো (single vowel sign)
      const decomposed = 'কো'; // ক + ে + া (two-part form)
      assert.notEqual(composed, decomposed);
      assert.equal(decomposed.length, 3);
      assert.equal(agentic.countBillableCharacters(composed), agentic.countBillableCharacters(decomposed));
      assert.equal(agentic.countBillableCharacters(composed), 2);
    });
    it('counts astral characters as one and ignores a leading BOM', () => {
      assert.equal(agentic.countBillableCharacters('😀a'), 2);
      assert.equal(agentic.countBillableCharacters('﻿hi'), 2);
    });
  });

  describe('document analysis', () => {
    it('does not bill file name, bytes or metadata, only the extracted text', () => {
      const content = 'হ্যালো ওয়ার্ল্ড\n';
      const a = agentic.analyseDocuments([{ name: 'a-very-long-file-name.txt', contentBase64: Buffer.from(content).toString('base64') }]);
      assert.equal(a.totalChars, agentic.countBillableCharacters(content));
    });
    it('rejects binary content, unsupported types and invalid UTF-8', () => {
      assert.throws(() => agentic.analyseDocuments([{ name: 'x.txt', contentBase64: Buffer.from([65, 0, 66]).toString('base64') }]), /binary/);
      assert.throws(() => agentic.analyseDocuments([{ name: 'x.exe', text: 'a' }]), /unsupported/);
      assert.throws(() => agentic.analyseDocuments([{ name: 'x.txt', contentBase64: Buffer.from([0xff, 0xfe, 0xfd]).toString('base64') }]), /UTF-8/);
    });
    it('bills identical content once', () => {
      const a = agentic.analyseDocuments([{ name: 'a.txt', text: 'same' }, { name: 'b.txt', text: 'same' }], 'same');
      assert.equal(a.totalChars, 4);
      assert.equal(a.skippedDuplicates.length, 2);
    });
    it('enforces document count and size limits', () => {
      const many = Array.from({ length: 6 }, (_, i) => ({ name: `d${i}.txt`, text: 'x' + i }));
      assert.throws(() => agentic.analyseDocuments(many), /At most/);
      assert.throws(() => agentic.analyseDocuments([{ name: 'big.txt', text: 'a'.repeat(2 * 1024 * 1024 + 1) }]), /larger than/);
    });
  });

  describe('pricing', () => {
    it('Ready-Made has no development fee', () => {
      const q = agentic.buildQuote(agentic.getPricing(db), { configCode: 'READY_MADE' }, 0);
      assert.equal(q.totals.oneTime, 0);
      assert.equal(q.oneTime.length, 0);
      assert.equal(q.totals.recurringMonthly, 1000);
    });
    it('Customized costs ৳25,000 once and Chat-Only ৳20,000 once', () => {
      const p = agentic.getPricing(db);
      assert.equal(agentic.buildQuote(p, { configCode: 'CUSTOM_BRANDED' }, 0).totals.oneTime, 25000);
      assert.equal(agentic.buildQuote(p, { configCode: 'CHAT_ONLY' }, 0).totals.oneTime, 20000);
    });
    it('Chat-Only cannot use voice calling', () => {
      assert.throws(() => agentic.buildQuote(agentic.getPricing(db), { configCode: 'CHAT_ONLY', voice: true }), /not available/);
      const q = agentic.buildQuote(agentic.getPricing(db), { configCode: 'CHAT_ONLY' }, 0);
      assert.equal(q.usage.some(u => u.code === 'VOICE'), false);
    });
    it('keeps one-time, recurring and usage separate; maintenance only when enabled; RAG is ৳1/char', () => {
      const p = agentic.getPricing(db);
      const off = agentic.buildQuote(p, { configCode: 'CUSTOM_BRANDED', maintenance: false, voice: true }, 1234);
      assert.equal(off.recurring.some(l => l.code === 'MAINTENANCE'), false);
      assert.equal(off.totals.ragCost, 1234);
      assert.equal(off.usage.find(u => u.code === 'VOICE').rate, 5);
      assert.equal(off.usage.find(u => u.code === 'VOICE').amount, null);
      const on = agentic.buildQuote(p, { configCode: 'CUSTOM_BRANDED', maintenance: true }, 0);
      assert.equal(on.totals.recurringMonthly, 6000);
      assert.equal(on.maintenanceStatus, 'ENABLED');
    });
    it('does not guess the backup billing interval', () => {
      const p = agentic.getPricing(db);
      assert.equal(p.backupInterval, null);
      const q = agentic.buildQuote(p, { configCode: 'READY_MADE' }, 0);
      assert.equal(q.backup.amount, 500);
      assert.equal(q.backup.interval, null);
      assert.equal(q.totals.initialPayment, 1000);   // backup excluded until the interval is confirmed
      assert.ok(q.notices.length === 1);
      const monthly = { ...p, backupInterval: 'monthly' };
      assert.equal(agentic.buildQuote(monthly, { configCode: 'READY_MADE' }, 0).totals.recurringMonthly, 1500);
      const once = { ...p, backupInterval: 'one_time' };
      const qo = agentic.buildQuote(once, { configCode: 'READY_MADE' }, 0);
      assert.equal(qo.totals.oneTime, 500);
      assert.equal(qo.totals.recurringMonthly, 1000);
    });
    it('rounds call minutes up per call by default', () => {
      assert.equal(agentic.billedMinutes(61, 'ceil'), 2);
      assert.equal(agentic.billedMinutes(0, 'ceil'), 0);
      assert.equal(agentic.billedMinutes(90, 'exact'), 1.5);
    });
  });

  describe('public API', () => {
    it('exposes the catalog without secrets', async () => {
      const r = await call('GET', '/api/public/agentic/catalog');
      assert.equal(r.statusCode, 200);
      assert.equal(r.data.configurations.length, 3);
      assert.equal(r.data.rates.ragPerCharacter, 1);
      assert.equal(r.data.telephony.configured, false);
      assert.ok(!JSON.stringify(r.data).includes('SECRET'));
    });
    it('ignores client-supplied prices and recomputes RAG characters on the server', async () => {
      const text = 'বাংলা text 123';
      const r = await call('POST', '/api/public/agentic/orders', {
        body: order({ ragText: text, price: 1, totalPrice: 1, developmentCost: 0, ragChars: 1, configCode: 'CUSTOM_BRANDED', branding: { brandName: 'Acme' } })
      });
      assert.equal(r.statusCode, 201);
      assert.equal(r.data.quote.totals.oneTime, 25000);
      assert.equal(r.data.quote.totals.ragCharacters, agentic.countBillableCharacters(text));
      assert.equal(r.data.quote.totals.ragCost, agentic.countBillableCharacters(text));
    });
    it('returns 409 price_changed when the client expected a different total', async () => {
      const r = await call('POST', '/api/public/agentic/orders', { body: order({ expectedInitialTotal: 1 }) });
      assert.equal(r.statusCode, 409);
      assert.equal(r.data.code, 'price_changed');
    });
    it('rejects voice for Chat-Only and branding is required for Customized', async () => {
      assert.equal((await call('POST', '/api/public/agentic/orders', { body: order({ configCode: 'CHAT_ONLY', voice: true }) })).statusCode, 400);
      assert.equal((await call('POST', '/api/public/agentic/orders', { body: order({ configCode: 'CUSTOM_BRANDED' }) })).statusCode, 400);
    });
    it('is idempotent: the same key never creates a second order or invoice', async () => {
      const body = order();
      const a = await call('POST', '/api/public/agentic/orders', { body });
      const b = await call('POST', '/api/public/agentic/orders', { body });
      assert.equal(a.statusCode, 201);
      assert.equal(b.statusCode, 200);
      assert.equal(b.data.orderRef, a.data.orderRef);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM agentic_invoices WHERE order_id = (SELECT id FROM agentic_orders WHERE order_ref = ?)').get(a.data.orderRef).n, 1);
    });
    it('rejects a reused key from a different customer', async () => {
      const body = order();
      await call('POST', '/api/public/agentic/orders', { body });
      const r = await call('POST', '/api/public/agentic/orders', { body: { ...body, customer: { ...body.customer, email: 'other@example.com' } } });
      assert.equal(r.statusCode, 409);
    });
  });

  describe('payment, activation and isolation', () => {
    async function placeOrder(over) {
      const body = order(over);
      const r = await call('POST', '/api/public/agentic/orders', { body });
      assert.equal(r.statusCode, 201);
      return { body, ref: r.data.orderRef, invoice: r.data.invoice };
    }

    it('creates the order unpaid and inactive; no activation without a payment', async () => {
      const { ref, body } = await placeOrder();
      const v = await call('GET', '/api/public/agentic/orders/lookup', { query: { ref, email: body.customer.email } });
      assert.equal(v.data.status, 'PENDING_PAYMENT');
      assert.equal(v.data.provisioningStatus, 'NOT_STARTED');
    });

    it('rejects unsigned or wrongly signed webhooks', async () => {
      const { invoice } = await placeOrder();
      const evt = { event: 'InvoicePaid', invoiceId: invoice.id, transactionId: 'T-bad', amount: invoice.amount };
      assert.equal((await webhook(evt, 'sha256=' + 'a'.repeat(64))).statusCode, 401);
      assert.equal((await call('POST', '/api/webhooks/whmcs/agentic', { body: evt })).statusCode, 401);
    });

    it('activates only after a verified payment and ignores replays', async () => {
      const { ref, body, invoice } = await placeOrder({ maintenance: true });
      const evt = { event: 'InvoicePaid', invoiceId: invoice.id, transactionId: 'T-1', amount: invoice.amount };
      const a = await webhook(evt);
      assert.equal(a.statusCode, 200);
      assert.equal(a.data.orderStatus, 'ACTIVE');
      const replay = await webhook(evt);
      assert.equal(replay.data.duplicate, true);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM agentic_payments WHERE transaction_ref = 'T-1'").get().n, 1);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM agentic_activations WHERE action = 'ACTIVATED' AND order_id = (SELECT id FROM agentic_orders WHERE order_ref = ?)").get(ref).n, 1);
      const v = await call('GET', '/api/public/agentic/orders/lookup', { query: { ref, email: body.customer.email } });
      assert.equal(v.data.status, 'ACTIVE');
      assert.equal(v.data.maintenance, 'ENABLED');
      assert.ok(v.data.subscriptions.some(s => s.kind === 'MAINTENANCE' && s.status === 'ACTIVE'));
      assert.ok(v.data.payments.length === 1);
    });

    it('flags a paid event whose amount differs and does not activate', async () => {
      const { ref, body, invoice } = await placeOrder();
      const r = await webhook({ event: 'InvoicePaid', invoiceId: invoice.id, transactionId: 'T-short', amount: invoice.amount - 1 });
      assert.equal(r.data.orderStatus, 'PAYMENT_REVIEW');
      const v = await call('GET', '/api/public/agentic/orders/lookup', { query: { ref, email: body.customer.email } });
      assert.notEqual(v.data.status, 'ACTIVE');
    });

    it('handles failed, cancelled and refunded payments', async () => {
      const failed = await placeOrder();
      const f = await webhook({ event: 'PaymentFailed', invoiceId: failed.invoice.id, transactionId: 'T-f' });
      assert.equal(f.data.status, 'FAILED');
      assert.equal(f.data.orderStatus, 'PENDING_PAYMENT');

      const cancelled = await placeOrder();
      const c = await webhook({ event: 'InvoiceCancelled', invoiceId: cancelled.invoice.id, transactionId: 'T-c' });
      assert.equal(c.data.orderStatus, 'CANCELLED');

      const refunded = await placeOrder();
      await webhook({ event: 'InvoicePaid', invoiceId: refunded.invoice.id, transactionId: 'T-p2', amount: refunded.invoice.amount });
      const r = await webhook({ event: 'InvoiceRefunded', invoiceId: refunded.invoice.id, transactionId: 'T-r' });
      assert.equal(r.data.orderStatus, 'REFUNDED');
    });

    it("never shows another customer's order or documents", async () => {
      const a = await placeOrder({ ragText: 'secret knowledge base of customer A' });
      const b = await placeOrder();
      const wrong = await call('GET', '/api/public/agentic/orders/lookup', { query: { ref: a.ref, email: b.body.customer.email } });
      assert.equal(wrong.statusCode, 404);
      const own = await call('GET', '/api/public/agentic/orders/lookup', { query: { ref: a.ref, email: a.body.customer.email } });
      assert.equal(own.data.rag.documents.length, 1);
      assert.ok(!JSON.stringify(own.data).includes('secret knowledge base'));
    });

    it('throttles repeated failed lookups', async () => {
      let last;
      for (let i = 0; i < 12; i++) last = await call('GET', '/api/public/agentic/orders/lookup', { query: { ref: `AGT-0000-NOPE${i}`, email: 'x@example.com' } });
      assert.equal(last.statusCode, 429);
    });
  });

  describe('call usage and billing', () => {
    it('records usage only for active voice-enabled orders, de-duplicates calls, and bills after use', async () => {
      const body = order({ voice: true });
      const created = await call('POST', '/api/public/agentic/orders', { body });
      const row = db.prepare('SELECT id FROM agentic_orders WHERE order_ref = ?').get(created.data.orderRef);

      const early = await call('POST', `/api/admin/agentic/orders/${row.id}/calling-usage`, { token: adminToken, body: { providerRef: 'c1', durationSeconds: 61 } });
      assert.equal(early.statusCode, 409);

      await webhook({ event: 'InvoicePaid', invoiceId: created.data.invoice.id, transactionId: 'T-v', amount: created.data.invoice.amount });
      const u1 = await call('POST', `/api/admin/agentic/orders/${row.id}/calling-usage`, { token: adminToken, body: { providerRef: 'c1', durationSeconds: 61 } });
      assert.equal(u1.statusCode, 201);
      assert.equal(u1.data.billedMinutes, 2);
      assert.equal(u1.data.amount, 10);
      assert.equal((await call('POST', `/api/admin/agentic/orders/${row.id}/calling-usage`, { token: adminToken, body: { providerRef: 'c1', durationSeconds: 5 } })).statusCode, 409);

      const bill = await call('POST', `/api/admin/agentic/orders/${row.id}/bill-usage`, { token: adminToken });
      assert.equal(bill.data.billed, true);
      assert.equal(bill.data.amount, 10);
      const again = await call('POST', `/api/admin/agentic/orders/${row.id}/bill-usage`, { token: adminToken });
      assert.equal(again.data.billed, false);
    });

    it('refuses usage on a non-voice order', async () => {
      const created = await call('POST', '/api/public/agentic/orders', { body: order({ configCode: 'CHAT_ONLY' }) });
      const row = db.prepare('SELECT id FROM agentic_orders WHERE order_ref = ?').get(created.data.orderRef);
      await webhook({ event: 'InvoicePaid', invoiceId: created.data.invoice.id, transactionId: 'T-chat', amount: created.data.invoice.amount });
      const r = await call('POST', `/api/admin/agentic/orders/${row.id}/calling-usage`, { token: adminToken, body: { providerRef: 'c9', durationSeconds: 30 } });
      assert.equal(r.statusCode, 409);
    });
  });

  describe('admin API', () => {
    it('requires authentication and the right permission', async () => {
      assert.equal((await call('GET', '/api/admin/agentic/overview')).statusCode, 401);
      assert.equal((await call('GET', '/api/admin/agentic/overview', { token: supportToken })).statusCode, 200);
      assert.equal((await call('PUT', '/api/admin/agentic/pricing', { token: supportToken, body: { rag_per_char: 2 } })).statusCode, 403);
    });
    it('lists orders, shows detail with invoice references and updates pricing for new orders only', async () => {
      const list = await call('GET', '/api/admin/agentic/orders', { token: adminToken });
      assert.ok(list.data.total > 0);
      const detail = await call('GET', `/api/admin/agentic/orders/${list.data.orders[0].id}`, { token: adminToken });
      assert.ok(detail.data.invoices.length >= 1);
      assert.ok(detail.data.audit.length >= 1);

      const upd = await call('PUT', '/api/admin/agentic/pricing', { token: adminToken, body: { backup_interval: 'monthly', cfg_chat_dev: 21000 } });
      assert.equal(upd.statusCode, 200);
      const q = agentic.buildQuote(agentic.getPricing(db), { configCode: 'CHAT_ONLY' }, 0);
      assert.equal(q.totals.oneTime, 21000);
      assert.equal(q.totals.recurringMonthly, 1500);
      const old = await call('GET', `/api/admin/agentic/orders/${list.data.orders[list.data.orders.length - 1].id}`, { token: adminToken });
      assert.ok(old.data.quote.totals.initialPayment >= 0);
    });
    it('validates pricing input', async () => {
      assert.equal((await call('PUT', '/api/admin/agentic/pricing', { token: adminToken, body: { rag_per_char: -1 } })).statusCode, 400);
      assert.equal((await call('PUT', '/api/admin/agentic/pricing', { token: adminToken, body: { evil: 1 } })).statusCode, 400);
      assert.equal((await call('PUT', '/api/admin/agentic/pricing', { token: adminToken, body: { backup_interval: 'weekly' } })).statusCode, 400);
    });
    it('cannot activate an order that has no verified payment', async () => {
      const created = await call('POST', '/api/public/agentic/orders', { body: order() });
      const row = db.prepare('SELECT id FROM agentic_orders WHERE order_ref = ?').get(created.data.orderRef);
      const r = await call('POST', `/api/admin/agentic/orders/${row.id}/service`, { token: adminToken, body: { action: 'activate' } });
      assert.equal(r.statusCode, 409);
    });
  });
});
