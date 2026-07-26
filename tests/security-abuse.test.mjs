/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.

   Abuse-resistance tests for services/persist-api: spins the real server
   with tiny, test-friendly limits and proves that floods, oversized bodies,
   cross-site posts and quota exhaustion are refused -- and that responses
   never leak server filesystem paths.

   Run directly (node tests/security-abuse.test.mjs) or via `make security-test`. */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 8391;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "persist-abuse-"));

// A real PNG signature followed by filler bytes -- passes the server's
// magic-byte sniff while padding out to whatever size a test needs.
function fakePng(totalBytes) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, Buffer.alloc(Math.max(0, totalBytes - sig.length), 7)]);
}

function uploadRecords(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

const child = spawn(process.execPath, ["services/persist-api/server.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    PERSIST_UPLOADS_DIR: join(dataDir, "uploads"),
    PERSIST_REPORTS_DIR: join(dataDir, "reports"),
    PERSIST_FEEDBACK_DIR: join(dataDir, "feedback"),
    // Small limits so every ceiling is reachable in a fast test.
    RATE_WINDOW_MS: "60000",
    RATE_MAX_REQUESTS: "50",
    RATE_MAX_WRITES: "10",
    CAP_FEEDBACK_BYTES: "1024",
    CAP_REPORT_BYTES: "4096",
    CAP_UPLOAD_BYTES: "65536",
    QUOTA_BYTES_PER_DAY: "40000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", (d) => process.stderr.write(`[persist] ${d}`));

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ok       ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL     ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

// Each logical test uses its own X-Real-IP so rate buckets don't interfere;
// the server trusts the header because the test connects from 127.0.0.1.
function post(path, body, { ip = "203.0.113.1", origin, contentType = "application/json" } = {}) {
  const headers = { "Content-Type": contentType, "X-Real-IP": ip };
  if (origin) headers.Origin = origin;
  return fetch(`${BASE}${path}`, { method: "POST", headers, body });
}

async function waitForReady() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* still starting */
    }
    await delay(100);
  }
  throw new Error("persist-api never became ready");
}

try {
  await waitForReady();
  console.log("persist-api abuse tests:");

  // 1. Feedback accepted, response carries an id and no filesystem paths.
  {
    const res = await post("/persist/feedback", JSON.stringify({ message: "hello" }), { ip: "203.0.113.10" });
    const body = await res.json();
    check("feedback accepted", res.status === 200 && body.ok === true && typeof body.id === "string");
    const text = JSON.stringify(body);
    check("no filesystem paths leaked", !/(\/data\/|Path")/.test(text), text);
  }

  // 2. Oversized feedback body -> 413 (cap is 1KB in this test).
  {
    const res = await post("/persist/feedback", JSON.stringify({ message: "x".repeat(4096) }), { ip: "203.0.113.11" });
    check("oversized feedback rejected 413", res.status === 413, `got ${res.status}`);
  }

  // 3. Cross-site browser POST from an unknown origin -> 403.
  {
    const res = await post("/persist/feedback", JSON.stringify({ message: "csrf" }), {
      ip: "203.0.113.12",
      origin: "https://evil.example",
    });
    check("unknown origin rejected 403", res.status === 403, `got ${res.status}`);
    check("no ACAO for unknown origin", !res.headers.get("access-control-allow-origin"));
  }

  // 4. Allowed origin is reflected (not `*`).
  {
    const res = await post("/persist/feedback", JSON.stringify({ message: "ok" }), {
      ip: "203.0.113.13",
      origin: "https://vahinitech.com",
    });
    check("allowed origin accepted", res.status === 200, `got ${res.status}`);
    check(
      "ACAO reflects allowed origin",
      res.headers.get("access-control-allow-origin") === "https://vahinitech.com"
    );
  }

  // 5. Preflight from unknown origin -> 403, from allowed origin -> 204.
  {
    const bad = await fetch(`${BASE}/persist/feedback`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    const good = await fetch(`${BASE}/persist/feedback`, {
      method: "OPTIONS",
      headers: { Origin: "https://vahinitech.com" },
    });
    check("preflight unknown origin 403", bad.status === 403, `got ${bad.status}`);
    check("preflight allowed origin 204", good.status === 204, `got ${good.status}`);
  }

  // 6. Write flood -> 429 with Retry-After (write budget is 10/min here).
  {
    const ip = "203.0.113.14";
    let got429 = null;
    for (let i = 0; i < 12; i += 1) {
      const res = await post("/persist/feedback", JSON.stringify({ n: i }), { ip });
      if (res.status === 429) {
        got429 = res;
        break;
      }
    }
    check("write flood throttled 429", Boolean(got429));
    check("429 carries Retry-After", Boolean(got429 && got429.headers.get("retry-after")));
  }

  // 7. Daily byte quota: uploads beyond 40KB/day from one IP -> 429.
  {
    const ip = "203.0.113.15";
    const png = fakePng(30000).toString("base64");
    const payload = JSON.stringify({ dataUrl: `data:image/png;base64,${png}`, fileName: "a.png" });
    const first = await post("/persist/upload-image", payload, { ip });
    const second = await post("/persist/upload-image", payload, { ip });
    check("upload within quota accepted", first.status === 200, `got ${first.status}`);
    check("quota-exceeding upload rejected 429", second.status === 429, `got ${second.status}`);
  }

  // 8. Declared Content-Length above the cap is refused before upload.
  {
    const res = await fetch(`${BASE}/persist/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Real-IP": "203.0.113.16",
        "Content-Length": "999999",
      },
      body: "x".repeat(999999),
    }).catch(() => null);
    // Either an early 413 or a connection tear-down is acceptable; what must
    // not happen is a 200.
    check("huge declared body not accepted", !res || res.status === 413, res ? `got ${res.status}` : "");
  }

  // 9. Different X-Real-IPs get independent budgets (limits are per client).
  {
    const res = await post("/persist/feedback", JSON.stringify({ message: "fresh ip" }), { ip: "203.0.113.99" });
    check("fresh IP unaffected by other IPs' floods", res.status === 200, `got ${res.status}`);
  }

  // 10. An SVG (or any non-magic-byte content) relabeled as image/png is
  // rejected outright, and the rejection is recorded as a failed-upload record.
  {
    const ip = "203.0.113.20";
    const svg = Buffer.from('<svg onload="alert(1)"><script>alert(1)</script></svg>').toString("base64");
    const payload = JSON.stringify({ dataUrl: `data:image/png;base64,${svg}`, fileName: "evil.svg" });
    const res = await post("/persist/upload-image", payload, { ip });
    check("SVG masquerading as PNG rejected", res.status === 400, `got ${res.status}`);

    const records = uploadRecords(join(dataDir, "uploads"));
    const failure = records.find((r) => r.id.startsWith("upload-failed_") && r.fileName === "evil.svg");
    check("rejection recorded as a failed-upload record", Boolean(failure));
    check("failed record carries the actual reason", Boolean(failure && /unsupported or invalid image format/i.test(failure.reason)));
  }

  // 11. A genuine PNG upload's metadata carries human-readable size, the
  // client-forwarded consent state, and the request's Origin/Referer.
  {
    const ip = "203.0.113.21";
    const png = fakePng(2048).toString("base64");
    const payload = JSON.stringify({
      dataUrl: `data:image/png;base64,${png}`,
      fileName: "note.png",
      meta: { page: "/analyser/analyser.html", consent: { decision: "accept", analytics: true, ts: 1785000000000 } },
    });
    const res = await post("/persist/upload-image", payload, {
      ip,
      origin: "https://vahinitech.com",
    });
    check("well-formed PNG upload accepted", res.status === 200, `got ${res.status}`);

    const records = uploadRecords(join(dataDir, "uploads"));
    const meta = records.find((r) => r.fileName === "note.png" && !r.id.startsWith("upload-failed_"));
    check("metadata written", Boolean(meta));
    check("bytesHuman is human-readable", Boolean(meta && meta.bytesHuman === "2.0 KB"));
    check("consent forwarded from the client", Boolean(meta && meta.consent && meta.consent.decision === "accept" && meta.consent.analytics === true));
    check("origin captured", Boolean(meta && meta.origin === "https://vahinitech.com"));
  }

  // 12. Retention: a successful report save purges the image its upload.id
  // points at, but keeps the metadata record (with an imageDeleted marker)
  // rather than storing the uploaded image indefinitely.
  {
    const ip = "203.0.113.22";
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString("base64");
    const uploadRes = await post(
      "/persist/upload-image",
      JSON.stringify({ dataUrl: `data:image/png;base64,${png}`, fileName: "retain-me.png" }),
      { ip }
    );
    const uploadBody = await uploadRes.json();
    check("upload for retention test accepted", uploadRes.status === 200 && typeof uploadBody.id === "string");

    const uploadMetaPath = join(dataDir, "uploads", `${uploadBody.id}.json`);
    const imagePath = join(dataDir, "uploads", `${uploadBody.id}__${uploadBody.fileName}`);
    check("uploaded image present before report", existsSync(imagePath));

    const reportRes = await post(
      "/persist/generated-report",
      JSON.stringify({ trigger: "test", upload: uploadBody, reportHtml: "<p>ok</p>", reportText: "ok" }),
      { ip }
    );
    check("report save accepted", reportRes.status === 200, `got ${reportRes.status}`);

    check("uploaded image purged after successful report", !existsSync(imagePath));
    const metaPresent = existsSync(uploadMetaPath);
    check("upload metadata record kept", metaPresent);
    // Guarded, not chained off the check above: an unhandled readFileSync
    // throw here would escape to the top-level catch and abort the whole
    // suite (including test 13 below) instead of just failing this check.
    const meta = metaPresent ? JSON.parse(readFileSync(uploadMetaPath, "utf8")) : null;
    check("metadata marked imageDeleted", !!meta && meta.imageDeleted === true);
  }

  // 13. A bogus/foreign upload.id in a report payload is ignored, not used
  // to walk the uploads directory (path-traversal / cross-tenant guard).
  {
    const ip = "203.0.113.23";
    const res = await post(
      "/persist/generated-report",
      JSON.stringify({
        trigger: "test",
        upload: { id: "../../etc/passwd", fileName: "x" },
        reportHtml: "<p>ok</p>",
        reportText: "ok",
      }),
      { ip }
    );
    check("report with bogus upload.id still saved", res.status === 200, `got ${res.status}`);
  }
} catch (err) {
  failures += 1;
  console.error("  FAIL     unexpected error --", err);
} finally {
  child.kill("SIGTERM");
}

if (failures > 0) {
  console.error(`security-abuse: ${failures} failure(s)`);
  process.exit(1);
}
console.log("security-abuse: all checks passed");
