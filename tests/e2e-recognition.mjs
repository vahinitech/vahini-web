/* SPDX-License-Identifier: AGPL-3.0-only
 * (c) 2026 Vahini Technologies.
 *
 * e2e-recognition.mjs — verifies SERVER text recognition actually works.
 *
 * This test runs against a LIVE stack with the OCR backend up (the Docker
 * compose stack, or any base via VAHINI_BASE_URL) and asserts that a real
 * report renders and shows recognition results from the sample page.
 *
 *   VAHINI_BASE_URL=http://localhost:8080 node tests/e2e-recognition.mjs
 *
 * Requires the OCR server reachable at BASE (e.g. `docker compose up -d`).
 *
 * NOTE: analyser/ (vahinitech/20factor-analyser) moved to server-side-only
 * scoring in v0.3, dropping the old "AI OCR" / "Geometry only" report tag and
 * the ".ea-panel" recognised-text panel this test used to scrape. The
 * assertions below were updated from reading the new frontend/src/app/app.js
 * (renderVLInsights -> ".vl-insights", "reading confidence") but could not be
 * exercised against a live backend in this environment (no Docker daemon
 * available) -- re-verify against a real `docker compose up` run and adjust
 * selectors/text if the report DOM differs.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const BASE = (process.env.VAHINI_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'handwriting-sample.jpg');

const results = [];
const ok = (n, d = '') => results.push({ n, ok: true, d });
const fail = (n, d = '') => results.push({ n, ok: false, d });

async function main() {
  if (!fs.existsSync(FIXTURE)) fail('fixture present', FIXTURE);

  // Confirm the recognition backend is reachable before driving the UI.
  try {
    const h = await fetch(`${BASE}/ocr/health`).catch(() => fetch(`${BASE}/analyser/analyser.html`, { method: 'HEAD' }));
    if (h && (h.ok || h.status === 405)) ok('OCR backend reachable', `${BASE}`);
    else fail('OCR backend reachable', `status ${h && h.status}`);
  } catch (e) {
    fail('OCR backend reachable', String(e));
  }

  let browser = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(`${BASE}/analyser/analyser.html`, { waitUntil: 'load', timeout: 30000 });
    await page.setInputFiles('#file-input', FIXTURE);
    await page.waitForSelector('#go-process:not([disabled])', { timeout: 15000 });
    await page.click('#go-process');

    // First request can include model load; allow generous time.
    await page.waitForSelector('#screen-report.on', { timeout: 180000 });
    // Server-only pipeline (v0.3): a "not reachable" reason means the
    // recognition server errored instead of producing a report.
    const notReachable = await page.evaluate(() => document.body.innerText.includes('Recognition server not reachable'));
    if (!notReachable) ok('recognition server responded (report is not an error state)');
    else fail('recognition server responded (report is not an error state)', 'error text present');

    await page.waitForSelector('.vl-insights', { timeout: 30000 });
    const info = await page.evaluate(() => {
      const panel = document.querySelector('.vl-insights');
      const text = panel ? panel.innerText : '';
      return { text, confidencePresent: /reading confidence/i.test(text) };
    });

    if (info.confidencePresent) ok('recognition confidence reported', info.text.slice(0, 120));
    else fail('recognition confidence reported', `panel text: "${info.text.slice(0, 160)}"`);

    if (pageErrors.length === 0) ok('no page errors'); else fail('no page errors', pageErrors.join('|').slice(0, 160));

    await browser.close();
    browser = null;
  } catch (err) {
    fail('harness', String(err && err.message ? err.message : err));
  } finally {
    // A failure path that skips browser.close() leaves Playwright's child
    // processes holding the event loop open: the summary prints and node
    // then hangs until the CI runner's 6-hour kill (seen live on PR #52).
    if (browser) { try { await browser.close(); } catch (_e) { /* closing */ } }
  }

  let passed = 0;
  for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.n}${r.d ? ` :: ${r.d}` : ''}`); if (r.ok) passed += 1; }
  console.log(`\nSummary: ${passed}/${results.length} checks passing`);
  if (passed !== results.length || results.length === 0) process.exitCode = 1;
}

// process.exit, not just exitCode: exitCode only takes effect once the
// event loop drains, and a leaked handle (browser, fetch keep-alive)
// otherwise turns a 15-second failure into a 6-hour hung job.
main().then(() => process.exit(process.exitCode || 0),
  (e) => { console.error(e); process.exit(1); });
