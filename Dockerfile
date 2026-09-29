FROM node:22-alpine AS builder

WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend ./frontend
RUN cd frontend && npm run build

FROM node:22-alpine

ARG CACHE_GRYPE_DB=true
ARG GRYPE_VERSION=v0.117.0
ARG ZARF_VERSION=v0.83.0
ARG KUBECTL_VERSION=v1.36.3
ARG AIRGAP=false
ARG AIRGAP_LITE=false
ARG SCANNING_ENABLED=true

WORKDIR /app
RUN npm install -g npm@12.0.2
COPY package*.json ./
RUN npm ci --omit=dev && npm audit fix --force && npm cache clean --force

RUN apk update && apk upgrade && apk add --no-cache curl ca-certificates zstd util-linux tcpdump libcap nano

ENV ZARF_VERSION=${ZARF_VERSION} \
    KUBECTL_VERSION=${KUBECTL_VERSION} \
    GRYPE_VERSION=${GRYPE_VERSION} \
    AIRGAP=${AIRGAP} \
    AIRGAP_LITE=${AIRGAP_LITE} \
    SCANNING_ENABLED=${SCANNING_ENABLED} \
    BIN_DIR=/app/bin \
    PATH="/app/bin:${PATH}"

RUN mkdir -p /app/.cache /app/bin
COPY docker/bin-bootstrap.sh /app/bin-bootstrap.sh
RUN chmod +x /app/bin-bootstrap.sh

RUN if [ "$AIRGAP" = "true" ]; then \
        if [ "$AIRGAP_LITE" = "true" ] || [ "$SCANNING_ENABLED" = "false" ]; then \
            SCANNING_ENABLED=false /app/bin-bootstrap.sh; \
        else \
            /app/bin-bootstrap.sh && \
            grype version && \
            if [ "$CACHE_GRYPE_DB" = "true" ]; then \
                GRYPE_DB_CACHE_DIR=/app/.cache/grype grype db update && \
                zstd -T0 -q --rm /app/.cache/grype/*/vulnerability.db; \
            fi; \
        fi; \
    fi

RUN setcap cap_net_raw+ep "$(command -v tcpdump)" && getcap "$(command -v tcpdump)"

RUN if [ "$AIRGAP" = "true" ]; then \
        ARCH=$(uname -m) && \
        if [ "$ARCH" = "x86_64" ]; then ORAS_ARCH="amd64"; else ORAS_ARCH="arm64"; fi && \
        curl -sSL "https://github.com/oras-project/oras/releases/download/v1.3.3/oras_1.3.3_linux_${ORAS_ARCH}.tar.gz" -o oras.tar.gz && \
        tar -zxf oras.tar.gz -C /app/bin oras && \
        rm -f oras.tar.gz && \
        oras version; \
    fi

COPY server.js ./
COPY src/ ./src/
COPY --from=builder /app/frontend/dist ./frontend/dist

RUN chown -R node:node /app/.cache /app/bin
USER node

EXPOSE 3001
CMD ["/bin/sh", "-c", "/app/bin-bootstrap.sh && exec node server.js"]
