FROM node:22-alpine AS builder

WORKDIR /app
COPY frontend/package*.json ./frontend/
# npm ci installs exactly what the lockfile pins (reproducible, tamper-evident).
RUN cd frontend && npm ci

COPY frontend ./frontend
RUN cd frontend && npm run build

FROM node:22-alpine

ARG CACHE_GRYPE_DB=true
# Pin the Grype version (and its installer) instead of curling the install
# script off the moving `main` branch — closes a supply-chain hole where an
# upstream change to main could alter what gets baked into the image.
ARG GRYPE_VERSION=v0.74.0

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Install curl/ca-certificates, Zarf v0.75.1, kubectl, zstd, util-linux (for PTY script tool), and tcpdump (for network sniffer)
RUN apk add --no-cache curl ca-certificates zstd util-linux tcpdump && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then ZARF_ARCH="amd64"; else ZARF_ARCH="arm64"; fi && \
    curl -sL "https://github.com/zarf-dev/zarf/releases/download/v0.75.1/zarf_v0.75.1_Linux_${ZARF_ARCH}" -o /usr/local/bin/zarf && \
    chmod +x /usr/local/bin/zarf && \
    curl -sL "https://dl.k8s.io/release/v1.30.0/bin/linux/${ZARF_ARCH}/kubectl" -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl && \
    printf '#!/bin/sh\nexec zarf tools helm "$@"\n' > /usr/local/bin/helm && \
    chmod +x /usr/local/bin/helm && \
    curl -sSfL "https://raw.githubusercontent.com/anchore/grype/${GRYPE_VERSION}/install.sh" | sh -s -- -b /usr/local/bin "${GRYPE_VERSION}" && \
    grype version && \
    if [ "$CACHE_GRYPE_DB" = "true" ]; then \
        GRYPE_DB_CACHE_DIR=/app/.cache/grype grype db update && \
        zstd -T0 -q --rm /app/.cache/grype/*/vulnerability.db; \
    fi

COPY server.js ./
COPY src/ ./src/
COPY --from=builder /app/frontend/dist ./frontend/dist

# Drop root: run as the unprivileged `node` user that the base image ships with.
# The runtime needs to write the Grype DB cache and download kubescape, so those
# directories are created and handed to `node` before we switch users.
RUN mkdir -p /app/.cache /app/bin && chown -R node:node /app
USER node

EXPOSE 3001
CMD ["node", "server.js"]
