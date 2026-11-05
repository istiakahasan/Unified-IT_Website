import crypto from 'node:crypto';
import { FORM_SPECS, CONTACT_FIELDS, FormError, validateForm, allFields } from './agentic-forms.mjs';
import { schemaSql as outboxSchemaSql, sendNotification, mailerConfig } from './mailer.mjs';

/**
 * Agentic AI module: configurations, server-authoritative pricing, RAG character billing,
 * voice-call usage, WHMCS order/invoice hand-off, verified payment activation and audit trail.
 *
 * Rules enforced here (never in the browser):
 *  - every price is read from agentic_pricing_config / agentic_configurations, never from the client
 *  - the RAG character count is recomputed from the uploaded bytes on the server
 *  - a service becomes ACTIVE only after a verified WHMCS payment event
 */

export const CURRENCY = 'BDT';
export const CONFIG_CODES = ['READY_MADE', 'CUSTOM_BRANDED', 'CHAT_ONLY'];
export const BACKUP_INTERVALS = ['one_time', 'monthly'];

// RAG limits. Only plain-text formats are accepted because no PDF/DOCX parser is installed
// (the server has no runtime dependencies). Binary files are rejected, never billed.
export const RAG_LIMITS = Object.freeze({
  maxDocuments: 5,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalCharacters: 2_000_000,
  extensions: ['.txt', '.md', '.csv', '.json', '.log', '.xml', '.yaml', '.yml']
});
export const LOGO_LIMITS = Object.freeze({ maxBytes: 1024 * 1024, mimes: ['image/png', 'image/jpeg', 'image/webp'] });

const DEFAULT_PRICING = {
  server_monthly: '1000',
  backup_amount: '500',
  backup_interval: '',            // intentionally unset: the billing interval is not confirmed (see README)
  maintenance_monthly: '5000',
  rag_per_char: '1',
  call_per_minute: '5',
  call_rounding: 'ceil'           // 'ceil' = every started minute of a call is billed; 'exact' = seconds/60
};

const DEFAULT_CONFIGS = [
  ['READY_MADE', 'Ready-Made AI Agent', 'Pre-built agent template deployed as-is. No development fee.', 0, 1, 0, 1],
  ['CUSTOM_BRANDED', 'Customized / Branded AI Agent', 'Your branding, identity, personality, business information and workflows.', 25000, 1, 1, 2],
  ['CHAT_ONLY', 'Chat-Only AI Agent', 'Text chat agent. Voice calling is not available.', 20000, 0, 0, 3]
];

const DEFAULT_PRODUCTS = [
  { code: 'SUPPORT_AGENT', name: 'Customer Support Agent', tagline: 'Always-on first response for your customers', badge: '', sort: 1,
    description: 'Always-on assistant that resolves common questions and routes the rest to your team.',
    capabilities: ['24/7 first response', 'Knowledge-base answers', 'Ticket triage and routing', 'Human escalation'] },
  { code: 'KNOWLEDGE_ASSISTANT', name: 'Knowledge Assistant', tagline: 'Ask questions across your company documents', badge: '', sort: 2,
    description: 'Searches and summarizes your company documents, policies and data with answers you can trace to a source.',
    capabilities: ['Document search', 'Answers with sources', 'Team-wide access', 'Access controls'] },
  { code: 'WORKFLOW_AGENT', name: 'Workflow Automation Agent', tagline: 'Repetitive internal processes, start to finish', badge: '', sort: 3,
    description: 'Handles repetitive internal processes from start to finish and reports back.',
    capabilities: ['Approvals and requests', 'Data entry and updates', 'Scheduled reports', 'Integration with existing systems'] }
];

const PRICING_KEYS = {
  server_monthly: 'number', backup_amount: 'number', maintenance_monthly: 'number',
  rag_per_char: 'number', call_per_minute: 'number',
  backup_interval: ['', 'one_time', 'monthly'], call_rounding: ['ceil', 'exact']
};

export class AgenticError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/* ------------------------------------------------------------------ schema */

export function initAgenticSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_pricing_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agentic_configurations (
      code TEXT PRIMARY KEY CHECK(code IN ('READY_MADE', 'CUSTOM_BRANDED', 'CHAT_ONLY')),
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      development_cost REAL NOT NULL CHECK(development_cost >= 0),
      voice_allowed INTEGER NOT NULL DEFAULT 0,
      branding_allowed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agentic_orders (
      id TEXT PRIMARY KEY,
      order_ref TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      company_name TEXT,
      config_code TEXT NOT NULL,
      voice_enabled INTEGER NOT NULL DEFAULT 0,
      backup_enabled INTEGER NOT NULL DEFAULT 1,
      maintenance_enabled INTEGER NOT NULL DEFAULT 0,
      branding_json TEXT,
      brand_logo_mime TEXT,
      brand_logo_b64 TEXT,
      product_code TEXT,
      requirements_json TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
        CHECK(status IN ('PENDING_PAYMENT','BILLING_ERROR','PAYMENT_REVIEW','ACTIVE','SUSPENDED','CANCELLED','REFUNDED')),
      pricing_snapshot_json TEXT NOT NULL,
      development_cost REAL NOT NULL,
      server_monthly REAL NOT NULL,
      backup_amount REAL NOT NULL,
      backup_interval TEXT,
      maintenance_monthly REAL NOT NULL,
      rag_chars INTEGER NOT NULL DEFAULT 0,
      rag_cost REAL NOT NULL DEFAULT 0,
      call_rate REAL NOT NULL DEFAULT 0,
      initial_total REAL NOT NULL,
      recurring_total REAL NOT NULL,
      whmcs_client_id TEXT,
      whmcs_order_id TEXT,
      whmcs_product_id TEXT,
      billing_error TEXT,
      provisioning_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      activated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(config_code) REFERENCES agentic_configurations(code),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS agentic_rag_documents (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      char_count INTEGER NOT NULL CHECK(char_count >= 0),
      cost REAL NOT NULL,
      rate REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PROCESSED' CHECK(status IN ('PROCESSED','FAILED')),
      extracted_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(order_id, content_hash),
      FOREIGN KEY(order_id) REFERENCES agentic_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agentic_products (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      setup_fee REAL NOT NULL DEFAULT 0 CHECK(setup_fee >= 0),
      monthly_fee REAL NOT NULL DEFAULT 0 CHECK(monthly_fee >= 0),
      badge TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agentic_invoices (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('INITIAL','USAGE')),
      whmcs_invoice_id TEXT UNIQUE,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('UNPAID','PAID','CANCELLED','REFUNDED')),
      checkout_url TEXT,
      sandbox INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES agentic_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agentic_payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      invoice_id TEXT,
      whmcs_invoice_id TEXT,
      transaction_ref TEXT UNIQUE NOT NULL,
      event TEXT NOT NULL,
      amount REAL,
      status TEXT NOT NULL CHECK(status IN ('PENDING','SUCCESS','FAILED','CANCELLED','REFUNDED','FLAGGED')),
      verified_with_whmcs INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES agentic_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agentic_subscriptions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('SERVER','BACKUP','MAINTENANCE')),
      amount REAL NOT NULL,
      billing_interval TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','SUSPENDED','CANCELLED')),
      next_due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(order_id, kind),
      FOREIGN KEY(order_id) REFERENCES agentic_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agentic_call_usage (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      provider_ref TEXT UNIQUE NOT NULL,
      started_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 0),
      billed_minutes REAL NOT NULL,
      rate REAL NOT NULL,
      amount REAL NOT NULL,
      usage_invoice_id TEXT,
      recorded_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES agentic_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agentic_activations (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES agentic_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agentic_audit_logs (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agentic_orders_email ON agentic_orders(customer_email);
    CREATE INDEX IF NOT EXISTS idx_agentic_orders_status ON agentic_orders(status);
    CREATE INDEX IF NOT EXISTS idx_agentic_docs_order ON agentic_rag_documents(order_id);
    CREATE INDEX IF NOT EXISTS idx_agentic_usage_order ON agentic_call_usage(order_id);
    CREATE INDEX IF NOT EXISTS idx_agentic_invoices_order ON agentic_invoices(order_id);
  `);

  const insPrice = db.prepare('INSERT OR IGNORE INTO agentic_pricing_config (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_PRICING)) insPrice.run(k, v);
  const insCfg = db.prepare(`INSERT OR IGNORE INTO agentic_configurations
    (code, name, description, development_cost, voice_allowed, branding_allowed, sort_order) VALUES (?,?,?,?,?,?,?)`);
  for (const c of DEFAULT_CONFIGS) insCfg.run(...c);

  // Upgrade path for databases created before the four-option restructure.
  const orderCols = new Set(db.prepare('PRAGMA table_info(agentic_orders)').all().map(c => c.name));
  if (!orderCols.has('product_code')) db.exec('ALTER TABLE agentic_orders ADD COLUMN product_code TEXT;');
  if (!orderCols.has('requirements_json')) db.exec('ALTER TABLE agentic_orders ADD COLUMN requirements_json TEXT;');
  // Customized and Branded agents are quoted individually (agentic-requests.mjs); the old fixed-price row stays
  // only so historical orders keep their reference.
  db.exec("UPDATE agentic_configurations SET active = 0 WHERE code = 'CUSTOM_BRANDED'");
  db.exec(outboxSchemaSql());

  // Starter Ready-Made catalog (the three solutions the Agentic AI page already described). Prices default to no
  // extra charge so the confirmed Ready-Made rule (no development fee) holds; administrators edit them in the admin panel.
  const insProd = db.prepare('INSERT OR IGNORE INTO agentic_products (code, name, tagline, description, capabilities_json, badge, sort_order) VALUES (?,?,?,?,?,?,?)');
  for (const p of DEFAULT_PRODUCTS) insProd.run(p.code, p.name, p.tagline, p.description, JSON.stringify(p.capabilities), p.badge, p.sort);
}

/* ----------------------------------------------------------------- helpers */

const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const id = () => crypto.randomUUID();

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  }
}

export function audit(db, actor, action, orderId = null, details = {}) {
  try {
    db.prepare('INSERT INTO agentic_audit_logs (id, order_id, actor, action, details_json) VALUES (?,?,?,?,?)')
      .run(id(), orderId, String(actor || 'system'), action, JSON.stringify(details));
  } catch (e) {
    console.error('[Agentic audit]', e.message);
  }
}

function productFromRow(p) {
  return {
    code: p.code, name: p.name, tagline: p.tagline, description: p.description,
    capabilities: JSON.parse(p.capabilities_json || '[]'),
    setupFee: money(p.setup_fee), monthlyFee: money(p.monthly_fee),
    badge: p.badge, sortOrder: p.sort_order, active: !!p.active
  };
}

export function getPricing(db) {
  const kv = {};
  for (const r of db.prepare('SELECT key, value FROM agentic_pricing_config').all()) kv[r.key] = r.value;
  const configs = {};
  for (const c of db.prepare('SELECT * FROM agentic_configurations ORDER BY sort_order').all()) {
    configs[c.code] = {
      code: c.code, name: c.name, description: c.description,
      developmentCost: money(c.development_cost),
      voiceAllowed: !!c.voice_allowed, brandingAllowed: !!c.branding_allowed, active: !!c.active
    };
  }
  const products = {};
  for (const p of db.prepare('SELECT * FROM agentic_products ORDER BY sort_order, name').all()) products[p.code] = productFromRow(p);
  return {
    currency: CURRENCY,
    serverMonthly: money(kv.server_monthly),
    backupAmount: money(kv.backup_amount),
    backupInterval: BACKUP_INTERVALS.includes(kv.backup_interval) ? kv.backup_interval : null,
    maintenanceMonthly: money(kv.maintenance_monthly),
    ragPerChar: Number(kv.rag_per_char),
    callPerMinute: Number(kv.call_per_minute),
    callRounding: kv.call_rounding === 'exact' ? 'exact' : 'ceil',
    configs,
    products
  };
}

/** Public, customer-safe view of the catalog (prices and which options each configuration allows). */
export function getCatalog(db, telephony = getTelephonyStatus()) {
  const p = getPricing(db);
  return {
    currency: p.currency,
    configurations: Object.values(p.configs).filter(c => c.active),
    rates: {
      serverMonthly: p.serverMonthly,
      backupAmount: p.backupAmount,
      backupInterval: p.backupInterval,
      maintenanceMonthly: p.maintenanceMonthly,
      ragPerCharacter: p.ragPerChar,
      callPerMinute: p.callPerMinute
    },
    products: Object.values(p.products).filter(x => x.active),
    forms: FORM_SPECS,
    contactFields: CONTACT_FIELDS,
    ragLimits: RAG_LIMITS,
    logoLimits: LOGO_LIMITS,
    telephony
  };
}

export function updatePricing(db, changes, actor) {
  const applied = {};
  tx(db, () => {
    for (const [key, raw] of Object.entries(changes || {})) {
      if (key.startsWith('cfg_') && key.endsWith('_dev')) {
        const code = { cfg_ready_dev: 'READY_MADE', cfg_custom_dev: 'CUSTOM_BRANDED', cfg_chat_dev: 'CHAT_ONLY' }[key];
        const n = Number(raw);
        if (!code || !Number.isFinite(n) || n < 0 || n > 100_000_000) throw new AgenticError(400, `Invalid value for ${key}.`);
        db.prepare("UPDATE agentic_configurations SET development_cost = ?, updated_at = datetime('now') WHERE code = ?").run(money(n), code);
        applied[key] = money(n);
        continue;
      }
      const rule = PRICING_KEYS[key];
      if (!rule) throw new AgenticError(400, `Unknown pricing key: ${key}`);
      let value;
      if (rule === 'number') {
        const n = Number(raw);
        if (raw === '' || raw === null || !Number.isFinite(n) || n < 0 || n > 100_000_000) throw new AgenticError(400, `Invalid value for ${key}.`);
        value = String(money(n) === n ? n : money(n));
      } else {
        value = String(raw ?? '');
        if (!rule.includes(value)) throw new AgenticError(400, `${key} must be one of: ${rule.map(v => v || '(unset)').join(', ')}`);
      }
      db.prepare("INSERT INTO agentic_pricing_config (key, value, updated_by, updated_at) VALUES (?,?,?,datetime('now')) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
        .run(key, value, actor);
      applied[key] = value;
    }
    audit(db, actor, 'PRICING_UPDATED', null, applied);
  });
  return applied;
}

/**
 * No telephony provider exists in this codebase. Live calling is therefore reported as NOT operational
 * unless a deployment sets AGENTIC_TELEPHONY_PROVIDER (a label only: usage is recorded through the
 * admin/provider usage endpoint; this module does not place calls).
 */
export function getTelephonyStatus(env = process.env) {
  const provider = (env.AGENTIC_TELEPHONY_PROVIDER || '').trim();
  return {
    configured: !!provider,
    provider: provider || null,
    notice: provider
      ? `Call usage is recorded from provider "${provider}".`
      : 'No telephony provider is configured. Voice calling can be selected and priced, but live calls are not operational until a provider is connected.'
  };
}

/* ----------------------------------------------------- RAG character count */

/**
 * Billable characters = Unicode code points of the text after NFC normalisation.
 * Spaces, tabs, line breaks and any other whitespace are counted; nothing is trimmed.
 * NFC makes Bengali counting deterministic (pre-composed ো/ৌ vs the two-part form give the same count).
 * A leading U+FEFF byte-order mark is an encoding marker, not text, and is removed first.
 */
export function countBillableCharacters(text) {
  let n = 0;
  for (const _ of String(text).replace(/^﻿/, '').normalize('NFC')) n++;
  return n;
}

export function extractDocumentText(doc) {
  const name = String(doc?.name || '').replace(/[\\/\0]/g, '_').slice(0, 200);
  if (!name) throw new AgenticError(400, 'Every document needs a file name.');
  const ext = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (ext && !RAG_LIMITS.extensions.includes(ext)) {
    throw new AgenticError(415, `"${name}": unsupported file type ${ext}. Supported: ${RAG_LIMITS.extensions.join(', ')} (or paste the text).`);
  }
  let text;
  if (typeof doc.text === 'string') {
    text = doc.text;
    if (Buffer.byteLength(text, 'utf8') > RAG_LIMITS.maxFileBytes) throw new AgenticError(413, `"${name}" is larger than ${RAG_LIMITS.maxFileBytes / 1024 / 1024} MB.`);
  } else if (typeof doc.contentBase64 === 'string') {
    const buf = Buffer.from(doc.contentBase64, 'base64');
    if (buf.length > RAG_LIMITS.maxFileBytes) throw new AgenticError(413, `"${name}" is larger than ${RAG_LIMITS.maxFileBytes / 1024 / 1024} MB.`);
    if (buf.includes(0)) throw new AgenticError(415, `"${name}" looks like a binary file; only readable text is processed.`);
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      throw new AgenticError(415, `"${name}" is not valid UTF-8 text.`);
    }
  } else {
    throw new AgenticError(400, `"${name}" has no content.`);
  }
  return { name, text: text.replace(/^﻿/, '') };
}

/** Server-side RAG analysis of all supplied documents. Identical content is billed once. */
export function analyseDocuments(rawDocs = [], pastedText = '') {
  const docs = Array.isArray(rawDocs) ? rawDocs.slice() : [];
  if (typeof pastedText === 'string' && pastedText.length) docs.push({ name: 'pasted-text.txt', text: pastedText });
  if (docs.length > RAG_LIMITS.maxDocuments) throw new AgenticError(400, `At most ${RAG_LIMITS.maxDocuments} documents per order.`);
  const seen = new Set();
  const accepted = [];
  const skippedDuplicates = [];
  let total = 0;
  for (const d of docs) {
    const { name, text } = extractDocumentText(d);
    const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    if (seen.has(hash)) { skippedDuplicates.push(name); continue; }
    seen.add(hash);
    const chars = countBillableCharacters(text);
    total += chars;
    accepted.push({ name, text, hash, chars });
  }
  if (total > RAG_LIMITS.maxTotalCharacters) {
    throw new AgenticError(413, `Total document size exceeds ${RAG_LIMITS.maxTotalCharacters.toLocaleString('en-US')} characters.`);
  }
  return { documents: accepted, totalChars: total, skippedDuplicates };
}

/* ------------------------------------------------------------------ quote */

export function buildQuote(pricing, input = {}, ragChars = 0) {
  const cfg = pricing.configs[input.configCode];
  if (!cfg || !cfg.active) throw new AgenticError(400, 'Choose a valid Agentic AI configuration.');
  const wantsVoice = input.voice === true || input.voice === 'true';
  if (wantsVoice && !cfg.voiceAllowed) throw new AgenticError(400, `Voice calling is not available for the ${cfg.name}.`);
  const voice = wantsVoice && cfg.voiceAllowed;
  let product = null;
  if (cfg.code === 'READY_MADE') {
    const available = Object.values(pricing.products || {}).filter(p => p.active);
    if (available.length) {
      product = pricing.products[input.productCode];
      if (!product || !product.active) throw new AgenticError(400, 'Choose one of the available Ready-Made AI solutions.');
    }
  }
  const backup = input.backup !== false && input.backup !== 'false';
  const maintenance = input.maintenance === true || input.maintenance === 'true';
  const chars = Math.max(0, Math.floor(Number(ragChars) || 0));
  const ragCost = money(chars * pricing.ragPerChar);

  const oneTime = [];
  if (cfg.developmentCost > 0) oneTime.push({ code: 'DEVELOPMENT', label: `${cfg.name} development (one-time)`, amount: cfg.developmentCost });

  if (product && product.setupFee > 0) oneTime.push({ code: 'PRODUCT_SETUP', label: `${product.name} setup (one-time)`, amount: product.setupFee });
  const recurring = [{ code: 'SERVER', label: 'Server', amount: pricing.serverMonthly, interval: 'monthly' }];
  if (product && product.monthlyFee > 0) recurring.push({ code: 'PRODUCT', label: product.name, amount: product.monthlyFee, interval: 'monthly' });
  const notices = [];
  let backupLine = null;
  if (backup) {
    if (pricing.backupInterval === 'one_time') {
      backupLine = { code: 'BACKUP', label: 'Backup (one-time)', amount: pricing.backupAmount, interval: 'one_time' };
      oneTime.push(backupLine);
    } else if (pricing.backupInterval === 'monthly') {
      backupLine = { code: 'BACKUP', label: 'Backup', amount: pricing.backupAmount, interval: 'monthly' };
      recurring.push(backupLine);
    } else {
      backupLine = { code: 'BACKUP', label: 'Backup', amount: pricing.backupAmount, interval: null };
      notices.push(`Backup (৳${pricing.backupAmount.toLocaleString('en-US')}) is listed separately; its billing interval has not been confirmed yet, so it is not included in the payment estimates.`);
    }
  }
  if (maintenance) recurring.push({ code: 'MAINTENANCE', label: 'Maintenance', amount: pricing.maintenanceMonthly, interval: 'monthly' });

  const usage = [{
    code: 'RAG', label: 'RAG processing', quantity: chars, unit: 'character',
    rate: pricing.ragPerChar, amount: ragCost, billing: 'Charged on the initial invoice for the characters actually processed'
  }];
  if (voice) {
    usage.push({
      code: 'VOICE', label: 'Voice calling', quantity: null, unit: 'minute',
      rate: pricing.callPerMinute, amount: null, billing: 'Billed after use, from recorded call minutes'
    });
  }

  const oneTimeTotal = money(oneTime.reduce((s, l) => s + l.amount, 0));
  const recurringTotal = money(recurring.filter(l => l.interval === 'monthly').reduce((s, l) => s + l.amount, 0));
  return {
    currency: CURRENCY,
    configuration: { code: cfg.code, name: cfg.name },
    product: product ? { code: product.code, name: product.name } : null,
    features: { voice, branding: cfg.brandingAllowed, backup, maintenance },
    oneTime, recurring, usage,
    backup: backupLine,
    totals: {
      oneTime: oneTimeTotal,
      recurringMonthly: recurringTotal,
      ragCharacters: chars,
      ragCost,
      callRatePerMinute: voice ? pricing.callPerMinute : null,
      // first invoice = one-time + first month of recurring + RAG actually processed
      initialPayment: money(oneTimeTotal + recurringTotal + ragCost)
    },
    maintenanceStatus: maintenance ? 'ENABLED' : 'NOT_REQUIRED',
    notices
  };
}

/* ------------------------------------------------------- input validation */

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

function validateCustomer(c = {}) {
  const name = clean(c.name, 120);
  const email = clean(c.email, 254).toLowerCase();
  if (name.length < 2) throw new AgenticError(400, 'Your name is required.');
  if (!EMAIL_RE.test(email)) throw new AgenticError(400, 'A valid email address is required.');
  return { name, email, phone: clean(c.phone, 30), company: clean(c.company, 120) };
}

function validateBranding(cfg, b = {}) {
  if (!cfg.brandingAllowed) return null;
  const out = {
    brandName: clean(b.brandName, 120),
    businessIdentity: clean(b.businessIdentity, 1000),
    agentPersonality: clean(b.agentPersonality, 1000),
    businessInformation: clean(b.businessInformation, 4000),
    customResponses: clean(b.customResponses, 4000),
    workflows: clean(b.workflows, 4000)
  };
  if (!out.brandName) throw new AgenticError(400, 'Brand / company name is required for the Customized / Branded agent.');
  return out;
}

function validateLogo(l) {
  if (!l || !l.dataBase64) return null;
  if (!LOGO_LIMITS.mimes.includes(l.mime)) throw new AgenticError(415, 'Logo must be a PNG, JPEG or WebP image.');
  const buf = Buffer.from(String(l.dataBase64), 'base64');
  if (!buf.length || buf.length > LOGO_LIMITS.maxBytes) throw new AgenticError(413, 'Logo must be smaller than 1 MB.');
  const magic = {
    'image/png': buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    'image/jpeg': buf[0] === 0xff && buf[1] === 0xd8,
    'image/webp': buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP'
  }[l.mime];
  if (!magic) throw new AgenticError(415, 'Logo file content does not match its type.');
  return { mime: l.mime, b64: buf.toString('base64') };
}

/* ----------------------------------------------------------- WHMCS mapping */

/**
 * WHMCS product / addon IDs come only from the environment. Nothing is invented: if the product for the
 * chosen configuration is not mapped, live billing refuses to create the order.
 */
export function getWhmcsMapping(env = process.env) {
  const addon = (v) => (v && /^\d+$/.test(v) ? v : null);
  return {
    products: {
      READY_MADE: env.AGENTIC_WHMCS_PID_READY_MADE || null,
      CUSTOM_BRANDED: env.AGENTIC_WHMCS_PID_CUSTOM_BRANDED || null,
      CHAT_ONLY: env.AGENTIC_WHMCS_PID_CHAT_ONLY || null
    },
    addons: {
      MAINTENANCE: addon(env.AGENTIC_WHMCS_ADDON_MAINTENANCE),
      BACKUP: addon(env.AGENTIC_WHMCS_ADDON_BACKUP)
    },
    paymentMethod: env.AGENTIC_WHMCS_PAYMENT_METHOD || env.WHMCS_PAYMENT_METHOD || null,
    clientAreaUrl: env.WHMCS_CLIENT_AREA_URL || null
  };
}

/* ---------------------------------------------------------------- orders */

function newOrderRef() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(8)) s += alphabet[b % alphabet.length];
  return `AGT-${new Date().getFullYear()}-${s}`;
}

export function upsertCustomer(db, c) {
  const existing = db.prepare('SELECT id FROM customers WHERE lower(email) = ?').get(c.email);
  if (existing) return existing.id;
  const [first, ...rest] = c.name.split(/\s+/);
  const cid = 'cust-' + crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO customers (id, first_name, last_name, company_name, email, phone) VALUES (?,?,?,?,?,?)')
    .run(cid, first, rest.join(' ') || '-', c.company || null, c.email, c.phone || null);
  return cid;
}

export async function createOrder(db, whmcs, input, { env = process.env, actor = 'customer' } = {}) {
  const idemKey = clean(input.idempotencyKey, 100);
  if (idemKey.length < 8) throw new AgenticError(400, 'idempotencyKey (min 8 chars) is required to prevent duplicate orders.');
  const customer = validateCustomer(input.customer);

  // Replay of the same request: never create a second order or invoice.
  const prior = db.prepare('SELECT * FROM agentic_orders WHERE idempotency_key = ?').get(idemKey);
  if (prior) {
    if (prior.customer_email !== customer.email) throw new AgenticError(409, 'This idempotency key belongs to a different order.');
    if (prior.status !== 'BILLING_ERROR') return { replay: true, ...orderCheckoutView(db, prior) };
    return retryBilling(db, whmcs, prior, env);
  }

  const pricing = getPricing(db);
  const cfg = pricing.configs[input.configCode];
  if (!cfg) throw new AgenticError(400, 'Choose a valid Agentic AI configuration.');
  if (!cfg.active) throw new AgenticError(400, 'Customized and Branded agents are quoted individually. Submit your requirements through that option instead.');
  let requirements = null;
  if (FORM_SPECS[cfg.code]) {
    try {
      requirements = validateForm(cfg.code, input.requirements);
    } catch (e) {
      if (e instanceof FormError) throw new AgenticError(400, e.message, { fields: e.fields });
      throw e;
    }
  }
  const analysis = analyseDocuments(input.documents, input.ragText);
  const quote = buildQuote(pricing, input, analysis.totalChars);

  if (input.expectedInitialTotal !== undefined && money(input.expectedInitialTotal) !== quote.totals.initialPayment) {
    throw new AgenticError(409, 'Prices changed since you last reviewed them. Please review the updated summary.', { code: 'price_changed', quote });
  }
  const branding = validateBranding(cfg, input.branding);
  const logo = cfg.brandingAllowed ? validateLogo(input.logo) : null;

  const orderId = id();
  const ref = newOrderRef();
  tx(db, () => {
    const customerId = upsertCustomer(db, customer);
    db.prepare(`INSERT INTO agentic_orders (
        id, order_ref, idempotency_key, customer_id, customer_name, customer_email, customer_phone, company_name,
        config_code, voice_enabled, backup_enabled, maintenance_enabled, branding_json, brand_logo_mime, brand_logo_b64, product_code, requirements_json,
        pricing_snapshot_json, development_cost, server_monthly, backup_amount, backup_interval, maintenance_monthly,
        rag_chars, rag_cost, call_rate, initial_total, recurring_total)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      orderId, ref, idemKey, customerId, customer.name, customer.email, customer.phone, customer.company,
      cfg.code, quote.features.voice ? 1 : 0, quote.features.backup ? 1 : 0, quote.features.maintenance ? 1 : 0,
      branding ? JSON.stringify(branding) : null, logo?.mime || null, logo?.b64 || null,
      quote.product?.code || null, requirements ? JSON.stringify(requirements) : null,
      JSON.stringify(quote), cfg.developmentCost, pricing.serverMonthly, pricing.backupAmount, pricing.backupInterval,
      pricing.maintenanceMonthly, analysis.totalChars, quote.totals.ragCost, quote.features.voice ? pricing.callPerMinute : 0,
      quote.totals.initialPayment, quote.totals.recurringMonthly);

    const insDoc = db.prepare(`INSERT INTO agentic_rag_documents
      (id, order_id, filename, content_hash, char_count, cost, rate, extracted_text) VALUES (?,?,?,?,?,?,?,?)`);
    for (const d of analysis.documents) insDoc.run(id(), orderId, d.name, d.hash, d.chars, money(d.chars * pricing.ragPerChar), pricing.ragPerChar, d.text);

    const insSub = db.prepare('INSERT INTO agentic_subscriptions (id, order_id, kind, amount, billing_interval) VALUES (?,?,?,?,?)');
    insSub.run(id(), orderId, 'SERVER', pricing.serverMonthly, 'monthly');
    if (quote.features.backup && pricing.backupInterval === 'monthly') insSub.run(id(), orderId, 'BACKUP', pricing.backupAmount, 'monthly');
    if (quote.features.maintenance) insSub.run(id(), orderId, 'MAINTENANCE', pricing.maintenanceMonthly, 'monthly');

    audit(db, actor, 'ORDER_CREATED', orderId, { ref, config: cfg.code, initialTotal: quote.totals.initialPayment, ragChars: analysis.totalChars });
  });

  const order = db.prepare('SELECT * FROM agentic_orders WHERE id = ?').get(orderId);
  const result = await retryBilling(db, whmcs, order, env);
  result.skippedDuplicates = analysis.skippedDuplicates;
  // Tell the business inbox about every new order too (best effort; the order never fails because of mail).
  const notifyTo = mailerConfig(env).notifyEmail;
  if (notifyTo) {
    const lines = requirements ? allFields(FORM_SPECS[cfg.code]).filter(f => requirements[f.key]).map(f => `${f.label}: ${requirements[f.key]}`) : [];
    await sendNotification(db, {
      kind: 'ORDER_CREATED_BUSINESS', to: notifyTo, ref,
      subject: `[Agentic AI] New ${cfg.name} order ${ref}`,
      body: [`New ${cfg.name} order ${ref}`, quote.product ? `Solution: ${quote.product.name}` : '', `Customer: ${customer.name} <${customer.email}>`,
        `Initial payment: ৳${quote.totals.initialPayment}, recurring ৳${quote.totals.recurringMonthly}/month`, '', ...lines].filter(x => x !== '').join('\n')
    }, env);
  }
  return result;
}

async function retryBilling(db, whmcs, order, env) {
  const map = getWhmcsMapping(env);
  const quote = JSON.parse(order.pricing_snapshot_json);
  try {
    if (whmcs.isConfigured) {
      if (!map.products[order.config_code]) throw new Error(`WHMCS product for ${order.config_code} is not mapped (set AGENTIC_WHMCS_PID_${order.config_code}).`);
      if (!map.paymentMethod) throw new Error('WHMCS payment method is not configured (set AGENTIC_WHMCS_PAYMENT_METHOD).');
    }
    const [first, ...rest] = order.customer_name.split(/\s+/);
    const client = await whmcs.syncClient({
      email: order.customer_email, firstName: first, lastName: rest.join(' ') || '-',
      companyName: order.company_name || '', phoneNumber: order.customer_phone || ''
    });
    const billing = await whmcs.createAgenticOrder({
      clientId: client.clientid,
      productId: map.products[order.config_code],
      addonIds: [order.maintenance_enabled && map.addons.MAINTENANCE, order.backup_enabled && order.backup_interval === 'monthly' && map.addons.BACKUP].filter(Boolean),
      paymentMethod: map.paymentMethod,
      recurringMonthly: quote.totals.recurringMonthly,
      oneTimeItems: [
        ...quote.oneTime.map(l => ({ description: l.label, amount: l.amount })),
        ...(order.rag_cost > 0 ? [{ description: `RAG processing (${order.rag_chars.toLocaleString('en-US')} characters)`, amount: order.rag_cost }] : [])
      ],
      expectedTotal: order.initial_total,
      orderRef: order.order_ref,
      idempotencyKey: `agentic-order-${order.id}`
    });
    tx(db, () => {
      db.prepare(`UPDATE agentic_orders SET status = 'PENDING_PAYMENT', whmcs_client_id = ?, whmcs_order_id = ?, whmcs_product_id = ?,
        billing_error = NULL, updated_at = datetime('now') WHERE id = ?`)
        .run(String(client.clientid), String(billing.orderId), map.products[order.config_code], order.id);
      db.prepare('UPDATE customers SET whmcs_client_id = ? WHERE id = ?').run(Number(client.clientid) || null, order.customer_id);
      db.prepare(`INSERT INTO agentic_invoices (id, order_id, kind, whmcs_invoice_id, amount, checkout_url, sandbox)
        VALUES (?,?,?,?,?,?,?)`).run(id(), order.id, 'INITIAL', String(billing.invoiceId), order.initial_total, billing.checkoutUrl, billing.sandbox ? 1 : 0);
      audit(db, 'system', 'WHMCS_INVOICE_CREATED', order.id, { invoiceId: billing.invoiceId, sandbox: !!billing.sandbox });
    });
  } catch (e) {
    db.prepare("UPDATE agentic_orders SET status = 'BILLING_ERROR', billing_error = ?, updated_at = datetime('now') WHERE id = ?")
      .run(String(e.message).slice(0, 500), order.id);
    audit(db, 'system', 'WHMCS_BILLING_FAILED', order.id, { error: e.message });
    throw new AgenticError(502, 'The billing system could not create your invoice. Nothing was charged. Please retry with the same request.', { orderRef: order.order_ref });
  }
  return orderCheckoutView(db, db.prepare('SELECT * FROM agentic_orders WHERE id = ?').get(order.id));
}

function orderCheckoutView(db, order) {
  const inv = db.prepare("SELECT * FROM agentic_invoices WHERE order_id = ? AND kind = 'INITIAL'").get(order.id);
  return {
    orderRef: order.order_ref,
    status: order.status,
    quote: JSON.parse(order.pricing_snapshot_json),
    invoice: inv ? { id: inv.whmcs_invoice_id, amount: inv.amount, status: inv.status, sandbox: !!inv.sandbox } : null,
    checkoutUrl: inv?.checkout_url || null
  };
}

/* ---------------------------------------------------------- payment events */

export const PAYMENT_EVENTS = ['InvoicePaid', 'InvoiceCancelled', 'InvoiceRefunded', 'PaymentFailed', 'InvoiceUnpaid'];

export function verifyWebhookSignature(rawBody, header, secret) {
  if (!secret || !header) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(String(header).replace(/^sha256=/, ''), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Applies a signature-verified WHMCS event. Idempotent on the WHMCS transaction reference, so a replayed
 * notification can never activate a service or record a payment twice.
 */
export async function processPaymentEvent(db, whmcs, evt) {
  const event = String(evt?.event || '');
  if (!PAYMENT_EVENTS.includes(event)) throw new AgenticError(400, 'Unsupported event.');
  const whmcsInvoiceId = String(evt.invoiceId || '');
  const txRef = String(evt.transactionId || '').slice(0, 120) || `${event}:${whmcsInvoiceId}`;
  if (!whmcsInvoiceId) throw new AgenticError(400, 'invoiceId is required.');

  const inv = db.prepare('SELECT * FROM agentic_invoices WHERE whmcs_invoice_id = ?').get(whmcsInvoiceId);
  if (!inv) throw new AgenticError(404, 'Unknown invoice.');
  if (db.prepare('SELECT 1 FROM agentic_payments WHERE transaction_ref = ?').get(txRef)) return { duplicate: true };

  const order = db.prepare('SELECT * FROM agentic_orders WHERE id = ?').get(inv.order_id);
  const amount = evt.amount === undefined ? null : money(evt.amount);

  let verified = 0;
  let paymentStatus = { InvoicePaid: 'SUCCESS', InvoiceCancelled: 'CANCELLED', InvoiceRefunded: 'REFUNDED', PaymentFailed: 'FAILED', InvoiceUnpaid: 'PENDING' }[event];

  if (event === 'InvoicePaid') {
    // Never trust the notification alone when a live WHMCS is connected: ask WHMCS.
    if (whmcs.isConfigured) {
      const live = await whmcs.getInvoice(whmcsInvoiceId);
      if (String(live.status).toLowerCase() !== 'paid' || money(live.total) !== money(inv.amount)) {
        paymentStatus = 'FLAGGED';
      } else {
        verified = 1;
      }
    }
    if (paymentStatus === 'SUCCESS' && (amount === null || amount !== money(inv.amount))) paymentStatus = 'FLAGGED';
  }

  return tx(db, () => {
    const fresh = db.prepare('SELECT * FROM agentic_orders WHERE id = ?').get(order.id);
    db.prepare(`INSERT INTO agentic_payments (id, order_id, invoice_id, whmcs_invoice_id, transaction_ref, event, amount, status, verified_with_whmcs)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id(), order.id, inv.id, whmcsInvoiceId, txRef, event, amount, paymentStatus, verified);

    let outcome = paymentStatus;
    if (paymentStatus === 'SUCCESS') {
      db.prepare("UPDATE agentic_invoices SET status = 'PAID', updated_at = datetime('now') WHERE id = ?").run(inv.id);
      if (inv.kind === 'INITIAL' && fresh.status === 'PENDING_PAYMENT') activateOrder(db, fresh, 'whmcs-verified-payment');
    } else if (paymentStatus === 'FLAGGED') {
      if (inv.kind === 'INITIAL' && fresh.status === 'PENDING_PAYMENT') {
        db.prepare("UPDATE agentic_orders SET status = 'PAYMENT_REVIEW', updated_at = datetime('now') WHERE id = ?").run(order.id);
      }
    } else if (paymentStatus === 'CANCELLED') {
      db.prepare("UPDATE agentic_invoices SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?").run(inv.id);
      if (inv.kind === 'INITIAL' && fresh.status === 'PENDING_PAYMENT') {
        db.prepare("UPDATE agentic_orders SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?").run(order.id);
        db.prepare("UPDATE agentic_subscriptions SET status = 'CANCELLED' WHERE order_id = ?").run(order.id);
      }
    } else if (paymentStatus === 'REFUNDED') {
      db.prepare("UPDATE agentic_invoices SET status = 'REFUNDED', updated_at = datetime('now') WHERE id = ?").run(inv.id);
      if (inv.kind === 'INITIAL') {
        db.prepare("UPDATE agentic_orders SET status = 'REFUNDED', updated_at = datetime('now') WHERE id = ?").run(order.id);
        db.prepare("UPDATE agentic_subscriptions SET status = 'CANCELLED' WHERE order_id = ?").run(order.id);
        db.prepare('INSERT INTO agentic_activations (id, order_id, action, actor, reason) VALUES (?,?,?,?,?)').run(id(), order.id, 'DEACTIVATED', 'whmcs', 'Invoice refunded');
      }
    }
    audit(db, 'whmcs', `PAYMENT_${paymentStatus}`, order.id, { event, txRef, amount, whmcsInvoiceId });
    return { duplicate: false, status: outcome, orderStatus: db.prepare('SELECT status FROM agentic_orders WHERE id = ?').get(order.id).status };
  });
}

function activateOrder(db, order, actor) {
  const due = new Date(); due.setMonth(due.getMonth() + 1);
  db.prepare(`UPDATE agentic_orders SET status = 'ACTIVE', activated_at = datetime('now'), provisioning_status = 'QUEUED',
    updated_at = datetime('now') WHERE id = ?`).run(order.id);
  db.prepare("UPDATE agentic_subscriptions SET status = 'ACTIVE', next_due_date = ? WHERE order_id = ? AND status = 'PENDING'")
    .run(due.toISOString().slice(0, 10), order.id);
  db.prepare('INSERT INTO agentic_activations (id, order_id, action, actor, reason) VALUES (?,?,?,?,?)')
    .run(id(), order.id, 'ACTIVATED', actor, 'Verified payment');
}

/* ----------------------------------------------------------------- usage */

export function billedMinutes(durationSeconds, rounding) {
  const s = Math.max(0, Math.floor(Number(durationSeconds) || 0));
  return rounding === 'exact' ? Math.round((s / 60) * 100) / 100 : Math.ceil(s / 60);
}

export function recordCallUsage(db, orderId, input, actor) {
  const order = db.prepare('SELECT * FROM agentic_orders WHERE id = ?').get(orderId);
  if (!order) throw new AgenticError(404, 'Order not found.');
  const cfg = getPricing(db).configs[order.config_code];
  if (!cfg.voiceAllowed || !order.voice_enabled) throw new AgenticError(409, 'Voice calling is not enabled for this order.');
  if (order.status !== 'ACTIVE') throw new AgenticError(409, 'Call usage can only be recorded for an active service.');
  const providerRef = clean(input.providerRef, 120);
  const seconds = Number(input.durationSeconds);
  if (!providerRef) throw new AgenticError(400, 'providerRef (call identifier) is required.');
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 24 * 3600) throw new AgenticError(400, 'durationSeconds must be between 0 and 86400.');
  const startedAt = new Date(input.startedAt || Date.now());
  if (Number.isNaN(startedAt.getTime())) throw new AgenticError(400, 'startedAt is not a valid date.');
  if (db.prepare('SELECT 1 FROM agentic_call_usage WHERE provider_ref = ?').get(providerRef)) {
    throw new AgenticError(409, 'This call has already been recorded.');
  }
  const pricing = getPricing(db);
  const minutes = billedMinutes(seconds, pricing.callRounding);
  const amount = money(minutes * pricing.callPerMinute);
  const rowId = id();
  db.prepare(`INSERT INTO agentic_call_usage (id, order_id, provider_ref, started_at, duration_seconds, billed_minutes, rate, amount, recorded_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(rowId, orderId, providerRef, startedAt.toISOString(), Math.floor(seconds), minutes, pricing.callPerMinute, amount, actor);
  audit(db, actor, 'CALL_USAGE_RECORDED', orderId, { providerRef, seconds, minutes, amount });
  return { id: rowId, billedMinutes: minutes, rate: pricing.callPerMinute, amount };
}

/** Creates one WHMCS invoice for all unbilled call minutes (usage is billed after it happens, never in advance). */
export async function billUsage(db, whmcs, orderId, actor, env = process.env) {
  const order = db.prepare('SELECT * FROM agentic_orders WHERE id = ?').get(orderId);
  if (!order) throw new AgenticError(404, 'Order not found.');
  if (!order.whmcs_client_id) throw new AgenticError(409, 'Order has no WHMCS client yet.');
  const rows = db.prepare('SELECT * FROM agentic_call_usage WHERE order_id = ? AND usage_invoice_id IS NULL ORDER BY created_at, id').all(orderId);
  if (!rows.length) return { billed: false, message: 'No unbilled call usage.' };
  const minutes = Math.round(rows.reduce((s, r) => s + r.billed_minutes, 0) * 100) / 100;
  const amount = money(rows.reduce((s, r) => s + r.amount, 0));
  const key = `agentic-usage-${orderId}-${crypto.createHash('sha256').update(rows.map(r => r.id).join(',')).digest('hex').slice(0, 16)}`;
  const inv = await whmcs.createUsageInvoice({
    clientId: order.whmcs_client_id,
    paymentMethod: getWhmcsMapping(env).paymentMethod,
    description: `Voice calling usage for ${order.order_ref}: ${minutes} min @ ৳${rows[0].rate}/min`,
    amount, idempotencyKey: key
  });
  tx(db, () => {
    const invRowId = id();
    db.prepare("INSERT INTO agentic_invoices (id, order_id, kind, whmcs_invoice_id, amount, checkout_url, sandbox) VALUES (?,?,?,?,?,?,?)")
      .run(invRowId, orderId, 'USAGE', String(inv.invoiceId), amount, inv.checkoutUrl, inv.sandbox ? 1 : 0);
    const upd = db.prepare('UPDATE agentic_call_usage SET usage_invoice_id = ? WHERE id = ? AND usage_invoice_id IS NULL');
    for (const r of rows) upd.run(String(inv.invoiceId), r.id);
    audit(db, actor, 'USAGE_INVOICED', orderId, { invoiceId: inv.invoiceId, minutes, amount });
  });
  return { billed: true, invoiceId: String(inv.invoiceId), minutes, amount };
}

/* ------------------------------------------------------------- read models */

function usageSummary(db, orderId) {
  const u = db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(billed_minutes),0) AS minutes, COALESCE(SUM(amount),0) AS amount,
    COALESCE(SUM(CASE WHEN usage_invoice_id IS NULL THEN amount END),0) AS unbilled FROM agentic_call_usage WHERE order_id = ?`).get(orderId);
  return { calls: u.calls, billedMinutes: u.minutes, amount: money(u.amount), unbilledAmount: money(u.unbilled) };
}

function orderDetail(db, order, { forCustomer }) {
  const quote = JSON.parse(order.pricing_snapshot_json);
  const documents = db.prepare('SELECT id, filename, char_count, cost, status, created_at FROM agentic_rag_documents WHERE order_id = ? ORDER BY created_at, id').all(order.id)
    .map(d => ({ id: d.id, name: d.filename, characters: d.char_count, cost: d.cost, status: d.status, uploadedAt: d.created_at }));
  const invoices = db.prepare('SELECT whmcs_invoice_id AS id, kind, amount, status, checkout_url AS checkoutUrl, sandbox, created_at AS createdAt FROM agentic_invoices WHERE order_id = ? ORDER BY created_at')
    .all(order.id).map(i => ({ ...i, sandbox: !!i.sandbox }));
  const payments = db.prepare('SELECT whmcs_invoice_id AS invoiceId, transaction_ref AS reference, status, amount, created_at AS createdAt FROM agentic_payments WHERE order_id = ? ORDER BY created_at, id').all(order.id);
  const subscriptions = db.prepare('SELECT kind, amount, billing_interval AS interval, status, next_due_date AS nextDueDate FROM agentic_subscriptions WHERE order_id = ?').all(order.id);
  const calls = db.prepare('SELECT started_at AS startedAt, duration_seconds AS durationSeconds, billed_minutes AS billedMinutes, amount, usage_invoice_id AS invoiceId FROM agentic_call_usage WHERE order_id = ? ORDER BY started_at DESC LIMIT 100').all(order.id);
  const detail = {
    orderRef: order.order_ref,
    status: order.status,
    configuration: quote.configuration,
    features: quote.features,
    quote,
    product: quote.product || null,
    requirements: order.requirements_json && FORM_SPECS[order.config_code]
      ? allFields(FORM_SPECS[order.config_code]).filter(f => JSON.parse(order.requirements_json)[f.key]).map(f => ({ key: f.key, label: f.label, value: JSON.parse(order.requirements_json)[f.key] }))
      : [],
    createdAt: order.created_at,
    activatedAt: order.activated_at,
    provisioningStatus: order.provisioning_status,
    server: { monthly: order.server_monthly },
    backup: { amount: order.backup_enabled ? order.backup_amount : null, interval: order.backup_interval },
    maintenance: order.maintenance_enabled ? 'ENABLED' : 'NOT_REQUIRED',
    rag: { characters: order.rag_chars, cost: order.rag_cost, documents },
    calling: { enabled: !!order.voice_enabled, ratePerMinute: order.voice_enabled ? order.call_rate : null, usage: usageSummary(db, order.id), history: calls },
    invoices, payments, subscriptions,
    renewal: subscriptions.filter(s => s.status === 'ACTIVE').map(s => ({ kind: s.kind, nextDueDate: s.nextDueDate, amount: s.amount }))
  };
  if (!forCustomer) {
    Object.assign(detail, {
      id: order.id, customer: { name: order.customer_name, email: order.customer_email, phone: order.customer_phone, company: order.company_name },
      branding: order.branding_json ? JSON.parse(order.branding_json) : null,
      hasLogo: !!order.brand_logo_b64,
      whmcs: { clientId: order.whmcs_client_id, orderId: order.whmcs_order_id, productId: order.whmcs_product_id },
      billingError: order.billing_error,
      activations: db.prepare('SELECT action, actor, reason, created_at AS createdAt FROM agentic_activations WHERE order_id = ? ORDER BY created_at, id').all(order.id),
      audit: db.prepare('SELECT actor, action, details_json AS details, created_at AS createdAt FROM agentic_audit_logs WHERE order_id = ? ORDER BY created_at DESC LIMIT 100').all(order.id)
    });
  }
  return detail;
}

// Failed lookups per client address, to stop order-reference guessing.
const lookupFailures = new Map();
export function lookupOrderForCustomer(db, ref, email, clientIp = 'unknown') {
  const now = Date.now();
  const rec = lookupFailures.get(clientIp);
  if (rec && rec.resetAt > now && rec.count >= 10) throw new AgenticError(429, 'Too many failed lookups. Try again later.');
  const order = db.prepare('SELECT * FROM agentic_orders WHERE order_ref = ? AND customer_email = ?')
    .get(clean(ref, 40).toUpperCase(), clean(email, 254).toLowerCase());
  if (!order) {
    const cur = rec && rec.resetAt > now ? rec : { count: 0, resetAt: now + 10 * 60 * 1000 };
    cur.count++;
    lookupFailures.set(clientIp, cur);
    throw new AgenticError(404, 'No order found for that reference and email.');
  }
  return orderDetail(db, order, { forCustomer: true });
}
export function resetLookupThrottle() { lookupFailures.clear(); }

export function listOrders(db, { status, search, limit = 50, offset = 0 } = {}) {
  const where = []; const args = [];
  if (status) { where.push('status = ?'); args.push(status); }
  if (search) { where.push('(order_ref LIKE ? OR customer_email LIKE ? OR customer_name LIKE ?)'); const s = `%${search}%`; args.push(s, s, s); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT o.id, o.order_ref AS orderRef, o.status, o.config_code AS configCode, o.customer_name AS customerName,
      o.customer_email AS customerEmail, o.initial_total AS initialTotal, o.recurring_total AS recurringTotal, o.rag_chars AS ragChars,
      o.voice_enabled AS voice, o.maintenance_enabled AS maintenance, o.created_at AS createdAt,
      (SELECT whmcs_invoice_id FROM agentic_invoices i WHERE i.order_id = o.id AND i.kind = 'INITIAL') AS invoiceId
    FROM agentic_orders o ${w} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`)
    .all(...args, Math.min(200, Math.max(1, Number(limit) || 50)), Math.max(0, Number(offset) || 0));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM agentic_orders ${w}`).get(...args).n;
  return { orders: rows, total };
}

export function getOrderForAdmin(db, orderId) {
  const order = db.prepare('SELECT * FROM agentic_orders WHERE id = ? OR order_ref = ?').get(orderId, orderId);
  if (!order) throw new AgenticError(404, 'Order not found.');
  return orderDetail(db, order, { forCustomer: false });
}

export function getOverview(db) {
  const by = db.prepare('SELECT status, COUNT(*) AS n FROM agentic_orders GROUP BY status').all();
  const rev = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM agentic_invoices WHERE status = 'PAID'").get().v;
  const mrr = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM agentic_subscriptions WHERE status = 'ACTIVE' AND billing_interval = 'monthly'").get().v;
  const rag = db.prepare('SELECT COALESCE(SUM(char_count),0) AS chars, COALESCE(SUM(cost),0) AS cost FROM agentic_rag_documents').get();
  const calls = db.prepare('SELECT COUNT(*) AS calls, COALESCE(SUM(billed_minutes),0) AS minutes, COALESCE(SUM(amount),0) AS amount FROM agentic_call_usage').get();
  return {
    ordersByStatus: Object.fromEntries(by.map(r => [r.status, r.n])),
    paidRevenue: money(rev), activeMonthlyRecurring: money(mrr),
    rag: { characters: rag.chars, cost: money(rag.cost) },
    calling: { calls: calls.calls, billedMinutes: calls.minutes, amount: money(calls.amount) },
    telephony: getTelephonyStatus()
  };
}

export function listSubscriptions(db) {
  return db.prepare(`SELECT s.id, o.order_ref AS orderRef, o.customer_email AS customerEmail, s.kind, s.amount,
    s.billing_interval AS interval, s.status, s.next_due_date AS nextDueDate FROM agentic_subscriptions s
    JOIN agentic_orders o ON o.id = s.order_id ORDER BY s.created_at DESC LIMIT 500`).all();
}

/** Manual service control. Activation is refused unless a verified payment exists. */
export function setServiceState(db, orderId, action, actor, reason = '') {
  const order = db.prepare('SELECT * FROM agentic_orders WHERE id = ?').get(orderId);
  if (!order) throw new AgenticError(404, 'Order not found.');
  return tx(db, () => {
    if (action === 'suspend') {
      if (order.status !== 'ACTIVE') throw new AgenticError(409, 'Only an active service can be suspended.');
      db.prepare("UPDATE agentic_orders SET status = 'SUSPENDED', updated_at = datetime('now') WHERE id = ?").run(orderId);
      db.prepare("UPDATE agentic_subscriptions SET status = 'SUSPENDED' WHERE order_id = ? AND status = 'ACTIVE'").run(orderId);
    } else if (action === 'activate') {
      const paid = db.prepare("SELECT 1 FROM agentic_payments WHERE order_id = ? AND status = 'SUCCESS'").get(orderId);
      if (!paid) throw new AgenticError(409, 'Cannot activate: no verified successful payment exists for this order.');
      if (!['SUSPENDED', 'PAYMENT_REVIEW'].includes(order.status)) throw new AgenticError(409, `Order in status ${order.status} cannot be activated.`);
      db.prepare("UPDATE agentic_orders SET status = 'ACTIVE', updated_at = datetime('now') WHERE id = ?").run(orderId);
      db.prepare("UPDATE agentic_subscriptions SET status = 'ACTIVE' WHERE order_id = ? AND status = 'SUSPENDED'").run(orderId);
    } else {
      throw new AgenticError(400, 'action must be suspend or activate.');
    }
    db.prepare('INSERT INTO agentic_activations (id, order_id, action, actor, reason) VALUES (?,?,?,?,?)')
      .run(id(), orderId, action === 'suspend' ? 'SUSPENDED' : 'REACTIVATED', actor, clean(reason, 300));
    audit(db, actor, `SERVICE_${action.toUpperCase()}`, orderId, { reason });
    return { status: db.prepare('SELECT status FROM agentic_orders WHERE id = ?').get(orderId).status };
  });
}

/* ------------------------------------------------- Ready-Made product admin */

export function listProducts(db) {
  return db.prepare('SELECT * FROM agentic_products ORDER BY sort_order, name').all().map(productFromRow);
}

export function saveProduct(db, input, actor, existingCode = null) {
  const errors = {};
  const name = String(input?.name ?? '').trim().slice(0, 80);
  if (name.length < 2) errors.name = 'Name is required.';
  const code = existingCode || String(input?.code || name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!/^[A-Z0-9_]{3,40}$/.test(code)) errors.code = 'Code must be 3 to 40 letters, digits or underscores.';
  const setupFee = Number(input?.setupFee ?? 0);
  const monthlyFee = Number(input?.monthlyFee ?? 0);
  if (!Number.isFinite(setupFee) || setupFee < 0 || setupFee > 100_000_000) errors.setupFee = 'Setup fee must be 0 or more.';
  if (!Number.isFinite(monthlyFee) || monthlyFee < 0 || monthlyFee > 100_000_000) errors.monthlyFee = 'Monthly fee must be 0 or more.';
  const capabilities = (Array.isArray(input?.capabilities) ? input.capabilities : String(input?.capabilities || '').split('\n'))
    .map(c => String(c).trim().slice(0, 120)).filter(Boolean).slice(0, 12);
  if (Object.keys(errors).length) throw new AgenticError(400, 'Please correct the product fields.', { fields: errors });
  const exists = db.prepare('SELECT 1 FROM agentic_products WHERE code = ?').get(code);
  if (existingCode && !exists) throw new AgenticError(404, 'Product not found.');
  if (!existingCode && exists) throw new AgenticError(409, 'A product with this code already exists.');
  const row = [code, name, String(input?.tagline ?? '').trim().slice(0, 160), String(input?.description ?? '').trim().slice(0, 1000),
    JSON.stringify(capabilities), money(setupFee), money(monthlyFee), String(input?.badge ?? '').trim().slice(0, 30),
    Math.floor(Number(input?.sortOrder) || 0), input?.active === false || input?.active === 0 || input?.active === 'false' ? 0 : 1];
  db.prepare(`INSERT INTO agentic_products (code, name, tagline, description, capabilities_json, setup_fee, monthly_fee, badge, sort_order, active)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name, tagline=excluded.tagline, description=excluded.description,
    capabilities_json=excluded.capabilities_json, setup_fee=excluded.setup_fee, monthly_fee=excluded.monthly_fee, badge=excluded.badge,
    sort_order=excluded.sort_order, active=excluded.active, updated_at=datetime('now')`).run(...row);
  audit(db, actor, existingCode ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED', null, { code, setupFee, monthlyFee });
  return productFromRow(db.prepare('SELECT * FROM agentic_products WHERE code = ?').get(code));
}
