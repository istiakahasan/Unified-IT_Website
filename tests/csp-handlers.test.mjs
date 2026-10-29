import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/**
 * Unit tests for assets/js/csp-handlers.js (the data-on… dispatcher that replaced inline handlers),
 * plus a guard that no page or script reintroduces inline script, which the CSP blocks.
 */
function loadParser() {
  const sandbox = { console: { error() {} }, document: { addEventListener() {} } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('assets/js/csp-handlers.js', 'utf8'), sandbox);
  return sandbox.__cspParseHandler;
}

describe('CSP-safe handler dispatcher', () => {
  const parse = loadParser();
  // results come from the vm realm; copy them so deepStrictEqual compares plain arrays of this realm
  const values = src => Array.from(parse(src).args, a => (a.ev ? 'EVENT' : a.v));
  const pathOf = src => Array.from(parse(src).path);

  it('parses plain calls with literal arguments', () => {
    assert.deepEqual(pathOf("switchAdminView('users')"), ['switchAdminView']);
    assert.deepEqual(values("switchAdminView('users')"), ['users']);
    assert.deepEqual(values("promptRefund('inv-1', \"INV-9\", 1250.5)"), ['inv-1', 'INV-9', 1250.5]);
    assert.deepEqual(values('fillAdminLogin(\'a@b.c\', \'pw\', true)'), ['a@b.c', 'pw', true]);
    assert.deepEqual(values('changeAdminTicketPage(-1)'), [-1]);
    assert.deepEqual(values('handleAdminLoginSubmit(event)'), ['EVENT']);
    assert.deepEqual(values('loadDashboardData()'), []);
    assert.deepEqual(pathOf("window.viewDocPdf('id', 'nid')"), ['window', 'viewDocPdf']);
  });

  it('keeps escaped quotes and backslashes inside string values', () => {
    assert.deepEqual(values("promptCustomerStatus('c1', 'ACTIVE', 'O\\'Brien \\\\ Sons')"), ['c1', 'ACTIVE', "O'Brien \\ Sons"]);
  });

  it('rejects anything that is not a single plain call', () => {
    for (const bad of [
      "x'); alert(1); ('",
      'a(1);alert(1)',
      'alert(1)+1',
      'fn(foo)',
      'fn(window.secret)',
      "fn('unterminated)",
      'document.body.classList.toggle(\'x\') || evil()',
      '(function(){})()',
      'fn(1)(2)'
    ]) {
      assert.equal(parse(bad), null, bad);
    }
  });
});

describe('No inline script anywhere (blocked by the Content-Security-Policy)', () => {
  const pages = ['index.html', 'partners.html', 'partner-dashboard.html', 'admin.html', 'admin-partners.html', 'Fly into the future.html'];
  const scripts = ['assets/js/app.js', 'assets/js/config.js', 'assets/js/csp-handlers.js']
    .concat(fs.readdirSync('assets/js/modules').map(f => 'assets/js/modules/' + f))
    .concat(fs.readdirSync('assets/js/pages').map(f => 'assets/js/pages/' + f));

  for (const f of pages) {
    it(`${f} has no inline <script> blocks`, () => {
      const inline = (fs.readFileSync(f, 'utf8').match(/<script(\s[^>]*)?>/g) || []).filter(t => !/\bsrc=|x-shader/.test(t));
      assert.deepEqual(inline, []);
    });
  }

  for (const f of pages.concat(scripts)) {
    it(`${f} has no on…= handler attributes or javascript: URLs`, () => {
      const s = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.deepEqual(s.match(/<[^>]*\son[a-z]+\s*=\s*\\?["'][^>]*>/gi) || [], []);
      assert.deepEqual(s.match(/<[^>]*\son[a-z]+\s*=\s*\\?["']/gi) || [], []);
      assert.ok(!/href=\\?["']javascript:/i.test(s), 'javascript: URL');
    });
  }
});
