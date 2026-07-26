/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.

   Turns a stored feedback record into a notification message.

   The record is reproduced in full, including the visitor's IP and the
   behavioural profile the insights widget collects. That is a deliberate
   configuration choice (notifications.feedback.includeFullRecord), not an
   accident: it means the notification mailbox holds the same personal data
   the persist volume does, and the retention that applies to one should
   apply to the other. Set includeFullRecord to false to send only the
   summary block, or attachRecordJson to false to keep the JSON out of the
   mailbox while keeping the readable summary.

   Nothing here interpolates visitor text into a header. The summary is a
   message BODY; only the subject and reply-to touch headers, and both go
   through mailer.js's safeHeader/safeAddress. */

"use strict";

const FIELD_LABELS = [
  ["type", "Type"],
  ["happiness", "Happiness"],
  ["algo_rating", "Algorithm rating"],
  ["context", "Context"],
  ["report_id", "Report id"],
  ["name", "Name"],
  ["email", "Email"],
  ["place", "Country/place"],
];

function oneLine(value, maxLen = 300) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, maxLen);
}

/* The widget posts { kind, ts, vid, page, data } with the answers under
   `data`; a direct POST to /persist/feedback may put them at the top level
   instead. Accept both rather than silently producing an empty summary. */
function answers(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (payload.data && typeof payload.data === "object") return payload.data;
  return payload;
}

function subjectFor(rec, prefix) {
  const a = answers(rec.payload);
  const who = oneLine(a.name, 40);
  const type = oneLine(a.type, 20) || "feedback";
  const happy = Number.isFinite(Number(a.happiness)) && Number(a.happiness) > 0 ? ` ${a.happiness}/5` : "";
  const tail = who ? `${type}${happy} from ${who}` : `${type}${happy}`;
  return `${prefix} ${tail}`.trim();
}

function summarise(rec) {
  const a = answers(rec.payload);
  const lines = [];
  lines.push(`Feedback id : ${oneLine(rec.id, 80)}`);
  lines.push(`Received    : ${oneLine(rec.ts, 40)}`);
  if (rec.payload && rec.payload.page) lines.push(`Page        : ${oneLine(rec.payload.page, 200)}`);

  for (const [key, label] of FIELD_LABELS) {
    const v = a[key];
    if (v === undefined || v === null || v === "" || v === 0) continue;
    lines.push(`${label.padEnd(12)}: ${oneLine(v)}`);
  }

  const message = oneLine(a.message, 4000);
  if (message) {
    lines.push("");
    lines.push("Message");
    lines.push("-------");
    lines.push(message);
  }
  return lines.join("\n");
}

/* Returns null when the notification should not be sent at all, so the caller
   has one thing to check rather than a partly-built message. */
function buildFeedbackEmail(rec, cfg) {
  const fb = (cfg.notifications && cfg.notifications.feedback) || {};
  if (!fb.enabled) return null;
  if (!Array.isArray(fb.to) || !fb.to.length) return null;

  const a = answers(rec.payload);
  let text = summarise(rec);

  if (fb.includeFullRecord !== false) {
    text +=
      "\n\n" +
      "Full record\n" +
      "-----------\n" +
      "Includes the visitor IP and profile. Treat this mail as personal data.\n\n" +
      JSON.stringify(rec, null, 2);
  }

  const attachments = [];
  if (fb.attachRecordJson) {
    attachments.push({
      filename: `${rec.id}.json`,
      content: JSON.stringify(rec, null, 2),
      contentType: "application/json",
    });
  }

  return {
    to: fb.to,
    subject: subjectFor(rec, fb.subjectPrefix || "[Vahini feedback]"),
    text,
    // Validated in mailer.safeAddress before it reaches a header; a malformed
    // or absent visitor address simply means no Reply-To.
    replyTo: fb.replyToVisitor === false ? "" : a.email || "",
    attachments: attachments.length ? attachments : undefined,
  };
}

module.exports = { buildFeedbackEmail, subjectFor, summarise, _answers: answers };
