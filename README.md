# Vahini — Website (internal)

**Proprietary © 2026 Vahini Technologies. All rights reserved.** See [LICENSE](LICENSE).

This is the **private** repository for the Vahini marketing website, the investor
materials, the blog, and the printable deliverables. It is not for public
distribution.

> The 20-factor analyser engine is **open source** under the GNU AGPL-3.0 and
> lives in its own public repository:
> **https://github.com/vahinitech/20factor-analyser**
> The `analyser/` folder here is a copy used to serve the live app; it is
> licensed under AGPL-3.0 (see [analyser/LICENSE](analyser/LICENSE)).

---

## Repository structure

```
site/         marketing website + blog (static; deploy this folder)
analyser/     copy of the open-source 20-factor app (AGPL-3.0), served at /analyser
deploy/       nginx vhosts + release scripts
docs/         architecture, build, CV/OCR notes, blog guide
docker-compose.yml   local full stack (web + analyser OCR + persist)
```

Scratch/PII folders (`uploads/`, `samples/`, `archive/`, `screenshots/`) and
`.claude/` are git-ignored and never ship.

---

## Run it

```bash
# Whole site + analyser + OCR, locally:
docker compose up -d --wait
# http://localhost:8080                                   -> marketing site
# http://localhost:8080/analyser/Vahini%20Analyser.html   -> the analyser

# Or just open the static site without a build:
#   site/index.html
```

### Staging / production

See `docs/DEPLOY-STAG-PROD.md`. Host nginx vhost templates live in `deploy/`.

---

## Change the website colour theme

1. Open `site/theme.config.js`.
2. Set `ACTIVE_THEME` to one of: `"space-teal"` (default), `"midnight-indigo"`,
   `"forest-emerald"`, `"ember-charcoal"`.
3. Reload.

Colours live only in `site/theme.css`.

---

## Contact

- Website: [vahinitech.com](https://vahinitech.com)
- General: info@vahinitech.com · Founder: vahinitechfirm@gmail.com
- Vahini Dual-IMU Sensor Pen: Indian Patent No. 584433, DPIIT-recognised

© 2026 Vahini Technologies.
