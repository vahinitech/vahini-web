/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved. */
"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 8090);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 150 * 1024 * 1024);

const DIR_UPLOADS = process.env.PERSIST_UPLOADS_DIR || "/data/uploads";
const DIR_REPORTS = process.env.PERSIST_REPORTS_DIR || "/data/reports";
const DIR_FEEDBACK = process.env.PERSIST_FEEDBACK_DIR || "/data/feedback";

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

function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", (chunk) => {
      if (tooLarge) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        const err = new Error("Body too large");
        err.statusCode = 413;
        reject(err);
        return;
      }
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

async function handleUploadImage(req, res) {
  const { json } = await parseBody(req);
  const parsed = parseDataUrl(json.dataUrl || "");
  if (!parsed || !parsed.buffer || !parsed.buffer.length) {
    send(res, 400, { ok: false, error: "Missing valid dataUrl" });
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
    ip: req.socket.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  };
  await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

  send(res, 200, {
    ok: true,
    id: uploadId,
    imagePath,
    metaPath,
  });
}

async function handleGeneratedReport(req, res) {
  const { json } = await parseBody(req);
  const reportId = id("report");
  const jsonPath = path.join(DIR_REPORTS, `${reportId}.json`);
  const htmlPath = path.join(DIR_REPORTS, `${reportId}.html`);

  const reportHtml = typeof json.reportHtml === "string" ? json.reportHtml : "";
  const body = {
    id: reportId,
    ts: new Date().toISOString(),
    trigger: json.trigger || "unknown",
    url: json.url || "",
    lead: json.lead || null,
    upload: json.upload || null,
    reportText: json.reportText || "",
    userAgent: req.headers["user-agent"] || "",
    ip: req.socket.remoteAddress || "",
    extra: json.extra || null,
  };

  await fsp.writeFile(jsonPath, JSON.stringify(body, null, 2), "utf8");
  if (reportHtml.trim()) {
    await fsp.writeFile(htmlPath, reportHtml, "utf8");
  }

  send(res, 200, {
    ok: true,
    id: reportId,
    jsonPath,
    htmlPath: reportHtml.trim() ? htmlPath : "",
  });
}

async function handleFeedback(req, res) {
  const { json, raw } = await parseBody(req);
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
    ip: req.socket.remoteAddress || "",
  };

  await fsp.writeFile(filePath, JSON.stringify(rec, null, 2), "utf8");
  await appendNdjson(streamPath, rec);

  send(res, 200, { ok: true, id: feedbackId, filePath, streamPath });
}

function withCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    if (withCors(req, res)) return;
    const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && u.pathname === "/health") {
      send(res, 200, { ok: true, service: "persist-api" });
      return;
    }
    if (req.method === "POST" && u.pathname === "/persist/upload-image") {
      await handleUploadImage(req, res);
      return;
    }
    if (req.method === "POST" && u.pathname === "/persist/generated-report") {
      await handleGeneratedReport(req, res);
      return;
    }
    if (req.method === "POST" && u.pathname === "/persist/feedback") {
      await handleFeedback(req, res);
      return;
    }

    send(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    const code = Number(err && err.statusCode) || 500;
    send(res, code, { ok: false, error: String(err && err.message ? err.message : err) });
  }
});

ensureDirs()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`persist-api listening on :${PORT}`);
      console.log(`uploads=${DIR_UPLOADS}`);
      console.log(`reports=${DIR_REPORTS}`);
      console.log(`feedback=${DIR_FEEDBACK}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize persist-api", err);
    process.exit(1);
  });
