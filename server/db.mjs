import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'partner-system.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return check === hash;
}

export function initDatabase(dbPath = DB_FILE) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'PARTNER')),
      partner_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_tiers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      discount_rate REAL NOT NULL,
      min_monthly_spend REAL NOT NULL,
      support_level TEXT NOT NULL,
      whitelabel_allowed INTEGER NOT NULL DEFAULT 0,
      api_access INTEGER NOT NULL DEFAULT 1,
      priority_support INTEGER NOT NULL DEFAULT 0,
      migration_assistance INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_benefits (
      id TEXT PRIMARY KEY,
      tier_id TEXT NOT NULL,
      benefit_name TEXT NOT NULL,
      is_immediate INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      FOREIGN KEY(tier_id) REFERENCES partner_tiers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      country TEXT NOT NULL,
      website TEXT,
      business_type TEXT NOT NULL,
      tier_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('PENDING', 'ACTIVE', 'SUSPENDED')),
      custom_discount_rate REAL DEFAULT NULL,
      monthly_eligible_spend REAL DEFAULT 0,
      whmcs_client_id INTEGER,
      cloudstack_account TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(tier_id) REFERENCES partner_tiers(id)
    );

    CREATE TABLE IF NOT EXISTS partner_applications (
      id TEXT PRIMARY KEY,
      reference_no TEXT UNIQUE NOT NULL,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      country TEXT NOT NULL,
      website TEXT,
      business_type TEXT NOT NULL,
      estimated_monthly_spend TEXT NOT NULL,
      expected_customers TEXT NOT NULL,
      services_of_interest TEXT NOT NULL,
      partnership_model TEXT NOT NULL,
      business_description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      admin_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_pricing_rules (
      id TEXT PRIMARY KEY,
      product_code TEXT UNIQUE NOT NULL,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      base_price_monthly REAL NOT NULL,
      is_discountable INTEGER NOT NULL DEFAULT 1,
      max_discount_rate REAL NOT NULL DEFAULT 0.25,
      fixed_commission_rate REAL DEFAULT 0.05,
      exclusion_reason TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_agreements (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      agreement_code TEXT UNIQUE NOT NULL,
      custom_discount_rate REAL NOT NULL,
      effective_from TEXT NOT NULL,
      effective_until TEXT NOT NULL,
      credit_limit REAL DEFAULT 5000,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
      approved_by TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partner_customer_relationships (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      customer_whmcs_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      company TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partner_services (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      cloudstack_vm_id TEXT,
      service_name TEXT NOT NULL,
      product_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING', 'STOPPED', 'PROVISIONING', 'TERMINATED')),
      vcpu INTEGER NOT NULL,
      ram_gb INTEGER NOT NULL,
      disk_gb INTEGER NOT NULL,
      ip_address TEXT,
      region TEXT NOT NULL,
      monthly_fee REAL NOT NULL,
      partner_discount_rate REAL NOT NULL,
      net_monthly_fee REAL NOT NULL,
      next_due_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES partner_customer_relationships(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partner_referrals (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      referral_code TEXT NOT NULL,
      referred_user_name TEXT NOT NULL,
      referred_user_email TEXT NOT NULL,
      conversion_status TEXT NOT NULL DEFAULT 'CONVERTED' CHECK(conversion_status IN ('PENDING', 'CONVERTED')),
      order_value REAL NOT NULL,
      commission_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partner_commissions (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      referral_id TEXT,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'APPROVED' CHECK(status IN ('PENDING', 'APPROVED', 'PAID')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE,
      FOREIGN KEY(referral_id) REFERENCES partner_referrals(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS partner_payouts (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      account_details TEXT NOT NULL,
      transaction_ref TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'PAID', 'REJECTED')),
      approved_by TEXT,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT,
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partner_audit_logs (
      id TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_support_tickets (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      ticket_number TEXT UNIQUE NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('STANDARD', 'HIGH', 'CRITICAL_24_7')),
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partner_announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      published_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_reward_policies (
      id TEXT PRIMARY KEY,
      reward_rate REAL NOT NULL DEFAULT 0.10,
      points_per_bdt REAL NOT NULL DEFAULT 1.0,
      min_redemption_points REAL NOT NULL DEFAULT 1000,
      redemption_enabled INTEGER NOT NULL DEFAULT 0,
      redemption_conversion_rate REAL NOT NULL DEFAULT 0.10,
      auto_approve INTEGER NOT NULL DEFAULT 1,
      apply_to_renewals INTEGER NOT NULL DEFAULT 1,
      disallow_self_referral INTEGER NOT NULL DEFAULT 1,
      expiration_days INTEGER NOT NULL DEFAULT 0,
      eligible_categories TEXT NOT NULL DEFAULT '["Cloud VPS","Dedicated Server","Reseller Hosting","Cloud Storage","Web Hosting","SSL","Domain"]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS partner_reward_accounts (
      id TEXT PRIMARY KEY,
      partner_id TEXT UNIQUE NOT NULL,
      total_eligible_sales REAL NOT NULL DEFAULT 0,
      total_points_earned REAL NOT NULL DEFAULT 0,
      available_points REAL NOT NULL DEFAULT 0,
      pending_points REAL NOT NULL DEFAULT 0,
      redeemed_points REAL NOT NULL DEFAULT 0,
      reversed_points REAL NOT NULL DEFAULT 0,
      expired_points REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partner_sales (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      partner_id TEXT NOT NULL,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      service_name TEXT NOT NULL,
      category TEXT NOT NULL,
      product_code TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      eligible_net_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'BDT',
      payment_status TEXT NOT NULL DEFAULT 'PAID' CHECK(payment_status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED')),
      payment_id TEXT,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      billing_cycle TEXT DEFAULT 'monthly',
      is_self_purchase INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partner_reward_transactions (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      order_id TEXT,
      payment_id TEXT,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('SALE_REWARD', 'REWARD_REVERSAL', 'REDEMPTION', 'EXPIRATION', 'ADMIN_ADJUSTMENT')),
      eligible_sale_amount REAL NOT NULL DEFAULT 0,
      reward_rate REAL NOT NULL DEFAULT 0.10,
      points REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'APPROVED' CHECK(status IN ('PENDING', 'APPROVED', 'REVERSED', 'REJECTED')),
      idempotency_key TEXT UNIQUE,
      description TEXT,
      metadata_json TEXT,
      processed_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE CASCADE,
      FOREIGN KEY(order_id) REFERENCES partner_sales(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_partner_apps_email ON partner_applications(email);
    CREATE INDEX IF NOT EXISTS idx_partner_apps_status ON partner_applications(status);
    CREATE INDEX IF NOT EXISTS idx_partner_services_partner ON partner_services(partner_id);
    CREATE INDEX IF NOT EXISTS idx_partner_audit_actor ON partner_audit_logs(actor_email);
    CREATE INDEX IF NOT EXISTS idx_reward_tx_partner ON partner_reward_transactions(partner_id);
    CREATE INDEX IF NOT EXISTS idx_reward_tx_order ON partner_reward_transactions(order_id);
    CREATE INDEX IF NOT EXISTS idx_reward_tx_status ON partner_reward_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_partner_sales_partner ON partner_sales(partner_id);
    CREATE INDEX IF NOT EXISTS idx_partner_sales_order ON partner_sales(order_number);
  `);

  seedDefaultData(db);
  seedRewardSystemData(db);
  return db;
}

function seedDefaultData(db) {
  // Check if tiers already exist
  const existingTier = db.prepare('SELECT COUNT(*) as count FROM partner_tiers').get();
  if (existingTier && existingTier.count > 0) {
    return;
  }

  // 1. Tiers
  const tiers = [
    {
      id: 'tier-registered',
      name: 'Registered Partner',
      slug: 'registered',
      discount_rate: 0.05,
      min_monthly_spend: 0,
      support_level: 'Standard Technical Support (Email & Portal)',
      whitelabel_allowed: 0,
      api_access: 1,
      priority_support: 0,
      migration_assistance: 0,
      description: 'Zero minimum sales requirement. Instant access to reseller margins and onboarding materials.'
    },
    {
      id: 'tier-silver',
      name: 'Silver Partner',
      slug: 'silver',
      discount_rate: 0.10,
      min_monthly_spend: 30000,
      support_level: 'Business-Hours Priority Support',
      whitelabel_allowed: 0,
      api_access: 1,
      priority_support: 0,
      migration_assistance: 0,
      description: 'For growing IT agencies and web hosts with at least ৳30,000 in eligible monthly infrastructure spend.'
    },
    {
      id: 'tier-gold',
      name: 'Gold Partner',
      slug: 'gold',
      discount_rate: 0.15,
      min_monthly_spend: 120000,
      support_level: 'Priority 24/7 Technical Support Desk',
      whitelabel_allowed: 1,
      api_access: 1,
      priority_support: 1,
      migration_assistance: 1,
      description: 'For established hosting providers and system integrators with dedicated account management and white-label capability.'
    },
    {
      id: 'tier-platinum',
      name: 'Platinum Partner',
      slug: 'platinum',
      discount_rate: 0.20,
      min_monthly_spend: 360000,
      support_level: 'Dedicated Senior Account Executive & 24/7 Solutions Architect',
      whitelabel_allowed: 1,
      api_access: 1,
      priority_support: 1,
      migration_assistance: 1,
      description: 'Our premier tier for enterprise cloud resellers. Custom negotiated terms up to 25% margin, dedicated engineers, and migration support.'
    }
  ];

  const insertTier = db.prepare(`
    INSERT INTO partner_tiers (id, name, slug, discount_rate, min_monthly_spend, support_level, whitelabel_allowed, api_access, priority_support, migration_assistance, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const t of tiers) {
    insertTier.run(t.id, t.name, t.slug, t.discount_rate, t.min_monthly_spend, t.support_level, t.whitelabel_allowed, t.api_access, t.priority_support, t.migration_assistance, t.description);
  }

  // 2. Benefits
  const benefits = [
    { id: 'b1', tier_id: 'tier-registered', benefit_name: '5% Base Reseller Discount on Cloud VPS & Dedicated Servers', is_immediate: 1 },
    { id: 'b2', tier_id: 'tier-registered', benefit_name: 'Centralized WHMCS Billing & Client Portal Access', is_immediate: 1 },
    { id: 'b3', tier_id: 'tier-registered', benefit_name: 'Automated Apache CloudStack Provisioning API', is_immediate: 1 },
    { id: 'b4', tier_id: 'tier-registered', benefit_name: 'Partner Knowledge Base & Technical Onboarding Guides', is_immediate: 1 },
    { id: 'b5', tier_id: 'tier-silver', benefit_name: '10% Reseller Margin across Core Infrastructure', is_immediate: 0 },
    { id: 'b6', tier_id: 'tier-silver', benefit_name: 'Business-Hours Priority Ticket Queue', is_immediate: 0 },
    { id: 'b7', tier_id: 'tier-silver', benefit_name: 'Partner Sales Collateral & Co-Branding Kits', is_immediate: 0 },
    { id: 'b8', tier_id: 'tier-silver', benefit_name: '5% Recurring Referral Commission Option', is_immediate: 0 },
    { id: 'b9', tier_id: 'tier-gold', benefit_name: '15% Reseller Margin on Compute & Storage', is_immediate: 0 },
    { id: 'b10', tier_id: 'tier-gold', benefit_name: 'White-Label Hosting & Custom Nameservers', is_immediate: 0 },
    { id: 'b11', tier_id: 'tier-gold', benefit_name: '24/7 Priority Support Escalation Desk', is_immediate: 0 },
    { id: 'b12', tier_id: 'tier-gold', benefit_name: 'Dedicated Account Manager & Technical Architect', is_immediate: 0 },
    { id: 'b13', tier_id: 'tier-platinum', benefit_name: '20% - 25% Contractual Infrastructure Margins', is_immediate: 0 },
    { id: 'b14', tier_id: 'tier-platinum', benefit_name: 'Full White-Label CloudStack Multi-Tenant Domain', is_immediate: 0 },
    { id: 'b15', tier_id: 'tier-platinum', benefit_name: 'Free Server Migration Assistance by DevOps Engineers', is_immediate: 0 },
    { id: 'b16', tier_id: 'tier-platinum', benefit_name: 'Custom Tailored Commercial Credit Terms & SLA Guarantees', is_immediate: 0 }
  ];

  const insertBenefit = db.prepare(`
    INSERT INTO partner_benefits (id, tier_id, benefit_name, is_immediate)
    VALUES (?, ?, ?, ?)
  `);
  for (const b of benefits) {
    insertBenefit.run(b.id, b.tier_id, b.benefit_name, b.is_immediate);
  }

  // 3. Product Pricing Rules (in BDT)
  const pricingRules = [
    { id: 'pr-vps-start', product_code: 'VPS-STARTER', product_name: 'Starter Cloud VPS (1 vCPU, 2GB RAM)', category: 'Cloud VPS', base_price_monthly: 1464.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.10, exclusion_reason: null },
    { id: 'pr-vps-biz', product_code: 'VPS-BUSINESS', product_name: 'Business Cloud VPS (2 vCPU, 4GB RAM)', category: 'Cloud VPS', base_price_monthly: 2928.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.10, exclusion_reason: null },
    { id: 'pr-vps-pro', product_code: 'VPS-PRO', product_name: 'Professional Cloud VPS (4 vCPU, 8GB RAM)', category: 'Cloud VPS', base_price_monthly: 5856.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.10, exclusion_reason: null },
    { id: 'pr-vps-ent', product_code: 'VPS-ENTERPRISE', product_name: 'Enterprise Cloud VPS (8 vCPU, 16GB RAM)', category: 'Cloud VPS', base_price_monthly: 11712.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.10, exclusion_reason: null },
    { id: 'pr-vds-ess', product_code: 'VDS-ESSENTIAL', product_name: 'Essential Dedicated Server (Xeon, 32GB ECC)', category: 'Dedicated Server', base_price_monthly: 14640.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.08, exclusion_reason: null },
    { id: 'pr-vds-biz', product_code: 'VDS-BUSINESS', product_name: 'Business Dedicated Server (EPYC, 64GB ECC)', category: 'Dedicated Server', base_price_monthly: 25620.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.08, exclusion_reason: null },
    { id: 'pr-vds-ent', product_code: 'VDS-ENTERPRISE', product_name: 'Enterprise Dedicated Server (Dual EPYC, 256GB)', category: 'Dedicated Server', base_price_monthly: 54900.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.08, exclusion_reason: null },
    { id: 'pr-res-cpanel', product_code: 'HOST-CPANEL-RES', product_name: 'Reseller cPanel Hosting 50 Accounts', category: 'Reseller Hosting', base_price_monthly: 5490.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.12, exclusion_reason: null },
    { id: 'pr-storage', product_code: 'STORAGE-OBJ', product_name: 'Enterprise S3 Object Storage (Per TB)', category: 'Cloud Storage', base_price_monthly: 1830.00, is_discountable: 1, max_discount_rate: 0.20, fixed_commission_rate: 0.05, exclusion_reason: null },
    { id: 'pr-m365', product_code: 'M365-PASS', product_name: 'Microsoft 365 Business Standard', category: 'SaaS License', base_price_monthly: 1525.00, is_discountable: 0, max_discount_rate: 0.03, fixed_commission_rate: 0.03, exclusion_reason: 'Third-party vendor pass-through license. Maximum 3% distributor incentive.' },
    { id: 'pr-ssl-dc', product_code: 'SSL-DIGICERT', product_name: 'DigiCert Secure Site Pro EV', category: 'SSL', base_price_monthly: 4758.00, is_discountable: 0, max_discount_rate: 0.05, fixed_commission_rate: 0.05, exclusion_reason: 'CA wholesale fixed price schedule. Reseller discount applied via dedicated wholesale catalog.' },
    { id: 'pr-dom-reg', product_code: 'DOMAIN-REG', product_name: '.com / .net Domain Registration', category: 'Domain', base_price_monthly: 1708.00, is_discountable: 0, max_discount_rate: 0.00, fixed_commission_rate: 0.00, exclusion_reason: 'ICANN registry cost pass-through. Zero discountability.' }
  ];

  const insertPricing = db.prepare(`
    INSERT INTO partner_pricing_rules (id, product_code, product_name, category, base_price_monthly, is_discountable, max_discount_rate, fixed_commission_rate, exclusion_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of pricingRules) {
    insertPricing.run(p.id, p.product_code, p.product_name, p.category, p.base_price_monthly, p.is_discountable, p.max_discount_rate, p.fixed_commission_rate, p.exclusion_reason);
  }

  // 4. Admin and Demo Partner Accounts
  const adminAuth = hashPassword('AdminSecure2026!');
  const adminId = 'usr-admin-1';
  db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, role, partner_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(adminId, 'admin@unified.test', adminAuth.hash, adminAuth.salt, 'ADMIN', null);

  const partnerAuth = hashPassword('Partner123!');
  const partnerUserId = 'usr-partner-1';
  const partnerId = 'ptn-apex-101';

  db.prepare(`
    INSERT INTO partners (id, user_id, company_name, contact_name, email, phone, country, website, business_type, tier_id, status, custom_discount_rate, monthly_eligible_spend, whmcs_client_id, cloudstack_account)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    partnerId,
    partnerUserId,
    'Apex Cloud Solutions Ltd.',
    'Istiak Hasan',
    'partner@unified.test',
    '+8801711223344',
    'Bangladesh',
    'https://apexcloud.example.com',
    'Hosting Reseller & IT Agency',
    'tier-gold',
    'ACTIVE',
    0.15,
    173240.00,
    8042,
    'cs-partner-apex-101'
  );

  db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, role, partner_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(partnerUserId, 'partner@unified.test', partnerAuth.hash, partnerAuth.salt, 'PARTNER', partnerId);

  // 5. Seed Partner Agreement for Demo Partner
  db.prepare(`
    INSERT INTO partner_agreements (id, partner_id, agreement_code, custom_discount_rate, effective_from, effective_until, credit_limit, status, approved_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'agr-apex-2026',
    partnerId,
    'AGR-2026-GOLD-01',
    0.15,
    '2026-01-01',
    '2026-12-31',
    1200000.00,
    'ACTIVE',
    'admin@unified.test',
    'Standard Gold Partner master services agreement in BDT with 30-day net payment terms and CloudStack API integration.'
  );

  // 6. Seed Managed Customers
  const customers = [
    { id: 'cust-1', partner_id: partnerId, customer_whmcs_id: 9101, customer_name: 'Rahim Garments Ltd.', customer_email: 'it@rahimgarments.com', company: 'Rahim Garments', status: 'ACTIVE' },
    { id: 'cust-2', partner_id: partnerId, customer_whmcs_id: 9102, customer_name: 'Bengal Fintech Labs', customer_email: 'ops@bengalfintech.io', company: 'Bengal Fintech', status: 'ACTIVE' },
    { id: 'cust-3', partner_id: partnerId, customer_whmcs_id: 9103, customer_name: 'Dhaka Commerce Hub', customer_email: 'admin@dhakacommerce.com', company: 'Commerce Hub Ltd', status: 'ACTIVE' },
    { id: 'cust-4', partner_id: partnerId, customer_whmcs_id: 9104, customer_name: 'Metro Diagnostic Center', customer_email: 'sysadmin@metrohealth.bd', company: 'Metro Diagnostic', status: 'ACTIVE' }
  ];

  const insertCust = db.prepare(`
    INSERT INTO partner_customer_relationships (id, partner_id, customer_whmcs_id, customer_name, customer_email, company, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of customers) {
    insertCust.run(c.id, c.partner_id, c.customer_whmcs_id, c.customer_name, c.customer_email, c.company, c.status);
  }

  // 7. Seed Managed Services (in BDT)
  const services = [
    { id: 'srv-1', partner_id: partnerId, customer_id: 'cust-1', cloudstack_vm_id: 'cs-vm-9214a', service_name: 'ERP Production Cluster', product_code: 'VPS-ENTERPRISE', status: 'RUNNING', vcpu: 8, ram_gb: 16, disk_gb: 300, ip_address: '103.145.22.41', region: 'Dhaka DC-01', monthly_fee: 11712.00, partner_discount_rate: 0.15, net_monthly_fee: 9955.20, next_due_date: '2026-11-01' },
    { id: 'srv-2', partner_id: partnerId, customer_id: 'cust-2', cloudstack_vm_id: 'cs-vm-9214b', service_name: 'Fintech API Gateway', product_code: 'VPS-PRO', status: 'RUNNING', vcpu: 4, ram_gb: 8, disk_gb: 160, ip_address: '103.145.22.45', region: 'Dhaka DC-01', monthly_fee: 5856.00, partner_discount_rate: 0.15, net_monthly_fee: 4977.60, next_due_date: '2026-11-05' },
    { id: 'srv-3', partner_id: partnerId, customer_id: 'cust-2', cloudstack_vm_id: 'cs-vm-9214c', service_name: 'Bare Metal DB Host', product_code: 'VDS-BUSINESS', status: 'RUNNING', vcpu: 16, ram_gb: 64, disk_gb: 2000, ip_address: '103.145.22.102', region: 'Dhaka DC-01', monthly_fee: 25620.00, partner_discount_rate: 0.15, net_monthly_fee: 21777.00, next_due_date: '2026-11-10' },
    { id: 'srv-4', partner_id: partnerId, customer_id: 'cust-3', cloudstack_vm_id: 'cs-vm-9214d', service_name: 'WooCommerce High-Traffic Host', product_code: 'VPS-BUSINESS', status: 'RUNNING', vcpu: 2, ram_gb: 4, disk_gb: 80, ip_address: '103.145.22.68', region: 'Singapore SG-01', monthly_fee: 2928.00, partner_discount_rate: 0.15, net_monthly_fee: 2488.80, next_due_date: '2026-11-12' },
    { id: 'srv-5', partner_id: partnerId, customer_id: 'cust-4', cloudstack_vm_id: 'cs-vm-9214e', service_name: 'PACS Imaging Archive', product_code: 'STORAGE-OBJ', status: 'RUNNING', vcpu: 2, ram_gb: 4, disk_gb: 10000, ip_address: '103.145.22.88', region: 'Dhaka DC-01', monthly_fee: 18300.00, partner_discount_rate: 0.15, net_monthly_fee: 15555.00, next_due_date: '2026-11-15' }
  ];

  const insertSrv = db.prepare(`
    INSERT INTO partner_services (id, partner_id, customer_id, cloudstack_vm_id, service_name, product_code, status, vcpu, ram_gb, disk_gb, ip_address, region, monthly_fee, partner_discount_rate, net_monthly_fee, next_due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of services) {
    insertSrv.run(s.id, s.partner_id, s.customer_id, s.cloudstack_vm_id, s.service_name, s.product_code, s.status, s.vcpu, s.ram_gb, s.disk_gb, s.ip_address, s.region, s.monthly_fee, s.partner_discount_rate, s.net_monthly_fee, s.next_due_date);
  }

  // 8. Seed Referrals & Commissions (in BDT)
  const referrals = [
    { id: 'ref-1', partner_id: partnerId, referral_code: 'APEX-CLOUD-REF', referred_user_name: 'NextGen Solutions', referred_user_email: 'cto@nextgen.tech', conversion_status: 'CONVERTED', order_value: 79300.00, commission_amount: 7930.00 },
    { id: 'ref-2', partner_id: partnerId, referral_code: 'APEX-CLOUD-REF', referred_user_name: 'Delta Software Agency', referred_user_email: 'hello@deltasoft.io', conversion_status: 'CONVERTED', order_value: 48800.00, commission_amount: 4880.00 }
  ];

  const insertRef = db.prepare(`
    INSERT INTO partner_referrals (id, partner_id, referral_code, referred_user_name, referred_user_email, conversion_status, order_value, commission_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of referrals) {
    insertRef.run(r.id, r.partner_id, r.referral_code, r.referred_user_name, r.referred_user_email, r.conversion_status, r.order_value, r.commission_amount);
  }

  db.prepare(`
    INSERT INTO partner_commissions (id, partner_id, referral_id, amount, status)
    VALUES ('comm-1', ?, 'ref-1', 7930.00, 'APPROVED'),
           ('comm-2', ?, 'ref-2', 4880.00, 'APPROVED')
  `).run(partnerId, partnerId);

  // 9. Seed Partner Applications
  const applications = [
    {
      id: 'app-seed-01',
      reference_no: 'APP-2026-78921',
      company_name: 'Chittagong Digital Matrix',
      contact_name: 'Farhan Kabir',
      email: 'farhan@cdmatrix.com',
      phone: '+8801819876543',
      country: 'Bangladesh',
      website: 'https://cdmatrix.com',
      business_type: 'Software Agency',
      estimated_monthly_spend: '৳60,000 - ৳250,000',
      expected_customers: '10 - 50 Customers',
      services_of_interest: 'Cloud VPS, Dedicated Server, Reseller cPanel Hosting',
      partnership_model: 'Reseller',
      business_description: 'We build enterprise web portals and supply chain management software for port logistics clients. We want local low-latency cloud infrastructure in Dhaka with WHMCS reseller billing.',
      status: 'PENDING',
      admin_notes: 'Under review by cloud infrastructure partner manager.'
    },
    {
      id: 'app-seed-02',
      reference_no: 'APP-2026-65412',
      company_name: 'Sylhet Hosting Services',
      contact_name: 'Tariq Anam',
      email: 'tariq@sylhethost.net',
      phone: '+8801912345678',
      country: 'Bangladesh',
      website: 'https://sylhethost.net',
      business_type: 'Hosting Provider',
      estimated_monthly_spend: '৳250,000 - ৳600,000',
      expected_customers: '50 - 200 Customers',
      services_of_interest: 'Reseller cPanel Hosting, Cloud VPS, Storage',
      partnership_model: 'Both',
      business_description: 'Hosting 80+ SME customers currently in Europe. Migrating client workloads to Dhaka DC for latency and local billing compliance.',
      status: 'APPROVED',
      admin_notes: 'Approved for Silver Tier. Migration engineers scheduled for onboarding.'
    }
  ];

  const insertApp = db.prepare(`
    INSERT INTO partner_applications (id, reference_no, company_name, contact_name, email, phone, country, website, business_type, estimated_monthly_spend, expected_customers, services_of_interest, partnership_model, business_description, status, admin_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of applications) {
    insertApp.run(a.id, a.reference_no, a.company_name, a.contact_name, a.email, a.phone, a.country, a.website, a.business_type, a.estimated_monthly_spend, a.expected_customers, a.services_of_interest, a.partnership_model, a.business_description, a.status, a.admin_notes);
  }

  // 10. Seed Support Tickets
  db.prepare(`
    INSERT INTO partner_support_tickets (id, partner_id, ticket_number, subject, category, priority, message, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'tkt-1',
    partnerId,
    'TICK-2026-9041',
    'Custom CloudStack API Quota Increase for Sub-domain',
    'CloudStack Infrastructure',
    'HIGH',
    'We are onboarding Rahim Garments second branch and need quota for 4 additional public IPv4 addresses and 200GB NVMe storage in Dhaka DC-01.',
    'OPEN'
  );

  // 11. Seed Announcements
  db.prepare(`
    INSERT INTO partner_announcements (id, title, category, summary, content, published_at)
    VALUES 
    (
      'ann-1',
      'Dhaka DC-02 Gen4 NVMe Cloud Cluster Now Live for Gold & Platinum Partners',
      'Infrastructure Update',
      'Our second tier-3 data hall in Progati Sharani, Dhaka is operational with 100Gbps redundant fiber rings.',
      'Partners can now provision high-IOPS VPS and dedicated servers in Dhaka DC-02 with sub-2ms ping across Bangladesh IX and BTCL gateways.',
      '2026-10-15 09:00:00'
    ),
    (
      'ann-2',
      'Q4 Partner Growth Rebate & Free Server Migration Program',
      'Commercial',
      'Earn an additional 3% quarterly rebate on all net new cloud workloads deployed through CloudStack before year end.',
      'Our DevOps migration team will handle cPanel-to-cPanel and Linux VPS migrations at zero cost for all Silver, Gold, and Platinum partners.',
      '2026-10-10 14:30:00'
    )
  `).run();

  // 12. Seed Initial Audit Log
  db.prepare(`
    INSERT INTO partner_audit_logs (id, actor_type, actor_id, actor_email, action, entity_type, entity_id, details_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'audit-seed-1',
    'SYSTEM',
    'system-daemon',
    'system@unifiedit.xyz',
    'PARTNER_TIER_INITIALIZED',
    'partner_tiers',
    'all',
    JSON.stringify({ message: 'Default 4 partner tiers and pricing rules initialized.' }),
    '127.0.0.1'
  );
}

function seedRewardSystemData(db) {
  // 1. Ensure default reward policy exists
  const existingPolicy = db.prepare('SELECT id FROM partner_reward_policies WHERE id = ?').get('default');
  if (!existingPolicy) {
    db.prepare(`
      INSERT INTO partner_reward_policies (
        id, reward_rate, points_per_bdt, min_redemption_points, redemption_enabled,
        redemption_conversion_rate, auto_approve, apply_to_renewals, disallow_self_referral,
        expiration_days, eligible_categories, updated_at, updated_by
      ) VALUES (
        'default', 0.10, 1.0, 1000, 0, 0.10, 1, 1, 1, 0,
        '["Cloud VPS","Dedicated Server","Reseller Hosting","Cloud Storage","Web Hosting","SSL","Domain"]',
        datetime('now'), 'system-init'
      )
    `).run();
  }

  // 2. Ensure reward account exists for all existing partners
  const partners = db.prepare('SELECT id FROM partners').all();
  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO partner_reward_accounts (
      id, partner_id, total_eligible_sales, total_points_earned,
      available_points, pending_points, redeemed_points, reversed_points, expired_points
    ) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)
  `);

  for (const p of partners) {
    insertAccount.run('racc-' + p.id, p.id);
  }

  // 3. Seed initial sales & rewards for demo partner 'ptn-apex-101' if empty
  const demoPartnerId = 'ptn-apex-101';
  const existingSales = db.prepare('SELECT COUNT(*) as count FROM partner_sales WHERE partner_id = ?').get(demoPartnerId);
  if (!existingSales || existingSales.count === 0) {
    const demoSales = [
      {
        id: 'sal-seed-1',
        orderNumber: 'ORD-2026-8011',
        customerName: 'Rahim Garments Ltd.',
        customerEmail: 'it@rahimgarments.com',
        serviceName: 'Enterprise Cloud VPS (8 vCPU, 16GB RAM)',
        category: 'Cloud VPS',
        productCode: 'VPS-ENTERPRISE',
        gross: 11712.00,
        discount: 1756.80,
        tax: 0,
        eligibleNet: 9955.20,
        rate: 0.10,
        points: 995.52,
        status: 'APPROVED',
        created_at: '2026-10-01 10:15:00'
      },
      {
        id: 'sal-seed-2',
        orderNumber: 'ORD-2026-8012',
        customerName: 'Bengal Fintech Labs',
        customerEmail: 'ops@bengalfintech.io',
        serviceName: 'Bare Metal DB Host (Dual EPYC, 64GB)',
        category: 'Dedicated Server',
        productCode: 'VDS-BUSINESS',
        gross: 25620.00,
        discount: 3843.00,
        tax: 0,
        eligibleNet: 21777.00,
        rate: 0.10,
        points: 2177.70,
        status: 'APPROVED',
        created_at: '2026-10-05 14:20:00'
      },
      {
        id: 'sal-seed-3',
        orderNumber: 'ORD-2026-8013',
        customerName: 'Dhaka Commerce Hub',
        customerEmail: 'admin@dhakacommerce.com',
        serviceName: 'Reseller cPanel Hosting 50 Accounts',
        category: 'Reseller Hosting',
        productCode: 'HOST-CPANEL-RES',
        gross: 10000.00,
        discount: 0,
        tax: 0,
        eligibleNet: 10000.00,
        rate: 0.10,
        points: 1000.00,
        status: 'APPROVED',
        created_at: '2026-10-10 11:00:00'
      },
      {
        id: 'sal-seed-4',
        orderNumber: 'ORD-2026-8014',
        customerName: 'Metro Diagnostic Center',
        customerEmail: 'sysadmin@metrohealth.bd',
        serviceName: 'DigiCert Secure Site Pro EV SSL',
        category: 'SSL',
        productCode: 'SSL-DIGICERT',
        gross: 9516.00,
        discount: 0,
        tax: 0,
        eligibleNet: 9516.00,
        rate: 0.10,
        points: 951.60,
        status: 'APPROVED',
        created_at: '2026-10-12 16:45:00'
      },
      {
        id: 'sal-seed-5',
        orderNumber: 'ORD-2026-8015',
        customerName: 'Apex Digital Labs',
        customerEmail: 'client@apexdigital.com',
        serviceName: 'High-Performance Cloud Cluster (VPS-PRO + Storage)',
        category: 'Cloud VPS',
        productCode: 'VPS-PRO',
        gross: 50000.00,
        discount: 0,
        tax: 0,
        eligibleNet: 50000.00,
        rate: 0.10,
        points: 5000.00,
        status: 'APPROVED',
        created_at: '2026-10-14 09:30:00'
      },
      {
        id: 'sal-seed-6',
        orderNumber: 'ORD-2026-8016',
        customerName: 'Sylhet Web Agency',
        customerEmail: 'info@sylhetweb.com',
        serviceName: 'Starter Cloud VPS (1 vCPU, 2GB RAM)',
        category: 'Cloud VPS',
        productCode: 'VPS-STARTER',
        gross: 2928.00,
        discount: 0,
        tax: 0,
        eligibleNet: 2928.00,
        rate: 0.10,
        points: 292.80,
        status: 'PENDING',
        created_at: '2026-10-18 12:00:00'
      }
    ];

    let totalEligible = 0;
    let totalPoints = 0;
    let availablePoints = 0;
    let pendingPoints = 0;

    for (const s of demoSales) {
      db.prepare(`
        INSERT INTO partner_sales (
          id, order_number, partner_id, customer_name, customer_email,
          service_name, category, product_code, gross_amount, discount_amount, tax_amount,
          eligible_net_amount, currency, payment_status, payment_id, is_recurring, billing_cycle,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BDT', 'PAID', ?, 1, 'monthly', ?)
      `).run(
        s.id, s.orderNumber, demoPartnerId, s.customerName, s.customerEmail,
        s.serviceName, s.category, s.productCode, s.gross, s.discount, s.tax,
        s.eligibleNet, 'PAY-WHMCS-' + s.orderNumber, s.created_at
      );

      const txId = 'rtx-seed-' + s.orderNumber;
      db.prepare(`
        INSERT INTO partner_reward_transactions (
          id, partner_id, order_id, payment_id, transaction_type, eligible_sale_amount,
          reward_rate, points, status, idempotency_key, description, processed_by, created_at, processed_at
        ) VALUES (?, ?, ?, ?, 'SALE_REWARD', ?, ?, ?, ?, ?, ?, 'system-seed', ?, ?)
      `).run(
        txId, demoPartnerId, s.id, 'PAY-WHMCS-' + s.orderNumber,
        s.eligibleNet, s.rate, s.points, s.status,
        'seed-' + s.orderNumber,
        `10% Reward for Order ${s.orderNumber} - ${s.serviceName}`,
        s.created_at, s.created_at
      );

      if (s.status === 'APPROVED') {
        totalEligible += s.eligibleNet;
        totalPoints += s.points;
        availablePoints += s.points;
      } else if (s.status === 'PENDING') {
        pendingPoints += s.points;
      }
    }

    db.prepare(`
      UPDATE partner_reward_accounts
      SET total_eligible_sales = ?,
          total_points_earned = ?,
          available_points = ?,
          pending_points = ?,
          updated_at = datetime('now')
      WHERE partner_id = ?
    `).run(
      Math.round(totalEligible * 100) / 100,
      Math.round(totalPoints * 100) / 100,
      Math.round(availablePoints * 100) / 100,
      Math.round(pendingPoints * 100) / 100,
      demoPartnerId
    );
  }
}

