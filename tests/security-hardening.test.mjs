import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer, db } from '../server/server.mjs';
import { initDatabase, secureDemoCredentials, bootstrapAdminFromEnv, verifyPassword } from '../server/db.mjs';
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
    });
  });

  it('module exports the shared database handle', () => {
    assert.ok(db);
  });
});
