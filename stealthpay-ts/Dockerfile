# StealthPay TypeScript SDK Production Image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source
COPY src/ ./src/

# Build
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S stealthpay && \
    adduser -S stealthpay -u 1001

# Copy built application
COPY --from=builder --chown=stealthpay:stealthpay /app/dist ./dist
COPY --from=builder --chown=stealthpay:stealthpay /app/node_modules ./node_modules
COPY --from=builder --chown=stealthpay:stealthpay /app/package*.json ./

USER stealthpay

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const {StealthPay} = require('./dist/index'); console.log('OK')" || exit 1

# Labels
LABEL maintainer="dev@stealthpay.io" \
      version="0.1.0" \
      description="Anonymous payments SDK for AI Agents (TypeScript)"

CMD ["node", "-e", "console.log('StealthPay TS SDK v0.1.0 - Ready for import: const {StealthPay} = require(\\'@stealthpay/sdk\\')')"]
