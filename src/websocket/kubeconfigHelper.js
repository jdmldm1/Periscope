const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

let cachedKubeconfigPath = null;

function inClusterKubeconfigPath() {
    if (cachedKubeconfigPath !== null) {
        return cachedKubeconfigPath;
    }

    const saDir = '/var/run/secrets/kubernetes.io/serviceaccount';
    const host = process.env.KUBERNETES_SERVICE_HOST;
    const port = process.env.KUBERNETES_SERVICE_PORT || '443';

    if (!host || !fs.existsSync(path.join(saDir, 'token'))) {
        cachedKubeconfigPath = '';
        return cachedKubeconfigPath;
    }

    const target = '/app/.cache/incluster-kubeconfig.yaml';

    try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `apiVersion: v1
kind: Config
clusters:
- name: in-cluster
  cluster:
    server: https://${host}:${port}
    certificate-authority: ${saDir}/ca.crt
contexts:
- name: in-cluster
  context:
    cluster: in-cluster
    user: in-cluster
    namespace: default
current-context: in-cluster
users:
- name: in-cluster
  user:
    tokenFile: ${saDir}/token
`);
        cachedKubeconfigPath = target;
    } catch (err) {
        logger.error(err, 'Failed to write in-cluster kubeconfig');
        cachedKubeconfigPath = '';
    }

    return cachedKubeconfigPath;
}

module.exports = { inClusterKubeconfigPath };
