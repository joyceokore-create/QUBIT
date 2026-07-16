# QUBIT — production image (Next.js 15 standalone + Prisma).
# Multi-stage: install deps → build (with `prisma generate`) → lean runner that runs
# `prisma migrate deploy` at startup, then serves the standalone server.

# ── 1. Dependencies ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN corepack enable && pnpm install --frozen-lockfile

# ── 2. Build ─────────────────────────────────────────────────────────────────--
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client must be generated before the Next build (server code imports it).
RUN corepack enable && pnpm prisma generate && pnpm build

# ── 3. Runner ────────────────────────────────────────────────────────────────--
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user.
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# Standalone server + static assets + public dir.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma schema + migrations, plus the FULL node_modules so the Prisma CLI can run
# `prisma migrate deploy` (schema + RLS policies) at startup. The Next standalone trace
# bundles the app's runtime deps but omits the CLI's own deps (e.g. @prisma/config →
# effect), so we copy node_modules wholesale over the standalone one.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY docker/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
