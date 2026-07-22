/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved. */
"use strict";

/* Disk sweeper for the persist volume — logrotate for uploads/reports.

   The persist API is write-only (uploads, generated reports, feedback are
   dropped on disk for operators to read later), so nothing here needs to be
   readable back through the API. Two passes, both age-driven off mtime:

     1. COMPRESS  — files older than compressDays are gzipped in place
                    (name -> name.gz, original mtime preserved so later
                    passes still see the true age). A file whose gzip
                    saves < 5% (already-compressed JPEG/PNG payloads) is
                    left alone and remembered in .sweep-skip.json so it
                    isn't re-tried every night.
     2. CAP/EVICT — optional and OFF by default: evictDays deletes
                    anything older than the horizon; capMB deletes
                    oldest-first until the tree is back under ~90% of the
                    cap. Both destructive knobs must be enabled by env.

   Dependency-free (node:zlib), single pass per directory tree, never
   follows symlinks, ignores dotfiles and *.tmp partials. */

const fsp = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { promisify } = require("node:util");
const gzip = promisify(zlib.gzip);

const SKIP_STATE = ".sweep-skip.json";
const DAY_MS = 24 * 60 * 60 * 1000;

async function listFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out; // directory may not exist yet
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name.endsWith(".tmp")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

async function loadSkip(dir) {
  try {
    return new Set(JSON.parse(await fsp.readFile(path.join(dir, SKIP_STATE), "utf8")));
  } catch {
    return new Set();
  }
}
async function saveSkip(dir, set) {
  try {
    await fsp.writeFile(path.join(dir, SKIP_STATE), JSON.stringify([...set]), "utf8");
  } catch {
    /* state is an optimization only */
  }
}

async function compressPass(dir, compressDays, now, stats) {
  const skip = await loadSkip(dir);
  let skipDirty = false;
  for (const file of await listFiles(dir)) {
    if (file.endsWith(".gz")) continue;
    if (skip.has(path.relative(dir, file))) continue;
    let st;
    try {
      st = await fsp.lstat(file);
    } catch {
      continue;
    }
    if (!st.isFile() || now - st.mtimeMs < compressDays * DAY_MS) continue;
    try {
      const raw = await fsp.readFile(file);
      const gz = await gzip(raw, { level: 9 });
      if (gz.length >= raw.length * 0.95) {
        skip.add(path.relative(dir, file));
        skipDirty = true;
        continue;
      }
      const gzPath = file + ".gz";
      await fsp.writeFile(gzPath + ".tmp", gz);
      await fsp.rename(gzPath + ".tmp", gzPath);
      await fsp.utimes(gzPath, st.atime, st.mtime); // keep true age for evict
      await fsp.unlink(file);
      stats.compressed += 1;
      stats.savedBytes += raw.length - gz.length;
    } catch (err) {
      stats.errors.push(`${file}: ${err.message}`);
    }
  }
  if (skipDirty) await saveSkip(dir, skip);
}

async function evictPass(dirs, { evictDays, capMB }, now, stats) {
  const all = [];
  for (const dir of dirs) {
    for (const file of await listFiles(dir)) {
      try {
        const st = await fsp.lstat(file);
        if (st.isFile()) all.push({ file, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        /* raced */
      }
    }
  }
  if (evictDays > 0) {
    for (const f of all.filter((f) => now - f.mtimeMs > evictDays * DAY_MS)) {
      try {
        await fsp.unlink(f.file);
        stats.evicted += 1;
        stats.savedBytes += f.size;
        f.gone = true;
      } catch (err) {
        stats.errors.push(`${f.file}: ${err.message}`);
      }
    }
  }
  if (capMB > 0) {
    const live = all.filter((f) => !f.gone);
    let total = live.reduce((a, f) => a + f.size, 0);
    const target = capMB * 1024 * 1024 * 0.9; // hysteresis: sweep to 90% of cap
    if (total > capMB * 1024 * 1024) {
      live.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
      for (const f of live) {
        if (total <= target) break;
        try {
          await fsp.unlink(f.file);
          total -= f.size;
          stats.evicted += 1;
          stats.savedBytes += f.size;
        } catch (err) {
          stats.errors.push(`${f.file}: ${err.message}`);
        }
      }
    }
  }
}

/* opts: { dirs, compressDays=14, evictDays=0, capMB=0, now=Date.now() } */
async function sweep(opts) {
  const { dirs } = opts;
  const compressDays = opts.compressDays ?? 14;
  const evictDays = opts.evictDays ?? 0;
  const capMB = opts.capMB ?? 0;
  const now = opts.now ?? Date.now();
  const stats = { compressed: 0, evicted: 0, savedBytes: 0, errors: [] };
  for (const dir of dirs) await compressPass(dir, compressDays, now, stats);
  if (evictDays > 0 || capMB > 0) await evictPass(dirs, { evictDays, capMB }, now, stats);
  return stats;
}

module.exports = { sweep };
