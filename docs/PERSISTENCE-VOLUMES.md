<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Persistence Volumes (Uploads, Reports, Feedback, Insights)

This setup stores analyser artifacts on host-mounted folders so data survives container restarts.

## Host folders

All host folders live under `$VAHINI_DATA_ROOT`, which defaults to the
deploying user's home directory. `deploy/release.sh` exports it and creates
the folders; set it before running compose directly if you want another root.

- Upload images: `$VAHINI_DATA_ROOT/uploads`
- Generated reports: `$VAHINI_DATA_ROOT/reports`
- Feedback/lead records: `$VAHINI_DATA_ROOT/feedback`
- Pageview/telemetry stream: `$VAHINI_DATA_ROOT/insights`

## Services

A new internal service `persist` runs at `persist:8090` inside Docker.

Nginx routes:

- `POST /persist/upload-image`
- `POST /persist/generated-report`
- `POST /persist/feedback`
- `GET /persist/health`

## What gets saved

1. Uploaded image

- Binary image file + metadata JSON are written to `$VAHINI_DATA_ROOT/uploads`.

2. Generated report

- Report snapshot JSON and HTML are written to `$VAHINI_DATA_ROOT/reports`.

3. Feedback and PDF lead

- Individual JSON files + daily NDJSON stream are written to
  `$VAHINI_DATA_ROOT/feedback`.
- Only real feedback-widget submissions (`kind: "feedback"`, or posts without
  a `kind`) get an individual file here.

4. Pageview telemetry

- Pageviews (`kind: "pageview"` from `site/js/vahini-insights.js`) go to the
  same `POST /persist/feedback` endpoint but are appended to a daily
  `insights-YYYY-MM-DD.ndjson` in `$VAHINI_DATA_ROOT/insights`, one line per
  view, never a file per event.

## Deploy

`release.sh` creates the host folders itself, so this is just:

```bash
cd ~/vahini-web
./deploy/release.sh stage
```

## Verify

```bash
curl -s http://127.0.0.1:3016/persist/health
```

After using the analyser once (upload + generate report + print/report lead):

```bash
ls -la "${VAHINI_DATA_ROOT:-$HOME}/uploads" | tail -n 5
ls -la "${VAHINI_DATA_ROOT:-$HOME}/reports" | tail -n 5
ls -la "${VAHINI_DATA_ROOT:-$HOME}/feedback" | tail -n 10
ls -la "${VAHINI_DATA_ROOT:-$HOME}/insights" | tail -n 5
```
