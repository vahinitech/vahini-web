/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.

   Loads the global email configuration from config/email/.

   Three layers, lowest precedence first:

     1. email.config.json              committed defaults, never secret
     2. email.config.local.json        per-host overrides, gitignored, optional
     3. VAHINI_EMAIL_* / VAHINI_SMTP_* environment variables

   Credentials are env-only by construction: there is no config key that can
   hold a password, so a committed file cannot leak one and a review cannot
   miss one. Everything else is a file value an operator can read.

   Keeping this a separate module from mailer.js means the config can be
   loaded and asserted on in tests without opening a socket. */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DIR = process.env.VAHINI_EMAIL_CONFIG_DIR || "/config/email";
const BASE_FILE = "email.config.json";
const LOCAL_FILE = "email.config.local.json";

/* Keys starting with $ are documentation for humans reading the JSON. Strip
   them so they can never be mistaken for configuration. */
function stripComments(value) {
  if (Array.isArray(value)) return value.map(stripComments);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith("$")) continue;
    out[k] = stripComments(v);
  }
  return out;
}

/* Deep merge, with arrays REPLACED rather than concatenated: a local override
   that lists two recipients means exactly those two, not those two appended to
   the committed default. Concatenating would make it impossible to narrow a
   recipient list from an override file. */
function merge(base, over) {
  if (Array.isArray(over)) return over.slice();
  if (!over || typeof over !== "object") return over === undefined ? base : over;
  const out = { ...(base && typeof base === "object" ? base : {}) };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in out ? merge(out[k], v) : merge(undefined, v);
  }
  return out;
}

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`email config: cannot read ${file}: ${err.message}`);
  }
  try {
    return stripComments(JSON.parse(text));
  } catch (err) {
    throw new Error(`email config: ${file} is not valid JSON: ${err.message}`);
  }
}

function envStr(name) {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function envNum(name) {
  const v = envStr(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`email config: ${name} is not a number: ${v}`);
  return n;
}

/* Anything other than an explicit "1"/"true"/"yes" is false. An unset var must
   not read as true, or a missing variable would silently enable sending. */
function envBool(name) {
  const v = envStr(name);
  if (v === undefined) return undefined;
  return /^(1|true|yes|on)$/i.test(v);
}

function envList(name) {
  const v = envStr(name);
  if (v === undefined) return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

/* Only assign when the env var was actually set, so `undefined` never
   overwrites a real file value. */
function put(obj, keyPath, value) {
  if (value === undefined) return;
  const parts = keyPath.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function applyEnv(cfg) {
  put(cfg, "transport", envStr("VAHINI_EMAIL_TRANSPORT"));
  put(cfg, "smtp.host", envStr("VAHINI_SMTP_HOST"));
  put(cfg, "smtp.port", envNum("VAHINI_SMTP_PORT"));
  put(cfg, "smtp.secure", envBool("VAHINI_SMTP_SECURE"));
  put(cfg, "smtp.requireTLS", envBool("VAHINI_SMTP_REQUIRE_TLS"));
  put(cfg, "sendmail.path", envStr("VAHINI_SENDMAIL_PATH"));
  put(cfg, "identity.from", envStr("VAHINI_EMAIL_FROM"));
  put(cfg, "identity.envelopeFrom", envStr("VAHINI_EMAIL_ENVELOPE_FROM"));
  put(cfg, "notifications.feedback.enabled", envBool("VAHINI_FEEDBACK_EMAIL_ENABLED"));
  put(cfg, "notifications.feedback.to", envList("VAHINI_FEEDBACK_EMAIL_TO"));
  put(cfg, "notifications.feedback.maxPerHour", envNum("VAHINI_FEEDBACK_EMAIL_MAX_PER_HOUR"));
  return cfg;
}

const VALID_TRANSPORTS = new Set(["smtp", "sendmail", "log"]);

/* Fail loudly at startup on a config that would misbehave at send time. A
   typo'd transport or a notification enabled with no recipients is the kind of
   thing that otherwise only shows up as silence when the first feedback
   arrives, which is exactly when nobody is looking at the logs. */
function validate(cfg) {
  const errs = [];
  if (!VALID_TRANSPORTS.has(cfg.transport)) {
    errs.push(`transport must be one of ${[...VALID_TRANSPORTS].join(", ")} (got ${JSON.stringify(cfg.transport)})`);
  }
  if (!cfg.identity || !cfg.identity.from) errs.push("identity.from is required");
  if (cfg.transport === "smtp") {
    if (!cfg.smtp || !cfg.smtp.host) errs.push("smtp.host is required when transport is smtp");
    if (!cfg.smtp || !Number.isFinite(cfg.smtp.port)) errs.push("smtp.port must be a number when transport is smtp");
  }
  if (cfg.transport === "sendmail" && (!cfg.sendmail || !cfg.sendmail.path)) {
    errs.push("sendmail.path is required when transport is sendmail");
  }
  const fb = (cfg.notifications && cfg.notifications.feedback) || {};
  if (fb.enabled && !(Array.isArray(fb.to) && fb.to.length)) {
    errs.push("notifications.feedback.to must list at least one recipient when feedback email is enabled");
  }
  if (errs.length) throw new Error(`email config invalid:\n  - ${errs.join("\n  - ")}`);
  return cfg;
}

/* Credentials, read straight from the environment at send time. Returned
   separately from the config object so that logging or serialising the config
   can never print them. */
function readCredentials() {
  const user = envStr("VAHINI_SMTP_USER");
  const pass = envStr("VAHINI_SMTP_PASS");
  if (!user || !pass) return null;
  return { user, pass };
}

function loadEmailConfig(dir = DEFAULT_DIR) {
  const base = readJson(path.join(dir, BASE_FILE));
  if (!base) throw new Error(`email config: ${path.join(dir, BASE_FILE)} not found`);
  const local = readJson(path.join(dir, LOCAL_FILE));
  const cfg = applyEnv(local ? merge(base, local) : base);
  cfg.configDir = dir;
  cfg.hasLocalOverride = Boolean(local);
  return validate(cfg);
}

module.exports = { loadEmailConfig, readCredentials, DEFAULT_DIR, _merge: merge, _stripComments: stripComments };
