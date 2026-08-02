/* SPDX-License-Identifier: AGPL-3.0-only
 * (c) 2026 Vahini Technologies.
 *
 * e2e-pages.mjs — headless Chrome regression for the marketing site.
 *
 * Drives a real Chromium (Playwright) against a local static server and checks
 * that the marketing pages load (home, blog index, a blog post).
 *
 * Runs fully offline (no Python/paddle), so it is safe for CI on every commit.
 *
 * NOTE: this used to also drive a full offline analyser report (upload ->
 * Analyse -> 20-factor report -> PDF) using the in-browser scoring engine.
 * The analyser/ submodule (vahinitech/20factor-analyser) moved all scoring
 * server-side as of v0.3 -- there is no more in-browser engine to fall back
 * to, so that flow now requires a live recognition backend. That coverage
 * lives in tests/e2e-recognition.mjs, which runs against the real Docker
 * stack. If you need a lighter no-backend analyser check, assert against the
 * new DOM (see analyser/frontend/analyser.html) instead of the removed
 * window.VahiniEngine/VahiniReport globals.
 *
 *   node tests/e2e-pages.mjs
 */
import { spawn } from 'node:child_process';
import { assertPortFree, stopOnExit } from './lib/local-port.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
const ok = (name, detail = '') => results.push({ name, ok: true, detail });
const fail = (name, detail = '') => results.push({ name, ok: false, detail });

const bin = (name) => path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);

async function startServer() {
  // A server left over from an interrupted run would answer on this port with
  // ITS files, so the suite would silently grade an older tree. Refuse instead.
  await assertPortFree(PORT, 'the local static server');
  const server = spawn(bin('http-server'), ['.', '-p', String(PORT), '-c-1', '--silent'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Killing only in the finally below left the server orphaned on Ctrl-C,
  // holding the port for every later run.
  const stop = stopOnExit(server);
  let log = '';
  server.stdout.on('data', (c) => { log += c; });
  server.stderr.on('data', (c) => { log += c; });
  return { server, stop, getLog: () => log };
}

async function serverUp() {
  try { return (await fetch(`${BASE}/site/index.html`, { method: 'HEAD' })).ok; } catch { return false; }
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) { if (await serverUp()) return; await delay(200); }
  throw new Error('Timed out waiting for local static server');
}

async function checkPage(page, url, mustContain, label) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const resp = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  const status = resp ? resp.status() : 0;
  const title = await page.title();
  const bodyLen = await page.evaluate(() => (document.body.innerText || '').length);
  const hasText = mustContain ? await page.evaluate((t) => document.body.innerText.includes(t), mustContain) : true;
  if (status === 200 && bodyLen > 100 && hasText && errors.length === 0) {
    ok(label, `status ${status}, "${title.slice(0, 40)}"`);
  } else {
    fail(label, `status ${status}, bodyLen ${bodyLen}, hasText ${hasText}, errors: ${errors.join('|').slice(0, 160)}`);
  }
}

async function main() {
  // Reusing a server someone already has running is a convenience, but it is
  // also how a stale one from an older checkout ends up grading this run, so
  // say so out loud rather than reusing it silently.
  const alreadyUp = await serverUp();
  if (alreadyUp) {
    console.warn(
      `NOTE: reusing the server already listening on ${PORT}; this run tests ` +
      `whatever IT serves, not necessarily this working tree.\n` +
      `      To test this checkout instead: lsof -ti tcp:${PORT} | xargs kill`
    );
  }
  const local = alreadyUp ? null : await startServer();
  try {
    await waitForServer();
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();

    // ---- 1. marketing pages load ----
    {
      const page = await ctx.newPage();
      await checkPage(page, `${BASE}/site/index.html`, null, 'home page loads');
      await checkPage(page, `${BASE}/site/blog/index.html`, null, 'blog index loads');
      await checkPage(page, `${BASE}/site/blog/history-of-20-factors.html`, '20 handwriting factors', 'blog post loads');
      await page.close();
    }

    await browser.close();
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    fail('harness', msg);
    if (msg.includes('libatk') || msg.includes('shared libraries')) {
      console.error('Missing Chromium deps. Run: ./node_modules/.bin/playwright install --with-deps chromium');
    }
  } finally {
    if (local) local.stop();
  }

  let passed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` :: ${r.detail}` : ''}`);
    if (r.ok) passed += 1;
  }
  console.log(`\nSummary: ${passed}/${results.length} checks passing`);
  if (passed !== results.length || results.length === 0) process.exitCode = 1;
}

main();
