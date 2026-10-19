import crypto from 'node:crypto';
import { evaluateAndUpgradePartnerTier } from './pricing-engine.mjs';

/**
 * Normalizes service categories to canonical keys so synonyms match reliably.
 * Examples: 'VPS' <=> 'Cloud VPS', 'VDS' <=> 'Dedicated Server'
 */
export function normalizeServiceCategory(cat) {
  const c = String(cat || '').toLowerCase().trim().replace(/[-_]/g, ' ');
  if (c === 'vps' || c === 'cloud vps' || c === 'virtual private server' || c === 'cloud virtual private server') {
    return 'vps';
  }
  if (c === 'vds' || c === 'dedicated server' || c === 'dedicated' || c === 'virtual dedicated server' || c === 'bare metal') {
    return 'vds';
  }
  if (c === 'reseller hosting' || c === 'reseller cpanel hosting' || c === 'reseller') {
    return 'reseller';
  }
  if (c === 'cloud storage' || c === 'object storage' || c === 'storage') {
    return 'storage';
  }
  if (c === 'web hosting' || c === 'cpanel hosting' || c === 'shared hosting' || c === 'hosting') {
    return 'hosting';
  }
  return c;
}

/**
 * Returns canonical category name for sales and transactions.
 * Enforces 'VPS' instead of 'Cloud VPS' and 'VDS' instead of 'Dedicated Server'.
 */
export function canonicalCategory(cat) {
  const norm = normalizeServiceCategory(cat);
  if (norm === 'vps') return 'VPS';
  if (norm === 'vds') return 'VDS';
  return cat;
}

/**
 * RewardProcessingService
 * Handles financial-grade partner reward points calculation, ledgering, idempotency,
 * refund reversals, and administrator policy enforcement.
 *
 * Formula: Reward Points = Eligible Net Sale Amount × Configured Reward Rate (Default: 10%)
 * Rounding: Decimal-safe to 2 decimal places.
 */
export class RewardProcessingService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Fetches active reward policy or initializes default
   */
  getPolicy() {
    let policy = this.db.prepare('SELECT * FROM partner_reward_policies WHERE id = ?').get('default');
    if (!policy) {
      this.db.prepare(`
        INSERT INTO partner_reward_policies (
          id, reward_rate, points_per_bdt, min_redemption_points, redemption_enabled,
          redemption_conversion_rate, auto_approve, apply_to_renewals, disallow_self_referral,
          expiration_days, eligible_categories, updated_at, updated_by
        ) VALUES (
          'default', 0.10, 1.0, 1000, 0, 0.10, 1, 1, 1, 0,
          '["VPS","VDS","Reseller Hosting","Cloud Storage","Web Hosting","SSL","Domain"]',
          datetime('now'), 'system'
        )
      `).run();
      policy = this.db.prepare('SELECT * FROM partner_reward_policies WHERE id = ?').get('default');
    }

    try {
      policy.eligible_categories = JSON.parse(policy.eligible_categories);
    } catch {
      policy.eligible_categories = ["VPS","VDS","Reseller Hosting","Cloud Storage","Web Hosting","SSL","Domain"];
    }

    return policy;
  }

  /**
   * Updates reward policy (Admin only)
   */
  updatePolicy({ rewardRate, minRedemptionPoints, redemptionEnabled, autoApprove, applyToRenewals, disallowSelfReferral, expirationDays, eligibleCategories, actorEmail }) {
    const rate = Number(rewardRate);
    if (isNaN(rate) || rate < 0 || rate > 1.0) {
      throw new Error('Reward rate must be between 0.0 (0%) and 1.0 (100%).');
    }

    const categoriesJson = Array.isArray(eligibleCategories)
      ? JSON.stringify(eligibleCategories)
      : (typeof eligibleCategories === 'string' ? eligibleCategories : '["VPS","VDS","Reseller Hosting","Cloud Storage","Web Hosting","SSL","Domain"]');

    this.db.prepare(`
      UPDATE partner_reward_policies
      SET reward_rate = ?,
          min_redemption_points = ?,
          redemption_enabled = ?,
          auto_approve = ?,
          apply_to_renewals = ?,
          disallow_self_referral = ?,
          expiration_days = ?,
          eligible_categories = ?,
          updated_at = datetime('now'),
          updated_by = ?
      WHERE id = 'default'
    `).run(
      rate,
      Number(minRedemptionPoints) || 1000,
      redemptionEnabled ? 1 : 0,
      autoApprove ? 1 : 0,
      applyToRenewals ? 1 : 0,
      disallowSelfReferral ? 1 : 0,
      Number(expirationDays) || 0,
      categoriesJson,
      actorEmail || 'admin'
    );

    return this.getPolicy();
  }

  /**
   * Retrieves or initializes partner reward account
   */
  getOrCreateAccount(partnerId) {
    let account = this.db.prepare('SELECT * FROM partner_reward_accounts WHERE partner_id = ?').get(partnerId);
    if (!account) {
      const id = 'racc-' + crypto.randomBytes(6).toString('hex');
      this.db.prepare(`
        INSERT INTO partner_reward_accounts (
          id, partner_id, total_eligible_sales, total_points_earned,
          available_points, pending_points, redeemed_points, reversed_points, expired_points
        ) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)
      `).run(id, partnerId);
      account = this.db.prepare('SELECT * FROM partner_reward_accounts WHERE partner_id = ?').get(partnerId);
    }
    return account;
  }

  /**
   * Processes an incoming sale and awards reward points
   */
  processSaleReward({
    partnerId,
    orderNumber,
    paymentId,
    customerId = null,
    customerName,
    customerEmail,
    serviceName,
    category = 'VPS',
    productCode = 'GEN-CLOUD',
    grossAmount,
    discountAmount = 0,
    taxAmount = 0,
    isSelfPurchase = false,
    isRecurring = 0,
    billingCycle = 'monthly',
    idempotencyKey = null,
    actorEmail = 'system'
  }) {
    if (!partnerId) throw new Error('Partner ID is required for reward processing.');
    if (!orderNumber) throw new Error('Order number is required.');

    const partner = this.db.prepare('SELECT * FROM partners WHERE id = ?').get(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    const policy = this.getPolicy();
    const effectiveIdempotency = idempotencyKey || `sale-${orderNumber}-${paymentId || 'def'}`;
    const savedCategory = canonicalCategory(category || 'VPS');

    // 1. Idempotency Check: prevent duplicate rewards for same payment event
    const existingTx = this.db.prepare(`
      SELECT * FROM partner_reward_transactions WHERE idempotency_key = ?
    `).get(effectiveIdempotency);

    if (existingTx) {
      return {
        success: true,
        isIdempotentReplay: true,
        transaction: existingTx,
        account: this.getOrCreateAccount(partnerId)
      };
    }

    // 2. Anti-Abuse Self-Referral Check
    const isSelf = isSelfPurchase || (customerEmail && customerEmail.toLowerCase() === partner.email.toLowerCase());
    if (isSelf && policy.disallow_self_referral) {
      // Record sale but award 0 points due to policy restriction
      const saleId = 'sal-' + crypto.randomBytes(6).toString('hex');
      this.db.prepare(`
        INSERT INTO partner_sales (
          id, order_number, partner_id, customer_id, customer_name, customer_email,
          service_name, category, product_code, gross_amount, discount_amount, tax_amount,
          eligible_net_amount, currency, payment_status, payment_id, is_recurring, billing_cycle,
          is_self_purchase
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BDT', 'PAID', ?, ?, ?, 1)
      `).run(
        saleId, orderNumber, partnerId, customerId, customerName, customerEmail,
        serviceName, savedCategory, productCode, grossAmount, discountAmount, taxAmount,
        0, paymentId || null, isRecurring ? 1 : 0, billingCycle
      );

      return {
        success: false,
        reason: 'SELF_PURCHASE_RESTRICTED',
        message: 'Anti-abuse policy prohibits partners from receiving rewards for self-purchases.',
        pointsAwarded: 0
      };
    }

    // 3. Category Eligibility Check (supports exact matches & synonyms like Cloud VPS/VPS, Dedicated Server/VDS)
    const normInput = normalizeServiceCategory(category);
    const isCategoryEligible = Array.isArray(policy.eligible_categories) && policy.eligible_categories.some(c => {
      const cleanConfig = String(c || '').toLowerCase().trim();
      const cleanInput = String(category || '').toLowerCase().trim();
      return cleanConfig === cleanInput || normalizeServiceCategory(c) === normInput;
    });

    // Calculate eligible net sale amount (Gross - Discounts - Taxes)
    const gross = Number(grossAmount) || 0;
    const discount = Number(discountAmount) || 0;
    const tax = Number(taxAmount) || 0;
    const calculatedEligible = Math.max(0, gross - discount - tax);
    const eligibleNetAmount = isCategoryEligible ? calculatedEligible : 0;

    // 4. Calculate Points using snapshot rate
    const currentRate = policy.reward_rate;
    // Decimal-safe rounding: nearest hundredth
    const pointsAwarded = Math.round(eligibleNetAmount * currentRate * 100) / 100;

    const status = policy.auto_approve ? 'APPROVED' : 'PENDING';
    const saleId = 'sal-' + crypto.randomBytes(6).toString('hex');
    const txId = 'rtx-' + crypto.randomBytes(6).toString('hex');

    // Atomic Database Execution
    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.getOrCreateAccount(partnerId);

      // Insert Sale Record
      this.db.prepare(`
        INSERT INTO partner_sales (
          id, order_number, partner_id, customer_id, customer_name, customer_email,
          service_name, category, product_code, gross_amount, discount_amount, tax_amount,
          eligible_net_amount, currency, payment_status, payment_id, is_recurring, billing_cycle,
          is_self_purchase
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BDT', 'PAID', ?, ?, ?, 0)
      `).run(
        saleId, orderNumber, partnerId, customerId, customerName, customerEmail,
        serviceName, savedCategory, productCode, gross, discount, tax,
        eligibleNetAmount, paymentId || null, isRecurring ? 1 : 0, billingCycle
      );

      // Insert Reward Transaction with snapshot rate
      this.db.prepare(`
        INSERT INTO partner_reward_transactions (
          id, partner_id, order_id, payment_id, transaction_type, eligible_sale_amount,
          reward_rate, points, status, idempotency_key, description, metadata_json,
          processed_by
        ) VALUES (?, ?, ?, ?, 'SALE_REWARD', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId, partnerId, saleId, paymentId || null,
        eligibleNetAmount, currentRate, pointsAwarded, status,
        effectiveIdempotency,
        `10% Reward for Order ${orderNumber} - ${serviceName}`,
        JSON.stringify({ gross, discount, tax, category, isRecurring }),
        actorEmail
      );

      // Update Partner Reward Account
      if (status === 'APPROVED') {
        this.db.prepare(`
          UPDATE partner_reward_accounts
          SET total_eligible_sales = ROUND(total_eligible_sales + ?, 2),
              total_points_earned = ROUND(total_points_earned + ?, 2),
              available_points = ROUND(available_points + ?, 2),
              updated_at = datetime('now')
          WHERE partner_id = ?
        `).run(eligibleNetAmount, pointsAwarded, pointsAwarded, partnerId);
      } else {
        this.db.prepare(`
          UPDATE partner_reward_accounts
          SET pending_points = ROUND(pending_points + ?, 2),
              updated_at = datetime('now')
          WHERE partner_id = ?
        `).run(pointsAwarded, partnerId);
      }

      // Increment partner's monthly eligible spend in BDT and automatically evaluate tier progression
      if (eligibleNetAmount > 0) {
        this.db.prepare(`
          UPDATE partners
          SET monthly_eligible_spend = ROUND(monthly_eligible_spend + ?, 2),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(eligibleNetAmount, partnerId);

        evaluateAndUpgradePartnerTier(this.db, partnerId);
      }

      this.db.exec('COMMIT;');

      return {
        success: true,
        saleId,
        transactionId: txId,
        eligibleNetAmount,
        rewardRate: currentRate,
        pointsAwarded,
        status,
        account: this.getOrCreateAccount(partnerId)
      };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Processes a refund or chargeback, reversing previously awarded rewards
   */
  processRefund({ orderId, reason = 'Customer refund or cancellation', actorEmail = 'system' }) {
    if (!orderId) throw new Error('Order ID is required to process reward reversal.');

    const sale = this.db.prepare('SELECT * FROM partner_sales WHERE id = ? OR order_number = ?').get(orderId, orderId);
    if (!sale) throw new Error(`Sale not found: ${orderId}`);

    if (sale.payment_status === 'REFUNDED') {
      return { success: true, message: 'Sale has already been refunded and reversed.' };
    }

    const originalTx = this.db.prepare(`
      SELECT * FROM partner_reward_transactions
      WHERE order_id = ? AND transaction_type = 'SALE_REWARD' AND status != 'REVERSED'
    `).get(sale.id);

    if (!originalTx) {
      this.db.prepare(`UPDATE partner_sales SET payment_status = 'REFUNDED' WHERE id = ?`).run(sale.id);
      return { success: true, message: 'Sale marked as refunded; no active rewards were attached.' };
    }

    const partnerId = sale.partner_id;
    const pointsToReverse = originalTx.points;
    const reversalTxId = 'rev-' + crypto.randomBytes(6).toString('hex');
    const idempotencyKey = `refund-${sale.id}`;

    this.db.exec('BEGIN TRANSACTION;');
    try {
      // Mark sale refunded
      this.db.prepare(`UPDATE partner_sales SET payment_status = 'REFUNDED' WHERE id = ?`).run(sale.id);

      // Create Reversal Transaction
      this.db.prepare(`
        INSERT INTO partner_reward_transactions (
          id, partner_id, order_id, payment_id, transaction_type, eligible_sale_amount,
          reward_rate, points, status, idempotency_key, description, metadata_json,
          processed_by
        ) VALUES (?, ?, ?, ?, 'REWARD_REVERSAL', ?, ?, ?, 'APPROVED', ?, ?, ?, ?)
      `).run(
        reversalTxId, partnerId, sale.id, sale.payment_id,
        -sale.eligible_net_amount, originalTx.reward_rate, -pointsToReverse,
        idempotencyKey,
        `Reversal of rewards for refunded order ${sale.order_number}: ${reason}`,
        JSON.stringify({ originalTxId: originalTx.id, reason }),
        actorEmail
      );

      // Update original transaction note indicating reversal
      this.db.prepare(`
        UPDATE partner_reward_transactions
        SET description = description || ' [Refunded & Reversed]'
        WHERE id = ?
      `).run(originalTx.id);

      // Update Account Balances
      if (originalTx.status === 'APPROVED') {
        this.db.prepare(`
          UPDATE partner_reward_accounts
          SET available_points = MAX(0, ROUND(available_points - ?, 2)),
              reversed_points = ROUND(reversed_points + ?, 2),
              total_eligible_sales = MAX(0, ROUND(total_eligible_sales - ?, 2)),
              updated_at = datetime('now')
          WHERE partner_id = ?
        `).run(pointsToReverse, pointsToReverse, sale.eligible_net_amount, partnerId);
      } else if (originalTx.status === 'PENDING') {
        this.db.prepare(`
          UPDATE partner_reward_accounts
          SET pending_points = MAX(0, ROUND(pending_points - ?, 2)),
              reversed_points = ROUND(reversed_points + ?, 2),
              updated_at = datetime('now')
          WHERE partner_id = ?
        `).run(pointsToReverse, pointsToReverse, partnerId);
      }

      // Deduct from partner's monthly eligible spend in BDT and re-evaluate tier
      if (sale.eligible_net_amount > 0) {
        this.db.prepare(`
          UPDATE partners
          SET monthly_eligible_spend = MAX(0, ROUND(monthly_eligible_spend - ?, 2)),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(sale.eligible_net_amount, partnerId);

        evaluateAndUpgradePartnerTier(this.db, partnerId);
      }

      this.db.exec('COMMIT;');

      return {
        success: true,
        reversalTransactionId: reversalTxId,
        reversedPoints: pointsToReverse,
        account: this.getOrCreateAccount(partnerId)
      };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Approves a pending reward transaction (Admin action)
   */
  approvePendingReward(transactionId, actorEmail = 'admin') {
    const tx = this.db.prepare(`
      SELECT * FROM partner_reward_transactions WHERE id = ? AND status = 'PENDING'
    `).get(transactionId);

    if (!tx) throw new Error('Pending reward transaction not found or already processed.');

    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.db.prepare(`
        UPDATE partner_reward_transactions
        SET status = 'APPROVED', processed_by = ?, processed_at = datetime('now')
        WHERE id = ?
      `).run(actorEmail, transactionId);

      this.db.prepare(`
        UPDATE partner_reward_accounts
        SET pending_points = MAX(0, ROUND(pending_points - ?, 2)),
            available_points = ROUND(available_points + ?, 2),
            total_points_earned = ROUND(total_points_earned + ?, 2),
            total_eligible_sales = ROUND(total_eligible_sales + ?, 2),
            updated_at = datetime('now')
        WHERE partner_id = ?
      `).run(tx.points, tx.points, tx.points, tx.eligible_sale_amount, tx.partner_id);

      this.db.exec('COMMIT;');
      return { success: true, message: `Reward transaction ${transactionId} approved.` };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Rejects a pending reward transaction (Admin action)
   */
  rejectPendingReward(transactionId, reason = 'Rejected by administrator', actorEmail = 'admin') {
    const tx = this.db.prepare(`
      SELECT * FROM partner_reward_transactions WHERE id = ? AND status = 'PENDING'
    `).get(transactionId);

    if (!tx) throw new Error('Pending reward transaction not found.');

    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.db.prepare(`
        UPDATE partner_reward_transactions
        SET status = 'REJECTED', processed_by = ?, processed_at = datetime('now'),
            description = description || ' [Rejected: ' || ? || ']'
        WHERE id = ?
      `).run(actorEmail, reason, transactionId);

      this.db.prepare(`
        UPDATE partner_reward_accounts
        SET pending_points = MAX(0, ROUND(pending_points - ?, 2)),
            updated_at = datetime('now')
        WHERE partner_id = ?
      `).run(tx.points, tx.partner_id);

      this.db.exec('COMMIT;');
      return { success: true, message: `Reward transaction ${transactionId} rejected.` };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Manual administrative points adjustment with mandatory documented reason
   */
  processAdminAdjustment({ partnerId, points, type = 'CREDIT', reason, actorEmail }) {
    if (!reason || !reason.trim()) {
      throw new Error('A documented reason is mandatory for manual reward adjustments.');
    }

    const numPoints = Number(points);
    if (isNaN(numPoints) || numPoints <= 0) {
      throw new Error('Points value must be a positive number.');
    }

    const isCredit = type.toUpperCase() === 'CREDIT';
    const effectivePoints = isCredit ? numPoints : -numPoints;
    const txId = 'adj-' + crypto.randomBytes(6).toString('hex');

    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.getOrCreateAccount(partnerId);

      this.db.prepare(`
        INSERT INTO partner_reward_transactions (
          id, partner_id, transaction_type, eligible_sale_amount, reward_rate,
          points, status, description, processed_by
        ) VALUES (?, ?, 'ADMIN_ADJUSTMENT', 0, 0, ?, 'APPROVED', ?, ?)
      `).run(
        txId, partnerId, effectivePoints,
        `Manual ${type}: ${reason.trim()}`,
        actorEmail
      );

      if (isCredit) {
        this.db.prepare(`
          UPDATE partner_reward_accounts
          SET available_points = ROUND(available_points + ?, 2),
              total_points_earned = ROUND(total_points_earned + ?, 2),
              updated_at = datetime('now')
          WHERE partner_id = ?
        `).run(numPoints, numPoints, partnerId);
      } else {
        this.db.prepare(`
          UPDATE partner_reward_accounts
          SET available_points = MAX(0, ROUND(available_points - ?, 2)),
              updated_at = datetime('now')
          WHERE partner_id = ?
        `).run(numPoints, partnerId);
      }

      this.db.exec('COMMIT;');
      return { success: true, transactionId: txId, account: this.getOrCreateAccount(partnerId) };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Audits and reconciles partner account balance against immutable transaction ledger
   */
  reconcile(partnerId) {
    const account = this.getOrCreateAccount(partnerId);

    const approvedSum = this.db.prepare(`
      SELECT COALESCE(SUM(points), 0) as totalPoints
      FROM partner_reward_transactions
      WHERE partner_id = ? AND status = 'APPROVED'
    `).get(partnerId).totalPoints;

    const pendingSum = this.db.prepare(`
      SELECT COALESCE(SUM(points), 0) as totalPending
      FROM partner_reward_transactions
      WHERE partner_id = ? AND status = 'PENDING'
    `).get(partnerId).totalPending;

    const diff = Math.abs(account.available_points - approvedSum);
    const isReconciled = diff < 0.01;

    return {
      partnerId,
      accountBalance: account.available_points,
      ledgerSum: approvedSum,
      pendingBalance: account.pending_points,
      ledgerPendingSum: pendingSum,
      isReconciled,
      discrepancy: diff
    };
  }

  /**
   * Partner Reward Summary
   */
  getSummary(partnerId) {
    const account = this.getOrCreateAccount(partnerId);
    const policy = this.getPolicy();

    const txCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM partner_reward_transactions WHERE partner_id = ?
    `).get(partnerId).count;

    const salesCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM partner_sales WHERE partner_id = ?
    `).get(partnerId).count;

    return {
      partnerId,
      totalEligibleSales: account.total_eligible_sales,
      totalPointsEarned: account.total_points_earned,
      availablePoints: account.available_points,
      pendingPoints: account.pending_points,
      redeemedPoints: account.redeemed_points,
      reversedPoints: account.reversed_points,
      expiredPoints: account.expired_points,
      rewardRate: policy.reward_rate,
      rewardRatePercent: (policy.reward_rate * 100).toFixed(1) + '%',
      pointsPerBdt: policy.points_per_bdt,
      redemptionEnabled: Boolean(policy.redemption_enabled),
      minRedemptionPoints: policy.min_redemption_points,
      transactionCount: txCount,
      salesCount
    };
  }

  /**
   * Paginated & filtered list of reward transactions
   */
  getTransactions(partnerId, { status = null, search = '', limit = 20, offset = 0, sort = 'desc' }) {
    let sql = `
      SELECT t.*, s.order_number, s.customer_name, s.customer_email, s.service_name, s.category
      FROM partner_reward_transactions t
      LEFT JOIN partner_sales s ON t.order_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (partnerId) {
      sql += ' AND t.partner_id = ?';
      params.push(partnerId);
    }

    if (status && status !== 'ALL') {
      sql += ' AND t.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ' AND (t.id LIKE ? OR s.order_number LIKE ? OR s.customer_name LIKE ? OR s.service_name LIKE ? OR t.description LIKE ?)';
      params.push(q, q, q, q, q);
    }

    const orderDir = sort.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY t.created_at ${orderDir} LIMIT ? OFFSET ?`;
    params.push(Number(limit) || 20, Number(offset) || 0);

    const transactions = this.db.prepare(sql).all(...params);

    // Total count query for pagination
    let countSql = `
      SELECT COUNT(*) as total
      FROM partner_reward_transactions t
      LEFT JOIN partner_sales s ON t.order_id = s.id
      WHERE 1=1
    `;
    const countParams = [];
    if (partnerId) {
      countSql += ' AND t.partner_id = ?';
      countParams.push(partnerId);
    }
    if (status && status !== 'ALL') {
      countSql += ' AND t.status = ?';
      countParams.push(status);
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      countSql += ' AND (t.id LIKE ? OR s.order_number LIKE ? OR s.customer_name LIKE ? OR s.service_name LIKE ? OR t.description LIKE ?)';
      countParams.push(q, q, q, q, q);
    }

    const total = this.db.prepare(countSql).get(...countParams).total;

    return {
      transactions,
      pagination: {
        total,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
        hasMore: (Number(offset) + transactions.length) < total
      }
    };
  }

  /**
   * Paginated list of partner sales
   */
  getSales(partnerId, { search = '', limit = 20, offset = 0, sort = 'desc' }) {
    let sql = `
      SELECT s.*, t.id as transaction_id, t.points as points_earned, t.status as reward_status, t.reward_rate
      FROM partner_sales s
      LEFT JOIN partner_reward_transactions t ON s.id = t.order_id AND t.transaction_type = 'SALE_REWARD'
      WHERE s.partner_id = ?
    `;
    const params = [partnerId];

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ' AND (s.order_number LIKE ? OR s.customer_name LIKE ? OR s.service_name LIKE ? OR s.product_code LIKE ?)';
      params.push(q, q, q, q);
    }

    const orderDir = sort.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY s.created_at ${orderDir} LIMIT ? OFFSET ?`;
    params.push(Number(limit) || 20, Number(offset) || 0);

    const sales = this.db.prepare(sql).all(...params);

    let countSql = `SELECT COUNT(*) as total FROM partner_sales WHERE partner_id = ?`;
    const countParams = [partnerId];
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      countSql += ' AND (order_number LIKE ? OR customer_name LIKE ? OR service_name LIKE ? OR product_code LIKE ?)';
      countParams.push(q, q, q, q);
    }

    const total = this.db.prepare(countSql).get(...countParams).total;

    return {
      sales,
      pagination: {
        total,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
        hasMore: (Number(offset) + sales.length) < total
      }
    };
  }
}
