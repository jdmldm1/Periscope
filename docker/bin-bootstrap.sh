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
    printf '#!/bin/sh\nexec zarf tools kubectl "$@"\n' > "$BIN_DIR/kubectl"
    chmod +x "$BIN_DIR/kubectl"
fi

if [ "$SCANNING_ENABLED" != "false" ] && [ "$AIRGAP_LITE" != "true" ]; then
    if [ ! -x "$BIN_DIR/grype" ]; then
        echo "[bin-bootstrap] Fetching grype ${GRYPE_VERSION}..."
        curl -sSfL "https://raw.githubusercontent.com/anchore/grype/${GRYPE_VERSION}/install.sh" | sh -s -- -b "$BIN_DIR" "${GRYPE_VERSION}"
    fi
fi

if [ ! -x "$BIN_DIR/helm" ]; then
    printf '#!/bin/sh\nexec zarf tools helm "$@"\n' > "$BIN_DIR/helm"
    chmod +x "$BIN_DIR/helm"
fi
