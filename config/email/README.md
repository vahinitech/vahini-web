# Email configuration

Global outbound-mail settings for everything Vahini sends. Today that is one
thing: a notification when a visitor submits feedback through the site widget.

```
config/email/
  email.config.json                  committed defaults, never secret
  email.config.local.example.json    template for a per-host override
  email.config.local.json            your override, gitignored
  README.md                          this file
```

Consumed by `services/persist-api/lib/email-config.js`; the sender lives in
`lib/mailer.js` and the message shape in `lib/feedback-email.js`.

## Where each value comes from

Three layers, later wins:

1. `email.config.json` — committed defaults
2. `email.config.local.json` — per-host override, deep-merged, optional
3. environment variables

**Credentials are environment-only by construction.** There is no config key
that holds a password, so a committed file cannot leak one.

| Variable | Overrides |
|---|---|
| `VAHINI_SMTP_USER` | SMTP username (the full Gmail address) |
| `VAHINI_SMTP_PASS` | SMTP password — for Gmail, a 16-character **App Password** |
| `VAHINI_EMAIL_TRANSPORT` | `transport` (`smtp`, `sendmail`, `log`) |
| `VAHINI_SMTP_HOST` / `_PORT` / `_SECURE` / `_REQUIRE_TLS` | the `smtp` block |
| `VAHINI_SENDMAIL_PATH` | `sendmail.path` |
| `VAHINI_EMAIL_FROM` / `_ENVELOPE_FROM` | the `identity` block |
| `VAHINI_FEEDBACK_EMAIL_ENABLED` | `notifications.feedback.enabled` |
| `VAHINI_FEEDBACK_EMAIL_TO` | recipients, comma-separated |
| `VAHINI_FEEDBACK_EMAIL_MAX_PER_HOUR` | the hourly send cap |
| `VAHINI_EMAIL_CONFIG_DIR` | where to read this folder from (default `/config/email`) |

Booleans need an explicit `1`/`true`/`yes`/`on`. Anything else, including an
empty value, reads as false — an unset variable must never enable sending.

Arrays **replace** rather than merge. A `to` list in an override file is the
whole list, so a recipient can be removed and not just added.

## Gmail setup (vahinitechfirm@gmail.com)

### 1. App Password

Gmail rejects the account password for SMTP. You need an App Password, which
requires 2-Step Verification on the account first.

1. Google Account → Security → turn on **2-Step Verification**
2. Google Account → Security → **App passwords**
3. Generate one, name it `vahini-persist-api`
4. Copy the 16 characters. Google shows it once.

Spaces in the displayed value are cosmetic; store it with or without, both work.

### 2. Put the secret on the host, outside the repo

```bash
sudo -u vishnu tee /home/vishnu/vahini-mail.env >/dev/null <<'EOF'
VAHINI_SMTP_USER=vahinitechfirm@gmail.com
VAHINI_SMTP_PASS=xxxxxxxxxxxxxxxx
VAHINI_FEEDBACK_EMAIL_ENABLED=1
VAHINI_FEEDBACK_EMAIL_TO=info@vahinitech.com,vishnu.kosuri@vahinitech.com
EOF
chmod 600 /home/vishnu/vahini-mail.env
```

`deploy/docker-compose.prod.yml` loads this file into the persist container.
It is listed as required, so a missing file fails the deploy rather than
bringing the stack up with notifications quietly off.

### 3. Verify before trusting it

```bash
cd /path/to/web-live
env $(grep -v '^#' /home/vishnu/vahini-mail.env | xargs) \
  VAHINI_EMAIL_CONFIG_DIR=./config/email \
  node tools/send-test-email.mjs --check          # authenticates, sends nothing
```

Then a real one:

```bash
... node tools/send-test-email.mjs --to you@example.com
... node tools/send-test-email.mjs --sample       # a synthetic feedback notification
```

| Symptom | Cause |
|---|---|
| `535-5.7.8 Username and Password not accepted` | account password instead of an App Password, or 2SV off |
| `ETIMEDOUT` on connect | host firewall blocks outbound 587; try 465 with `secure: true` |
| self-signed certificate | traffic is being intercepted. Do not disable TLS to work around it |
| Sends, never arrives | check Gmail's Sent folder: present means delivery/spam, absent means the send never happened |

### 4. Sending identity

The `From` must be the authenticated account, or an alias verified in Gmail
under Settings → Accounts → **Send mail as**. Gmail rewrites or refuses
anything else, so pointing `identity.from` at `noreply@vahinitech.com` without
verifying that alias first would either silently change the visible sender or
fail the send outright.

Mail therefore leaves as `vahinitechfirm@gmail.com`. Sending as
`@vahinitech.com` needs either a verified Gmail alias or Google Workspace on
the domain. Since these notifications go to your own inbox rather than to
customers, the gmail.com sender costs nothing today; it would matter if this
ever sent visitor-facing mail.

### DNS

Nothing to change. The domain's DNS is Cloudflare-hosted (registrar GoDaddy),
but mail sent through Gmail's servers as a `@gmail.com` address is covered by
Google's own SPF and DKIM. SPF/DKIM/DMARC records on `vahinitech.com` only
become relevant if you later send **as** `@vahinitech.com`.

### POP

`email.config.json` records `pop.gmail.com:995` for reference only. The
persist API sends mail and never reads it, so nothing in the codebase uses
that block — it is there so the mailbox's settings live in one place for
whoever sets up a desktop or phone client. POP has to be enabled first in
Gmail under Settings → Forwarding and POP/IMAP.

### Limits

A free Gmail account has a daily sending cap in the hundreds of messages. Far
above real feedback volume, but the reason `maxPerHour` exists: a burst, or
someone hammering the endpoint, must not spend the day's quota. Suppressed
notifications are counted and reported in the next message that gets through,
so a gap is visible rather than silent.

## Transports

| `transport` | Behaviour |
|---|---|
| `smtp` | Authenticated submission. The default, and what prod uses. |
| `sendmail` | Pipes to a local binary. The persist API runs in a container, so the binary must exist **inside the image** — the host's `mail` is not reachable from it. |
| `log` | Composes and logs a one-line summary, delivers nothing. Used by the local stack and the tests. |

## Turning notifications off

Any one of these:

- `VAHINI_FEEDBACK_EMAIL_ENABLED=0` in the env file, then restart the container
- `notifications.feedback.enabled: false` in `email.config.local.json`
- remove the credentials — the service logs `mail: disabled` and keeps serving

Feedback is always written to disk first and the visitor is answered before any
send is attempted, so mail being off, misconfigured or down never affects the
feedback form.

## What ends up in the mailbox

With the shipped defaults (`includeFullRecord: true`, `attachRecordJson: true`)
each notification carries the complete stored record: the visitor's name,
email, message, IP address and the behavioural profile the insights widget
collects, both inline and as a `.json` attachment.

That means the notification mailbox holds the same personal data the persist
volume does. Whatever retention applies to `/home/vishnu/feedback` should
apply to the mailbox too, and forwarding one of these mails forwards all of
it. To reduce what is sent without turning notifications off, set
`includeFullRecord: false` (summary only, no IP or profile) and/or
`attachRecordJson: false`.
