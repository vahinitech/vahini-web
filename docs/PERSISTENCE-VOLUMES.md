<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Persistence Volumes (Uploads, Reports, Feedback, Insights)

This setup stores analyser artifacts on host-mounted folders so data survives container restarts.

## Host folders

- Upload images: `/home/vishnu/uploads`
- Generated reports: `/home/vishnu/reports`
- Feedback/lead records: `/home/vishnu/feedback`
- Pageview/telemetry stream: `/home/vishnu/insights`

## Services

A new internal service `persist` runs at `persist:8090` inside Docker.

Nginx routes:

- `POST /persist/upload-image`
- `POST /persist/generated-report`
- `POST /persist/feedback`
- `GET /persist/health`

## What gets saved

1. Uploaded image

- Binary image file + metadata JSON are written to `/home/vishnu/uploads`.

2. Generated report

- Report snapshot JSON and HTML are written to `/home/vishnu/reports`.

3. Feedback and PDF lead

- Individual JSON files + daily NDJSON stream are written to `/home/vishnu/feedback`.
- Only real feedback-widget submissions (`kind: "feedback"`, or posts without
  a `kind`) get an individual file here.

4. Pageview telemetry

- Pageviews (`kind: "pageview"` from `site/js/vahini-insights.js`) go to the
  same `POST /persist/feedback` endpoint but are appended to a daily
  `insights-YYYY-MM-DD.ndjson` in `/home/vishnu/insights`, one line per view,
  never a file per event.

## Deploy

```bash
cd /home/vishnu/web-live
mkdir -p /home/vishnu/uploads /home/vishnu/reports /home/vishnu/feedback /home/vishnu/insights
./deploy/release.sh stage
```

## Verify

```bash
curl -s http://127.0.0.1:3016/persist/health
```

After using the analyser once (upload + generate report + print/report lead):

```bash
ls -la /home/vishnu/uploads | tail -n 5
ls -la /home/vishnu/reports | tail -n 5
ls -la /home/vishnu/feedback | tail -n 10
ls -la /home/vishnu/insights | tail -n 5
```
