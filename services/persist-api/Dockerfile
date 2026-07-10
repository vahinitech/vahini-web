# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
FROM node:20-alpine

WORKDIR /app
COPY services/persist-api/server.js /app/server.js
COPY services/persist-api/lib /app/lib

ENV NODE_ENV=production
ENV PORT=8090

EXPOSE 8090
CMD ["node", "server.js"]
