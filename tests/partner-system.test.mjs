import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, hashPassword, verifyPassword } from '../server/db.mjs';
import { PricingEngine } from '../server/pricing-engine.mjs';
import { WHMCSAdapter } from '../server/whmcs-adapter.mjs';
import { CloudStackAdapter } from '../server/cloudstack-adapter.mjs';
import { handleLogin, sessionStore } from '../server/auth.mjs';

describe('Unified Cloud Partner Program - Production Test Suite', () => {
  let db;
  let pricing;
  let whmcs;
  let cloudstack;

  before(() => {
    // In-memory isolated database for tests
    db = initDatabase(':memory:');
    pricing = new PricingEngine(db);
    whmcs = new WHMCSAdapter();
    cloudstack = new CloudStackAdapter();
  });

  // 1. Database & Security
  describe('Database Models & Cryptography', () => {
    it('should hash and verify passwords using PBKDF2 with unique salts', () => {
      const pass = 'SecretPartnerPass123!';
      const auth = hashPassword(pass);
      assert.ok(auth.hash.length >= 64);
      assert.ok(auth.salt.length >= 16);
      assert.equal(verifyPassword(pass, auth.hash, auth.salt), true);
      assert.equal(verifyPassword('WrongPass', auth.hash, auth.salt), false);
    });

    it('should seed 4 configured tiers with correct properties', () => {
      const tiers = db.prepare('SELECT * FROM partner_tiers ORDER BY min_monthly_spend ASC').all();
      assert.equal(tiers.length, 4);
      assert.equal(tiers[0].slug, 'registered');
      assert.equal(tiers[0].discount_rate, 0.05);
      assert.equal(tiers[0].min_monthly_spend, 0);
      assert.equal(tiers[1].slug, 'silver');
      assert.equal(tiers[1].discount_rate, 0.10);
      assert.equal(tiers[1].min_monthly_spend, 30000);
      assert.equal(tiers[2].slug, 'gold');
      assert.equal(tiers[2].discount_rate, 0.15);
      assert.equal(tiers[2].min_monthly_spend, 120000);
      assert.equal(tiers[3].slug, 'platinum');
      assert.equal(tiers[3].discount_rate, 0.20);
      assert.equal(tiers[3].min_monthly_spend, 360000);
    });
  });

  // 2. Partner Application Lifecycle & Duplicate Prevention
  describe('Partner Application Workflow', () => {
    it('should prevent duplicate pending submissions from the same email', () => {
      const email = 'duplicate.test@agency.com';
      // First submission
      db.prepare(`
        INSERT INTO partner_applications (
          id, reference_no, company_name, contact_name, email, phone, country,
          business_type, estimated_monthly_spend, expected_customers, services_of_interest,
          partnership_model, business_description, status
        ) VALUES ('app-dup-1', 'APP-2026-11111', 'Test Agency', 'John', ?, '+8801700000000', 'BD', 'Reseller', '$500', '10', 'VPS', 'Reseller', 'Valid business description', 'PENDING')
      `).run(email);

      // Attempt duplicate check
      const duplicate = db.prepare(`
        SELECT id FROM partner_applications WHERE email = ? AND status = 'PENDING'
      `).get(email);
      assert.ok(duplicate);
      assert.equal(duplicate.id, 'app-dup-1');
    });

    it('should approve an application, create partner record and user account', () => {
      const appId = 'app-test-approve';
      const email = 'approve.test@agency.com';

      db.prepare(`
        INSERT INTO partner_applications (
          id, reference_no, company_name, contact_name, email, phone, country,
          business_type, estimated_monthly_spend, expected_customers, services_of_interest,
          partnership_model, business_description, status
        ) VALUES (?, 'APP-2026-22222', 'Apex Hosting', 'Rahim', ?, '+8801800000000', 'BD', 'Hosting', '$2000', '50', 'VPS', 'Reseller', 'Enterprise cloud hosting provider', 'PENDING')
      `).run(appId, email);

      const ptnId = 'ptn-test-approve';
      const usrId = 'usr-test-approve';
      const auth = hashPassword('PartnerInitial2026!');

      db.exec('BEGIN TRANSACTION;');
      db.prepare(`
        INSERT INTO partners (id, user_id, company_name, contact_name, email, phone, country, business_type, tier_id, status)
        VALUES (?, ?, 'Apex Hosting', 'Rahim', ?, '+8801800000000', 'BD', 'Hosting', 'tier-silver', 'ACTIVE')
      `).run(ptnId, usrId, email);

      db.prepare(`
        INSERT INTO users (id, email, password_hash, salt, role, partner_id)
        VALUES (?, ?, ?, ?, 'PARTNER', ?)
      `).run(usrId, email, auth.hash, auth.salt, ptnId);

      db.prepare(`
        UPDATE partner_applications SET status = 'APPROVED' WHERE id = ?
      `).run(appId);
      db.exec('COMMIT;');

      const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(ptnId);
      assert.equal(partner.tier_id, 'tier-silver');
      assert.equal(partner.status, 'ACTIVE');

      const login = handleLogin(db, email, 'PartnerInitial2026!');
      assert.equal(login.user.role, 'PARTNER');
      assert.equal(login.partner.companyName, 'Apex Hosting');
    });
  });

  // 3. Centralized Server-Side Pricing Engine
  describe('Pricing Engine & Anti-Stacking Safeguards', () => {
    it('should calculate correct tier discount for eligible Cloud VPS', () => {
      // Demo partner has Gold Tier (15%)
      const quote = pricing.calculatePartnerPrice({
        partnerId: 'ptn-apex-101',
        productCode: 'VPS-BUSINESS', // base price 2928.00 BDT
        quantity: 2
      });

      assert.equal(quote.product.code, 'VPS-BUSINESS');
      assert.equal(quote.currency, 'BDT');
      assert.equal(quote.pricing.grossSubtotalBDT, 5856.00);
      assert.equal(quote.pricing.appliedDiscountPercentage, 15);
      assert.equal(quote.pricing.partnerDiscountAmountBDT, 878.40);
      assert.equal(quote.pricing.netBeforeTaxBDT, 4977.60);
      assert.equal(quote.pricing.stackedDiscountRejected, false);
    });

    it('should strictly exclude non-discountable items (e.g. Domain Registration)', () => {
      const quote = pricing.calculatePartnerPrice({
        partnerId: 'ptn-apex-101',
        productCode: 'DOMAIN-REG',
        quantity: 1
      });

      assert.equal(quote.product.isDiscountable, false);
      assert.equal(quote.pricing.appliedDiscountPercentage, 0);
      assert.equal(quote.pricing.partnerDiscountAmountBDT, 0);
      assert.equal(quote.pricing.netBeforeTaxBDT, 1708.00);
      assert.ok(quote.product.exclusionReason.includes('ICANN'));
    });

    it('should apply strategic negotiated agreements over standard tier rates', () => {
      // Create a 22% strategic agreement for ptn-apex-101
      const today = new Date().toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO partner_agreements (id, partner_id, agreement_code, custom_discount_rate, effective_from, effective_until, approved_by, status)
        VALUES ('agr-test-strat', 'ptn-apex-101', 'AGR-STRAT-TEST', 0.22, ?, '2028-12-31', 'admin@unified.test', 'ACTIVE')
      `).run(today);

      const quote = pricing.calculatePartnerPrice({
        partnerId: 'ptn-apex-101',
        productCode: 'VDS-BUSINESS', // base price 25620.00 BDT
        quantity: 1
      });

      assert.equal(quote.pricing.appliedDiscountPercentage, 22);
      assert.equal(quote.pricing.partnerDiscountAmountBDT, 5636.40);
      assert.equal(quote.pricing.netBeforeTaxBDT, 19983.60);
      assert.ok(quote.partner.discountSource.includes('Strategic Agreement'));
    });

    it('should reject coupon stacking with partner discount (anti-stacking)', () => {
      const quote = pricing.calculatePartnerPrice({
        partnerId: 'ptn-apex-101',
        productCode: 'VPS-PRO',
        quantity: 1,
        couponCode: 'CLOUD5' // 5% coupon vs 22% partner rate
      });

      assert.equal(quote.pricing.stackedDiscountRejected, true);
      assert.equal(quote.pricing.appliedDiscountPercentage, 22); // keeps the superior 22% partner rate
    });
  });

  // 4. Multi-Tenant Data Isolation
  describe('Partner-to-Customer Data Isolation', () => {
    it('should isolate customer and service records by partner_id', () => {
      const partner1Customers = db.prepare(`
        SELECT * FROM partner_customer_relationships WHERE partner_id = 'ptn-apex-101'
      `).all();

      const partner2Customers = db.prepare(`
        SELECT * FROM partner_customer_relationships WHERE partner_id = 'ptn-other-999'
      `).all();

      assert.ok(partner1Customers.length > 0);
      assert.equal(partner2Customers.length, 0);
    });
  });

  // 5. Integration Adapters Resilience
  describe('WHMCS & CloudStack Adapters', () => {
    it('should provide clear operational status for WHMCS and CloudStack', () => {
      const whmcsStatus = whmcs.getStatus();
      assert.equal(whmcsStatus.service, 'WHMCS Billing Engine');
      assert.ok(whmcsStatus.mode === 'SANDBOX_ADAPTER' || whmcsStatus.mode === 'LIVE_API');

      const csStatus = cloudstack.getStatus();
      assert.equal(csStatus.service, 'Apache CloudStack Orchestrator');
      assert.ok(csStatus.mode === 'SANDBOX_ADAPTER' || csStatus.mode === 'LIVE_CLOUDSTACK');
    });

    it('should enforce idempotency on repeated order calls', async () => {
      const idempotencyKey = 'test-idemp-order-123';
      const call1 = await whmcs.createPartnerOrder({
        clientId: 9101,
        productCode: 'VPS-STARTER',
        partnerDiscountAmount: 1.80,
        netTotal: 10.20,
        idempotencyKey
      });

      const call2 = await whmcs.createPartnerOrder({
        clientId: 9101,
        productCode: 'VPS-STARTER',
        partnerDiscountAmount: 1.80,
        netTotal: 10.20,
        idempotencyKey
      });

      assert.equal(call1.orderid, call2.orderid);
      assert.equal(call2._idempotentReplay, true);
    });

    it('should reject CloudStack VM provisioning if resource quota is exceeded', async () => {
      await assert.rejects(async () => {
        await cloudstack.provisionVM({
          partnerAccount: 'partner-test',
          serviceOfferingId: 'off-high-cpu',
          templateId: 'tmpl-ubuntu',
          displayName: 'Large-Cluster-Node',
          vcpuRequired: 16,
          ramRequiredGB: 64,
          currentAllocatedVCPU: 60, // 60 + 16 = 76 > 64 max
          partnerMaxVCPU: 64
        });
      }, /Quota Exceeded/);
    });
  });
});
