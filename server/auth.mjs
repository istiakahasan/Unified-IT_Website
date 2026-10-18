import crypto from 'node:crypto';
import { verifyPassword } from './db.mjs';

/**
 * In-memory secure session manager with 24-hour expiration
 */
class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  createSession(user, partner = null) {
    const token = 'uct_' + crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    const sessionData = {
      token,
      csrfToken,
      userId: user.id,
      email: user.email,
      role: user.role,
      partnerId: user.partner_id || (partner ? partner.id : null),
      companyName: partner ? partner.company_name : null,
      tierId: partner ? partner.tier_id : null,
      createdAt: now,
      expiresAt
    };

    this.sessions.set(token, sessionData);
    return sessionData;
  }

  getSession(token) {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  destroySession(token) {
    if (token) this.sessions.delete(token);
  }

  cleanExpired() {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
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
 * Login handler
 */
export function handleLogin(db, email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const user = db.prepare(`
    SELECT * FROM users WHERE email = ?
  `).get(email.toLowerCase().trim());

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  let partner = null;
  if (user.partner_id) {
    partner = db.prepare(`
      SELECT * FROM partners WHERE id = ?
    `).get(user.partner_id);

    if (partner && partner.status === 'SUSPENDED') {
      throw new Error('This partner account has been suspended by administration. Please contact support.');
    }
  }

  const session = sessionStore.createSession(user, partner);
  return {
    token: session.token,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
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
