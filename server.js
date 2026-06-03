const express = require('express');
const cors = require('cors');
const k8s = require('@kubernetes/client-node');
const path = require('path');
const stream = require('stream');
const net = require('net');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// Load Kubeconfig
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sBatchApi = kc.makeApiClient(k8s.BatchV1Api);
const k8sNetApi = kc.makeApiClient(k8s.NetworkingV1Api);
const k8sCustom = kc.makeApiClient(k8s.CustomObjectsApi);
const k8sExtensionsApi = kc.makeApiClient(k8s.ApiextensionsV1Api);

// Namespaces
app.get('/api/namespaces', async (req, res) => {
    try {
        const response = await k8sCoreApi.listNamespace();
        res.json(response.items.map(ns => ns.metadata.name));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Nodes
app.get('/api/nodes', async (req, res) => {
    try {
        const response = await k8sCoreApi.listNode();
        res.json(response.items);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generic resource fetcher
const fetchers = {
    'pods': (ns) => k8sCoreApi.listNamespacedPod({ namespace: ns }),
    'deployments': (ns) => k8sAppsApi.listNamespacedDeployment({ namespace: ns }),
    'services': (ns) => k8sCoreApi.listNamespacedService({ namespace: ns }),
    'configmaps': (ns) => k8sCoreApi.listNamespacedConfigMap({ namespace: ns }),
    'secrets': (ns) => k8sCoreApi.listNamespacedSecret({ namespace: ns }),
    'ingresses': (ns) => k8sNetApi.listNamespacedIngress({ namespace: ns }),
    'jobs': (ns) => k8sBatchApi.listNamespacedJob({ namespace: ns }),
    'cronjobs': (ns) => k8sBatchApi.listNamespacedCronJob({ namespace: ns }),
    'events': (ns) => k8sCoreApi.listNamespacedEvent({ namespace: ns }),
    'persistentvolumes': () => k8sCoreApi.listPersistentVolume(),
    'persistentvolumeclaims': (ns) => k8sCoreApi.listNamespacedPersistentVolumeClaim({ namespace: ns })
};

const allNamespacesFetchers = {
    'pods': () => k8sCoreApi.listPodForAllNamespaces(),
    'deployments': () => k8sAppsApi.listDeploymentForAllNamespaces(),
    'services': () => k8sCoreApi.listServiceForAllNamespaces(),
    'configmaps': () => k8sCoreApi.listConfigMapForAllNamespaces(),
    'secrets': () => k8sCoreApi.listSecretForAllNamespaces(),
    'ingresses': () => k8sNetApi.listIngressForAllNamespaces(),
    'jobs': () => k8sBatchApi.listJobForAllNamespaces(),
    'cronjobs': () => k8sBatchApi.listCronJobForAllNamespaces(),
    'events': () => k8sCoreApi.listEventForAllNamespaces(),
    'persistentvolumeclaims': () => k8sCoreApi.listPersistentVolumeClaimForAllNamespaces()
};

app.get('/api/resource/:kind', async (req, res) => {
    const { kind } = req.params;
    const ns = req.query.namespace;
    try {
        let response;
        if (ns === 'all') {
            if (kind === 'persistentvolumes' || kind === 'nodes') {
                response = await fetchers[kind]();
            } else if (allNamespacesFetchers[kind]) {
                response = await allNamespacesFetchers[kind]();
            } else {
                return res.status(400).json({ error: 'All namespaces not supported for this kind' });
            }
        } else {
            const nsName = ns || 'default';
            if (!fetchers[kind]) return res.status(400).json({ error: 'Unsupported kind' });
            response = await fetchers[kind](nsName);
        }
        res.json(response.items || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete Resource
app.delete('/api/resource/:kind/:namespace/:name', async (req, res) => {
    const { kind, namespace, name } = req.params;
    try {
        if (kind === 'pods') await k8sCoreApi.deleteNamespacedPod({ name, namespace });
        else if (kind === 'deployments') await k8sAppsApi.deleteNamespacedDeployment({ name, namespace });
        else if (kind === 'services') await k8sCoreApi.deleteNamespacedService({ name, namespace });
        else if (kind === 'configmaps') await k8sCoreApi.deleteNamespacedConfigMap({ name, namespace });
        else if (kind === 'secrets') await k8sCoreApi.deleteNamespacedSecret({ name, namespace });
        else if (kind === 'ingresses') await k8sNetApi.deleteNamespacedIngress({ name, namespace });
        else if (kind === 'jobs') await k8sBatchApi.deleteNamespacedJob({ name, namespace });
        else if (kind === 'cronjobs') await k8sBatchApi.deleteNamespacedCronJob({ name, namespace });
        else if (kind === 'persistentvolumes') await k8sCoreApi.deletePersistentVolume({ name });
        else if (kind === 'persistentvolumeclaims') await k8sCoreApi.deleteNamespacedPersistentVolumeClaim({ name, namespace });
        else return res.status(400).json({ error: 'Unsupported kind' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Logs
app.get('/api/logs/:namespace/:pod', async (req, res) => {
    try {
        const { namespace, pod } = req.params;
        const container = req.query.container;
        const response = await k8sCoreApi.readNamespacedPodLog({ 
            name: pod, 
            namespace, 
            container: container || undefined, 
            tailLines: 500 
        });
        res.send(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Restart Deployment
app.put('/api/deployments/:namespace/:name/restart', async (req, res) => {
    try {
        const { namespace, name } = req.params;
        const patch = {
            spec: {
                template: {
                    metadata: {
                        annotations: {
                            'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
                        }
                    }
                }
            }
        };
        const response = await k8sAppsApi.patchNamespacedDeployment(
            { name, namespace, body: patch },
            { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
        );
        res.json(response);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Scale Deployment
app.put('/api/deployments/:namespace/:name/scale', async (req, res) => {
    try {
        const { namespace, name } = req.params;
        const { replicas } = req.body;
        const patch = { spec: { replicas: Number(replicas) } };
        const response = await k8sAppsApi.patchNamespacedDeployment(
            { name, namespace, body: patch },
            { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
        );
        res.json(response);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Events
app.get('/api/events/:namespace/:uid', async (req, res) => {
    try {
        const { namespace, uid } = req.params;
        const response = await k8sCoreApi.listNamespacedEvent({ namespace, fieldSelector: `involvedObject.uid=${uid}` });
        res.json(response.items || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// Metrics endpoints
app.get('/api/metrics/nodes', async (req, res) => {
    try {
        const response = await k8sCustom.listClusterCustomObject({
            group: 'metrics.k8s.io',
            version: 'v1beta1',
            plural: 'nodes'
        });
        res.json(response.items || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/metrics/pods', async (req, res) => {
    try {
        const response = await k8sCustom.listClusterCustomObject({
            group: 'metrics.k8s.io',
            version: 'v1beta1',
            plural: 'pods'
        });
        res.json(response.items || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', async (req, res) => {
    const ns = req.query.namespace;
    try {
        const isAll = !ns || ns === 'all';
        const promises = [
            isAll ? k8sCoreApi.listPodForAllNamespaces() : k8sCoreApi.listNamespacedPod({ namespace: ns }),
            isAll ? k8sAppsApi.listDeploymentForAllNamespaces() : k8sAppsApi.listNamespacedDeployment({ namespace: ns }),
            k8sCoreApi.listNode(),
            isAll ? k8sCoreApi.listServiceForAllNamespaces() : k8sCoreApi.listNamespacedService({ namespace: ns }),
            isAll ? k8sCoreApi.listConfigMapForAllNamespaces() : k8sCoreApi.listNamespacedConfigMap({ namespace: ns }),
            isAll ? k8sCoreApi.listSecretForAllNamespaces() : k8sCoreApi.listNamespacedSecret({ namespace: ns }),
            k8sCoreApi.listPersistentVolume(),
            isAll ? k8sCoreApi.listPersistentVolumeClaimForAllNamespaces() : k8sCoreApi.listNamespacedPersistentVolumeClaim({ namespace: ns })
        ];

        const metricsPromise = k8sCustom.listClusterCustomObject({
            group: 'metrics.k8s.io',
            version: 'v1beta1',
            plural: 'nodes'
        }).catch(() => ({ items: [] }));

        const [nodeMetricsResult, [pods, deploys, nodes, services, cms, secrets, pvs, pvcs]] = await Promise.all([
            metricsPromise,
            Promise.all(promises.map(p => p.catch(err => {
                console.error('Promise failed in dashboard stats api:', err);
                return { items: [] };
            })))
        ]);

        // Aggregate CPU and RAM Metrics
        let totalCpuCap = 0;
        let totalMemCap = 0;
        let totalCpuUse = 0;
        let totalMemUse = 0;

        const parseCpu = (cpuStr) => {
            if (!cpuStr) return 0;
            if (cpuStr.endsWith('n')) return parseFloat(cpuStr) / 1000000000;
            if (cpuStr.endsWith('u')) return parseFloat(cpuStr) / 1000000;
            if (cpuStr.endsWith('m')) return parseFloat(cpuStr) / 1000;
            return parseFloat(cpuStr);
        };

        const parseMem = (memStr) => {
            if (!memStr) return 0;
            if (memStr.endsWith('Ki')) return parseFloat(memStr) * 1024;
            if (memStr.endsWith('Mi')) return parseFloat(memStr) * 1024 * 1024;
            if (memStr.endsWith('Gi')) return parseFloat(memStr) * 1024 * 1024 * 1024;
            if (memStr.endsWith('Ti')) return parseFloat(memStr) * 1024 * 1024 * 1024 * 1024;
            return parseFloat(memStr);
        };

        (nodes.items || []).forEach(n => {
            totalCpuCap += parseCpu(n.status?.capacity?.cpu || '0');
            totalMemCap += parseMem(n.status?.capacity?.memory || '0');
        });

        (nodeMetricsResult.items || []).forEach(nm => {
            totalCpuUse += parseCpu(nm.usage?.cpu || '0');
            totalMemUse += parseMem(nm.usage?.memory || '0');
        });

        const cpuPct = totalCpuCap > 0 ? Math.round((totalCpuUse / totalCpuCap) * 100) : 0;
        const memPct = totalMemCap > 0 ? Math.round((totalMemUse / totalMemCap) * 100) : 0;

        // Get Helm releases list
        let helmCount = 0;
        const helmCmd = isAll ? 'helm list --all-namespaces -o json' : `helm list --namespace ${ns} -o json`;
        const getHelmCount = () => new Promise((resolve) => {
            exec(helmCmd, (error, stdout) => {
                if (!error && stdout) {
                    try {
                        const list = JSON.parse(stdout);
                        resolve(Array.isArray(list) ? list.length : 0);
                    } catch (e) { resolve(0); }
                } else { resolve(0); }
            });
        });

        // Get Zarf packages list
        const getZarfCount = () => new Promise((resolve) => {
            exec('zarf package list -o json', (error, stdout) => {
                if (!error && stdout) {
                    try {
                        const list = extractZarfJson(stdout);
                        resolve(Array.isArray(list) ? list.length : 0);
                    } catch (e) { resolve(0); }
                } else { resolve(0); }
            });
        });

        const [hCount, zCount] = await Promise.all([getHelmCount(), getZarfCount()]);

        // Pod phases distribution
        const podPhases = { running: 0, pending: 0, succeeded: 0, failed: 0 };
        const podList = (pods.items || []).map(p => {
            const phase = (p.status?.phase || 'Unknown').toLowerCase();
            if (phase === 'running') podPhases.running++;
            else if (phase === 'pending') podPhases.pending++;
            else if (phase === 'succeeded') podPhases.succeeded++;
            else if (phase === 'failed') podPhases.failed++;
            return {
                name: p.metadata.name,
                namespace: p.metadata.namespace,
                phase: p.status?.phase || 'Unknown',
                ip: p.status?.podIP || 'N/A'
            };
        });

        res.json({
            counts: {
                pods: (pods.items || []).length,
                deployments: (deploys.items || []).length,
                nodes: (nodes.items || []).length,
                services: (services.items || []).length,
                configmaps: (cms.items || []).length,
                secrets: (secrets.items || []).length,
                persistentvolumes: (pvs.items || []).length,
                persistentvolumeclaims: (pvcs.items || []).length,
                helmreleases: hCount,
                zarfpackages: zCount
            },
            podPhases,
            pods: podList,
            resources: {
                cpuPct: Math.min(100, cpuPct),
                memPct: Math.min(100, memPct),
                cpuUse: totalCpuUse,
                cpuCap: totalCpuCap,
                memUse: totalMemUse,
                memCap: totalMemCap
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pod Exec Endpoint
app.post('/api/resource/pods/:namespace/:name/exec', async (req, res) => {
    const { namespace, name } = req.params;
    const { command, container } = req.body;
    if (!command) return res.status(400).json({ error: 'Command is required' });
    
    const stdout = new stream.PassThrough();
    const stderr = new stream.PassThrough();
    
    let stdoutData = '';
    let stderrData = '';
    
    stdout.on('data', chunk => stdoutData += chunk.toString());
    stderr.on('data', chunk => stderrData += chunk.toString());
    
    try {
        let containerName = container;
        if (!containerName) {
            const podInfo = await k8sCoreApi.readNamespacedPod({ name, namespace });
            containerName = podInfo.spec.containers[0].name;
        }

        const execClient = new k8s.Exec(kc);
        const conn = await execClient.exec(
            namespace,
            name,
            containerName,
            typeof command === 'string' ? command.trim().split(/\s+/) : command,
            stdout,
            stderr,
            null, // stdin
            false // tty
        );
        
        conn.on('close', () => {
            res.json({ stdout: stdoutData, stderr: stderrData });
        });
        
        conn.on('error', (err) => {
            res.status(500).json({ error: err.message, stdout: stdoutData, stderr: stderrData });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// YAML
const readers = {
    'pods': (n, ns) => k8sCoreApi.readNamespacedPod({ name: n, namespace: ns }),
    'deployments': (n, ns) => k8sAppsApi.readNamespacedDeployment({ name: n, namespace: ns }),
    'services': (n, ns) => k8sCoreApi.readNamespacedService({ name: n, namespace: ns }),
    'configmaps': (n, ns) => k8sCoreApi.readNamespacedConfigMap({ name: n, namespace: ns }),
    'secrets': (n, ns) => k8sCoreApi.readNamespacedSecret({ name: n, namespace: ns }),
    'ingresses': (n, ns) => k8sNetApi.readNamespacedIngress({ name: n, namespace: ns }),
    'jobs': (n, ns) => k8sBatchApi.readNamespacedJob({ name: n, namespace: ns }),
    'cronjobs': (n, ns) => k8sBatchApi.readNamespacedCronJob({ name: n, namespace: ns }),
    'persistentvolumes': (n) => k8sCoreApi.readPersistentVolume({ name: n }),
    'persistentvolumeclaims': (n, ns) => k8sCoreApi.readNamespacedPersistentVolumeClaim({ name: n, namespace: ns }),
    'helm': (n, ns) => new Promise((resolve, reject) => {
        exec(`helm get values ${n} --namespace ${ns} --all -o json`, (error, stdout, stderr) => {
            if (error) {
                exec(`helm get values ${n} --namespace ${ns}`, (error2, stdout2, stderr2) => {
                    if (error2) reject(new Error(error2.message || stderr2));
                    else resolve({ values: stdout2 });
                });
            } else {
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    resolve({ values: stdout });
                }
            }
        });
    })
};

app.get('/api/yaml/:kind/:namespace/:name', async (req, res) => {
    const { kind, namespace, name } = req.params;
    if (!readers[kind]) return res.status(400).json({ error: 'Unsupported kind' });
    try {
        const response = await readers[kind](name, namespace);
        res.json(response);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const updaters = {
    'pods': (n, ns, body) => k8sCoreApi.replaceNamespacedPod({ name: n, namespace: ns, body }),
    'deployments': (n, ns, body) => k8sAppsApi.replaceNamespacedDeployment({ name: n, namespace: ns, body }),
    'services': (n, ns, body) => k8sCoreApi.replaceNamespacedService({ name: n, namespace: ns, body }),
    'configmaps': (n, ns, body) => k8sCoreApi.replaceNamespacedConfigMap({ name: n, namespace: ns, body }),
    'secrets': (n, ns, body) => k8sCoreApi.replaceNamespacedSecret({ name: n, namespace: ns, body }),
    'ingresses': (n, ns, body) => k8sNetApi.replaceNamespacedIngress({ name: n, namespace: ns, body }),
    'jobs': (n, ns, body) => k8sBatchApi.replaceNamespacedJob({ name: n, namespace: ns, body }),
    'cronjobs': (n, ns, body) => k8sBatchApi.replaceNamespacedCronJob({ name: n, namespace: ns, body }),
    'persistentvolumes': (n, ns, body) => k8sCoreApi.replacePersistentVolume({ name: n, body }),
    'persistentvolumeclaims': (n, ns, body) => k8sCoreApi.replaceNamespacedPersistentVolumeClaim({ name: n, namespace: ns, body }),
};

app.put('/api/yaml/:kind/:namespace/:name', async (req, res) => {
    const { kind, namespace, name } = req.params;
    if (!updaters[kind]) return res.status(400).json({ error: 'Unsupported kind' });
    try {
        const response = await updaters[kind](name, namespace, req.body);
        res.json(response);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const activeForwards = {};

// Helm releases list
app.get('/api/helm', (req, res) => {
    const ns = req.query.namespace;
    const cmd = (ns && ns !== 'all') ? `helm list --namespace ${ns} -o json` : 'helm list --all-namespaces -o json';
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        try {
            res.json(JSON.parse(stdout));
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse helm output: ' + stdout });
        }
    });
});

// Helm status
app.get('/api/helm/:namespace/:name/status', (req, res) => {
    const { namespace, name } = req.params;
    const cmd = `helm status ${name} --namespace ${namespace}`;
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        res.json({ status: stdout });
    });
});

// Helm uninstall
app.delete('/api/helm/:namespace/:name', (req, res) => {
    const { namespace, name } = req.params;
    const cmd = `helm uninstall ${name} --namespace ${namespace}`;
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        res.json({ success: true, output: stdout });
    });
});

// Helm history
app.get('/api/helm/:namespace/:name/history', (req, res) => {
    const { namespace, name } = req.params;
    const cmd = `helm history ${name} --namespace ${namespace} -o json`;
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        try {
            res.json(JSON.parse(stdout));
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse helm history output: ' + stdout });
        }
    });
});

// Helm rollback
app.post('/api/helm/:namespace/:name/rollback', (req, res) => {
    const { namespace, name } = req.params;
    const { revision } = req.body;
    if (!revision) {
        return res.status(400).json({ error: 'Revision is required' });
    }
    const cmd = `helm rollback ${name} ${revision} --namespace ${namespace}`;
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        res.json({ success: true, output: stdout });
    });
});

// Helm deploy
app.post('/api/helm/deploy', (req, res) => {
    const { releaseName, namespace, chartName, valuesYaml } = req.body;
    if (!releaseName || !namespace || !chartName) {
        return res.status(400).json({ error: 'releaseName, namespace, and chartName are required' });
    }
    
    const fs = require('fs');
    let tempFilePath = null;
    let cmd = `helm upgrade --install ${releaseName} ${chartName} --namespace ${namespace}`;
    
    if (valuesYaml && valuesYaml.trim()) {
        const tempFileName = `temp-values-${Date.now()}-${Math.floor(Math.random() * 1000)}.yaml`;
        tempFilePath = path.join(__dirname, tempFileName);
        try {
            fs.writeFileSync(tempFilePath, valuesYaml, 'utf8');
            cmd += ` -f "${tempFilePath}"`;
        } catch (err) {
            return res.status(500).json({ error: 'Failed to write temporary values file: ' + err.message });
        }
    }
    
    exec(cmd, (error, stdout, stderr) => {
        // Clean up the temp file if it was created
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (err) {
                console.error('Failed to delete temp file:', err);
            }
        }
        
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        res.json({ success: true, output: stdout });
    });
});

// Zarf status
app.get('/api/zarf/status', (req, res) => {
    exec('zarf version', (error, stdout, stderr) => {
        if (error) {
            return res.json({ installed: false, error: error.message || stderr });
        }
        res.json({ installed: true, version: stdout.trim() });
    });
});

// Helper to extract JSON from Zarf output which may contain pre-pended logs
function extractZarfJson(stdout) {
    if (!stdout) return [];
    const trimmed = stdout.trim();
    if (trimmed.endsWith('null')) {
        return [];
    }
    const startIdx = trimmed.indexOf('[');
    if (startIdx === -1) {
        const objStartIdx = trimmed.indexOf('{');
        if (objStartIdx === -1) {
            return [];
        }
        try {
            return [JSON.parse(trimmed.slice(objStartIdx))];
        } catch (e) {
            return [];
        }
    }
    try {
        return JSON.parse(trimmed.slice(startIdx));
    } catch (e) {
        return [];
    }
}

// Zarf packages list
app.get('/api/zarf/packages', (req, res) => {
    exec('zarf package list -o json', (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        try {
            const packages = extractZarfJson(stdout);
            res.json(packages);
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse zarf packages output: ' + e.message });
        }
    });
});

// Zarf package deploy
app.post('/api/zarf/deploy', (req, res) => {
    const { packagePath } = req.body;
    if (!packagePath) {
        return res.status(400).json({ error: 'packagePath is required' });
    }
    const cmd = `zarf package deploy "${packagePath}" --confirm`;
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        res.json({ success: true, output: stdout });
    });
});

// Zarf package remove
app.delete('/api/zarf/packages/:name', (req, res) => {
    const { name } = req.params;
    const cmd = `zarf package remove "${name}" --confirm`;
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        res.json({ success: true, output: stdout });
    });
});

// Port Forward list
app.get('/api/portforward', (req, res) => {
    const list = Object.values(activeForwards).map(pf => ({
        id: pf.id,
        localPort: pf.localPort,
        remotePort: pf.remotePort,
        podName: pf.podName,
        namespace: pf.namespace
    }));
    res.json(list);
});

// Port Forward create
app.post('/api/portforward', async (req, res) => {
    const { namespace, podName, remotePort } = req.body;
    let { localPort } = req.body;
    
    try {
        const portForwarder = new k8s.PortForward(kc);
        const server = net.createServer((socket) => {
            socket.on('error', (err) => {
                console.error('Socket error in port-forward:', err);
            });
            portForwarder.portForward(namespace, podName, [Number(remotePort)], socket, null, socket);
        });
        
        server.on('error', (err) => {
            console.error('Server error in port-forward:', err);
        });

        server.listen(localPort ? Number(localPort) : 0, '127.0.0.1', () => {
            const allocatedPort = server.address().port;
            const id = `${namespace}/${podName}/${remotePort}`;
            
            if (activeForwards[id]) {
                try { activeForwards[id].server.close(); } catch(e) {}
            }
            
            activeForwards[id] = {
                id,
                server,
                localPort: allocatedPort,
                remotePort,
                podName,
                namespace
            };
            
            res.json({
                success: true,
                id,
                localPort: allocatedPort,
                remotePort,
                podName,
                namespace
            });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Port Forward delete
app.delete('/api/portforward', async (req, res) => {
    const { id } = req.body;
    if (activeForwards[id]) {
        try {
            activeForwards[id].server.close();
            delete activeForwards[id];
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    } else {
        res.status(404).json({ error: 'Port forward not found' });
    }
});

// CRD API
app.get('/api/crds', async (req, res) => {
    try {
        const response = await k8sExtensionsApi.listCustomResourceDefinition();
        res.json(response.items || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Custom Objects list
app.get('/api/custom/:group/:version/:plural', async (req, res) => {
    const { group, version, plural } = req.params;
    const ns = req.query.namespace;
    try {
        let response;
        if (ns === 'all') {
            response = await k8sCustom.listClusterCustomObject({ group, version, plural });
        } else {
            response = await k8sCustom.listNamespacedCustomObject({ group, version, namespace: ns || 'default', plural });
        }
        res.json(response.items || []);
    } catch (err) {
        // Fallback to cluster level in case CRD is cluster-scoped
        try {
            const response = await k8sCustom.listClusterCustomObject({ group, version, plural });
            res.json(response.items || []);
        } catch (err2) {
            res.status(500).json({ error: err2.message });
        }
    }
});

// Custom Objects YAML spec (Read)
app.get('/api/custom/yaml/:group/:version/:plural/:namespace/:name', async (req, res) => {
    const { group, version, plural, namespace, name } = req.params;
    try {
        let response;
        if (namespace && namespace !== 'undefined' && namespace !== 'null' && namespace !== 'all') {
            response = await k8sCustom.getNamespacedCustomObject({ group, version, namespace, plural, name });
        } else {
            response = await k8sCustom.getClusterCustomObject({ group, version, plural, name });
        }
        res.json(response);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Custom Objects YAML spec (Update)
app.put('/api/custom/yaml/:group/:version/:plural/:namespace/:name', async (req, res) => {
    const { group, version, plural, namespace, name } = req.params;
    try {
        let response;
        if (namespace && namespace !== 'undefined' && namespace !== 'null' && namespace !== 'all') {
            response = await k8sCustom.replaceNamespacedCustomObject({ group, version, namespace, plural, name, body: req.body });
        } else {
            response = await k8sCustom.replaceClusterCustomObject({ group, version, plural, name, body: req.body });
        }
        res.json(response);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Custom Objects DELETE
app.delete('/api/custom/:group/:version/:plural/:namespace/:name', async (req, res) => {
    const { group, version, plural, namespace, name } = req.params;
    try {
        if (namespace && namespace !== 'undefined' && namespace !== 'null' && namespace !== 'all') {
            await k8sCustom.deleteNamespacedCustomObject({ group, version, namespace, plural, name });
        } else {
            await k8sCustom.deleteClusterCustomObject({ group, version, plural, name });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve frontend in production
const frontendBuildPath = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(frontendBuildPath));
app.use((req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});