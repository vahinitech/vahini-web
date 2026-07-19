/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.

   Bullet-journal PDF print service. Wraps the bujo.js layout engine
   (github.com/vahinitech/bujo.js) behind a tiny HTTP API so the site can
   offer print-ready journal downloads:

     GET /health                  -> {"ok":true}
     GET /bujo/generate?title=&paper=A4&scheme=color -> application/pdf

   nginx in front of this service already rate-limits /bujo/ per IP
   (deploy/nginx.conf, perip_heavy zone); the checks below are the
   service's own defense in depth for direct docker-network access. */

import http from "node:http";
import { BulletJournal, PAPER_SIZES } from "bujo.js";

const PORT = Number(process.env.PORT || 8091);

const MAX_TITLE_LENGTH = 60;
const SCHEMES = new Set(["color", "monochrome"]);

// Per-IP generation budget (sliding window) — PDF generation is CPU work.
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 10 * 60 * 1000);
const RATE_MAX_REQUESTS = Number(process.env.RATE_MAX_REQUESTS || 30);
const rateBuckets = new Map();

// Browsers that may call this endpoint cross-origin; same-origin requests
// (vahinitech.com -> /bujo/*) match automatically. Non-browser clients
// (no Origin header) pass through.
const ALLOWED_ORIGINS = String(
  process.env.BUJO_ALLOWED_ORIGINS ||
    "https://vahinitech.com,https://www.vahinitech.com,https://stage.vahinitech.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function isPrivateAddress(addr) {
  const a = String(addr || "").replace(/^::ffff:/, "");
  return (
    a === "::1" ||
    a.startsWith("127.") ||
    a.startsWith("10.") ||
    a.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(a)
  );
}

function clientIp(req) {
  // Trust X-Real-IP only when the direct peer is nginx on the private
  // docker network; otherwise a direct caller could spoof the header to
  // dodge the per-IP budget and bloat the rate-bucket map.
  const peer = req.socket.remoteAddress || "unknown";
  const fwd = String(req.headers["x-real-ip"] || "").trim();
  return fwd && isPrivateAddress(peer) ? fwd : peer;
}

function overRateLimit(ip) {
  const now = Date.now();
  const hits = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX_REQUESTS) {
    rateBuckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(ip, hits);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of rateBuckets) {
    const fresh = hits.filter((t) => now - t < RATE_WINDOW_MS);
    if (fresh.length === 0) rateBuckets.delete(ip);
    else rateBuckets.set(ip, fresh);
  }
}, RATE_WINDOW_MS).unref();

function sanitizeTitle(raw) {
  const cleaned = String(raw || "")
    // Control characters and characters that break Content-Disposition.
    .replace(/[\u0000-\u001F"\\]/g, "")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
  return cleaned || "My Bullet Journal";
}

function json(res, code, body, extra = {}) {
  res.writeHead(code, { "Content-Type": "application/json", ...extra });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  // Fixed base: req.url is server-relative, and a hostile Host header must
  // not be able to make URL parsing throw and take the process down.
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return json(res, 400, { ok: false, error: "malformed request url" });
  }

  // CORS. Same-origin browsers send an Origin on cross-site POSTs only,
  // but a strict check costs nothing.
  const origin = req.headers.origin;
  const cors = {};
  if (origin) {
    if (!isAllowedOrigin(origin)) return json(res, 403, { ok: false, error: "origin not allowed" });
    cors["Access-Control-Allow-Origin"] = origin;
    cors["Vary"] = "Origin";
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "GET, OPTIONS" });
    return res.end();
  }

  if (url.pathname === "/health" || url.pathname === "/bujo/health") {
    return json(res, 200, { ok: true, service: "bujo-pdf" }, cors);
  }

  if (url.pathname === "/bujo/generate") {
    if (req.method !== "GET") {
      return json(res, 405, { ok: false, error: "method not allowed" }, { ...cors, Allow: "GET, OPTIONS" });
    }
    if (overRateLimit(clientIp(req))) {
      return json(res, 429, { ok: false, error: "rate limit exceeded, try again later" }, cors);
    }

    const paper = String(url.searchParams.get("paper") || "A4").toUpperCase();
    if (!PAPER_SIZES[paper]) {
      return json(res, 400, { ok: false, error: `unsupported paper size, use one of: ${Object.keys(PAPER_SIZES).join(", ")}` }, cors);
    }
    const scheme = String(url.searchParams.get("scheme") || "color").toLowerCase();
    if (!SCHEMES.has(scheme)) {
      return json(res, 400, { ok: false, error: "unsupported scheme, use color or monochrome" }, cors);
    }
    const title = sanitizeTitle(url.searchParams.get("title"));

    try {
      const journal = new BulletJournal(title, scheme);
      const doc = journal.generate(paper);
      const pdf = Buffer.from(doc.output("arraybuffer"));
      const filename = `${title.replace(/\s+/g, "_").toLowerCase()}_${paper.toLowerCase()}.pdf`;
      res.writeHead(200, {
        ...cors,
        "Content-Type": "application/pdf",
        "Content-Length": pdf.length,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      });
      return res.end(pdf);
    } catch (err) {
      console.error("bujo-pdf: generation failed:", err);
      return json(res, 500, { ok: false, error: "pdf generation failed" }, cors);
    }
  }

  return json(res, 404, { ok: false, error: "not found" }, cors);
});

server.listen(PORT, () => {
  console.log(`bujo-pdf listening on :${PORT}`);
});
