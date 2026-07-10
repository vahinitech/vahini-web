# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
#
# ============================================================
# Vahini — one command to run the whole stack, end to end.
#
#   make up        build + start every container (website, 20-factor
#                  analyser, persist) and wait until all are healthy
#   make smoke     hit every service through nginx to prove the wiring
#   make e2e       up + smoke in one shot
#   make down      stop everything
#
# The certbot targets wrap the host-level scripts in deploy/certbot/ —
# certificates are deliberately NOT a container: the renewal timer and
# nginx-reload hook live on the host (see docs/DEPLOY-STAG-PROD.md).
# ============================================================

COMPOSE      ?= docker compose
COMPOSE_FILE ?= docker-compose.yml
WEB_URL      ?= http://localhost:8080

# first analyser start downloads OCR models; give health checks real time
WAIT_TRIES   ?= 120
WAIT_DELAY   ?= 5

.DEFAULT_GOAL := help

# ---------------------------------------------------------------- help
.PHONY: help
help: ## show this help
	@echo "Vahini full-stack targets:"
	@awk 'BEGIN{FS=":.*## "} /^[a-zA-Z0-9_-]+:.*## /{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ------------------------------------------------- local full stack
.PHONY: submodule
submodule: ## init/sync the 20factor-analyser submodule (pinned revision)
	git submodule sync --recursive
	git submodule update --init --recursive
	@test -f analyser/deployment/Dockerfile || \
		{ echo "ERROR: analyser submodule missing analyser/deployment/Dockerfile"; exit 1; }
	@echo "analyser submodule OK ($$(git -C analyser rev-parse --short HEAD))"

.PHONY: build
build: submodule ## build all images (website, analyser, persist)
	$(COMPOSE) -f $(COMPOSE_FILE) build

.PHONY: up
up: submodule ## build + start ALL containers and wait until healthy
	$(COMPOSE) -f $(COMPOSE_FILE) up --build -d --remove-orphans
	@$(MAKE) --no-print-directory wait
	@echo ""
	@echo "Everything is up:"
	@echo "  website        $(WEB_URL)/site/index.html"
	@echo "  20-factor app  $(WEB_URL)/analyser/analyser.html"
	@echo "  OCR health     $(WEB_URL)/ocr/health"
	@echo "  persist health $(WEB_URL)/persist/health"

.PHONY: wait
wait: ## wait until web + analyser + persist answer through nginx
	@echo "waiting for the stack to become healthy (first run downloads OCR models, be patient)..."
	@ok=0; for i in $$(seq 1 $(WAIT_TRIES)); do \
		if curl -fsS -o /dev/null $(WEB_URL)/site/index.html \
		&& curl -fsS -o /dev/null $(WEB_URL)/persist/health \
		&& curl -fsS -o /dev/null $(WEB_URL)/ocr/health; then ok=1; break; fi; \
		printf "."; sleep $(WAIT_DELAY); \
	done; echo ""; \
	if [ "$$ok" != "1" ]; then \
		echo "stack did not become healthy in $$(( $(WAIT_TRIES) * $(WAIT_DELAY) ))s — recent logs:"; \
		$(COMPOSE) -f $(COMPOSE_FILE) ps; \
		$(COMPOSE) -f $(COMPOSE_FILE) logs --tail=40; \
		exit 1; \
	fi
	@echo "all services healthy"

.PHONY: smoke
smoke: ## curl every service through nginx (stack must be up)
	@set -e; \
	for path in /site/index.html /site/investor.html /site/developers.html \
	            /analyser/analyser.html /ocr/health /persist/health; do \
		code=$$(curl -s -o /dev/null -w "%{http_code}" $(WEB_URL)$$path); \
		echo "  $$code  $$path"; \
		[ "$$code" = "200" ] || { echo "SMOKE FAIL: $$path returned $$code"; exit 1; }; \
	done; \
	echo "smoke OK — full stack answers end to end"

.PHONY: e2e
e2e: up smoke ## full end-to-end: start everything, then prove it works

.PHONY: down
down: ## stop all containers (model cache volumes are kept)
	$(COMPOSE) -f $(COMPOSE_FILE) down --remove-orphans

.PHONY: restart
restart: down up ## stop, then rebuild + start everything

.PHONY: ps
ps: ## show container status + health
	$(COMPOSE) -f $(COMPOSE_FILE) ps

.PHONY: logs
logs: ## follow logs (all services, or one: make logs S=analyser)
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f --tail=100 $(S)

.PHONY: clean
clean: ## down + DELETE volumes (model cache, persisted uploads) + local images
	$(COMPOSE) -f $(COMPOSE_FILE) down -v --rmi local --remove-orphans

# ------------------------------------------------ docker housekeeping
.PHONY: docker-clean
docker-clean: ## stop the stack and remove its local images (volumes kept)
	$(COMPOSE) -f $(COMPOSE_FILE) down --rmi local --remove-orphans
	@echo "local stack images removed; model-cache/upload volumes kept"

.PHONY: docker-prune
docker-prune: ## remove EVERY vahini/* image (local+stag+prod) + dangling layers + build cache
	@imgs=$$(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep '^vahini/' || true); \
	if [ -n "$$imgs" ]; then \
		echo "removing vahini images:"; echo "$$imgs" | sed 's/^/  /'; \
		echo "$$imgs" | xargs docker rmi -f; \
	else echo "no vahini/* images found"; fi
	docker image prune -f
	docker builder prune -f
	@echo "vahini images, dangling layers and build cache pruned (volumes untouched)"

# ------------------------------------------------ site-only dev loop
.PHONY: site
site: ## static site only on :4173, no docker (front-end quick loop)
	npx http-server . -p 4173 -c-1

.PHONY: test
test: ## node test suite (static smoke + playwright e2e)
	npm test
	npm run test:e2e

.PHONY: security-test
security-test: ## abuse-resistance tests for the persist API + OCR input guard (rate limits, quotas, CORS, sizes, homoglyph/SSRF)
	node tests/security-abuse.test.mjs
	node tests/ocr-input-guard.test.mjs

.PHONY: security-scan
security-scan: ## external scan: open ports (nmap) + TLS grade (testssl.sh) of HOST (default vahinitech.com). Authorized targets only.
	tools/security-scan.sh $(or $(HOST),vahinitech.com) $(SCAN_ARGS)

# ------------------------------------------- deploy (run on the server)
# every file a deployment depends on; deploy-check asserts each one exists
DEPLOY_FILES := \
	Dockerfile docker-compose.yml \
	analyser/deployment/Dockerfile \
	services/persist-api/Dockerfile services/persist-api/Dockerfile.dockerignore \
	services/persist-api/server.js services/persist-api/lib/textguard.js \
	deploy/nginx.conf deploy/nginx-security.conf deploy/nginx-headers.inc \
	deploy/docker-compose.stag.yml deploy/docker-compose.prod.yml \
	deploy/release.sh deploy/prewarm-models.sh \
	deploy/vahinitech.com.nginx.conf deploy/stag.vahinitech.com.nginx.conf \
	deploy/api.vahinitech.com.nginx.conf deploy/analyser.vhost.nginx.conf \
	deploy/http-redirect.vahinitech.com.nginx.conf \
	deploy/snippets/tls-vahinitech.conf deploy/snippets/http-context-vahinitech.conf \
	deploy/certbot/setup-wildcard-cert.sh deploy/certbot/install-renew-hook.sh \
	deploy/certbot/reload-nginx-hook.sh deploy/certbot/check-renew-timer.sh \
	deploy/certbot/cloudflare-credentials.ini.example \
	tools/security-scan.sh \
	site/index.html site/js/site.js site/css/theme.css site/css/site.css

.PHONY: deploy-check
deploy-check: ## preflight: every deployment file present, scripts executable, compose valid
	@missing=0; \
	for f in $(DEPLOY_FILES); do \
		if [ ! -f "$$f" ]; then echo "  MISSING  $$f"; missing=$$((missing+1)); \
		else echo "  ok       $$f"; fi; \
	done; \
	for s in deploy/release.sh deploy/prewarm-models.sh deploy/certbot/*.sh; do \
		[ -x "$$s" ] || { echo "  NOT EXECUTABLE  $$s (fix: chmod +x $$s)"; missing=$$((missing+1)); }; \
	done; \
	if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then \
		for c in $(COMPOSE_FILE) deploy/docker-compose.stag.yml deploy/docker-compose.prod.yml; do \
			$(COMPOSE) -f $$c config -q && echo "  ok       $$c (compose config valid)" \
				|| { echo "  INVALID  $$c"; missing=$$((missing+1)); }; \
		done; \
	else echo "  (docker unavailable: skipped compose-config validation)"; fi; \
	if [ "$$missing" -gt 0 ]; then echo "deploy-check FAILED: $$missing problem(s)"; exit 1; fi; \
	echo "deploy-check OK: all deployment files present"

.PHONY: release-stag release-prod prewarm-stag prewarm-prod
release-stag: deploy-check ## build + roll out the staging stack (deploy/release.sh stag)
	./deploy/release.sh stag
release-prod: deploy-check ## build + roll out the production stack (deploy/release.sh prod)
	./deploy/release.sh prod
prewarm-stag: ## pre-download OCR models into the staging volume
	./deploy/prewarm-models.sh stag
prewarm-prod: ## pre-download OCR models into the production volume
	./deploy/prewarm-models.sh prod

# ---------------------------------------- certificates (host-level, sudo)
.PHONY: certbot-setup certbot-hook certbot-check cert-status cert-renew-dry cert-renew
certbot-setup: ## one-time: issue the wildcard cert (DNS-01 via Cloudflare)
	sudo ./deploy/certbot/setup-wildcard-cert.sh
certbot-hook: ## one-time: install the nginx-reload deploy hook
	sudo ./deploy/certbot/install-renew-hook.sh
certbot-check: ## verify the auto-renew timer + hook are in place
	sudo ./deploy/certbot/check-renew-timer.sh
cert-status: ## show every cert's domains + expiry, then verify the renew timer
	sudo certbot certificates
	@echo ""
	sudo ./deploy/certbot/check-renew-timer.sh
cert-renew-dry: ## rehearse renewal end-to-end (DNS-01 + hook), changes nothing
	sudo certbot renew --dry-run
cert-renew: ## renew the site certificates now (only certs within 30 days of expiry)
	sudo certbot renew
	@echo "renewed where due; nginx reloaded by the deploy hook. 'make cert-status' to confirm."
