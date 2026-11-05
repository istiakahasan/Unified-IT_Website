import crypto from 'node:crypto';
import { FORM_SPECS, FormError, validateForm, validateContact, validateFiles, allFields } from './agentic-forms.mjs';
import { AgenticError, audit, upsertCustomer, getWhmcsMapping, CURRENCY, PAYMENT_EVENTS } from './agentic-ai.mjs';
import { sendNotification, mailerConfig } from './mailer.mjs';

/**
 * Quotation-based Agentic AI workflows: Customized and Branded.
 *
 *  Pending Analysis -> Under Review -> Quotation Sent -> Awaiting Payment -> Payment Verification
 *  -> Approved -> In Development -> Completed       (+ Rejected, Cancelled, Revision Requested)
 *
 * A request becomes Approved only through a verified payment: either an administrator verifies a payment
 * reference the customer submitted, or WHMCS reports the invoice paid through the signed webhook.
 * Submitting a reference (or any screenshot) never marks anything as paid.
 */

export const REQUEST_CATEGORIES = ['CUSTOMIZED', 'BRANDED'];

export const STATUS_LABELS = Object.freeze({
  PENDING_ANALYSIS: 'Pending Analysis',
  UNDER_REVIEW: 'Under Review',
  QUOTATION_SENT: 'Quotation Sent',
  AWAITING_PAYMENT: 'Awaiting Payment',
  PAYMENT_VERIFICATION: 'Payment Verification',
  APPROVED: 'Approved',
  IN_DEVELOPMENT: 'In Development',
  COMPLETED: 'Completed',
  REVISION_REQUESTED: 'Revision Requested',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled'
});
const STATUSES = Object.keys(STATUS_LABELS);

const TRANSITIONS = {
  PENDING_ANALYSIS: ['UNDER_REVIEW', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['QUOTATION_SENT', 'REVISION_REQUESTED', 'REJECTED', 'CANCELLED'],
  REVISION_REQUESTED: ['UNDER_REVIEW', 'QUOTATION_SENT', 'REJECTED', 'CANCELLED'],
  QUOTATION_SENT: ['AWAITING_PAYMENT', 'REVISION_REQUESTED', 'CANCELLED', 'REJECTED'],
  AWAITING_PAYMENT: ['PAYMENT_VERIFICATION', 'APPROVED', 'CANCELLED'],
  PAYMENT_VERIFICATION: ['APPROVED', 'AWAITING_PAYMENT', 'CANCELLED'],
  APPROVED: ['IN_DEVELOPMENT', 'CANCELLED'],
  IN_DEVELOPMENT: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], REJECTED: [], CANCELLED: []
};
// What an administrator may set directly. The rest happen only through their own verified actions.
const ADMIN_SETTABLE = ['UNDER_REVIEW', 'REVISION_REQUESTED', 'REJECTED', 'CANCELLED', 'IN_DEVELOPMENT', 'COMPLETED'];

export const PAYMENT_METHODS = Object.freeze({
  BANK_TRANSFER: 'Bank transfer', BKASH: 'bKash', NAGAD: 'Nagad', CARD: 'Card', OTHER: 'Other'
});

const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const uid = () => crypto.randomUUID();
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const tk = (n) => '৳' + money(n).toLocaleString('en-US');

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* done */ } throw e; }
}

export function initRequestSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_requests (
      id TEXT PRIMARY KEY,
      request_ref TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('CUSTOMIZED','BRANDED')),
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      company_name TEXT,
      requirements_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_ANALYSIS' CHECK(status IN (${STATUSES.map(s => `'${s}'`).join(',')})),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS agentic_request_files (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      data_b64 TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(request_id) REFERENCES agentic_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agentic_quotations (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      scope TEXT NOT NULL,
      proposed_solution TEXT NOT NULL,
      development_cost REAL NOT NULL CHECK(development_cost >= 0),
      additional_charges_json TEXT NOT NULL DEFAULT '[]',
      total REAL NOT NULL,
      timeline_days INTEGER NOT NULL,
      payment_instructions TEXT NOT NULL,
      validity_days INTEGER NOT NULL DEFAULT 14,
      valid_until TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK(status IN ('DRAFT','SENT','ACCEPTED','DECLINED','REVISION_REQUESTED','EXPIRED','SUPERSEDED')),
      created_by TEXT NOT NULL,
      sent_at TEXT,
      responded_at TEXT,
      customer_message TEXT,
      whmcs_invoice_id TEXT UNIQUE,
      checkout_url TEXT,
      sandbox INTEGER NOT NULL DEFAULT 0,
      billing_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(request_id, version),
      FOREIGN KEY(request_id) REFERENCES agentic_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agentic_request_payments (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      quotation_id TEXT,
      method TEXT NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','VERIFIED','REJECTED')),
      verified_by TEXT,
      verified_amount REAL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      verified_at TEXT,
      FOREIGN KEY(request_id) REFERENCES agentic_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agentic_request_events (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      internal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(request_id) REFERENCES agentic_requests(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agentic_requests_email ON agentic_requests(customer_email);
    CREATE INDEX IF NOT EXISTS idx_agentic_requests_status ON agentic_requests(status, category);
    CREATE INDEX IF NOT EXISTS idx_agentic_quotes_request ON agentic_quotations(request_id);
    CREATE INDEX IF NOT EXISTS idx_agentic_req_events ON agentic_request_events(request_id);
  `);
}

function newRef() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(8)) s += a[b % a.length];
  return `REQ-${new Date().getFullYear()}-${s}`;
}

function event(db, requestId, actor, from, to, note = null, internal = 0) {
  db.prepare('INSERT INTO agentic_request_events (id, request_id, actor, from_status, to_status, note, internal) VALUES (?,?,?,?,?,?,?)')
    .run(uid(), requestId, actor, from, to, note ? clean(note, 2000) : null, internal);
}

function changeStatus(db, request, to, actor, note, internal = 0) {
  if (!TRANSITIONS[request.status]?.includes(to)) {
    throw new AgenticError(409, `A request in "${STATUS_LABELS[request.status]}" cannot move to "${STATUS_LABELS[to]}".`);
  }
  db.prepare("UPDATE agentic_requests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(to, request.id);
  event(db, request.id, actor, request.status, to, note, internal);
  request.status = to;
}

const getById = (db, idOrRef) => db.prepare('SELECT * FROM agentic_requests WHERE id = ? OR request_ref = ?').get(idOrRef, idOrRef);

/* ------------------------------------------------------------------ email */

function describeFields(category, values) {
  const spec = FORM_SPECS[category];
  return allFields(spec).filter(f => values[f.key]).map(f => `${f.label}:\n${values[f.key]}`).join('\n\n');
}

function notify(db, env, msg) {
  return sendNotification(db, msg, env);
}

async function emailBusinessNewRequest(db, env, r, values, files) {
  const to = mailerConfig(env).notifyEmail;
  const body = [
    `New ${r.category} Agentic AI request ${r.request_ref}`,
    `Received: ${new Date().toISOString()}`,
    '',
    `Customer: ${r.customer_name} <${r.customer_email}>`,
    `Phone: ${r.customer_phone || '-'}`,
    `Company: ${r.company_name || '-'}`,
    '',
    describeFields(r.category, values),
    files.length ? `\nAttachments (${files.length}): ${files.map(f => `${f.filename} (${f.kind})`).join(', ')}` : '',
    '',
    'Review it in Admin > Agentic AI > Custom requests.'
  ].join('\n');
  return notify(db, env, { kind: 'REQUEST_SUBMITTED_BUSINESS', to, subject: `[Agentic AI] New ${r.category.toLowerCase()} request ${r.request_ref}`, body, ref: r.request_ref });
}

const emailCustomer = (db, env, r, kind, subject, lines) =>
  notify(db, env, { kind, to: r.customer_email, subject, body: [`Hello ${r.customer_name},`, '', ...lines, '', `Request reference: ${r.request_ref}`, 'You can follow it any time from the Agentic AI page with this reference and your email address.'].join('\n'), ref: r.request_ref });

/* ----------------------------------------------------------- submissions */

const submitThrottle = new Map();
export function resetRequestThrottles() { submitThrottle.clear(); lookupFailures.clear(); }

export async function createRequest(db, input, { env = process.env, actor = 'customer' } = {}) {
  const category = String(input?.category || '').toUpperCase();
  if (!REQUEST_CATEGORIES.includes(category)) throw new AgenticError(400, 'category must be CUSTOMIZED or BRANDED.');
  const key = clean(input.idempotencyKey, 100);
  if (key.length < 8) throw new AgenticError(400, 'idempotencyKey (min 8 chars) is required to prevent duplicate submissions.');

  let contact; let values; let files;
  try {
    contact = validateContact(input.customer);
    const prior = db.prepare('SELECT * FROM agentic_requests WHERE idempotency_key = ?').get(key);
    if (prior) {
      if (prior.customer_email !== contact.email) throw new AgenticError(409, 'This idempotency key belongs to a different request.');
      return { replay: true, requestRef: prior.request_ref, status: prior.status, statusLabel: STATUS_LABELS[prior.status], category };
    }
    values = validateForm(category, input.fields);
    files = validateFiles(category, input.files);
  } catch (e) {
    if (e instanceof FormError) throw new AgenticError(400, e.message, { fields: e.fields });
    throw e;
  }

  const hour = Date.now() - 3600_000;
  const recent = (submitThrottle.get(contact.email) || []).filter(t => t > hour);
  if (recent.length >= 5) throw new AgenticError(429, 'Too many requests from this email address. Please try again later.');
  recent.push(Date.now());
  submitThrottle.set(contact.email, recent);

  const id = uid();
  const ref = newRef();
  tx(db, () => {
    const customerId = upsertCustomer(db, { name: contact.name, email: contact.email, phone: contact.phone, company: contact.company });
    db.prepare(`INSERT INTO agentic_requests (id, request_ref, idempotency_key, category, customer_id, customer_name, customer_email, customer_phone, company_name, requirements_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, ref, key, category, customerId, contact.name, contact.email, contact.phone || null, contact.company || null, JSON.stringify(values));
    const insFile = db.prepare('INSERT INTO agentic_request_files (id, request_id, kind, filename, mime, size, data_b64) VALUES (?,?,?,?,?,?,?)');
    for (const f of files) insFile.run(uid(), id, f.kind, f.filename, f.mime, f.size, f.b64);
    event(db, id, actor, null, 'PENDING_ANALYSIS', 'Request submitted by the customer.');
    audit(db, actor, 'REQUEST_CREATED', null, { ref, category, files: files.length });
  });

  const row = getById(db, id);
  const [biz, cust] = await Promise.all([
    emailBusinessNewRequest(db, env, row, values, files),
    emailCustomer(db, env, row, 'REQUEST_SUBMITTED_CUSTOMER', `We received your request ${ref}`, [
      `Thank you for your ${category === 'BRANDED' ? 'Branded' : 'Customized'} Agentic AI request.`,
      'Our team will review your requirements, evaluate the scope and prepare a quotation. You will receive it by email.'])
  ]);
  return {
    replay: false, requestRef: ref, category, status: row.status, statusLabel: STATUS_LABELS[row.status],
    notifications: { business: !!biz.ok, customer: !!cust.ok }
  };
}

/* ------------------------------------------------------------ read models */

function quotationView(q, { forCustomer }) {
  const charges = JSON.parse(q.additional_charges_json || '[]');
  return {
    id: q.id, version: q.version, status: q.status,
    scope: q.scope, proposedSolution: q.proposed_solution,
    developmentCost: money(q.development_cost), additionalCharges: charges,
    additionalTotal: money(charges.reduce((s, c) => s + c.amount, 0)),
    total: money(q.total), currency: CURRENCY,
    timelineDays: q.timeline_days, paymentInstructions: q.payment_instructions,
    validityDays: q.validity_days, validUntil: q.valid_until, sentAt: q.sent_at, respondedAt: q.responded_at,
    customerMessage: q.customer_message,
    checkoutUrl: q.checkout_url || null, invoiceId: q.whmcs_invoice_id || null, sandbox: !!q.sandbox,
    ...(forCustomer ? {} : { billingError: q.billing_error, createdBy: q.created_by })
  };
}

function detail(db, r, { forCustomer }) {
  const values = JSON.parse(r.requirements_json);
  const spec = FORM_SPECS[r.category];
  const quotes = db.prepare('SELECT * FROM agentic_quotations WHERE request_id = ? ORDER BY version DESC').all(r.id)
    .filter(q => !forCustomer || q.status !== 'DRAFT').map(q => quotationView(q, { forCustomer }));
  const payments = db.prepare('SELECT id, method, reference, amount, status, verified_by, verified_amount, note, created_at, verified_at FROM agentic_request_payments WHERE request_id = ? ORDER BY created_at').all(r.id)
    .map(p => ({ id: p.id, method: PAYMENT_METHODS[p.method] || p.method, methodCode: p.method, reference: p.reference, amount: p.amount, status: p.status, verifiedAt: p.verified_at, createdAt: p.created_at, ...(forCustomer ? {} : { verifiedBy: p.verified_by, verifiedAmount: p.verified_amount, note: p.note }) }));
  const events = db.prepare('SELECT actor, from_status, to_status, note, internal, created_at FROM agentic_request_events WHERE request_id = ? ORDER BY created_at, rowid').all(r.id)
    .filter(e => !forCustomer || !e.internal)
    .map(e => ({ at: e.created_at, from: e.from_status, to: e.to_status, toLabel: e.to_status ? STATUS_LABELS[e.to_status] : null, note: e.note, internal: !!e.internal, ...(forCustomer ? {} : { actor: e.actor }) }));
  const files = db.prepare('SELECT id, kind, filename, mime, size FROM agentic_request_files WHERE request_id = ?').all(r.id);
  const live = quotes.find(q => ['SENT', 'ACCEPTED'].includes(q.status));
  const out = {
    requestRef: r.request_ref, category: r.category, status: r.status, statusLabel: STATUS_LABELS[r.status],
    createdAt: r.created_at, updatedAt: r.updated_at,
    requirements: allFields(spec).filter(f => values[f.key]).map(f => ({ key: f.key, label: f.label, value: values[f.key] })),
    files, quotations: quotes, payments, events,
    actions: {
      respondToQuotation: r.status === 'QUOTATION_SENT' && !!live && live.status === 'SENT',
      submitPayment: r.status === 'AWAITING_PAYMENT'
    }
  };
  if (!forCustomer) {
    out.id = r.id;
    out.customer = { name: r.customer_name, email: r.customer_email, phone: r.customer_phone, company: r.company_name };
    out.allowedTransitions = TRANSITIONS[r.status].filter(s => ADMIN_SETTABLE.includes(s)).map(s => ({ status: s, label: STATUS_LABELS[s] }));
    out.emails = db.prepare('SELECT id, kind, to_email AS "to", subject, status, attempts, last_error AS error, created_at AS createdAt FROM agentic_email_outbox WHERE related_ref = ? ORDER BY created_at').all(r.request_ref);
  }
  return out;
}

const lookupFailures = new Map();
export function lookupRequest(db, ref, email, clientIp = 'unknown') {
  const now = Date.now();
  const rec = lookupFailures.get(clientIp);
  if (rec && rec.resetAt > now && rec.count >= 10) throw new AgenticError(429, 'Too many failed lookups. Try again later.');
  const r = db.prepare('SELECT * FROM agentic_requests WHERE request_ref = ? AND customer_email = ?').get(clean(ref, 40).toUpperCase(), clean(email, 254).toLowerCase());
  if (!r) {
    const cur = rec && rec.resetAt > now ? rec : { count: 0, resetAt: now + 600_000 };
    cur.count++;
    lookupFailures.set(clientIp, cur);
    throw new AgenticError(404, 'No request found for that reference and email.');
  }
  return detail(db, r, { forCustomer: true });
}

function ownRequest(db, ref, email) {
  const r = db.prepare('SELECT * FROM agentic_requests WHERE request_ref = ? AND customer_email = ?').get(clean(ref, 40).toUpperCase(), clean(email, 254).toLowerCase());
  if (!r) throw new AgenticError(404, 'No request found for that reference and email.');
  return r;
}

/* ---------------------------------------------------- customer responses */

export async function respondToQuotation(db, whmcs, ref, email, input, { env = process.env } = {}) {
  const r = ownRequest(db, ref, email);
  if (r.status !== 'QUOTATION_SENT') throw new AgenticError(409, 'There is no quotation waiting for your response.');
  const q = db.prepare("SELECT * FROM agentic_quotations WHERE request_id = ? AND status = 'SENT' ORDER BY version DESC").get(r.id);
  if (!q) throw new AgenticError(409, 'There is no quotation waiting for your response.');
  const action = String(input?.action || '');
  const message = clean(input?.message, 2000);
  const actor = `customer:${r.customer_email}`;

  if (action === 'accept') {
    if (q.valid_until && q.valid_until < today()) {
      db.prepare("UPDATE agentic_quotations SET status = 'EXPIRED' WHERE id = ?").run(q.id);
      event(db, r.id, 'system', r.status, r.status, `Quotation v${q.version} expired on ${q.valid_until}.`);
      throw new AgenticError(409, 'This quotation has expired. Please request a revision and we will update it.', { expired: true });
    }
    tx(db, () => {
      db.prepare("UPDATE agentic_quotations SET status = 'ACCEPTED', responded_at = datetime('now'), customer_message = ? WHERE id = ?").run(message || null, q.id);
      changeStatus(db, r, 'AWAITING_PAYMENT', actor, `Customer accepted quotation v${q.version} (${tk(q.total)}).`);
      audit(db, actor, 'QUOTATION_ACCEPTED', null, { ref: r.request_ref, version: q.version, total: q.total });
    });
    // WHMCS stays the billing system: raise an invoice for the quoted total. A billing failure is not fatal,
    // the customer can still pay by the instructions in the quotation and an administrator verifies it.
    try {
      const map = getWhmcsMapping(env);
      if (whmcs.isConfigured && !map.paymentMethod) throw new Error('WHMCS payment method is not configured (AGENTIC_WHMCS_PAYMENT_METHOD).');
      const [first, ...rest] = r.customer_name.split(/\s+/);
      const client = await whmcs.syncClient({ email: r.customer_email, firstName: first, lastName: rest.join(' ') || '-', companyName: r.company_name || '', phoneNumber: r.customer_phone || '' });
      const inv = await whmcs.createUsageInvoice({
        clientId: client.clientid, paymentMethod: map.paymentMethod,
        description: `Agentic AI ${r.category.toLowerCase()} project ${r.request_ref} (quotation v${q.version})`,
        amount: money(q.total), idempotencyKey: `agentic-quote-${q.id}`
      });
      db.prepare('UPDATE agentic_quotations SET whmcs_invoice_id = ?, checkout_url = ?, sandbox = ?, billing_error = NULL WHERE id = ?')
        .run(String(inv.invoiceId), inv.checkoutUrl, inv.sandbox ? 1 : 0, q.id);
      audit(db, 'system', 'QUOTATION_INVOICE_CREATED', null, { ref: r.request_ref, invoiceId: inv.invoiceId, sandbox: !!inv.sandbox });
    } catch (e) {
      db.prepare('UPDATE agentic_quotations SET billing_error = ? WHERE id = ?').run(String(e.message).slice(0, 300), q.id);
      audit(db, 'system', 'QUOTATION_INVOICE_FAILED', null, { ref: r.request_ref, error: e.message });
    }
    await Promise.all([
      emailCustomer(db, env, r, 'QUOTATION_ACCEPTED_CUSTOMER', `Quotation accepted for ${r.request_ref}`, [`Thank you for accepting the quotation (${tk(q.total)}).`, '', 'Payment instructions:', q.payment_instructions, '', 'Your project starts after we verify your payment.']),
      notify(db, env, { kind: 'QUOTATION_ACCEPTED_BUSINESS', to: mailerConfig(env).notifyEmail, subject: `[Agentic AI] ${r.request_ref} quotation accepted`, body: `${r.customer_name} accepted quotation v${q.version} for ${tk(q.total)}. Awaiting payment.`, ref: r.request_ref })
    ]);
    return { status: r.status, statusLabel: STATUS_LABELS[r.status] };
  }

  if (action === 'revise') {
    if (message.length < 10) throw new AgenticError(400, 'Please describe the changes you would like (at least 10 characters).');
    tx(db, () => {
      db.prepare("UPDATE agentic_quotations SET status = 'REVISION_REQUESTED', responded_at = datetime('now'), customer_message = ? WHERE id = ?").run(message, q.id);
      changeStatus(db, r, 'REVISION_REQUESTED', actor, message);
    });
    await notify(db, env, { kind: 'REVISION_REQUESTED_BUSINESS', to: mailerConfig(env).notifyEmail, subject: `[Agentic AI] ${r.request_ref} revision requested`, body: `${r.customer_name} asked for a revised quotation:\n\n${message}`, ref: r.request_ref });
    return { status: r.status, statusLabel: STATUS_LABELS[r.status] };
  }

  if (action === 'decline') {
    tx(db, () => {
      db.prepare("UPDATE agentic_quotations SET status = 'DECLINED', responded_at = datetime('now'), customer_message = ? WHERE id = ?").run(message || null, q.id);
      changeStatus(db, r, 'CANCELLED', actor, message || 'Customer declined the quotation.');
    });
    await notify(db, env, { kind: 'QUOTATION_DECLINED_BUSINESS', to: mailerConfig(env).notifyEmail, subject: `[Agentic AI] ${r.request_ref} declined`, body: `${r.customer_name} declined the quotation.${message ? `\n\n${message}` : ''}`, ref: r.request_ref });
    return { status: r.status, statusLabel: STATUS_LABELS[r.status] };
  }
  throw new AgenticError(400, 'action must be accept, revise or decline.');
}

export async function submitPayment(db, ref, email, input, { env = process.env } = {}) {
  const r = ownRequest(db, ref, email);
  if (r.status !== 'AWAITING_PAYMENT') throw new AgenticError(409, 'This request is not waiting for a payment.');
  const q = db.prepare("SELECT * FROM agentic_quotations WHERE request_id = ? AND status = 'ACCEPTED' ORDER BY version DESC").get(r.id);
  if (!q) throw new AgenticError(409, 'No accepted quotation found.');
  const method = String(input?.method || '');
  const reference = clean(input?.reference, 80);
  const amount = Number(input?.amount);
  if (!PAYMENT_METHODS[method]) throw new AgenticError(400, 'Choose a valid payment method.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._\- ]{3,79}$/.test(reference)) throw new AgenticError(400, 'Enter the transaction or reference number (4 to 80 letters, digits or . _ -).');
  if (!Number.isFinite(amount) || amount <= 0) throw new AgenticError(400, 'Enter the amount you paid.');
  const actor = `customer:${r.customer_email}`;
  try {
    tx(db, () => {
      db.prepare('INSERT INTO agentic_request_payments (id, request_id, quotation_id, method, reference, amount) VALUES (?,?,?,?,?,?)')
        .run(uid(), r.id, q.id, method, reference, money(amount));
      changeStatus(db, r, 'PAYMENT_VERIFICATION', actor, `Payment reference submitted: ${PAYMENT_METHODS[method]} ${reference} (${tk(amount)}).`);
      audit(db, actor, 'PAYMENT_REFERENCE_SUBMITTED', null, { ref: r.request_ref, method, reference });
    });
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) throw new AgenticError(409, 'That payment reference has already been used.');
    throw e;
  }
  await notify(db, env, { kind: 'PAYMENT_SUBMITTED_BUSINESS', to: mailerConfig(env).notifyEmail, subject: `[Agentic AI] ${r.request_ref} payment to verify`, body: `${r.customer_name} reports a payment of ${tk(amount)} via ${PAYMENT_METHODS[method]}, reference ${reference}. Quoted total ${tk(q.total)}.\nVerify it in Admin > Agentic AI > Custom requests.`, ref: r.request_ref });
  return { status: r.status, statusLabel: STATUS_LABELS[r.status] };
}

/* ------------------------------------------------------------------ admin */

export function listRequests(db, { category, status, search, limit = 50, offset = 0 } = {}) {
  const where = []; const args = [];
  if (category) { where.push('r.category = ?'); args.push(String(category).toUpperCase()); }
  if (status) { where.push('r.status = ?'); args.push(status); }
  if (search) { where.push('(r.request_ref LIKE ? OR r.customer_email LIKE ? OR r.customer_name LIKE ? OR r.company_name LIKE ?)'); const s = `%${search}%`; args.push(s, s, s, s); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT r.id, r.request_ref AS requestRef, r.category, r.status, r.customer_name AS customerName, r.customer_email AS customerEmail,
      r.company_name AS company, r.created_at AS createdAt, r.updated_at AS updatedAt,
      (SELECT total FROM agentic_quotations q WHERE q.request_id = r.id AND q.status != 'DRAFT' ORDER BY version DESC LIMIT 1) AS quotedTotal
    FROM agentic_requests r ${w} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`)
    .all(...args, Math.min(200, Math.max(1, Number(limit) || 50)), Math.max(0, Number(offset) || 0))
    .map(x => ({ ...x, statusLabel: STATUS_LABELS[x.status] }));
  return { requests: rows, total: db.prepare(`SELECT COUNT(*) AS n FROM agentic_requests r ${w}`).get(...args).n };
}

export function getRequestAdmin(db, idOrRef) {
  const r = getById(db, idOrRef);
  if (!r) throw new AgenticError(404, 'Request not found.');
  return detail(db, r, { forCustomer: false });
}

export function getRequestFile(db, idOrRef, fileId) {
  const r = getById(db, idOrRef);
  if (!r) throw new AgenticError(404, 'Request not found.');
  const f = db.prepare('SELECT * FROM agentic_request_files WHERE id = ? AND request_id = ?').get(fileId, r.id);
  if (!f) throw new AgenticError(404, 'File not found.');
  return { filename: f.filename, mime: f.mime, buffer: Buffer.from(f.data_b64, 'base64') };
}

export function getRequestOverview(db) {
  const rows = db.prepare('SELECT category, status, COUNT(*) AS n FROM agentic_requests GROUP BY category, status').all();
  const byStatus = {}; const byCategory = {};
  for (const r of rows) { byStatus[r.status] = (byStatus[r.status] || 0) + r.n; byCategory[r.category] = (byCategory[r.category] || 0) + r.n; }
  const email = db.prepare("SELECT status, COUNT(*) AS n FROM agentic_email_outbox GROUP BY status").all();
  return { byStatus, byCategory, awaitingAction: (byStatus.PENDING_ANALYSIS || 0) + (byStatus.PAYMENT_VERIFICATION || 0) + (byStatus.REVISION_REQUESTED || 0), email: Object.fromEntries(email.map(e => [e.status, e.n])) };
}

export async function setRequestStatus(db, idOrRef, to, note, actor, { env = process.env } = {}) {
  const r = getById(db, idOrRef);
  if (!r) throw new AgenticError(404, 'Request not found.');
  if (!ADMIN_SETTABLE.includes(to)) throw new AgenticError(400, `"${STATUS_LABELS[to] || to}" cannot be set manually. It is reached through quotation, payment verification or customer actions.`);
  if (to === 'IN_DEVELOPMENT' && r.status !== 'APPROVED') throw new AgenticError(409, 'Development can start only after the payment is verified (status Approved).');
  const cleanNote = clean(note, 2000);
  if (['REJECTED', 'REVISION_REQUESTED', 'CANCELLED'].includes(to) && cleanNote.length < 5) throw new AgenticError(400, 'Add a note explaining the reason (visible to the customer).');
  tx(db, () => { changeStatus(db, r, to, actor, cleanNote || null); audit(db, actor, `REQUEST_${to}`, null, { ref: r.request_ref }); });
  const messages = {
    UNDER_REVIEW: ['Your request is under review', ['Our team has started reviewing your requirements.']],
    REVISION_REQUESTED: ['More information needed', ['We need a few changes or details before we can quote:', '', cleanNote]],
    REJECTED: ['Update on your request', ['We are unable to take this request forward.', '', cleanNote]],
    CANCELLED: ['Your request was cancelled', [cleanNote || 'The request was cancelled.']],
    IN_DEVELOPMENT: ['Development has started', ['Payment is confirmed and our team has started building your agent.']],
    COMPLETED: ['Your Agentic AI project is complete', ['Your project has been completed.', cleanNote]]
  };
  const [subject, lines] = messages[to];
  await emailCustomer(db, env, r, `STATUS_${to}`, `${subject} (${r.request_ref})`, lines);
  return { status: r.status, statusLabel: STATUS_LABELS[r.status] };
}

export function addInternalNote(db, idOrRef, note, actor) {
  const r = getById(db, idOrRef);
  if (!r) throw new AgenticError(404, 'Request not found.');
  const n = clean(note, 2000);
  if (n.length < 2) throw new AgenticError(400, 'Note is empty.');
  event(db, r.id, actor, null, null, n, 1);
  return { ok: true };
}

export function saveQuotation(db, idOrRef, input, actor) {
  const r = getById(db, idOrRef);
  if (!r) throw new AgenticError(404, 'Request not found.');
  if (!['PENDING_ANALYSIS', 'UNDER_REVIEW', 'REVISION_REQUESTED'].includes(r.status)) throw new AgenticError(409, `A quotation cannot be edited while the request is "${STATUS_LABELS[r.status]}".`);
  const errors = {};
  const scope = clean(input?.scope, 4000);
  const solution = clean(input?.proposedSolution, 4000);
  const instructions = clean(input?.paymentInstructions, 3000);
  const dev = Number(input?.developmentCost);
  const days = Math.floor(Number(input?.timelineDays));
  const validity = Math.floor(Number(input?.validityDays ?? 14));
  if (!scope) errors.scope = 'Project scope is required.';
  if (!solution) errors.proposedSolution = 'Proposed solution is required.';
  if (!instructions) errors.paymentInstructions = 'Payment instructions are required.';
  if (!Number.isFinite(dev) || dev < 0 || dev > 100_000_000) errors.developmentCost = 'Enter the development cost (0 or more).';
  if (!Number.isFinite(days) || days < 1 || days > 730) errors.timelineDays = 'Delivery timeline must be 1 to 730 days.';
  if (!Number.isFinite(validity) || validity < 1 || validity > 90) errors.validityDays = 'Validity must be 1 to 90 days.';
  const charges = [];
  for (const c of Array.isArray(input?.additionalCharges) ? input.additionalCharges.slice(0, 10) : []) {
    const label = clean(c?.label, 120); const amount = Number(c?.amount);
    if (!label && !c?.amount) continue;
    if (!label || !Number.isFinite(amount) || amount < 0 || amount > 100_000_000) { errors.additionalCharges = 'Each additional charge needs a label and an amount.'; break; }
    charges.push({ label, amount: money(amount) });
  }
  if (Object.keys(errors).length) throw new AgenticError(400, 'Please correct the quotation fields.', { fields: errors });
  const total = money(dev + charges.reduce((s, c) => s + c.amount, 0));
  if (total <= 0) throw new AgenticError(400, 'The quotation total must be greater than zero.', { fields: { developmentCost: 'The total must be greater than zero.' } });

  return tx(db, () => {
    if (r.status === 'PENDING_ANALYSIS') changeStatus(db, r, 'UNDER_REVIEW', actor, 'Review started (quotation draft saved).');
    const draft = db.prepare("SELECT * FROM agentic_quotations WHERE request_id = ? AND status = 'DRAFT'").get(r.id);
    if (draft) {
      db.prepare(`UPDATE agentic_quotations SET scope=?, proposed_solution=?, development_cost=?, additional_charges_json=?, total=?, timeline_days=?, payment_instructions=?, validity_days=? WHERE id=?`)
        .run(scope, solution, money(dev), JSON.stringify(charges), total, days, instructions, validity, draft.id);
      audit(db, actor, 'QUOTATION_DRAFT_UPDATED', null, { ref: r.request_ref, version: draft.version, total });
      return { id: draft.id, version: draft.version, total };
    }
    const version = (db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM agentic_quotations WHERE request_id = ?').get(r.id).v) + 1;
    const qid = uid();
    db.prepare(`INSERT INTO agentic_quotations (id, request_id, version, scope, proposed_solution, development_cost, additional_charges_json, total, timeline_days, payment_instructions, validity_days, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(qid, r.id, version, scope, solution, money(dev), JSON.stringify(charges), total, days, instructions, validity, actor);
    audit(db, actor, 'QUOTATION_DRAFT_CREATED', null, { ref: r.request_ref, version, total });
    return { id: qid, version, total };
  });
}

export async function sendQuotation(db, idOrRef, actor, { env = process.env } = {}) {
  const r = getById(db, idOrRef);
  if (!r) throw new AgenticError(404, 'Request not found.');
  if (!['UNDER_REVIEW', 'REVISION_REQUESTED'].includes(r.status)) throw new AgenticError(409, `A quotation can be sent only while the request is Under Review or Revision Requested (now "${STATUS_LABELS[r.status]}").`);
  const q = db.prepare("SELECT * FROM agentic_quotations WHERE request_id = ? AND status = 'DRAFT'").get(r.id);
  if (!q) throw new AgenticError(409, 'Save a quotation draft first.');
  const validUntil = new Date(Date.now() + q.validity_days * 86400_000).toISOString().slice(0, 10);
  tx(db, () => {
    db.prepare("UPDATE agentic_quotations SET status = 'SUPERSEDED' WHERE request_id = ? AND status IN ('SENT','REVISION_REQUESTED') AND id != ?").run(r.id, q.id);
    db.prepare("UPDATE agentic_quotations SET status = 'SENT', sent_at = datetime('now'), valid_until = ? WHERE id = ?").run(validUntil, q.id);
    changeStatus(db, r, 'QUOTATION_SENT', actor, `Quotation v${q.version} sent (${tk(q.total)}), valid until ${validUntil}.`);
    audit(db, actor, 'QUOTATION_SENT', null, { ref: r.request_ref, version: q.version, total: q.total });
  });
  const charges = JSON.parse(q.additional_charges_json);
  const mail = await emailCustomer(db, env, r, 'QUOTATION_CUSTOMER', `Your Agentic AI quotation ${r.request_ref}`, [
    `Our team has prepared a quotation for your ${r.category === 'BRANDED' ? 'Branded' : 'Customized'} Agentic AI project.`,
    '', 'PROJECT SCOPE', q.scope, '', 'PROPOSED SOLUTION', q.proposed_solution, '',
    `Development cost: ${tk(q.development_cost)}`,
    ...charges.map(c => `${c.label}: ${tk(c.amount)}`),
    `TOTAL: ${tk(q.total)}`,
    `Estimated delivery: ${q.timeline_days} days after payment is verified`,
    `Valid until: ${validUntil}`,
    '', 'PAYMENT INSTRUCTIONS', q.payment_instructions, '',
    'Open the Agentic AI page, track your request, and accept the quotation or ask for changes.'
  ]);
  return { quotationId: q.id, version: q.version, validUntil, emailed: !!mail.ok, status: r.status, statusLabel: STATUS_LABELS[r.status] };
}

export async function verifyPayment(db, idOrRef, paymentId, input, actor, { env = process.env } = {}) {
  const r = getById(db, idOrRef);
  if (!r) throw new AgenticError(404, 'Request not found.');
  const p = db.prepare('SELECT * FROM agentic_request_payments WHERE id = ? AND request_id = ?').get(paymentId, r.id);
  if (!p) throw new AgenticError(404, 'Payment not found.');
  if (p.status !== 'SUBMITTED' || r.status !== 'PAYMENT_VERIFICATION') throw new AgenticError(409, 'This payment is not waiting for verification.');
  const q = db.prepare('SELECT * FROM agentic_quotations WHERE id = ?').get(p.quotation_id);
  const received = Number(input?.verifiedAmount);
  if (!Number.isFinite(received) || received <= 0) throw new AgenticError(400, 'Enter the amount you actually received (verifiedAmount).');
  if (money(received) < money(q.total)) throw new AgenticError(409, `The received amount ${tk(received)} is less than the quoted total ${tk(q.total)}. Reject the payment or ask the customer to pay the balance.`);
  tx(db, () => {
    db.prepare("UPDATE agentic_request_payments SET status = 'VERIFIED', verified_by = ?, verified_amount = ?, note = ?, verified_at = datetime('now') WHERE id = ?")
      .run(actor, money(received), clean(input?.note, 500) || null, p.id);
    changeStatus(db, r, 'APPROVED', actor, `Payment ${p.reference} verified (${tk(received)}).`);
    audit(db, actor, 'REQUEST_PAYMENT_VERIFIED', null, { ref: r.request_ref, reference: p.reference, received });
  });
  await emailCustomer(db, env, r, 'PAYMENT_VERIFIED_CUSTOMER', `Payment verified for ${r.request_ref}`, ['Your payment has been verified and your project is approved.', `Estimated delivery: ${q.timeline_days} days.`]);
  return { status: r.status, statusLabel: STATUS_LABELS[r.status] };
}

export async function rejectPayment(db, idOrRef, paymentId, note, actor, { env = process.env } = {}) {
  const r = getById(db, idOrRef);
  if (!r) throw new AgenticError(404, 'Request not found.');
  const p = db.prepare('SELECT * FROM agentic_request_payments WHERE id = ? AND request_id = ?').get(paymentId, r.id);
  if (!p) throw new AgenticError(404, 'Payment not found.');
  if (p.status !== 'SUBMITTED' || r.status !== 'PAYMENT_VERIFICATION') throw new AgenticError(409, 'This payment is not waiting for verification.');
  const reason = clean(note, 500);
  if (reason.length < 5) throw new AgenticError(400, 'Add the reason for rejecting the payment.');
  tx(db, () => {
    db.prepare("UPDATE agentic_request_payments SET status = 'REJECTED', verified_by = ?, note = ?, verified_at = datetime('now') WHERE id = ?").run(actor, reason, p.id);
    changeStatus(db, r, 'AWAITING_PAYMENT', actor, `Payment ${p.reference} could not be verified: ${reason}`);
    audit(db, actor, 'REQUEST_PAYMENT_REJECTED', null, { ref: r.request_ref, reference: p.reference });
  });
  await emailCustomer(db, env, r, 'PAYMENT_REJECTED_CUSTOMER', `Payment could not be verified (${r.request_ref})`, ['We could not verify the payment you reported.', reason, 'Please check the details and submit the payment reference again.']);
  return { status: r.status, statusLabel: STATUS_LABELS[r.status] };
}

/**
 * WHMCS notification for a quotation invoice. Returns null when the invoice does not belong to a request,
 * so the caller can try the order flow. Idempotent on the WHMCS transaction reference.
 */
export async function processQuotationPaymentEvent(db, whmcs, evt) {
  const invoiceId = String(evt?.invoiceId || '');
  const q = invoiceId && db.prepare('SELECT * FROM agentic_quotations WHERE whmcs_invoice_id = ?').get(invoiceId);
  if (!q) return null;
  const r = db.prepare('SELECT * FROM agentic_requests WHERE id = ?').get(q.request_id);
  const event_ = String(evt.event || '');
  if (!PAYMENT_EVENTS.includes(event_)) throw new AgenticError(400, 'Unsupported event.');
  const txRef = `WHMCS:${String(evt.transactionId || '').slice(0, 100) || `${event_}:${invoiceId}`}`;
  if (db.prepare('SELECT 1 FROM agentic_request_payments WHERE reference = ?').get(txRef)) return { duplicate: true };
  if (event_ !== 'InvoicePaid') {
    audit(db, 'whmcs', `QUOTE_INVOICE_${event_.toUpperCase()}`, null, { ref: r.request_ref, invoiceId });
    event(db, r.id, 'whmcs', null, null, `WHMCS reported ${event_} for invoice ${invoiceId}. Review the invoice.`, 1);
    return { duplicate: false, handled: false, status: r.status };
  }
  let ok = money(evt.amount) === money(q.total);
  let verified = 0;
  if (ok && whmcs.isConfigured) {
    const live = await whmcs.getInvoice(invoiceId);
    ok = String(live.status).toLowerCase() === 'paid' && money(live.total) === money(q.total);
    verified = ok ? 1 : 0;
  }
  return tx(db, () => {
    const fresh = db.prepare('SELECT * FROM agentic_requests WHERE id = ?').get(r.id);
    if (!ok) {
      event(db, fresh.id, 'whmcs', null, null, `WHMCS payment event for invoice ${invoiceId} did not match the quotation total. Needs manual review.`, 1);
      audit(db, 'whmcs', 'QUOTE_PAYMENT_FLAGGED', null, { ref: fresh.request_ref, invoiceId });
      return { duplicate: false, handled: false, flagged: true, status: fresh.status };
    }
    db.prepare("INSERT INTO agentic_request_payments (id, request_id, quotation_id, method, reference, amount, status, verified_by, verified_amount, verified_at) VALUES (?,?,?,?,?,?,'VERIFIED','whmcs',?,datetime('now'))")
      .run(uid(), fresh.id, q.id, 'WHMCS', txRef, money(evt.amount), money(evt.amount));
    if (['AWAITING_PAYMENT', 'PAYMENT_VERIFICATION'].includes(fresh.status)) {
      changeStatus(db, fresh, 'APPROVED', 'whmcs', `WHMCS confirmed payment of invoice ${invoiceId}${verified ? ' (checked with WHMCS)' : ''}.`);
    }
    audit(db, 'whmcs', 'QUOTE_PAYMENT_VERIFIED', null, { ref: fresh.request_ref, invoiceId });
    return { duplicate: false, handled: true, status: fresh.status, orderStatus: fresh.status };
  });
}
