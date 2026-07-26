#!/usr/bin/env node
/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.

   Proves the mail configuration on the machine that will actually send.

     node tools/send-test-email.mjs --check          resolve config, verify login, send nothing
     node tools/send-test-email.mjs --to me@x.com    send one real test message
     node tools/send-test-email.mjs --sample         send a fake feedback notification

   --check is the one to run first: it authenticates and disconnects, so a
   wrong App Password or a blocked port shows up without anything landing in
   an inbox.

   Reads the same config the persist API does, so a pass here means the
   service will send. Run it from the repo root with the same environment the
   container gets:

     env $(grep -v '^#' /home/vishnu/vahini-mail.env | xargs) \
       VAHINI_EMAIL_CONFIG_DIR=./config/email node tools/send-test-email.mjs --check
*/

import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { loadEmailConfig, readCredentials } = require(path.join(root, "services/persist-api/lib/email-config.js"));
const { createMailer } = require(path.join(root, "services/persist-api/lib/mailer.js"));
const { buildFeedbackEmail } = require(path.join(root, "services/persist-api/lib/feedback-email.js"));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

if (has("--help") || (!has("--check") && !has("--sample") && !val("--to"))) {
  console.log(`usage:
  --check         resolve config + verify credentials, send nothing
  --to <addr>     send one plain test message to <addr>
  --sample        send a synthetic feedback notification to the configured recipients
  --config <dir>  config directory (default: $VAHINI_EMAIL_CONFIG_DIR or /config/email)`);
  process.exit(has("--help") ? 0 : 2);
}

const dir = val("--config") || process.env.VAHINI_EMAIL_CONFIG_DIR || "/config/email";

let cfg;
try {
  cfg = loadEmailConfig(dir);
} catch (err) {
  console.error(`config: FAILED\n  ${err.message}`);
  process.exit(1);
}

const fb = (cfg.notifications && cfg.notifications.feedback) || {};
const creds = readCredentials();
console.log("resolved configuration");
console.log(`  dir            : ${dir}${cfg.hasLocalOverride ? " (+ email.config.local.json)" : ""}`);
console.log(`  transport      : ${cfg.transport}`);
if (cfg.transport === "smtp") {
  console.log(`  smtp           : ${cfg.smtp.host}:${cfg.smtp.port} secure=${!!cfg.smtp.secure} requireTLS=${cfg.smtp.requireTLS !== false}`);
}
if (cfg.transport === "sendmail") console.log(`  sendmail       : ${cfg.sendmail.path}`);
console.log(`  from           : ${cfg.identity.from}`);
// Username only. The password is never printed, not even masked by length.
console.log(`  credentials    : ${creds ? `user=${creds.user} (password present)` : "NONE -- VAHINI_SMTP_USER/PASS not set"}`);
console.log(`  feedback email : ${fb.enabled ? `on -> ${(fb.to || []).join(", ")}` : "off"}`);
console.log("");

if (cfg.transport === "smtp" && !creds) {
  console.error("VAHINI_SMTP_USER / VAHINI_SMTP_PASS are not set; SMTP will fail to authenticate.");
  console.error("For Gmail the password is a 16-character App Password, not the account password.");
  process.exit(1);
}

const mailer = createMailer(cfg);

try {
  await mailer.verify();
  console.log(`verify: OK (${cfg.transport} reachable and credentials accepted)`);
} catch (err) {
  console.error(`verify: FAILED\n  ${err.message}`);
  console.error("\nCommon causes:");
  console.error("  535 auth failed  -> not an App Password, or 2-Step Verification is off");
  console.error("  ETIMEDOUT        -> egress to the SMTP port is blocked by the host firewall");
  console.error("  self-signed cert -> traffic is being intercepted; do not disable TLS to work around it");
  process.exit(1);
}

if (has("--check")) process.exit(0);

const to = val("--to");
let message;
if (has("--sample")) {
  if (!fb.enabled) {
    console.error("--sample needs notifications.feedback.enabled=true (or VAHINI_FEEDBACK_EMAIL_ENABLED=1)");
    process.exit(1);
  }
  message = buildFeedbackEmail({
    id: "feedback-selftest",
    ts: new Date().toISOString(),
    payload: { kind: "feedback", page: "/tools/send-test-email.mjs",
               data: { type: "love", happiness: 5, algo_rating: 5, name: "Self test",
                       email: "", place: "", message: "Synthetic record from tools/send-test-email.mjs.",
                       context: "selftest" } },
    headers: { contentType: "application/json", userAgent: "send-test-email", referer: "" },
    ip: "127.0.0.1",
  }, cfg);
} else {
  message = {
    to: [to],
    subject: "Vahini mail self test",
    text: `Sent by tools/send-test-email.mjs at ${new Date().toISOString()}.\n\n` +
          `transport=${cfg.transport}\nfrom=${cfg.identity.from}\n\n` +
          `If this arrived, feedback notifications will deliver from this host.\n`,
  };
}

const ok = await mailer.send(message);
console.log(ok ? `send: OK -> ${message.to.join(", ")}` : `send: FAILED -- ${mailer.stats().lastError}`);
process.exit(ok ? 0 : 1);
