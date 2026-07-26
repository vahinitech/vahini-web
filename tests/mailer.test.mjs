/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.

   Email configuration, message building and SMTP delivery.

   The SMTP leg runs against a throwaway server built on node:net rather than a
   mock transport, so it exercises nodemailer's real client: STARTTLS
   negotiation is skipped (requireTLS off for the fixture) but AUTH, MAIL FROM,
   RCPT TO and the DATA body are all genuinely spoken. That is what catches a
   header-injection regression, which a stubbed sendMail() would not. */

import { createServer } from "node:net";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SVC = "../services/persist-api/lib";
const { loadEmailConfig, readCredentials, _merge } = require(`${SVC}/email-config.js`);
const { createMailer, safeHeader, safeAddress } = require(`${SVC}/mailer.js`);
const { buildFeedbackEmail, subjectFor } = require(`${SVC}/feedback-email.js`);

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? `  -- ${extra}` : ""}`); }
};
const group = (n) => console.log(`\n${n}`);

const BASE_CONFIG = {
  transport: "log",
  smtp: { host: "smtp.example.test", port: 587, secure: false, requireTLS: true },
  sendmail: { path: "/usr/sbin/sendmail", args: ["-t", "-i"] },
  identity: { from: "Vahini <noreply@vahinitech.com>", envelopeFrom: "noreply@vahinitech.com" },
  notifications: {
    feedback: { enabled: true, to: ["hello@vahinitech.com"], subjectPrefix: "[Vahini feedback]",
                replyToVisitor: true, includeFullRecord: true, attachRecordJson: false, maxPerHour: 0 },
  },
};
const clone = (o) => JSON.parse(JSON.stringify(o));

function makeRecord(over = {}) {
  return {
    id: "feedback-abc123",
    ts: "2026-07-26T10:00:00.000Z",
    payload: {
      kind: "feedback", page: "/analyser.html",
      data: { type: "love", happiness: 5, algo_rating: 4, message: "Worked on my Telugu page.",
              name: "Asha", email: "asha@example.com", place: "Hyderabad", context: "after_pdf",
              report_id: "r-9", profile: { visits: 3 } },
    },
    headers: { contentType: "application/json", userAgent: "UA", referer: "" },
    ip: "203.0.113.7",
    ...over,
  };
}

/* ---------------------------------------------------------------- config */
group("config: layering and env precedence");
{
  const dir = mkdtempSync(path.join(tmpdir(), "vahini-email-"));
  writeFileSync(path.join(dir, "email.config.json"), JSON.stringify({
    $comment: ["stripped"],
    transport: "smtp",
    smtp: { host: "base.example", port: 587 },
    identity: { from: "Base <base@vahinitech.com>" },
    notifications: { feedback: { enabled: false, to: ["base@vahinitech.com"], maxPerHour: 60 } },
  }));

  let cfg = loadEmailConfig(dir);
  check("base file loads", cfg.smtp.host === "base.example");
  check("$comment keys stripped", !("$comment" in cfg));
  check("no local override reported", cfg.hasLocalOverride === false);

  writeFileSync(path.join(dir, "email.config.local.json"), JSON.stringify({
    smtp: { host: "local.example" },
    notifications: { feedback: { enabled: true, to: ["a@vahinitech.com", "b@vahinitech.com"] } },
  }));
  cfg = loadEmailConfig(dir);
  check("local override wins", cfg.smtp.host === "local.example");
  check("unset keys survive the merge", cfg.smtp.port === 587);
  check("local override reported", cfg.hasLocalOverride === true);
  check("arrays replace, not concatenate", cfg.notifications.feedback.to.length === 2,
        JSON.stringify(cfg.notifications.feedback.to));

  process.env.VAHINI_SMTP_HOST = "env.example";
  process.env.VAHINI_FEEDBACK_EMAIL_TO = "env1@vahinitech.com, env2@vahinitech.com";
  cfg = loadEmailConfig(dir);
  check("env beats both files", cfg.smtp.host === "env.example");
  check("env list splits and trims", cfg.notifications.feedback.to[1] === "env2@vahinitech.com");
  delete process.env.VAHINI_SMTP_HOST;
  delete process.env.VAHINI_FEEDBACK_EMAIL_TO;

  // An unset boolean must not read as true, or a missing var would enable sending.
  delete process.env.VAHINI_FEEDBACK_EMAIL_ENABLED;
  cfg = loadEmailConfig(dir);
  check("unset bool env leaves file value alone", cfg.notifications.feedback.enabled === true);
  process.env.VAHINI_FEEDBACK_EMAIL_ENABLED = "0";
  cfg = loadEmailConfig(dir);
  check("env can disable notifications", cfg.notifications.feedback.enabled === false);
  delete process.env.VAHINI_FEEDBACK_EMAIL_ENABLED;

  check("no config key can hold a password",
        !JSON.stringify(cfg).toLowerCase().match(/"(pass|password|secret)"\s*:/));
  rmSync(dir, { recursive: true, force: true });
}

group("config: invalid combinations are rejected at load");
{
  const dir = mkdtempSync(path.join(tmpdir(), "vahini-email-bad-"));
  const write = (o) => writeFileSync(path.join(dir, "email.config.json"), JSON.stringify(o));
  const fails = (label, obj, needle) => {
    write(obj);
    try { loadEmailConfig(dir); check(label, false, "loaded without error"); }
    catch (err) { check(label, err.message.includes(needle), err.message); }
  };
  fails("unknown transport rejected",
        { transport: "carrier-pigeon", identity: { from: "a@b.co" } }, "transport must be one of");
  fails("missing identity.from rejected",
        { transport: "log" }, "identity.from is required");
  fails("smtp without host rejected",
        { transport: "smtp", smtp: { port: 587 }, identity: { from: "a@b.co" } }, "smtp.host is required");
  fails("enabled notification with no recipients rejected",
        { transport: "log", identity: { from: "a@b.co" }, notifications: { feedback: { enabled: true, to: [] } } },
        "at least one recipient");
  try { loadEmailConfig(path.join(dir, "nope")); check("missing config dir errors", false); }
  catch (err) { check("missing config dir errors", err.message.includes("not found")); }
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------- header hardening */
group("headers: visitor text can never become a header");
{
  check("CR/LF stripped from header values",
        safeHeader("Asha\r\nBcc: attacker@evil.test") === "Asha Bcc: attacker@evil.test");
  check("NUL stripped", !safeHeader("a\0b").includes("\0"));
  check("header value length capped", safeHeader("x".repeat(500)).length === 200);
  check("plain address accepted", safeAddress("asha@example.com") === "asha@example.com");
  check("injected address rejected", safeAddress("a@b.co\r\nBcc: x@evil.test") === "");
  check("display-name form rejected", safeAddress("Asha <asha@example.com>") === "");
  check("empty address stays empty", safeAddress("") === "");
  check("non-address text rejected", safeAddress("not an email") === "");

  const rec = makeRecord();
  rec.payload.data.name = "Asha\r\nBcc: attacker@evil.test";
  const subj = subjectFor(rec, "[Vahini feedback]");
  check("subject built from hostile name has no CR/LF", !/[\r\n]/.test(subj), JSON.stringify(subj));
}

/* -------------------------------------------------------- message shaping */
group("message: feedback record to email");
{
  const cfg = clone(BASE_CONFIG);
  const msg = buildFeedbackEmail(makeRecord(), cfg);
  check("recipients come from config", msg.to.join() === "hello@vahinitech.com");
  check("subject carries prefix, type, rating and name",
        msg.subject === "[Vahini feedback] love 5/5 from Asha", msg.subject);
  check("reply-to is the visitor", msg.replyTo === "asha@example.com");
  check("summary includes the message text", msg.text.includes("Worked on my Telugu page."));
  check("summary includes the feedback id", msg.text.includes("feedback-abc123"));
  check("full record included when configured", msg.text.includes('"ip": "203.0.113.7"'));
  check("full record carries a personal-data warning", msg.text.includes("personal data"));

  cfg.notifications.feedback.includeFullRecord = false;
  const lean = buildFeedbackEmail(makeRecord(), cfg);
  check("full record omitted when disabled", !lean.text.includes("203.0.113.7"));
  check("summary survives without the full record", lean.text.includes("Worked on my Telugu page."));

  cfg.notifications.feedback.includeFullRecord = true;
  cfg.notifications.feedback.attachRecordJson = true;
  const attached = buildFeedbackEmail(makeRecord(), cfg);
  check("json attached when configured",
        attached.attachments?.[0]?.filename === "feedback-abc123.json");

  cfg.notifications.feedback.replyToVisitor = false;
  check("reply-to suppressed when disabled", buildFeedbackEmail(makeRecord(), cfg).replyTo === "");

  const off = clone(BASE_CONFIG);
  off.notifications.feedback.enabled = false;
  check("disabled notification builds nothing", buildFeedbackEmail(makeRecord(), off) === null);

  // A direct POST puts the answers at the top level instead of under `data`.
  const flat = makeRecord({ payload: { type: "bug", message: "flat shape", name: "Ravi" } });
  check("flat payload shape understood", buildFeedbackEmail(flat, clone(BASE_CONFIG)).text.includes("flat shape"));

  const empty = makeRecord({ payload: {} });
  const emptyMsg = buildFeedbackEmail(empty, clone(BASE_CONFIG));
  check("empty payload still produces a message", typeof emptyMsg.text === "string" && emptyMsg.text.length > 0);
  check("empty payload has no reply-to", emptyMsg.replyTo === "");
}

/* ------------------------------------------------------------ rate limit */
group("rate limit: a burst does not become a mail flood");
{
  const cfg = clone(BASE_CONFIG);
  cfg.notifications.feedback.maxPerHour = 3;
  let t = 1_000_000;
  const mailer = createMailer(cfg, { now: () => t, log: { log() {}, error() {} } });
  const msg = { to: ["x@vahinitech.com"], subject: "s", text: "t" };

  const first = [];
  for (let i = 0; i < 5; i++) first.push(await mailer.send(msg));
  check("first three delivered", first.slice(0, 3).every(Boolean));
  check("the rest suppressed", first.slice(3).every((v) => v === false));
  check("suppressions counted", mailer.stats().suppressed === 2, JSON.stringify(mailer.stats()));

  t += 3_600_001; // next window
  check("window reopens", (await mailer.send(msg)) === true);

  const uncapped = createMailer(clone(BASE_CONFIG), { now: () => t, log: { log() {}, error() {} } });
  const many = [];
  for (let i = 0; i < 50; i++) many.push(await uncapped.send(msg));
  check("maxPerHour 0 means no cap", many.every(Boolean));
}

/* ------------------------------------------------------- real SMTP client */
group("smtp: a real conversation with a throwaway server");
{
  const seen = { auth: [], from: "", rcpt: [], data: "" };
  const server = createServer((sock) => {
    let buf = "", inData = false;
    sock.write("220 fixture ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") { inData = false; sock.write("250 queued\r\n"); }
          else seen.data += line + "\n";
          continue;
        }
        const up = line.toUpperCase();
        if (up.startsWith("EHLO")) sock.write("250-fixture\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (up.startsWith("AUTH")) { seen.auth.push(line); sock.write("235 ok\r\n"); }
        else if (up.startsWith("MAIL FROM")) { seen.from = line; sock.write("250 ok\r\n"); }
        else if (up.startsWith("RCPT TO")) { seen.rcpt.push(line); sock.write("250 ok\r\n"); }
        else if (up === "DATA") { inData = true; sock.write("354 go\r\n"); }
        else if (up === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("250 ok\r\n");
      }
    });
    sock.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const cfg = clone(BASE_CONFIG);
  cfg.transport = "smtp";
  cfg.smtp = { host: "127.0.0.1", port, secure: false, requireTLS: false };

  process.env.VAHINI_SMTP_USER = "svc-web@vahinitech.com";
  process.env.VAHINI_SMTP_PASS = "fixture-secret";
  const mailer = createMailer(cfg, { log: { log() {}, error() {} } });

  const hostile = makeRecord();
  hostile.payload.data.name = "Asha\r\nBcc: attacker@evil.test";
  hostile.payload.data.email = "asha@example.com\r\nBcc: attacker@evil.test";
  const ok = await mailer.send(buildFeedbackEmail(hostile, cfg));

  check("message accepted by the server", ok === true, JSON.stringify(mailer.stats()));
  check("client authenticated", seen.auth.length > 0);
  check("envelope sender is the configured identity", seen.from.includes("noreply@vahinitech.com"), seen.from);
  check("exactly one recipient on the envelope", seen.rcpt.length === 1, JSON.stringify(seen.rcpt));
  check("no injected Bcc recipient", !seen.rcpt.join().includes("attacker@evil.test"));
  check("no Bcc header in the DATA body", !/^bcc:/im.test(seen.data));
  check("injected reply-to dropped entirely", !/^reply-to:.*attacker/im.test(seen.data));
  // The hostile string is allowed to survive as subject TEXT -- that is inert.
  // What must not happen is it becoming a header of its own, so assert on the
  // header block's field names rather than on the absence of the string.
  const headerNames = (seen.data.split(/\n\s*\n/)[0] || "")
    .split("\n")
    .filter((l) => /^[A-Za-z][A-Za-z0-9-]*:/.test(l))
    .map((l) => l.split(":")[0].toLowerCase());
  check("no recipient header smuggled into the header block",
        !headerNames.includes("bcc") && !headerNames.includes("cc"), JSON.stringify(headerNames));
  check("exactly one To header", headerNames.filter((n) => n === "to").length === 1);
  check("body still carries the feedback", seen.data.includes("Telugu") || seen.data.includes("VGVsdWd1"));
  // envelopeFrom must reach MAIL FROM, not just a Sender: header. nodemailer's
  // `sender` option does the latter, which is what this used to do.
  check("envelopeFrom lands on the SMTP envelope",
        seen.from.includes("noreply@vahinitech.com"), seen.from);

  delete process.env.VAHINI_SMTP_USER;
  delete process.env.VAHINI_SMTP_PASS;
  await new Promise((r) => server.close(r));
}

group("smtp: an unreachable server fails soft");
{
  const cfg = clone(BASE_CONFIG);
  cfg.transport = "smtp";
  // Port 1 on loopback: nothing listens, connection is refused immediately.
  cfg.smtp = { host: "127.0.0.1", port: 1, secure: false, requireTLS: false, connectionTimeoutMs: 1500 };
  const mailer = createMailer(cfg, { log: { log() {}, error() {} } });
  const result = await mailer.send({ to: ["x@vahinitech.com"], subject: "s", text: "t" });
  check("send returns false rather than throwing", result === false);
  check("failure counted", mailer.stats().failed === 1);
  check("failure reason recorded", mailer.stats().lastError.length > 0);
}

group("smtp: envelope sender is distinct from the From header");
{
  const seen = { from: "", headers: "" };
  const server = createServer((sock) => {
    let buf = "", inData = false;
    sock.write("220 fixture ESMTP\r\n");
    sock.on("data", (c) => {
      buf += c.toString(); let i;
      while ((i = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === ".") { inData = false; sock.write("250 ok\r\n"); } else seen.headers += line + "\n"; continue; }
        const up = line.toUpperCase();
        if (up.startsWith("EHLO")) sock.write("250-fixture\r\n250 OK\r\n");
        else if (up.startsWith("MAIL FROM")) { seen.from = line; sock.write("250 ok\r\n"); }
        else if (up === "DATA") { inData = true; sock.write("354 go\r\n"); }
        else if (up === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("250 ok\r\n");
      }
    });
    sock.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  const cfg = clone(BASE_CONFIG);
  cfg.transport = "smtp";
  cfg.smtp = { host: "127.0.0.1", port: server.address().port, secure: false, requireTLS: false };
  // Deliberately different so the two cannot be confused for one another.
  cfg.identity = { from: "Vahini Web <display@vahinitech.com>", envelopeFrom: "bounce@vahinitech.com" };

  const mailer = createMailer(cfg, { log: { log() {}, error() {} } });
  await mailer.send({ to: ["hello@vahinitech.com"], subject: "s", text: "t" });
  await new Promise((r) => server.close(r));

  check("MAIL FROM is envelopeFrom", seen.from.includes("bounce@vahinitech.com"), seen.from);
  check("MAIL FROM is NOT the From header address", !seen.from.includes("display@vahinitech.com"), seen.from);
  check("From header keeps the display identity", /^from:.*display@vahinitech\.com/im.test(seen.headers));
  check("recipient survives the explicit envelope", /^to:.*hello@vahinitech\.com/im.test(seen.headers));
}

group("startup: smtp without credentials is refused, not attempted");
{
  const dir = mkdtempSync(path.join(tmpdir(), "vahini-email-creds-"));
  writeFileSync(path.join(dir, "email.config.json"), JSON.stringify({
    transport: "smtp",
    smtp: { host: "smtp.gmail.com", port: 587 },
    identity: { from: "Vahini <vahinitechfirm@gmail.com>" },
    notifications: { feedback: { enabled: true, to: ["info@vahinitech.com"] } },
  }));
  delete process.env.VAHINI_SMTP_USER;
  delete process.env.VAHINI_SMTP_PASS;

  const cfg = loadEmailConfig(dir);
  const fb = cfg.notifications.feedback;
  // Mirrors the guard in server.js initMail().
  const wouldDisable = (c) =>
    c.notifications.feedback.enabled && c.transport === "smtp" && !readCredentials();

  check("config itself still loads", cfg.transport === "smtp" && fb.enabled === true);
  check("no credentials means mail is disabled", wouldDisable(cfg) === true);

  process.env.VAHINI_SMTP_USER = "vahinitechfirm@gmail.com";
  process.env.VAHINI_SMTP_PASS = "app-password";
  check("credentials present means mail stays enabled", wouldDisable(loadEmailConfig(dir)) === false);

  // A partial credential pair must not count as present.
  delete process.env.VAHINI_SMTP_PASS;
  check("user without password does not count", wouldDisable(loadEmailConfig(dir)) === true);
  delete process.env.VAHINI_SMTP_USER;

  // Transports that need no credentials are unaffected by the guard.
  writeFileSync(path.join(dir, "email.config.local.json"), JSON.stringify({ transport: "log" }));
  check("log transport unaffected by missing credentials", wouldDisable(loadEmailConfig(dir)) === false);
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
