FROM node:20-alpine

WORKDIR /app
COPY services/persist-api/server.js /app/server.js

ENV NODE_ENV=production
ENV PORT=8090

EXPOSE 8090
CMD ["node", "server.js"]
