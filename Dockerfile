FROM node:22-slim

# Install build tools for native addons (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all dependencies (including dev deps for web build)
COPY package.json package-lock.json ./
COPY packages/ ./packages/
RUN npm ci

# Copy source code
COPY . .

# Build web frontend
RUN npm run build:web
RUN npm prune --omit=dev

# Remove build-only npm cache and tmp files
RUN npm cache clean --force

EXPOSE 3000

ENV HANA_HOST=0.0.0.0
ENV HANA_PORT=3000
ENV HANA_SERVE_WEB=1
ENV HANA_HOME=/data

VOLUME ["/data"]

CMD ["node", "server/index.js"]
