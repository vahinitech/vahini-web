/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved. */
"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { sanitizeText, validatePublicUrl } = require("./lib/textguard");

const PORT = Number(process.env.PORT || 8090);

const DIR_UPLOADS = process.env.PERSIST_UPLOADS_DIR || "/data/uploads";
const DIR_REPORTS = process.env.PERSIST_REPORTS_DIR || "/data/reports";
const DIR_FEEDBACK = process.env.PERSIST_FEEDBACK_DIR || "/data/feedback";

/* ---- Abuse limits ---------------------------------------------------------
   nginx in front of this service already rate-limits /persist/ per IP and
   caps body sizes (deploy/nginx.conf); everything below is the service's own
   defense in depth so it stays safe even if reached directly on the docker
   network or if the proxy config regresses. All knobs are env-tunable. */
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 150 * 1024 * 1024);
// Per-endpoint body caps: feedback is a small JSON note, a report is a page
// of JSON/HTML, only image uploads are legitimately large.
const CAP_FEEDBACK_BYTES = Number(process.env.CAP_FEEDBACK_BYTES || 256 * 1024);
const CAP_REPORT_BYTES = Number(process.env.CAP_REPORT_BYTES || 5 * 1024 * 1024);
const CAP_UPLOAD_BYTES = Math.min(Number(process.env.CAP_UPLOAD_BYTES || 40 * 1024 * 1024), MAX_BODY_BYTES);
// Per-IP request budgets (sliding window) and a daily disk-write quota so a
// single client cannot fill the volume however patient it is.
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 10 * 60 * 1000);
const RATE_MAX_REQUESTS = Number(process.env.RATE_MAX_REQUESTS || 120);
const RATE_MAX_WRITES = Number(process.env.RATE_MAX_WRITES || 40);
const QUOTA_BYTES_PER_DAY = Number(process.env.QUOTA_BYTES_PER_DAY || 200 * 1024 * 1024);

// Browsers that may call these endpoints cross-origin. Same-origin pages
// (vahinitech.com -> /persist/*) match automatically since browsers send the
// Origin header on every POST. Non-browser clients (no Origin) pass through.
const ALLOWED_ORIGINS = String(
  process.env.PERSIST_ALLOWED_ORIGINS ||
    "https://vahinitech.com,https://www.vahinitech.com,https://stage.vahinitech.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Local development: any localhost port, http or https.
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

// The true client IP: nginx sets X-Real-IP, and this service is only ever
// reached through it (docker network). Trust the header only when the direct
// peer is private, so a hypothetical direct-exposed deployment cannot be fed
// spoofed identities to dodge the per-IP limits.
function getClientIp(req) {
  const peer = req.socket.remoteAddress || "";
  const real = String(req.headers["x-real-ip"] || "").trim();
  if (real && isPrivateAddress(peer)) return real;
  return peer || "unknown";
}

/* Sliding-window counters per client IP. Bounded memory: entries are pruned
   whenever touched and swept periodically. */
const rateBuckets = new Map(); // ip -> { hits: number[], writes: number[] }
const dayQuota = new Map(); // ip -> { day: "YYYY-MM-DD", bytes: number }

function takeRate(ip, isWrite) {
  const now = Date.now();
  let b = rateBuckets.get(ip);
  if (!b) {
    b = { hits: [], writes: [] };
    rateBuckets.set(ip, b);
  }
  const cutoff = now - RATE_WINDOW_MS;
  b.hits = b.hits.filter((t) => t > cutoff);
  b.writes = b.writes.filter((t) => t > cutoff);
  if (b.hits.length >= RATE_MAX_REQUESTS) return false;
  if (isWrite && b.writes.length >= RATE_MAX_WRITES) return false;
  b.hits.push(now);
  if (isWrite) b.writes.push(now);
  return true;
}

function takeQuota(ip, bytes) {
  const day = new Date().toISOString().slice(0, 10);
  let q = dayQuota.get(ip);
  if (!q || q.day !== day) {
    q = { day, bytes: 0 };
    dayQuota.set(ip, q);
  }
  if (q.bytes + bytes > QUOTA_BYTES_PER_DAY) return false;
  q.bytes += bytes;
  return true;
}

// Sweep stale limiter state so the maps cannot grow without bound.
const sweeper = setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, b] of rateBuckets) {
    b.hits = b.hits.filter((t) => t > cutoff);
    b.writes = b.writes.filter((t) => t > cutoff);
    if (!b.hits.length && !b.writes.length) rateBuckets.delete(ip);
  }
  const day = new Date().toISOString().slice(0, 10);
  for (const [ip, q] of dayQuota) {
    if (q.day !== day) dayQuota.delete(ip);
  }
}, 60 * 1000);
sweeper.unref();

async function ensureDirs() {
  await fsp.mkdir(DIR_UPLOADS, { recursive: true });
  await fsp.mkdir(DIR_REPORTS, { recursive: true });
  await fsp.mkdir(DIR_FEEDBACK, { recursive: true });
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function id(prefix) {
  return `${prefix}_${nowStamp()}_${crypto.randomBytes(5).toString("hex")}`;
}

function send(res, status, payload, extraHeaders) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(extraHeaders || {}),
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req, maxBytes) {
  const cap = Math.min(Number(maxBytes) || MAX_BODY_BYTES, MAX_BODY_BYTES);
  return new Promise((resolve, reject) => {
    // Reject oversized bodies as early as possible: Content-Length first,
    // then a running count that aborts the stream instead of politely
    // reading (and paying bandwidth for) the rest of a 150MB flood.
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > cap) {
      const err = new Error("Body too large");
      err.statusCode = 413;
      reject(err);
      return;
    }
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > cap) {
        const err = new Error("Body too large");
        err.statusCode = 413;
        err.abortStream = true;
        req.removeAllListeners("data");
        req.removeAllListeners("end");
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const ct = String(req.headers["content-type"] || "").toLowerCase();
      if (!raw.length) {
        resolve({ raw, json: {} });
        return;
      }
      if (ct.includes("application/json")) {
        try {
          resolve({ raw, json: JSON.parse(raw.toString("utf8")) });
        } catch {
          reject(new Error("Invalid JSON"));
        }
        return;
      }
      if (ct.includes("text/plain")) {
        const text = raw.toString("utf8").trim();
        if (!text) {
          resolve({ raw, json: {} });
          return;
        }
        try {
          resolve({ raw, json: JSON.parse(text) });
        } catch {
          resolve({ raw, json: { message: text } });
        }
        return;
      }
      resolve({ raw, json: {} });
    });
    req.on("error", reject);
  });
}

function normalizeName(name, fallbackExt) {
  const base = String(name || "upload").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  if (base.includes(".")) return base;
  return `${base || "upload"}.${fallbackExt}`;
}

function extFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  return "bin";
}

function parseDataUrl(dataUrl) {
  const s = String(dataUrl || "");
  const m = s.match(/^data:([^;,]+)?;base64,(.+)$/i);
  if (!m) return null;
  const mimeType = m[1] || "application/octet-stream";
  const base64 = m[2];
  return { mimeType, buffer: Buffer.from(base64, "base64") };
}

async function appendNdjson(filePath, record) {
  await fsp.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

async function handleUploadImage(req, res, clientIp) {
  const { json } = await parseBody(req, CAP_UPLOAD_BYTES);
  const parsed = parseDataUrl(json.dataUrl || "");
  if (!parsed || !parsed.buffer || !parsed.buffer.length) {
    send(res, 400, { ok: false, error: "Missing valid dataUrl" });
    return;
  }
  if (!takeQuota(clientIp, parsed.buffer.length)) {
    send(res, 429, { ok: false, error: "Daily upload quota exceeded" }, { "Retry-After": "86400" });
    return;
  }

  const uploadId = id("upload");
  const ext = extFromMime(json.mimeType || parsed.mimeType);
  const fileName = normalizeName(json.fileName, ext);
  const imageName = `${uploadId}__${fileName}`;
  const imagePath = path.join(DIR_UPLOADS, imageName);
  const metaPath = path.join(DIR_UPLOADS, `${uploadId}.json`);

  await fsp.writeFile(imagePath, parsed.buffer);
  const meta = {
    id: uploadId,
    ts: new Date().toISOString(),
    source: json.source || "upload",
    fileName,
    mimeType: json.mimeType || parsed.mimeType,
    bytes: parsed.buffer.length,
    meta: json.meta || {},
    ip: clientIp,
    userAgent: req.headers["user-agent"] || "",
  };
  await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

  // Only the id goes back to the client -- server filesystem layout is not
  // part of the API contract and should never be disclosed.
  send(res, 200, { ok: true, id: uploadId, fileName, bytes: parsed.buffer.length });
}

async function handleGeneratedReport(req, res, clientIp) {
  const { json, raw } = await parseBody(req, CAP_REPORT_BYTES);
  if (!takeQuota(clientIp, raw.length)) {
    send(res, 429, { ok: false, error: "Daily quota exceeded" }, { "Retry-After": "86400" });
    return;
  }
  const reportId = id("report");
  const jsonPath = path.join(DIR_REPORTS, `${reportId}.json`);
  const htmlPath = path.join(DIR_REPORTS, `${reportId}.html`);

  const reportHtml = typeof json.reportHtml === "string" ? json.reportHtml : "";

  // reportText is assembled from OCR of a user image: clean homoglyphs,
  // diacritic stacking, invisible characters and flag prompt-injection
  // markers before it lands on disk or is fed to anything downstream
  // (docs/SECURITY.md, "OCR attack surface").
  const cleanReport = sanitizeText(json.reportText || "");
  // The url field is stored, never fetched; validate it anyway so a stored
  // value can never be turned into an SSRF target later.
  const urlCheck = validatePublicUrl(json.url || "");

  const body = {
    id: reportId,
    ts: new Date().toISOString(),
    trigger: json.trigger || "unknown",
    url: urlCheck.ok ? urlCheck.url : "",
    urlRejected: urlCheck.ok ? undefined : (json.url ? urlCheck.reason : undefined),
    lead: json.lead || null,
    upload: json.upload || null,
    reportText: cleanReport.text,
    textFlags: cleanReport.flags,
    userAgent: req.headers["user-agent"] || "",
    ip: clientIp,
    extra: json.extra || null,
  };

  await fsp.writeFile(jsonPath, JSON.stringify(body, null, 2), "utf8");
  if (reportHtml.trim()) {
    await fsp.writeFile(htmlPath, reportHtml, "utf8");
  }

  send(res, 200, { ok: true, id: reportId });
}

async function handleFeedback(req, res, clientIp) {
  const { json, raw } = await parseBody(req, CAP_FEEDBACK_BYTES);
  if (!takeQuota(clientIp, raw.length)) {
    send(res, 429, { ok: false, error: "Daily quota exceeded" }, { "Retry-After": "86400" });
    return;
  }
  const feedbackId = id("feedback");
  const day = new Date().toISOString().slice(0, 10);
  const filePath = path.join(DIR_FEEDBACK, `${feedbackId}.json`);
  const streamPath = path.join(DIR_FEEDBACK, `feedback-${day}.ndjson`);

  const rec = {
    id: feedbackId,
    ts: new Date().toISOString(),
    payload: json,
    raw: raw.length && !Object.keys(json || {}).length ? raw.toString("utf8") : "",
    headers: {
      contentType: req.headers["content-type"] || "",
      userAgent: req.headers["user-agent"] || "",
      referer: req.headers.referer || "",
    },
    ip: clientIp,
  };

  await fsp.writeFile(filePath, JSON.stringify(rec, null, 2), "utf8");
  await appendNdjson(streamPath, rec);

  send(res, 200, { ok: true, id: feedbackId });
}

// Returns true when the request was fully answered here. Cross-origin
// browser calls from origins we don't recognize are refused outright --
// otherwise any website could make its visitors write to our disk.
function handleCorsAndOrigin(req, res) {
  const origin = String(req.headers.origin || "");
  const allowed = origin && isAllowedOrigin(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(allowed ? 204 : 403);
    res.end();
    return true;
  }
  if (origin && !allowed && req.method !== "GET") {
    send(res, 403, { ok: false, error: "Origin not allowed" });
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  const clientIp = getClientIp(req);
  try {
    if (handleCorsAndOrigin(req, res)) return;
    const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && u.pathname === "/health") {
      send(res, 200, { ok: true, service: "persist-api" });
      return;
    }

    const isWrite = req.method === "POST";
    if (!takeRate(clientIp, isWrite)) {
      send(res, 429, { ok: false, error: "Too many requests" }, { "Retry-After": String(Math.ceil(RATE_WINDOW_MS / 1000)) });
      return;
    }

    if (req.method === "POST" && u.pathname === "/persist/upload-image") {
      await handleUploadImage(req, res, clientIp);
      return;
    }
    if (req.method === "POST" && u.pathname === "/persist/generated-report") {
      await handleGeneratedReport(req, res, clientIp);
      return;
    }
    if (req.method === "POST" && u.pathname === "/persist/feedback") {
      await handleFeedback(req, res, clientIp);
      return;
    }

    send(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    const code = Number(err && err.statusCode) || 500;
    // Internal errors stay internal; the client learns the status, not the stack.
    const message = code >= 500 ? "Internal error" : String(err && err.message ? err.message : err);
    if (code >= 500) console.error("persist-api error:", err);
    if (!res.headersSent) send(res, code, { ok: false, error: message });
    // An oversized stream is torn down, not drained: finish the response,
    // then drop the connection so the client stops sending.
    if (err && err.abortStream) res.destroy();
  }
});

// Slow-client protection: headers must arrive promptly; a whole request
// (including a large upload on a slow line) gets a bounded lifetime.
server.headersTimeout = 15 * 1000;
server.requestTimeout = 120 * 1000;

/* ---- Disk sweeper (lib/sweeper.js) --------------------------------------
   The persist volume only ever grows (uploads + reports + feedback, no
   deletes). Nightly, files older than SWEEP_COMPRESS_DAYS are gzipped in
   place (JSON/HTML shrink 80-90%; incompressible JPEGs are skipped and
   remembered). Deletion is opt-in only: SWEEP_EVICT_DAYS drops files older
   than the horizon, SWEEP_CAP_MB sweeps oldest-first back under the cap.
   SWEEP_ENABLE=0 turns the whole thing off. */
function sweepEnvNumber(name, def) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : def;
}
const SWEEP_ENABLE = process.env.SWEEP_ENABLE !== "0";
const SWEEP_COMPRESS_DAYS = sweepEnvNumber("SWEEP_COMPRESS_DAYS", 14);
const SWEEP_EVICT_DAYS = sweepEnvNumber("SWEEP_EVICT_DAYS", 0);
const SWEEP_CAP_MB = sweepEnvNumber("SWEEP_CAP_MB", 0);
const SWEEP_INTERVAL_H = sweepEnvNumber("SWEEP_INTERVAL_H", 24);
const { sweep } = require("./lib/sweeper");

let sweeping = false;
async function runSweep() {
  if (sweeping) return; // a prior sweep is still running (slow I/O or a short interval)
  sweeping = true;
  try {
    const stats = await sweep({
      dirs: [DIR_UPLOADS, DIR_REPORTS, DIR_FEEDBACK],
      compressDays: SWEEP_COMPRESS_DAYS,
      evictDays: SWEEP_EVICT_DAYS,
      capMB: SWEEP_CAP_MB,
    });
    const errorNote = stats.errorsTruncated ? `${stats.errors.length}+${stats.errorsTruncated} truncated` : stats.errors.length;
    console.log(
      `sweeper: compressed=${stats.compressed} evicted=${stats.evicted} ` +
        `saved=${(stats.savedBytes / 1024 / 1024).toFixed(1)}MB errors=${errorNote}`,
    );
    for (const e of stats.errors.slice(0, 5)) console.warn(`sweeper: ${e}`);
  } catch (err) {
    console.error("sweeper failed", err);
  } finally {
    sweeping = false;
  }
}

ensureDirs()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`persist-api listening on :${PORT}`);
      console.log(`uploads=${DIR_UPLOADS}`);
      console.log(`reports=${DIR_REPORTS}`);
      console.log(`feedback=${DIR_FEEDBACK}`);
      if (SWEEP_ENABLE) {
        runSweep(); // once at boot, then daily
        const t = setInterval(runSweep, SWEEP_INTERVAL_H * 60 * 60 * 1000);
        t.unref();
      }
    });
  })
  .catch((err) => {
    console.error("Failed to initialize persist-api", err);
    process.exit(1);
  });
