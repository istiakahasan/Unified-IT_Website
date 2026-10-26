import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from '../server/db.mjs';
import { PricingEngine } from '../server/pricing-engine.mjs';
import { WHMCSAdapter } from '../server/whmcs-adapter.mjs';
import { CloudStackAdapter } from '../server/cloudstack-adapter.mjs';
import { RewardProcessingService } from '../server/reward-service.mjs';
import { sessionStore, authenticateRequest } from '../server/auth.mjs';
import { handleApiRequest } from '../server/api.mjs';
import * as ticketsService from '../server/tickets-service.mjs';

describe('Unified Cloud - Role-Based Support Ticketing System Test Suite', () => {
  let db;
  let pricing;
  let whmcs;
  let cloudstack;
  let rewardService;
  let ticketsService;

  // Session tokens
  let superAdminToken;
  let supportAdminToken;
  let resellerA_Token;
  let resellerB_Token;
  let customerToken;

  // Track created IDs
  let publicTicketId;
  let publicTicketNumber;
  let resellerTicketId;
  let resellerTicketNumber;

  // Helper to execute API requests
  async function callApi(token, method, pathname, body = null, query = {}) {
    return new Promise((resolve) => {
      let statusCode = 200;
      let headers = {};
      const res = {
        writeHead: (code, hdrs = {}) => {
          statusCode = code;
          headers = hdrs;
        },
        setHeader: (k, v) => { headers[k] = v; },
        end: (str) => {
          let data = {};
          try {
            data = JSON.parse(str);
          } catch {
            data = { raw: str };
          }
          resolve({ statusCode, data, headers });
        }
      };

      const reqHeaders = {
        'x-forwarded-for': '192.168.1.150',
        'user-agent': 'SupportTicketingTestRunner/1.0'
      };
      if (token) {
        reqHeaders['authorization'] = `Bearer ${token}`;
      }

      const req = {
        method,
        headers: reqHeaders,
        socket: { remoteAddress: '192.168.1.150' }
      };

      // Authenticate request attaching session if present
      authenticateRequest(req, db);

      handleApiRequest({
        req,
        res,
        pathname,
        query,
        body: body || {},
        db,
        pricingEngine: pricing,
        whmcsAdapter: whmcs,
        cloudstackAdapter: cloudstack,
        rewardService
      });
    });
  }

  before(async () => {
    // 1. Initialize clean in-memory database with production migrations
    db = initDatabase(':memory:');
    pricing = new PricingEngine(db);
    whmcs = new WHMCSAdapter();
    cloudstack = new CloudStackAdapter();
    rewardService = new RewardProcessingService(db);

    // 2. Provision two distinct partner reseller organizations
    db.prepare(`
      INSERT INTO partners (id, user_id, company_name, contact_name, email, phone, country, website, business_type, tier_id, status, monthly_eligible_spend)
      VALUES (?, ?, ?, ?, ?, ?, 'Bangladesh', 'https://alphacloud.test', 'IT Reseller', 'tier-gold', 'ACTIVE', 150000)
    `).run('ptn-alpha-corp', 'usr-ptn-alpha', 'Alpha Cloud Solutions', 'Alpha Manager', 'contact@alphacloud.com', '+8801700000001');

    db.prepare(`
      INSERT INTO partners (id, user_id, company_name, contact_name, email, phone, country, website, business_type, tier_id, status, monthly_eligible_spend)
      VALUES (?, ?, ?, ?, ?, ?, 'Bangladesh', 'https://betahost.test', 'Hosting Provider', 'tier-silver', 'ACTIVE', 50000)
    `).run('ptn-beta-corp', 'usr-ptn-beta', 'Beta Hosting Ltd', 'Beta Director', 'contact@betahost.com', '+8801700000002');

    // 3. Provision managed customer relationships for both resellers
    db.prepare(`
      INSERT INTO partner_customer_relationships (id, partner_id, customer_whmcs_id, customer_name, customer_email, company, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run('cust-alpha-buyer', 'ptn-alpha-corp', 9001, 'Rahim Chowdhury', 'rahim@alphabuyer.com', 'Chowdhury Agro Foods');

    db.prepare(`
      INSERT INTO partner_customer_relationships (id, partner_id, customer_whmcs_id, customer_name, customer_email, company, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run('cust-beta-buyer', 'ptn-beta-corp', 9002, 'Karim Ullah', 'karim@betabuyer.com', 'Karim Textiles Ltd');

    // 4. Provision sessions for distinct roles
    const superAdminUser = { id: 'usr-super', email: 'admin@unified.cloud', name: 'Super Admin', role: 'SUPER_ADMIN' };
    superAdminToken = sessionStore.createSession(superAdminUser, null, {
      headers: { 'x-forwarded-for': '192.168.1.150', 'user-agent': 'TestAgent' }
    }).token;

    const supportAdminUser = { id: 'usr-support-01', email: 'support@unified.cloud', name: 'NOC Lead Agent', role: 'SUPPORT_ADMIN' };
    supportAdminToken = sessionStore.createSession(supportAdminUser, null, {
      headers: { 'x-forwarded-for': '192.168.1.150', 'user-agent': 'TestAgent' }
    }).token;

    const resellerAUser = { id: 'usr-ptn-alpha', email: 'contact@alphacloud.com', name: 'Alpha Agent', role: 'PARTNER', partner_id: 'ptn-alpha-corp' };
    resellerA_Token = sessionStore.createSession(resellerAUser, { id: 'ptn-alpha-corp', company_name: 'Alpha Cloud Solutions' }).token;

    const resellerBUser = { id: 'usr-ptn-beta', email: 'contact@betahost.com', name: 'Beta Agent', role: 'PARTNER', partner_id: 'ptn-beta-corp' };
    resellerB_Token = sessionStore.createSession(resellerBUser, { id: 'ptn-beta-corp', company_name: 'Beta Hosting Ltd' }).token;

    const customerUser = { id: 'usr-cust-direct', email: 'client@directbuyer.com', name: 'Direct Customer', role: 'CUSTOMER' };
    customerToken = sessionStore.createSession(customerUser, null).token;
  });

  // ---------------------------------------------------------------------------
  // 1. PUBLIC TICKET SUBMISSION EXPERIENCE & VISITOR LOOKUP
  // ---------------------------------------------------------------------------
  describe('1. Public Ticket Submission & Secure Verification Experience', () => {
    it('should provide public product and service catalog options for ticket submission', async () => {
      const res = await callApi(null, 'GET', '/api/support/catalog');
      assert.equal(res.statusCode, 200);
      assert.ok(res.data.categories && res.data.categories.length > 0);
      assert.ok(res.data.priorities && res.data.priorities.length > 0);
      assert.ok(Array.isArray(res.data.plans));
    });

    it('should reject ticket creation when mandatory fields are missing', async () => {
      const res = await callApi(null, 'POST', '/api/support/tickets', {
        subject: '',
        message: 'Need help'
      });
      assert.equal(res.statusCode, 400);
      assert.ok(res.data.message.includes('required'));
    });

    it('should successfully create a public support ticket with human-readable reference and SLA', async () => {
      const res = await callApi(null, 'POST', '/api/support/tickets', {
        subject: 'BGP Routing Flap on Singapore Node SG-01',
        category: 'INFRASTRUCTURE',
        priority: 'HIGH',
        message: 'Experiencing 15% packet loss between BDIX gateway and SG-01 datacenter interconnect.',
        buyer_name: 'Sadman Sakib',
        buyer_email: 'sadman@dhakacloud.io',
        buyer_phone: '+8801719999999',
        related_product_code: 'ENTERPRISE-VPS-SG',
        preferred_contact: 'EMAIL'
      });

      assert.equal(res.statusCode, 201);
      assert.ok(res.data.success);
      assert.ok(res.data.ticket);
      assert.ok(res.data.ticket.ticket_number.startsWith('TCK-'));
      assert.equal(res.data.ticket.status, 'OPEN');
      assert.equal(res.data.ticket.priority, 'HIGH');
      assert.ok(res.data.ticket.sla_due_at, 'Ticket must have computed SLA target');

      publicTicketId = res.data.ticket.id;
      publicTicketNumber = res.data.ticket.ticket_number;
    });

    it('should allow visitor to look up their ticket using ticket_number and verified buyer_email', async () => {
      const res = await callApi(null, 'GET', '/api/support/tickets/lookup', null, {
        ticket_number: publicTicketNumber,
        email: 'sadman@dhakacloud.io'
      });

      assert.equal(res.statusCode, 200);
      assert.ok(res.data.ticket);
      assert.equal(res.data.ticket.ticket_number, publicTicketNumber);
      assert.equal(res.data.messages.length, 1);
      assert.equal(res.data.messages[0].message.includes('packet loss'), true);
    });

    it('should strictly reject lookup if email does not match ticket owner (prevent IDOR)', async () => {
      const res = await callApi(null, 'GET', '/api/support/tickets/lookup', null, {
        ticket_number: publicTicketNumber,
        email: 'attacker@random-domain.com'
      });

      assert.equal(res.statusCode, 403);
      assert.ok(res.data.message.includes('Verification failed'));
    });

    it('should allow visitor to post a public reply to their open ticket with email verification', async () => {
      const res = await callApi(null, 'POST', `/api/support/tickets/${publicTicketId}/reply`, {
        email: 'sadman@dhakacloud.io',
        message: 'Traceroute shows hop 4 at bdix-gw.dhaka.net is timing out.'
      });

      assert.equal(res.statusCode, 200);
      assert.ok(res.data.success);
      assert.equal(res.data.reply.author_role, 'BUYER');
    });

    it('should automatically associate verified customer account when authenticated user submits ticket', async () => {
      const res = await callApi(customerToken, 'POST', '/api/support/tickets', {
        subject: 'Invoice #INV-2026-004 Tax Challan Request',
        category: 'BILLING',
        priority: 'NORMAL',
        message: 'Kindly send Mushak 6.3 withholding tax challan for our accounting department.'
      });

      assert.equal(res.statusCode, 201);
      assert.equal(res.data.ticket.created_by_user_id, 'usr-cust-direct');
      assert.equal(res.data.ticket.buyer_email, 'client@directbuyer.com');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. RESELLER-TO-BUYER SUPPORT WORKFLOW & TENANT ISOLATION
  // ---------------------------------------------------------------------------
  describe('2. Reseller-to-Buyer Support Workflow & Tenant Isolation', () => {
    it('should allow Reseller A to view only their own managed buyers', async () => {
      const res = await callApi(resellerA_Token, 'GET', '/api/partner/support/customers');
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.data.customers));
      assert.equal(res.data.customers.length, 1);
      assert.equal(res.data.customers[0].customer_email, 'rahim@alphabuyer.com');

      // Reseller A cannot see Reseller B's customer
      const hasBetaBuyer = res.data.customers.some(c => c.customer_email === 'karim@betabuyer.com');
      assert.equal(hasBetaBuyer, false);
    });

    it('should allow Reseller A to create a ticket on behalf of their managed buyer', async () => {
      const res = await callApi(resellerA_Token, 'POST', '/api/partner/support/tickets', {
        managed_customer_id: 'cust-alpha-buyer',
        subject: 'Database Connection Pool Exhaustion on Web Cluster',
        category: 'TECHNICAL',
        priority: 'CRITICAL',
        message: 'Customer Rahim reports PostgreSQL connection pool is saturated during morning flash sale.',
        related_service_id: 'srv-db-cluster-01'
      });

      assert.equal(res.statusCode, 201);
      assert.ok(res.data.ticket);
      assert.equal(res.data.ticket.partner_id, 'ptn-alpha-corp');
      assert.equal(res.data.ticket.buyer_email, 'rahim@alphabuyer.com');

      resellerTicketId = res.data.ticket.id;
      resellerTicketNumber = res.data.ticket.ticket_number;
    });

    it('should allow Reseller A to view and reply to their buyer ticket in the partner portal', async () => {
      const res = await callApi(resellerA_Token, 'GET', `/api/partner/support/tickets/${resellerTicketId}`);
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ticket.ticket_number, resellerTicketNumber);
      assert.equal(res.data.ticket.partner_id, 'ptn-alpha-corp');

      // Reply to buyer
      const replyRes = await callApi(resellerA_Token, 'POST', `/api/partner/support/tickets/${resellerTicketId}/reply`, {
        message: 'We have provisioned an PgBouncer instance and increased max_connections to 300.'
      });
      assert.equal(replyRes.statusCode, 200);
      assert.equal(replyRes.data.reply.author_role, 'RESELLER');
    });

    it('should STRICTLY DENY Reseller B from accessing Reseller A ticket (Tenant Isolation)', async () => {
      const res = await callApi(resellerB_Token, 'GET', `/api/partner/support/tickets/${resellerTicketId}`);
      assert.equal(res.statusCode, 403);
      assert.ok(res.data.message.includes('Tenant access violation'));
    });

    it('should STRICTLY DENY Reseller B from modifying or replying to Reseller A ticket', async () => {
      const res = await callApi(resellerB_Token, 'POST', `/api/partner/support/tickets/${resellerTicketId}/reply`, {
        message: 'Intruder message'
      });
      assert.equal(res.statusCode, 403);
    });

    it('should allow Reseller A to escalate ticket to Platform NOC when they cannot resolve it alone', async () => {
      const res = await callApi(resellerA_Token, 'POST', `/api/partner/support/tickets/${resellerTicketId}/escalate`, {
        reason: 'Upstream hypervisor CPU throttle detected on physical host node dhaka-node-4'
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ticket.status, 'ESCALATED');
      assert.equal(res.data.ticket.is_escalated, 1);
      assert.ok(res.data.ticket.escalated_at);

      // Verify audit trail entry was recorded
      const auditRows = db.prepare('SELECT * FROM ticket_audit_events WHERE ticket_id = ? AND event_type = ?')
        .all(resellerTicketId, 'TICKET_ESCALATED');
      assert.ok(auditRows.length > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ADMIN PANEL WORKSPACE, AUDITING & INTERNAL NOTE MASKING
  // ---------------------------------------------------------------------------
  describe('3. Admin Centralized Visibility, Staff Dispatch & Internal Notes', () => {
    it('should calculate accurate database-backed KPI overview metrics for administrators', async () => {
      const res = await callApi(superAdminToken, 'GET', '/api/admin/support/overview');
      assert.equal(res.statusCode, 200);
      const m = res.data.metrics;
      assert.ok(m.total >= 3, 'Total tickets count must reflect all created tickets');
      assert.ok(m.escalated >= 1, 'Escalated tickets metric must reflect escalated ticket');
      assert.ok(m.critical >= 1, 'Critical priority count must reflect critical tickets');
    });

    it('should list all tickets with server-side pagination, search, and filtering in admin panel', async () => {
      const res = await callApi(superAdminToken, 'GET', '/api/admin/support/tickets', null, {
        page: '1',
        limit: '10',
        status: 'ESCALATED'
      });

      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.data.tickets));
      assert.ok(res.data.tickets.some(t => t.id === resellerTicketId));
      assert.equal(res.data.page, 1);
    });

    it('should allow Admin to assign ticket to a support staff member and update status', async () => {
      const res = await callApi(superAdminToken, 'POST', `/api/admin/support/tickets/${resellerTicketId}/assign`, {
        assigned_to: 'usr-support-01'
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ticket.assigned_to, 'usr-support-01');

      // Verify audit trail recorded assignment
      const audit = db.prepare('SELECT * FROM ticket_audit_events WHERE ticket_id = ? AND event_type = ?')
        .all(resellerTicketId, 'TICKET_ASSIGNED');
      assert.ok(audit.length > 0);
    });

    it('should allow Admin to post a private INTERNAL NOTE invisible to buyers and resellers', async () => {
      const res = await callApi(superAdminToken, 'POST', `/api/admin/support/tickets/${resellerTicketId}/reply`, {
        message: 'CONFIDENTIAL NOC NOTE: Physical host dhaka-node-4 has a degraded RAM stick on DIMM slot 3. Scheduling live VM migration.',
        is_internal: true
      });

      assert.equal(res.statusCode, 201);
      assert.equal(res.data.reply.is_internal, 1);
    });

    it('should strictly HIDE internal notes when Reseller views the ticket thread', async () => {
      const res = await callApi(resellerA_Token, 'GET', `/api/partner/support/tickets/${resellerTicketId}`);
      assert.equal(res.statusCode, 200);

      // Verify no message in the array has is_internal = 1 or mentions internal RAM stick
      const hasInternal = res.data.messages.some(m => m.is_internal === 1 || m.message.includes('CONFIDENTIAL NOC NOTE'));
      assert.equal(hasInternal, false, 'Internal notes MUST NOT be leaked to resellers');
    });

    it('should strictly HIDE internal notes when Buyer looks up the ticket thread', async () => {
      const res = await callApi(null, 'GET', '/api/support/tickets/lookup', null, {
        ticket_number: resellerTicketNumber,
        email: 'rahim@alphabuyer.com'
      });

      assert.equal(res.statusCode, 200);
      const hasInternal = res.data.messages.some(m => m.is_internal === 1 || m.message.includes('CONFIDENTIAL NOC NOTE'));
      assert.equal(hasInternal, false, 'Internal notes MUST NOT be leaked to buyers');
    });

    it('should allow Admin to resolve ticket and synchronize status across all portals', async () => {
      const res = await callApi(superAdminToken, 'POST', `/api/admin/support/tickets/${resellerTicketId}/status`, {
        status: 'RESOLVED',
        reason: 'Live migration completed, PostgreSQL compute restored to 100% capacity'
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ticket.status, 'RESOLVED');
      assert.ok(res.data.ticket.resolved_at);

      // Verify reseller sees RESOLVED status
      const ptnRes = await callApi(resellerA_Token, 'GET', `/api/partner/support/tickets/${resellerTicketId}`);
      assert.equal(ptnRes.data.ticket.status, 'RESOLVED');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ATTACHMENT SECURITY & RATE LIMITING
  // ---------------------------------------------------------------------------
  describe('4. Attachment Security, Rate Limiting & Validation Safeguards', () => {
    it('should successfully upload and validate an authorized attachment', async () => {
      const sampleBase64 = Buffer.from('console.log("Memory dump log snippet");').toString('base64');
      const res = await callApi(superAdminToken, 'POST', '/api/support/attachments', {
        ticket_id: resellerTicketId,
        filename: 'memory-dump.log',
        mime_type: 'text/plain',
        file_base64: sampleBase64
      });

      assert.equal(res.statusCode, 201);
      assert.ok(res.data.attachment);
      assert.equal(res.data.attachment.original_filename, 'memory-dump.log');

      // Verify download endpoint
      const dlRes = await callApi(superAdminToken, 'GET', `/api/support/attachments/${res.data.attachment.id}`);
      assert.equal(dlRes.statusCode, 200);
      assert.ok(dlRes.data.attachment.download_url);
    });

    it('should reject malicious executable attachment extensions', async () => {
      const sampleBase64 = Buffer.from('fake exe content').toString('base64');
      const res = await callApi(superAdminToken, 'POST', '/api/support/attachments', {
        ticket_id: resellerTicketId,
        filename: 'malware.exe',
        mime_type: 'application/x-msdownload',
        file_base64: sampleBase64
      });

      assert.equal(res.statusCode, 400);
      assert.ok(res.data.message.includes('not permitted'));
    });

    it('should reject invalid status transitions', async () => {
      const res = await callApi(superAdminToken, 'POST', `/api/admin/support/tickets/${resellerTicketId}/status`, {
        status: 'INVALID_STATUS'
      });

      assert.equal(res.statusCode, 400);
      assert.ok(res.data.message.includes('Invalid status'));
    });
  });

  // ---------------------------------------------------------------------------
  // 5. PUBLIC WEBSITE ENTRY POINT & HOMEPAGE EXCLUSION
  // ---------------------------------------------------------------------------
  describe('5. Public Website Navigation Entry Points & Exclusion Verification', () => {
    it('should confirm Support Tickets entry point is integrated in partners.html navigation & footer', () => {
      const partnersHtml = fs.readFileSync(path.resolve('partners.html'), 'utf8');
      assert.ok(partnersHtml.includes('openSupportTicketModal'), 'partners.html must have openSupportTicketModal trigger');
      assert.ok(partnersHtml.includes('Support Tickets'), 'partners.html must have "Support Tickets" text label');
    });

    it('should confirm Support Tickets entry point is integrated in dynamic service pages footer', () => {
      const dynServiceJs = fs.readFileSync(path.resolve('assets/js/modules/dynamic-services.js'), 'utf8');
      assert.ok(dynServiceJs.includes('openSupportTicketModal()'), 'dynamic-services.js must link footer to support modal');
    });

    it('should confirm Homepage 3D root scenes and Fly Into Future do NOT receive Support Tickets button', () => {
      const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
      // The 3D flight scene layers #a, #b, #c are the root homepage
      // Ensure the support ticket button is explicitly excluded or hidden on the homepage root layers
      const supportTicketJs = fs.readFileSync(path.resolve('assets/js/modules/support-ticket.js'), 'utf8');
      assert.ok(supportTicketJs.includes('isExcludedPage'), 'support-ticket.js must implement strict exclusion check');
      assert.ok(supportTicketJs.includes('Fly into the future.html'), 'Intro page must be strictly excluded');

      const introHtml = fs.readFileSync(path.resolve('Fly into the future.html'), 'utf8');
      assert.equal(introHtml.includes('support-ticket.js'), false, 'Intro page must not load support-ticket module');
      assert.equal(introHtml.includes('openSupportTicketModal'), false, 'Intro page must not have support ticket modal triggers');
    });
  });
});
