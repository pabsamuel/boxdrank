# Hosted LIGHTGUN: display, phone controller and the relay in one container.
# The platform terminates TLS and passes PORT, which is what lets the phone
# run motion tracking without a self-signed certificate.
FROM node:22-alpine

WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server ./server
COPY shared ./shared
COPY display ./display
COPY phone ./phone
COPY tools ./tools

ENV NODE_ENV=production
EXPOSE 8080

# The platform's own health check hits /healthz.
CMD ["node", "server/server.js"]
