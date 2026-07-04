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
ARG ZARF_VERSION=v0.75.1
ARG KUBECTL_VERSION=v1.30.0
# Airgap builds bake zarf/kubectl/grype into the image (no network at
# runtime). Connected builds skip that and let bin-bootstrap.sh fetch them on
# first container boot instead — trades ~280MB of pulled image size for a
# one-time download when the pod starts (same trade-off ORAS/Kubescape
# already make today).
ARG AIRGAP=false

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# curl/ca-certificates (also used at runtime by ORAS/bin-bootstrap downloads),
# zstd (Grype DB decompression), util-linux (PTY script tool), tcpdump
# (network sniffer), libcap (setcap, below).
RUN apk add --no-cache curl ca-certificates zstd util-linux tcpdump libcap

ENV ZARF_VERSION=${ZARF_VERSION} \
    KUBECTL_VERSION=${KUBECTL_VERSION} \
    GRYPE_VERSION=${GRYPE_VERSION} \
    BIN_DIR=/app/bin \
    PATH="/app/bin:${PATH}"

RUN mkdir -p /app/.cache /app/bin
COPY docker/bin-bootstrap.sh /app/bin-bootstrap.sh
RUN chmod +x /app/bin-bootstrap.sh

RUN if [ "$AIRGAP" = "true" ]; then \
        /app/bin-bootstrap.sh && \
        grype version && \
        if [ "$CACHE_GRYPE_DB" = "true" ]; then \
            GRYPE_DB_CACHE_DIR=/app/.cache/grype grype db update && \
            zstd -T0 -q --rm /app/.cache/grype/*/vulnerability.db; \
        fi; \
    fi

# Grant CAP_NET_RAW to the tcpdump binary (a file capability) so the Traffic
# Inspector can capture packets as the non-root user. At runtime the pod must
# also carry NET_RAW and allow privilege escalation (so no_new_privs doesn't
# suppress the file capability) — see the chart's containerSecurityContext.
RUN setcap cap_net_raw+ep "$(command -v tcpdump)" && getcap "$(command -v tcpdump)"

# Install ORAS conditionally if building the airgapped image
RUN if [ "$AIRGAP" = "true" ]; then \
        ARCH=$(uname -m) && \
        if [ "$ARCH" = "x86_64" ]; then ORAS_ARCH="amd64"; else ORAS_ARCH="arm64"; fi && \
        curl -sSL "https://github.com/oras-project/oras/releases/download/v1.2.0/oras_1.2.0_linux_${ORAS_ARCH}.tar.gz" -o oras.tar.gz && \
        tar -zxf oras.tar.gz -C /app/bin oras && \
        rm -f oras.tar.gz && \
        oras version; \
    fi

COPY server.js ./
COPY src/ ./src/
COPY --from=builder /app/frontend/dist ./frontend/dist

# Drop root: run as the unprivileged `node` user that the base image ships with.
# Only .cache (Grype DB) and bin (zarf/kubectl/grype/ORAS/Kubescape, baked in
# or downloaded on first boot) need to be node-writable — chowning the whole
# /app tree would make BuildKit duplicate the node_modules layer (~80MB) just
# to relabel ownership on files nothing ever writes to.
RUN chown -R node:node /app/.cache /app/bin
USER node

EXPOSE 3001
CMD ["/bin/sh", "-c", "/app/bin-bootstrap.sh && exec node server.js"]
