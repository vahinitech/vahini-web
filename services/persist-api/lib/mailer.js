/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.

   Outbound mail for the persist API.

   Transport is a config value, not a code path chosen at build time:

     smtp      authenticated submission (Gmail by default). Behaves identically
               on a laptop, on stage and in prod, and does not depend on the
               shared host's MTA or its sending reputation.
     sendmail  pipe to a local binary. For a host that would rather use its
               own mail stack; note the persist API runs in a container, so the
               binary has to exist INSIDE the image, not just on the host.
     log       compose and log, never deliver. Default for dev and tests.

   Two rules this module exists to enforce:

     - Sending must never affect the request that triggered it. Every failure
       is caught and counted; callers get a boolean, not an exception.
     - Visitor-supplied text must never become a mail header. See safeHeader()
       and safeAddress().

   nodemailer is the only runtime dependency the persist API has. It is itself
   dependency-free, and it owns the parts of SMTP that are genuinely easy to
   get wrong (dot-stuffing, MIME encoding, header folding). */

"use strict";

const { readCredentials } = require("./email-config");

/* CR and LF are what turn a value into an injected header; NUL breaks the
   C-string boundary in some MTAs. Strip rather than reject so a stray newline
   in a visitor's name does not silently drop the whole notification. */
function safeHeader(value, maxLen = 200) {
  return String(value == null ? "" : value)
    .replace(/[\r\n\0]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/* Deliberately strict: this address is used as Reply-To, so anything that is
   not unambiguously a single plain address is dropped rather than sanitised.
   A visitor who typo'd their email loses the reply-to convenience; they do not
   get to shape our headers. */
const ADDRESS_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

function safeAddress(value) {
  const v = safeHeader(value, 254);
  return ADDRESS_RE.test(v) ? v : "";
}

/* Fixed-window counter. A burst of feedback (or someone hammering the
   endpoint past the API's own rate limits) must not turn into a burst of
   mail. Suppressions are counted and reported on the next message that gets
   through, so the gap is visible rather than silent. */
function createRateLimiter(maxPerHour) {
  let windowStart = 0;
  let sent = 0;
  let suppressed = 0;
  return {
    take(now) {
      if (!Number.isFinite(maxPerHour) || maxPerHour <= 0) return { allowed: true, suppressed: 0 };
      if (now - windowStart >= 3600_000) {
        windowStart = now;
        sent = 0;
        suppressed = 0;
      }
      if (sent >= maxPerHour) {
        suppressed += 1;
        return { allowed: false, suppressed };
      }
      sent += 1;
      const carried = suppressed;
      suppressed = 0;
      return { allowed: true, suppressed: carried };
    },
    stats() {
      return { sent, suppressed };
    },
  };
}

function buildTransport(cfg, deps) {
  if (cfg.transport === "log") return null;

  // Required lazily so that `transport: "log"` works with nodemailer absent --
  // which is what keeps the unit tests and a bare dev checkout dependency-free.
  const nodemailer = deps.nodemailer || require("nodemailer");

  if (cfg.transport === "sendmail") {
    return nodemailer.createTransport({
      sendmail: true,
      path: cfg.sendmail.path,
      args: cfg.sendmail.args || ["-t", "-i"],
      newline: "unix",
    });
  }

  const creds = deps.credentials !== undefined ? deps.credentials : readCredentials();
  return nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    // `secure` means implicit TLS (port 465). Submission on 587 starts plain
    // and upgrades, which is why requireTLS matters: without it a server that
    // fails to advertise STARTTLS would be talked to in the clear.
    secure: Boolean(cfg.smtp.secure),
    requireTLS: cfg.smtp.requireTLS !== false,
    auth: creds ? { user: creds.user, pass: creds.pass } : undefined,
    tls: { minVersion: cfg.smtp.minTlsVersion || "TLSv1.2" },
    connectionTimeout: cfg.smtp.connectionTimeoutMs,
    greetingTimeout: cfg.smtp.greetingTimeoutMs,
    socketTimeout: cfg.smtp.socketTimeoutMs,
  });
}

/* deps is a seam for tests: inject a fake nodemailer and a clock instead of
   opening sockets or waiting on wall time. */
function createMailer(cfg, deps = {}) {
  const now = deps.now || (() => Date.now());
  const log = deps.log || console;
  const limiter = createRateLimiter(
    (cfg.notifications && cfg.notifications.feedback && cfg.notifications.feedback.maxPerHour) || 0
  );

  let transport;
  let transportError = null;
  try {
    transport = buildTransport(cfg, deps);
  } catch (err) {
    // A missing nodemailer or a bad transport config must not stop the API
    // from booting. Record it and degrade to not sending.
    transportError = err;
    log.error(`mailer: transport unavailable (${err.message}); mail is disabled`);
  }

  const stats = { sent: 0, failed: 0, suppressed: 0, lastError: "" };

  async function send(message) {
    const gate = limiter.take(now());
    if (!gate.allowed) {
      stats.suppressed += 1;
      return false;
    }
    if (transportError) {
      stats.failed += 1;
      return false;
    }

    const headerNote = gate.suppressed
      ? `\n\n(${gate.suppressed} further notification${gate.suppressed === 1 ? "" : "s"} were suppressed by the hourly cap.)`
      : "";

    const envelope = {
      from: cfg.identity.from,
      sender: cfg.identity.envelopeFrom || undefined,
      to: (message.to || []).join(", "),
      subject: safeHeader(message.subject, 180),
      text: (message.text || "") + headerNote,
      attachments: message.attachments || undefined,
    };
    const replyTo = safeAddress(message.replyTo);
    if (replyTo) envelope.replyTo = replyTo;

    if (cfg.transport === "log") {
      log.log(`mailer[log]: to=${envelope.to} subject=${envelope.subject}`);
      stats.sent += 1;
      return true;
    }

    try {
      await transport.sendMail(envelope);
      stats.sent += 1;
      return true;
    } catch (err) {
      stats.failed += 1;
      stats.lastError = err && err.message ? err.message : String(err);
      log.error(`mailer: send failed: ${stats.lastError}`);
      return false;
    }
  }

  /* Proves credentials and reachability without delivering anything. Used by
     tools/send-test-email.mjs and worth calling once after a config change. */
  async function verify() {
    if (transportError) throw transportError;
    if (cfg.transport === "log") return { ok: true, transport: "log" };
    if (typeof transport.verify !== "function") return { ok: true, transport: cfg.transport };
    await transport.verify();
    return { ok: true, transport: cfg.transport };
  }

  return { send, verify, stats: () => ({ ...stats }), _safeHeader: safeHeader, _safeAddress: safeAddress };
}

module.exports = { createMailer, createRateLimiter, safeHeader, safeAddress };
