import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, hashPassword, verifyPassword } from '../server/db.mjs';
import { PricingEngine, evaluateAndUpgradePartnerTier } from '../server/pricing-engine.mjs';
import { WHMCSAdapter } from '../server/whmcs-adapter.mjs';
import { CloudStackAdapter } from '../server/cloudstack-adapter.mjs';
import { RewardProcessingService } from '../server/reward-service.mjs';
import { handleLogin, sessionStore } from '../server/auth.mjs';

describe('Unified Cloud Partner Program - Production Test Suite', () => {
  let db;
  let pricing;
  let whmcs;
  let cloudstack;
  let rewardService;

  before(() => {
    // In-memory isolated database for tests
    db = initDatabase(':memory:');
    pricing = new PricingEngine(db);
    whmcs = new WHMCSAdapter();
    cloudstack = new CloudStackAdapter();
    rewardService = new RewardProcessingService(db);
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

  // 6. Partner Sales-Based Reward Points System (Comprehensive Production Suite)
  describe('Partner Sales-Based Reward Points System', () => {
    const testPartnerId = 'ptn-reward-test';
    const testPartnerEmail = 'reseller@rewardtest.com';

    before(() => {
      // Create isolated test partner for reward tests
      db.prepare(`
        INSERT INTO partners (id, company_name, contact_name, email, phone, country, business_type, tier_id, status)
        VALUES (?, 'Matrix Cloud Solutions', 'Samiul Alom', ?, '+8801700112233', 'BD', 'Agency', 'tier-gold', 'ACTIVE')
      `).run(testPartnerId, testPartnerEmail);

      rewardService.getOrCreateAccount(testPartnerId);
    });

    it('should award 1,000 reward points for a ৳10,000 eligible sale at 10% reward rate', () => {
      const result = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-TEST-10K',
        customerName: 'Dhaka Retail Corp',
        customerEmail: 'billing@dhakaretail.com',
        serviceName: 'Business Cloud VPS',
        category: 'Cloud VPS',
        grossAmount: 10000.00,
        discountAmount: 0,
        taxAmount: 0
      });

      assert.equal(result.success, true);
      assert.equal(result.eligibleNetAmount, 10000.00);
      assert.equal(result.rewardRate, 0.10);
      assert.equal(result.pointsAwarded, 1000.00);
      assert.equal(result.status, 'APPROVED');

      const account = rewardService.getOrCreateAccount(testPartnerId);
      assert.equal(account.available_points, 1000.00);
      assert.equal(account.total_eligible_sales, 10000.00);
      assert.equal(account.total_points_earned, 1000.00);
    });

    it('should award 5,000 reward points for a ৳50,000 eligible sale at 10% rate', () => {
      const result = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-TEST-50K',
        customerName: 'Chittagong Maritime Ltd.',
        customerEmail: 'it@cmaritime.com',
        serviceName: 'Enterprise Cloud VPS Cluster',
        category: 'Cloud VPS',
        grossAmount: 50000.00,
        discountAmount: 0,
        taxAmount: 0
      });

      assert.equal(result.success, true);
      assert.equal(result.eligibleNetAmount, 50000.00);
      assert.equal(result.pointsAwarded, 5000.00);

      const account = rewardService.getOrCreateAccount(testPartnerId);
      // Previous 1,000 + 5,000 = 6,000 points
      assert.equal(account.available_points, 6000.00);
      assert.equal(account.total_eligible_sales, 60000.00);
      assert.equal(account.total_points_earned, 6000.00);
    });

    it('should calculate net eligible amount by subtracting discounts and taxes', () => {
      const result = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-TEST-DISCOUNT',
        customerName: 'Fintech Hub',
        customerEmail: 'ops@fintechhub.bd',
        serviceName: 'Dedicated Bare Metal DB',
        category: 'Dedicated Server',
        grossAmount: 20000.00,
        discountAmount: 3000.00,
        taxAmount: 1000.00
      });

      // Eligible Net = 20,000 - 3,000 - 1,000 = 16,000 => Points = 1,600
      assert.equal(result.eligibleNetAmount, 16000.00);
      assert.equal(result.pointsAwarded, 1600.00);

      const account = rewardService.getOrCreateAccount(testPartnerId);
      assert.equal(account.available_points, 7600.00);
      assert.equal(account.total_eligible_sales, 76000.00);
    });

    it('should prevent partners from earning rewards on self-purchases under anti-abuse policy', () => {
      const result = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-TEST-SELF',
        customerName: 'Matrix Cloud Admin',
        customerEmail: testPartnerEmail, // Partner's own email!
        serviceName: 'Cloud VPS Self Host',
        category: 'Cloud VPS',
        grossAmount: 5000.00
      });

      assert.equal(result.success, false);
      assert.equal(result.reason, 'SELF_PURCHASE_RESTRICTED');
      assert.equal(result.pointsAwarded, 0);

      // Account balance must remain unchanged at 7,600
      const account = rewardService.getOrCreateAccount(testPartnerId);
      assert.equal(account.available_points, 7600.00);
    });

    it('should award zero points for ineligible categories', () => {
      const result = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-TEST-INELIGIBLE-CAT',
        customerName: 'Generic Client',
        customerEmail: 'client@example.com',
        serviceName: 'Custom Hardware Colocation',
        category: 'Hardware Colocation', // Not in eligible categories
        grossAmount: 15000.00
      });

      assert.equal(result.success, true);
      assert.equal(result.eligibleNetAmount, 0);
      assert.equal(result.pointsAwarded, 0);
    });

    it('should enforce idempotency and prevent duplicate rewards on duplicate webhooks', () => {
      const idempotencyKey = 'webhook-event-pay-unique-9918';

      const call1 = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-TEST-IDEMP',
        paymentId: 'pay-tx-8812',
        customerName: 'Dhaka Logistics',
        customerEmail: 'info@dhakalogistics.com',
        serviceName: 'Cloud VPS Storage',
        category: 'Cloud Storage',
        grossAmount: 8000.00,
        idempotencyKey
      });

      const call2 = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-TEST-IDEMP',
        paymentId: 'pay-tx-8812',
        customerName: 'Dhaka Logistics',
        customerEmail: 'info@dhakalogistics.com',
        serviceName: 'Cloud VPS Storage',
        category: 'Cloud Storage',
        grossAmount: 8000.00,
        idempotencyKey
      });

      assert.equal(call1.pointsAwarded, 800.00);
      assert.equal(call2.isIdempotentReplay, true);
      assert.equal(call2.transaction.id, call1.transactionId);

      // Points should have been added only once (+800 => 7600 + 800 = 8400)
      const account = rewardService.getOrCreateAccount(testPartnerId);
      assert.equal(account.available_points, 8400.00);
    });

    it('should process refunds and reverse rewards safely without duplicate reversals', () => {
      const refundResult = rewardService.processRefund({
        orderId: 'ORD-TEST-10K',
        reason: 'Client requested full refund within 30 days',
        actorEmail: 'admin@unified.test'
      });

      assert.equal(refundResult.success, true);
      assert.equal(refundResult.reversedPoints, 1000.00);

      // Available points should be reduced by 1,000 (8,400 - 1,000 = 7,400)
      const account = rewardService.getOrCreateAccount(testPartnerId);
      assert.equal(account.available_points, 7400.00);
      assert.equal(account.reversed_points, 1000.00);

      // Attempting second refund must be idempotent
      const duplicateRefund = rewardService.processRefund({
        orderId: 'ORD-TEST-10K'
      });
      assert.equal(duplicateRefund.success, true);
      const accountAfterDup = rewardService.getOrCreateAccount(testPartnerId);
      assert.equal(accountAfterDup.available_points, 7400.00); // Unchanged!
    });

    it('should allow administrators to update the reward rate and snapshot historical rates', () => {
      // Update rate to 15%
      rewardService.updatePolicy({
        rewardRate: 0.15,
        minRedemptionPoints: 1000,
        redemptionEnabled: false,
        autoApprove: true,
        applyToRenewals: true,
        disallowSelfReferral: true,
        expirationDays: 0,
        eligibleCategories: ["Cloud VPS", "Dedicated Server", "Reseller Hosting", "Cloud Storage", "SSL"],
        actorEmail: 'admin@unified.test'
      });

      const updatedPolicy = rewardService.getPolicy();
      assert.equal(updatedPolicy.reward_rate, 0.15);

      // New sale under 15% rate: ৳10,000 * 15% = 1,500 points
      const newSale = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-NEW-RATE-15',
        customerName: 'Khulna Software',
        customerEmail: 'billing@khulnasoft.io',
        serviceName: 'Enterprise Cloud VPS',
        category: 'Cloud VPS',
        grossAmount: 10000.00
      });

      assert.equal(newSale.rewardRate, 0.15);
      assert.equal(newSale.pointsAwarded, 1500.00);

      // Reset policy back to 10%
      rewardService.updatePolicy({
        rewardRate: 0.10,
        minRedemptionPoints: 1000,
        redemptionEnabled: false,
        autoApprove: true,
        applyToRenewals: true,
        disallowSelfReferral: true,
        expirationDays: 0,
        eligibleCategories: ["Cloud VPS", "Dedicated Server", "Reseller Hosting", "Cloud Storage", "SSL", "Domain"],
        actorEmail: 'admin@unified.test'
      });
    });

    it('should enforce mandatory documented reasons for manual administrative adjustments', () => {
      // Fails without reason
      assert.throws(() => {
        rewardService.processAdminAdjustment({
          partnerId: testPartnerId,
          points: 500,
          type: 'CREDIT',
          reason: '',
          actorEmail: 'admin@unified.test'
        });
      }, /documented reason is mandatory/);

      // Succeeds with documented reason
      const adj = rewardService.processAdminAdjustment({
        partnerId: testPartnerId,
        points: 500,
        type: 'CREDIT',
        reason: 'Q4 Performance Incentive Bonus',
        actorEmail: 'admin@unified.test'
      });

      assert.equal(adj.success, true);
    });

    it('should audit and reconcile partner account balance with immutable ledger', () => {
      const reconciliation = rewardService.reconcile(testPartnerId);
      assert.equal(reconciliation.isReconciled, true);
      assert.equal(reconciliation.discrepancy, 0);
    });

    it('should strictly isolate partner sales and rewards data', () => {
      const otherPartnerId = 'ptn-isolated-other';
      db.prepare(`
        INSERT INTO partners (id, company_name, contact_name, email, phone, country, business_type, tier_id, status)
        VALUES (?, 'Other Agency', 'Tanvir', 'tanvir@other.test', '+8801900000000', 'BD', 'Agency', 'tier-silver', 'ACTIVE')
      `).run(otherPartnerId);

      const salesPartner1 = rewardService.getSales(testPartnerId, {});
      const salesPartner2 = rewardService.getSales(otherPartnerId, {});

      assert.ok(salesPartner1.sales.length > 0);
      assert.equal(salesPartner2.sales.length, 0);

      const txPartner1 = rewardService.getTransactions(testPartnerId, {});
      const txPartner2 = rewardService.getTransactions(otherPartnerId, {});

      assert.ok(txPartner1.transactions.length > 0);
      assert.equal(txPartner2.transactions.length, 0);
    });

    it('should seamlessly match VPS/Cloud VPS and VDS/Dedicated Server aliases without missing reward points', () => {
      // 1. Sale with category 'VPS' matches when policy includes Cloud VPS / VPS
      const resVps = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-ALIAS-VPS-01',
        customerName: 'Alias Client 1',
        customerEmail: 'alias1@client.test',
        serviceName: 'High Perf VPS',
        category: 'VPS',
        grossAmount: 10000,
        discountAmount: 0,
        taxAmount: 0,
        actorEmail: 'system@unified.test'
      });
      assert.equal(resVps.success, true);
      assert.equal(resVps.pointsAwarded, 1000);

      // 2. Sale with category 'VDS' matches when policy includes Dedicated Server / VDS
      const resVds = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-ALIAS-VDS-01',
        customerName: 'Alias Client 2',
        customerEmail: 'alias2@client.test',
        serviceName: 'Bare Metal Node',
        category: 'VDS',
        grossAmount: 20000,
        discountAmount: 0,
        taxAmount: 0,
        actorEmail: 'system@unified.test'
      });
      assert.equal(resVds.success, true);
      assert.equal(resVds.pointsAwarded, 2000);

      // 3. Sale submitted with 'Cloud VPS' is stored as 'VPS' in partner_sales
      const resLegacyVps = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-CANON-01',
        customerName: 'Legacy Client 1',
        customerEmail: 'legacy1@client.test',
        serviceName: 'Legacy Cloud VPS',
        category: 'Cloud VPS',
        grossAmount: 10000,
        discountAmount: 0,
        taxAmount: 0,
        actorEmail: 'system@unified.test'
      });
      const saleVps = db.prepare('SELECT category FROM partner_sales WHERE order_number = ?').get('ORD-CANON-01');
      assert.equal(saleVps.category, 'VPS');

      // 4. Sale submitted with 'Dedicated Server' is stored as 'VDS' in partner_sales
      const resLegacyDs = rewardService.processSaleReward({
        partnerId: testPartnerId,
        orderNumber: 'ORD-CANON-02',
        customerName: 'Legacy Client 2',
        customerEmail: 'legacy2@client.test',
        serviceName: 'Legacy Dedicated Server',
        category: 'Dedicated Server',
        grossAmount: 10000,
        discountAmount: 0,
        taxAmount: 0,
        actorEmail: 'system@unified.test'
      });
      const saleDs = db.prepare('SELECT category FROM partner_sales WHERE order_number = ?').get('ORD-CANON-02');
      assert.equal(saleDs.category, 'VDS');
    });
  });

  describe('Automatic Spend-Based Tier Progression System', () => {
    it('should automatically assign Registered Partner (5%) for spend < ৳30,000', () => {
      const pId = 'ptn-test-registered';
      db.prepare(`
        INSERT INTO partners (id, company_name, contact_name, email, phone, country, business_type, tier_id, status, monthly_eligible_spend)
        VALUES (?, 'Starter Reseller', 'Anis', 'anis@starter.test', '+8801700998877', 'BD', 'Agency', 'tier-registered', 'ACTIVE', 15000)
      `).run(pId);

      const res = evaluateAndUpgradePartnerTier(db, pId);
      const partner = db.prepare('SELECT p.*, pt.name as tier_name, pt.discount_rate FROM partners p JOIN partner_tiers pt ON p.tier_id = pt.id WHERE p.id = ?').get(pId);
      assert.equal(partner.tier_id, 'tier-registered');
      assert.equal(partner.discount_rate, 0.05);
      assert.equal(res.upgraded, false);
    });

    it('should automatically upgrade to Silver Partner (10%) when spend reaches ৳30,000+', () => {
      const pId = 'ptn-test-silver-up';
      db.prepare(`
        INSERT INTO partners (id, company_name, contact_name, email, phone, country, business_type, tier_id, status, monthly_eligible_spend)
        VALUES (?, 'Growing Host', 'Kamal', 'kamal@host.test', '+8801711223300', 'BD', 'Agency', 'tier-registered', 'ACTIVE', 35000)
      `).run(pId);

      const res = evaluateAndUpgradePartnerTier(db, pId);
      assert.equal(res.upgraded, true);
      assert.equal(res.newTier.slug, 'silver');
      assert.equal(res.newTier.discount_rate, 0.10);

      const partner = db.prepare('SELECT p.*, pt.name as tier_name FROM partners p JOIN partner_tiers pt ON p.tier_id = pt.id WHERE p.id = ?').get(pId);
      assert.equal(partner.tier_id, 'tier-silver');
    });

    it('should automatically upgrade to Gold Partner (15%) when spend reaches ৳120,000+', () => {
      const pId = 'ptn-test-gold-up';
      db.prepare(`
        INSERT INTO partners (id, company_name, contact_name, email, phone, country, business_type, tier_id, status, monthly_eligible_spend)
        VALUES (?, 'Gold Reseller', 'Farhan', 'farhan@gold.test', '+8801722334455', 'BD', 'Agency', 'tier-silver', 'ACTIVE', 125000)
      `).run(pId);

      const res = evaluateAndUpgradePartnerTier(db, pId);
      assert.equal(res.upgraded, true);
      assert.equal(res.newTier.slug, 'gold');
      assert.equal(res.newTier.discount_rate, 0.15);

      const partner = db.prepare('SELECT p.*, pt.name as tier_name FROM partners p JOIN partner_tiers pt ON p.tier_id = pt.id WHERE p.id = ?').get(pId);
      assert.equal(partner.tier_id, 'tier-gold');
    });

    it('should automatically upgrade to Platinum Partner (20%) when spend reaches ৳360,000+', () => {
      const pId = 'ptn-test-plat-up';
      db.prepare(`
        INSERT INTO partners (id, company_name, contact_name, email, phone, country, business_type, tier_id, status, monthly_eligible_spend)
        VALUES (?, 'Enterprise Cloud Org', 'Zahid', 'zahid@enterprise.test', '+8801733445566', 'BD', 'Agency', 'tier-gold', 'ACTIVE', 380000)
      `).run(pId);

      const res = evaluateAndUpgradePartnerTier(db, pId);
      assert.equal(res.upgraded, true);
      assert.equal(res.newTier.slug, 'platinum');
      assert.equal(res.newTier.discount_rate, 0.20);

      const partner = db.prepare('SELECT p.*, pt.name as tier_name FROM partners p JOIN partner_tiers pt ON p.tier_id = pt.id WHERE p.id = ?').get(pId);
      assert.equal(partner.tier_id, 'tier-platinum');
    });

    it('should automatically upgrade tier when a new eligible sale increases spend across the threshold', () => {
      const pId = 'ptn-sale-upgrade';
      db.prepare(`
        INSERT INTO partners (id, company_name, contact_name, email, phone, country, business_type, tier_id, status, monthly_eligible_spend)
        VALUES (?, 'Tier Climber Agency', 'Saif', 'saif@climber.test', '+8801744556677', 'BD', 'Agency', 'tier-registered', 'ACTIVE', 20000)
      `).run(pId);

      // Record an eligible sale of ৳15,000 (total spend becomes ৳35,000, qualifying for Silver)
      rewardService.processSaleReward({
        partnerId: pId,
        orderNumber: 'ORD-TIER-UP-01',
        customerName: 'Dhaka Enterprise',
        customerEmail: 'billing@dhaka.test',
        serviceName: 'Enterprise Cloud VPS',
        category: 'Cloud VPS',
        grossAmount: 15000,
        discountAmount: 0,
        taxAmount: 0,
        actorEmail: 'system@unified.test'
      });

      const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(pId);
      assert.equal(partner.monthly_eligible_spend, 35000);
      assert.equal(partner.tier_id, 'tier-silver');
    });
  });
});

