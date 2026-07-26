/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved. */
"use strict";

/* Disk sweeper for the persist volume — logrotate for uploads/reports.

   The persist API is write-only (uploads, generated reports, feedback are
   dropped on disk for operators to read later), so nothing here needs to be
   readable back through the API. Two passes, both age-driven off mtime:

     1. COMPRESS  — files older than compressDays are gzipped in place
                    (name -> name.gz, original mtime preserved so later
                    passes still see the true age). Common already-compressed
                    formats (INCOMPRESSIBLE_EXT below) are skipped up front,
                    before ever being read; anything else whose gzip saves
                    < 5% is left alone and remembered in .sweep-skip.json so
                    it isn't re-gzipped-and-discarded every night.
     2. CAP/EVICT — optional and OFF by default: evictDays deletes
                    anything older than the horizon; capMB deletes
                    oldest-first until the tree is back under ~90% of the
                    cap. Both destructive knobs must be enabled by env.

   Dependency-free (node:zlib), single pass per directory tree, never
   follows symlinks (including a configured root dir that is itself one),
   ignores dotfiles and *.tmp partials. */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { pipeline } = require("node:stream/promises");

const SKIP_STATE = ".sweep-skip.json";
const DAY_MS = 24 * 60 * 60 * 1000;
// already-compressed formats: gzip never earns its keep, so don't even try
// (and don't bloat .sweep-skip.json with one entry per upload)
const INCOMPRESSIBLE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".zip", ".gz"]);
// server.js only ever logs the first 5; cap well above that for diagnosis
// without letting a volume full of unreadable files grow this unbounded.
const MAX_ERRORS = 50;

// A rejection can be a non-Error (a string, or an Error-like without a
// .message) -- fall through to a stable string rather than let ${err.message}
// silently interpolate as "undefined" and lose the actual cause.
function errMessage(err) {
  if (err instanceof Error) return err.message || err.name || "unknown error";
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function pushError(stats, msg) {
  if (stats.errors.length < MAX_ERRORS) stats.errors.push(msg);
  else stats.errorsTruncated = (stats.errorsTruncated || 0) + 1;
}

// Async generator, not a materialized array: a sweep's memory use stays
// flat regardless of how many files are on the persist volume, and a
// caller can start acting on the first file before the walk finishes.
// isRoot guards only the dir passed in by the caller (opts.dirs) -- a
// symlinked subdirectory discovered during the walk is already excluded
// by readdir's own dirent type (isDirectory() is false for a DT_LNK entry).
async function* listFiles(dir, isRoot = true) {
  if (isRoot) {
    try {
      if (!(await fsp.lstat(dir)).isDirectory()) return; // symlink or non-dir root
    } catch {
      return; // directory may not exist yet
    }
  }
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name.endsWith(".tmp")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* listFiles(p, false);
    else if (e.isFile()) yield p;
  }
}

async function loadSkip(dir) {
  try {
    return new Set(JSON.parse(await fsp.readFile(path.join(dir, SKIP_STATE), "utf8")));
  } catch {
    return new Set();
  }
}
async function saveSkip(dir, set) {
  const finalPath = path.join(dir, SKIP_STATE);
  const tmpPath = finalPath + ".tmp";
  try {
    await fsp.writeFile(tmpPath, JSON.stringify([...set]), "utf8");
    await fsp.rename(tmpPath, finalPath); // atomic: a crash never leaves a truncated skip-list
  } catch {
    await fsp.unlink(tmpPath).catch(() => {});
    /* state is an optimization only */
  }
}

async function compressPass(dir, compressDays, now, stats) {
  const skip = await loadSkip(dir);
  let skipDirty = false;
  for await (const file of listFiles(dir)) {
    if (file.endsWith(".gz")) continue;
    if (INCOMPRESSIBLE_EXT.has(path.extname(file).toLowerCase())) continue;
    if (skip.has(path.relative(dir, file))) continue;
    let st;
    try {
      st = await fsp.lstat(file);
    } catch {
      continue;
    }
    if (!st.isFile() || now - st.mtimeMs < compressDays * DAY_MS) continue;
    const gzPath = file + ".gz";
    const tmpPath = gzPath + ".tmp";
    try {
      // Streamed, not buffered whole: reports/uploads can be large enough
      // that readFile()+gzip() would double-allocate the full file size on
      // every sweep just to decide whether it was worth compressing.
      await pipeline(fs.createReadStream(file), zlib.createGzip({ level: 9 }), fs.createWriteStream(tmpPath));
      const gzSize = (await fsp.stat(tmpPath)).size;
      if (gzSize >= st.size * 0.95) {
        await fsp.unlink(tmpPath).catch(() => {});
        skip.add(path.relative(dir, file));
        skipDirty = true;
        continue;
      }
      await fsp.rename(tmpPath, gzPath);
      await fsp.utimes(gzPath, st.atime, st.mtime); // keep true age for evict
      await fsp.unlink(file);
      stats.compressed += 1;
      stats.savedBytes += st.size - gzSize;
    } catch (err) {
      // listFiles() permanently ignores *.tmp, so a partial left behind
      // here would never be revisited or cleaned by a later sweep.
      await fsp.unlink(tmpPath).catch(() => {});
      pushError(stats, `${file}: ${errMessage(err)}`);
    }
  }
  if (skipDirty) await saveSkip(dir, skip);
}

async function evictPass(dirs, { evictDays, capMB }, now, stats) {
  const all = [];
  for (const dir of dirs) {
    for await (const file of listFiles(dir)) {
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
        pushError(stats, `${f.file}: ${errMessage(err)}`);
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
          pushError(stats, `${f.file}: ${errMessage(err)}`);
        }
      }
    }
  }
}

function finiteOrDefault(n, def) {
  return Number.isFinite(n) && n >= 0 ? n : def;
}

/* opts: { dirs, compressDays=14, evictDays=0, capMB=0, now=Date.now() } */
async function sweep(opts) {
  const { dirs } = opts;
  const compressDays = finiteOrDefault(opts.compressDays, 14);
  const evictDays = finiteOrDefault(opts.evictDays, 0);
  const capMB = finiteOrDefault(opts.capMB, 0);
  const now = opts.now ?? Date.now();
  const stats = { compressed: 0, evicted: 0, savedBytes: 0, errors: [] };
  for (const dir of dirs) await compressPass(dir, compressDays, now, stats);
  if (evictDays > 0 || capMB > 0) await evictPass(dirs, { evictDays, capMB }, now, stats);
  return stats;
}

module.exports = { sweep };
