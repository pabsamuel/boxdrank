# Two stages: the client is built with dev dependencies present, the runtime
# image carries neither them nor the toolchain. Smaller image, and a smaller
# thing to answer for in a security review.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./

# The SQLite file lives on a mounted volume, not in the image layer. An image
# that carries customer install tokens is an image nobody can safely push.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]
ENV DATABASE_FILE=/data/template-guard.db

# Never root. A container escape should not start with a privileged process.
USER node

EXPOSE 8302
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8302/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "src/server/index.ts"]
