# Single-service image: runs the Express API with the Discord bot client
# started inline in the same process (RUN_BOT_INLINE, default true) — the
# practical shape for a 512MB free-tier host that only gives you one service.
FROM node:20-alpine AS base
WORKDIR /app

# Prisma's schema engine needs OpenSSL, which alpine doesn't ship by default.
RUN apk add --no-cache openssl

# Install dependencies for the whole workspace first (better layer caching)
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/bot/package.json apps/bot/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

# Now copy the rest of the source
COPY . .

RUN npm run db:generate

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["npm", "run", "start"]
