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
    // Enable CORS for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

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

    // 1. API Route Dispatcher
    if (pathname.startsWith('/api/')) {
      authenticateRequest(req, db);

      let body = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
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
        pathname,
        query,
        body,
        db,
        pricingEngine,
        whmcsAdapter,
        cloudstackAdapter,
        rewardService
      });
    }

    // 2. Custom Friendly Routes for Cloud Partner Program
    let filePath = null;

    if (pathname === '/partners' || pathname === '/partners/' || pathname === '/partner' || pathname === '/partner/') {
      filePath = path.join(ROOT, 'partners.html');
    } else if (pathname === '/partner/dashboard' || pathname === '/partner/dashboard/') {
      filePath = path.join(ROOT, 'partner-dashboard.html');
    } else if (pathname === '/admin/partners' || pathname === '/admin/partners/' || pathname === '/admin/partner') {
      filePath = path.join(ROOT, 'admin-partners.html');
    } else {
      let rel = decodeURIComponent(pathname);
      // Strip redundant section prefixes if assets are requested relatively from subpaths
      if (rel.startsWith('/admin/assets/')) {
        rel = rel.replace('/admin/assets/', '/assets/');
      } else if (rel.startsWith('/partner/assets/')) {
        rel = rel.replace('/partner/assets/', '/assets/');
      }
      if (rel.endsWith('/')) rel += 'index.html';
      filePath = path.join(ROOT, rel);
    }

    // Security check: stay within ROOT
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Forbidden');
    }

    // Static file serving
    fs.readFile(filePath, (err, data) => {
      if (err) {
        // Fallback for index.html or 404
        if (pathname.startsWith('/partner/')) {
          const fallback = path.join(ROOT, 'partner-dashboard.html');
          if (fs.existsSync(fallback)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(fs.readFileSync(fallback));
          }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const isDynamic = ext === '.html' || ext === '.js' || ext === '.mjs';
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
    console.log(`Unified Cloud Partner Platform running at http://localhost:${PORT}`);
    console.log(`- Partner Program: http://localhost:${PORT}/partners`);
    console.log(`- Partner Dashboard: http://localhost:${PORT}/partner/dashboard`);
    console.log(`- Admin Portal: http://localhost:${PORT}/admin/partners`);
  });
}
