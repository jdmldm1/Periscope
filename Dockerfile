FROM node:22-alpine AS builder

WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend ./frontend
RUN cd frontend && npm run build

FROM node:22-alpine

ARG CACHE_GRYPE_DB=true

WORKDIR /app
COPY package*.json ./
RUN npm install --production && npm cache clean --force

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
    curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin && \
    if [ "$CACHE_GRYPE_DB" = "true" ]; then \
        GRYPE_DB_CACHE_DIR=/app/.cache/grype grype db update && \
        zstd -T0 -q --rm /app/.cache/grype/*/vulnerability.db; \
    fi

COPY server.js ./
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 3001
CMD ["node", "server.js"]
