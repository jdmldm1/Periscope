#!/usr/bin/env bash
# Writes /home/github-runner/.kube/config using the github-deployer ServiceAccount token.
# Run as root after applying runner-rbac.yaml.
set -euo pipefail

RUNNER_USER=github-runner
KUBE_DIR=/home/$RUNNER_USER/.kube

TOKEN=$(kubectl -n periscope get secret github-deployer-token -o jsonpath='{.data.token}' | base64 -d)
CA=$(kubectl config view --raw --minify -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')

install -d -o "$RUNNER_USER" -g "$RUNNER_USER" -m 700 "$KUBE_DIR"
umask 077
cat > "$KUBE_DIR/config" <<EOF
apiVersion: v1
kind: Config
clusters:
- name: shiloh
  cluster:
    server: $SERVER
    certificate-authority-data: $CA
users:
- name: github-deployer
  user:
    token: $TOKEN
contexts:
- name: periscope-deployer
  context: {cluster: shiloh, user: github-deployer, namespace: periscope}
current-context: periscope-deployer
EOF
chown "$RUNNER_USER:$RUNNER_USER" "$KUBE_DIR/config"
echo "Wrote $KUBE_DIR/config"
