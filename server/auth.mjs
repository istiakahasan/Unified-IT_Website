import crypto from 'node:crypto';
import { verifyPassword } from './db.mjs';

/**
 * Enterprise Role-Based Access Control (RBAC) Permissions Matrix
 * Enforces deny-by-default on all administrative and domain operations.
 */
export const ROLE_PERMISSIONS = {
  // Super Administrator: Full platform authorization
  SUPER_ADMIN: ['*'],
  ADMIN: ['*'], // Backwards-compatible alias

  // Security Administrator: Authentication, access policies, security telemetry, session revocation
  SECURITY_ADMIN: [
    'security:read',
    'security:write',
    'security:revoke_session',
    'security:audit_logs',
    'users:read',
    'users:manage_roles',
    'customers:read'
  ],

  // Infrastructure Administrator: Datacenter zones, hypervisors, CloudStack VMs, cluster health
  INFRASTRUCTURE_ADMIN: [
    'infrastructure:read',
    'infrastructure:manage_vm',
    'infrastructure:incidents',
    'services:read',
    'services:write',
    'customers:read',
    'cloud:read',
    'cloud:write'
  ],

  // Finance Administrator: Invoices, orders, billing telemetry, refund approvals, partner payouts
  FINANCE_ADMIN: [
    'billing:read',
    'billing:refund',
    'billing:payouts',
    'billing:pricing_rules',
    'partners:read',
    'customers:read'
  ],

  // Partner Manager: Partner applications, partner accounts, custom discount agreements, rewards
  PARTNER_MANAGER: [
    'partners:read',
    'partners:write',
    'partners:approve',
    'partners:spend',
    'partners:agreements',
    'rewards:read',
    'rewards:write',
    'customers:read'
  ],

  // Support Administrator: Helpdesk tickets, incident communications, permitted customer inspection
  SUPPORT_ADMIN: [
    'support:read',
    'support:write',
    'customers:read',
    'customers:reset_password',
    'infrastructure:read'
  ],

  // Content Administrator: Public website CMS, announcements, cloud plans, FAQs, SEO, promo coupons
  CONTENT_ADMIN: [
    'content:read',
    'content:write',
    'content:publish',
    'announcements:read',
    'announcements:write',
    'plans:read',
    'plans:write',
    'seo:read',
    'seo:write',
    'coupons:read',
    'coupons:write'
  ],

  // Read-Only Auditor: Comprehensive compliance access to operational and audit records
  AUDITOR: [
    'audit:read',
    'security:read',
    'billing:read',
    'partners:read',
    'customers:read',
    'infrastructure:read',
    'content:read',
    'support:read'
  ],

  // Partner Portal User: Restricted strictly to own partner tenant data
  PARTNER: [
    'partner:overview',
    'partner:services',
    'partner:customers',
    'partner:rewards',
    'partner:tickets'
  ],

  // Standard Public Customer
  CUSTOMER: [
    'customer:services',
    'customer:invoices',
    'customer:tickets'
  ]
};

/**
 * Checks if a given role possesses the required permission.
 * Supports wildcard '*' and domain wildcards 'domain:*'.
 */
export function hasPermission(role, requiredPermission) {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;

  if (permissions.includes('*')) return true;
  if (permissions.includes(requiredPermission)) return true;

  const [domain] = requiredPermission.split(':');
  if (permissions.includes(`${domain}:*`)) return true;

  return false;
}

/**
 * In-memory secure session manager with revocation, client telemetry, and 24-hour expiration
 */
class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  createSession(user, partner = null, req = null) {
    const token = 'uct_' + crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req?.headers?.['user-agent'] || 'Unknown Client';

    const sessionData = {
      token,
      csrfToken,
      userId: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0],
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role] || [],
      partnerId: user.partner_id || (partner ? partner.id : null),
      companyName: partner ? partner.company_name : null,
      tierId: partner ? partner.tier_id : null,
      ipAddress,
      userAgent,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
      revoked: false
    };

    this.sessions.set(token, sessionData);
    return sessionData;
  }

  getSession(token) {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;

    if (session.revoked) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }

    session.lastActivityAt = Date.now();
    return session;
  }

  destroySession(token) {
    if (token) this.sessions.delete(token);
  }

  revokeSession(token) {
    const session = this.sessions.get(token);
    if (session) {
      session.revoked = true;
      return true;
    }
    return false;
  }

  revokeAllUserSessions(userId) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        session.revoked = true;
        count++;
      }
    }
    return count;
  }

  listActiveSessions() {
    const now = Date.now();
    const active = [];
    for (const [token, s] of this.sessions.entries()) {
      if (!s.revoked && now <= s.expiresAt) {
        active.push({
          sessionId: 'ses_' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 12),
          tokenMasked: token.slice(0, 8) + '...' + token.slice(-4),
          token, // internal reference for revocation
          userId: s.userId,
          email: s.email,
          name: s.name,
          role: s.role,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          createdAt: new Date(s.createdAt).toISOString(),
          lastActivityAt: new Date(s.lastActivityAt).toISOString(),
          expiresAt: new Date(s.expiresAt).toISOString()
        });
      }
    }
    return active;
  }

  cleanExpired() {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt || session.revoked) {
        this.sessions.delete(token);
      }
    }
  }
}

export const sessionStore = new SessionStore();
const cleanupInterval = setInterval(() => sessionStore.cleanExpired(), 15 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

/**
 * Extracts Bearer token or Cookie from request
 */
export function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );
    if (cookies.uct_session) return cookies.uct_session;
    if (cookies.admin_session) return cookies.admin_session;
  }

  return null;
}

/**
 * Authenticates request and attaches user session to req.session
 */
export function authenticateRequest(req, db) {
  const token = extractToken(req);
  if (!token) {
    req.session = null;
    return null;
  }

  const session = sessionStore.getSession(token);
  if (!session) {
    req.session = null;
    return null;
  }

  req.session = session;
  if (session.partnerId) {
    req.partner = db.prepare(`
      SELECT p.*, pt.name as tier_name, pt.slug as tier_slug, pt.discount_rate as tier_discount_rate
      FROM partners p
      JOIN partner_tiers pt ON p.tier_id = pt.id
      WHERE p.id = ?
    `).get(session.partnerId);
  }

  return session;
}

/**
 * Robust Login Handler with Rate Limiting, Account Locking, and Audit Recording
 */
export function handleLogin(db, email, password, req = null) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = db.prepare(`
    SELECT * FROM users WHERE email = ?
  `).get(cleanEmail);

  if (!user) {
    throw new Error('Invalid email or password');
  }

  // Check account lockout
  if (user.locked_until) {
    const lockTime = new Date(user.locked_until).getTime();
    if (Date.now() < lockTime) {
      const remainingMin = Math.ceil((lockTime - Date.now()) / 60000);
      throw new Error(`Account temporarily locked due to repeated failed login attempts. Please try again in ${remainingMin} minute(s).`);
    }
  }

  // Check account status
  if (user.status === 'SUSPENDED') {
    throw new Error('This administrative account has been suspended. Please contact Security Administration.');
  }

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    // Increment failed attempts and trigger lockout if >= 5
    const failedAttempts = (user.failed_login_attempts || 0) + 1;
    if (failedAttempts >= 5) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?
      `).run(failedAttempts, lockUntil, user.id);
      throw new Error('Account locked for 15 minutes due to 5 consecutive failed login attempts.');
    } else {
      db.prepare(`
        UPDATE users SET failed_login_attempts = ? WHERE id = ?
      `).run(failedAttempts, user.id);
    }
    throw new Error('Invalid email or password');
  }

  // Successful login: reset failed attempts and record last login
  db.prepare(`
    UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?
  `).run(user.id);

  let partner = null;
  if (user.partner_id) {
    partner = db.prepare(`
      SELECT * FROM partners WHERE id = ?
    `).get(user.partner_id);

    if (partner && partner.status === 'SUSPENDED') {
      throw new Error('This partner account has been suspended by administration. Please contact support.');
    }
  }

  const session = sessionStore.createSession(user, partner, req);
  return {
    token: session.token,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0],
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role] || [],
      partnerId: user.partner_id
    },
    partner: partner ? {
      id: partner.id,
      companyName: partner.company_name,
      contactName: partner.contact_name,
      tierId: partner.tier_id,
      status: partner.status
    } : null
  };
}
