# Periscope

A web-based Kubernetes control plane for managing cluster state, workloads, Helm releases, and Zarf packages.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Features

- Topology graph — visualizes relationships between nodes, deployments, services, and pods
- Pod terminal and real-time log streaming with regex filtering
- Helm release management with revision history and upgrade support
- Zarf package management and registry browser
- Image vulnerability scanning via Anchore Grype (SBOM + CVE, air-gap capable)
- Kubernetes security auditing via Kubescape — RBAC, pod hardening, network policy coverage, secrets exposure
- CRD explorer, event alerts, autoscale manager, backup/restore, cluster pruner

---

## Install via Helm

### From OCI registry (recommended)

```bash
helm upgrade --install periscope oci://ghcr.io/jdmldm1/charts/periscope \
  --version 0.1.0 \
  --namespace periscope --create-namespace
```

### From source

```bash
helm upgrade --install periscope ./charts/periscope \
  --namespace periscope --create-namespace
```

### Accessing the UI

The chart defaults to `NodePort` on port `30080`. If your cluster routes that port to your host, open `http://localhost:30080`.

For `ClusterIP` or restricted environments use port-forward:

```bash
kubectl port-forward -n periscope svc/periscope 8080:3001
# then open http://localhost:8080
```

### Common values

| Flag | Default | Description |
|---|---|---|
| `service.type` | `NodePort` | `ClusterIP`, `NodePort`, or `LoadBalancer` |
| `service.nodePort` | `30080` | NodePort host port |
| `persistence.enabled` | `true` | PVC for Grype DB cache |
| `persistence.size` | `5Gi` | PVC size |
| `persistence.storageClass` | `""` | Leave blank to use cluster default |
| `auth.apiKey` | `""` | Set to require API key auth; empty = no auth |
| `ingress.enabled` | `false` | Enable ingress |

Example with ingress and auth:

```bash
helm upgrade --install periscope oci://ghcr.io/jdmldm1/charts/periscope \
  --version 0.1.0 \
  --namespace periscope --create-namespace \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=periscope.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix \
  --set auth.apiKey=your-secret-key
```

### k3d NodePort setup

```bash
k3d cluster create mycluster -p "30080:30080@server:0"

helm upgrade --install periscope oci://ghcr.io/jdmldm1/charts/periscope \
  --version 0.1.0 \
  --namespace periscope --create-namespace \
  --set service.type=NodePort \
  --set service.nodePort=30080
```

---

## Local Development

**Prerequisites:** Node.js v22+, a running Kubernetes cluster, kubeconfig pointed at target cluster.

```bash
# install dependencies
npm install
cd frontend && npm install

# build frontend
npm run build
cd ..

# start server
node server.js
# open http://localhost:3001
```

---

## Other Artifacts

```bash
# container image
docker pull ghcr.io/jdmldm1/periscope:latest

# Zarf air-gap package
zarf package pull oci://ghcr.io/jdmldm1/packages/periscope:1.0.0
```

---

## License

MIT — see [LICENSE](LICENSE).
