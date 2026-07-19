# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
#
# Bullet-journal PDF print service. bujo.js is pulled from GitHub at build
# time (see services/bujo-pdf/package.json for the pinned ref; override
# with --build-arg BUJO_REF=<branch|tag|sha> to test another revision).
FROM node:20-alpine

# npm needs git to install GitHub-hosted dependencies.
RUN apk add --no-cache git

WORKDIR /app
COPY services/bujo-pdf/package.json /app/package.json

ARG BUJO_REF=""
RUN npm install --omit=dev --no-audit --no-fund \
 && if [ -n "$BUJO_REF" ]; then \
        npm install --no-save --no-audit --no-fund "github:vahinitech/bujo.js#${BUJO_REF}"; \
    fi \
 && npm cache clean --force

COPY services/bujo-pdf/server.js /app/server.js

ENV NODE_ENV=production
ENV PORT=8091

EXPOSE 8091
CMD ["node", "server.js"]
