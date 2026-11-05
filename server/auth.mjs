import crypto from 'node:crypto';
import { verifyPassword, verifyPasswordAsync, hashPassword, hashPasswordAsync, needsRehash } from './db.mjs';

/**
 * Client IP used for rate limiting and audit records. X-Forwarded-For is client-controlled,
 * so it is only honoured when the app runs behind a trusted reverse proxy (TRUST_PROXY=1).
 */
export function getClientIp(req) {
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    // nginx sets X-Real-IP to $remote_addr; with $proxy_add_x_forwarded_for the proxy-observed
    // address is the LAST entry (earlier entries come from the client and can be forged).
    const realIp = String(req.headers['x-real-ip'] || '').trim();
    if (realIp) return realIp;
    const hops = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

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
    'agentic:read',
    'agentic:manage',
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
    'agentic:read',
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
    'agentic:read',
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

    const ipAddress = req ? getClientIp(req) : '127.0.0.1';
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
 * Builds the uct_session Set-Cookie value from the environment:
 *   COOKIE_SECURE   true/false (default: on when NODE_ENV=production)
 *   COOKIE_SAME_SITE Strict | Lax | None (default Lax; None is only valid together with Secure)
 *   COOKIE_DOMAIN   e.g. .example.com to share the session across subdomains (default: host-only)
 * maxAge 0 clears the cookie (the same attributes are required for the browser to match it).
 */
export function buildSessionCookie(value, maxAge, env = process.env) {
  const secure = env.COOKIE_SECURE === 'true' || (env.NODE_ENV === 'production' && env.COOKIE_SECURE !== 'false');
  const sameSiteRaw = String(env.COOKIE_SAME_SITE || 'Lax').toLowerCase();
  let sameSite = { strict: 'Strict', lax: 'Lax', none: 'None' }[sameSiteRaw] || 'Lax';
  if (sameSite === 'None' && !secure) sameSite = 'Lax'; // browsers reject SameSite=None without Secure
  const parts = [`uct_session=${value}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`, `Max-Age=${maxAge}`];
  const domain = String(env.COOKIE_DOMAIN || '').trim();
  if (domain && /^.?[a-z0-9-]+(.[a-z0-9-]+)+$/i.test(domain)) parts.push(`Domain=${domain}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

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
        const raw = v.join('=');
        // A malformed %-sequence in any cookie must not throw (it used to crash the request)
        try { return [k, decodeURIComponent(raw)]; } catch { return [k, raw]; }
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

// When the email does not exist, derive a throw-away key at the current cost anyway, so a login for an
// unknown email takes as long as a real one (no account enumeration through response timing).
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');

/** Validates input and account state before the password is checked. Returns the user row or null (unknown email). */
function loginPrecheck(db, email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const user = db.prepare(`
    SELECT * FROM users WHERE email = ?
  `).get(cleanEmail);

  if (!user) return null;

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
  return user;
}

/** Records a failed attempt (atomically, so concurrent attempts are all counted) and throws. */
function loginFailure(db, user) {
  db.prepare(`
    UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE id = ?
  `).run(user.id);
  const { failed_login_attempts: failedAttempts } = db.prepare('SELECT failed_login_attempts FROM users WHERE id = ?').get(user.id);
  // Lock the account after 5 consecutive failures
  if (failedAttempts >= 5) {
    const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare(`
      UPDATE users SET locked_until = ? WHERE id = ?
    `).run(lockUntil, user.id);
    throw new Error('Account locked for 15 minutes due to 5 consecutive failed login attempts.');
  }
  throw new Error('Invalid email or password');
}

function loginSuccess(db, user, req) {
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

/**
 * Robust Login Handler with Rate Limiting, Account Locking, and Audit Recording.
 * Synchronous variant (blocks while hashing); kept for scripts and tests. The HTTP API uses handleLoginAsync.
 */
export function handleLogin(db, email, password, req = null) {
  const user = loginPrecheck(db, email, password);
  if (!user) {
    hashPassword(String(password), DUMMY_SALT);
    throw new Error('Invalid email or password');
  }
  if (!verifyPassword(password, user.password_hash, user.salt)) loginFailure(db, user);
  return loginSuccess(db, user, req);
}

/**
 * Login used by POST /api/auth/login. Password hashing runs on the libuv thread pool, so a login
 * (~0.5 s of PBKDF2 at 600k iterations) never blocks other requests. Legacy hashes are upgraded
 * to the current iteration count after a successful login.
 */
export async function handleLoginAsync(db, email, password, req = null) {
  const user = loginPrecheck(db, email, password);
  if (!user) {
    await hashPasswordAsync(String(password), DUMMY_SALT);
    throw new Error('Invalid email or password');
  }
  const valid = await verifyPasswordAsync(password, user.password_hash, user.salt);
  if (!valid) loginFailure(db, user);
  if (needsRehash(user.password_hash)) {
    try {
      const upgraded = await hashPasswordAsync(password);
      db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(upgraded.hash, upgraded.salt, user.id);
    } catch (err) {
      console.error('[Auth] Password hash upgrade failed:', err.message);
    }
  }
  return loginSuccess(db, user, req);
}
