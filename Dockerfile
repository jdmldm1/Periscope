FROM node:22-alpine AS builder

WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend ./frontend
RUN cd frontend && npm run build

FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production

# Install curl/ca-certificates, Zarf v0.75.1, and kubectl
RUN apk add --no-cache curl ca-certificates && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then ZARF_ARCH="amd64"; else ZARF_ARCH="arm64"; fi && \
    curl -sL "https://github.com/zarf-dev/zarf/releases/download/v0.75.1/zarf_v0.75.1_Linux_${ZARF_ARCH}" -o /usr/local/bin/zarf && \
    chmod +x /usr/local/bin/zarf && \
    curl -sL "https://dl.k8s.io/release/v1.30.0/bin/linux/${ZARF_ARCH}/kubectl" -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl && \
    printf '#!/bin/sh\nexec zarf tools helm "$@"\n' > /usr/local/bin/helm && \
    chmod +x /usr/local/bin/helm && \
    curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin && \
    grype db update

COPY server.js ./
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 3001
CMD ["node", "server.js"]
