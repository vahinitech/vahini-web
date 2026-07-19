# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
#
# Bullet-journal PDF print service. bujo.js is pulled from GitHub at build
# time (see services/bujo-pdf/package.json for the pinned ref; override
# with --build-arg BUJO_REF=<branch|tag|sha> to test another revision).
FROM node:20-alpine

WORKDIR /app
COPY services/bujo-pdf/package.json /app/package.json

# git is only needed while npm fetches the GitHub-hosted dependency, so it
# is installed and removed inside the same layer to keep it (and its
# apk metadata) out of the runtime image.
ARG BUJO_REF=""
RUN apk add --no-cache git \
 && npm install --omit=dev --no-audit --no-fund \
 && if [ -n "$BUJO_REF" ]; then \
        npm install --no-save --no-audit --no-fund "github:vahinitech/bujo.js#${BUJO_REF}"; \
    fi \
 && npm cache clean --force \
 && apk del git

COPY services/bujo-pdf/server.js /app/server.js

ENV NODE_ENV=production
ENV PORT=8091

EXPOSE 8091
CMD ["node", "server.js"]
