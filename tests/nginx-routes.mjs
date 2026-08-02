/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
 * © 2026 Vahini Technologies. All rights reserved.
 *
 * nginx-routes.mjs — routing regression against the REAL deploy/nginx.conf.
 *
 * Why this exists, separately from e2e-pages.mjs: that test spawns
 * `http-server` at the repo root, so every URL it asks for is a plain file
 * path and nginx is never involved. A whole class of production bug is
 * therefore invisible to it -- the pages are fine, the files are present, and
 * the SERVER sends the browser somewhere else.
 *
 * That is not hypothetical. Production served the marketing pages at bare
 * URLs (/events.html) while their asset refs stayed relative, so
 * `assets/events/iit-01.jpg` resolved to /assets/events/iit-01.jpg -- and
 * `location ^~ /assets/` unconditionally 302'd that into the analyser
 * container, which has no such file. 17 of 19 images on /events.html were
 * broken in production while every file sat correctly in the repo and every
 * existing test passed.
 *
 * So: run the actual config, load the actual pages at their PUBLIC urls in a
 * real browser, and fail on any request the server does not answer with 200.
 *
 * The config is used verbatim apart from four mechanical substitutions
 * (listen port, root, the headers include path, and the proxy_pass upstream
 * host:port -> local stubs). No location, try_files, return or rewrite is
 * touched -- those are what is under test. Each substitution asserts it
 * actually matched, so a config restructure fails loudly instead of silently
 * testing nothing.
 *
 * The analyser stub 404s everything, exactly like the real analyser does for
 * site assets. Anything that leaks into /analyser therefore fails here with
 * the offending URL rather than in someone's browser.
 *
 *   npm run test:routes
 *
 * Needs nginx on PATH (`sudo apt-get install -y nginx-light`) and Chromium
 * (`npx playwright install chromium`).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.VAHINI_ROUTES_PORT || 8099);
const ANALYSER_PORT = PORT + 1;
const PERSIST_PORT = PORT + 2;
const BASE = `http://127.0.0.1:${PORT}`;
const CANONICAL_HOST = 'https://vahinitech.com';

const results = [];
const ok = (name, detail = '') => results.push({ name, ok: true, detail });
const fail = (name, detail = '') => results.push({ name, ok: false, detail });

/* ---------------------------------------------------------------- config -- */

function substitute(conf, pattern, replacement, what) {
  const hits = conf.match(pattern);
  if (!hits || hits.length === 0) {
    throw new Error(
      `deploy/nginx.conf no longer contains ${what} (pattern ${pattern}). ` +
      `This harness rewrites it to run locally; update the pattern rather ` +
      `than deleting the check, or the routing tests silently stop testing.`
    );
  }
  return conf.replace(pattern, replacement);
}

function buildConfig(dir) {
  const src = fs.readFileSync(path.join(ROOT, 'deploy', 'nginx.conf'), 'utf8');
  let site = src;
  site = substitute(site, /listen\s+80;/, `listen 127.0.0.1:${PORT};`, 'a `listen 80;` directive');
  site = substitute(site, /root\s+\/usr\/share\/nginx\/html;/, `root ${ROOT};`, 'the nginx html root');
  site = substitute(
    site, /include \/etc\/nginx\/vahini-headers\.inc;/g,
    `include ${path.join(dir, 'headers.inc')};`, 'the vahini-headers.inc include'
  );
  // Upstream targets only. Locations, try_files and returns stay byte-identical.
  site = substitute(site, /http:\/\/analyser:8868/g, `http://127.0.0.1:${ANALYSER_PORT}`, 'the analyser upstream');
  site = substitute(site, /http:\/\/persist:8090/g, `http://127.0.0.1:${PERSIST_PORT}`, 'the persist upstream');

  fs.writeFileSync(path.join(dir, 'site.conf'), site);
  fs.writeFileSync(
    path.join(dir, 'headers.inc'),
    fs.readFileSync(path.join(ROOT, 'deploy', 'nginx-headers.inc'), 'utf8')
  );

  // The real deploy/nginx-security.conf (installed as conf.d/00-security.conf)
  // defines the rate zones AND the $vahini_csp map that nginx-headers.inc
  // reads, so it is used as-is rather than stubbed -- the routing then runs
  // with the same maps production has. Only the rates are raised: a browser
  // pulling a whole page in one burst would otherwise trip the 12r/s page
  // limit and fail as a 429. The limits themselves are covered by
  // security-abuse.test.mjs.
  let security = fs.readFileSync(path.join(ROOT, 'deploy', 'nginx-security.conf'), 'utf8');
  security = substitute(security, /rate=\d+r\/[sm]/g, 'rate=10000r/s', 'limit_req_zone rate= directives');
  fs.writeFileSync(path.join(dir, 'security.conf'), security);

  // `user` only when root: nginx warns and ignores it otherwise, and as root
  // the default `nobody` worker cannot read a checkout under /tmp or $HOME.
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  fs.writeFileSync(path.join(dir, 'nginx.conf'), [
    asRoot ? 'user root;' : '',
    'worker_processes 1;',
    'daemon off;',
    'error_log logs/error.log warn;',
    'pid logs/nginx.pid;',
    'events { worker_connections 128; }',
    'http {',
    '  include /etc/nginx/mime.types;',
    '  default_type application/octet-stream;',
    '  access_log logs/access.log;',
    '  client_body_temp_path temp; proxy_temp_path temp; fastcgi_temp_path temp;',
    '  uwsgi_temp_path temp; scgi_temp_path temp;',
    '  include security.conf;',
    '  include site.conf;',
    '}',
  ].filter(Boolean).join('\n'));
}

/* --------------------------------------------------------------- servers -- */

const analyserHits = [];

function startStubs() {
  // Mimics the real analyser: it serves its own app, and 404s anything else.
  // Site assets that leak into /analyser must fail here, not in a browser.
  const analyser = createServer((req, res) => {
    analyserHits.push(req.url);
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('analyser stub: not found\n');
  }).listen(ANALYSER_PORT, '127.0.0.1');
  const persist = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  }).listen(PERSIST_PORT, '127.0.0.1');
  return () => { analyser.close(); persist.close(); };
}

function startNginx(dir) {
  const proc = spawn('nginx', ['-p', dir, '-c', 'nginx.conf'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString(); });
  proc.on('error', () => { stderr += 'nginx not found on PATH\n'; });
  return { proc, err: () => stderr };
}

async function waitForNginx(err) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/`, { redirect: 'manual' });
      if (r.status) return true;
    } catch { /* not up yet */ }
    await delay(250);
  }
  throw new Error(`nginx did not start.\n${err()}`);
}

/* ----------------------------------------------------------------- probes -- */

function deadline(promise, ms) {
  // Playwright's own timeouts do not cover a browser that stops answering the
  // devtools protocol mid-call, which leaves the await pending forever.
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms); }),
  ]);
}

async function hop(url) {
  // One request, no following: routing assertions care about each hop.
  const r = await fetch(BASE + url, { redirect: 'manual' });
  return { status: r.status, location: r.headers.get('location') };
}

async function chase(url, max = 5) {
  const chain = [url];
  let cur = url;
  for (let i = 0; i <= max; i++) {
    const r = await hop(cur);
    if (r.status !== 301 && r.status !== 302) return { status: r.status, final: cur, hops: i, chain };
    if (!r.location) return { status: r.status, final: cur, hops: i, chain };
    cur = new URL(r.location, BASE).pathname;
    chain.push(cur);
  }
  return { status: 508, final: cur, hops: max + 1, chain };
}

// Deliberately NOT one regex over the whole document. A pattern like
// /<link[^>]+rel=...[^>]+href=.../ has two unbounded quantifiers separated by
// literals, which backtracks quadratically on long non-matching input -- and
// it only matches when rel happens to precede href. Splitting into tags first
// keeps every quantifier linear and makes attribute order irrelevant.
function canonicalHref(html) {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/\brel\s*=\s*["']canonical["']/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i);
    if (href) return href[1];
  }
  return null;
}

function publicUrlOf(file) {
  const rel = path.relative(path.join(ROOT, 'site'), file).split(path.sep).join('/');
  return rel === 'index.html' ? '/' : `/${rel}`;
}

function sitePages() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['assets', 'css', 'js', 'video-src'].includes(e.name)) walk(p); }
      else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk(path.join(ROOT, 'site'));
  return out.sort();
}

/* ------------------------------------------------------------------ tests -- */

async function testSitemap() {
  const xml = fs.readFileSync(path.join(ROOT, 'site', 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const bad = [];
  for (const loc of locs) {
    if (!loc.startsWith(CANONICAL_HOST)) { bad.push(`${loc} (not ${CANONICAL_HOST})`); continue; }
    const p = loc.slice(CANONICAL_HOST.length) || '/';
    const r = await chase(p);
    // The analyser is a stub here, so its own URLs answer 404 -- what matters
    // is that nginx routed there directly instead of bouncing.
    const routed = r.status === 200 || (p.startsWith('/analyser') && r.status === 404);
    if (r.hops !== 0 || !routed) bad.push(`${p} -> ${r.hops} hop(s), ${r.status} (${r.chain.join(' -> ')})`);
  }
  if (bad.length) fail(`sitemap: ${locs.length} urls serve directly`, bad.join('\n     '));
  else ok(`sitemap: all ${locs.length} urls serve directly (200, no redirect)`);
}

async function testCanonicalDuplicates() {
  // Every page must answer on exactly one public URL. The /site/ prefix is an
  // internal detail of the image layout and must never be a second live copy.
  const bad = [];
  const check = async (from, want) => {
    const r = await chase(from);
    if (r.final !== want || r.hops !== 1 || r.status !== 200) {
      bad.push(`${from} -> ${r.chain.join(' -> ')} (${r.hops} hop(s), ${r.status}); want 1 hop to ${want}`);
    }
  };
  await check('/index.html', '/');
  await check('/site/', '/');
  await check('/site/index.html', '/');
  await check('/site/about.html', '/about.html');
  await check('/site/events.html', '/events.html');
  await check('/site/blog/index.html', '/blog/index.html');
  if (bad.length) fail('duplicate URLs collapse to one canonical', bad.join('\n     '));
  else ok('duplicate URLs collapse to one canonical in a single hop');
}

async function testNoStockNginxPage() {
  // The nginx base image ships its own index.html at the web root. This repo
  // has no root index.html, so `COPY . .` never overwrites it and /index.html
  // served "Welcome to nginx!" in production.
  const bad = [];
  for (const p of ['/', '/index.html']) {
    const r = await chase(p);
    const body = await (await fetch(BASE + r.final)).text();
    if (/Welcome to nginx/i.test(body)) bad.push(`${p} serves the nginx welcome page`);
  }
  if (bad.length) fail('no stock nginx page is reachable', bad.join('\n     '));
  else ok('no stock nginx page is reachable');
}

async function testCanonicalTags() {
  // A canonical tag is a promise about URL identity, so two things must hold.
  // It may legitimately name a DIFFERENT page (an alias like investors.html
  // pointing at investor.html), so "page lands on its own canonical" is only
  // required for the self-canonical case.
  const bad = [];
  let checked = 0;
  for (const file of sitePages()) {
    const url = publicUrlOf(file);
    const href = canonicalHref(fs.readFileSync(file, 'utf8'));
    if (!href) continue;
    checked++;
    // Absolute, on our host: a relative canonical resolves against whatever
    // URL the page was reached at, which is the opposite of the point.
    if (!href.startsWith(CANONICAL_HOST)) {
      bad.push(`${url}: canonical "${href}" is not an absolute ${CANONICAL_HOST} URL`);
      continue;
    }
    const want = href.slice(CANONICAL_HOST.length) || '/';
    // The named URL must be the one that serves, not one that redirects.
    const target = await chase(want);
    if (target.hops !== 0 || target.status !== 200) {
      bad.push(`${url}: canonical ${want} is not served directly (${target.chain.join(' -> ')}, ${target.status})`);
      continue;
    }
    // A page may name itself (the usual case) or another page (an alias like
    // investors.html -> investor.html). Both are legitimate; the check above
    // already proved the named URL is the one that actually serves.
  }
  if (bad.length) fail(`canonical tags are absolute and point at served URLs (${checked} pages)`, bad.join('\n     '));
  else ok(`canonical tags are absolute and point at served URLs (${checked} pages)`);
}

async function testPagesLoadCleanly(browser) {
  // The one that would have caught the events-photo outage: real browser,
  // public URL, every subresource must come back 200.
  const pages = ['/', '/events.html', '/about.html', '/product.html', '/awards.html',
                 '/press.html', '/blog/index.html', '/blog/a-computer-in-a-pen.html'];
  const bad = [];
  for (const url of pages) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });
    const failed = [];
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(BASE, '')}`);
    });
    // Every browser step is bounded. When routing is broken a page may never
    // reach `load`, and a wedged browser can leave evaluate() pending
    // forever -- either would turn a clear failure into an opaque CI timeout.
    // The response listener has already recorded the 4xx/5xx by then, so a
    // page that times out still reports what actually failed.
    let brokenErr = null;
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500).catch(() => {});
    // `complete && naturalWidth === 0` is a genuinely broken image. An <img>
    // with no src yet (the events lightbox) is not, so require a src.
    const broken = await deadline(
      page.evaluate(() => [...document.images]
        .filter((i) => i.getAttribute('src') && i.complete && i.naturalWidth === 0)
        .map((i) => i.getAttribute('src'))),
      15000,
    ).catch((e) => { brokenErr = e; return []; });
    if (failed.length) bad.push(`${url}: ${failed.length} failed request(s)\n       ${failed.slice(0, 8).join('\n       ')}`);
    if (broken.length) bad.push(`${url}: ${broken.length} broken image(s)\n       ${broken.slice(0, 8).join('\n       ')}`);
    if (brokenErr) bad.push(`${url}: could not read image state (${brokenErr.message})`);
    await deadline(page.close(), 10000).catch(() => {});
  }
  if (bad.length) fail('pages load with every subresource 200', bad.join('\n     '));
  else ok(`pages load with every subresource 200 (${pages.length} pages)`);
}

function testNoAssetLeakedToAnalyser() {
  // Belt and braces on the above: name the failure mode explicitly, so the
  // report says "your images went to the analyser" rather than just "404".
  const leaked = analyserHits.filter((u) => /^\/analyser\/assets\//.test(u));
  if (leaked.length) {
    fail('no site asset is routed into the analyser',
         `${leaked.length} request(s) reached the analyser upstream:\n     ` +
         [...new Set(leaked)].slice(0, 10).join('\n     '));
  } else {
    ok('no site asset is routed into the analyser');
  }
}

/* ------------------------------------------------------------------- main -- */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vahini-routes-'));
fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
fs.mkdirSync(path.join(dir, 'temp'), { recursive: true });

let stopStubs = () => {};
let nginx = null;
let browser = null;
let exitCode = 0;

try {
  if (spawnSync('nginx', ['-v']).error) {
    console.error('nginx is not on PATH. Install it first:\n  sudo apt-get install -y nginx-light');
    process.exit(1);
  }
  buildConfig(dir);
  stopStubs = startStubs();
  nginx = startNginx(dir);
  await waitForNginx(nginx.err);

  await testSitemap();
  await testCanonicalDuplicates();
  await testNoStockNginxPage();

  const { chromium } = await import('playwright');
  // VAHINI_CHROMIUM_PATH lets a machine with a system Chromium run this
  // without Playwright's own download (CI uses the downloaded one).
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.VAHINI_CHROMIUM_PATH || undefined,
  });
  await testCanonicalTags();
  await testPagesLoadCleanly(browser);
  testNoAssetLeakedToAnalyser();
} catch (err) {
  fail('harness', err && err.stack ? err.stack : String(err));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (nginx) {
    spawnSync('nginx', ['-p', dir, '-c', 'nginx.conf', '-s', 'quit']);
    nginx.proc.kill('SIGTERM');
  }
  stopStubs();
}

for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}`);
  if (r.detail) console.log(`     ${r.detail}`);
  if (!r.ok) exitCode = 1;
}
const passed = results.filter((r) => r.ok).length;
console.log(`\nSummary: ${passed}/${results.length} checks passing`);
if (exitCode !== 0) {
  const log = path.join(dir, 'logs', 'error.log');
  if (fs.existsSync(log)) {
    const tail = fs.readFileSync(log, 'utf8').trim().split('\n').slice(-15).join('\n');
    if (tail) console.log(`\nnginx error.log (tail):\n${tail}`);
  }
}
process.exit(exitCode);
