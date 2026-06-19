# 🔭 Periscope - K8s

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Kubernetes](https://img.shields.io/badge/kubernetes-%23326ce5.svg?style=flat&logo=kubernetes&logoColor=white)](https://kubernetes.io)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361dafb)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)

**Periscope** is an advanced control plane for kubernetes which allows you to view and manage your cluster state, helm releases, and zarf packages.

<p align="center">
  <img src="frontend/public/logo.png" alt="Periscope Logo" width="220" />
</p>

---

## Features

- **Dynamic Topology Graph**: 2D network visualation of relationships between K8s Nodes, Deployments, Services, and Pods.
- **Built-in Pod Terminal**: Run interactive commands (`/bin/sh` or `/bin/bash`) directly inside your container pods from a terminal terminal window.
- **Real-time Log Streamer**: Streams pod logs with customizable regex filters and automatic syntax-coloring for errors, warnings, successes, and info messages.
- **Helm & Zarf Integrations**: Inspect deployed Helm releases, Helm revision history, and manage Zarf packages directly from the dashboard.

---

## 🛡️ Built-in Security Integrations

Periscope is intended to provide threat detection in your Kubernetes clusters:

1. **Vulnerability Scanning via Anchore Grype**
   - **On-Demand CVE Inspections**: container image vulnerability scans.
   - **SBOM Analysis**: Scans images matching active workloads or registry catalogs to analyze all packages and binaries.
   - **Air-Gap Compliance**: Runs fully offline using a cached database, enabling vulnerability detection in secure, disconnected environments.

2. **Kubernetes Configuration & RBAC Security Auditor**
   - **RBAC Overprivilege Checker**: Identifies overprivileged `ServiceAccounts` bound to risky `Roles`/`ClusterRoles` (e.g., wildcard resource permissions or execution access).
   - **Pod Hardening Checks**: Audits container specs for privileged modes, `allowPrivilegeEscalation` defaults, and running as the root user.
   - **Host Namespace Isolation**: Flags pods sharing the host's networking (`hostNetwork`), processes (`hostPID`), or IPC (`hostIPC`) namespaces.
   - **Filesystem Security**: Alerts on dangerous `hostPath` mounts that could expose the host's filesystem to container breakout risks.
   - **Network Policy Auditor**: Highlights pods running without network isolation (`NetworkPolicy` coverage).
   - **Plaintext Secret Detector**: Automatically scans container environment variables for exposed secrets, passwords, keys, and tokens.
   - **Resource & Reliability Linter**: Flags missing CPU/Memory requests/limits, missing Liveness/Readiness probes, single-replica deployments, and deprecated API versions.
   - **Cluster Health Grade**: Computes a dynamic, relative compliance grade (A+ through F) based on violation density and resource counts.

---

## Tech Stack

- **Frontend**: React (TypeScript) and vis.js
- **Backend**: Express (Node.js), Client-side Server-Sent Events, WebSockets, and `@kubernetes/client-node`.
- **Infrastructure**: Helm and Zarf.

---

## Quick Start (Local Development)

### Prerequisites

- Node.js (v22+)
- A running Kubernetes cluster (k3d, minikube, or Docker Desktop K8s)
- Current kubeconfig pointed to the target cluster

### Running the App Locally

1. **Install Root and Backend Dependencies**:
   ```bash
   npm install
   ```

2. **Install & Build Frontend**:
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

3. **Start the Express API Server**:
   ```bash
   node server.js
   ```
   Open [http://localhost:3001](http://localhost:3001) in your browser.

---

## 📦 OCI Registry Artifacts (GHCR)

You can pull the official pre-built containers, Helm charts, and Zarf packages directly from GitHub Container Registry (GHCR):

### 1. Zarf Package
Pull the air-gapped Zarf package archive:
```bash
zarf package pull oci://ghcr.io/jdmldm1/packages/periscope:1.0.0
```

### 2. Helm Chart
Pull the Helm deployment package:
```bash
helm pull oci://ghcr.io/jdmldm1/charts/periscope --version 0.1.0
```

### 3. Container Image
Pull the production container image:
```bash
docker pull ghcr.io/jdmldm1/periscope:latest
```

---

## ☸️ Cluster Deployment

You can deploy Periscope directly into your cluster using the included Helm chart.

```bash
helm upgrade --install periscope ./charts/periscope
```

### Accessing the Dashboard

By default, the chart deploys a `ClusterIP` service. You can access it using port forwarding:

```bash
kubectl port-forward svc/periscope 8080:80
```
Then visit [http://localhost:8080](http://localhost:8080).

---

## 🔌 Running without Port Forwarding (k3d Setup)

To access Periscope directly without running a background `kubectl port-forward` process, you can configure it as a `NodePort` or `LoadBalancer` service.

### Recommended NodePort Setup:

1. **Spin up your k3d cluster** with host port `30080` bound to the container NodePort:
   ```bash
   k3d cluster create mycluster -p "30080:30080@server:0"
   ```

2. **Import the Periscope Docker Image** into the cluster registry:
   ```bash
   docker build -t periscope:latest .
   k3d image import periscope:latest -c mycluster
   ```

3. **Deploy with NodePort Enabled**:
   ```bash
   helm upgrade --install periscope ./charts/periscope \
     --set service.type=NodePort \
     --set service.nodePort=30080
   ```

4. **Access the Web UI**:
   Open **[http://localhost:30080](http://localhost:30080)** on your host machine.

---

## 📂 Repository Structure

```text
├── charts/                     # Helm deployment templates
│   └── periscope/
│       ├── templates/          # Kubernetes manifests (deployments, service, ingress, accounts)
│       └── values.yaml         # Configuration values
├── frontend/                   # React Frontend App
│   ├── src/                    # App source code, components, and layout views
│   ├── public/                 # Branding and static logo assets
│   ├── package.json
│   └── vite.config.ts
├── server.js                   # Node.js Express backend and Kubernetes client logic
├── Dockerfile                  # Multi-stage production container build
├── zarf.yaml                   # Air-gap package deployment configuration
└── README.md                   # You are here!
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
