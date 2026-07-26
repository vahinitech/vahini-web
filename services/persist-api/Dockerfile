# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
FROM node:20-alpine

WORKDIR /app

# Dependencies first, in their own layer: server.js changes on nearly every
# deploy and package-lock.json almost never, so the install stays cached.
# `npm ci` rather than `npm install` so a build can only ever use the locked
# tree. The only runtime dependency is nodemailer, which has none of its own.
COPY services/persist-api/package.json services/persist-api/package-lock.json /app/
RUN npm ci --omit=dev && npm cache clean --force

COPY services/persist-api/server.js /app/server.js
COPY services/persist-api/lib /app/lib

# Committed email defaults. Host-specific values come from environment
# variables, or from an email.config.local.json mounted over this directory.
# See config/email/README.md.
COPY config/email /config/email

ENV NODE_ENV=production
ENV PORT=8090

EXPOSE 8090
CMD ["node", "server.js"]
