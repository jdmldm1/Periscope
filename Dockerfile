FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM alpine:3.24

ARG CACHE_GRYPE_DB=true
ARG GRYPE_VERSION=v0.117.0
ARG ZARF_VERSION=v0.83.0
ARG KUBECTL_VERSION=v1.36.3
ARG ORAS_VERSION=1.3.3
ARG AIRGAP=false
ARG AIRGAP_LITE=false
ARG SCANNING_ENABLED=true

SHELL ["/bin/ash", "-eo", "pipefail", "-c"]

WORKDIR /app

RUN addgroup -g 1000 -S node && \
    adduser -u 1000 -S node -G node -h /home/node -s /bin/sh && \
    apk upgrade --no-cache && \
    apk add --no-cache nodejs curl ca-certificates zstd util-linux-misc tcpdump libcap nano && \
    setcap cap_net_raw+ep "$(command -v tcpdump)" && \
    getcap "$(command -v tcpdump)" && \
    mkdir -p /app/.cache /app/bin && \
    chown -R node:node /app

ENV NODE_ENV=production \
    ZARF_VERSION=${ZARF_VERSION} \
    KUBECTL_VERSION=${KUBECTL_VERSION} \
    GRYPE_VERSION=${GRYPE_VERSION} \
    AIRGAP=${AIRGAP} \
    AIRGAP_LITE=${AIRGAP_LITE} \
    SCANNING_ENABLED=${SCANNING_ENABLED} \
    BIN_DIR=/app/bin \
    PATH="/app/bin:${PATH}"

COPY --chown=node:node docker/bin-bootstrap.sh /app/bin-bootstrap.sh
RUN chmod +x /app/bin-bootstrap.sh

USER 1000:1000

RUN if [ "$AIRGAP" = "true" ]; then \
        if [ "$AIRGAP_LITE" = "true" ] || [ "$SCANNING_ENABLED" = "false" ]; then \
            SCANNING_ENABLED=false /app/bin-bootstrap.sh; \
        else \
            /app/bin-bootstrap.sh && \
            grype version && \
            if [ "$CACHE_GRYPE_DB" = "true" ]; then \
                GRYPE_DB_CACHE_DIR=/app/.cache/grype grype db update && \
                zstd -6 --long=27 -T0 -q --rm /app/.cache/grype/*/vulnerability.db && \
                rm -rf /tmp/* /app/.cache/grype/*/*.tar.*; \
            fi; \
        fi && \
        ARCH=$(uname -m) && \
        if [ "$ARCH" = "x86_64" ]; then ORAS_ARCH="amd64"; else ORAS_ARCH="arm64"; fi && \
        ORAS_TGZ="oras_${ORAS_VERSION}_linux_${ORAS_ARCH}.tar.gz" && \
        ORAS_URL="https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}" && \
        curl -fsSL "${ORAS_URL}/${ORAS_TGZ}" -o "/tmp/${ORAS_TGZ}" && \
        ORAS_SHA=$(curl -fsSL "${ORAS_URL}/oras_${ORAS_VERSION}_checksums.txt" | grep " ${ORAS_TGZ}\$" | cut -d' ' -f1) && \
        [ -n "${ORAS_SHA}" ] && \
        echo "${ORAS_SHA}  /tmp/${ORAS_TGZ}" | sha256sum -c - && \
        tar -zxf "/tmp/${ORAS_TGZ}" -C /app/bin oras && \
        rm -f "/tmp/${ORAS_TGZ}" && \
        oras version; \
    fi

WORKDIR /app
COPY --chown=node:node package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node server.js ./
COPY --chown=node:node src/ ./src/
COPY --from=builder --chown=node:node /app/frontend/dist ./frontend/dist

EXPOSE 3001
CMD ["/bin/sh", "-c", "/app/bin-bootstrap.sh && exec node server.js"]
