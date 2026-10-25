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
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'SUPER_ADMIN', 'SECURITY_ADMIN', 'INFRASTRUCTURE_ADMIN', 'FINANCE_ADMIN', 'PARTNER_MANAGER', 'SUPPORT_ADMIN', 'CONTENT_ADMIN', 'AUDITOR', 'PARTNER', 'CUSTOMER')),
      partner_id TEXT,
      name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_login_at TEXT,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
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
      trade_license_pdf TEXT,
      trade_license_filename TEXT,
      nid_document_pdf TEXT,
      nid_document_filename TEXT,
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
      eligible_categories TEXT NOT NULL DEFAULT '["VPS","VDS","Reseller Hosting","Cloud Storage","Web Hosting","SSL","Domain"]',
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

    -- =========================================================================
    -- CENTRALIZED ADMIN PORTAL SCHEMA (Customers, Billing, Support, CMS, Security)
    -- =========================================================================

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      company_name TEXT,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      country TEXT NOT NULL DEFAULT 'Bangladesh',
      city TEXT NOT NULL DEFAULT 'Dhaka',
      address TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED', 'PENDING')),
      suspension_reason TEXT,
      suspended_by TEXT,
      suspended_at TEXT,
      whmcs_client_id INTEGER,
      partner_id TEXT,
      password_reset_token TEXT,
      password_reset_expires TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS customer_services (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      partner_id TEXT,
      service_type TEXT NOT NULL CHECK(service_type IN ('VPS', 'VDS', 'STORAGE', 'HOSTING', 'SSL', 'DOMAIN')),
      service_name TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING', 'STOPPED', 'PROVISIONING', 'SUSPENDED', 'TERMINATED')),
      cloudstack_vm_id TEXT,
      zone TEXT NOT NULL DEFAULT 'Dhaka DC-01',
      ip_address TEXT,
      vcpu INTEGER NOT NULL DEFAULT 2,
      ram_mb INTEGER NOT NULL DEFAULT 4096,
      disk_gb INTEGER NOT NULL DEFAULT 80,
      monthly_price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'BDT',
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      next_due_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY(partner_id) REFERENCES partners(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      partner_id TEXT,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'BDT',
      status TEXT NOT NULL DEFAULT 'PAID' CHECK(status IN ('PAID', 'UNPAID', 'REFUNDED', 'CANCELLED', 'OVERDUE')),
      due_date TEXT NOT NULL,
      paid_at TEXT,
      payment_method TEXT,
      transaction_ref TEXT,
      refund_reason TEXT,
      refunded_by TEXT,
      refunded_at TEXT,
      items_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      partner_id TEXT,
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED')),
      total_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'BDT',
      items_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT UNIQUE NOT NULL,
      customer_id TEXT,
      partner_id TEXT,
      requester_email TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      department TEXT NOT NULL CHECK(department IN ('TECHNICAL', 'BILLING', 'SALES', 'INFRASTRUCTURE')),
      priority TEXT NOT NULL CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'ANSWERED', 'RESOLVED', 'CLOSED')),
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      assigned_to TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_replies (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      author_type TEXT NOT NULL CHECK(author_type IN ('CUSTOMER', 'PARTNER', 'STAFF')),
      author_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      event_type TEXT NOT NULL,
      actor_id TEXT,
      actor_email TEXT,
      actor_role TEXT,
      target_resource TEXT,
      target_id TEXT,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(outcome IN ('SUCCESS', 'FAILURE', 'BLOCKED')),
      ip_address TEXT,
      user_agent TEXT,
      details_json TEXT,
      correlation_id TEXT
    );

    CREATE TABLE IF NOT EXISTS website_announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('BANNER', 'MAINTENANCE', 'NEWS', 'PROMOTION')),
      message TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT,
      ends_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS website_plans (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK(category IN ('VPS', 'VDS', 'STORAGE', 'HOSTING', 'EMAIL', 'SSL')),
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      price_bdt REAL NOT NULL,
      price_usd REAL NOT NULL,
      vcpu INTEGER,
      ram_gb INTEGER,
      storage_gb INTEGER,
      bandwidth_tb REAL,
      features_json TEXT,
      is_popular INTEGER DEFAULT 0,
      is_available INTEGER DEFAULT 1,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS website_seo (
      page_key TEXT PRIMARY KEY,
      meta_title TEXT NOT NULL,
      meta_description TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      og_title TEXT,
      og_description TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS website_coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENTAGE', 'FIXED')),
      discount_value REAL NOT NULL,
      max_uses INTEGER DEFAULT 100,
      used_count INTEGER DEFAULT 0,
      valid_from TEXT,
      valid_until TEXT,
      is_active INTEGER DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS infrastructure_incidents (
      id TEXT PRIMARY KEY,
      zone TEXT NOT NULL,
      cluster TEXT NOT NULL,
      component TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('INFO', 'WARNING', 'CRITICAL')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'INVESTIGATING' CHECK(status IN ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      created_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
    CREATE INDEX IF NOT EXISTS idx_customers_partner ON customers(partner_id);
    CREATE INDEX IF NOT EXISTS idx_cust_services_cust ON customer_services(customer_id);
    CREATE INDEX IF NOT EXISTS idx_cust_services_status ON customer_services(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_cust ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_orders_cust ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_security_events_time ON security_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_security_events_actor ON security_events(actor_email);
    CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
  `);

  // Migration: Ensure trade_license and nid_document columns exist in existing databases
  try {
    const tableInfo = db.prepare("PRAGMA table_info(partner_applications)").all();
    const cols = new Set(tableInfo.map(c => c.name));
    if (!cols.has('trade_license_pdf')) {
      db.exec('ALTER TABLE partner_applications ADD COLUMN trade_license_pdf TEXT;');
    }
    if (!cols.has('trade_license_filename')) {
      db.exec('ALTER TABLE partner_applications ADD COLUMN trade_license_filename TEXT;');
    }
    if (!cols.has('nid_document_pdf')) {
      db.exec('ALTER TABLE partner_applications ADD COLUMN nid_document_pdf TEXT;');
    }
    if (!cols.has('nid_document_filename')) {
      db.exec('ALTER TABLE partner_applications ADD COLUMN nid_document_filename TEXT;');
    }
  } catch (migErr) {
    console.warn('[DB Migration Warning for partner_applications]', migErr.message);
  }

  // Migration: Ensure users table check constraint supports granular admin roles
  try {
    const tableSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (tableSqlRow && tableSqlRow.sql && !tableSqlRow.sql.includes('SUPER_ADMIN')) {
      db.exec(`
        CREATE TABLE users_migrated (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ADMIN', 'SUPER_ADMIN', 'SECURITY_ADMIN', 'INFRASTRUCTURE_ADMIN', 'FINANCE_ADMIN', 'PARTNER_MANAGER', 'SUPPORT_ADMIN', 'CONTENT_ADMIN', 'AUDITOR', 'PARTNER', 'CUSTOMER')),
          partner_id TEXT,
          name TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          last_login_at TEXT,
          failed_login_attempts INTEGER DEFAULT 0,
          locked_until TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users_migrated (id, email, password_hash, salt, role, partner_id, created_at)
          SELECT id, email, password_hash, salt, role, partner_id, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_migrated RENAME TO users;
      `);
    }
  } catch (userMigErr) {
    console.warn('[DB User Migration Warning]', userMigErr.message);
  }

  seedDefaultData(db);
  seedRewardSystemData(db);
  seedAdminPortalData(db);
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
    { id: 'b1', tier_id: 'tier-registered', benefit_name: '5% Base Reseller Discount on VPS & VDS', is_immediate: 1 },
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
    { id: 'pr-vps-start', product_code: 'VPS-STARTER', product_name: 'Starter Cloud VPS (1 vCPU, 2GB RAM)', category: 'VPS', base_price_monthly: 1464.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.10, exclusion_reason: null },
    { id: 'pr-vps-biz', product_code: 'VPS-BUSINESS', product_name: 'Business Cloud VPS (2 vCPU, 4GB RAM)', category: 'VPS', base_price_monthly: 2928.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.10, exclusion_reason: null },
    { id: 'pr-vps-pro', product_code: 'VPS-PRO', product_name: 'Professional Cloud VPS (4 vCPU, 8GB RAM)', category: 'VPS', base_price_monthly: 5856.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.10, exclusion_reason: null },
    { id: 'pr-vps-ent', product_code: 'VPS-ENTERPRISE', product_name: 'Enterprise Cloud VPS (8 vCPU, 16GB RAM)', category: 'VPS', base_price_monthly: 11712.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.10, exclusion_reason: null },
    { id: 'pr-vds-ess', product_code: 'VDS-ESSENTIAL', product_name: 'Essential Dedicated Server (Xeon, 32GB ECC)', category: 'VDS', base_price_monthly: 14640.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.08, exclusion_reason: null },
    { id: 'pr-vds-biz', product_code: 'VDS-BUSINESS', product_name: 'Business Dedicated Server (EPYC, 64GB ECC)', category: 'VDS', base_price_monthly: 25620.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.08, exclusion_reason: null },
    { id: 'pr-vds-ent', product_code: 'VDS-ENTERPRISE', product_name: 'Enterprise Dedicated Server (Dual EPYC, 256GB)', category: 'VDS', base_price_monthly: 54900.00, is_discountable: 1, max_discount_rate: 0.25, fixed_commission_rate: 0.08, exclusion_reason: null },
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

  const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovQ29udGVudHMgNCAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCA0NAo+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDEwMCA3MDAgVGQgKFZlcmlmaWVkIFBERiBEb2N1bWVudCkgVmogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTggMDAwMDAgbiAKMDAwMDAwMDA3NyAwMDAwMCBuIAowMDAwMDAwMTM2IDAwMDAwIG4gCjAwMDAwMDAyMzEgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA1Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoyOTUKJSVFT0Y=';

  const insertApp = db.prepare(`
    INSERT INTO partner_applications (
      id, reference_no, company_name, contact_name, email, phone, country, website,
      business_type, estimated_monthly_spend, expected_customers, services_of_interest,
      partnership_model, business_description, status, admin_notes,
      trade_license_pdf, trade_license_filename, nid_document_pdf, nid_document_filename
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of applications) {
    insertApp.run(
      a.id, a.reference_no, a.company_name, a.contact_name, a.email, a.phone, a.country, a.website,
      a.business_type, a.estimated_monthly_spend, a.expected_customers, a.services_of_interest,
      a.partnership_model, a.business_description, a.status, a.admin_notes,
      samplePdf, `${a.company_name.replace(/\s+/g, '_')}_Trade_License.pdf`,
      samplePdf, `${a.contact_name.replace(/\s+/g, '_')}_NID.pdf`
    );
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
        '["VPS","VDS","Reseller Hosting","Cloud Storage","Web Hosting","SSL","Domain"]',
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
        category: 'VPS',
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
        category: 'VDS',
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
        category: 'VPS',
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
        category: 'VPS',
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

/**
 * Seeds Centralized Admin Portal with real data:
 * - Granular Administrator Roles (Super Admin, Security, Infrastructure, Finance, Partner, Support, Content, Auditor)
 * - Customer Accounts (Directory, contacts, statuses, linked WHMCS IDs)
 * - Customer Cloud Instances & Services (IPs, resource limits, statuses)
 * - Billing Invoices & Orders (Paid, unpaid, overdue, refund workflows)
 * - Support Tickets & Discussion Threads
 * - Public Website CMS (Announcements, Cloud Plans, SEO Meta, Coupons)
 * - Infrastructure Incidents & Security Event Telemetry
 */
export function seedAdminPortalData(db) {
  // 1. Seed Granular Admin Users
  const adminUsers = [
    { id: 'usr-adm-super', email: 'superadmin@unified.cloud', role: 'SUPER_ADMIN', name: 'Zahirul Islam', pass: 'SuperAdmin2026!' },
    { id: 'usr-adm-sec', email: 'security@unified.cloud', role: 'SECURITY_ADMIN', name: 'Nadia Sharmin', pass: 'SecurityAdmin2026!' },
    { id: 'usr-adm-infra', email: 'infra@unified.cloud', role: 'INFRASTRUCTURE_ADMIN', name: 'Fahim Chowdhury', pass: 'InfraAdmin2026!' },
    { id: 'usr-adm-fin', email: 'finance@unified.cloud', role: 'FINANCE_ADMIN', name: 'Tahmina Akhter', pass: 'FinanceAdmin2026!' },
    { id: 'usr-adm-ptn', email: 'partners@unified.cloud', role: 'PARTNER_MANAGER', name: 'Mahbubur Rahman', pass: 'PartnerAdmin2026!' },
    { id: 'usr-adm-sup', email: 'support@unified.cloud', role: 'SUPPORT_ADMIN', name: 'Saiful Karim', pass: 'SupportAdmin2026!' },
    { id: 'usr-adm-cnt', email: 'content@unified.cloud', role: 'CONTENT_ADMIN', name: 'Anika Tabassum', pass: 'ContentAdmin2026!' },
    { id: 'usr-adm-aud', email: 'auditor@unified.cloud', role: 'AUDITOR', name: 'Rezaul Karim, CISA', pass: 'AuditorAdmin2026!' }
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, salt, role, partner_id, name, status)
    VALUES (?, ?, ?, ?, ?, NULL, ?, 'ACTIVE')
  `);

  for (const adm of adminUsers) {
    const auth = hashPassword(adm.pass);
    insertUser.run(adm.id, adm.email, auth.hash, auth.salt, adm.role, adm.name);
  }

  // 2. Seed Customers (if empty)
  const custCount = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  if (!custCount || custCount.count === 0) {
    const customers = [
      { id: 'cust-101', first_name: 'Tanvir', last_name: 'Rahman', company_name: 'Apex FinTech Global', email: 'tanvir@apexfintech.io', phone: '+8801711001122', country: 'Bangladesh', city: 'Dhaka', address: 'Plot 4, Road 11, Banani C/A', status: 'ACTIVE', whmcs_client_id: 10420, partner_id: null },
      { id: 'cust-102', first_name: 'Shahidul', last_name: 'Islam', company_name: 'Bengal Textile Mills Ltd', email: 'it@bengaltextiles.com', phone: '+8801819223344', country: 'Bangladesh', city: 'Gazipur', address: 'Kashimpur Industrial Zone', status: 'ACTIVE', whmcs_client_id: 10421, partner_id: null },
      { id: 'cust-103', first_name: 'Kamrul', last_name: 'Hasan', company_name: 'Prime Logistics Hub', email: 'ops@primelogistics.bd', phone: '+8801911334455', country: 'Bangladesh', city: 'Chittagong', address: 'Agrabad Commercial Area', status: 'ACTIVE', whmcs_client_id: 10422, partner_id: 'ptn-apex-101' },
      { id: 'cust-104', first_name: 'Farhana', last_name: 'Ahmed', company_name: 'Nordic Data Systems', email: 'dev@nordicdata.xyz', phone: '+8801722445566', country: 'Bangladesh', city: 'Dhaka', address: 'Gulshan-2 Tower 3', status: 'ACTIVE', whmcs_client_id: 10423, partner_id: null },
      { id: 'cust-105', first_name: 'Rashed', last_name: 'Chowdhury', company_name: 'CloudSync Technologies', email: 'admin@cloudsync.io', phone: '+8801833556677', country: 'Bangladesh', city: 'Sylhet', address: 'Zindabazar Tech Park', status: 'ACTIVE', whmcs_client_id: 10424, partner_id: 'ptn-apex-101' },
      { id: 'cust-106', first_name: 'Nazmul', last_name: 'Huda', company_name: 'Meghna Health Diagnostics', email: 'sysadmin@meghnahealth.org', phone: '+8801744667788', country: 'Bangladesh', city: 'Dhaka', address: 'Dhanmondi Road 27', status: 'ACTIVE', whmcs_client_id: 10425, partner_id: null },
      { id: 'cust-107', first_name: 'Tariq', last_name: 'Mehmood', company_name: 'Eastern Mercantile Bank Ltd', email: 'infosec@easternbank.test', phone: '+8801855778899', country: 'Bangladesh', city: 'Dhaka', address: 'Motijheel C/A', status: 'SUSPENDED', whmcs_client_id: 10426, partner_id: null, suspension_reason: 'Compliance audit hold pending updated corporate trade license', suspended_by: 'security@unified.cloud', suspended_at: '2026-10-15 14:30:00' },
      { id: 'cust-108', first_name: 'Anisur', last_name: 'Rahman', company_name: 'Sonar E-Commerce BD', email: 'billing@sonarecom.com.bd', phone: '+8801966889900', country: 'Bangladesh', city: 'Dhaka', address: 'Uttara Sector 7', status: 'ACTIVE', whmcs_client_id: 10427, partner_id: 'ptn-apex-101' },
      { id: 'cust-109', first_name: 'Sultana', last_name: 'Razia', company_name: 'Green Delta Software', email: 'hello@greendelta.io', phone: '+8801777990011', country: 'Bangladesh', city: 'Dhaka', address: 'Mirpur DOHS', status: 'PENDING', whmcs_client_id: 10428, partner_id: null }
    ];

    const insertCust = db.prepare(`
      INSERT INTO customers (id, first_name, last_name, company_name, email, phone, country, city, address, status, whmcs_client_id, partner_id, suspension_reason, suspended_by, suspended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of customers) {
      insertCust.run(
        c.id, c.first_name, c.last_name, c.company_name, c.email, c.phone, c.country, c.city, c.address,
        c.status, c.whmcs_client_id, c.partner_id, c.suspension_reason || null, c.suspended_by || null, c.suspended_at || null
      );
    }
  }

  // 3. Seed Customer Services / CloudStack Instances (if empty)
  const srvCount = db.prepare('SELECT COUNT(*) as count FROM customer_services').get();
  if (!srvCount || srvCount.count === 0) {
    const services = [
      { id: 'csrv-101', customer_id: 'cust-101', partner_id: null, service_type: 'VPS', service_name: 'FinTech Core Payment Gateway', plan_code: 'VPS-ENTERPRISE', status: 'RUNNING', cloudstack_vm_id: 'cs-vm-fintech-01', zone: 'Dhaka DC-01', ip_address: '103.145.22.10', vcpu: 8, ram_mb: 16384, disk_gb: 300, monthly_price: 11712.00, billing_cycle: 'monthly', next_due_date: '2026-11-01' },
      { id: 'csrv-102', customer_id: 'cust-101', partner_id: null, service_type: 'VDS', service_name: 'FinTech Bare Metal DB Replica', plan_code: 'VDS-BUSINESS', status: 'RUNNING', cloudstack_vm_id: 'cs-vm-fintech-02', zone: 'Dhaka DC-01', ip_address: '103.145.22.11', vcpu: 16, ram_mb: 65536, disk_gb: 2000, monthly_price: 25620.00, billing_cycle: 'monthly', next_due_date: '2026-11-01' },
      { id: 'csrv-103', customer_id: 'cust-102', partner_id: null, service_type: 'VPS', service_name: 'Supply Chain & Inventory ERP', plan_code: 'VPS-PRO', status: 'RUNNING', cloudstack_vm_id: 'cs-vm-textile-01', zone: 'Dhaka DC-01', ip_address: '103.145.22.25', vcpu: 4, ram_mb: 8192, disk_gb: 160, monthly_price: 5856.00, billing_cycle: 'monthly', next_due_date: '2026-11-05' },
      { id: 'csrv-104', customer_id: 'cust-103', partner_id: 'ptn-apex-101', service_type: 'VPS', service_name: 'Fleet Telematics GPS Hub', plan_code: 'VPS-BUSINESS', status: 'RUNNING', cloudstack_vm_id: 'cs-vm-logistics-01', zone: 'Singapore SG-01', ip_address: '103.145.22.33', vcpu: 2, ram_mb: 4096, disk_gb: 80, monthly_price: 2928.00, billing_cycle: 'monthly', next_due_date: '2026-11-12' },
      { id: 'csrv-105', customer_id: 'cust-104', partner_id: null, service_type: 'STORAGE', service_name: 'Enterprise S3 Object Storage', plan_code: 'STORAGE-OBJ', status: 'RUNNING', cloudstack_vm_id: 'cs-stor-nordic-01', zone: 'Dhaka DC-01', ip_address: '103.145.22.50', vcpu: 2, ram_mb: 4096, disk_gb: 10000, monthly_price: 18300.00, billing_cycle: 'monthly', next_due_date: '2026-11-15' },
      { id: 'csrv-106', customer_id: 'cust-105', partner_id: 'ptn-apex-101', service_type: 'VPS', service_name: 'Kubernetes Worker Node #1', plan_code: 'VPS-PRO', status: 'STOPPED', cloudstack_vm_id: 'cs-vm-cloudsync-01', zone: 'Dhaka DC-01', ip_address: '103.145.22.75', vcpu: 4, ram_mb: 8192, disk_gb: 160, monthly_price: 5856.00, billing_cycle: 'monthly', next_due_date: '2026-11-18' },
      { id: 'csrv-107', customer_id: 'cust-106', partner_id: null, service_type: 'VPS', service_name: 'PACS Radiology Archive Node', plan_code: 'VPS-BUSINESS', status: 'RUNNING', cloudstack_vm_id: 'cs-vm-meghna-01', zone: 'Dhaka DC-01', ip_address: '103.145.22.90', vcpu: 2, ram_mb: 4096, disk_gb: 120, monthly_price: 3450.00, billing_cycle: 'monthly', next_due_date: '2026-11-20' },
      { id: 'csrv-108', customer_id: 'cust-108', partner_id: 'ptn-apex-101', service_type: 'VPS', service_name: 'High-Traffic Magento Production', plan_code: 'VPS-ENTERPRISE', status: 'RUNNING', cloudstack_vm_id: 'cs-vm-sonar-01', zone: 'Dhaka DC-01', ip_address: '103.145.22.120', vcpu: 8, ram_mb: 16384, disk_gb: 320, monthly_price: 11712.00, billing_cycle: 'monthly', next_due_date: '2026-11-25' }
    ];

    const insertService = db.prepare(`
      INSERT INTO customer_services (id, customer_id, partner_id, service_type, service_name, plan_code, status, cloudstack_vm_id, zone, ip_address, vcpu, ram_mb, disk_gb, monthly_price, billing_cycle, next_due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of services) {
      insertService.run(
        s.id, s.customer_id, s.partner_id, s.service_type, s.service_name, s.plan_code, s.status,
        s.cloudstack_vm_id, s.zone, s.ip_address, s.vcpu, s.ram_mb, s.disk_gb, s.monthly_price, s.billing_cycle, s.next_due_date
      );
    }
  }

  // 4. Seed Invoices & Orders (if empty)
  const invCount = db.prepare('SELECT COUNT(*) as count FROM invoices').get();
  if (!invCount || invCount.count === 0) {
    const invoices = [
      { id: 'inv-101', invoice_number: 'INV-2026-8801', customer_id: 'cust-101', subtotal: 37332.00, tax: 0, total: 37332.00, status: 'PAID', due_date: '2026-10-15', paid_at: '2026-10-12 11:20:00', payment_method: 'Bank Wire / BEFTN', transaction_ref: 'TXN-EBL-89214', items: 'FinTech Core Payment Gateway (VPS) + Bare Metal DB Replica (VDS)' },
      { id: 'inv-102', invoice_number: 'INV-2026-8802', customer_id: 'cust-102', subtotal: 5856.00, tax: 0, total: 5856.00, status: 'PAID', due_date: '2026-10-18', paid_at: '2026-10-16 16:40:00', payment_method: 'bKash Merchant', transaction_ref: 'BK-9912401', items: 'Supply Chain & Inventory ERP (VPS-PRO)' },
      { id: 'inv-103', invoice_number: 'INV-2026-8803', customer_id: 'cust-103', subtotal: 2928.00, tax: 0, total: 2928.00, status: 'PAID', due_date: '2026-10-20', paid_at: '2026-10-19 09:15:00', payment_method: 'Nagad Corporate', transaction_ref: 'NG-441209', items: 'Fleet Telematics GPS Hub (VPS-BUSINESS)' },
      { id: 'inv-104', invoice_number: 'INV-2026-8804', customer_id: 'cust-104', subtotal: 18300.00, tax: 0, total: 18300.00, status: 'PAID', due_date: '2026-10-22', paid_at: '2026-10-21 14:00:00', payment_method: 'City Bank CityTouch', transaction_ref: 'CBL-901844', items: 'Enterprise S3 Object Storage 10TB' },
      { id: 'inv-105', invoice_number: 'INV-2026-8805', customer_id: 'cust-105', subtotal: 5856.00, tax: 0, total: 5856.00, status: 'UNPAID', due_date: '2026-11-05', paid_at: null, payment_method: null, transaction_ref: null, items: 'Kubernetes Worker Node #1 (VPS-PRO)' },
      { id: 'inv-106', invoice_number: 'INV-2026-8806', customer_id: 'cust-106', subtotal: 3450.00, tax: 0, total: 3450.00, status: 'UNPAID', due_date: '2026-11-08', paid_at: null, payment_method: null, transaction_ref: null, items: 'PACS Radiology Archive Node' },
      { id: 'inv-107', invoice_number: 'INV-2026-8807', customer_id: 'cust-108', subtotal: 11712.00, tax: 0, total: 11712.00, status: 'PAID', due_date: '2026-10-24', paid_at: '2026-10-23 18:30:00', payment_method: 'bKash Merchant', transaction_ref: 'BK-9988112', items: 'High-Traffic Magento Production (VPS-ENTERPRISE)' },
      { id: 'inv-108', invoice_number: 'INV-2026-8808', customer_id: 'cust-104', subtotal: 4880.00, tax: 0, total: 4880.00, status: 'REFUNDED', due_date: '2026-09-30', paid_at: '2026-09-29 10:00:00', payment_method: 'bKash Merchant', transaction_ref: 'BK-REF-7721', refund_reason: 'Client downsizing compute instance per SLA guarantee', refunded_by: 'finance@unified.cloud', refunded_at: '2026-10-02 12:00:00', items: 'Staging Compute Node (Prorated refund)' }
    ];

    const insertInv = db.prepare(`
      INSERT INTO invoices (id, invoice_number, customer_id, subtotal, tax, total, currency, status, due_date, paid_at, payment_method, transaction_ref, refund_reason, refunded_by, refunded_at, items_json)
      VALUES (?, ?, ?, ?, ?, ?, 'BDT', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const inv of invoices) {
      insertInv.run(
        inv.id, inv.invoice_number, inv.customer_id, inv.subtotal, inv.tax, inv.total,
        inv.status, inv.due_date, inv.paid_at, inv.payment_method, inv.transaction_ref,
        inv.refund_reason || null, inv.refunded_by || null, inv.refunded_at || null,
        JSON.stringify([{ item: inv.items, amount: inv.total }])
      );
    }

    // Seed corresponding orders
    const insertOrd = db.prepare(`
      INSERT INTO orders (id, order_number, customer_id, status, total_amount, currency, items_json)
      VALUES (?, ?, ?, ?, ?, 'BDT', ?)
    `);

    for (const inv of invoices) {
      insertOrd.run(
        'ord-' + inv.invoice_number.replace('INV-', ''),
        'ORD-' + inv.invoice_number.replace('INV-', ''),
        inv.customer_id,
        inv.status === 'REFUNDED' ? 'REFUNDED' : 'COMPLETED',
        inv.total,
        JSON.stringify([{ item: inv.items, amount: inv.total }])
      );
    }
  }

  // 5. Seed Support Tickets & Replies (if empty)
  const ticketCount = db.prepare('SELECT COUNT(*) as count FROM support_tickets').get();
  if (!ticketCount || ticketCount.count === 0) {
    const tickets = [
      { id: 'tck-101', ticket_number: 'TCK-2026-901', customer_id: 'cust-101', requester_email: 'tanvir@apexfintech.io', requester_name: 'Tanvir Rahman', department: 'TECHNICAL', priority: 'HIGH', status: 'IN_PROGRESS', subject: 'rDNS / PTR Record Configuration for FinTech Outbound Mail', message: 'Please delegate rDNS for our IP address 103.145.22.10 to mail.apexfintech.io to satisfy DKIM/DMARC mail delivery compliance.', assigned_to: 'support@unified.cloud' },
      { id: 'tck-102', ticket_number: 'TCK-2026-902', customer_id: 'cust-104', requester_email: 'dev@nordicdata.xyz', requester_name: 'Farhana Ahmed', department: 'INFRASTRUCTURE', priority: 'MEDIUM', status: 'OPEN', subject: 'S3 Object Storage Bucket Quota Expansion to 25TB', message: 'Our current 10TB S3 bucket is at 82% capacity. We require expansion to 25TB before month-end automated database snapshot ingestion.', assigned_to: null },
      { id: 'tck-103', ticket_number: 'TCK-2026-903', customer_id: 'cust-102', requester_email: 'it@bengaltextiles.com', requester_name: 'Shahidul Islam', department: 'BILLING', priority: 'LOW', status: 'RESOLVED', subject: 'Official VAT Challan (Mushak-6.3) for Q3 Invoices', message: 'Kindly provide the signed and stamped VAT Mushak 6.3 challan for Invoice INV-2026-8802 for our auditor clearance.', assigned_to: 'finance@unified.cloud' },
      { id: 'tck-104', ticket_number: 'TCK-2026-904', customer_id: 'cust-103', requester_email: 'ops@primelogistics.bd', requester_name: 'Kamrul Hasan', department: 'INFRASTRUCTURE', priority: 'CRITICAL', status: 'IN_PROGRESS', subject: 'BGP Routing Optimization via Singapore Edge Gateway', message: 'We noticed an 18ms latency spike on traffic originating from Chittagong port terminals to the Singapore cluster. Requesting immediate route telemetry verification.', assigned_to: 'infra@unified.cloud' }
    ];

    const insertTck = db.prepare(`
      INSERT INTO support_tickets (id, ticket_number, customer_id, requester_email, requester_name, department, priority, status, subject, message, assigned_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of tickets) {
      insertTck.run(t.id, t.ticket_number, t.customer_id, t.requester_email, t.requester_name, t.department, t.priority, t.status, t.subject, t.message, t.assigned_to);
    }

    // Seed reply for TCK-2026-901
    db.prepare(`
      INSERT INTO ticket_replies (id, ticket_id, author_type, author_name, author_email, message)
      VALUES (?, 'tck-101', 'STAFF', 'Saiful Karim (Support Lead)', 'support@unified.cloud', ?)
    `).run('rep-101', 'Hello Tanvir, our DNS engineering team has validated your zone records and updated PTR 10.22.145.103.in-addr.arpa to mail.apexfintech.io. TTL is 3600s. Propagation is now active across all BDIX and global authoritative nameservers.');
  }

  // 6. Seed Public Website CMS Data (if empty)
  const annCount = db.prepare('SELECT COUNT(*) as count FROM website_announcements').get();
  if (!annCount || annCount.count === 0) {
    db.prepare(`
      INSERT INTO website_announcements (id, title, type, message, is_active, starts_at, ends_at, created_by)
      VALUES
        ('ann-01', 'Scheduled Datacenter Switch Firmware Upgrade', 'MAINTENANCE', 'Core redundant switch firmware upgrade scheduled for Sunday, November 1st at 02:00 AM BST. Redundant paths will maintain 100% traffic continuity without expected disruption.', 1, '2026-10-20', '2026-11-02', 'infra@unified.cloud'),
        ('ann-02', 'Singapore Ultra-Low Latency Cloud VPS Launched', 'PROMOTION', 'Deploy Singapore VPS instances with direct sub-35ms routing across Southeast Asia. Enjoy 20% off annual commitments with coupon SGLAUNCH20.', 1, '2026-10-15', '2026-12-31', 'content@unified.cloud')
    `).run();
  }

  const plansCount = db.prepare('SELECT COUNT(*) as count FROM website_plans').get();
  if (!plansCount || plansCount.count === 0) {
    const plans = [
      { id: 'plan-vps-1', category: 'VPS', name: 'Starter Cloud VPS', code: 'VPS-STARTER', price_bdt: 1464, price_usd: 12, vcpu: 1, ram_gb: 2, storage_gb: 40, bandwidth_tb: 2.0, features: '["1 Dedicated vCPU (AMD EPYC)", "2 GB DDR5 ECC RAM", "40 GB NVMe Storage", "1 Gbps Port with 2TB Transfer", "Dedicated IPv4 + /64 IPv6", "Automated Daily Snapshots"]', popular: 0 },
      { id: 'plan-vps-2', category: 'VPS', name: 'Business Cloud VPS', code: 'VPS-BUSINESS', price_bdt: 2928, price_usd: 24, vcpu: 2, ram_gb: 4, storage_gb: 80, bandwidth_tb: 4.0, features: '["2 Dedicated vCPUs", "4 GB DDR5 ECC RAM", "80 GB NVMe Storage", "1 Gbps Port with 4TB Transfer", "BDIX Ultra-Low Latency Peering", "Free DDoS Shield Up to 100 Gbps"]', popular: 1 },
      { id: 'plan-vps-3', category: 'VPS', name: 'Professional Cloud VPS', code: 'VPS-PRO', price_bdt: 5856, price_usd: 48, vcpu: 4, ram_gb: 8, storage_gb: 160, bandwidth_tb: 8.0, features: '["4 Dedicated vCPUs", "8 GB DDR5 ECC RAM", "160 GB Enterprise NVMe", "8TB High-Speed Transit", "Direct CloudStack Orchestration API", "99.99% High Availability SLA"]', popular: 0 },
      { id: 'plan-vps-4', category: 'VPS', name: 'Enterprise Cloud VPS', code: 'VPS-ENTERPRISE', price_bdt: 11712, price_usd: 96, vcpu: 8, ram_gb: 16, storage_gb: 320, bandwidth_tb: 16.0, features: '["8 Dedicated vCPUs", "16 GB DDR5 ECC RAM", "320 GB Enterprise NVMe", "16TB High-Speed Transit", "24/7 Priority Support Escalation", "Custom Private VLAN & BGP Peering"]', popular: 0 },
      { id: 'plan-vds-1', category: 'VDS', name: 'Essential Dedicated Server', code: 'VDS-ESSENTIAL', price_bdt: 14640, price_usd: 120, vcpu: 8, ram_gb: 32, storage_gb: 1000, bandwidth_tb: 20.0, features: '["Intel Xeon E-2388G (8 Cores / 16 Threads)", "32 GB DDR4 ECC RAM", "2x 500GB NVMe RAID-1", "Full IPMI/KVM Remote Console", "BDIX Direct Datacenter Peering"]', popular: 0 },
      { id: 'plan-vds-2', category: 'VDS', name: 'Business Dedicated Server', code: 'VDS-BUSINESS', price_bdt: 25620, price_usd: 210, vcpu: 16, ram_gb: 64, storage_gb: 2000, bandwidth_tb: 30.0, features: '["AMD EPYC 7302P (16 Cores / 32 Threads)", "64 GB DDR4 ECC RAM", "2x 1TB Enterprise NVMe", "Redundant 10Gbps Uplinks", "Dedicated Hardware Firewall Option"]', popular: 1 },
      { id: 'plan-stor-1', category: 'STORAGE', name: 'Enterprise S3 Object Storage', code: 'STORAGE-OBJ', price_bdt: 1830, price_usd: 15, vcpu: 2, ram_gb: 4, storage_gb: 1000, bandwidth_tb: 5.0, features: '["100% S3-Compatible API", "11 Nines (99.999999999%) Durability", "Zero Egress Fees inside Unified DC", "Server-Side AES-256 Encryption", "Multi-AZ Erasure Coding"]', popular: 0 }
    ];

    const insertPlan = db.prepare(`
      INSERT INTO website_plans (id, category, name, code, price_bdt, price_usd, vcpu, ram_gb, storage_gb, bandwidth_tb, features_json, is_popular, is_available)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    for (const p of plans) {
      insertPlan.run(p.id, p.category, p.name, p.code, p.price_bdt, p.price_usd, p.vcpu, p.ram_gb, p.storage_gb, p.bandwidth_tb, p.features, p.popular);
    }
  }

  const seoCount = db.prepare('SELECT COUNT(*) as count FROM website_seo').get();
  if (!seoCount || seoCount.count === 0) {
    db.prepare(`
      INSERT INTO website_seo (page_key, meta_title, meta_description, canonical_url)
      VALUES
        ('home', 'Unified Cloud - Next-Gen Enterprise Cloud Infrastructure & Datacenter', 'Ultra-low latency Cloud VPS, Bare-Metal Dedicated Servers, S3 Storage, and BDIX Peering for high-scale enterprise workloads.', 'https://unifiedit.xyz/'),
        ('vps', 'High Performance Cloud VPS | Unified Cloud', 'Blazing fast AMD EPYC & Intel NVMe VPS with instant CloudStack provisioning, 1Gbps unmetered connectivity, and DDoS protection.', 'https://unifiedit.xyz/#cloud'),
        ('vds', 'Dedicated Bare Metal Servers | Unified Cloud', 'Single-tenant enterprise dedicated servers with full IPMI control, hardware RAID, and 99.99% uptime guarantee.', 'https://unifiedit.xyz/#vds'),
        ('partner', 'Cloud Partner Program | Reseller & Affiliate Margins', 'Earn up to 25% recurring margin and sales reward points reselling enterprise cloud compute, hosting, and storage.', 'https://unifiedit.xyz/partners')
    `).run();
  }

  const cpnCount = db.prepare('SELECT COUNT(*) as count FROM website_coupons').get();
  if (!cpnCount || cpnCount.count === 0) {
    db.prepare(`
      INSERT INTO website_coupons (id, code, discount_type, discount_value, max_uses, used_count, is_active, created_by)
      VALUES
        ('cpn-1', 'WELCOME2026', 'PERCENTAGE', 0.15, 500, 42, 1, 'finance@unified.cloud'),
        ('cpn-2', 'SGLAUNCH20', 'PERCENTAGE', 0.20, 200, 18, 1, 'content@unified.cloud'),
        ('cpn-3', 'ENTERPRISE10', 'PERCENTAGE', 0.10, 100, 9, 1, 'partners@unified.cloud')
    `).run();
  }

  const incCount = db.prepare('SELECT COUNT(*) as count FROM infrastructure_incidents').get();
  if (!incCount || incCount.count === 0) {
    db.prepare(`
      INSERT INTO infrastructure_incidents (id, zone, cluster, component, severity, title, description, status, created_by, resolved_at)
      VALUES
        ('inc-01', 'Singapore SG-01', 'Edge BGP Cluster', 'Upstream Transit Router', 'INFO', 'Upstream Transit Latency Optimization Completed', 'Re-routed transit routing across subsea cable path to reduce Dhaka-Singapore latency from 44ms to 32ms.', 'RESOLVED', 'infra@unified.cloud', '2026-10-24 16:00:00'),
        ('inc-02', 'Dhaka DC-01', 'Core Compute Cluster A', 'CRAC Cooling Units', 'INFO', 'Quarterly Redundancy Maintenance Test Passed', 'Dual CRAC cooling units and automatic transfer switches verified under 100% compute load with zero thermal deviation.', 'RESOLVED', 'infra@unified.cloud', '2026-10-22 03:00:00')
    `).run();
  }

  // 7. Seed Initial Security Events (if empty)
  const secCount = db.prepare('SELECT COUNT(*) as count FROM security_events').get();
  if (!secCount || secCount.count === 0) {
    db.prepare(`
      INSERT INTO security_events (id, timestamp, event_type, actor_id, actor_email, actor_role, target_resource, target_id, action, outcome, ip_address, details_json, correlation_id)
      VALUES
        ('sec-01', datetime('now', '-2 hours'), 'LOGIN_SUCCESS', 'usr-adm-super', 'superadmin@unified.cloud', 'SUPER_ADMIN', 'admin_portal', 'dashboard', 'AUTHENTICATE', 'SUCCESS', '103.145.22.5', '{"mfa":true,"device":"Firefox macOS"}', 'corr-init-01'),
        ('sec-02', datetime('now', '-1 hour'), 'LOGIN_SUCCESS', 'usr-adm-infra', 'infra@unified.cloud', 'INFRASTRUCTURE_ADMIN', 'admin_portal', 'cloud_instances', 'AUTHENTICATE', 'SUCCESS', '103.145.22.6', '{"mfa":true,"device":"Chrome Windows"}', 'corr-init-02'),
        ('sec-03', datetime('now', '-35 minutes'), 'ACCOUNT_SUSPENDED', 'usr-adm-sec', 'security@unified.cloud', 'SECURITY_ADMIN', 'customers', 'cust-107', 'SUSPEND_ACCOUNT', 'SUCCESS', '103.145.22.7', '{"reason":"Compliance audit hold pending updated corporate trade license"}', 'corr-init-03'),
        ('sec-04', datetime('now', '-12 minutes'), 'LOGIN_FAILURE', 'unknown', 'hacker@malicious.xyz', 'ANONYMOUS', 'auth', 'login', 'AUTHENTICATE', 'FAILURE', '185.220.101.4', '{"reason":"Invalid email or password"}', 'corr-init-04')
    `).run();
  }
}

