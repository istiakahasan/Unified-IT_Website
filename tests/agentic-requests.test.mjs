import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import { initDatabase } from '../server/db.mjs';
import { WHMCSAdapter } from '../server/whmcs-adapter.mjs';
import { handleApiRequest } from '../server/api.mjs';
import { handleLogin, authenticateRequest } from '../server/auth.mjs';
import * as requests from '../server/agentic-requests.mjs';
import * as mailer from '../server/mailer.mjs';

const SECRET = 'request-test-secret';
process.env.AGENTIC_WEBHOOK_SECRET = SECRET;

// A tiny SMTP server that records every message, so delivery is tested against a real socket.
function startSmtp() {
  const received = [];
  const server = net.createServer((sock) => {
    let data = ''; let inData = false; let msg = '';
    sock.on('error', () => {});   // clients disconnect abruptly after QUIT
    sock.write('220 test ESMTP\r\n');
    sock.on('data', (chunk) => {
      data += chunk.toString('utf8');
      let i;
      while ((i = data.indexOf('\r\n')) >= 0) {
        const line = data.slice(0, i); data = data.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; received.push(msg); msg = ''; sock.write('250 queued\r\n'); } else msg += line + '\n';
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO')) sock.write('250-test\r\n250 AUTH LOGIN\r\n');
        else if (cmd.startsWith('MAIL FROM') || cmd.startsWith('RCPT TO')) sock.write('250 ok\r\n');
        else if (cmd === 'DATA') { inData = true; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 ok\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, received, port: server.address().port })));
}

const decodeBody = (raw) => {
  const body = raw.split('\n\n').slice(1).join('\n\n').replace(/\n/g, '');
  return Buffer.from(body, 'base64').toString('utf8');
};

describe('Agentic AI quotation workflow (Customized and Branded)', () => {
  let db, whmcs, adminToken, supportToken, smtp;

  async function call(method, pathname, { body = {}, query = {}, token = null, headers = {}, raw } = {}) {
    return new Promise((resolve) => {
      let statusCode = 200; let hdrs = {};
      const res = {
        writeHead: (c, h) => { statusCode = c; hdrs = h || {}; },
        setHeader() {},
        end: (s) => {
          let data;
          if (Buffer.isBuffer(s)) data = { buffer: s };
          else { try { data = JSON.parse(s); } catch { data = { raw: s }; } }
          resolve({ statusCode, data, headers: hdrs });
        }
      };
      const req = { method, headers: { 'x-forwarded-for': '10.0.0.7', 'user-agent': 'test', ...headers }, socket: { remoteAddress: '10.0.0.7' } };
      if (token) req.headers.authorization = `Bearer ${token}`;
      authenticateRequest(req, db);
      handleApiRequest({ req, res, pathname, query, body, rawBody: raw ?? JSON.stringify(body), db, whmcsAdapter: whmcs });
    });
  }
  const sign = (raw) => 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  const webhook = (evt) => { const raw = JSON.stringify(evt); return call('POST', '/api/webhooks/whmcs/agentic', { body: evt, raw, headers: { 'x-unified-signature': sign(raw) } }); };

  const email = () => `cust${Math.random().toString(36).slice(2, 8)}@example.com`;
  const customFields = { businessName: 'Acme Trading', businessDescription: 'We import and sell goods.', objectives: 'Cut support load', aiCapabilities: 'Answer questions and update orders' };
  const brandFields = { brandName: 'Acme', requiredCapabilities: 'Greet visitors and capture leads', brandColors: '#0A2540, #5cf0ff' };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]).toString('base64');
  const submit = (over = {}) => call('POST', '/api/public/agentic/requests', {
    body: { category: 'CUSTOMIZED', idempotencyKey: crypto.randomUUID(), customer: { name: 'Rahat Khan', email: email(), phone: '01700000000' }, fields: customFields, ...over }
  });
  const quote = { scope: 'Support agent for the web shop', proposedSolution: 'RAG agent with order lookup tool', developmentCost: 40000, additionalCharges: [{ label: 'Integration', amount: 5000 }], timelineDays: 30, validityDays: 14, paymentInstructions: 'Bank transfer to the account on the invoice.' };

  async function toQuotationSent(over = {}) {
    const s = await submit(over);
    assert.equal(s.statusCode, 201);
    const row = db.prepare('SELECT * FROM agentic_requests WHERE request_ref = ?').get(s.data.requestRef);
    assert.equal((await call('POST', `/api/admin/agentic/requests/${row.id}/quotation`, { token: adminToken, body: quote })).statusCode, 200);
    const sent = await call('POST', `/api/admin/agentic/requests/${row.id}/quotation/send`, { token: adminToken });
    assert.equal(sent.statusCode, 200);
    return { ref: s.data.requestRef, id: row.id, email: row.customer_email };
  }
  const respond = (c, body) => call('POST', `/api/public/agentic/requests/${c.ref}/respond`, { body: { email: c.email, ...body } });
  const status = async (c) => (await call('GET', '/api/public/agentic/track', { query: { ref: c.ref, email: c.email } })).data.status;

  before(async () => {
    db = initDatabase(':memory:');
    whmcs = new WHMCSAdapter({ apiUrl: '', apiIdentifier: '', apiSecret: '' });
    adminToken = handleLogin(db, 'superadmin@unified.cloud', 'SuperAdmin2026!').token;
    supportToken = handleLogin(db, 'support@unified.cloud', 'SupportAdmin2026!').token;
    smtp = await startSmtp();
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(smtp.port);
    process.env.SMTP_SECURE = 'false';
    process.env.MAIL_FROM = 'Unified Cloud <noreply@example.test>';
    process.env.AGENTIC_NOTIFY_EMAIL = 'business@example.test';
  });
  after(async () => {
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'MAIL_FROM', 'AGENTIC_NOTIFY_EMAIL']) delete process.env[k];
    await new Promise(r => smtp.server.close(r));
  });
  beforeEach(() => { requests.resetRequestThrottles(); });

  describe('submission', () => {
    it('validates required fields, field formats and unknown categories', async () => {
      const bad = await submit({ fields: { businessName: 'Only a name' } });
      assert.equal(bad.statusCode, 400);
      assert.ok(bad.data.fields.businessDescription && bad.data.fields.objectives && bad.data.fields.aiCapabilities);
      assert.equal((await submit({ customer: { name: 'A', email: 'nope' } })).statusCode, 400);
      assert.equal((await submit({ category: 'CHAT_ONLY' })).statusCode, 400);
      const color = await submit({ category: 'BRANDED', fields: { ...brandFields, brandColors: 'red' } });
      assert.match(color.data.fields.brandColors, /hex/);
      const dom = await submit({ category: 'BRANDED', fields: { ...brandFields, domain: 'not a domain' } });
      assert.ok(dom.data.fields.domain);
      const sel = await submit({ fields: { ...customFields, timeline: 'whenever' } });
      assert.ok(sel.data.fields.timeline);
    });

    it('saves a Customized request as Pending Analysis with a unique REQ- reference', async () => {
      const a = await submit(); const b = await submit();
      assert.equal(a.statusCode, 201);
      assert.match(a.data.requestRef, /^REQ-\d{4}-[A-Z0-9]{8}$/);
      assert.notEqual(a.data.requestRef, b.data.requestRef);
      assert.equal(a.data.status, 'PENDING_ANALYSIS');
      const row = db.prepare('SELECT * FROM agentic_requests WHERE request_ref = ?').get(a.data.requestRef);
      assert.equal(row.category, 'CUSTOMIZED');
      assert.equal(JSON.parse(row.requirements_json).businessName, 'Acme Trading');
      assert.ok(db.prepare('SELECT 1 FROM customers WHERE email = ?').get(row.customer_email));
    });

    it('is idempotent and rejects a reused key from another customer', async () => {
      const body = { category: 'CUSTOMIZED', idempotencyKey: 'dup-key-12345', customer: { name: 'Rahat Khan', email: email() }, fields: customFields };
      const a = await call('POST', '/api/public/agentic/requests', { body });
      const b = await call('POST', '/api/public/agentic/requests', { body });
      assert.equal(a.statusCode, 201); assert.equal(b.statusCode, 200);
      assert.equal(b.data.requestRef, a.data.requestRef);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM agentic_requests WHERE idempotency_key = ?').get('dup-key-12345').n, 1);
      const other = await call('POST', '/api/public/agentic/requests', { body: { ...body, customer: { name: 'Other', email: 'other@example.com' } } });
      assert.equal(other.statusCode, 409);
    });

    it('limits submissions per email address', async () => {
      const mail = email();
      let last;
      for (let i = 0; i < 6; i++) last = await submit({ customer: { name: 'Spam Bot', email: mail } });
      assert.equal(last.statusCode, 429);
    });

    it('Branded accepts a logo and brand assets, and checks content, type and size', async () => {
      const ok = await submit({ category: 'BRANDED', fields: brandFields, files: [{ kind: 'logo', name: 'logo.png', mime: 'image/png', dataBase64: png }] });
      assert.equal(ok.statusCode, 201);
      const row = db.prepare('SELECT id FROM agentic_requests WHERE request_ref = ?').get(ok.data.requestRef);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM agentic_request_files WHERE request_id = ?').get(row.id).n, 1);
      const fake = await submit({ category: 'BRANDED', fields: brandFields, files: [{ kind: 'logo', name: 'logo.png', mime: 'image/png', dataBase64: Buffer.from('<svg onload=alert(1)>').toString('base64') }] });
      assert.equal(fake.statusCode, 400);
      const svg = await submit({ category: 'BRANDED', fields: brandFields, files: [{ kind: 'logo', name: 'x.svg', mime: 'image/svg+xml', dataBase64: png }] });
      assert.equal(svg.statusCode, 400);
      const big = await submit({ category: 'BRANDED', fields: brandFields, files: [{ kind: 'logo', name: 'b.png', mime: 'image/png', dataBase64: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(1024 * 1024)]).toString('base64') }] });
      assert.equal(big.statusCode, 400);
      const custom = await submit({ category: 'CUSTOMIZED', files: [{ kind: 'logo', name: 'logo.png', mime: 'image/png', dataBase64: png }] });
      assert.equal(custom.statusCode, 400);
    });

    it('keeps Customized and Branded separate in storage and listings', async () => {
      const c = await submit(); const b = await submit({ category: 'BRANDED', fields: brandFields });
      const cList = await call('GET', '/api/admin/agentic/requests', { token: adminToken, query: { category: 'CUSTOMIZED' } });
      const bList = await call('GET', '/api/admin/agentic/requests', { token: adminToken, query: { category: 'BRANDED' } });
      assert.ok(cList.data.requests.some(r => r.requestRef === c.data.requestRef));
      assert.ok(!cList.data.requests.some(r => r.requestRef === b.data.requestRef));
      assert.ok(bList.data.requests.some(r => r.requestRef === b.data.requestRef));
      assert.ok(bList.data.requests.every(r => r.category === 'BRANDED'));
    });
  });

  describe('email notifications', () => {
    it('delivers the complete submission to the business inbox and a confirmation to the customer over SMTP', async () => {
      smtp.received.length = 0;
      const mail = email();
      const s = await submit({ customer: { name: 'Rahat Khan', email: mail }, fields: { ...customFields, integrations: 'Odoo ERP and WhatsApp' } });
      assert.equal(s.data.notifications.business, true);
      assert.equal(s.data.notifications.customer, true);
      assert.equal(smtp.received.length, 2);
      const bodies = smtp.received.map(decodeBody);
      const business = bodies.find(b => b.includes('Odoo ERP and WhatsApp'));
      assert.ok(business, 'business email carries the full submission');
      assert.ok(business.includes(s.data.requestRef) && business.includes('Acme Trading') && business.includes(mail));
      assert.ok(bodies.some(b => b.includes('Thank you for your Customized')));
      assert.ok(smtp.received.some(m => /^To: business@example\.test/m.test(m)));
      assert.ok(smtp.received.some(m => m.includes(`To: ${mail}`)));
    });

    it('keeps the message in the outbox when SMTP is unavailable and lets an admin resend it', async () => {
      const keep = process.env.SMTP_PORT;
      process.env.SMTP_PORT = '1';   // nothing listens here
      const s = await submit();
      process.env.SMTP_PORT = keep;
      assert.equal(s.statusCode, 201, 'the submission still succeeds');
      assert.equal(s.data.notifications.business, false);
      const failed = db.prepare("SELECT * FROM agentic_email_outbox WHERE related_ref = ? AND status = 'FAILED'").all(s.data.requestRef);
      assert.ok(failed.length >= 1 && failed[0].last_error);
      const before = smtp.received.length;
      const r = await call('POST', `/api/admin/agentic/outbox/${failed[0].id}/resend`, { token: adminToken });
      assert.equal(r.data.ok, true);
      assert.equal(smtp.received.length, before + 1);
    });

    it('does not let customer text inject email headers', async () => {
      smtp.received.length = 0;
      await submit({ customer: { name: 'Evil\r\nBcc: attacker@example.com', email: email() } });
      assert.ok(smtp.received.every(m => !/^Bcc:/mi.test(m)));
    });
  });

  describe('quotation and payment workflow', () => {
    it('follows Pending Analysis -> Under Review -> Quotation Sent -> Awaiting Payment -> Payment Verification -> Approved -> In Development -> Completed', async () => {
      const s = await submit();
      const row = db.prepare('SELECT * FROM agentic_requests WHERE request_ref = ?').get(s.data.requestRef);
      const c = { ref: s.data.requestRef, id: row.id, email: row.customer_email };
      const seen = [await status(c)];

      assert.equal((await call('POST', `/api/admin/agentic/requests/${c.id}/status`, { token: adminToken, body: { status: 'UNDER_REVIEW' } })).statusCode, 200);
      seen.push(await status(c));
      assert.equal((await call('POST', `/api/admin/agentic/requests/${c.id}/quotation`, { token: adminToken, body: quote })).data.total, 45000);
      smtp.received.length = 0;
      const sent = await call('POST', `/api/admin/agentic/requests/${c.id}/quotation/send`, { token: adminToken });
      assert.equal(sent.data.emailed, true);
      assert.ok(decodeBody(smtp.received[0]).includes('TOTAL: ৳45,000'));
      seen.push(await status(c));

      const acc = await respond(c, { action: 'accept' });
      assert.equal(acc.statusCode, 200);
      seen.push(await status(c));

      const pay = await call('POST', `/api/public/agentic/requests/${c.ref}/payment`, { body: { email: c.email, method: 'BKASH', reference: 'TXN' + Math.random().toString(36).slice(2, 10), amount: 45000 } });
      assert.equal(pay.statusCode, 200);
      seen.push(await status(c));
      assert.notEqual(await status(c), 'APPROVED', 'a submitted reference never marks the order paid');

      const detail = await call('GET', `/api/admin/agentic/requests/${c.id}`, { token: adminToken });
      const pid = detail.data.payments[0].id;
      assert.equal((await call('POST', `/api/admin/agentic/requests/${c.id}/payments/${pid}/verify`, { token: adminToken, body: { verifiedAmount: 45000 } })).statusCode, 200);
      seen.push(await status(c));

      assert.equal((await call('POST', `/api/admin/agentic/requests/${c.id}/status`, { token: adminToken, body: { status: 'IN_DEVELOPMENT' } })).statusCode, 200);
      seen.push(await status(c));
      assert.equal((await call('POST', `/api/admin/agentic/requests/${c.id}/status`, { token: adminToken, body: { status: 'COMPLETED' } })).statusCode, 200);
      seen.push(await status(c));
      assert.deepEqual(seen, ['PENDING_ANALYSIS', 'UNDER_REVIEW', 'QUOTATION_SENT', 'AWAITING_PAYMENT', 'PAYMENT_VERIFICATION', 'APPROVED', 'IN_DEVELOPMENT', 'COMPLETED']);
    });

    it('a quotation needs scope, solution, cost, timeline and payment instructions', async () => {
      const s = await submit();
      const id = db.prepare('SELECT id FROM agentic_requests WHERE request_ref = ?').get(s.data.requestRef).id;
      const bad = await call('POST', `/api/admin/agentic/requests/${id}/quotation`, { token: adminToken, body: { developmentCost: -1 } });
      assert.equal(bad.statusCode, 400);
      assert.ok(bad.data.fields.scope && bad.data.fields.proposedSolution && bad.data.fields.paymentInstructions && bad.data.fields.developmentCost && bad.data.fields.timelineDays);
      const noDraft = await call('POST', `/api/admin/agentic/requests/${id}/quotation/send`, { token: adminToken });
      assert.equal(noDraft.statusCode, 409);
    });

    it('cannot skip steps: no manual Approved, no development before payment, no payment before acceptance', async () => {
      const s = await submit();
      const row = db.prepare('SELECT * FROM agentic_requests WHERE request_ref = ?').get(s.data.requestRef);
      assert.equal((await call('POST', `/api/admin/agentic/requests/${row.id}/status`, { token: adminToken, body: { status: 'APPROVED' } })).statusCode, 400);
      assert.equal((await call('POST', `/api/admin/agentic/requests/${row.id}/status`, { token: adminToken, body: { status: 'IN_DEVELOPMENT' } })).statusCode, 409);
      const pay = await call('POST', `/api/public/agentic/requests/${s.data.requestRef}/payment`, { body: { email: row.customer_email, method: 'BKASH', reference: 'EARLY12345', amount: 1 } });
      assert.equal(pay.statusCode, 409);
      assert.equal((await respond({ ref: s.data.requestRef, email: row.customer_email }, { action: 'accept' })).statusCode, 409);
    });

    it('requires a reason for reject, cancel and revision-requested', async () => {
      const s = await submit();
      const id = db.prepare('SELECT id FROM agentic_requests WHERE request_ref = ?').get(s.data.requestRef).id;
      assert.equal((await call('POST', `/api/admin/agentic/requests/${id}/status`, { token: adminToken, body: { status: 'REJECTED' } })).statusCode, 400);
      assert.equal((await call('POST', `/api/admin/agentic/requests/${id}/status`, { token: adminToken, body: { status: 'REJECTED', note: 'Outside our scope' } })).statusCode, 200);
      assert.equal((await call('POST', `/api/admin/agentic/requests/${id}/status`, { token: adminToken, body: { status: 'UNDER_REVIEW' } })).statusCode, 409, 'rejected is final');
    });

    it('lets the customer request a revision, then receives and accepts a new quotation version', async () => {
      const c = await toQuotationSent();
      assert.equal((await respond(c, { action: 'revise', message: 'short' })).statusCode, 400);
      assert.equal((await respond(c, { action: 'revise', message: 'Please include WhatsApp integration in the scope.' })).statusCode, 200);
      assert.equal(await status(c), 'REVISION_REQUESTED');
      assert.equal((await call('POST', `/api/admin/agentic/requests/${c.id}/quotation`, { token: adminToken, body: { ...quote, developmentCost: 50000 } })).data.version, 2);
      assert.equal((await call('POST', `/api/admin/agentic/requests/${c.id}/quotation/send`, { token: adminToken })).statusCode, 200);
      const view = (await call('GET', '/api/public/agentic/track', { query: { ref: c.ref, email: c.email } })).data;
      assert.equal(view.quotations[0].version, 2);
      assert.equal(view.quotations[0].total, 55000);
      assert.equal(view.quotations[1].status, 'SUPERSEDED', 'the earlier version is superseded by the new one');
      assert.equal((await respond(c, { action: 'accept' })).statusCode, 200);
      assert.equal(await status(c), 'AWAITING_PAYMENT');
    });

    it('lets the customer decline, and refuses an expired quotation', async () => {
      const declined = await toQuotationSent();
      assert.equal((await respond(declined, { action: 'decline', message: 'Too expensive' })).statusCode, 200);
      assert.equal(await status(declined), 'CANCELLED');

      const expired = await toQuotationSent();
      db.prepare("UPDATE agentic_quotations SET valid_until = '2000-01-01' WHERE request_id = ?").run(expired.id);
      const r = await respond(expired, { action: 'accept' });
      assert.equal(r.statusCode, 409);
      assert.equal(r.data.expired, true);
      assert.equal(await status(expired), 'QUOTATION_SENT');
    });

    it('creates a WHMCS invoice for the quoted total when the quotation is accepted', async () => {
      const c = await toQuotationSent();
      await respond(c, { action: 'accept' });
      const q = db.prepare("SELECT * FROM agentic_quotations WHERE request_id = ? AND status = 'ACCEPTED'").get(c.id);
      assert.ok(q.whmcs_invoice_id);
      assert.equal(q.total, 45000);
      assert.equal(q.sandbox, 1);
    });

    it('approves automatically only from a signed, matching WHMCS payment event, once', async () => {
      const c = await toQuotationSent();
      await respond(c, { action: 'accept' });
      const inv = db.prepare("SELECT whmcs_invoice_id AS id FROM agentic_quotations WHERE request_id = ? AND status = 'ACCEPTED'").get(c.id).id;
      const raw = JSON.stringify({ event: 'InvoicePaid', invoiceId: inv, transactionId: 'Q-1', amount: 45000 });
      assert.equal((await call('POST', '/api/webhooks/whmcs/agentic', { body: JSON.parse(raw), raw, headers: { 'x-unified-signature': 'sha256=' + 'b'.repeat(64) } })).statusCode, 401);

      const short = await webhook({ event: 'InvoicePaid', invoiceId: inv, transactionId: 'Q-short', amount: 100 });
      assert.equal(short.data.flagged, true);
      assert.equal(await status(c), 'AWAITING_PAYMENT');

      const ok = await webhook({ event: 'InvoicePaid', invoiceId: inv, transactionId: 'Q-1', amount: 45000 });
      assert.equal(ok.data.handled, true);
      assert.equal(await status(c), 'APPROVED');
      assert.equal((await webhook({ event: 'InvoicePaid', invoiceId: inv, transactionId: 'Q-1', amount: 45000 })).data.duplicate, true);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM agentic_request_payments WHERE request_id = ? AND status = 'VERIFIED'").get(c.id).n, 1);
    });

    it('verification needs the received amount to cover the quote; a rejected payment returns to Awaiting Payment', async () => {
      const c = await toQuotationSent();
      await respond(c, { action: 'accept' });
      const pay = (ref) => call('POST', `/api/public/agentic/requests/${c.ref}/payment`, { body: { email: c.email, method: 'BANK_TRANSFER', reference: ref, amount: 45000 } });
      assert.equal((await pay('BANK-' + c.ref)).statusCode, 200);
      const detail = (await call('GET', `/api/admin/agentic/requests/${c.id}`, { token: adminToken })).data;
      const pid = detail.payments[0].id;
      assert.equal((await call('POST', `/api/admin/agentic/requests/${c.id}/payments/${pid}/verify`, { token: adminToken, body: { verifiedAmount: 1000 } })).statusCode, 409);
      assert.equal((await call('POST', `/api/admin/agentic/requests/${c.id}/payments/${pid}/reject`, { token: adminToken, body: { note: 'No such transfer' } })).statusCode, 200);
      assert.equal(await status(c), 'AWAITING_PAYMENT');
      assert.equal((await pay('BANK-' + c.ref)).statusCode, 409, 'a reference cannot be reused');
      assert.equal((await pay('BANK-AGAIN-' + c.ref)).statusCode, 200);
      assert.equal(await status(c), 'PAYMENT_VERIFICATION');
    });

    it('rejects an invalid payment submission', async () => {
      const c = await toQuotationSent();
      await respond(c, { action: 'accept' });
      const pay = (b) => call('POST', `/api/public/agentic/requests/${c.ref}/payment`, { body: { email: c.email, ...b } });
      assert.equal((await pay({ method: 'GOLD', reference: 'ABC12345', amount: 1 })).statusCode, 400);
      assert.equal((await pay({ method: 'BKASH', reference: '!!', amount: 1 })).statusCode, 400);
      assert.equal((await pay({ method: 'BKASH', reference: 'ABC12345', amount: 0 })).statusCode, 400);
    });
  });

  describe('customer and admin access', () => {
    it('shows a customer only their own request, hides drafts and internal notes, and throttles guessing', async () => {
      const a = await toQuotationSent();
      const b = await submit();
      await call('POST', `/api/admin/agentic/requests/${a.id}/note`, { token: adminToken, body: { note: 'INTERNAL: customer is price sensitive' } });
      const own = await call('GET', '/api/public/agentic/track', { query: { ref: a.ref, email: a.email } });
      assert.equal(own.statusCode, 200);
      assert.equal(own.data.kind, 'request');
      assert.ok(!JSON.stringify(own.data).includes('INTERNAL'));
      assert.ok(!JSON.stringify(own.data).includes('createdBy'));
      const wrong = await call('GET', '/api/public/agentic/track', { query: { ref: a.ref, email: db.prepare('SELECT customer_email e FROM agentic_requests WHERE request_ref = ?').get(b.data.requestRef).e } });
      assert.equal(wrong.statusCode, 404);
      let last;
      for (let i = 0; i < 12; i++) last = await call('GET', '/api/public/agentic/track', { query: { ref: `REQ-0000-NOPE${i}`, email: 'x@example.com' } });
      assert.equal(last.statusCode, 429);
    });

    it('enforces admin authentication and permissions, and serves files as downloads only', async () => {
      const s = await submit({ category: 'BRANDED', fields: brandFields, files: [{ kind: 'logo', name: 'logo.png', mime: 'image/png', dataBase64: png }] });
      const id = db.prepare('SELECT id FROM agentic_requests WHERE request_ref = ?').get(s.data.requestRef).id;
      assert.equal((await call('GET', '/api/admin/agentic/requests')).statusCode, 401);
      assert.equal((await call('GET', '/api/admin/agentic/requests', { token: supportToken })).statusCode, 200);
      assert.equal((await call('POST', `/api/admin/agentic/requests/${id}/status`, { token: supportToken, body: { status: 'UNDER_REVIEW' } })).statusCode, 403);
      const fid = db.prepare('SELECT id FROM agentic_request_files WHERE request_id = ?').get(id).id;
      const file = await call('GET', `/api/admin/agentic/requests/${id}/files/${fid}`, { token: adminToken });
      assert.equal(file.statusCode, 200);
      assert.match(file.headers['Content-Disposition'], /^attachment;/);
      assert.equal(file.headers['X-Content-Type-Options'], 'nosniff');
      assert.equal((await call('GET', `/api/admin/agentic/requests/${id}/files/${fid}`)).statusCode, 401);
    });

    it('records the status history and the audit trail', async () => {
      const c = await toQuotationSent();
      const d = (await call('GET', `/api/admin/agentic/requests/${c.id}`, { token: adminToken })).data;
      assert.deepEqual(d.events.filter(e => e.to).map(e => e.to), ['PENDING_ANALYSIS', 'UNDER_REVIEW', 'QUOTATION_SENT']);
      assert.ok(db.prepare("SELECT COUNT(*) n FROM agentic_audit_logs WHERE action = 'QUOTATION_SENT'").get().n >= 1);
      assert.ok(d.emails.length >= 3);
    });
  });
});

describe('Ready-Made products and Chat-Only requirements', () => {
  let db, whmcs, adminToken;
  async function call(method, pathname, { body = {}, query = {}, token = null } = {}) {
    return new Promise((resolve) => {
      let statusCode = 200;
      const res = { writeHead: (c) => { statusCode = c; }, setHeader() {}, end: (s) => { let d; try { d = JSON.parse(s); } catch { d = { raw: s }; } resolve({ statusCode, data: d }); } };
      const req = { method, headers: { 'x-forwarded-for': '10.0.0.8', 'user-agent': 'test' }, socket: { remoteAddress: '10.0.0.8' } };
      if (token) req.headers.authorization = `Bearer ${token}`;
      authenticateRequest(req, db);
      handleApiRequest({ req, res, pathname, query, body, rawBody: JSON.stringify(body), db, whmcsAdapter: whmcs });
    });
  }
  before(() => {
    db = initDatabase(':memory:');
    whmcs = new WHMCSAdapter({ apiUrl: '', apiIdentifier: '', apiSecret: '' });
    adminToken = handleLogin(db, 'superadmin@unified.cloud', 'SuperAdmin2026!').token;
  });
  const cust = () => ({ name: 'Rahat Khan', email: `rm${Math.random().toString(36).slice(2, 8)}@example.com` });

  it('admins manage the catalog; changes reach the public catalog and new orders only', async () => {
    const created = await call('POST', '/api/admin/agentic/products', { token: adminToken, body: { name: 'Sales Assistant', tagline: 'Qualify leads', capabilities: ['Lead capture', 'Meeting booking'], setupFee: 2000, monthlyFee: 500, badge: 'New' } });
    assert.equal(created.statusCode, 201);
    assert.equal(created.data.code, 'SALES_ASSISTANT');
    assert.equal((await call('POST', '/api/admin/agentic/products', { token: adminToken, body: { name: 'Sales Assistant' } })).statusCode, 409);
    assert.equal((await call('POST', '/api/admin/agentic/products', { token: adminToken, body: { name: 'X', setupFee: -5 } })).statusCode, 400);
    const pub = await call('GET', '/api/public/agentic/catalog');
    assert.ok(pub.data.products.some(p => p.code === 'SALES_ASSISTANT' && p.setupFee === 2000));

    const order = await call('POST', '/api/public/agentic/orders', { body: { idempotencyKey: crypto.randomUUID(), customer: cust(), configCode: 'READY_MADE', productCode: 'SALES_ASSISTANT', backup: true, requirements: { useCase: 'Our webshop' } } });
    assert.equal(order.statusCode, 201);
    assert.equal(order.data.quote.totals.oneTime, 2000);
    assert.equal(order.data.quote.totals.recurringMonthly, 1500);
    assert.equal(order.data.quote.product.name, 'Sales Assistant');

    await call('PUT', '/api/admin/agentic/products/SALES_ASSISTANT', { token: adminToken, body: { name: 'Sales Assistant', setupFee: 9999, active: false } });
    assert.ok(!(await call('GET', '/api/public/agentic/catalog')).data.products.some(p => p.code === 'SALES_ASSISTANT'));
    const stale = await call('POST', '/api/public/agentic/orders', { body: { idempotencyKey: crypto.randomUUID(), customer: cust(), configCode: 'READY_MADE', productCode: 'SALES_ASSISTANT', backup: true } });
    assert.equal(stale.statusCode, 400);
    const track = await call('GET', '/api/public/agentic/track', { query: { ref: order.data.orderRef, email: order.data.quote && db.prepare('SELECT customer_email e FROM agentic_orders WHERE order_ref = ?').get(order.data.orderRef).e } });
    assert.equal(track.data.kind, 'order');
    assert.equal(track.data.quote.totals.oneTime, 2000, 'the order keeps the price it was sold at');
  });

  it('Chat-Only stores its configuration and requires purpose and languages', async () => {
    const base = { idempotencyKey: crypto.randomUUID(), customer: cust(), configCode: 'CHAT_ONLY', backup: true };
    const none = await call('POST', '/api/public/agentic/orders', { body: base });
    assert.equal(none.statusCode, 400);
    assert.ok(none.data.fields.purpose && none.data.fields.languages);
    const badUrl = await call('POST', '/api/public/agentic/orders', { body: { ...base, idempotencyKey: crypto.randomUUID(), requirements: { purpose: 'FAQ', languages: 'English', websiteUrl: 'javascript:alert(1)' } } });
    assert.ok(badUrl.data.fields.websiteUrl);
    const ok = await call('POST', '/api/public/agentic/orders', { body: { ...base, idempotencyKey: crypto.randomUUID(), requirements: { purpose: 'Answer FAQs', languages: 'English, Bengali', websiteUrl: 'https://www.example.com', tone: 'Friendly', knowledgeBase: 'Documents and website' } } });
    assert.equal(ok.statusCode, 201);
    assert.equal(ok.data.quote.configuration.code, 'CHAT_ONLY');
    const row = db.prepare('SELECT requirements_json, config_code FROM agentic_orders WHERE order_ref = ?').get(ok.data.orderRef);
    assert.equal(row.config_code, 'CHAT_ONLY');
    assert.equal(JSON.parse(row.requirements_json).languages, 'English, Bengali');
  });

  it('every order is stored under its own category', async () => {
    const counts = db.prepare('SELECT config_code c, COUNT(*) n FROM agentic_orders GROUP BY config_code').all();
    assert.ok(counts.some(c => c.c === 'READY_MADE') && counts.some(c => c.c === 'CHAT_ONLY'));
    assert.ok(!counts.some(c => c.c === 'CUSTOM_BRANDED'));
  });
});

describe('mailer', () => {
  it('builds a UTF-8 safe message and reports unconfigured SMTP without throwing', async () => {
    const m = mailer.buildMessage({ from: 'a@b.c', to: 'x@y.z', subject: 'বাংলা বিষয়', text: 'হ্যালো' });
    assert.match(m, /Subject: =\?UTF-8\?B\?/);
    assert.equal(mailer.mailerConfig({}).configured, false);
    const db = initDatabase(':memory:');
    const r = await mailer.sendNotification(db, { kind: 'T', to: 'x@y.z', subject: 's', body: 'b' }, {});
    assert.equal(r.ok, false);
    assert.equal(db.prepare("SELECT status FROM agentic_email_outbox WHERE id = ?").get(r.id).status, 'QUEUED');
  });
});
