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

# ------------------------------------------------ site-only dev loop
.PHONY: site
site: ## static site only on :4173, no docker (front-end quick loop)
	npx http-server . -p 4173 -c-1

.PHONY: test
test: ## node test suite (static smoke + playwright e2e)
	npm test
	npm run test:e2e

# ------------------------------------------- deploy (run on the server)
.PHONY: release-stag release-prod prewarm-stag prewarm-prod
release-stag: ## build + roll out the staging stack (deploy/release.sh stag)
	./deploy/release.sh stag
release-prod: ## build + roll out the production stack (deploy/release.sh prod)
	./deploy/release.sh prod
prewarm-stag: ## pre-download OCR models into the staging volume
	./deploy/prewarm-models.sh stag
prewarm-prod: ## pre-download OCR models into the production volume
	./deploy/prewarm-models.sh prod

# ---------------------------------------- certificates (host-level, sudo)
.PHONY: certbot-setup certbot-hook certbot-check
certbot-setup: ## one-time: issue the wildcard cert (DNS-01 via Cloudflare)
	sudo ./deploy/certbot/setup-wildcard-cert.sh
certbot-hook: ## one-time: install the nginx-reload deploy hook
	sudo ./deploy/certbot/install-renew-hook.sh
certbot-check: ## verify the auto-renew timer + hook are in place
	sudo ./deploy/certbot/check-renew-timer.sh
