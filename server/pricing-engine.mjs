import crypto from 'node:crypto';

/**
 * Production Centralized Partner Pricing and Discount Engine
 * Single trusted source for partner discounts, product exclusions,
 * anti-stacking policies, and audit logging.
 */
export class PricingEngine {
  constructor(db) {
    this.db = db;
  }

  /**
   * Calculates final partner quote for a product or service
   *
   * @param {Object} params
   * @param {string} params.partnerId - ID of the partner
   * @param {string} params.productCode - Code of the product (e.g. VPS-STARTER)
   * @param {number} params.quantity - Number of units (default 1)
   * @param {number} [params.overrideBasePrice] - Base price if calculated dynamically (e.g. custom specs)
   * @param {string} [params.couponCode] - Optional promotional coupon
   * @param {string} [params.currency='USD'] - Currency (USD or BDT)
   * @param {number} [params.exchangeRate=122] - Current USD to BDT rate
   * @param {string} [params.clientIp='127.0.0.1'] - Request IP for audit log
   * @returns {Object} Quote calculation result
   */
  calculatePartnerPrice({
    partnerId,
    productCode,
    quantity = 1,
    overrideBasePrice = null,
    couponCode = null,
    currency = 'USD',
    exchangeRate = 122.0,
    clientIp = '127.0.0.1'
  }) {
    if (!productCode) {
      throw new Error('productCode is required');
    }
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    // 1. Fetch Product Pricing Rule & Eligibility
    const rule = this.db.prepare(`
      SELECT * FROM partner_pricing_rules WHERE product_code = ?
    `).get(productCode);

    if (!rule) {
      throw new Error(`Product code '${productCode}' not found in pricing catalog`);
    }

    const baseUnitMonthly = overrideBasePrice !== null ? Number(overrideBasePrice) : rule.base_price_monthly;
    const grossSubtotal = baseUnitMonthly * qty;

    // 2. Fetch Partner Profile & Approved Tier
    let partner = null;
    let tier = null;
    let activeAgreement = null;

    if (partnerId) {
      partner = this.db.prepare(`
        SELECT p.*, pt.name as tier_name, pt.slug as tier_slug, pt.discount_rate as tier_discount_rate
        FROM partners p
        JOIN partner_tiers pt ON p.tier_id = pt.id
        WHERE p.id = ?
      `).get(partnerId);

      if (partner) {
        // Check for active custom strategic agreement
        const today = new Date().toISOString().slice(0, 10);
        activeAgreement = this.db.prepare(`
          SELECT * FROM partner_agreements
          WHERE partner_id = ? AND status = 'ACTIVE'
            AND date(effective_from) <= date(?)
            AND date(effective_until) >= date(?)
          ORDER BY custom_discount_rate DESC
          LIMIT 1
        `).get(partnerId, today, today);
      }
    }

    // 3. Determine Effective Base Partner Discount Rate
    let partnerDiscountRate = 0;
    let discountSource = 'NONE';
    let isApproved = false;

    if (partner && partner.status === 'ACTIVE') {
      isApproved = true;
      if (activeAgreement && activeAgreement.custom_discount_rate > 0) {
        partnerDiscountRate = activeAgreement.custom_discount_rate;
        discountSource = `Strategic Agreement (${activeAgreement.agreement_code})`;
      } else if (partner.custom_discount_rate !== null && partner.custom_discount_rate !== undefined) {
        partnerDiscountRate = partner.custom_discount_rate;
        discountSource = 'Custom Approved Partner Rate';
      } else if (partner.tier_discount_rate) {
        partnerDiscountRate = partner.tier_discount_rate;
        discountSource = `Tier: ${partner.tier_name}`;
      }
    }

    // 4. Product-Level Discount Eligibility & Safeguard Ceilings
    let appliedDiscountRate = 0;
    let isDiscountable = Boolean(rule.is_discountable);
    let exclusionReason = rule.exclusion_reason || null;

    if (!isDiscountable) {
      // Product is non-discountable (e.g. third-party license, domain, payment gateway fee)
      appliedDiscountRate = 0;
    } else {
      // Cap at the product's max allowed discount rate
      const maxAllowed = rule.max_discount_rate || 0.25;
      appliedDiscountRate = Math.min(partnerDiscountRate, maxAllowed);
    }

    // 5. Anti-Stacking Rules
    // Partner tier discounts cannot stack with generic coupon codes.
    // If a coupon is provided, we compare and apply strictly the best single discount, never stacking.
    let couponDiscountRate = 0;
    let stackedDiscountRejected = false;

    if (couponCode) {
      // Demo coupons
      if (couponCode.toUpperCase() === 'CLOUD5') couponDiscountRate = 0.05;
      else if (couponCode.toUpperCase() === 'WELCOME10') couponDiscountRate = 0.10;

      if (couponDiscountRate > 0 && appliedDiscountRate > 0) {
        stackedDiscountRejected = true;
        // Anti-stacking: take the higher discount rate only
        if (couponDiscountRate > appliedDiscountRate) {
          appliedDiscountRate = couponDiscountRate;
          discountSource = `Promotional Coupon (${couponCode.toUpperCase()}) - Partner discount not stacked`;
        } else {
          // Keep partner rate
          discountSource += ` (Coupon ${couponCode.toUpperCase()} discarded to prevent stacking)`;
        }
      }
    }

    // 6. Calculate Financial Values (Primarily in Bangladeshi Taka - BDT)
    const grossSubtotalBDT = grossSubtotal;
    const partnerDiscountAmountBDT = Number((grossSubtotalBDT * appliedDiscountRate).toFixed(2));
    const netBeforeTaxBDT = Number((grossSubtotalBDT - partnerDiscountAmountBDT).toFixed(2));

    // Tax calculation (standard 5% VAT calculated on net partner subtotal)
    const vatRate = 0.05;
    const taxAmountBDT = Number((netBeforeTaxBDT * vatRate).toFixed(2));
    const finalTotalBDT = Number((netBeforeTaxBDT + taxAmountBDT).toFixed(2));
    const partnerSavingsBDT = partnerDiscountAmountBDT;

    // USD reference conversions
    const finalTotalUSD = Number((finalTotalBDT / exchangeRate).toFixed(2));
    const netBeforeTaxUSD = Number((netBeforeTaxBDT / exchangeRate).toFixed(2));
    const grossSubtotalUSD = Number((grossSubtotalBDT / exchangeRate).toFixed(2));
    const partnerDiscountAmountUSD = Number((partnerDiscountAmountBDT / exchangeRate).toFixed(2));
    const taxAmountUSD = Number((taxAmountBDT / exchangeRate).toFixed(2));

    // 7. Audit Logging of Pricing Decision
    const quoteId = 'QTE-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    try {
      this.db.prepare(`
        INSERT INTO partner_audit_logs (id, actor_type, actor_id, actor_email, action, entity_type, entity_id, details_json, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        partner ? 'PARTNER' : 'ANONYMOUS',
        partner ? partner.id : null,
        partner ? partner.email : 'public-visitor',
        'PRICING_QUOTE_GENERATED',
        'partner_pricing_rules',
        productCode,
        JSON.stringify({
          quoteId,
          productCode,
          quantity: qty,
          baseUnitMonthly,
          grossSubtotalBDT,
          appliedDiscountRate,
          discountSource,
          partnerDiscountAmountBDT,
          finalTotalBDT,
          finalTotalUSD,
          stackedDiscountRejected
        }),
        clientIp
      );
    } catch {
      // Non-fatal if logging fails
    }

    return {
      quoteId,
      currency: 'BDT',
      currencySymbol: '৳',
      product: {
        code: rule.product_code,
        name: rule.product_name,
        category: rule.category,
        isDiscountable,
        exclusionReason,
        baseUnitPrice: baseUnitMonthly
      },
      partner: partner ? {
        id: partner.id,
        companyName: partner.company_name,
        tier: partner.tier_name,
        status: partner.status,
        discountSource
      } : null,
      pricing: {
        quantity: qty,
        grossSubtotalBDT,
        appliedDiscountPercentage: Math.round(appliedDiscountRate * 100 * 10) / 10,
        partnerDiscountAmountBDT,
        netBeforeTaxBDT,
        taxAmountBDT,
        finalTotalBDT,
        partnerSavingsBDT,
        grossSubtotalUSD,
        partnerDiscountAmountUSD,
        netBeforeTaxUSD,
        taxAmountUSD,
        finalTotalUSD,
        exchangeRate,
        stackedDiscountRejected
      },
      validUntil: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    };
  }
}

/**
 * Automatically evaluates a partner's eligible spending in BDT and
 * upgrades/updates their tier according to the configured threshold schedule:
 * - Registered Partner: ৳0 - <৳30,000 (5% margin)
 * - Silver Partner: ৳30,000 - <৳120,000 (10% margin)
 * - Gold Partner: ৳120,000 - <৳360,000 (15% margin)
 * - Platinum Partner: ৳360,000+ (20% - 25% margin)
 *
 * @param {Object} db - SQLite database instance
 * @param {string} partnerId - Partner ID
 * @returns {Object} Result of evaluation { upgraded: boolean, oldTier, newTier, currentSpend }
 */
export function evaluateAndUpgradePartnerTier(db, partnerId) {
  if (!partnerId) return null;

  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(partnerId);
  if (!partner) return null;

  const currentSpend = Number(partner.monthly_eligible_spend || 0);

  // Find highest qualifying tier based on spending in BDT
  const qualifyingTier = db.prepare(`
    SELECT * FROM partner_tiers
    WHERE min_monthly_spend <= ?
    ORDER BY min_monthly_spend DESC, discount_rate DESC
    LIMIT 1
  `).get(currentSpend);

  if (!qualifyingTier) return { upgraded: false, tierId: partner.tier_id, currentSpend };

  if (qualifyingTier.id !== partner.tier_id) {
    const oldTier = db.prepare('SELECT * FROM partner_tiers WHERE id = ?').get(partner.tier_id);

    db.prepare(`
      UPDATE partners
      SET tier_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(qualifyingTier.id, partnerId);

    try {
      db.prepare(`
        INSERT INTO partner_audit_logs (id, actor_type, actor_id, actor_email, action, entity_type, entity_id, details_json, ip_address)
        VALUES (?, 'SYSTEM', ?, ?, 'TIER_AUTOMATICALLY_UPDATED', 'partners', ?, ?, '127.0.0.1')
      `).run(
        crypto.randomUUID(),
        partnerId,
        partner.email,
        partnerId,
        JSON.stringify({
          previousTier: oldTier ? oldTier.name : 'None',
          newTier: qualifyingTier.name,
          currentSpendBDT: currentSpend,
          reason: `Spend of ৳${currentSpend.toLocaleString('en-US')} qualifies for ${qualifyingTier.name} (Threshold: ৳${qualifyingTier.min_monthly_spend.toLocaleString('en-US')})`
        })
      );
    } catch {}

    return {
      upgraded: true,
      oldTier,
      newTier: qualifyingTier,
      currentSpend
    };
  }

  return {
    upgraded: false,
    currentTierId: partner.tier_id,
    currentSpend
  };
}
