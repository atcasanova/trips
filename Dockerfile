# ==========================================
# STAGE 1: Build Frontend (React + Vite)
# ==========================================
FROM node:20-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ==========================================
# STAGE 2: Build & Runtime Server
# ==========================================
FROM node:20-bookworm-slim AS runner

# Install system dependencies for Chromium / Puppeteer PDF generation and healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy server package definitions & install dependencies (including devDependencies for build)
COPY server/package*.json ./
RUN npm ci --include=dev

# Copy server source code and tsconfig
COPY server/tsconfig.json ./
COPY server/src ./src

# Compile TypeScript
RUN npm run build && mkdir -p dist/db/migrations && cp src/db/migrations/*.sql dist/db/migrations/

# Prune dev dependencies for production runtime
RUN npm prune --production

# Copy built frontend assets from client-builder into server/public
COPY --from=client-builder /app/server/public ./public

ENV NODE_ENV=production

# Ensure uploads directory exists
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "dist/index.js"]
