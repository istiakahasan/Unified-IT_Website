/**
 * `npm run lint`: parses every first-party JavaScript file with `node --check`.
 * The project has no bundler-level type checking (plain JS, no TypeScript), so this catches
 * syntax errors in the classic browser scripts and the server before they reach a browser.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['assets/js', 'server', 'scripts', 'tests'];
const SKIP = new Set(['assets/js/vendor']);

function walk(dir, out) {
  if (SKIP.has(dir.replace(/\\/g, '/'))) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap(r => (fs.existsSync(r) ? walk(r, []) : []));
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`✗ ${f}\n${String(err.stderr || err.message).trim()}\n`);
  }
}
console.log(`${files.length - failed}/${files.length} files parsed without syntax errors`);
process.exit(failed ? 1 : 0);
