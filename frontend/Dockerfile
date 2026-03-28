# Dockerfile — AITOP Frontend (Next.js 16 standalone)
#
# Build: docker build -t aitop/frontend:0.9.0-rc.1 ./frontend
# Run:   docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://collection-server:8080/api/v1 aitop/frontend:0.9.0-rc.1

# ── Stage 1: deps ─────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# ── Stage 2: build ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: runtime ──────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public        ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

LABEL org.opencontainers.image.title="AITOP Frontend" \
      org.opencontainers.image.description="AI Service Monitoring Platform — Next.js UI" \
      org.opencontainers.image.vendor="AITOP" \
      org.opencontainers.image.version="0.9.0-rc.1"

CMD ["node", "server.js"]
