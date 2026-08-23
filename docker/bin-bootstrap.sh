#!/bin/sh
set -e

BIN_DIR="${BIN_DIR:-/app/bin}"
mkdir -p "$BIN_DIR"

ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then GOARCH="amd64"; else GOARCH="arm64"; fi

if [ ! -x "$BIN_DIR/zarf" ]; then
    echo "[bin-bootstrap] Fetching zarf ${ZARF_VERSION}..."
    curl -sL "https://github.com/zarf-dev/zarf/releases/download/${ZARF_VERSION}/zarf_${ZARF_VERSION}_Linux_${GOARCH}" -o "$BIN_DIR/zarf"
    chmod +x "$BIN_DIR/zarf"
fi

if [ ! -x "$BIN_DIR/kubectl" ]; then
    echo "[bin-bootstrap] Fetching kubectl ${KUBECTL_VERSION}..."
    curl -sL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${GOARCH}/kubectl" -o "$BIN_DIR/kubectl"
    chmod +x "$BIN_DIR/kubectl"
fi

if [ ! -x "$BIN_DIR/grype" ]; then
    echo "[bin-bootstrap] Fetching grype ${GRYPE_VERSION}..."
    curl -sSfL "https://raw.githubusercontent.com/anchore/grype/${GRYPE_VERSION}/install.sh" | sh -s -- -b "$BIN_DIR" "${GRYPE_VERSION}"
fi

if [ ! -x "$BIN_DIR/helm" ]; then
    printf '#!/bin/sh\nexec zarf tools helm "$@"\n' > "$BIN_DIR/helm"
    chmod +x "$BIN_DIR/helm"
fi
