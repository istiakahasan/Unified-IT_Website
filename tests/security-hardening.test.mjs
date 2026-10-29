import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer, db } from '../server/server.mjs';
import { initDatabase, secureDemoCredentials, bootstrapAdminFromEnv, verifyPassword, verifyPasswordAsync, hashPassword, needsRehash, PASSWORD_ITERATIONS, LEGACY_ITERATIONS } from '../server/db.mjs';
import { handleLoginAsync, buildSessionCookie } from '../server/auth.mjs';
import { resolveDbPath } from '../server/db.mjs';
import path from 'node:path';
import { getClientIp } from '../server/api.mjs';

/**
 * Regression tests for the HTTP layer hardening (see CHANGES.md):
 * static file allow-list, malformed URL crash, CORS allow-list, cookie CSRF check,
 * request body limit, attachment MIME handling, and demo credentials in production.
 */
describe('Security hardening regression suite', () => {
  let server;
  let port;

  // Raw request helper: lets a test send paths the URL class would normalise away.
  function request(method, rawPath, { headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method, path: rawPath, headers, agent: false }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      if (body !== null) req.write(body);
      req.end();
    });
  }

  before(async () => {
    server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });

  after(() => new Promise(r => server.close(r)));

  describe('Static file allow-list', () => {
    for (const p of ['/data/partner-system.db', '/.git/config', '/.env.example', '/server/auth.mjs', '/tests/admin-portal.test.mjs', '/package.json', '/scripts/serve.js', '/assets/../data/partner-system.db', '/%2e%2e/%2e%2e/etc/passwd']) {
      it(`does not serve ${p}`, async () => {
        const res = await request('GET', p);
        assert.equal(res.status, 404);
        assert.ok(!res.body.includes('SQLite format'), 'database bytes must never be returned');
      });
    }

    for (const [p, marker] of [['/', 'Unified Cloud'], ['/partners', 'Partner'], ['/admin', 'Admin'], ['/partner/dashboard', 'Partner'], ['/assets/js/app.js', 'data-app']]) {
      it(`still serves public route ${p}`, async () => {
        const res = await request('GET', p);
        assert.equal(res.status, 200);
        assert.ok(res.body.includes(marker));
      });
    }

    it('sends a Content-Security-Policy on HTML pages only', async () => {
      for (const p of ['/', '/partners', '/admin', '/partner/dashboard']) {
        const csp = (await request('GET', p)).headers['content-security-policy'] || '';
        assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'(;|$)/, p);
        assert.match(csp, /object-src 'none'/);
        assert.match(csp, /base-uri 'self'/);
        assert.match(csp, /frame-ancestors 'self'/);
      }
      const js = await request('GET', '/assets/js/app.js');
      assert.equal(js.headers['content-security-policy'], undefined);
    });

    it('answers repeat asset requests with 304 via ETag', async () => {
      const first = await request('GET', '/assets/js/app.js');
      assert.ok(first.headers.etag);
      const second = await request('GET', '/assets/js/app.js', { headers: { 'If-None-Match': first.headers.etag } });
      assert.equal(second.status, 304);
    });
  });

  describe('Malformed input does not crash the server', () => {
    it('returns 400 for a malformed percent-encoded path and keeps serving', async () => {
      const bad = await request('GET', '/%E0%A4%A');
      assert.equal(bad.status, 400);
      const ok = await request('GET', '/');
      assert.equal(ok.status, 200);
    });

    it('tolerates a malformed session cookie', async () => {
      const res = await request('GET', '/api/public/plans', { headers: { Cookie: 'uct_session=%E0%A4%A' } });
      assert.notEqual(res.status, 500);
      const ok = await request('GET', '/');
      assert.equal(ok.status, 200);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await request('POST', '/api/support/tickets', { headers: { 'Content-Type': 'application/json' }, body: '{not json' });
      assert.equal(res.status, 400);
    });

    it('rejects oversized request bodies with 413', async () => {
      const res = await request('POST', '/api/support/tickets', { headers: { 'Content-Type': 'application/json', 'Content-Length': String(16 * 1024 * 1024) } });
      assert.equal(res.status, 413);
    });
  });

  describe('CORS allow-list', () => {
    it('does not grant credentialed CORS to an arbitrary origin', async () => {
      const res = await request('GET', '/api/public/plans', { headers: { Origin: 'https://evil.example' } });
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    it('allows the request\'s own origin', async () => {
      const origin = `http://127.0.0.1:${port}`;
      const res = await request('GET', '/api/public/plans', { headers: { Origin: origin, Host: `127.0.0.1:${port}` } });
      assert.equal(res.headers['access-control-allow-origin'], origin);
    });
  });

  describe('Cookie CSRF protection', () => {
    let cookie;
    before(async () => {
      const res = await request('POST', '/api/auth/login', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin@unified.cloud', password: 'SuperAdmin2026!' })
      });
      assert.equal(res.status, 200, res.body);
      cookie = String(res.headers['set-cookie']).split(';')[0];
    });

    it('blocks a cookie-authenticated POST from a foreign origin', async () => {
      const res = await request('POST', '/api/auth/logout', { headers: { Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(res.status, 403);
    });

    it('allows the same POST from the site itself', async () => {
      const res = await request('POST', '/api/auth/logout', { headers: { Cookie: cookie, Origin: `http://127.0.0.1:${port}`, Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' }, body: '{}' });
      assert.notEqual(res.status, 403);
    });
  });

  describe('Support attachments', () => {
    it('ignores a client-supplied text/html MIME type and refuses it', async () => {
      const res = await request('POST', '/api/support/attachments', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'note.txt', mimeType: 'text/html', base64Data: Buffer.from('<script>alert(1)</script>').toString('base64') })
      });
      assert.equal(res.status, 400);
    });

    it('stores an allowed upload with the MIME type derived from its extension', async () => {
      const res = await request('POST', '/api/support/attachments', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'log.txt', mimeType: 'text/plain', base64Data: Buffer.from('hello').toString('base64') })
      });
      assert.equal(res.status, 201, res.body);
      assert.match(JSON.parse(res.body).mimeType, /^text\/plain/);
    });

    it('never exposes uploaded files through the static server', async () => {
      const res = await request('GET', '/data/attachments/anything.txt');
      assert.equal(res.status, 404);
    });
  });

  describe('Client IP for rate limiting', () => {
    it('ignores X-Forwarded-For unless TRUST_PROXY is set', () => {
      const prev = process.env.TRUST_PROXY;
      delete process.env.TRUST_PROXY;
      const req = { headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '10.0.0.9' } };
      assert.equal(getClientIp(req), '10.0.0.9');
      process.env.TRUST_PROXY = '1';
      assert.equal(getClientIp({ headers: { 'x-forwarded-for': 'forged, 5.6.7.8' }, socket: {} }), '5.6.7.8');
      if (prev === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = prev;
    });
  });

  describe('Demo credentials in production', () => {
    it('disables public demo passwords when NODE_ENV=production', () => {
      const memDb = initDatabase(':memory:');
      const user = () => memDb.prepare('SELECT password_hash, salt FROM users WHERE email = ?').get('superadmin@unified.cloud');
      assert.ok(verifyPassword('SuperAdmin2026!', user().password_hash, user().salt));
      const count = secureDemoCredentials(memDb, { NODE_ENV: 'production' });
      assert.ok(count >= 1);
      assert.equal(verifyPassword('SuperAdmin2026!', user().password_hash, user().salt), false);
    });

    it('keeps demo passwords in development', () => {
      const memDb = initDatabase(':memory:');
      assert.equal(secureDemoCredentials(memDb, { NODE_ENV: 'development' }), 0);
    });

    it('creates a bootstrap Super Admin from the environment', () => {
      const memDb = initDatabase(':memory:');
      assert.equal(bootstrapAdminFromEnv(memDb, { BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com', BOOTSTRAP_ADMIN_PASSWORD: 'short' }), false);
      assert.equal(bootstrapAdminFromEnv(memDb, { BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com', BOOTSTRAP_ADMIN_PASSWORD: 'a-long-unique-passphrase' }), true);
      const row = memDb.prepare('SELECT role, password_hash, salt FROM users WHERE email = ?').get('owner@example.com');
      assert.equal(row.role, 'SUPER_ADMIN');
      assert.ok(verifyPassword('a-long-unique-passphrase', row.password_hash, row.salt));
      // A restart must not undo a password change made in the portal...
      assert.equal(bootstrapAdminFromEnv(memDb, { BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com', BOOTSTRAP_ADMIN_PASSWORD: 'another-long-passphrase' }), false);
      // ...unless a reset is requested explicitly
      assert.equal(bootstrapAdminFromEnv(memDb, { BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com', BOOTSTRAP_ADMIN_PASSWORD: 'another-long-passphrase', BOOTSTRAP_ADMIN_RESET: '1' }), true);
    });
  });

  describe('Password hashing', () => {
    it('stores new hashes self-describing at the OWASP iteration count', () => {
      assert.equal(PASSWORD_ITERATIONS, 600000);
      const { hash, salt } = hashPassword('Correct-Horse-1');
      assert.match(hash, /^pbkdf2_sha256\$600000\$[0-9a-f]{128}$/);
      assert.equal(verifyPassword('Correct-Horse-1', hash, salt), true);
      assert.equal(verifyPassword('wrong', hash, salt), false);
      assert.equal(needsRehash(hash), false);
    });

    it('still verifies legacy bare-hex hashes and flags them for upgrade', async () => {
      const legacy = hashPassword('Legacy-Pass-1', undefined, LEGACY_ITERATIONS);
      assert.match(legacy.hash, /^[0-9a-f]{128}$/);
      assert.equal(verifyPassword('Legacy-Pass-1', legacy.hash, legacy.salt), true);
      assert.equal(await verifyPasswordAsync('Legacy-Pass-1', legacy.hash, legacy.salt), true);
      assert.equal(needsRehash(legacy.hash), true);
    });

    it('rejects malformed stored hashes instead of throwing', () => {
      assert.equal(verifyPassword('x', 'pbkdf2_sha256$abc$00', 'salt'), false);
      assert.equal(verifyPassword('x', 'zz', 'salt'), false);
    });

    it('upgrades a legacy hash on successful login and keeps the event loop free while hashing', async () => {
      const memDb = initDatabase(':memory:');
      const before = memDb.prepare('SELECT password_hash FROM users WHERE email = ?').get('support@unified.cloud').password_hash;
      assert.equal(needsRehash(before), true, 'seeded demo hash is legacy-cost');

      // Measure the longest event-loop stall while two full-cost hashes (verify + upgrade) run
      let worst = 0, last = performance.now(), ticking = true;
      const tick = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; if (ticking) setImmediate(tick); };
      setImmediate(tick);
      const session = await handleLoginAsync(memDb, 'support@unified.cloud', 'SupportAdmin2026!');
      ticking = false;
      assert.ok(session.token);
      const after = memDb.prepare('SELECT password_hash, salt FROM users WHERE email = ?').get('support@unified.cloud');
      assert.match(after.password_hash, /^pbkdf2_sha256\$600000\$/);
      assert.equal(verifyPassword('SupportAdmin2026!', after.password_hash, after.salt), true);
      assert.ok(worst < 150, `event loop stalled ${Math.round(worst)} ms during login`);
    });

    it('takes comparable time for unknown emails and wrong passwords (no enumeration by timing)', async () => {
      const memDb = initDatabase(':memory:');
      const strong = hashPassword('Real-Pass-123');
      memDb.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE email = ?').run(strong.hash, strong.salt, 'auditor@unified.cloud');
      const time = async (email) => { const t = performance.now(); await handleLoginAsync(memDb, email, 'wrong-password').catch(() => {}); return performance.now() - t; };
      const known = await time('auditor@unified.cloud');
      const unknown = await time('nobody@example.com');
      assert.ok(unknown > known * 0.5, `unknown-email login too fast: ${Math.round(unknown)} ms vs ${Math.round(known)} ms`);
    });
  });

  describe('Session cookie and database configuration', () => {
    it('defaults to HttpOnly, SameSite=Lax, host-only, not Secure in development', () => {
      assert.equal(buildSessionCookie('tok', 86400, {}), 'uct_session=tok; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400');
    });

    it('adds Secure in production and honours COOKIE_SAME_SITE / COOKIE_DOMAIN', () => {
      const c = buildSessionCookie('tok', 86400, { NODE_ENV: 'production', COOKIE_SAME_SITE: 'Strict', COOKIE_DOMAIN: '.example.com' });
      assert.equal(c, 'uct_session=tok; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400; Domain=.example.com; Secure');
    });

    it('never emits SameSite=None without Secure, and ignores an invalid domain', () => {
      const c = buildSessionCookie('tok', 0, { COOKIE_SAME_SITE: 'None', COOKIE_DOMAIN: 'evil.com; Path=/x' });
      assert.match(c, /SameSite=Lax/);
      assert.ok(!c.includes('Domain='));
    });

    it('resolves PARTNER_DB_PATH relative to the project root', () => {
      assert.match(resolveDbPath({}), /data[\\/]partner-system\.db$/);
      assert.equal(resolveDbPath({ PARTNER_DB_PATH: 'data/custom.db' }), path.resolve(path.dirname(resolveDbPath({})), 'custom.db'));
    });

    it('login sets the configured cookie over HTTP', async () => {
      const res = await request('POST', '/api/auth/login', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'auditor@unified.cloud', password: 'AuditorAdmin2026!' }) });
      assert.equal(res.status, 200, res.body);
      assert.match(String(res.headers['set-cookie']), /^uct_session=uct_[0-9a-f]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=86400/);
    });
  });

  it('module exports the shared database handle', () => {
    assert.ok(db);
  });
});
