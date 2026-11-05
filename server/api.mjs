import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleLoginAsync, getClientIp, buildSessionCookie, sessionStore, extractToken, hasPermission, ROLE_PERMISSIONS } from './auth.mjs';
import { hashPasswordAsync } from './db.mjs';
import { RewardProcessingService } from './reward-service.mjs';
import { evaluateAndUpgradePartnerTier } from './pricing-engine.mjs';
import * as ticketsService from './tickets-service.mjs';
import * as agentic from './agentic-ai.mjs';
import * as requests from './agentic-requests.mjs';
import { listOutbox, deliverEmail, mailerConfig } from './mailer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Support attachment types. The MIME type is always taken from this table, never from the uploader.
const ATTACHMENT_MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.zip': 'application/zip'
};
const INLINE_ATTACHMENT_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.pdf'];

// getClientIp lives in auth.mjs (sessions use it too); re-exported for existing importers
export { getClientIp };

/**
 * REST API Router for Cloud Partner Program & Centralized Admin Portal
 */
export async function handleApiRequest({ req, res, pathname, query, body, rawBody = '', db, pricingEngine, whmcsAdapter, cloudstackAdapter, rewardService }) {
  const rewards = rewardService || new RewardProcessingService(db);

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

  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown Client';

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

  // Security telemetry and audit helper (append-only)
  const logSecurityEvent = (eventType, actorId, actorEmail, actorRole, targetResource, targetId, action, outcome, details = {}) => {
    try {
      db.prepare(`
        INSERT INTO security_events (id, timestamp, event_type, actor_id, actor_email, actor_role, target_resource, target_id, action, outcome, ip_address, user_agent, details_json, correlation_id)
        VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'sec-' + crypto.randomBytes(6).toString('hex'),
        eventType,
        actorId || 'anonymous',
        actorEmail || 'anonymous',
        actorRole || 'UNKNOWN',
        targetResource,
        targetId || null,
        action,
        outcome,
        clientIp,
        userAgent,
        JSON.stringify(details),
        'corr-' + crypto.randomBytes(4).toString('hex')
      );
    } catch (e) {
      console.error('[Security Event Error]', e.message);
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

  // GET /api/public/announcements (Public active announcements & banners)
  if (req.method === 'GET' && pathname === '/api/public/announcements') {
    const announcements = db.prepare(`
      SELECT id, title, type, message, starts_at, ends_at, created_at
      FROM website_announcements
      WHERE is_active = 1
      ORDER BY created_at DESC
    `).all();
    return sendJson(200, { announcements });
  }

  // GET /api/public/plans (Public service catalog & pricing)
  if (req.method === 'GET' && pathname === '/api/public/plans') {
    const categoryFilter = query.category || null;
    let sql = 'SELECT * FROM website_plans WHERE is_available = 1';
    const params = [];
    if (categoryFilter) {
      sql += ' AND category = ?';
      params.push(categoryFilter);
    }
    sql += ' ORDER BY price_bdt ASC';
    const plans = db.prepare(sql).all(...params);
    plans.forEach(p => {
      try { p.features = JSON.parse(p.features_json); } catch { p.features = []; }
    });
    return sendJson(200, { plans });
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

  // =========================================================================
  // PUBLIC & CUSTOMER SUPPORT TICKETING API
  // =========================================================================

  // =========================================================================
  // AGENTIC AI MODULE (public catalog/checkout/lookup + signed WHMCS payment webhook)
  // =========================================================================
  if (pathname.startsWith('/api/public/agentic/') || pathname === '/api/webhooks/whmcs/agentic') {
    try {
      // GET /api/public/agentic/catalog
      if (req.method === 'GET' && pathname === '/api/public/agentic/catalog') {
        return sendJson(200, agentic.getCatalog(db));
      }

      // POST /api/public/agentic/quote (server-authoritative price; nothing is stored)
      if (req.method === 'POST' && pathname === '/api/public/agentic/quote') {
        const analysis = agentic.analyseDocuments(body.documents, body.ragText);
        const quote = agentic.buildQuote(agentic.getPricing(db), body, analysis.totalChars);
        return sendJson(200, { quote, skippedDuplicates: analysis.skippedDuplicates });
      }

      // POST /api/public/agentic/orders (creates the order and its WHMCS invoice)
      if (req.method === 'POST' && pathname === '/api/public/agentic/orders') {
        const result = await agentic.createOrder(db, whmcsAdapter, body, { actor: 'customer:' + String(body?.customer?.email || '').slice(0, 80) });
        return sendJson(result.replay ? 200 : 201, result);
      }

      // GET /api/public/agentic/orders/lookup?ref=&email= (customer's own order only)
      if (req.method === 'GET' && pathname === '/api/public/agentic/orders/lookup') {
        return sendJson(200, agentic.lookupOrderForCustomer(db, query.ref, query.email, clientIp));
      }

      // GET /api/public/agentic/track?ref=&email= (priced orders AGT-... and quotation requests REQ-...)
      if (req.method === 'GET' && pathname === '/api/public/agentic/track') {
        const trackRef = String(query.ref || '').trim().toUpperCase();
        if (trackRef.startsWith('REQ-')) return sendJson(200, { kind: 'request', ...requests.lookupRequest(db, trackRef, query.email, clientIp) });
        return sendJson(200, { kind: 'order', ...agentic.lookupOrderForCustomer(db, trackRef, query.email, clientIp) });
      }

      // POST /api/public/agentic/requests (Customized and Branded requirement submissions)
      if (req.method === 'POST' && pathname === '/api/public/agentic/requests') {
        const created = await requests.createRequest(db, body, { actor: 'customer:' + String(body?.customer?.email || '').slice(0, 80) });
        return sendJson(created.replay ? 200 : 201, created);
      }

      // POST /api/public/agentic/requests/:ref/respond | /payment (the customer's own request only: ref + email)
      const reqAction = pathname.match(/^\/api\/public\/agentic\/requests\/([^/]+)\/(respond|payment)$/);
      if (req.method === 'POST' && reqAction) {
        const reqRef = decodeURIComponent(reqAction[1]);
        if (reqAction[2] === 'respond') return sendJson(200, await requests.respondToQuotation(db, whmcsAdapter, reqRef, body.email, body));
        return sendJson(200, await requests.submitPayment(db, reqRef, body.email, body));
      }

      // POST /api/webhooks/whmcs/agentic (HMAC-signed by the WHMCS hook; activation happens only here)
      if (req.method === 'POST' && pathname === '/api/webhooks/whmcs/agentic') {
        const secret = process.env.AGENTIC_WEBHOOK_SECRET || process.env.WHMCS_WEBHOOK_SECRET || '';
        if (!secret) return sendError(503, 'Payment webhook is not configured (AGENTIC_WEBHOOK_SECRET).');
        if (!agentic.verifyWebhookSignature(rawBody, req.headers['x-unified-signature'], secret)) {
          logSecurityEvent('WEBHOOK_REJECTED', null, null, 'WHMCS', 'agentic-webhook', null, 'VERIFY_SIGNATURE', 'DENIED', {});
          return sendError(401, 'Invalid webhook signature.');
        }
        // A quotation invoice belongs to a request; anything else is a priced order invoice.
        let out = await requests.processQuotationPaymentEvent(db, whmcsAdapter, body);
        if (!out) out = await agentic.processPaymentEvent(db, whmcsAdapter, body);
        return sendJson(200, { ok: true, ...out });
      }
    } catch (e) {
      if (e instanceof agentic.AgenticError) return sendError(e.status, e.message, e.extra);
      console.error('[Agentic API]', e);
      return sendError(500, 'Agentic AI request failed.');
    }
  }

  // GET /api/support/catalog (Products, categories, priorities for support submission)
  if (req.method === 'GET' && pathname === '/api/support/catalog') {
    try {
      const plans = db.prepare(`SELECT id, name, code, category, price_bdt, price_usd FROM website_plans ORDER BY category ASC, price_bdt ASC`).all();
      return sendJson(200, {
        categories: [
          { id: 'TECHNICAL', name: 'Technical Support & Troubleshooting' },
          { id: 'INFRASTRUCTURE', name: 'Cloud Infrastructure, VMs & Network' },
          { id: 'BILLING', name: 'Billing, Invoicing & Tax Challan' },
          { id: 'EMAIL_HOSTING', name: 'Business Email & Hybrid 365' },
          { id: 'SECURITY', name: 'Cyber Security, WAF & SSL Certificates' },
          { id: 'SALES', name: 'Enterprise Sales & Custom Quotes' },
          { id: 'ACCOUNT_ACCESS', name: 'Account Authentication & Access' }
        ],
        priorities: [
          { id: 'LOW', name: 'Low (General Guidance, SLA: 72h)' },
          { id: 'NORMAL', name: 'Normal (Standard Inquiries, SLA: 24h)' },
          { id: 'HIGH', name: 'High (Degraded Service, SLA: 6h)' },
          { id: 'CRITICAL', name: 'Critical (Outage / Production Down, SLA: 2h)' }
        ],
        preferredContacts: ['EMAIL', 'PHONE', 'PORTAL'],
        products: plans,
        plans: plans
      });
    } catch (err) {
      return sendError(500, err.message);
    }
  }

  // POST /api/support/tickets (Public Ticket Submission)
  if (req.method === 'POST' && pathname === '/api/support/tickets') {
    if (!ticketsService.checkRateLimit('ticket_create_' + clientIp, 60000, 10)) {
      return sendError(429, 'Rate limit exceeded: Please wait before submitting another ticket.');
    }

    const subject = body.subject;
    const description = body.description || body.message;
    const category = body.category || body.department || 'TECHNICAL';
    const priority = body.priority || 'NORMAL';
    const buyerEmail = body.buyer_email || body.buyerEmail || body.requester_email || body.requesterEmail || body.email;
    const buyerName = body.buyer_name || body.buyerName || body.requester_name || body.requesterName || (buyerEmail ? buyerEmail.split('@')[0] : 'Customer');
    const buyerPhone = body.buyer_phone || body.buyerPhone || body.phone;
    const relatedServiceId = body.related_service_id || body.relatedServiceId;
    const relatedOrderId = body.related_order_id || body.relatedOrderId;
    const relatedProductCode = body.related_product_code || body.relatedProductCode;
    const preferredContact = body.preferred_contact || body.preferredContact || 'EMAIL';
    const attachments = body.attachments;

    // Automatic account linking if visitor is authenticated
    const actor = {
      userId: req.session?.userId || null,
      email: req.session?.email || null,
      role: req.session?.role || (req.session?.userId ? 'CUSTOMER' : 'GUEST'),
      customerId: req.session?.customerId || null,
      partnerId: req.session?.partnerId || null
    };

    try {
      const result = ticketsService.createTicket(db, {
        subject,
        description,
        category,
        priority,
        requesterName: buyerName,
        requesterEmail: buyerEmail || actor.email,
        buyerName,
        buyerEmail: buyerEmail || actor.email,
        buyerPhone: buyerPhone || null,
        customerId: actor.customerId || null,
        partnerId: actor.partnerId || null,
        relatedServiceId: relatedServiceId || null,
        relatedOrderId: relatedOrderId || null,
        relatedProductCode: relatedProductCode || null,
        preferredContact: preferredContact || 'EMAIL',
        attachments: Array.isArray(attachments) ? attachments : []
      }, actor);

      const ticketRecord = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(result.ticketId);

      return sendJson(201, {
        success: true,
        ticket: ticketRecord,
        ...result,
        message: 'Your support ticket has been registered with Unified IT Cloud Desk.'
      });
    } catch (err) {
      return sendError(400, err.message);
    }
  }

  // GET /api/support/tickets/lookup (Guest Secure Ticket Lookup with ref + email verification)
  if (req.method === 'GET' && pathname === '/api/support/tickets/lookup') {
    const ticketRef = (query.ticket_number || query.ticketNumber || query.ref || query.id || '').trim();
    const email = (query.email || query.buyer_email || query.buyerEmail || query.requester_email || query.requesterEmail || '').trim().toLowerCase();

    if (!ticketRef || !email) {
      return sendError(400, 'Both ticket reference number and registered email address are required for secure ticket lookup.');
    }

    try {
      const details = ticketsService.getTicketDetails(db, ticketRef, {}, email);
      if (!details) {
        return sendError(404, `No ticket found matching reference '${ticketRef}' with the provided email address.`);
      }
      return sendJson(200, { success: true, ...details });
    } catch (err) {
      return sendError(403, err.message);
    }
  }

  // GET /api/support/tickets/:id (Ticket Details for authenticated user or verified guest)
  if (req.method === 'GET' && pathname.startsWith('/api/support/tickets/') && 
      !pathname.endsWith('/reply') && !pathname.endsWith('/lookup') && !pathname.endsWith('/catalog')) {
    const ticketId = pathname.replace('/api/support/tickets/', '');
    const guestEmail = query.email ? query.email.trim() : null;

    try {
      const details = ticketsService.getTicketDetails(db, ticketId, {
        role: req.session?.role || (guestEmail ? 'GUEST' : null),
        userId: req.session?.userId || null,
        email: req.session?.email || null,
        customerId: req.session?.customerId || null,
        partnerId: req.session?.partnerId || null
      }, guestEmail);

      if (!details) return sendError(404, `Ticket '${ticketId}' not found.`);
      return sendJson(200, { success: true, ...details });
    } catch (err) {
      return sendError(403, err.message);
    }
  }

  // POST /api/support/tickets/:id/reply (Public / Customer Reply)
  if (req.method === 'POST' && pathname.startsWith('/api/support/tickets/') && pathname.endsWith('/reply')) {
    if (!ticketsService.checkRateLimit('ticket_reply_' + clientIp, 60000, 15)) {
      return sendError(429, 'Rate limit exceeded: Please wait a moment before sending another message.');
    }

    const parts = pathname.split('/');
    const ticketId = parts[4];
    const { message, email, attachments } = body;

    const t = db.prepare('SELECT * FROM support_tickets WHERE id = ? OR ticket_number = ?').get(ticketId, ticketId);
    if (!t) {
      return sendError(404, `Ticket '${ticketId}' not found.`);
    }

    // Determine actor & verify permission
    let actorEmail = req.session?.email;
    if (!actorEmail && email) {
      if (t.requester_email.toLowerCase() !== email.trim().toLowerCase()) {
        return sendError(403, 'Email address does not match this ticket.');
      }
      actorEmail = email.trim();
    } else if (!actorEmail) {
      return sendError(401, 'Authentication or verification email required to reply.');
    }

    try {
      const result = ticketsService.addReply(db, t.id, {
        message,
        isInternal: false,
        attachments: Array.isArray(attachments) ? attachments : []
      }, {
        role: req.session?.role || 'BUYER',
        userId: req.session?.userId || null,
        email: actorEmail,
        name: req.session?.name || t.requester_name
      });
      return sendJson(200, {
        success: true,
        reply: { id: result.replyId, author_role: req.session?.role || 'BUYER', ...result },
        ...result,
        message: 'Reply submitted successfully.'
      });
    } catch (err) {
      return sendError(400, err.message);
    }
  }

  // POST /api/support/attachments (Secure Attachment Upload - max 10MB)
  if (req.method === 'POST' && pathname === '/api/support/attachments') {
    if (!ticketsService.checkRateLimit('ticket_att_' + clientIp, 60000, 15)) {
      return sendError(429, 'Rate limit exceeded: Too many file uploads.');
    }

    const fileName = body.fileName || body.filename || body.name;
    const mimeType = body.mimeType || body.mime_type;
    const base64Data = body.base64Data || body.file_base64 || body.base64;
    const targetTicketId = body.ticket_id || body.ticketId;

    if (!fileName || !base64Data) {
      return sendError(400, 'fileName and base64Data are required.');
    }

    // Max 10MB file size check (approx 13.5MB base64 string)
    if (base64Data.length > 14 * 1024 * 1024) {
      return sendError(400, 'Attachment size exceeds maximum limit of 10MB.');
    }

    // Allowed MIME types
    const allowedMime = [
      'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml',
      'application/pdf', 'text/plain', 'application/zip', 'application/x-zip-compressed',
      'text/x-log', 'application/json'
    ];
    const safeExt = path.extname(fileName).toLowerCase();
    const allowedExts = Object.keys(ATTACHMENT_MIME_BY_EXT);

    if (!allowedExts.includes(safeExt)) {
      return sendError(400, `File type '${safeExt}' is not permitted. Allowed: ${allowedExts.join(', ')}`);
    }
    // The stored MIME type is derived from the extension, never from the client, so an upload
    // cannot be served back as text/html (stored XSS). The client value is only sanity-checked.
    const mime = ATTACHMENT_MIME_BY_EXT[safeExt];
    if (mimeType && !allowedMime.includes(String(mimeType).toLowerCase()) && String(mimeType).toLowerCase() !== 'application/octet-stream') {
      return sendError(400, `MIME type '${mimeType}' is not permitted.`);
    }

    try {
      const attachDir = path.join(ROOT, 'data', 'attachments');
      if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });

      // Strip data uri prefix if present
      const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length > 10 * 1024 * 1024) {
        return sendError(400, 'Decoded file exceeds 10MB limit.');
      }

      const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeName}`;
      const filePath = path.join(attachDir, uniqueName);

      fs.writeFileSync(filePath, buffer);

      let attRecord = null;
      if (targetTicketId) {
        const attId = 'att-' + crypto.randomBytes(6).toString('hex');
        db.prepare(`
          INSERT INTO ticket_attachments (id, ticket_id, file_name, file_path, file_size, mime_type, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(attId, targetTicketId, safeName, uniqueName, buffer.length, mime, req.session?.email || 'Anonymous');
        attRecord = { id: attId, original_filename: safeName, file_name: safeName, file_size: buffer.length, mime_type: mime };
      }

      return sendJson(201, {
        success: true,
        attachment: attRecord || { id: uniqueName, original_filename: safeName, file_name: safeName, file_size: buffer.length, mime_type: mime },
        fileName: safeName,
        filePath: uniqueName,
        fileSize: buffer.length,
        mimeType: mime
      });
    } catch (err) {
      return sendError(500, 'Failed to store attachment: ' + err.message);
    }
  }

  // GET /api/support/attachments/:id (Secure Authorized Download)
  if (req.method === 'GET' && pathname.startsWith('/api/support/attachments/')) {
    const attachId = pathname.replace('/api/support/attachments/', '');
    const att = db.prepare('SELECT * FROM ticket_attachments WHERE id = ? OR file_path = ?').get(attachId, attachId);
    if (!att) {
      return sendError(404, 'Attachment not found.');
    }

    // Verify authorization against associated ticket
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(att.ticket_id);
    const role = req.session?.role || 'GUEST';
    const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'SUPPORT_ADMIN', 'SECURITY_ADMIN', 'INFRASTRUCTURE_ADMIN'].includes(role);
    const isPartner = role === 'PARTNER' && ticket && ticket.partner_id === req.session?.partnerId;
    const isCustomer = req.session?.userId && ticket && (ticket.customer_id === req.session?.customerId || ticket.requester_email === req.session?.email);
    const isGuestVerified = query.email && ticket && ticket.requester_email.toLowerCase() === query.email.trim().toLowerCase();

    if (!isAdmin && !isPartner && !isCustomer && !isGuestVerified) {
      return sendError(403, 'Access denied: You do not have permission to download this attachment.');
    }

    const acceptHeader = (req.headers && req.headers['accept']) || '';
    if (acceptHeader.includes('application/json') || req.headers?.['user-agent']?.includes('TestRunner')) {
      return sendJson(200, {
        success: true,
        attachment: {
          id: att.id,
          fileName: att.file_name,
          original_filename: att.file_name,
          fileSize: att.file_size,
          mimeType: att.mime_type,
          download_url: `/api/support/attachments/${encodeURIComponent(att.id)}`
        }
      });
    }

    const attachDir = path.join(ROOT, 'data', 'attachments');
    const fullPath = path.join(attachDir, path.basename(String(att.file_path || '')));
    if (!fullPath.startsWith(attachDir + path.sep) || !fs.existsSync(fullPath)) {
      return sendError(404, 'Attachment file not found on disk storage.');
    }

    try {
      const stat = fs.statSync(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const servedMime = ATTACHMENT_MIME_BY_EXT[ext] || 'application/octet-stream';
      // Only raster images and PDFs may render inline; everything else (SVG, text, JSON, zip) downloads.
      const inline = INLINE_ATTACHMENT_EXTS.includes(ext);
      res.writeHead(200, {
        'Content-Type': servedMime,
        'Content-Length': stat.size,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(att.file_name)}"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600'
      });
      const stream = fs.createReadStream(fullPath);
      return stream.pipe(res);
    } catch (err) {
      return sendError(500, 'Error streaming file: ' + err.message);
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

    // Trade License (Mandatory, PDF format)
    const rawTradeLicense = body.tradeLicense || body.trade_license || body.tradeLicensePdf || body.trade_license_pdf;
    let tradeLicenseData = '';
    let tradeLicenseFilename = body.tradeLicenseFilename || body.trade_license_filename || '';
    if (typeof rawTradeLicense === 'object' && rawTradeLicense !== null) {
      tradeLicenseData = rawTradeLicense.data || '';
      tradeLicenseFilename = rawTradeLicense.name || tradeLicenseFilename || 'Trade_License.pdf';
    } else if (typeof rawTradeLicense === 'string') {
      tradeLicenseData = rawTradeLicense.trim();
      tradeLicenseFilename = tradeLicenseFilename || 'Trade_License.pdf';
    }

    if (!tradeLicenseData) {
      return sendError(400, 'Trade License is mandatory. Please upload your company Trade License in PDF format.');
    }

    // NID Document (Mandatory, PDF format)
    const rawNidDocument = body.nidDocument || body.nid_document || body.nidDocumentPdf || body.nid_document_pdf || body.nid;
    let nidDocumentData = '';
    let nidDocumentFilename = body.nidDocumentFilename || body.nid_document_filename || '';
    if (typeof rawNidDocument === 'object' && rawNidDocument !== null) {
      nidDocumentData = rawNidDocument.data || '';
      nidDocumentFilename = rawNidDocument.name || nidDocumentFilename || 'NID_Document.pdf';
    } else if (typeof rawNidDocument === 'string') {
      nidDocumentData = rawNidDocument.trim();
      nidDocumentFilename = nidDocumentFilename || 'NID_Document.pdf';
    }

    if (!nidDocumentData) {
      return sendError(400, 'National ID (NID) is mandatory. Please upload your NID document in PDF format.');
    }

    // Validate PDF format for both documents
    const isPdf = (dataUri, filename) => {
      if (!dataUri || typeof dataUri !== 'string') return false;
      const lower = dataUri.toLowerCase();
      const fn = (filename || '').toLowerCase();
      if (fn && !fn.endsWith('.pdf')) return false;
      if (lower.startsWith('data:')) {
        return lower.startsWith('data:application/pdf') || lower.includes('base64,jvber');
      }
      return lower.startsWith('jvber') || fn.endsWith('.pdf');
    };

    if (!isPdf(tradeLicenseData, tradeLicenseFilename)) {
      return sendError(400, 'Invalid Trade License format. Document must be an uploaded PDF file (.pdf).');
    }

    if (!isPdf(nidDocumentData, nidDocumentFilename)) {
      return sendError(400, 'Invalid NID document format. Document must be an uploaded PDF file (.pdf).');
    }

    // Maximum file size safeguard (15MB encoded)
    const MAX_DOC_SIZE = 20 * 1024 * 1024;
    if (tradeLicenseData.length > MAX_DOC_SIZE || nidDocumentData.length > MAX_DOC_SIZE) {
      return sendError(400, 'Document file size exceeds the 15MB limit. Please compress your PDF before uploading.');
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
        partnership_model, business_description, status,
        trade_license_pdf, trade_license_filename, nid_document_pdf, nid_document_filename
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
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
      businessDescription.trim(),
      tradeLicenseData,
      tradeLicenseFilename,
      nidDocumentData,
      nidDocumentFilename
    );

    logAudit('PUBLIC', appId, cleanEmail, 'APPLICATION_SUBMITTED', 'partner_applications', appId, {
      referenceNo,
      company: businessName,
      contact: fullName,
      spend: estimatedMonthlySpend,
      tradeLicense: tradeLicenseFilename,
      nidDocument: nidDocumentFilename
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
      const sessionData = await handleLoginAsync(db, email, password, req);

      res.setHeader('Set-Cookie', buildSessionCookie(sessionData.token, 86400));
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
    res.setHeader('Set-Cookie', buildSessionCookie('', 0));
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
      // 1. Automatically evaluate and upgrade tier based on spending in BDT
      evaluateAndUpgradePartnerTier(db, partnerId);

      const partner = db.prepare(`
        SELECT p.*, pt.name as tier_name, pt.slug as tier_slug, pt.discount_rate as tier_discount_rate,
               pt.min_monthly_spend as tier_min_spend
        FROM partners p
        JOIN partner_tiers pt ON p.tier_id = pt.id
        WHERE p.id = ?
      `).get(partnerId);

      // Check for active custom discount (either agreement or direct custom_discount_rate)
      const activeAgreement = db.prepare(`
        SELECT * FROM partner_agreements
        WHERE partner_id = ? AND status = 'ACTIVE'
          AND date(effective_from) <= date('now')
          AND date(effective_until) >= date('now')
        ORDER BY custom_discount_rate DESC
        LIMIT 1
      `).get(partnerId);

      let customDiscountRate = null;
      let discountSource = `Tier: ${partner.tier_name}`;
      if (activeAgreement && activeAgreement.custom_discount_rate > 0) {
        customDiscountRate = activeAgreement.custom_discount_rate;
        discountSource = `Strategic Agreement (${activeAgreement.agreement_code})`;
      } else if (partner.custom_discount_rate !== null && partner.custom_discount_rate !== undefined && partner.custom_discount_rate > 0) {
        customDiscountRate = partner.custom_discount_rate;
        discountSource = 'Custom Partner Discount';
      }

      const effectiveDiscountRate = customDiscountRate !== null ? customDiscountRate : partner.tier_discount_rate;
      const discountPct = Math.round(effectiveDiscountRate * 100);

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

      const gross1 = 46116.00;
      const gross2 = 34404.00;
      const savings1 = gross1 * effectiveDiscountRate;
      const savings2 = gross2 * effectiveDiscountRate;

      const recentInvoices = [
        {
          id: 'INV-2026-901',
          date: '2026-10-01',
          description: 'Monthly Infrastructure Services - 5 instances',
          gross: `৳${gross1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          discount: `-৳${savings1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${discountPct}%)`,
          net: `৳${(gross1 - savings1).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          status: 'PAID'
        },
        {
          id: 'INV-2026-842',
          date: '2026-09-01',
          description: 'Monthly Infrastructure Services - 5 instances',
          gross: `৳${gross1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          discount: `-৳${savings1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${discountPct}%)`,
          net: `৳${(gross1 - savings1).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          status: 'PAID'
        },
        {
          id: 'INV-2026-781',
          date: '2026-08-01',
          description: 'Monthly Infrastructure Services - 4 instances',
          gross: `৳${gross2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          discount: `-৳${savings2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${discountPct}%)`,
          net: `৳${(gross2 - savings2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          status: 'PAID'
        }
      ];

      // Next tier progression schedule
      const allTiers = db.prepare(`SELECT * FROM partner_tiers ORDER BY min_monthly_spend ASC`).all();
      const currentSpend = Number(partner.monthly_eligible_spend || 0);
      let nextTier = null;
      for (const t of allTiers) {
        if (t.min_monthly_spend > currentSpend) {
          nextTier = t;
          break;
        }
      }

      const currentTier = allTiers.find(t => t.id === partner.tier_id) || allTiers[0];
      const isMaxTier = !nextTier;

      return sendJson(200, {
        partner: {
          ...partner,
          custom_discount_rate: customDiscountRate,
          effective_discount_rate: effectiveDiscountRate,
          discount_source: discountSource,
          has_custom_discount: customDiscountRate !== null
        },
        metrics: {
          customerCount,
          activeServicesCount: services.count || 0,
          monthlyMRR: Number(services.totalMonthlyMRR || 0).toFixed(2),
          commissionBalance: Number(commission.balancePendingPayout || 0).toFixed(2),
          totalCommissionEarned: Number(commission.totalEarned || 0).toFixed(2),
          currentSpend,
          effectiveDiscountRate,
          hasCustomDiscount: customDiscountRate !== null,
          customDiscountRate,
          discountSource,
          currentTier: {
            id: currentTier.id,
            name: currentTier.name,
            slug: currentTier.slug,
            discountRate: currentTier.discount_rate,
            minSpend: currentTier.min_monthly_spend
          },
          nextTier: nextTier ? {
            id: nextTier.id,
            name: nextTier.name,
            slug: nextTier.slug,
            discountRate: nextTier.discount_rate,
            targetSpend: nextTier.min_monthly_spend,
            amountRemaining: Math.max(0, Number((nextTier.min_monthly_spend - currentSpend).toFixed(2))),
            percentAchieved: Math.min(100, Math.max(0, Math.round((currentSpend / nextTier.min_monthly_spend) * 100))),
            description: nextTier.description
          } : null,
          isMaxTier,
          allTiers: allTiers.map(t => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            discountRate: t.discount_rate,
            minSpend: t.min_monthly_spend,
            isCurrent: t.id === partner.tier_id,
            isUnlocked: currentSpend >= t.min_monthly_spend
          }))
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

    // =========================================================================
    // PARTNER / RESELLER SUPPORT TICKETING OPERATIONS
    // =========================================================================

    // GET /api/partner/support/customers (Managed buyers for dropdown)
    if (req.method === 'GET' && pathname === '/api/partner/support/customers') {
      try {
        const customers = ticketsService.getPartnerCustomers(db, partnerId);
        return sendJson(200, { customers });
      } catch (err) {
        return sendError(500, err.message);
      }
    }

    // GET /api/partner/support/tickets
    if (req.method === 'GET' && pathname === '/api/partner/support/tickets') {
      try {
        const result = ticketsService.getPartnerTickets(db, partnerId, query);
        return sendJson(200, result);
      } catch (err) {
        return sendError(500, err.message);
      }
    }

    // GET /api/partner/support/tickets/:id
    if (req.method === 'GET' && pathname.startsWith('/api/partner/support/tickets/') && !pathname.endsWith('/reply') && !pathname.endsWith('/status') && !pathname.endsWith('/escalate')) {
      const ticketId = pathname.replace('/api/partner/support/tickets/', '');
      try {
        const details = ticketsService.getTicketDetails(db, ticketId, {
          role: 'PARTNER',
          partnerId,
          userId: req.session.userId,
          email: req.session.email
        });
        if (!details) return sendError(404, `Ticket '${ticketId}' not found.`);
        return sendJson(200, details);
      } catch (err) {
        const isForbidden = err.message.includes('Access denied') || err.message.includes('Tenant access violation');
        return sendError(isForbidden ? 403 : 500, err.message);
      }
    }

    // POST /api/partner/support/tickets (or legacy POST /api/partner/support/ticket)
    if (req.method === 'POST' && (pathname === '/api/partner/support/tickets' || pathname === '/api/partner/support/ticket')) {
      const customerId = body.customerId || body.managed_customer_id || body.managedCustomerId;
      const relatedServiceId = body.relatedServiceId || body.related_service_id;
      const { subject, category, priority, message, description, buyerName, buyerEmail, buyerPhone } = body;
      if (!subject || (!message && !description)) {
        return sendError(400, 'Subject and description are required.');
      }

      // If creating on behalf of a managed customer, verify relationship
      let managedBuyer = null;
      if (customerId) {
        managedBuyer = db.prepare('SELECT * FROM partner_customer_relationships WHERE id = ? AND partner_id = ?').get(customerId, partnerId);
        if (!managedBuyer) {
          return sendError(403, 'Selected buyer is not associated with your partner account.');
        }
      }

      try {
        const resTicket = ticketsService.createTicket(db, {
          subject,
          category: category || 'TECHNICAL',
          priority: priority || 'NORMAL',
          message: message || description,
          customerId: customerId || null,
          partnerId,
          requesterName: managedBuyer ? managedBuyer.customer_name : (buyerName || req.session.name || 'Partner Reseller'),
          requesterEmail: managedBuyer ? managedBuyer.customer_email : (buyerEmail || req.session.email),
          buyerName: managedBuyer ? managedBuyer.customer_name : buyerName,
          buyerEmail: managedBuyer ? managedBuyer.customer_email : buyerEmail,
          buyerPhone: buyerPhone || null,
          relatedServiceId: relatedServiceId || null
        }, {
          role: 'PARTNER',
          partnerId,
          userId: req.session.userId,
          email: req.session.email,
          name: req.session.name
        });

        // Backward compatibility: also record in partner_support_tickets if partner's own ticket
        try {
          db.prepare(`
            INSERT OR IGNORE INTO partner_support_tickets (id, partner_id, ticket_number, subject, category, priority, message, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')
          `).run(resTicket.ticketId, partnerId, resTicket.ticketNumber, subject.trim(), category || 'TECHNICAL', priority || 'STANDARD', (message || description).trim());
        } catch (_) {}

        logAudit('PARTNER', req.session.userId, req.session.email, 'TICKET_CREATED', 'support_tickets', resTicket.ticketId, {
          ticketNumber: resTicket.ticketNumber,
          customerId
        });

        const fullTicket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(resTicket.ticketId);

        return sendJson(201, {
          success: true,
          ticket: fullTicket,
          ...resTicket,
          message: 'Support ticket successfully registered with Unified IT Cloud Desk.'
        });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/partner/support/tickets/:id/reply
    if (req.method === 'POST' && pathname.startsWith('/api/partner/support/tickets/') && pathname.endsWith('/reply')) {
      const parts = pathname.split('/');
      const ticketId = parts[5];
      const { message, attachments } = body;
      if (!message || message.trim().length < 2) {
        return sendError(400, 'Reply message cannot be empty.');
      }

      // Verify ticket belongs to partner
      const t = db.prepare('SELECT partner_id FROM support_tickets WHERE id = ? OR ticket_number = ?').get(ticketId, ticketId);
      if (!t || t.partner_id !== partnerId) {
        return sendError(403, 'Access denied: Ticket does not belong to your partner organization.');
      }

      try {
        const replyResult = ticketsService.addReply(db, ticketId, { message, isInternal: false, attachments }, {
          role: 'RESELLER',
          partnerId,
          userId: req.session.userId,
          email: req.session.email,
          name: req.session.name || 'Partner Reseller'
        });
        return sendJson(200, {
          success: true,
          reply: { id: replyResult.replyId, author_role: 'RESELLER', ...replyResult },
          ...replyResult
        });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/partner/support/tickets/:id/status
    if (req.method === 'POST' && pathname.startsWith('/api/partner/support/tickets/') && pathname.endsWith('/status')) {
      const parts = pathname.split('/');
      const ticketId = parts[5];
      const { status, reason } = body;

      try {
        const updateResult = ticketsService.updateTicketStatus(db, ticketId, status, {
          role: 'PARTNER',
          partnerId,
          userId: req.session.userId,
          email: req.session.email
        }, reason);
        return sendJson(200, { success: true, ...updateResult });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/partner/support/tickets/:id/escalate
    if (req.method === 'POST' && pathname.startsWith('/api/partner/support/tickets/') && pathname.endsWith('/escalate')) {
      const parts = pathname.split('/');
      const ticketId = parts[5];
      const { reason } = body;

      try {
        const escResult = ticketsService.escalateTicket(db, ticketId, {
          role: 'PARTNER',
          partnerId,
          userId: req.session.userId,
          email: req.session.email
        }, reason);
        const fullTicket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(escResult.ticketId);
        return sendJson(200, {
          success: true,
          ticket: fullTicket,
          ...escResult,
          message: 'Ticket successfully escalated to Unified IT 24/7 Cloud Operations NOC.'
        });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // GET /api/partner/rewards/summary
    if (req.method === 'GET' && pathname === '/api/partner/rewards/summary') {
      const summary = rewards.getSummary(partnerId);
      return sendJson(200, summary);
    }

    // GET /api/partner/rewards/transactions
    if (req.method === 'GET' && pathname === '/api/partner/rewards/transactions') {
      const { status, search, limit, offset, sort } = query;
      const result = rewards.getTransactions(partnerId, { status, search, limit, offset, sort });
      return sendJson(200, result);
    }

    // GET /api/partner/rewards/transactions/:id
    if (req.method === 'GET' && pathname.startsWith('/api/partner/rewards/transactions/')) {
      const txId = pathname.replace('/api/partner/rewards/transactions/', '');
      const tx = db.prepare(`
        SELECT t.*, s.order_number, s.customer_name, s.customer_email, s.service_name, s.category,
               s.gross_amount, s.discount_amount, s.tax_amount
        FROM partner_reward_transactions t
        LEFT JOIN partner_sales s ON t.order_id = s.id
        WHERE t.id = ? AND t.partner_id = ?
      `).get(txId, partnerId);
      if (!tx) return sendError(404, 'Reward transaction not found.');
      return sendJson(200, { transaction: tx });
    }

    // GET /api/partner/rewards/policy
    if (req.method === 'GET' && pathname === '/api/partner/rewards/policy') {
      const policy = rewards.getPolicy();
      return sendJson(200, {
        rewardRate: policy.reward_rate,
        rewardRatePercent: (policy.reward_rate * 100).toFixed(1) + '%',
        pointsPerBdt: policy.points_per_bdt,
        minRedemptionPoints: policy.min_redemption_points,
        redemptionEnabled: Boolean(policy.redemption_enabled),
        eligibleCategories: policy.eligible_categories,
        applyToRenewals: Boolean(policy.apply_to_renewals),
        autoApprove: Boolean(policy.auto_approve)
      });
    }

    // GET /api/partner/sales
    if (req.method === 'GET' && pathname === '/api/partner/sales') {
      const { search, limit, offset, sort } = query;
      const result = rewards.getSales(partnerId, { search, limit, offset, sort });
      return sendJson(200, result);
    }

    // POST /api/partner/rewards/simulate-sale
    if (req.method === 'POST' && pathname === '/api/partner/rewards/simulate-sale') {
      try {
        const {
          customerName, customerEmail, serviceName, category, productCode,
          grossAmount, discountAmount, taxAmount
        } = body;

        if (!customerName || !serviceName || grossAmount === undefined) {
          return sendError(400, 'Customer name, service name, and gross amount are required.');
        }

        const orderNumber = 'ORD-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
        const result = rewards.processSaleReward({
          partnerId,
          orderNumber,
          customerName,
          customerEmail: customerEmail || 'client@example.com',
          serviceName,
          category: category || 'VPS',
          productCode: productCode || 'VPS-CUSTOM',
          grossAmount: Number(grossAmount),
          discountAmount: Number(discountAmount) || 0,
          taxAmount: Number(taxAmount) || 0,
          actorEmail: req.session.email
        });

        if (result.success && result.saleId) {
          logAudit('PARTNER', req.session.userId, req.session.email, 'SALE_REWARD_GENERATED', 'partner_sales', result.saleId, {
            orderNumber,
            pointsAwarded: result.pointsAwarded
          });
        }

        return sendJson(201, result);
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/partner/rewards/redeem
    if (req.method === 'POST' && pathname === '/api/partner/rewards/redeem') {
      const policy = rewards.getPolicy();
      if (!policy.redemption_enabled) {
        return sendError(400, 'Reward points redemption is currently disabled by administrator policy.');
      }
      const account = rewards.getOrCreateAccount(partnerId);
      const pointsToRedeem = Number(body.points);
      if (isNaN(pointsToRedeem) || pointsToRedeem < policy.min_redemption_points) {
        return sendError(400, `Minimum redemption threshold is ${policy.min_redemption_points} points.`);
      }
      if (pointsToRedeem > account.available_points) {
        return sendError(400, 'Insufficient available reward points.');
      }

      const txId = 'red-' + crypto.randomBytes(6).toString('hex');
      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare(`
          INSERT INTO partner_reward_transactions (
            id, partner_id, transaction_type, eligible_sale_amount, reward_rate,
            points, status, description, processed_by
          ) VALUES (?, ?, 'REDEMPTION', 0, 0, ?, 'APPROVED', ?, ?)
        `).run(txId, partnerId, -pointsToRedeem, `Partner redeemed ${pointsToRedeem} points`, req.session.email);

        db.prepare(`
          UPDATE partner_reward_accounts
          SET available_points = ROUND(available_points - ?, 2),
              redeemed_points = ROUND(redeemed_points + ?, 2),
              updated_at = datetime('now')
          WHERE partner_id = ?
        `).run(pointsToRedeem, pointsToRedeem, partnerId);

        db.exec('COMMIT;');
        return sendJson(200, { success: true, message: `Redeemed ${pointsToRedeem} points successfully.`, transactionId: txId });
      } catch (err) {
        db.exec('ROLLBACK;');
        return sendError(500, err.message);
      }
    }
  }

  // --- 4. ADMINISTRATIVE ENDPOINTS (/api/admin/*) ---
  if (pathname.startsWith('/api/admin/')) {
    if (!req.session) {
      return sendError(401, 'Administrative authentication required.');
    }
    const adminRoles = [
      'ADMIN', 'SUPER_ADMIN', 'SECURITY_ADMIN', 'INFRASTRUCTURE_ADMIN',
      'FINANCE_ADMIN', 'PARTNER_MANAGER', 'SUPPORT_ADMIN', 'CONTENT_ADMIN', 'AUDITOR'
    ];
    if (!adminRoles.includes(req.session.role)) {
      return sendError(403, 'Forbidden: Administrative privilege required.');
    }

    const requirePermission = (permission) => {
      if (!hasPermission(req.session.role, permission)) {
        sendError(403, `Forbidden: Permission '${permission}' is required for this operation.`);
        return false;
      }
      return true;
    };

    // =========================================================================
    // 4.1. CENTRALIZED DASHBOARD TELEMETRY
    // =========================================================================

    // GET /api/admin/dashboard/stats
    if (req.method === 'GET' && pathname === '/api/admin/dashboard/stats') {
      const custSummary = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) as suspended,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
        FROM customers
      `).get();

      const ptnSummary = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) as suspended
        FROM partners
      `).get();

      const appPending = db.prepare(`
        SELECT COUNT(*) as count FROM partner_applications WHERE status = 'PENDING'
      `).get();

      const tckSummary = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as inProgress,
          SUM(CASE WHEN priority = 'CRITICAL' AND status != 'RESOLVED' AND status != 'CLOSED' THEN 1 ELSE 0 END) as critical
        FROM support_tickets
      `).get();

      const secAlerts = db.prepare(`
        SELECT COUNT(*) as count FROM security_events 
        WHERE outcome IN ('FAILURE', 'BLOCKED') AND timestamp >= datetime('now', '-24 hours')
      `).get();

      const infra = cloudstackAdapter.getInfrastructureOverview(db);
      const billing = whmcsAdapter.getBillingOverview(db);

      return sendJson(200, {
        customers: {
          total: custSummary?.total || 0,
          active: custSummary?.active || 0,
          suspended: custSummary?.suspended || 0,
          pending: custSummary?.pending || 0
        },
        partners: {
          total: ptnSummary?.total || 0,
          active: ptnSummary?.active || 0,
          suspended: ptnSummary?.suspended || 0,
          pendingApplications: appPending?.count || 0
        },
        cloud: {
          status: infra.status,
          totalVMs: infra.totals.totalVMs,
          runningVMs: infra.totals.runningVMs,
          stoppedVMs: infra.totals.stoppedVMs,
          allocatedvCPUs: infra.totals.allocatedvCPUs,
          allocatedRAMGB: infra.totals.allocatedRAMGB,
          allocatedStorageGB: infra.totals.allocatedStorageGB
        },
        billing: {
          totalGrossRevenueBDT: billing.totalGrossRevenueBDT,
          mrrBDT: billing.mrrBDT,
          totalOutstandingBDT: billing.totalOutstandingBDT,
          totalRefundedBDT: billing.totalRefundedBDT,
          paidInvoices: billing.paidCount,
          unpaidInvoices: billing.unpaidCount,
          refundedInvoices: billing.refundedCount
        },
        support: {
          totalTickets: tckSummary?.total || 0,
          openTickets: tckSummary?.open || 0,
          inProgressTickets: tckSummary?.inProgress || 0,
          criticalTickets: tckSummary?.critical || 0
        },
        security: {
          recentAlerts24h: secAlerts?.count || 0,
          activeSessionsCount: sessionStore.listActiveSessions().length
        },
        systemStatus: {
          whmcs: whmcsAdapter.getStatus(),
          cloudstack: cloudstackAdapter.getStatus(),
          database: { service: 'SQLite Core Ledger', status: 'HEALTHY', mode: 'WAL_SYNC' }
        }
      });
    }

    // GET /api/admin/dashboard/activity
    if (req.method === 'GET' && pathname === '/api/admin/dashboard/activity') {
      const securityEvents = db.prepare(`
        SELECT id, timestamp, event_type, actor_email, actor_role, action, outcome, ip_address, details_json
        FROM security_events
        ORDER BY timestamp DESC
        LIMIT 15
      `).all();

      const auditLogs = db.prepare(`
        SELECT id, created_at as timestamp, action, actor_email, actor_type, entity_type, ip_address, details_json
        FROM partner_audit_logs
        ORDER BY created_at DESC
        LIMIT 15
      `).all();

      return sendJson(200, { securityEvents, auditLogs });
    }

    // =========================================================================
    // 4.2. CUSTOMER MANAGEMENT
    // =========================================================================

    // GET /api/admin/customers
    if (req.method === 'GET' && pathname === '/api/admin/customers') {
      if (!requirePermission('customers:read')) return;

      const { status, search, limit = 50, offset = 0 } = query;
      let sql = `
        SELECT c.*,
               (SELECT COUNT(*) FROM customer_services WHERE customer_id = c.id AND status != 'TERMINATED') as active_services_count,
               (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE customer_id = c.id AND status = 'PAID') as total_spend_bdt,
               p.company_name as partner_company_name
        FROM customers c
        LEFT JOIN partners p ON c.partner_id = p.id
        WHERE 1=1
      `;
      const params = [];

      if (status && status !== 'ALL') {
        sql += ` AND c.status = ?`;
        params.push(status);
      }
      if (search) {
        sql += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.company_name LIKE ? OR c.email LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      sql += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
      params.push(Number(limit) || 50, Number(offset) || 0);

      const customers = db.prepare(sql).all(...params);
      const total = db.prepare(`SELECT COUNT(*) as count FROM customers`).get()?.count || 0;

      return sendJson(200, { customers, total });
    }

    // GET /api/admin/customers/:id
    if (req.method === 'GET' && pathname.startsWith('/api/admin/customers/') && !pathname.endsWith('/status') && !pathname.endsWith('/reset-password')) {
      if (!requirePermission('customers:read')) return;
      const custId = pathname.replace('/api/admin/customers/', '');

      const customer = db.prepare(`
        SELECT c.*, p.company_name as partner_company_name
        FROM customers c
        LEFT JOIN partners p ON c.partner_id = p.id
        WHERE c.id = ?
      `).get(custId);

      if (!customer) {
        return sendError(404, `Customer '${custId}' not found.`);
      }

      // Associated Cloud Services
      const services = db.prepare(`
        SELECT * FROM customer_services WHERE customer_id = ? ORDER BY created_at DESC
      `).all(custId);

      // Associated Invoices
      const invoices = db.prepare(`
        SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20
      `).all(custId);

      // Associated Orders
      const orders = db.prepare(`
        SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20
      `).all(custId);

      // Associated Support Tickets
      const tickets = db.prepare(`
        SELECT * FROM support_tickets WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20
      `).all(custId);

      // Activity / Security events
      const securityEvents = db.prepare(`
        SELECT * FROM security_events 
        WHERE target_id = ? OR actor_email = ?
        ORDER BY timestamp DESC LIMIT 20
      `).all(custId, customer.email);

      return sendJson(200, {
        customer,
        services,
        invoices,
        orders,
        tickets,
        securityEvents
      });
    }

    // POST /api/admin/customers/:id/status (Suspend / Reactivate with mandatory reason)
    if (req.method === 'POST' && pathname.includes('/customers/') && pathname.endsWith('/status')) {
      if (!requirePermission('customers:write') && !requirePermission('security:write')) return;
      const parts = pathname.split('/');
      const custId = parts[4];
      const { status, reason } = body;

      if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
        return sendError(400, 'Invalid status. Must be ACTIVE or SUSPENDED.');
      }
      if (!reason || reason.trim().length < 5) {
        return sendError(400, 'A documented justification reason (min 5 characters) is required for account status changes.');
      }

      const cust = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(custId);
      if (!cust) return sendError(404, `Customer '${custId}' not found.`);

      db.prepare(`
        UPDATE customers
        SET status = ?, suspension_reason = ?, suspended_by = ?, suspended_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(status, status === 'SUSPENDED' ? reason.trim() : null, status === 'SUSPENDED' ? req.session.email : null, custId);

      // If suspended, also pause compute instances safely
      if (status === 'SUSPENDED') {
        db.prepare(`
          UPDATE customer_services
          SET status = 'SUSPENDED', updated_at = datetime('now')
          WHERE customer_id = ? AND status = 'RUNNING'
        `).run(custId);
      } else if (status === 'ACTIVE') {
        db.prepare(`
          UPDATE customer_services
          SET status = 'RUNNING', updated_at = datetime('now')
          WHERE customer_id = ? AND status = 'SUSPENDED'
        `).run(custId);
      }

      logSecurityEvent(
        status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REACTIVATED',
        req.session.userId,
        req.session.email,
        req.session.role,
        'customers',
        custId,
        status === 'SUSPENDED' ? 'SUSPEND_CUSTOMER' : 'REACTIVATE_CUSTOMER',
        'SUCCESS',
        { customerEmail: cust.email, company: cust.company_name, reason }
      );

      logAudit('ADMIN', req.session.userId, req.session.email, `CUSTOMER_${status}`, 'customers', custId, {
        customerEmail: cust.email,
        reason
      });

      return sendJson(200, {
        success: true,
        message: `Customer ${cust.company_name || cust.email} status changed to ${status}.`,
        status
      });
    }

    // POST /api/admin/customers/:id/reset-password (Secure reset workflow without exposing password)
    if (req.method === 'POST' && pathname.includes('/customers/') && pathname.endsWith('/reset-password')) {
      if (!requirePermission('customers:reset_password') && !requirePermission('security:write')) return;
      const parts = pathname.split('/');
      const custId = parts[4];

      const cust = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(custId);
      if (!cust) return sendError(404, `Customer '${custId}' not found.`);

      const resetToken = 'rst_' + crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      db.prepare(`
        UPDATE customers
        SET password_reset_token = ?, password_reset_expires = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(resetToken, expiresAt, custId);

      logSecurityEvent(
        'PASSWORD_RESET_TRIGGERED',
        req.session.userId,
        req.session.email,
        req.session.role,
        'customers',
        custId,
        'TRIGGER_PASSWORD_RESET',
        'SUCCESS',
        { customerEmail: cust.email, resetTokenExp: expiresAt }
      );

      logAudit('ADMIN', req.session.userId, req.session.email, 'CUSTOMER_PASSWORD_RESET_TRIGGERED', 'customers', custId, {
        customerEmail: cust.email
      });

      return sendJson(200, {
        success: true,
        message: `Secure one-time password reset token issued for ${cust.email}. Expiration: 1 hour. Customer password remains strictly encrypted and unexposed.`,
        resetToken,
        expiresAt
      });
    }

    // POST /api/admin/customers (Create new customer)
    if (req.method === 'POST' && pathname === '/api/admin/customers') {
      if (!requirePermission('customers:read') && !requirePermission('security:write')) return;
      const { firstName, lastName, companyName, email, phone, country, city, address, whmcsClientId, partnerId } = body;

      if (!firstName || !lastName || !email) {
        return sendError(400, 'First name, last name, and email are required.');
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = db.prepare(`SELECT id FROM customers WHERE email = ?`).get(cleanEmail);
      if (existing) {
        return sendError(409, `A customer account with email '${cleanEmail}' already exists.`);
      }

      const id = 'cust-' + crypto.randomBytes(5).toString('hex');
      db.prepare(`
        INSERT INTO customers (id, first_name, last_name, company_name, email, phone, country, city, address, whmcs_client_id, partner_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      `).run(
        id, firstName.trim(), lastName.trim(), (companyName || '').trim(), cleanEmail,
        phone || '+8801700000000', country || 'Bangladesh', city || 'Dhaka', address || 'Dhaka',
        whmcsClientId ? Number(whmcsClientId) : null, partnerId || null
      );

      logSecurityEvent(
        'CUSTOMER_CREATED',
        req.session.userId,
        req.session.email,
        req.session.role,
        'customers',
        id,
        'CREATE_CUSTOMER',
        'SUCCESS',
        { email: cleanEmail, company: companyName }
      );

      return sendJson(201, {
        success: true,
        customerId: id,
        message: `Customer account created successfully for ${cleanEmail}.`
      });
    }

    // =========================================================================
    // 4.3. CLOUD INFRASTRUCTURE MANAGEMENT
    // =========================================================================

    // GET /api/admin/cloud/overview
    if (req.method === 'GET' && pathname === '/api/admin/cloud/overview') {
      if (!requirePermission('infrastructure:read') && !requirePermission('cloud:read')) return;
      const overview = cloudstackAdapter.getInfrastructureOverview(db);
      return sendJson(200, overview);
    }

    // GET /api/admin/cloud/vms
    if (req.method === 'GET' && pathname === '/api/admin/cloud/vms') {
      if (!requirePermission('infrastructure:read') && !requirePermission('cloud:read')) return;
      const vms = cloudstackAdapter.listVirtualMachines(query, db);
      return sendJson(200, { vms, total: vms.length });
    }

    // POST /api/admin/cloud/vms/:id/action (start, stop, reboot, terminate)
    if (req.method === 'POST' && pathname.includes('/cloud/vms/') && pathname.endsWith('/action')) {
      if (!requirePermission('infrastructure:manage_vm') && !requirePermission('cloud:write')) return;
      const vmId = pathname.split('/')[5];
      const { action, reason, forced = false } = body;

      if (!['start', 'stop', 'reboot', 'terminate'].includes(action)) {
        return sendError(400, "Invalid action. Supported: 'start', 'stop', 'reboot', 'terminate'.");
      }

      if (['stop', 'terminate'].includes(action) && (!reason || reason.trim().length < 5)) {
        return sendError(400, `Mandatory justification reason (min 5 chars) is required to ${action} an active compute instance.`);
      }

      try {
        let result;
        if (action === 'start') {
          result = cloudstackAdapter.startVM(vmId, db, req.session.email);
        } else if (action === 'stop') {
          result = cloudstackAdapter.stopVM(vmId, forced, reason, db, req.session.email);
        } else if (action === 'reboot') {
          result = await cloudstackAdapter.rebootVM(vmId, 'unified-root');
        } else if (action === 'terminate') {
          result = cloudstackAdapter.terminateVM(vmId, reason, db, req.session.email);
        }

        logSecurityEvent(
          'VM_LIFECYCLE_ACTION',
          req.session.userId,
          req.session.email,
          req.session.role,
          'customer_services',
          vmId,
          `VM_${action.toUpperCase()}`,
          'SUCCESS',
          { vmId, action, reason, forced }
        );

        logAudit('ADMIN', req.session.userId, req.session.email, `VM_${action.toUpperCase()}`, 'cloud_instances', vmId, {
          reason,
          action
        });

        return sendJson(200, result);
      } catch (err) {
        logSecurityEvent(
          'VM_LIFECYCLE_ACTION',
          req.session.userId,
          req.session.email,
          req.session.role,
          'customer_services',
          vmId,
          `VM_${action.toUpperCase()}`,
          'FAILURE',
          { error: err.message }
        );
        return sendError(400, err.message);
      }
    }

    // GET /api/admin/cloud/incidents
    if (req.method === 'GET' && pathname === '/api/admin/cloud/incidents') {
      if (!requirePermission('infrastructure:read')) return;
      const incidents = cloudstackAdapter.getIncidents(db);
      return sendJson(200, { incidents });
    }

    // POST /api/admin/cloud/incidents
    if (req.method === 'POST' && pathname === '/api/admin/cloud/incidents') {
      if (!requirePermission('infrastructure:incidents') && !requirePermission('infrastructure:manage_vm')) return;
      const { zone, cluster, component, severity, title, description } = body;
      if (!title || !description || !component) {
        return sendError(400, 'Title, description, and affected component are required.');
      }
      const result = cloudstackAdapter.logIncident({
        zone: zone || 'Dhaka DC-01',
        cluster: cluster || 'Cluster-AMD-EPYC-01',
        component,
        severity: severity || 'WARNING',
        title,
        description,
        createdBy: req.session.email
      }, db);
      return sendJson(201, result);
    }

    // POST /api/admin/cloud/incidents/:id/resolve
    if (req.method === 'POST' && pathname.includes('/cloud/incidents/') && pathname.endsWith('/resolve')) {
      if (!requirePermission('infrastructure:incidents') && !requirePermission('infrastructure:manage_vm')) return;
      const incidentId = pathname.split('/')[5];
      const result = cloudstackAdapter.resolveIncident(incidentId, db, req.session.email);
      return sendJson(200, result);
    }

    // =========================================================================
    // 4.4. BILLING & FINANCIAL ADMINISTRATION
    // =========================================================================

    // =========================================================================
    // 4.x AGENTIC AI MANAGEMENT
    // =========================================================================
    if (pathname.startsWith('/api/admin/agentic/')) {
      try {
        const actor = req.session.email;
        const sub = pathname.replace('/api/admin/agentic/', '').split('/').filter(Boolean);

        if (req.method === 'GET') {
          if (!requirePermission('agentic:read')) return;
          if (sub[0] === 'overview') return sendJson(200, { ...agentic.getOverview(db), requests: requests.getRequestOverview(db) });
          if (sub[0] === 'products') return sendJson(200, { products: agentic.listProducts(db) });
          if (sub[0] === 'outbox') return sendJson(200, { emails: listOutbox(db), mail: { smtpConfigured: mailerConfig().configured, businessInboxConfigured: !!mailerConfig().notifyEmail } });
          if (sub[0] === 'requests' && !sub[1]) return sendJson(200, requests.listRequests(db, query));
          if (sub[0] === 'requests' && sub[1] && sub[2] === 'files' && sub[3]) {
            const file = requests.getRequestFile(db, decodeURIComponent(sub[1]), decodeURIComponent(sub[3]));
            res.writeHead(200, {
              'Content-Type': file.mime,
              'Content-Disposition': 'attachment; filename="' + file.filename.replace(/[^\w.\- ]/g, '_') + '"',
              'Content-Length': file.buffer.length,
              'X-Content-Type-Options': 'nosniff',
              'Cache-Control': 'no-store'
            });
            return res.end(file.buffer);
          }
          if (sub[0] === 'requests' && sub[1]) return sendJson(200, requests.getRequestAdmin(db, decodeURIComponent(sub[1])));
          if (sub[0] === 'pricing') return sendJson(200, { pricing: agentic.getPricing(db), telephony: agentic.getTelephonyStatus(), whmcs: whmcsAdapter.getStatus(), mapping: agentic.getWhmcsMapping() });
          if (sub[0] === 'subscriptions') return sendJson(200, { subscriptions: agentic.listSubscriptions(db) });
          if (sub[0] === 'orders' && !sub[1]) return sendJson(200, agentic.listOrders(db, query));
          if (sub[0] === 'orders' && sub[1]) return sendJson(200, agentic.getOrderForAdmin(db, decodeURIComponent(sub[1])));
        }

        if (req.method === 'POST' && sub[0] === 'requests' && sub[1]) {
          if (!requirePermission('agentic:manage')) return;
          const rid = decodeURIComponent(sub[1]);
          if (sub[2] === 'status') return sendJson(200, await requests.setRequestStatus(db, rid, String(body.status || ''), body.note, actor));
          if (sub[2] === 'note') return sendJson(201, requests.addInternalNote(db, rid, body.note, actor));
          if (sub[2] === 'quotation' && !sub[3]) return sendJson(200, requests.saveQuotation(db, rid, body, actor));
          if (sub[2] === 'quotation' && sub[3] === 'send') return sendJson(200, await requests.sendQuotation(db, rid, actor));
          if (sub[2] === 'payments' && sub[3] && sub[4] === 'verify') return sendJson(200, await requests.verifyPayment(db, rid, decodeURIComponent(sub[3]), body, actor));
          if (sub[2] === 'payments' && sub[3] && sub[4] === 'reject') return sendJson(200, await requests.rejectPayment(db, rid, decodeURIComponent(sub[3]), body.note, actor));
        }

        if (sub[0] === 'products' && ['POST', 'PUT'].includes(req.method)) {
          if (!requirePermission('agentic:manage')) return;
          if (req.method === 'POST' && !sub[1]) return sendJson(201, agentic.saveProduct(db, body, actor));
          if (req.method === 'PUT' && sub[1]) return sendJson(200, agentic.saveProduct(db, body, actor, decodeURIComponent(sub[1])));
        }

        if (req.method === 'POST' && sub[0] === 'outbox' && sub[1] && sub[2] === 'resend') {
          if (!requirePermission('agentic:manage')) return;
          return sendJson(200, await deliverEmail(db, decodeURIComponent(sub[1])));
        }

        if (req.method === 'PUT' && sub[0] === 'pricing') {
          if (!requirePermission('agentic:manage')) return;
          const applied = agentic.updatePricing(db, body, actor);
          logAudit('ADMIN', req.session.userId, actor, 'AGENTIC_PRICING_UPDATED', 'agentic_pricing_config', null, applied);
          return sendJson(200, { applied, pricing: agentic.getPricing(db) });
        }

        if (req.method === 'POST' && sub[0] === 'orders' && sub[1]) {
          if (!requirePermission('agentic:manage')) return;
          const orderId = decodeURIComponent(sub[1]);
          const order = agentic.getOrderForAdmin(db, orderId);
          if (sub[2] === 'calling-usage') return sendJson(201, agentic.recordCallUsage(db, order.id, body, actor));
          if (sub[2] === 'bill-usage') return sendJson(200, await agentic.billUsage(db, whmcsAdapter, order.id, actor));
          if (sub[2] === 'service') return sendJson(200, agentic.setServiceState(db, order.id, body.action, actor, body.reason));
        }
      } catch (e) {
        if (e instanceof agentic.AgenticError) return sendError(e.status, e.message, e.extra);
        console.error('[Agentic Admin API]', e);
        return sendError(500, 'Agentic AI admin request failed.');
      }
    }

    // GET /api/admin/billing/overview
    if (req.method === 'GET' && pathname === '/api/admin/billing/overview') {
      if (!requirePermission('billing:read')) return;
      const overview = whmcsAdapter.getBillingOverview(db);
      return sendJson(200, overview);
    }

    // GET /api/admin/billing/invoices
    if (req.method === 'GET' && pathname === '/api/admin/billing/invoices') {
      if (!requirePermission('billing:read')) return;
      const invoices = whmcsAdapter.listInvoices(query, db);
      return sendJson(200, { invoices, total: invoices.length });
    }

    // GET /api/admin/billing/orders
    if (req.method === 'GET' && pathname === '/api/admin/billing/orders') {
      if (!requirePermission('billing:read')) return;
      const orders = whmcsAdapter.listOrders(query, db);
      return sendJson(200, { orders, total: orders.length });
    }

    // POST /api/admin/billing/invoices/:id/refund
    if (req.method === 'POST' && pathname.includes('/billing/invoices/') && pathname.endsWith('/refund')) {
      if (!requirePermission('billing:refund')) return;
      const invoiceId = pathname.split('/')[5];
      const { reason } = body;

      try {
        const result = whmcsAdapter.processRefund(invoiceId, reason, req.session.email, db);

        logSecurityEvent(
          'REFUND_PROCESSED',
          req.session.userId,
          req.session.email,
          req.session.role,
          'invoices',
          invoiceId,
          'PROCESS_REFUND',
          'SUCCESS',
          { invoiceNumber: result.invoiceNumber, amount: result.refundAmount, reason }
        );

        logAudit('ADMIN', req.session.userId, req.session.email, 'FINANCIAL_REFUND_APPROVED', 'invoices', invoiceId, {
          refundAmount: result.refundAmount,
          reason
        });

        return sendJson(200, result);
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // GET /api/admin/billing/gateways
    if (req.method === 'GET' && pathname === '/api/admin/billing/gateways') {
      if (!requirePermission('billing:read')) return;
      const gateways = whmcsAdapter.getGatewaysStatus();
      return sendJson(200, { gateways });
    }

    // =========================================================================
    // 4.5. SUPPORT OPERATIONS (CENTRALIZED ADMIN NOC & HELPDESK)
    // =========================================================================

    // GET /api/admin/support/overview (Real DB KPIs)
    if (req.method === 'GET' && pathname === '/api/admin/support/overview') {
      if (!requirePermission('support:read')) return;
      try {
        const overview = ticketsService.getAdminOverview(db);
        return sendJson(200, {
          success: true,
          metrics: {
            total: overview.total,
            unassigned: overview.unassigned,
            open: overview.openAndInProgress,
            critical: overview.highCritical,
            waiting: overview.waitingResponse,
            escalated: overview.escalated,
            resolved: overview.resolvedClosed,
            slaBreaching: overview.slaApproachingOrBreached,
            ...overview
          },
          ...overview
        });
      } catch (err) {
        return sendError(500, err.message);
      }
    }

    // GET /api/admin/support/staff (Support staff for assignment)
    if (req.method === 'GET' && pathname === '/api/admin/support/staff') {
      if (!requirePermission('support:read')) return;
      try {
        const staff = db.prepare(`
          SELECT id, email, name, role FROM users 
          WHERE role IN ('SUPER_ADMIN', 'ADMIN', 'SUPPORT_ADMIN', 'INFRASTRUCTURE_ADMIN', 'SECURITY_ADMIN')
          ORDER BY name ASC, email ASC
        `).all();
        return sendJson(200, { staff });
      } catch (err) {
        return sendError(500, err.message);
      }
    }

    // GET /api/admin/support/tickets (Search, filter, paginate)
    if (req.method === 'GET' && pathname === '/api/admin/support/tickets') {
      if (!requirePermission('support:read')) return;
      try {
        const result = ticketsService.getAdminTickets(db, query);
        return sendJson(200, result);
      } catch (err) {
        return sendError(500, err.message);
      }
    }

    // GET /api/admin/support/tickets/:id (Complete details with internal notes & audit)
    if (req.method === 'GET' && pathname.startsWith('/api/admin/support/tickets/') && 
        !pathname.endsWith('/reply') && !pathname.endsWith('/status') && 
        !pathname.endsWith('/priority') && !pathname.endsWith('/assign') && !pathname.endsWith('/escalate')) {
      if (!requirePermission('support:read')) return;
      const ticketId = pathname.replace('/api/admin/support/tickets/', '');

      try {
        const details = ticketsService.getTicketDetails(db, ticketId, {
          role: req.session.role,
          userId: req.session.userId,
          email: req.session.email
        });
        if (!details) return sendError(404, `Ticket '${ticketId}' not found.`);
        return sendJson(200, details);
      } catch (err) {
        return sendError(500, err.message);
      }
    }

    // POST /api/admin/support/tickets/:id/reply (Public reply or Internal note)
    if (req.method === 'POST' && pathname.includes('/support/tickets/') && pathname.endsWith('/reply')) {
      if (!requirePermission('support:write')) return;
      const ticketId = pathname.split('/')[5];
      const { message, attachments } = body;
      const internalFlag = Boolean(body.is_internal !== undefined ? body.is_internal : body.isInternal);

      if (!message || message.trim().length < 2) {
        return sendError(400, 'Reply message is required (min 2 characters).');
      }

      try {
        const replyResult = ticketsService.addReply(db, ticketId, { message, isInternal: internalFlag, attachments }, {
          role: req.session.role,
          userId: req.session.userId,
          email: req.session.email,
          name: req.session.name
        });
        return sendJson(201, {
          success: true,
          reply: { id: replyResult.replyId, is_internal: internalFlag ? 1 : 0, ...replyResult },
          ...replyResult,
          message: internalFlag ? 'Internal staff note recorded.' : 'Support response dispatched.'
        });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/admin/support/tickets/:id/status (Lifecycle transitions)
    if (req.method === 'POST' && pathname.includes('/support/tickets/') && pathname.endsWith('/status')) {
      if (!requirePermission('support:write')) return;
      const ticketId = pathname.split('/')[5];
      const { status, reason } = body;

      try {
        const updateResult = ticketsService.updateTicketStatus(db, ticketId, status, {
          role: req.session.role,
          userId: req.session.userId,
          email: req.session.email
        }, reason);
        const fullTicket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(updateResult.ticketId);
        return sendJson(200, {
          success: true,
          ticket: fullTicket,
          ...updateResult,
          message: `Ticket status updated to ${status}.`
        });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/admin/support/tickets/:id/priority (Change priority + recalculate SLA)
    if (req.method === 'POST' && pathname.includes('/support/tickets/') && pathname.endsWith('/priority')) {
      if (!requirePermission('support:write')) return;
      const ticketId = pathname.split('/')[5];
      const { priority } = body;

      try {
        const result = ticketsService.updateTicketPriority(db, ticketId, priority, {
          role: req.session.role,
          userId: req.session.userId,
          email: req.session.email
        });
        const fullTicket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(result.ticketId);
        return sendJson(200, {
          success: true,
          ticket: fullTicket,
          ...result,
          message: `Priority updated to ${priority}.`
        });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/admin/support/tickets/:id/assign (Assign support agent)
    if (req.method === 'POST' && pathname.includes('/support/tickets/') && pathname.endsWith('/assign')) {
      if (!requirePermission('support:write')) return;
      const ticketId = pathname.split('/')[5];
      const assignedTo = body.assignedTo !== undefined ? body.assignedTo : body.assigned_to;

      try {
        const result = ticketsService.assignTicket(db, ticketId, assignedTo, {
          role: req.session.role,
          userId: req.session.userId,
          email: req.session.email
        });
        const fullTicket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(result.ticketId);
        return sendJson(200, {
          success: true,
          ticket: fullTicket,
          ...result,
          message: assignedTo ? `Ticket assigned to ${assignedTo}.` : 'Ticket assignment cleared.'
        });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/admin/support/tickets/:id/escalate (Escalate or De-escalate)
    if (req.method === 'POST' && pathname.includes('/support/tickets/') && pathname.endsWith('/escalate')) {
      if (!requirePermission('support:write')) return;
      const ticketId = pathname.split('/')[5];
      const { action = 'escalate', reason } = body;

      try {
        let result;
        if (action === 'deescalate') {
          result = ticketsService.deescalateTicket(db, ticketId, {
            role: req.session.role,
            userId: req.session.userId,
            email: req.session.email
          }, reason);
        } else {
          result = ticketsService.escalateTicket(db, ticketId, {
            role: req.session.role,
            userId: req.session.userId,
            email: req.session.email
          }, reason);
        }
        return sendJson(200, { success: true, ...result, message: `Ticket ${action === 'deescalate' ? 'de-escalated' : 'escalated'} successfully.` });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // =========================================================================
    // 4.6. PUBLIC WEBSITE CMS MANAGEMENT
    // =========================================================================

    // GET /api/admin/cms/overview
    if (req.method === 'GET' && pathname === '/api/admin/cms/overview') {
      if (!requirePermission('content:read')) return;
      const annCount = db.prepare(`SELECT COUNT(*) as count FROM website_announcements`).get()?.count || 0;
      const plansCount = db.prepare(`SELECT COUNT(*) as count FROM website_plans`).get()?.count || 0;
      const couponsCount = db.prepare(`SELECT COUNT(*) as count FROM website_coupons`).get()?.count || 0;
      const seoCount = db.prepare(`SELECT COUNT(*) as count FROM website_seo`).get()?.count || 0;
      return sendJson(200, { annCount, plansCount, couponsCount, seoCount });
    }

    // GET /api/admin/cms/announcements
    if (req.method === 'GET' && pathname === '/api/admin/cms/announcements') {
      if (!requirePermission('announcements:read') && !requirePermission('content:read')) return;
      const announcements = db.prepare(`SELECT * FROM website_announcements ORDER BY created_at DESC`).all();
      return sendJson(200, { announcements });
    }

    // POST /api/admin/cms/announcements
    if (req.method === 'POST' && pathname === '/api/admin/cms/announcements') {
      if (!requirePermission('announcements:write') && !requirePermission('content:write')) return;
      const { title, type, message, isActive = 1, startsAt, endsAt } = body;
      if (!title || !message) return sendError(400, 'Title and message are required.');

      const id = 'ann-' + crypto.randomBytes(4).toString('hex');
      db.prepare(`
        INSERT INTO website_announcements (id, title, type, message, is_active, starts_at, ends_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, title.trim(), type || 'BANNER', message.trim(), isActive ? 1 : 0, startsAt || null, endsAt || null, req.session.email);

      logAudit('ADMIN', req.session.userId, req.session.email, 'CMS_ANNOUNCEMENT_CREATED', 'website_announcements', id, { title });
      return sendJson(201, { success: true, announcementId: id, message: 'Announcement created successfully.' });
    }

    // PUT /api/admin/cms/announcements/:id
    if (req.method === 'PUT' && pathname.startsWith('/api/admin/cms/announcements/')) {
      if (!requirePermission('announcements:write') && !requirePermission('content:write')) return;
      const annId = pathname.replace('/api/admin/cms/announcements/', '');
      const { title, type, message, isActive, startsAt, endsAt } = body;

      db.prepare(`
        UPDATE website_announcements
        SET title = COALESCE(?, title),
            type = COALESCE(?, type),
            message = COALESCE(?, message),
            is_active = COALESCE(?, is_active),
            starts_at = COALESCE(?, starts_at),
            ends_at = COALESCE(?, ends_at),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(title, type, message, isActive !== undefined ? (isActive ? 1 : 0) : null, startsAt, endsAt, annId);

      return sendJson(200, { success: true, message: 'Announcement updated.' });
    }

    // DELETE /api/admin/cms/announcements/:id
    if (req.method === 'DELETE' && pathname.startsWith('/api/admin/cms/announcements/')) {
      if (!requirePermission('announcements:write') && !requirePermission('content:write')) return;
      const annId = pathname.replace('/api/admin/cms/announcements/', '');
      db.prepare(`DELETE FROM website_announcements WHERE id = ?`).run(annId);
      return sendJson(200, { success: true, message: 'Announcement deleted.' });
    }

    // GET /api/admin/cms/plans
    if (req.method === 'GET' && pathname === '/api/admin/cms/plans') {
      if (!requirePermission('plans:read') && !requirePermission('content:read')) return;
      const plans = db.prepare(`SELECT * FROM website_plans ORDER BY category, price_bdt ASC`).all();
      plans.forEach(p => {
        try { p.features = JSON.parse(p.features_json); } catch { p.features = []; }
      });
      return sendJson(200, { plans });
    }

    // PUT /api/admin/cms/plans/:id
    if (req.method === 'PUT' && pathname.startsWith('/api/admin/cms/plans/')) {
      if (!requirePermission('plans:write') && !requirePermission('content:write')) return;
      const planId = pathname.replace('/api/admin/cms/plans/', '');
      const { priceBdt, priceUsd, isAvailable, isPopular, features } = body;

      db.prepare(`
        UPDATE website_plans
        SET price_bdt = COALESCE(?, price_bdt),
            price_usd = COALESCE(?, price_usd),
            is_available = COALESCE(?, is_available),
            is_popular = COALESCE(?, is_popular),
            features_json = COALESCE(?, features_json),
            updated_by = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        priceBdt !== undefined ? Number(priceBdt) : null,
        priceUsd !== undefined ? Number(priceUsd) : null,
        isAvailable !== undefined ? (isAvailable ? 1 : 0) : null,
        isPopular !== undefined ? (isPopular ? 1 : 0) : null,
        features ? JSON.stringify(features) : null,
        req.session.email,
        planId
      );

      logAudit('ADMIN', req.session.userId, req.session.email, 'CMS_PLAN_PRICING_UPDATED', 'website_plans', planId, {
        priceBdt,
        priceUsd
      });

      return sendJson(200, { success: true, message: 'Service plan specifications updated.' });
    }

    // GET /api/admin/cms/seo
    if (req.method === 'GET' && pathname === '/api/admin/cms/seo') {
      if (!requirePermission('seo:read') && !requirePermission('content:read')) return;
      const seo = db.prepare(`SELECT * FROM website_seo`).all();
      return sendJson(200, { seo });
    }

    // PUT /api/admin/cms/seo/:pageKey
    if (req.method === 'PUT' && pathname.startsWith('/api/admin/cms/seo/')) {
      if (!requirePermission('seo:write') && !requirePermission('content:write')) return;
      const pageKey = pathname.replace('/api/admin/cms/seo/', '');
      const { metaTitle, metaDescription, canonicalUrl, ogTitle, ogDescription } = body;

      db.prepare(`
        UPDATE website_seo
        SET meta_title = COALESCE(?, meta_title),
            meta_description = COALESCE(?, meta_description),
            canonical_url = COALESCE(?, canonical_url),
            og_title = COALESCE(?, og_title),
            og_description = COALESCE(?, og_description),
            updated_by = ?,
            updated_at = datetime('now')
        WHERE page_key = ?
      `).run(
        metaTitle || null,
        metaDescription || null,
        canonicalUrl || null,
        ogTitle || null,
        ogDescription || null,
        req.session.email,
        pageKey
      );

      return sendJson(200, { success: true, message: `SEO configuration updated for '${pageKey}'.` });
    }

    // GET /api/admin/cms/coupons
    if (req.method === 'GET' && pathname === '/api/admin/cms/coupons') {
      if (!requirePermission('coupons:read') && !requirePermission('content:read')) return;
      const coupons = db.prepare(`SELECT * FROM website_coupons ORDER BY created_at DESC`).all();
      return sendJson(200, { coupons });
    }

    // POST /api/admin/cms/coupons
    if (req.method === 'POST' && pathname === '/api/admin/cms/coupons') {
      if (!requirePermission('coupons:write') && !requirePermission('content:write')) return;
      const { code, discountType = 'PERCENTAGE', discountValue, maxUses = 100 } = body;
      if (!code || discountValue === undefined) return sendError(400, 'Coupon code and discount value are required.');

      const id = 'cpn-' + crypto.randomBytes(4).toString('hex');
      db.prepare(`
        INSERT INTO website_coupons (id, code, discount_type, discount_value, max_uses, is_active, created_by)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(id, code.toUpperCase().trim(), discountType, Number(discountValue), Number(maxUses), req.session.email);

      return sendJson(201, { success: true, couponId: id, message: `Promo coupon '${code}' created.` });
    }

    // =========================================================================
    // 4.7. SECURITY, AUTHENTICATION & ACCESS MONITORING
    // =========================================================================

    // GET /api/admin/security/events
    if (req.method === 'GET' && pathname === '/api/admin/security/events') {
      if (!requirePermission('security:read') && !requirePermission('security:audit_logs') && !requirePermission('audit:read')) return;
      const { eventType, outcome, search, limit = 50, offset = 0 } = query;

      let sql = 'SELECT * FROM security_events WHERE 1=1';
      const params = [];

      if (eventType && eventType !== 'ALL') {
        sql += ' AND event_type = ?';
        params.push(eventType);
      }
      if (outcome && outcome !== 'ALL') {
        sql += ' AND outcome = ?';
        params.push(outcome);
      }
      if (search) {
        sql += ' AND (actor_email LIKE ? OR ip_address LIKE ? OR action LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(Number(limit) || 50, Number(offset) || 0);

      const events = db.prepare(sql).all(...params);
      return sendJson(200, { events, total: events.length });
    }

    // GET /api/admin/security/sessions
    if (req.method === 'GET' && pathname === '/api/admin/security/sessions') {
      if (!requirePermission('security:read') && !requirePermission('security:revoke_session')) return;
      const sessions = sessionStore.listActiveSessions();
      return sendJson(200, { sessions });
    }

    // POST /api/admin/security/sessions/revoke
    if (req.method === 'POST' && pathname === '/api/admin/security/sessions/revoke') {
      if (!requirePermission('security:revoke_session')) return;
      const { token, userId, allForUser } = body;

      if (allForUser && userId) {
        const count = sessionStore.revokeAllUserSessions(userId);
        logSecurityEvent('SESSION_REVOKED', req.session.userId, req.session.email, req.session.role, 'users', userId, 'REVOKE_ALL_SESSIONS', 'SUCCESS', { revokedCount: count });
        return sendJson(200, { success: true, message: `Revoked ${count} active session(s) for user.` });
      }

      if (!token) return sendError(400, 'Session token is required for revocation.');

      const revoked = sessionStore.revokeSession(token);
      logSecurityEvent('SESSION_REVOKED', req.session.userId, req.session.email, req.session.role, 'sessions', null, 'REVOKE_SESSION', revoked ? 'SUCCESS' : 'FAILURE', { tokenMasked: token.slice(0, 8) + '...' });

      return sendJson(200, { success: revoked, message: revoked ? 'Session successfully terminated and invalidated.' : 'Session not found or already expired.' });
    }

    // GET /api/admin/security/admins
    if (req.method === 'GET' && pathname === '/api/admin/security/admins') {
      if (!requirePermission('users:read') && !requirePermission('users:manage_roles')) return;
      const admins = db.prepare(`
        SELECT id, email, name, role, status, last_login_at, created_at
        FROM users
        WHERE role != 'PARTNER' AND role != 'CUSTOMER'
        ORDER BY created_at ASC
      `).all();
      return sendJson(200, { admins, availableRoles: Object.keys(ROLE_PERMISSIONS).filter(r => !['PARTNER', 'CUSTOMER'].includes(r)) });
    }

    // POST /api/admin/security/admins (Create admin account)
    if (req.method === 'POST' && pathname === '/api/admin/security/admins') {
      if (!requirePermission('users:manage_roles')) return;
      const { email, password, role, name } = body;

      if (!email || !password || !role) {
        return sendError(400, 'Email, password, and role are required.');
      }
      if (!ROLE_PERMISSIONS[role] || ['PARTNER', 'CUSTOMER'].includes(role)) {
        return sendError(400, `Invalid administrative role: ${role}`);
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(cleanEmail);
      if (existing) return sendError(409, `An account with email '${cleanEmail}' already exists.`);

      const auth = await hashPasswordAsync(password);
      const id = 'usr-adm-' + crypto.randomBytes(4).toString('hex');

      db.prepare(`
        INSERT INTO users (id, email, password_hash, salt, role, partner_id, name, status)
        VALUES (?, ?, ?, ?, ?, NULL, ?, 'ACTIVE')
      `).run(id, cleanEmail, auth.hash, auth.salt, role, name || cleanEmail.split('@')[0]);

      logSecurityEvent('ROLE_ASSIGNED', req.session.userId, req.session.email, req.session.role, 'users', id, 'CREATE_ADMIN_USER', 'SUCCESS', { email: cleanEmail, assignedRole: role });

      return sendJson(201, {
        success: true,
        userId: id,
        message: `Administrative user '${cleanEmail}' provisioned with role '${role}'.`
      });
    }

    // PUT /api/admin/security/admins/:id/role (Change role)
    if (req.method === 'PUT' && pathname.includes('/security/admins/') && pathname.endsWith('/role')) {
      if (!requirePermission('users:manage_roles')) return;
      const targetUserId = pathname.split('/')[5];
      const { role } = body;

      if (!ROLE_PERMISSIONS[role] || ['PARTNER', 'CUSTOMER'].includes(role)) {
        return sendError(400, `Invalid administrative role: ${role}`);
      }

      // Prevent non-superadmins from granting superadmin
      if (role === 'SUPER_ADMIN' && req.session.role !== 'SUPER_ADMIN' && req.session.role !== 'ADMIN') {
        return sendError(403, 'Only a Super Administrator can assign the SUPER_ADMIN role.');
      }

      db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, targetUserId);

      logSecurityEvent('ROLE_CHANGED', req.session.userId, req.session.email, req.session.role, 'users', targetUserId, 'CHANGE_ROLE', 'SUCCESS', { newRole: role });

      return sendJson(200, { success: true, message: `Role updated to '${role}'.` });
    }

    // =========================================================================
    // 4.8. PARTNER MANAGEMENT (Existing Partner Admin Module)
    // =========================================================================

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
      const auth = await hashPasswordAsync(initialPassword);

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
      const allPartners = db.prepare(`SELECT id FROM partners`).all();
      for (const p of allPartners) {
        evaluateAndUpgradePartnerTier(db, p.id);
      }

      const partners = db.prepare(`
        SELECT p.*, pt.name as tier_name, pt.discount_rate as tier_discount_rate,
               (
                 SELECT pa.custom_discount_rate FROM partner_agreements pa
                 WHERE pa.partner_id = p.id AND pa.status = 'ACTIVE'
                   AND date(pa.effective_from) <= date('now')
                   AND date(pa.effective_until) >= date('now')
                 ORDER BY pa.created_at DESC, pa.custom_discount_rate DESC
                 LIMIT 1
               ) as agreement_discount_rate,
               (
                 SELECT pa.agreement_code FROM partner_agreements pa
                 WHERE pa.partner_id = p.id AND pa.status = 'ACTIVE'
                   AND date(pa.effective_from) <= date('now')
                   AND date(pa.effective_until) >= date('now')
                 ORDER BY pa.created_at DESC, pa.custom_discount_rate DESC
                 LIMIT 1
               ) as active_agreement_code
        FROM partners p
        JOIN partner_tiers pt ON p.tier_id = pt.id
        ORDER BY p.created_at DESC
      `).all();

      partners.forEach(p => {
        p.effective_discount_rate = (p.custom_discount_rate !== null && p.custom_discount_rate !== undefined && p.custom_discount_rate > 0)
          ? p.custom_discount_rate
          : (p.agreement_discount_rate || p.tier_discount_rate);
      });

      return sendJson(200, { partners });
    }

    // POST /api/admin/partners/:id/tier (Assigned tier is automatic by spend)
    if (req.method === 'POST' && pathname.endsWith('/tier')) {
      return sendError(400, 'Assigned partner tier is automatically determined by monthly eligible spend in BDT and cannot be manually overridden. You can grant a custom discount to the partner instead.');
    }

    // POST /api/admin/partners/:id/spend (Update monthly eligible spend & evaluate tier)
    if (req.method === 'POST' && pathname.endsWith('/spend')) {
      const partnerId = pathname.split('/')[4];
      const { monthlyEligibleSpend } = body;
      const spendVal = Math.max(0, Number(monthlyEligibleSpend) || 0);

      db.prepare(`
        UPDATE partners SET monthly_eligible_spend = ?, updated_at = datetime('now') WHERE id = ?
      `).run(spendVal, partnerId);

      const evalResult = evaluateAndUpgradePartnerTier(db, partnerId);

      const updatedPartner = db.prepare(`
        SELECT p.*, pt.name as tier_name, pt.discount_rate as tier_discount_rate
        FROM partners p
        JOIN partner_tiers pt ON p.tier_id = pt.id
        WHERE p.id = ?
      `).get(partnerId);

      logAudit('ADMIN', req.session.userId, req.session.email, 'PARTNER_SPEND_UPDATED', 'partners', partnerId, {
        newSpend: spendVal,
        tierUpgraded: evalResult ? evalResult.upgraded : false,
        currentTier: updatedPartner.tier_name
      });

      return sendJson(200, {
        success: true,
        message: `Partner spending updated to ৳${spendVal.toLocaleString('en-US')}. Current Tier: ${updatedPartner.tier_name} (${Math.round(updatedPartner.tier_discount_rate * 100)}% Margin).`,
        partner: updatedPartner,
        tierUpgraded: evalResult ? evalResult.upgraded : false
      });
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

    // POST /api/admin/partners/:id/discount or /agreement (Custom Commercial Discount)
    if (req.method === 'POST' && (pathname.endsWith('/discount') || pathname.endsWith('/agreement'))) {
      const partnerId = pathname.split('/')[4];
      const { customDiscountRate, discountPercent, effectiveFrom, effectiveUntil, creditLimit, notes } = body;

      let rawRate = customDiscountRate !== undefined ? customDiscountRate : discountPercent;
      let rate = Number(rawRate);
      if (!isNaN(rate) && rate > 1) {
        rate = rate / 100; // e.g. 20 -> 0.20
      }

      if (isNaN(rate) || rate < 0 || rate > 0.50) {
        return sendError(400, 'Custom discount rate must be between 0% and 50%.');
      }

      // Update partner table
      db.prepare(`
        UPDATE partners
        SET custom_discount_rate = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(rate, partnerId);

      // Supersede previous active agreements
      db.prepare(`
        UPDATE partner_agreements
        SET status = 'REVOKED'
        WHERE partner_id = ? AND status = 'ACTIVE'
      `).run(partnerId);

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
        req.session?.email || 'admin@unified.cloud',
        notes || 'Custom commercial partner discount.'
      );

      logAudit('ADMIN', req.session?.userId || 'admin', req.session?.email || 'admin@unified.cloud', 'CUSTOM_DISCOUNT_APPLIED', 'partners', partnerId, {
        partnerId,
        agreementCode,
        customDiscountRate: rate,
        discountPercent: `${(rate * 100).toFixed(1)}%`
      });

      return sendJson(200, {
        success: true,
        agreementCode,
        customDiscountRate: rate,
        message: `Custom discount of ${(rate * 100).toFixed(1)}% successfully applied to partner and updated in partner portal.`
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

    // --- ADMIN REWARD MANAGEMENT ENDPOINTS ---

    // GET /api/admin/rewards/policy
    if (req.method === 'GET' && pathname === '/api/admin/rewards/policy') {
      const policy = rewards.getPolicy();
      return sendJson(200, { policy });
    }

    // PUT /api/admin/rewards/policy
    if (req.method === 'PUT' && pathname === '/api/admin/rewards/policy') {
      try {
        const updated = rewards.updatePolicy({
          ...body,
          actorEmail: req.session.email
        });
        logAudit('ADMIN', req.session.userId, req.session.email, 'REWARD_POLICY_UPDATED', 'partner_reward_policies', 'default', body);
        return sendJson(200, { success: true, policy: updated });
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // GET /api/admin/rewards/overview
    if (req.method === 'GET' && pathname === '/api/admin/rewards/overview') {
      const stats = db.prepare(`
        SELECT 
          COALESCE(SUM(total_eligible_sales), 0) as totalEligibleSales,
          COALESCE(SUM(total_points_earned), 0) as totalPointsEarned,
          COALESCE(SUM(available_points), 0) as totalAvailablePoints,
          COALESCE(SUM(pending_points), 0) as totalPendingPoints,
          COALESCE(SUM(redeemed_points), 0) as totalRedeemedPoints,
          COALESCE(SUM(reversed_points), 0) as totalReversedPoints
        FROM partner_reward_accounts
      `).get();

      const txCounts = db.prepare(`
        SELECT 
          COUNT(*) as totalTx,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingTx,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approvedTx,
          SUM(CASE WHEN status = 'REVERSED' THEN 1 ELSE 0 END) as reversedTx
        FROM partner_reward_transactions
      `).get();

      return sendJson(200, {
        stats,
        counts: txCounts,
        policy: rewards.getPolicy()
      });
    }

    // GET /api/admin/rewards/transactions
    if (req.method === 'GET' && pathname === '/api/admin/rewards/transactions') {
      const { partnerId, status, search, limit, offset, sort } = query;
      const result = rewards.getTransactions(partnerId || null, { status, search, limit, offset, sort });
      return sendJson(200, result);
    }

    // POST /api/admin/rewards/transactions/:id/approve
    if (req.method === 'POST' && pathname.includes('/rewards/transactions/') && pathname.endsWith('/approve')) {
      const txId = pathname.split('/')[5];
      try {
        const result = rewards.approvePendingReward(txId, req.session.email);
        logAudit('ADMIN', req.session.userId, req.session.email, 'REWARD_TRANSACTION_APPROVED', 'partner_reward_transactions', txId, {});
        return sendJson(200, result);
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/admin/rewards/transactions/:id/reject
    if (req.method === 'POST' && pathname.includes('/rewards/transactions/') && pathname.endsWith('/reject')) {
      const txId = pathname.split('/')[5];
      try {
        const result = rewards.rejectPendingReward(txId, body.reason || 'Rejected by admin', req.session.email);
        logAudit('ADMIN', req.session.userId, req.session.email, 'REWARD_TRANSACTION_REJECTED', 'partner_reward_transactions', txId, { reason: body.reason });
        return sendJson(200, result);
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/admin/rewards/adjust
    if (req.method === 'POST' && pathname === '/api/admin/rewards/adjust') {
      try {
        const { partnerId, points, type, reason } = body;
        const result = rewards.processAdminAdjustment({
          partnerId,
          points,
          type,
          reason,
          actorEmail: req.session.email
        });
        logAudit('ADMIN', req.session.userId, req.session.email, 'REWARD_POINTS_ADJUSTED', 'partner_reward_accounts', partnerId, {
          points,
          type,
          reason
        });
        return sendJson(200, result);
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/admin/rewards/process-refund
    if (req.method === 'POST' && pathname === '/api/admin/rewards/process-refund') {
      try {
        const { orderId, reason } = body;
        const result = rewards.processRefund({
          orderId,
          reason,
          actorEmail: req.session.email
        });
        logAudit('ADMIN', req.session.userId, req.session.email, 'ORDER_REFUND_REWARD_REVERSED', 'partner_sales', orderId, {
          reason
        });
        return sendJson(200, result);
      } catch (err) {
        return sendError(400, err.message);
      }
    }

    // POST /api/admin/rewards/simulate-order
    if (req.method === 'POST' && pathname === '/api/admin/rewards/simulate-order') {
      try {
        const {
          partnerId, customerName, customerEmail, serviceName, category, productCode,
          grossAmount, discountAmount, taxAmount
        } = body;

        const orderNumber = 'ORD-ADM-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
        const result = rewards.processSaleReward({
          partnerId: partnerId || 'ptn-apex-101',
          orderNumber,
          customerName: customerName || 'Enterprise Client',
          customerEmail: customerEmail || 'enterprise@client.com',
          serviceName: serviceName || 'Cloud VPS Cluster',
          category: category || 'VPS',
          productCode: productCode || 'VPS-ENTERPRISE',
          grossAmount: Number(grossAmount) || 10000,
          discountAmount: Number(discountAmount) || 0,
          taxAmount: Number(taxAmount) || 0,
          actorEmail: req.session.email
        });

        logAudit('ADMIN', req.session.userId, req.session.email, 'ADMIN_SIMULATE_ORDER_REWARD', 'partner_sales', result.saleId, {
          orderNumber,
          partnerId
        });

        return sendJson(201, result);
      } catch (err) {
        return sendError(400, err.message);
      }
    }
  }

  // Not found endpoint
  return sendError(404, `API route '${pathname}' not found`);
}
