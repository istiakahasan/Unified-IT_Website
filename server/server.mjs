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
  '.woff2': 'font/woff2'
};

export function createServer() {
  const server = http.createServer(async (req, res) => {
    // 1. Enterprise Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // 2. CORS Handling
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400);
      return res.end('Bad Request');
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

      let body = {};
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        try {
          const buffers = [];
          for await (const chunk of req) {
            buffers.push(chunk);
          }
          const raw = Buffer.concat(buffers).toString('utf8');
          if (raw) {
            body = JSON.parse(raw);
          }
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: true, message: 'Invalid JSON payload in request body' }));
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
    let filePath = null;

    if (isAdminHost) {
      // Dedicated Admin Subdomain (admin.example.com)
      if (pathname === '/' || pathname === '/login' || pathname === '/index.html') {
        filePath = path.join(ROOT, 'admin.html');
      } else if (pathname === '/partners' || pathname === '/partners/' || pathname === '/partner') {
        filePath = path.join(ROOT, 'admin-partners.html');
      } else {
        filePath = path.join(ROOT, decodeURIComponent(pathname));
      }
    } else if (isPartnerHost) {
      // Dedicated Partner Subdomain (partners.example.com)
      if (pathname === '/' || pathname === '/dashboard' || pathname === '/dashboard/') {
        filePath = path.join(ROOT, 'partner-dashboard.html');
      } else if (pathname === '/program' || pathname === '/join' || pathname === '/apply') {
        filePath = path.join(ROOT, 'partners.html');
      } else {
        filePath = path.join(ROOT, decodeURIComponent(pathname));
      }
    } else {
      // Canonical Public Website & Local Development Path Fallback
      if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/index.html') {
        filePath = path.join(ROOT, 'admin.html');
      } else if (pathname === '/admin/partners' || pathname === '/admin/partners/' || pathname === '/admin/partner') {
        filePath = path.join(ROOT, 'admin-partners.html');
      } else if (pathname === '/partners' || pathname === '/partners/' || pathname === '/partner' || pathname === '/partner/') {
        filePath = path.join(ROOT, 'partners.html');
      } else if (pathname === '/partner/dashboard' || pathname === '/partner/dashboard/') {
        filePath = path.join(ROOT, 'partner-dashboard.html');
      } else {
        let rel = decodeURIComponent(pathname);
        if (rel.startsWith('/admin/assets/')) {
          rel = rel.replace('/admin/assets/', '/assets/');
        } else if (rel.startsWith('/partner/assets/')) {
          rel = rel.replace('/partner/assets/', '/assets/');
        }
        if (rel.endsWith('/')) rel += 'index.html';
        filePath = path.join(ROOT, rel);
      }
    }

    // Security check: stay within ROOT directory
    if (!filePath || (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Forbidden');
    }

    // Static file serving with MIME detection and caching controls
    fs.readFile(filePath, (err, data) => {
      if (err) {
        // Fallback checks for subdomains
        if (isAdminHost) {
          const adminFallback = path.join(ROOT, 'admin.html');
          if (fs.existsSync(adminFallback)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(fs.readFileSync(adminFallback));
          }
        }
        if (isPartnerHost || pathname.startsWith('/partner/')) {
          const partnerFallback = path.join(ROOT, 'partner-dashboard.html');
          if (fs.existsSync(partnerFallback)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(fs.readFileSync(partnerFallback));
          }
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const isDynamic = ext === '.html' || ext === '.js' || ext === '.mjs' || ext === '.css';
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': isDynamic ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
      });
      res.end(data);
    });
  });

  return server;
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
