#!/usr/bin/env node
/**
 * Refreshes the DigiCert list prices in assets/js/data/digicert-prices.js.
 *
 * It downloads DigiCert's public pages on the server side (a browser cannot, because of CORS), reads the
 * "subscription $X" total of every card, and rewrites the "annual" values. It fails (exit code 1, file untouched)
 * if any price is missing or moves by more than 60%, so a changed page layout never publishes wrong prices.
 *
 * Usage:
 *   node scripts/update-digicert-prices.mjs                 fetch live pages and update the data file
 *   node scripts/update-digicert-prices.mjs --dry-run       show the result without writing
 *   node scripts/update-digicert-prices.mjs --single a.html --wildcard b.html   read local files instead (tests)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'assets/js/data/digicert-prices.js');
const URLS = {
  single: 'https://www.digicert.com/tls-ssl/tls-ssl-certificates',
  wildcard: 'https://www.digicert.com/tls-ssl/compare-wildcard-certificates'
};
const HEADER = readFileSync(DATA, 'utf8').split('window.DIGICERT_PRICES')[0];
const PLAN_IDS = { 'Basic': 'basic', 'Secure Site': 'secure-site', 'Secure Site Pro': 'secure-site-pro' };

export function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n').replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;/g, '$')
    .split('\n').map(l => l.replace(/^#+\s*/, '').trim()).filter(Boolean).join('\n');
}

/** Returns { 'basic:OV': 372, ... } using the first card found for each plan + validation level. */
export function parseCards(text) {
  const head = /^(Basic|Secure Site Pro|Secure Site) - (OV|EV)$/;
  const lines = text.split('\n');
  const found = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(head);
    if (!m) continue;
    const key = PLAN_IDS[m[1]] + ':' + m[2];
    if (key in found) continue;
    let end = i + 1;
    while (end < lines.length && !head.test(lines[end])) end++;          // this card's text only
    const block = lines.slice(i, end).join(' ');
    const p = block.match(/subscription\s*\$\s*([\d,]+(?:\.\d+)?)/i);
    if (p) found[key] = Number(p[1].replace(/,/g, ''));
  }
  return found;
}

function load() {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(DATA, 'utf8'), sandbox);
  return sandbox.window.DIGICERT_PRICES;
}

async function getText(kind, file) {
  if (file) return toText(readFileSync(file, 'utf8'));
  const res = await fetch(URLS[kind], { headers: { 'user-agent': 'Mozilla/5.0 (compatible; UnifiedPriceSync/1.0)' } });
  if (!res.ok) throw new Error(URLS[kind] + ' returned HTTP ' + res.status);
  return toText(await res.text());
}

export function apply(data, single, wildcard) {
  const next = JSON.parse(JSON.stringify(data));
  const problems = [];
  const set = (plan, field, value) => {
    if (!(value > 0)) { problems.push('missing ' + plan.id + ' ' + field); return; }
    const old = plan.annual[field];
    if (old && Math.abs(value - old) / old > 0.6) problems.push(plan.id + ' ' + field + ': ' + old + ' -> ' + value + ' (more than 60% change)');
    plan.annual[field] = value;
  };
  for (const plan of next.plans) {
    set(plan, 'OV', single[plan.id + ':OV']);
    set(plan, 'EV', single[plan.id + ':EV']);
    set(plan, 'WILDCARD_OV', wildcard[plan.id + ':OV']);
  }
  return { next, problems };
}

async function main() {
  const args = process.argv.slice(2);
  const arg = n => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };
  const data = load();
  const single = parseCards(await getText('single', arg('--single')));
  const wildcard = parseCards(await getText('wildcard', arg('--wildcard')));
  const { next, problems } = apply(data, single, wildcard);
  if (problems.length) { console.error('Not updated:\n - ' + problems.join('\n - ')); process.exit(1); }
  const changed = JSON.stringify(next.plans) !== JSON.stringify(data.plans);
  if (changed) next.updated = new Date().toISOString().slice(0, 10);
  const out = HEADER + 'window.DIGICERT_PRICES = ' + JSON.stringify(next, null, 2) + ';\n';
  console.log(changed ? 'Prices changed:' : 'Prices unchanged.');
  for (const p of next.plans) console.log(' ', p.name.padEnd(16), JSON.stringify(p.annual));
  if (changed && !args.includes('--dry-run')) { writeFileSync(DATA, out); console.log('Wrote ' + path.relative(ROOT, DATA)); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
