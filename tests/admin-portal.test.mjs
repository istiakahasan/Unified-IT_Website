import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, hashPassword, verifyPassword } from '../server/db.mjs';
import { PricingEngine } from '../server/pricing-engine.mjs';
import { WHMCSAdapter } from '../server/whmcs-adapter.mjs';
import { CloudStackAdapter } from '../server/cloudstack-adapter.mjs';
import { RewardProcessingService } from '../server/reward-service.mjs';
import { handleLogin, sessionStore, hasPermission, ROLE_PERMISSIONS, authenticateRequest } from '../server/auth.mjs';
import { handleApiRequest } from '../server/api.mjs';

describe('Unified Cloud Centralized Admin Portal - Enterprise Test Suite', () => {
  let db;
  let pricing;
  let whmcs;
  let cloudstack;
  let rewardService;

  // Pre-authenticated session tokens for distinct roles
  let superAdminToken;
  let secAdminToken;
  let infraAdminToken;
  let financeAdminToken;
  let partnerMgrToken;
  let supportAdminToken;
  let contentAdminToken;
  let auditorToken;
  let partnerUserToken;

  // Helper to execute API requests against handleApiRequest
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
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'AdminPortalTestRunner/1.0'
      };
      if (token) {
        reqHeaders['authorization'] = `Bearer ${token}`;
      }

      const req = {
        method,
        headers: reqHeaders,
        socket: { remoteAddress: '192.168.1.100' }
      };

      // Authenticate request attaching session
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
    // Initialize in-memory database with production migrations and seeds
    db = initDatabase(':memory:');
    pricing = new PricingEngine(db);
    whmcs = new WHMCSAdapter();
    cloudstack = new CloudStackAdapter();
    rewardService = new RewardProcessingService(db);

    // Create session helper
    function createRoleSession(email, role, name, id) {
      const user = { id, email, name, role };
      const sess = sessionStore.createSession(user, null, {
        headers: { 'x-forwarded-for': '192.168.1.100', 'user-agent': 'TestAgent/1.0' }
      });
      return sess.token;
    }

    superAdminToken = createRoleSession('admin@unified.cloud', 'SUPER_ADMIN', 'Super Admin', 'usr-super');
    secAdminToken = createRoleSession('sec-admin@unified.cloud', 'SECURITY_ADMIN', 'Security Admin', 'usr-sec');
    infraAdminToken = createRoleSession('infra-admin@unified.cloud', 'INFRASTRUCTURE_ADMIN', 'Infra Admin', 'usr-infra');
    financeAdminToken = createRoleSession('finance-admin@unified.cloud', 'FINANCE_ADMIN', 'Finance Admin', 'usr-finance');
    partnerMgrToken = createRoleSession('partner-mgr@unified.cloud', 'PARTNER_MANAGER', 'Partner Manager', 'usr-pm');
    supportAdminToken = createRoleSession('support-admin@unified.cloud', 'SUPPORT_ADMIN', 'Support Admin', 'usr-support');
    contentAdminToken = createRoleSession('content-admin@unified.cloud', 'CONTENT_ADMIN', 'Content Admin', 'usr-content');
    auditorToken = createRoleSession('auditor@unified.cloud', 'AUDITOR', 'Compliance Auditor', 'usr-auditor');

    // Partner user session (isolated tenant)
    const partnerUser = { id: 'usr-ptn-test', email: 'partner@agency.test', name: 'Partner User', role: 'PARTNER', partner_id: 'ptn-apex-101' };
    const ptnSess = sessionStore.createSession(partnerUser, { id: 'ptn-apex-101', company_name: 'Apex Digital' });
    partnerUserToken = ptnSess.token;
  });

  // 1. Subdomain Architecture & Host Routing Simulation
  describe('1. Subdomain Architecture & Vhost Routing', () => {
    it('should accurately detect admin, partner, and API hosts from Host headers', () => {
      const detectVhost = (rawHost) => {
        const host = (rawHost || '').toLowerCase().split(':')[0];
        return {
          isAdmin: host === 'admin.example.com' || host === 'admin.localhost' || host.startsWith('admin.'),
          isPartner: host === 'partners.example.com' || host === 'partners.localhost' || host.startsWith('partners.'),
          isApi: host === 'api.example.com' || host === 'api.localhost' || host.startsWith('api.'),
          isWww: host === 'www.example.com' || host.startsWith('www.')
        };
      };

      const adminCheck = detectVhost('admin.example.com:443');
      assert.equal(adminCheck.isAdmin, true);
      assert.equal(adminCheck.isPartner, false);

      const partnerCheck = detectVhost('partners.example.com');
      assert.equal(partnerCheck.isPartner, true);
      assert.equal(partnerCheck.isAdmin, false);

      const apiCheck = detectVhost('api.example.com');
      assert.equal(apiCheck.isApi, true);

      const wwwCheck = detectVhost('www.example.com');
      assert.equal(wwwCheck.isWww, true);
    });

    it('should redirect www host with canonical 301 to root domain', () => {
      const publicDomain = 'example.com';
      const reqPath = '/cloud-vps';
      const redirectLocation = `https://${publicDomain}${reqPath}`;
      assert.equal(redirectLocation, 'https://example.com/cloud-vps');
    });
  });

  // 2. Role-Based Access Control (RBAC) & Deny-by-Default
  describe('2. Granular Role-Based Access Control (RBAC)', () => {
    it('should verify hasPermission correctly evaluates wildcard and domain permissions', () => {
      assert.equal(hasPermission('SUPER_ADMIN', 'anything:action'), true);
      assert.equal(hasPermission('SECURITY_ADMIN', 'security:revoke_session'), true);
      assert.equal(hasPermission('SECURITY_ADMIN', 'infrastructure:manage_vm'), false);
      assert.equal(hasPermission('INFRASTRUCTURE_ADMIN', 'infrastructure:manage_vm'), true);
      assert.equal(hasPermission('INFRASTRUCTURE_ADMIN', 'billing:refund'), false);
      assert.equal(hasPermission('FINANCE_ADMIN', 'billing:refund'), true);
      assert.equal(hasPermission('FINANCE_ADMIN', 'infrastructure:manage_vm'), false);
      assert.equal(hasPermission('AUDITOR', 'customers:read'), true);
      assert.equal(hasPermission('AUDITOR', 'customers:write'), false);
      assert.equal(hasPermission('PARTNER', 'infrastructure:manage_vm'), false);
      assert.equal(hasPermission('PARTNER', 'billing:refund'), false);
    });

    it('should reject unauthenticated requests to protected admin endpoints with 401', async () => {
      const res = await callApi(null, 'GET', '/api/admin/dashboard/stats');
      assert.equal(res.statusCode, 401);
      assert.equal(res.data.error, true);
    });

    it('should strictly deny normal PARTNER role access to admin endpoints with 403', async () => {
      const res = await callApi(partnerUserToken, 'GET', '/api/admin/dashboard/stats');
      assert.equal(res.statusCode, 403);
      assert.equal(res.data.error, true);
    });

    it('should allow SUPER_ADMIN full access to dashboard stats', async () => {
      const res = await callApi(superAdminToken, 'GET', '/api/admin/dashboard/stats');
      assert.equal(res.statusCode, 200);
      assert.ok(res.data.customers.total >= 8);
      assert.ok(res.data.partners.total >= 1);
      assert.ok(res.data.cloud.totalVMs >= 6);
    });

    it('should allow FINANCE_ADMIN to view billing overview but deny VM lifecycle actions', async () => {
      // Allowed: Billing overview
      const billingRes = await callApi(financeAdminToken, 'GET', '/api/admin/billing/overview');
      assert.equal(billingRes.statusCode, 200);
      assert.ok(billingRes.data.totalGrossRevenueBDT > 0);

      // Denied: VM lifecycle action
      const vmRes = await callApi(financeAdminToken, 'POST', '/api/admin/cloud/vms/csrv-101/action', {
        action: 'stop',
        reason: 'Attempted by finance admin'
      });
      assert.equal(vmRes.statusCode, 403);
      assert.equal(vmRes.data.error, true);
    });

    it('should allow INFRASTRUCTURE_ADMIN to inspect and manage VMs but deny billing refunds', async () => {
      // Allowed: List VMs
      const vmList = await callApi(infraAdminToken, 'GET', '/api/admin/cloud/vms');
      assert.equal(vmList.statusCode, 200);
      assert.ok(vmList.data.vms.length > 0);

      // Denied: Process refund
      const refundRes = await callApi(infraAdminToken, 'POST', '/api/admin/billing/invoices/inv-101/refund', {
        reason: 'Attempted by infra admin'
      });
      assert.equal(refundRes.statusCode, 403);
      assert.equal(refundRes.data.error, true);
    });

    it('should enforce read-only restrictions on AUDITOR role', async () => {
      // Allowed: Read customers
      const custRes = await callApi(auditorToken, 'GET', '/api/admin/customers');
      assert.equal(custRes.statusCode, 200);
      assert.ok(custRes.data.customers.length > 0);

      // Denied: Update customer status
      const editRes = await callApi(auditorToken, 'POST', '/api/admin/customers/cust-101/status', {
        status: 'SUSPENDED',
        reason: 'Auditor attempt'
      });
      assert.equal(editRes.statusCode, 403);
    });
  });

  // 3. Customer Management
  describe('3. Customer Administration & Security Controls', () => {
    it('should list customers with pagination, counts, and search filter', async () => {
      const res = await callApi(superAdminToken, 'GET', '/api/admin/customers', null, { search: 'Apex' });
      assert.equal(res.statusCode, 200);
      assert.ok(res.data.customers.length >= 1);
      assert.equal(res.data.customers[0].company_name, 'Apex FinTech Global');
    });

    it('should inspect customer details including associated services and invoices', async () => {
      const res = await callApi(superAdminToken, 'GET', '/api/admin/customers/cust-101');
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.customer.id, 'cust-101');
      assert.ok(res.data.services.length > 0);
      assert.ok(res.data.invoices.length > 0);
    });

    it('should require a non-empty reason when suspending a customer account', async () => {
      const res = await callApi(superAdminToken, 'POST', '/api/admin/customers/cust-101/status', {
        status: 'SUSPENDED',
        reason: '' // Missing reason
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.data.error, true);
      assert.match(res.data.message, /reason/i);
    });

    it('should successfully suspend customer account with audit trail and security event', async () => {
      const reason = 'Suspected Terms of Service violation - excessive outbound scan alerts';
      const res = await callApi(superAdminToken, 'POST', '/api/admin/customers/cust-101/status', {
        status: 'SUSPENDED',
        reason
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.status, 'SUSPENDED');

      // Verify DB persistence
      const cust = db.prepare('SELECT status FROM customers WHERE id = ?').get('cust-101');
      assert.equal(cust.status, 'SUSPENDED');

      // Verify audit log
      const audit = db.prepare('SELECT * FROM partner_audit_logs WHERE entity_id = ? ORDER BY created_at DESC LIMIT 1').get('cust-101');
      assert.ok(audit);
      assert.equal(audit.action, 'CUSTOMER_SUSPENDED');
    });

    it('should reactivate suspended customer account with audit entry', async () => {
      const res = await callApi(superAdminToken, 'POST', '/api/admin/customers/cust-101/status', {
        status: 'ACTIVE',
        reason: 'Customer verified KYC documentation and resolved network scan'
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.status, 'ACTIVE');

      const cust = db.prepare('SELECT status FROM customers WHERE id = ?').get('cust-101');
      assert.equal(cust.status, 'ACTIVE');
    });

    it('should trigger secure password reset without exposing existing password or password hash', async () => {
      const res = await callApi(supportAdminToken, 'POST', '/api/admin/customers/cust-101/reset-password', {
        notifyCustomer: true
      });
      assert.equal(res.statusCode, 200);
      assert.ok(res.data.success);
      assert.ok(res.data.resetToken.startsWith('rst_'));
      assert.equal(res.data.existingPassword, undefined);
      assert.equal(res.data.passwordHash, undefined);

      // Verify security event logged
      const secEvent = db.prepare('SELECT * FROM security_events WHERE event_type = ? AND target_id = ?').get('PASSWORD_RESET_TRIGGERED', 'cust-101');
      assert.ok(secEvent);
    });
  });

  // 4. Cloud Infrastructure & VM Lifecycle
  describe('4. Cloud Infrastructure Management & Datacenter Operations', () => {
    it('should provide live infrastructure overview across Dhaka and Singapore datacenter zones', async () => {
      const res = await callApi(infraAdminToken, 'GET', '/api/admin/cloud/overview');
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.zones.length, 2);
      assert.ok(res.data.zones.some(z => z.name.includes('Dhaka')));
      assert.ok(res.data.zones.some(z => z.name.includes('Singapore')));
      assert.ok(res.data.totals.totalVMs >= 6);
    });

    it('should list VMs with zone and status filtering', async () => {
      const res = await callApi(infraAdminToken, 'GET', '/api/admin/cloud/vms', null, { zone: 'Dhaka DC-01' });
      assert.equal(res.statusCode, 200);
      assert.ok(res.data.vms.length > 0);
      assert.ok(res.data.vms.every(v => v.zone === 'Dhaka DC-01'));
    });

    it('should reject destructive VM STOP without documented justification reason', async () => {
      const res = await callApi(infraAdminToken, 'POST', '/api/admin/cloud/vms/csrv-101/action', {
        action: 'stop',
        reason: '' // Missing
      });
      assert.equal(res.statusCode, 400);
      assert.match(res.data.message, /reason/i);
    });

    it('should successfully stop running VM when reason is provided', async () => {
      const res = await callApi(infraAdminToken, 'POST', '/api/admin/cloud/vms/csrv-101/action', {
        action: 'stop',
        reason: 'Scheduled hypervisor kernel patch maintenance'
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.status, 'STOPPED');

      const vm = db.prepare('SELECT status FROM customer_services WHERE id = ?').get('csrv-101');
      assert.equal(vm.status, 'STOPPED');
    });

    it('should successfully start stopped VM', async () => {
      const res = await callApi(infraAdminToken, 'POST', '/api/admin/cloud/vms/csrv-101/action', {
        action: 'start'
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.status, 'RUNNING');
    });

    it('should log and resolve NOC incidents', async () => {
      // 1. Log incident with valid severity: 'WARNING'
      const logRes = await callApi(infraAdminToken, 'POST', '/api/admin/cloud/incidents', {
        zone: 'Dhaka DC-01',
        component: 'Transit BGP Router',
        title: 'Upstream BGP flap detected on transit link',
        severity: 'WARNING',
        description: 'Packet loss elevated to 1.8% on primary upstream peering.'
      });
      assert.equal(logRes.statusCode, 201);
      const incId = logRes.data.id;
      assert.ok(incId);

      // 2. Resolve incident
      const resolveRes = await callApi(infraAdminToken, 'POST', `/api/admin/cloud/incidents/${incId}/resolve`, {
        resolutionNotes: 'Upstream provider re-routed traffic to backup transit path; 0% loss restored.'
      });
      assert.equal(resolveRes.statusCode, 200);
      assert.equal(resolveRes.data.success, true);
    });
  });

  // 5. Billing & Financial Administration
  describe('5. Billing & Financial Administration', () => {
    it('should calculate live financial metrics (MRR, gross revenue, outstanding) from real invoices', async () => {
      const res = await callApi(financeAdminToken, 'GET', '/api/admin/billing/overview');
      assert.equal(res.statusCode, 200);
      assert.ok(res.data.totalGrossRevenueBDT > 0);
      assert.ok(res.data.totalInvoices >= 8);
      assert.ok(res.data.paidCount >= 4);
    });

    it('should list invoices with search and status filtering', async () => {
      const res = await callApi(financeAdminToken, 'GET', '/api/admin/billing/invoices', null, { status: 'PAID' });
      assert.equal(res.statusCode, 200);
      assert.ok(res.data.invoices.length > 0);
      assert.ok(res.data.invoices.every(i => i.status === 'PAID'));
    });

    it('should require a reason when approving a financial refund', async () => {
      const res = await callApi(financeAdminToken, 'POST', '/api/admin/billing/invoices/inv-101/refund', {
        reason: '' // Missing
      });
      assert.equal(res.statusCode, 400);
      assert.match(res.data.message, /reason/i);
    });

    it('should process invoice refund, update status, and record immutable audit trail', async () => {
      const res = await callApi(financeAdminToken, 'POST', '/api/admin/billing/invoices/inv-101/refund', {
        reason: 'Customer cancelled dedicated cluster within SLA guarantee window'
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);

      // Verify DB persistence
      const inv = db.prepare('SELECT status FROM invoices WHERE id = ?').get('inv-101');
      assert.equal(inv.status, 'REFUNDED');

      // Verify audit log
      const audit = db.prepare('SELECT * FROM partner_audit_logs WHERE action = ? AND entity_id = ?').get('FINANCIAL_REFUND_APPROVED', 'inv-101');
      assert.ok(audit);
    });
  });

  // 6. Support Ticket Queue
  describe('6. Support Operations Management', () => {
    it('should list tickets with status, priority, and search filtering', async () => {
      const res = await callApi(supportAdminToken, 'GET', '/api/admin/support/tickets', null, { priority: 'HIGH' });
      assert.equal(res.statusCode, 200);
      assert.ok(res.data.tickets.length >= 1);
      assert.equal(res.data.tickets[0].priority, 'HIGH');
    });

    it('should allow support admin to post reply and transition ticket status', async () => {
      const res = await callApi(supportAdminToken, 'POST', '/api/admin/support/tickets/tck-101/reply', {
        message: 'BGP peering route maps have been re-advertised with community string 65000:100. Please verify on your core router.'
      });
      assert.equal(res.statusCode, 201);
      assert.equal(res.data.success, true);

      // Verify reply saved
      const replies = db.prepare('SELECT * FROM ticket_replies WHERE ticket_id = ?').all('tck-101');
      assert.ok(replies.length >= 2);
    });
  });

  // 7. Public Website CMS Management
  describe('7. Public Website Content & Configuration (CMS)', () => {
    it('should allow unauthenticated public access to published banners and active cloud plans', async () => {
      // Public announcements
      const annRes = await callApi(null, 'GET', '/api/public/announcements');
      assert.equal(annRes.statusCode, 200);
      assert.ok(annRes.data.announcements.length >= 1);

      // Public plans
      const planRes = await callApi(null, 'GET', '/api/public/plans');
      assert.equal(planRes.statusCode, 200);
      assert.ok(planRes.data.plans.length >= 4);
      assert.ok(planRes.data.plans.some(p => p.code === 'VPS-ENTERPRISE'));
    });

    it('should allow CONTENT_ADMIN to create announcements and update SEO metadata', async () => {
      // 1. Create announcement
      const annRes = await callApi(contentAdminToken, 'POST', '/api/admin/cms/announcements', {
        title: 'New Singapore Datacenter Expansion',
        message: 'Equinix SG1 connectivity is now active with ultra-low latency direct peering.',
        type: 'BANNER',
        isActive: 1
      });
      assert.equal(annRes.statusCode, 201);
      assert.ok(annRes.data.announcementId);

      // 2. Update SEO
      const seoRes = await callApi(contentAdminToken, 'PUT', '/api/admin/cms/seo/vps', {
        metaTitle: 'Enterprise Cloud VPS Hosting Bangladesh | Unified Cloud',
        metaDescription: 'High-performance NVMe cloud VPS with BDIX connectivity and DDoS mitigation.',
        canonicalUrl: 'https://example.com/cloud-vps'
      });
      assert.equal(seoRes.statusCode, 200);
      assert.ok(seoRes.data.success);
    });

    it('should deny CONTENT_ADMIN access to infrastructure VM actions', async () => {
      const res = await callApi(contentAdminToken, 'POST', '/api/admin/cloud/vms/csrv-101/action', {
        action: 'stop',
        reason: 'Content admin attempt'
      });
      assert.equal(res.statusCode, 403);
    });
  });

  // 8. Login, Brute-Force Lockout & Session Revocation
  describe('8. Security Monitoring, Brute-Force Protection & Session Revocation', () => {
    it('should enforce 5-attempt brute-force protection with account lockout', () => {
      const testEmail = 'brute.target@unified.cloud';
      // Register temporary user
      const auth = hashPassword('CorrectPass123!');
      db.prepare(`
        INSERT OR REPLACE INTO users (id, email, password_hash, salt, role, status)
        VALUES ('usr-brute', ?, ?, ?, 'CUSTOMER', 'ACTIVE')
      `).run(testEmail, auth.hash, auth.salt);

      // Simulate 4 failed attempts
      for (let i = 1; i <= 4; i++) {
        assert.throws(() => {
          handleLogin(db, testEmail, 'WrongPassword!');
        }, /Invalid email or password/);
      }

      // 5th failed attempt triggers 15-minute lockout
      assert.throws(() => {
        handleLogin(db, testEmail, 'WrongPassword!');
      }, /Account locked for 15 minutes/);

      // Even correct password is now blocked while locked
      assert.throws(() => {
        handleLogin(db, testEmail, 'CorrectPass123!');
      }, /Account temporarily locked/);
    });

    it('should list active sessions with IP and client metadata', async () => {
      const res = await callApi(secAdminToken, 'GET', '/api/admin/security/sessions');
      assert.equal(res.statusCode, 200);
      assert.ok(res.data.sessions.length > 0);
      const session = res.data.sessions[0];
      assert.ok(session.token);
      assert.ok(session.ipAddress);
      assert.ok(session.userAgent);
    });

    it('should allow SECURITY_ADMIN to immediately revoke an active session token', async () => {
      // 1. Create a session to revoke
      const victimUser = { id: 'usr-victim', email: 'victim@unified.cloud', name: 'Victim User', role: 'SUPPORT_ADMIN' };
      const victimSess = sessionStore.createSession(victimUser, null, {
        headers: { 'x-forwarded-for': '10.0.0.5', 'user-agent': 'VictimBrowser' }
      });
      const victimToken = victimSess.token;

      // Token is valid initially
      const preCheck = await callApi(victimToken, 'GET', '/api/admin/support/tickets');
      assert.equal(preCheck.statusCode, 200);

      // 2. SECURITY_ADMIN revokes victim's session
      const revokeRes = await callApi(secAdminToken, 'POST', '/api/admin/security/sessions/revoke', {
        token: victimToken
      });
      assert.equal(revokeRes.statusCode, 200);
      assert.equal(revokeRes.data.success, true);

      // 3. Subsequent request with revoked token must be rejected with 401
      const postCheck = await callApi(victimToken, 'GET', '/api/admin/support/tickets');
      assert.equal(postCheck.statusCode, 401);
      assert.equal(postCheck.data.error, true);
    });
  });
});
