import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initDatabase } from './db.mjs';
import { PricingEngine } from './pricing-engine.mjs';
import { WHMCSAdapter } from './whmcs-adapter.mjs';
import { CloudStackAdapter } from './cloudstack-adapter.mjs';
import { RewardProcessingService } from './reward-service.mjs';
import { authenticateRequest } from './auth.mjs';
import { handleApiRequest } from './api.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.argv[2] || process.env.PORT || 3000);

// Domain Architecture Environment Variables
const PUBLIC_DOMAIN = (process.env.PUBLIC_DOMAIN || 'example.com').toLowerCase();
const WWW_DOMAIN = (process.env.WWW_DOMAIN || `www.${PUBLIC_DOMAIN}`).toLowerCase();
const ADMIN_DOMAIN = (process.env.ADMIN_DOMAIN || `admin.${PUBLIC_DOMAIN}`).toLowerCase();
const PARTNER_DOMAIN = (process.env.PARTNER_DOMAIN || `partners.${PUBLIC_DOMAIN}`).toLowerCase();
const API_DOMAIN = (process.env.API_DOMAIN || `api.${PUBLIC_DOMAIN}`).toLowerCase();

// Initialize DB and Adapters
export const db = initDatabase();
export const pricingEngine = new PricingEngine(db);
export const whmcsAdapter = new WHMCSAdapter();
export const cloudstackAdapter = new CloudStackAdapter();
export const rewardService = new RewardProcessingService(db);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.frag': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff'
};

// Largest accepted API request body. Support attachments are base64 JSON (10 MB file ~ 13.4 MB encoded).
const MAX_BODY_BYTES = 15 * 1024 * 1024;

// Only these files and folders are public. Everything else in the repository (data/ with the SQLite
// database and uploaded attachments, server/, tests/, scripts/, .git/, .env*, package files) is never served.
const PUBLIC_PAGES = new Set(['index.html', 'admin.html', 'partners.html', 'partner-dashboard.html', 'admin-partners.html', 'Fly into the future.html']);
const PUBLIC_DIRS = ['assets'];

function isPublicPath(rel) {
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return false;
  if (parts.some(p => p.startsWith('.'))) return false; // dotfiles and dot-directories
  if (parts.length === 1) return PUBLIC_PAGES.has(parts[0]);
  return PUBLIC_DIRS.includes(parts[0]);
}

/**
 * Content-Security-Policy for every HTML page. Scripts may only be files from this site: no inline
 * <script>, no on…= attributes, no javascript: URLs, no eval (page scripts live in assets/js/pages, event
 * handlers are data-on… attributes run by assets/js/csp-handlers.js, libraries are vendored in
 * assets/js/vendor). WebAssembly is allowed for the Meshopt model decoder. Inline *styles* remain allowed
 * (style attributes are used throughout and cannot execute code). Each allowance below maps to a real use,
 * verified in a browser with zero violations (tests/e2e). CSP_REPORT_ONLY=1 sends it report-only.
 */
export function buildContentSecurityPolicy(env = process.env) {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",                  // no inline script: handlers use data-on* (assets/js/csp-handlers.js)
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",          // GLB textures are data:/blob: URLs; logos may be remote
    "connect-src 'self' https://open.er-api.com",  // USD->BDT rate for the SSL catalogs (config.js fxApi)
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' mailto:",
    "frame-ancestors 'self'"
  ];
  if (env.NODE_ENV === 'production') directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}
const CSP_HEADER = process.env.CSP_REPORT_ONLY === '1' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
const CSP_VALUE = buildContentSecurityPolicy();

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Origins allowed to make credentialed cross-origin API calls: the configured domains plus local development. */
function buildAllowedOrigins() {
  const hosts = [PUBLIC_DOMAIN, WWW_DOMAIN, ADMIN_DOMAIN, PARTNER_DOMAIN, API_DOMAIN];
  const set = new Set();
  for (const h of hosts) {
    set.add(`https://${h}`);
    if (process.env.NODE_ENV !== 'production') set.add(`http://${h}`);
  }
  for (const extra of String(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)) {
    set.add(extra.replace(/\/$/, ''));
  }
  return set;
}
const ALLOWED_ORIGINS = buildAllowedOrigins();

function isAllowedOrigin(origin, reqHost) {
  if (!origin) return false;
  let u;
  try { u = new URL(origin); } catch { return false; }
  if (ALLOWED_ORIGINS.has(u.origin)) return true;
  // Same host as the request (e.g. http://localhost:3000 calling its own API)
  if (reqHost && u.host === reqHost) return true;
  if (process.env.NODE_ENV !== 'production' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.endsWith('.localhost'))) return true;
  return false;
}

function sendPlain(res, status, text) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

export function createServer() {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(err => {
      // A single bad request must never take the whole site down.
      console.error('[Request Error]', req.method, req.url, err && err.message);
      sendPlain(res, 500, 'Internal Server Error');
    });
  });

  // Malformed HTTP from a client: answer 400 instead of leaving the socket hanging.
  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  return server;
}

async function handleRequest(req, res) {
    // 1. Enterprise Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    const reqHost = (req.headers.host || '').toLowerCase();

    // 2. CORS Handling: only allow-listed origins get credentialed access
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Vary', 'Origin');
      if (isAllowedOrigin(origin, reqHost)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, 'http://localhost');
    } catch {
      return sendPlain(res, 400, 'Bad Request');
    }

    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    // 3. Subdomain Detection & Vhost Routing
    const rawHost = (req.headers.host || 'localhost').toLowerCase();
    const host = rawHost.split(':')[0]; // strip port

    const isWwwHost = host === WWW_DOMAIN || host.startsWith('www.');
    const isAdminHost = host === ADMIN_DOMAIN || host === 'admin.localhost' || host.startsWith('admin.');
    const isPartnerHost = host === PARTNER_DOMAIN || host === 'partners.localhost' || host === 'partner.localhost' || host.startsWith('partners.') || host.startsWith('partner.');
    const isApiHost = host === API_DOMAIN || host === 'api.localhost' || host.startsWith('api.');

    // Optional canonical redirect: www.example.com -> example.com
    if (isWwwHost && host !== 'localhost') {
      res.writeHead(301, {
        Location: `https://${PUBLIC_DOMAIN}${pathname}${parsedUrl.search}`
      });
      return res.end();
    }

    // 4. API Route Dispatcher
    // On api.example.com, or whenever /api/ prefix is accessed
    if (pathname.startsWith('/api/') || isApiHost) {
      let apiPath = pathname;
      if (isApiHost && !apiPath.startsWith('/api/')) {
        apiPath = '/api' + apiPath;
      }

      authenticateRequest(req, db);

      const isUnsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      const sendJsonError = (status, message) => {
        // 413: the rest of the body is never read, so the connection cannot be reused
        const extra = status === 413 ? { Connection: 'close' } : {};
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra });
        return res.end(JSON.stringify({ error: true, message }));
      };

      // CSRF: a browser attaches the session cookie automatically, so state-changing calls that are
      // authenticated by cookie (not by an explicit Bearer header) must come from an allow-listed origin.
      const hasBearer = String(req.headers['authorization'] || '').startsWith('Bearer ');
      if (isUnsafeMethod && !hasBearer && /(?:^|;\s*)(uct_session|admin_session)=/.test(req.headers['cookie'] || '')) {
        let source = req.headers.origin;
        if (!source && req.headers.referer) {
          try { source = new URL(req.headers.referer).origin; } catch { source = null; }
        }
        if (source && !isAllowedOrigin(source, reqHost)) {
          return sendJsonError(403, 'Cross-site request blocked (CSRF protection).');
        }
      }

      let body = {};
      if (isUnsafeMethod) {
        const declared = Number(req.headers['content-length'] || 0);
        if (declared > MAX_BODY_BYTES) {
          return sendJsonError(413, 'Request body too large.');
        }
        let raw;
        try {
          const buffers = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              return sendJsonError(413, 'Request body too large.');
            }
            buffers.push(chunk);
          }
          raw = Buffer.concat(buffers).toString('utf8');
        } catch {
          return sendJsonError(400, 'Could not read request body');
        }
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            return sendJsonError(400, 'Invalid JSON payload in request body');
          }
          if (body === null || typeof body !== 'object') body = {};
        }
      }

      return handleApiRequest({
        req,
        res,
        pathname: apiPath,
        query,
        body,
        db,
        pricingEngine,
        whmcsAdapter,
        cloudstackAdapter,
        rewardService
      });
    }

    // 5. Host & Subdomain Specific Static Views
    const decodedPath = safeDecode(pathname);
    if (decodedPath === null || decodedPath.includes(String.fromCharCode(0))) {
      return sendPlain(res, 400, 'Bad Request');
    }

    let rel = null;

    if (isAdminHost) {
      // Dedicated Admin Subdomain (admin.example.com)
      if (pathname === '/' || pathname === '/login' || pathname === '/index.html') {
        rel = 'admin.html';
      } else if (pathname === '/partners' || pathname === '/partners/' || pathname === '/partner') {
        rel = 'admin-partners.html';
      } else {
        rel = decodedPath;
      }
    } else if (isPartnerHost) {
      // Dedicated Partner Subdomain (partners.example.com)
      if (pathname === '/' || pathname === '/dashboard' || pathname === '/dashboard/') {
        rel = 'partner-dashboard.html';
      } else if (pathname === '/program' || pathname === '/join' || pathname === '/apply') {
        rel = 'partners.html';
      } else {
        rel = decodedPath;
      }
    } else {
      // Canonical Public Website & Local Development Path Fallback
      if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/index.html') {
        rel = 'admin.html';
      } else if (pathname === '/admin/partners' || pathname === '/admin/partners/' || pathname === '/admin/partner') {
        rel = 'admin-partners.html';
      } else if (pathname === '/partners' || pathname === '/partners/' || pathname === '/partner' || pathname === '/partner/') {
        rel = 'partners.html';
      } else if (pathname === '/partner/dashboard' || pathname === '/partner/dashboard/') {
        rel = 'partner-dashboard.html';
      } else {
        rel = decodedPath;
        if (rel.startsWith('/admin/assets/')) {
          rel = rel.replace('/admin/assets/', '/assets/');
        } else if (rel.startsWith('/partner/assets/')) {
          rel = rel.replace('/partner/assets/', '/assets/');
        }
        if (rel.endsWith('/')) rel += 'index.html';
      }
    }

    const filePath = path.join(ROOT, rel);
    const relToRoot = path.relative(ROOT, filePath);

    // Security check: stay within ROOT and only serve the public allow-list
    const servable = relToRoot && !relToRoot.startsWith('..') && !path.isAbsolute(relToRoot) && isPublicPath(relToRoot);

    const sendFallbackOr404 = () => {
      // SPA fallbacks for the subdomains (only ever the public HTML shells)
      const fallback = isAdminHost ? 'admin.html'
        : (isPartnerHost || pathname.startsWith('/partner/')) ? 'partner-dashboard.html'
        : null;
      if (fallback) {
        return serveFile(req, res, path.join(ROOT, fallback), () => sendPlain(res, 404, 'Not found'));
      }
      return sendPlain(res, 404, 'Not found');
    };

    if (!servable) return sendFallbackOr404();
    return serveFile(req, res, filePath, sendFallbackOr404);
}

/**
 * Streams a static file with validators so browsers can revalidate (304) instead of
 * re-downloading three.js, the GLB model and every module on each page load.
 */
function serveFile(req, res, filePath, onMissing) {
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) return onMissing();

    const ext = path.extname(filePath).toLowerCase();
    const isCode = ext === '.html' || ext === '.js' || ext === '.mjs' || ext === '.css';
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      // HTML/JS/CSS: always revalidate (cheap 304 when unchanged) so deployments are picked up immediately
      'Cache-Control': isCode ? 'no-cache' : 'public, max-age=3600',
      'ETag': etag,
      'Last-Modified': stat.mtime.toUTCString()
    };
    if (ext === '.html') headers[CSP_HEADER] = CSP_VALUE;

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url) || process.env.RUN_STANDALONE === '1') {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`========================================================================`);
    console.log(`Unified Cloud Enterprise Platform & Subdomain Services Running`);
    console.log(`Port: ${PORT} | Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`1. Public Website:      http://localhost:${PORT}/  (${PUBLIC_DOMAIN})`);
    console.log(`2. Centralized Admin:   http://localhost:${PORT}/admin  (${ADMIN_DOMAIN})`);
    console.log(`3. Partner Dashboard:   http://localhost:${PORT}/partner/dashboard  (${PARTNER_DOMAIN})`);
    console.log(`4. Partner Program:     http://localhost:${PORT}/partners`);
    console.log(`5. Backend APIs:        http://localhost:${PORT}/api/*  (${API_DOMAIN})`);
    console.log(`========================================================================`);
  });
}
