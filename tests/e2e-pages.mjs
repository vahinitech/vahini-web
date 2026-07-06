/* SPDX-License-Identifier: AGPL-3.0-only
 * (c) 2026 Vahini Technologies.
 *
 * e2e-pages.mjs — headless Chrome regression for the whole site.
 *
 * Drives a real Chromium (Playwright) against a local static server and checks:
 *   1. The marketing pages load (home, blog index, a blog post).
 *   2. The analyser app loads with the engine wired and no page errors.
 *   3. The full report flow works OFFLINE: upload a handwriting image, click
 *      Analyse, and a 20-factor report renders (no OCR backend needed — the
 *      in-browser engine falls back cleanly).
 *   4. The report contains exactly 20 DISTINCT factors with varied scores.
 *   5. "Save as PDF" works (Chromium page.pdf produces a non-trivial PDF).
 *
 * Runs fully offline (no Python/paddle), so it is safe for CI on every commit.
 *
 *   node tests/e2e-pages.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'handwriting-sample.jpg');

const results = [];
const ok = (name, detail = '') => results.push({ name, ok: true, detail });
const fail = (name, detail = '') => results.push({ name, ok: false, detail });

const bin = (name) => path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);

function startServer() {
  const server = spawn(bin('http-server'), ['.', '-p', String(PORT), '-c-1', '--silent'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (c) => { log += c; });
  server.stderr.on('data', (c) => { log += c; });
  return { server, getLog: () => log };
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
  if (!fs.existsSync(FIXTURE)) { fail('fixture', `missing ${FIXTURE}`); }

  const alreadyUp = await serverUp();
  const local = alreadyUp ? null : startServer();
  try {
    await waitForServer();
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();

    // ---- 1. marketing pages load ----
    {
      const page = await ctx.newPage();
      await checkPage(page, `${BASE}/site/index.html`, null, 'home page loads');
      await checkPage(page, `${BASE}/site/blog.html`, null, 'blog index loads');
      await checkPage(page, `${BASE}/site/blog-history-of-20-factors.html`, '20 handwriting factors', 'blog post loads');
      await page.close();
    }

    // ---- 2-5. analyser: load, upload, report, factors, PDF ----
    {
      const page = await ctx.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      // Force the deterministic OFFLINE path: abort any OCR-server calls so the
      // in-browser engine is used immediately (CI has no Python backend). This
      // also keeps the test fast and independent of any local port state.
      await page.route('**/*', (route) => {
        const u = route.request().url();
        if (/\/(ocr|report-python|analyze-vl)(\?|$)/.test(u) || u.includes(':8868')) return route.abort();
        return route.continue();
      });
      await page.goto(`${BASE}/analyser/Vahini%20Analyser.html`, { waitUntil: 'load', timeout: 30000 });

      const wired = await page.evaluate(() => typeof window.VahiniEngine === 'object' && typeof window.VahiniReport === 'object');
      if (wired && pageErrors.length === 0) ok('analyser app loads + engine wired');
      else fail('analyser app loads + engine wired', `wired ${wired}, errors ${pageErrors.join('|').slice(0, 160)}`);

      // upload the fixture and run the pipeline (offline → local engine fallback)
      await page.setInputFiles('#file-input', FIXTURE);
      await page.waitForSelector('#go-process:not([disabled])', { timeout: 15000 });
      ok('upload accepted (Analyse enabled)');

      await page.click('#go-process');
      await page.waitForSelector('#screen-report.on', { timeout: 90000 });
      // factor cards render across the section pages
      await page.waitForSelector('.factor', { timeout: 30000 });
      ok('report generated');

      // ---- 20 distinct factors with varied scores ----
      const factorInfo = await page.evaluate(() => {
        const names = [...document.querySelectorAll('.factor .f-name')].map((n) => n.childNodes[0].textContent.trim());
        const chips = [...document.querySelectorAll('.fscore-grid .fscore')];
        const chipScores = chips.map((c) => (c.querySelector('i') || {}).textContent || '');
        return { factorCount: names.length, uniqueNames: new Set(names).size, chipCount: chips.length, distinctScores: new Set(chipScores).size, names };
      });
      if (factorInfo.factorCount === 20 && factorInfo.uniqueNames === 20) ok('report contains 20 distinct factors', `${factorInfo.uniqueNames} unique names`);
      else fail('report contains 20 distinct factors', JSON.stringify(factorInfo));

      if (factorInfo.chipCount === 20) ok('at-a-glance map shows all 20', `chips ${factorInfo.chipCount}`);
      else fail('at-a-glance map shows all 20', `chips ${factorInfo.chipCount}`);

      if (factorInfo.distinctScores >= 2) ok('factor scores are varied (not all identical)', `${factorInfo.distinctScores} distinct scores`);
      else fail('factor scores are varied (not all identical)', `${factorInfo.distinctScores} distinct scores`);

      // recognition trust note present (our reliability work)
      const hasNote = await page.evaluate(() => document.body.innerText.toLowerCase().includes('text recognition'));
      if (hasNote) ok('recognition note present'); else fail('recognition note present', 'note text not found');

      // ---- PDF save (Chromium print to PDF) ----
      const pdfPath = path.join(os.tmpdir(), `vahini-report-${Date.now()}.pdf`);
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
      const size = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0;
      if (size > 20000) ok('PDF save works', `${Math.round(size / 1024)} KB`);
      else fail('PDF save works', `pdf size ${size} bytes`);
      try { fs.unlinkSync(pdfPath); } catch {}

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
    if (local) local.server.kill('SIGTERM');
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
