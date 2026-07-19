# Production image for AirSync (used by Railway — see railway.json).
# Node 22 to match the engines range in package.json.
FROM node:22-alpine
# Prisma needs openssl on alpine.
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force
# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
RUN npm remove @shopify/cli

COPY . .

# Production runs on PostgreSQL: swap in the postgres schema so every prisma
# command inside the container (generate, db push) uses it.
RUN cp prisma/schema.production.prisma prisma/schema.prisma

RUN npm run build

# docker-start: prisma generate + db push (creates/updates tables), then serve.
CMD ["npm", "run", "docker-start"]
