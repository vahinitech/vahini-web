/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.
   Unit tests for services/persist-api/lib/sweeper.js — age-driven gzip,
   incompressible skip-list, opt-in eviction and size cap. Pure Node, no
   server needed: everything runs against a temp directory tree. */
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, statSync, existsSync, readFileSync as readRaw } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sweep } = require("../services/persist-api/lib/sweeper.js");

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok   ${name}`);
  else { failures += 1; console.error(`  FAIL ${name}`); }
}
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
function ageFile(p, days) {
  const t = new Date(now - days * DAY);
  utimesSync(p, t, t);
}

const root = mkdtempSync(join(tmpdir(), "sweep-"));
const uploads = join(root, "uploads");
const reports = join(root, "reports");
for (const d of [uploads, reports]) mkdirSync(d, { recursive: true });

// old compressible JSON (30d), old incompressible blob (30d), fresh file (1d)
const oldJson = join(reports, "r1.json");
writeFileSync(oldJson, JSON.stringify({ pad: "x".repeat(50_000) }, null, 2));
ageFile(oldJson, 30);
const oldBlob = join(uploads, "img.jpg");
const rand = Buffer.alloc(60_000);
for (let i = 0; i < rand.length; i++) rand[i] = Math.floor(Math.random() * 256);
writeFileSync(oldBlob, rand);
ageFile(oldBlob, 30);
// an already-encrypted/opaque blob with no extension in INCOMPRESSIBLE_EXT --
// exercises the dynamic (gzip-and-measure) skip-list path, not the static
// extension fast-path that .jpg above short-circuits.
const oldOpaque = join(uploads, "session.enc");
const randOpaque = Buffer.alloc(60_000);
for (let i = 0; i < randOpaque.length; i++) randOpaque[i] = Math.floor(Math.random() * 256);
writeFileSync(oldOpaque, randOpaque);
ageFile(oldOpaque, 30);
const fresh = join(reports, "r2.json");
writeFileSync(fresh, JSON.stringify({ pad: "y".repeat(50_000) }));
ageFile(fresh, 1);

console.log("sweeper: compress pass");
let stats = await sweep({ dirs: [uploads, reports], compressDays: 14, now });
check("old JSON compressed away", !existsSync(oldJson) && existsSync(oldJson + ".gz"));
check("gzip round-trips to original content", (() => {
  const gz = readRaw(oldJson + ".gz");
  return gunzipSync(gz).toString().includes('"pad"');
})());
check("gz keeps the original mtime (age preserved)", now - statSync(oldJson + ".gz").mtimeMs > 29 * DAY);
check("incompressible blob left alone", existsSync(oldBlob) && !existsSync(oldBlob + ".gz"));
check("opaque blob left alone too", existsSync(oldOpaque) && !existsSync(oldOpaque + ".gz"));
check("fresh file untouched", existsSync(fresh));
check("stats counted one compression", stats.compressed === 1 && stats.savedBytes > 0);
check("skip-list written with the opaque blob's relative path", (() => {
  const skipPath = join(uploads, ".sweep-skip.json");
  if (!existsSync(skipPath)) return false;
  const skip = JSON.parse(readRaw(skipPath, "utf8"));
  return Array.isArray(skip) && skip.includes("session.enc");
})());

console.log("sweeper: skip-list prevents re-compressing the blob");
stats = await sweep({ dirs: [uploads, reports], compressDays: 14, now });
check("second run compresses nothing", stats.compressed === 0);

console.log("sweeper: eviction is opt-in and age-driven");
stats = await sweep({ dirs: [uploads, reports], compressDays: 14, evictDays: 20, now });
check("30d-old files evicted past the horizon", !existsSync(oldJson + ".gz") && !existsSync(oldBlob));
check("fresh file survives eviction", existsSync(fresh));

console.log("sweeper: size cap sweeps oldest-first");
const a = join(uploads, "a.bin"); writeFileSync(a, Buffer.alloc(600_000, 1)); ageFile(a, 10);
const b = join(uploads, "b.bin"); writeFileSync(b, Buffer.alloc(600_000, 2)); ageFile(b, 2);
stats = await sweep({ dirs: [uploads, reports], compressDays: 14, capMB: 1, now });
check("oldest file deleted to get under cap", !existsSync(a));
check("newest large file kept", existsSync(b));

if (failures) { console.error(`${failures} sweeper test(s) failed`); process.exit(1); }
console.log("sweeper tests passed");
