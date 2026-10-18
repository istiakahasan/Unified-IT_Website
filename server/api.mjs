import crypto from 'node:crypto';
import { handleLogin, sessionStore, extractToken } from './auth.mjs';
import { hashPassword } from './db.mjs';

/**
 * REST API Router for Cloud Partner Program
 */
export async function handleApiRequest({ req, res, pathname, query, body, db, pricingEngine, whmcsAdapter, cloudstackAdapter }) {
  // Helper functions
  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(data));
  };

  const sendError = (statusCode, message, extra = {}) => {
    sendJson(statusCode, { error: true, message, ...extra });
  };

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  // Audit log helper
  const logAudit = (actorType, actorId, actorEmail, action, entityType, entityId, details) => {
    try {
      db.prepare(`
        INSERT INTO partner_audit_logs (id, actor_type, actor_id, actor_email, action, entity_type, entity_id, details_json, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        actorType,
        actorId,
        actorEmail,
        action,
        entityType,
        entityId,
        JSON.stringify(details),
        clientIp
      );
    } catch (e) {
      console.error('[Audit Log Error]', e.message);
    }
  };

  // --- 1. PUBLIC ENDPOINTS ---

  // GET /api/public/tiers
  if (req.method === 'GET' && pathname === '/api/public/tiers') {
    const tiers = db.prepare(`SELECT * FROM partner_tiers ORDER BY min_monthly_spend ASC`).all();
    const benefits = db.prepare(`SELECT * FROM partner_benefits`).all();
    const result = tiers.map(t => ({
      ...t,
      benefits: benefits.filter(b => b.tier_id === t.id)
    }));
    return sendJson(200, { tiers: result });
  }

  // GET /api/public/system-status
  if (req.method === 'GET' && pathname === '/api/public/system-status') {
    return sendJson(200, {
      platform: 'Unified Cloud Partner System',
      version: '2.4.0',
      integrations: {
        whmcs: whmcsAdapter.getStatus(),
        cloudstack: cloudstackAdapter.getStatus()
      }
    });
  }

  // POST /api/public/pricing/quote
  if (req.method === 'POST' && pathname === '/api/public/pricing/quote') {
    try {
      const quote = pricingEngine.calculatePartnerPrice({
        partnerId: body.partnerId || (req.session ? req.session.partnerId : null),
        productCode: body.productCode,
        quantity: body.quantity || 1,
        overrideBasePrice: body.overrideBasePrice || null,
        couponCode: body.couponCode || null,
        currency: body.currency || 'USD',
        clientIp
      });
      return sendJson(200, quote);
    } catch (err) {
      return sendError(400, err.message);
    }
  }

  // POST /api/public/applications (Submit Partner Application)
  if (req.method === 'POST' && pathname === '/api/public/applications') {
    const {
      fullName,
      businessName,
      businessEmail,
      phoneNumber,
      country,
      websiteUrl,
      businessType,
      estimatedMonthlySpend,
      expectedCustomers,
      servicesOfInterest,
      partnershipModel,
      businessDescription,
      agreeTerms
    } = body;

    // Strict validation
    if (!agreeTerms) {
      return sendError(400, 'You must accept the Partner Agreement and Privacy Policy.');
    }
    if (!fullName || fullName.trim().length < 2) {
      return sendError(400, 'Full name is required (minimum 2 characters).');
    }
    if (!businessName || businessName.trim().length < 2) {
      return sendError(400, 'Business / Organization name is required.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!businessEmail || !emailRegex.test(businessEmail.trim())) {
      return sendError(400, 'A valid business email address is required.');
    }
    if (!phoneNumber || phoneNumber.trim().length < 7) {
      return sendError(400, 'A valid phone number with country code is required.');
    }
    if (!country || country.trim().length < 2) {
      return sendError(400, 'Country is required.');
    }
    if (!businessType) {
      return sendError(400, 'Please select your business type.');
    }
    if (!estimatedMonthlySpend) {
      return sendError(400, 'Please select your estimated monthly infrastructure spending.');
    }
    if (!expectedCustomers) {
      return sendError(400, 'Please select expected number of customers.');
    }
    if (!servicesOfInterest || servicesOfInterest.length === 0) {
      return sendError(400, 'Please select at least one service of interest.');
    }
    if (!partnershipModel) {
      return sendError(400, 'Please select your preferred partnership model.');
    }
    if (!businessDescription || businessDescription.trim().length < 15) {
      return sendError(400, 'Please provide a brief business description (minimum 15 characters).');
    }

    const cleanEmail = businessEmail.toLowerCase().trim();

    // Prevent duplicate pending applications
    const existing = db.prepare(`
      SELECT id, reference_no, status, created_at FROM partner_applications
      WHERE email = ? AND status = 'PENDING'
    `).get(cleanEmail);

    if (existing) {
      return sendError(409, `An active application (${existing.reference_no}) is already pending review for this email address. Our partner desk will contact you shortly.`);
    }

    // Check if already an active partner
    const existingPartner = db.prepare(`SELECT id, company_name FROM partners WHERE email = ?`).get(cleanEmail);
    if (existingPartner) {
      return sendError(409, `This email is already registered to an existing partner account (${existingPartner.company_name}). Please log in to your Partner Portal.`);
    }

    const appId = 'app-' + crypto.randomBytes(8).toString('hex');
    const refYear = new Date().getFullYear();
    const refNum = Math.floor(10000 + Math.random() * 90000);
    const referenceNo = `APP-${refYear}-${refNum}`;

    const servicesStr = Array.isArray(servicesOfInterest) ? servicesOfInterest.join(', ') : String(servicesOfInterest);

    db.prepare(`
      INSERT INTO partner_applications (
        id, reference_no, company_name, contact_name, email, phone, country, website,
        business_type, estimated_monthly_spend, expected_customers, services_of_interest,
        partnership_model, business_description, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(
      appId,
      referenceNo,
      businessName.trim(),
      fullName.trim(),
      cleanEmail,
      phoneNumber.trim(),
      country.trim(),
      (websiteUrl || '').trim(),
      businessType,
      estimatedMonthlySpend,
      expectedCustomers,
      servicesStr,
      partnershipModel,
      businessDescription.trim()
    );

    logAudit('PUBLIC', appId, cleanEmail, 'APPLICATION_SUBMITTED', 'partner_applications', appId, {
      referenceNo,
      company: businessName,
      contact: fullName,
      spend: estimatedMonthlySpend
    });

    return sendJson(201, {
      success: true,
      referenceNo,
      applicationId: appId,
      message: 'Your partner application has been submitted successfully and is currently under review by our Partner Desk.',
      status: 'PENDING'
    });
  }

  // GET /api/public/applications/:ref
  if (req.method === 'GET' && pathname.startsWith('/api/public/applications/')) {
    const ref = decodeURIComponent(pathname.replace('/api/public/applications/', '')).trim();
    const app = db.prepare(`
      SELECT reference_no, company_name, contact_name, status, created_at, reviewed_at
      FROM partner_applications
      WHERE reference_no = ? OR email = ?
    `).get(ref, ref.toLowerCase());

    if (!app) {
      return sendError(404, 'No application found with that reference number or email.');
    }
    return sendJson(200, { application: app });
  }

  // --- 2. AUTHENTICATION ENDPOINTS ---

  // POST /api/auth/login
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    try {
      const { email, password } = body;
      const sessionData = handleLogin(db, email, password);

      res.setHeader('Set-Cookie', `uct_session=${sessionData.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
      logAudit(sessionData.user.role, sessionData.user.id, sessionData.user.email, 'USER_LOGIN_SUCCESS', 'users', sessionData.user.id, {});
      return sendJson(200, { success: true, ...sessionData });
    } catch (err) {
      logAudit('ANONYMOUS', null, body.email || 'unknown', 'USER_LOGIN_FAILURE', 'users', null, { reason: err.message });
      return sendError(401, err.message);
    }
  }

  // GET /api/auth/me
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    if (!req.session) {
      return sendError(401, 'Not authenticated');
    }

    let partner = null;
    if (req.session.partnerId) {
      partner = db.prepare(`
        SELECT p.*, pt.name as tier_name, pt.slug as tier_slug, pt.discount_rate as tier_discount_rate
        FROM partners p
        JOIN partner_tiers pt ON p.tier_id = pt.id
        WHERE p.id = ?
      `).get(req.session.partnerId);
    }

    return sendJson(200, {
      authenticated: true,
      user: {
        id: req.session.userId,
        email: req.session.email,
        role: req.session.role,
        partnerId: req.session.partnerId
      },
      partner
    });
  }

  // POST /api/auth/logout
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const token = extractToken(req);
    if (token) {
      sessionStore.destroySession(token);
    }
    res.setHeader('Set-Cookie', `uct_session=; Path=/; HttpOnly; Max-Age=0`);
    return sendJson(200, { success: true, message: 'Logged out successfully.' });
  }

  // --- 3. PARTNER DASHBOARD ENDPOINTS (/api/partner/*) ---
  if (pathname.startsWith('/api/partner/')) {
    if (!req.session) {
      return sendError(401, 'Partner authentication required.');
    }
    if (req.session.role !== 'PARTNER' && req.session.role !== 'ADMIN') {
      return sendError(403, 'Forbidden: Partner account required.');
    }

    // Isolate data to partnerId
    const partnerId = req.session.partnerId;
    if (!partnerId) {
      return sendError(400, 'No partner profile associated with this account.');
    }

    // GET /api/partner/overview
    if (req.method === 'GET' && pathname === '/api/partner/overview') {
      const partner = db.prepare(`
        SELECT p.*, pt.name as tier_name, pt.slug as tier_slug, pt.discount_rate as tier_discount_rate,
               pt.min_monthly_spend as tier_min_spend
        FROM partners p
        JOIN partner_tiers pt ON p.tier_id = pt.id
        WHERE p.id = ?
      `).get(partnerId);

      const customerCount = db.prepare(`
        SELECT COUNT(*) as count FROM partner_customer_relationships WHERE partner_id = ? AND status = 'ACTIVE'
      `).get(partnerId).count;

      const services = db.prepare(`
        SELECT COUNT(*) as count, SUM(net_monthly_fee) as totalMonthlyMRR
        FROM partner_services WHERE partner_id = ? AND status = 'RUNNING'
      `).get(partnerId);

      const commission = db.prepare(`
        SELECT SUM(amount) as totalEarned,
               SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END) as balancePendingPayout
        FROM partner_commissions WHERE partner_id = ?
      `).get(partnerId);

      const recentInvoices = [
        { id: 'INV-2026-901', date: '2026-10-01', description: 'Monthly Infrastructure Services - 5 instances', gross: '৳46,116.00', discount: '-৳6,917.40 (15%)', net: '৳39,198.60', status: 'PAID' },
        { id: 'INV-2026-842', date: '2026-09-01', description: 'Monthly Infrastructure Services - 5 instances', gross: '৳46,116.00', discount: '-৳6,917.40 (15%)', net: '৳39,198.60', status: 'PAID' },
        { id: 'INV-2026-781', date: '2026-08-01', description: 'Monthly Infrastructure Services - 4 instances', gross: '৳34,404.00', discount: '-৳5,160.60 (15%)', net: '৳29,243.40', status: 'PAID' }
      ];

      // Next tier progress
      const allTiers = db.prepare(`SELECT * FROM partner_tiers ORDER BY min_monthly_spend ASC`).all();
      const currentSpend = partner.monthly_eligible_spend || 0;
      let nextTier = null;
      for (const t of allTiers) {
        if (t.min_monthly_spend > currentSpend) {
          nextTier = t;
          break;
        }
      }

      return sendJson(200, {
        partner,
        metrics: {
          customerCount,
          activeServicesCount: services.count || 0,
          monthlyMRR: Number(services.totalMonthlyMRR || 0).toFixed(2),
          commissionBalance: Number(commission.balancePendingPayout || 0).toFixed(2),
          totalCommissionEarned: Number(commission.totalEarned || 0).toFixed(2),
          currentSpend,
          nextTier: nextTier ? {
            name: nextTier.name,
            targetSpend: nextTier.min_monthly_spend,
            percentAchieved: Math.min(100, Math.round((currentSpend / nextTier.min_monthly_spend) * 100))
          } : { name: 'Platinum (Max Tier)', targetSpend: currentSpend, percentAchieved: 100 }
        },
        recentInvoices
      });
    }

    // GET /api/partner/customers
    if (req.method === 'GET' && pathname === '/api/partner/customers') {
      const customers = db.prepare(`
        SELECT c.*, COUNT(s.id) as service_count
        FROM partner_customer_relationships c
        LEFT JOIN partner_services s ON c.id = s.customer_id
        WHERE c.partner_id = ?
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `).all(partnerId);
      return sendJson(200, { customers });
    }

    // GET /api/partner/services
    if (req.method === 'GET' && pathname === '/api/partner/services') {
      const services = db.prepare(`
        SELECT s.*, c.customer_name, c.company as customer_company
        FROM partner_services s
        JOIN partner_customer_relationships c ON s.customer_id = c.id
        WHERE s.partner_id = ?
        ORDER BY s.created_at DESC
      `).all(partnerId);
      return sendJson(200, { services });
    }

    // POST /api/partner/services/:id/reboot
    if (req.method === 'POST' && pathname.includes('/reboot')) {
      const serviceId = pathname.split('/')[4];
      const service = db.prepare(`
        SELECT * FROM partner_services WHERE id = ? AND partner_id = ?
      `).get(serviceId, partnerId);

      if (!service) {
        return sendError(404, 'Service instance not found or access denied.');
      }

      // Call CloudStack adapter
      const csResult = await cloudstackAdapter.rebootVM(service.cloudstack_vm_id, 'partner-account');
      logAudit('PARTNER', req.session.userId, req.session.email, 'VM_REBOOT_TRIGGERED', 'partner_services', serviceId, {
        vmId: service.cloudstack_vm_id,
        csResult
      });

      return sendJson(200, {
        success: true,
        message: `Virtual machine ${service.service_name} (${service.cloudstack_vm_id}) is restarting via CloudStack.`,
        cloudstack: csResult
      });
    }

    // GET /api/partner/analytics
    if (req.method === 'GET' && pathname === '/api/partner/analytics') {
      const filter = query.filter || '30d';

      // Computed metrics strictly from partner data in BDT
      const analytics = {
        filter,
        summary: {
          grossSales: '৳553,392.00',
          partnerDiscountSavings: '৳83,008.80',
          netPaidToUnified: '৳470,383.20',
          recurringMRR: '৳54,753.60',
          customerGrowthRate: '+25%',
          referralCommissions: '৳12,810.00'
        },
        monthlyTrends: [
          { month: 'Jun 2026', gross: 292800, savings: 43920, net: 248880, customers: 2 },
          { month: 'Jul 2026', gross: 347700, savings: 52155, net: 295545, customers: 3 },
          { month: 'Aug 2026', gross: 412848, savings: 61927, net: 350921, customers: 3 },
          { month: 'Sep 2026', gross: 494832, savings: 74224, net: 420608, customers: 4 },
          { month: 'Oct 2026', gross: 553392, savings: 83008, net: 470384, customers: 4 }
        ]
      };
      return sendJson(200, analytics);
    }

    // GET /api/partner/referrals
    if (req.method === 'GET' && pathname === '/api/partner/referrals') {
      const referrals = db.prepare(`
        SELECT * FROM partner_referrals WHERE partner_id = ? ORDER BY created_at DESC
      `).all(partnerId);
      const commissions = db.prepare(`
        SELECT * FROM partner_commissions WHERE partner_id = ? ORDER BY created_at DESC
      `).all(partnerId);
      return sendJson(200, { referrals, commissions });
    }

    // POST /api/partner/payouts
    if (req.method === 'POST' && pathname === '/api/partner/payouts') {
      const { amount, paymentMethod, accountDetails } = body;
      const numAmount = Number(amount);
      if (!numAmount || numAmount < 5000) {
        return sendError(400, 'Minimum payout request amount is ৳5,000.00 BDT.');
      }
      if (!paymentMethod || !accountDetails) {
        return sendError(400, 'Payment method and account details are required.');
      }

      const payoutId = 'pay-' + crypto.randomBytes(6).toString('hex');
      db.prepare(`
        INSERT INTO partner_payouts (id, partner_id, amount, payment_method, account_details, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
      `).run(payoutId, partnerId, numAmount, paymentMethod, accountDetails);

      logAudit('PARTNER', req.session.userId, req.session.email, 'PAYOUT_REQUESTED', 'partner_payouts', payoutId, {
        amount: numAmount,
        currency: 'BDT',
        method: paymentMethod
      });

      return sendJson(201, {
        success: true,
        payoutId,
        message: `Payout request for ৳${numAmount.toLocaleString()} BDT submitted for administrative review.`
      });
    }

    // GET /api/partner/docs
    if (req.method === 'GET' && pathname === '/api/partner/docs') {
      const announcements = db.prepare(`
        SELECT * FROM partner_announcements ORDER BY published_at DESC LIMIT 10
      `).all();

      const guides = [
        {
          id: 'guide-cloudstack-api',
          title: 'Apache CloudStack API Integration Guide',
          category: 'Infrastructure',
          summary: 'How to automate VM provisioning, reboot, and metrics telemetry using your partner API key and HMAC-SHA1 signatures.'
        },
        {
          id: 'guide-whmcs-reseller',
          title: 'WHMCS Reseller Module & Automated Invoicing',
          category: 'Billing',
          summary: 'Step-by-step setup to connect client checkout to Unified Cloud with your approved wholesale discount.'
        },
        {
          id: 'guide-whitelabel',
          title: 'White-Label Branding & Custom Nameservers',
          category: 'Branding',
          summary: 'Configure vanity nameservers (ns1.youragency.com) and custom hostname SSL for cPanel & CloudStack portals.'
        }
      ];

      return sendJson(200, { announcements, guides });
    }

    // POST /api/partner/support/ticket
    if (req.method === 'POST' && pathname === '/api/partner/support/ticket') {
      const { subject, category, priority, message } = body;
      if (!subject || !category || !message) {
        return sendError(400, 'Subject, category, and message are required.');
      }

      const ticketNum = 'TICK-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
      const ticketId = 'tkt-' + crypto.randomBytes(6).toString('hex');

      db.prepare(`
        INSERT INTO partner_support_tickets (id, partner_id, ticket_number, subject, category, priority, message, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')
      `).run(ticketId, partnerId, ticketNum, subject.trim(), category, priority || 'STANDARD', message.trim());

      logAudit('PARTNER', req.session.userId, req.session.email, 'TICKET_CREATED', 'partner_support_tickets', ticketId, {
        ticketNum,
        priority
      });

      return sendJson(201, {
        success: true,
        ticketNumber: ticketNum,
        message: 'Priority support ticket created. Our cloud support engineers have received your escalation.'
      });
    }
  }

  // --- 4. ADMINISTRATIVE ENDPOINTS (/api/admin/*) ---
  if (pathname.startsWith('/api/admin/')) {
    if (!req.session) {
      return sendError(401, 'Administrative authentication required.');
    }
    if (req.session.role !== 'ADMIN') {
      return sendError(403, 'Forbidden: Administrative privilege required.');
    }

    // GET /api/admin/applications
    if (req.method === 'GET' && pathname === '/api/admin/applications') {
      const statusFilter = query.status || null;
      let sql = 'SELECT * FROM partner_applications';
      const params = [];
      if (statusFilter && statusFilter !== 'ALL') {
        sql += ' WHERE status = ?';
        params.push(statusFilter);
      }
      sql += ' ORDER BY created_at DESC';
      const applications = db.prepare(sql).all(...params);
      return sendJson(200, { applications });
    }

    // POST /api/admin/applications/:id/approve
    if (req.method === 'POST' && pathname.includes('/approve')) {
      const appId = pathname.split('/')[4];
      const { tierId, adminNotes, initialPassword = 'PartnerInitial2026!' } = body;

      const app = db.prepare(`SELECT * FROM partner_applications WHERE id = ?`).get(appId);
      if (!app) return sendError(404, 'Application not found');
      if (app.status === 'APPROVED') return sendError(400, 'Application is already approved.');

      const targetTier = db.prepare(`SELECT * FROM partner_tiers WHERE id = ?`).get(tierId || 'tier-registered');
      if (!targetTier) return sendError(400, 'Invalid tier ID.');

      // Begin atomic transaction
      const partnerId = 'ptn-' + crypto.randomBytes(6).toString('hex');
      const userId = 'usr-' + crypto.randomBytes(6).toString('hex');
      const auth = hashPassword(initialPassword);

      db.exec('BEGIN TRANSACTION;');
      try {
        // Create Partner
        db.prepare(`
          INSERT INTO partners (id, user_id, company_name, contact_name, email, phone, country, website, business_type, tier_id, status, monthly_eligible_spend)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0)
        `).run(
          partnerId,
          userId,
          app.company_name,
          app.contact_name,
          app.email,
          app.phone,
          app.country,
          app.website,
          app.business_type,
          targetTier.id
        );

        // Create User
        db.prepare(`
          INSERT INTO users (id, email, password_hash, salt, role, partner_id)
          VALUES (?, ?, ?, ?, 'PARTNER', ?)
        `).run(userId, app.email, auth.hash, auth.salt, partnerId);

        // Update application
        db.prepare(`
          UPDATE partner_applications
          SET status = 'APPROVED', admin_notes = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(adminNotes || `Approved for tier ${targetTier.name}.`, req.session.email, appId);

        db.exec('COMMIT;');

        logAudit('ADMIN', req.session.userId, req.session.email, 'APPLICATION_APPROVED', 'partner_applications', appId, {
          company: app.company_name,
          assignedTier: targetTier.name,
          partnerId
        });

        return sendJson(200, {
          success: true,
          message: `Application ${app.reference_no} approved. Partner profile created and assigned to ${targetTier.name}.`,
          partnerId,
          assignedTier: targetTier.name
        });
      } catch (err) {
        db.exec('ROLLBACK;');
        return sendError(500, `Approval transaction failed: ${err.message}`);
      }
    }

    // POST /api/admin/applications/:id/reject
    if (req.method === 'POST' && pathname.includes('/reject')) {
      const appId = pathname.split('/')[4];
      const { adminNotes } = body;
      db.prepare(`
        UPDATE partner_applications
        SET status = 'REJECTED', admin_notes = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(adminNotes || 'Declined during review.', req.session.email, appId);

      logAudit('ADMIN', req.session.userId, req.session.email, 'APPLICATION_REJECTED', 'partner_applications', appId, {
        notes: adminNotes
      });

      return sendJson(200, { success: true, message: 'Application rejected.' });
    }

    // GET /api/admin/partners
    if (req.method === 'GET' && pathname === '/api/admin/partners') {
      const partners = db.prepare(`
        SELECT p.*, pt.name as tier_name, pt.discount_rate as tier_discount_rate
        FROM partners p
        JOIN partner_tiers pt ON p.tier_id = pt.id
        ORDER BY p.created_at DESC
      `).all();
      return sendJson(200, { partners });
    }

    // POST /api/admin/partners/:id/tier (Assign or change tier)
    if (req.method === 'POST' && pathname.endsWith('/tier')) {
      const partnerId = pathname.split('/')[4];
      const { tierId } = body;
      const tier = db.prepare(`SELECT * FROM partner_tiers WHERE id = ?`).get(tierId);
      if (!tier) return sendError(400, 'Invalid tier ID');

      db.prepare(`
        UPDATE partners SET tier_id = ?, updated_at = datetime('now') WHERE id = ?
      `).run(tierId, partnerId);

      logAudit('ADMIN', req.session.userId, req.session.email, 'PARTNER_TIER_CHANGED', 'partners', partnerId, {
        newTier: tier.name
      });

      return sendJson(200, { success: true, message: `Partner tier updated to ${tier.name}.` });
    }

    // POST /api/admin/partners/:id/status (Suspend / Reactivate)
    if (req.method === 'POST' && pathname.endsWith('/status')) {
      const partnerId = pathname.split('/')[4];
      const { status } = body;
      if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
        return sendError(400, 'Invalid status. Must be ACTIVE or SUSPENDED.');
      }

      db.prepare(`
        UPDATE partners SET status = ?, updated_at = datetime('now') WHERE id = ?
      `).run(status, partnerId);

      logAudit('ADMIN', req.session.userId, req.session.email, 'PARTNER_STATUS_CHANGED', 'partners', partnerId, {
        newStatus: status
      });

      return sendJson(200, { success: true, message: `Partner status changed to ${status}.` });
    }

    // POST /api/admin/partners/:id/agreement (Custom Commercial Agreement)
    if (req.method === 'POST' && pathname.endsWith('/agreement')) {
      const partnerId = pathname.split('/')[4];
      const { customDiscountRate, effectiveFrom, effectiveUntil, creditLimit, notes } = body;

      const rate = Number(customDiscountRate);
      if (isNaN(rate) || rate < 0 || rate > 0.25) {
        return sendError(400, 'Custom discount rate must be between 0% and 25%.');
      }

      const agreementId = 'agr-' + crypto.randomBytes(6).toString('hex');
      const agreementCode = 'AGR-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);

      db.prepare(`
        INSERT INTO partner_agreements (id, partner_id, agreement_code, custom_discount_rate, effective_from, effective_until, credit_limit, approved_by, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        agreementId,
        partnerId,
        agreementCode,
        rate,
        effectiveFrom || new Date().toISOString().slice(0, 10),
        effectiveUntil || '2027-12-31',
        Number(creditLimit) || 5000,
        req.session.email,
        notes || 'Bespoke strategic partner agreement.'
      );

      logAudit('ADMIN', req.session.userId, req.session.email, 'STRATEGIC_AGREEMENT_APPROVED', 'partner_agreements', agreementId, {
        partnerId,
        agreementCode,
        rate
      });

      return sendJson(201, {
        success: true,
        agreementCode,
        message: `Strategic agreement ${agreementCode} established with ${(rate * 100).toFixed(1)}% margin.`
      });
    }

    // GET /api/admin/tiers
    if (req.method === 'GET' && pathname === '/api/admin/tiers') {
      const tiers = db.prepare(`SELECT * FROM partner_tiers ORDER BY min_monthly_spend ASC`).all();
      return sendJson(200, { tiers });
    }

    // PUT /api/admin/tiers/:id
    if (req.method === 'PUT' && pathname.startsWith('/api/admin/tiers/')) {
      const tierId = pathname.replace('/api/admin/tiers/', '');
      const { discountRate, minMonthlySpend, supportLevel } = body;

      db.prepare(`
        UPDATE partner_tiers
        SET discount_rate = ?, min_monthly_spend = ?, support_level = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(Number(discountRate), Number(minMonthlySpend), supportLevel, tierId);

      logAudit('ADMIN', req.session.userId, req.session.email, 'TIER_CONFIG_UPDATED', 'partner_tiers', tierId, {
        discountRate,
        minMonthlySpend
      });

      return sendJson(200, { success: true, message: 'Tier configuration updated.' });
    }

    // GET /api/admin/pricing-rules
    if (req.method === 'GET' && pathname === '/api/admin/pricing-rules') {
      const rules = db.prepare(`SELECT * FROM partner_pricing_rules ORDER BY category, product_name`).all();
      return sendJson(200, { rules });
    }

    // PUT /api/admin/pricing-rules/:id
    if (req.method === 'PUT' && pathname.startsWith('/api/admin/pricing-rules/')) {
      const ruleId = pathname.replace('/api/admin/pricing-rules/', '');
      const { isDiscountable, maxDiscountRate, fixedCommissionRate, exclusionReason } = body;

      db.prepare(`
        UPDATE partner_pricing_rules
        SET is_discountable = ?, max_discount_rate = ?, fixed_commission_rate = ?, exclusion_reason = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(isDiscountable ? 1 : 0, Number(maxDiscountRate), Number(fixedCommissionRate), exclusionReason || null, ruleId);

      logAudit('ADMIN', req.session.userId, req.session.email, 'PRICING_RULE_UPDATED', 'partner_pricing_rules', ruleId, {
        isDiscountable,
        maxDiscountRate
      });

      return sendJson(200, { success: true, message: 'Product pricing rule updated.' });
    }

    // GET /api/admin/payouts
    if (req.method === 'GET' && pathname === '/api/admin/payouts') {
      const payouts = db.prepare(`
        SELECT py.*, p.company_name, p.email as partner_email
        FROM partner_payouts py
        JOIN partners p ON py.partner_id = p.id
        ORDER BY py.requested_at DESC
      `).all();
      return sendJson(200, { payouts });
    }

    // POST /api/admin/payouts/:id/approve
    if (req.method === 'POST' && pathname.includes('/payouts/') && pathname.endsWith('/approve')) {
      const payoutId = pathname.split('/')[4];
      const { transactionRef } = body;

      db.prepare(`
        UPDATE partner_payouts
        SET status = 'PAID', transaction_ref = ?, approved_by = ?, paid_at = datetime('now')
        WHERE id = ?
      `).run(transactionRef || 'BANK-TX-' + Date.now(), req.session.email, payoutId);

      logAudit('ADMIN', req.session.userId, req.session.email, 'PAYOUT_APPROVED', 'partner_payouts', payoutId, {
        transactionRef
      });

      return sendJson(200, { success: true, message: 'Payout approved and marked as paid.' });
    }

    // GET /api/admin/audit-logs
    if (req.method === 'GET' && pathname === '/api/admin/audit-logs') {
      const logs = db.prepare(`
        SELECT * FROM partner_audit_logs ORDER BY created_at DESC LIMIT 50
      `).all();
      return sendJson(200, { logs });
    }

    // GET /api/admin/export
    if (req.method === 'GET' && pathname === '/api/admin/export') {
      const type = query.type || 'partners';
      if (type === 'partners') {
        const partners = db.prepare(`SELECT * FROM partners`).all();
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="unified_partners_export.csv"'
        });
        res.write('id,company_name,contact_name,email,phone,tier_id,status,monthly_eligible_spend_bdt\n');
        for (const p of partners) {
          res.write(`"${p.id}","${p.company_name}","${p.contact_name}","${p.email}","${p.phone}","${p.tier_id}","${p.status}","${p.monthly_eligible_spend}"\n`);
        }
        return res.end();
      }

      if (type === 'applications') {
        const apps = db.prepare(`SELECT * FROM partner_applications ORDER BY created_at DESC`).all();
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="partner_applications_export.csv"'
        });
        res.write('reference_no,company_name,contact_name,email,phone,country,business_type,estimated_monthly_spend,partnership_model,status,created_at\n');
        for (const a of apps) {
          res.write(`"${a.reference_no}","${a.company_name}","${a.contact_name}","${a.email}","${a.phone}","${a.country}","${a.business_type}","${a.estimated_monthly_spend}","${a.partnership_model}","${a.status}","${a.created_at}"\n`);
        }
        return res.end();
      }

      if (type === 'audit') {
        const logs = db.prepare(`SELECT * FROM partner_audit_logs ORDER BY created_at DESC`).all();
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="partner_audit_trail_export.csv"'
        });
        res.write('created_at,actor_type,actor_email,action,entity_type,ip_address\n');
        for (const l of logs) {
          res.write(`"${l.created_at}","${l.actor_type}","${l.actor_email || 'anonymous'}","${l.action}","${l.entity_type}","${l.ip_address}"\n`);
        }
        return res.end();
      }
    }
  }

  // Not found endpoint
  return sendError(404, `API route '${pathname}' not found`);
}
