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

let k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
let k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
let k8sBatchApi = kc.makeApiClient(k8s.BatchV1Api);
let k8sNetApi = kc.makeApiClient(k8s.NetworkingV1Api);
let k8sCustom = kc.makeApiClient(k8s.CustomObjectsApi);
let k8sExtensionsApi = kc.makeApiClient(k8s.ApiextensionsV1Api);

// Kubeconfig Context Switcher
app.get('/api/kube/contexts', async (req, res) => {
    try {
        kc.loadFromDefault();
        const contexts = kc.contexts.map(c => ({
            name: c.name,
            cluster: c.cluster,
            user: c.user
        }));
        res.json({
            contexts,
            currentContext: kc.currentContext
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/kube/contexts', async (req, res) => {
    const { context } = req.body;
    if (!context) return res.status(400).json({ error: 'Context is required' });
    try {
        const exists = kc.contexts.some(c => c.name === context);
        if (!exists) return res.status(400).json({ error: `Context ${context} not found` });
        
        exec(`kubectl config use-context "${context}"`, (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ error: error.message || stderr });
            }
            try {
                kc.loadFromDefault();
                k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
                k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
                k8sBatchApi = kc.makeApiClient(k8s.BatchV1Api);
                k8sNetApi = kc.makeApiClient(k8s.NetworkingV1Api);
                k8sCustom = kc.makeApiClient(k8s.CustomObjectsApi);
                k8sExtensionsApi = kc.makeApiClient(k8s.ApiextensionsV1Api);
                
                res.json({ success: true, currentContext: kc.currentContext });
            } catch (reloadErr) {
                res.status(500).json({ error: reloadErr.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
            if (!fetchers[kind]) {
                return res.status(400).json({ error: 'Unsupported kind' });
            }
            response = await fetchers[kind](nsName);
        }

        const items = response.items || [];

        if (kind === 'pods') {
            items.sort((a, b) => {
                const aRunning = a.status?.phase === 'Running';
                const bRunning = b.status?.phase === 'Running';

                if (aRunning !== bRunning) {
                    return bRunning - aRunning;
                }

                return a.metadata.name.localeCompare(b.metadata.name);
            });
        }

        if (kind === 'deployments') {
            items.sort((a, b) => {
                const aReady =
                    (a.status?.readyReplicas || 0) > 0;
                const bReady =
                    (b.status?.readyReplicas || 0) > 0;

                if (aReady !== bReady) {
                    return bReady - aReady;
                }

                return a.metadata.name.localeCompare(b.metadata.name);
            });
        }

        res.json(items);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
        const execCmd = typeof command === 'string' ? ['sh', '-c', command] : command;
        const conn = await execClient.exec(
            namespace,
            name,
            containerName,
            execCmd,
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
    const taskId = startTask('zarf', ['package', 'deploy', packagePath, '--confirm']);
    res.json({ success: true, taskId });
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

// ==========================================
// BACKGROUND TASK RUNNER & LOG STREAMING
// ==========================================
const { spawn } = require('child_process');
const activeTasks = {};

function startTask(cmd, args, cwd = __dirname) {
    const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const child = spawn(cmd, args, { cwd, shell: true });
    
    activeTasks[taskId] = {
        id: taskId,
        command: `${cmd} ${args.join(' ')}`,
        status: 'running',
        logs: '',
        exitCode: null
    };
    
    const appendLog = (data) => {
        activeTasks[taskId].logs += data.toString();
        // Limit log size to 1MB
        if (activeTasks[taskId].logs.length > 1024 * 1024) {
            activeTasks[taskId].logs = activeTasks[taskId].logs.slice(-512 * 1024);
        }
    };
    
    child.stdout.on('data', appendLog);
    child.stderr.on('data', appendLog);
    
    child.on('close', (code) => {
        activeTasks[taskId].status = code === 0 ? 'success' : 'failed';
        activeTasks[taskId].exitCode = code;
    });
    
    child.on('error', (err) => {
        activeTasks[taskId].status = 'failed';
        activeTasks[taskId].logs += `\nError: ${err.message}\n`;
    });
    
    return taskId;
}

app.get('/api/tasks/:id/logs', (req, res) => {
    const task = activeTasks[req.params.id];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
    if (activeTasks[req.params.id]) {
        delete activeTasks[req.params.id];
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Task not found' });
    }
});

// ==========================================
// EXPANDED HELM REPOSITORY & DEPLOY APIs
// ==========================================

// List configured repos
app.get('/api/helm/repos', (req, res) => {
    exec('helm repo list -o json', (error, stdout, stderr) => {
        if (error) {
            return res.json([]);
        }
        try {
            res.json(JSON.parse(stdout));
        } catch (e) {
            res.json([]);
        }
    });
});

// Add a repository
app.post('/api/helm/repos', (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
    exec(`helm repo add ${name} ${url}`, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: error.message || stderr });
        res.json({ success: true, output: stdout });
    });
});

// Remove a repository
app.delete('/api/helm/repos/:name', (req, res) => {
    const { name } = req.params;
    exec(`helm repo remove ${name}`, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: error.message || stderr });
        res.json({ success: true, output: stdout });
    });
});

// Update repositories
app.post('/api/helm/repos/update', (req, res) => {
    exec('helm repo update', (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: error.message || stderr });
        res.json({ success: true, output: stdout });
    });
});

// Search repo charts
app.get('/api/helm/search', (req, res) => {
    const query = req.query.q || '';
    if (!query) return res.json([]);
    exec(`helm search repo ${query} -o json`, (error, stdout, stderr) => {
        if (error) return res.json([]);
        try {
            res.json(JSON.parse(stdout));
        } catch (e) {
            res.json([]);
        }
    });
});

// Advanced Deploy / Upgrade Chart from repo
app.post('/api/helm/install', (req, res) => {
    const { releaseName, repo, chartName, version, namespace, valuesYaml } = req.body;
    if (!releaseName || !repo || !chartName || !namespace) {
        return res.status(400).json({ error: 'releaseName, repo, chartName, and namespace are required' });
    }
    
    let chartRef = `${repo}/${chartName}`;
    let cmd = `helm upgrade --install ${releaseName} ${chartRef} --namespace ${namespace} --create-namespace`;
    if (version) {
        cmd += ` --version ${version}`;
    }

    const fs = require('fs');
    let tempFilePath = null;
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
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
        if (error) return res.status(500).json({ error: error.message || stderr });
        res.json({ success: true, output: stdout });
    });
});

// Get user values
app.get('/api/helm/:namespace/:name/values', (req, res) => {
    const { namespace, name } = req.params;
    exec(`helm get values ${name} --namespace ${namespace} -o json`, (error, stdout, stderr) => {
        if (error) {
            exec(`helm get values ${name} --namespace ${namespace}`, (error2, stdout2, stderr2) => {
                if (error2) return res.status(500).json({ error: error2.message || stderr2 });
                res.json({ raw: stdout2 });
            });
        } else {
            try {
                res.json(JSON.parse(stdout));
            } catch (e) {
                res.json({ raw: stdout });
            }
        }
    });
});

// Get release manifest
app.get('/api/helm/:namespace/:name/manifest', (req, res) => {
    const { namespace, name } = req.params;
    exec(`helm get manifest ${name} --namespace ${namespace}`, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: error.message || stderr });
        res.json({ manifest: stdout });
    });
});

// Get release notes
app.get('/api/helm/:namespace/:name/notes', (req, res) => {
    const { namespace, name } = req.params;
    exec(`helm get notes ${name} --namespace ${namespace}`, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: error.message || stderr });
        res.json({ notes: stdout });
    });
});

// ==========================================
// EXPANDED ZARF REBUILD & FILE UPLOADS
// ==========================================

// Raw binary stream file upload
app.post('/api/zarf/upload', (req, res) => {
    const fs = require('fs');
    const filename = req.headers['x-file-name'] || `zarf-upload-${Date.now()}.tar.zst`;
    const filepath = path.join(__dirname, filename);
    const writeStream = fs.createWriteStream(filepath);
    
    req.pipe(writeStream);
    
    writeStream.on('finish', () => {
        res.json({ success: true, filepath, filename });
    });
    
    writeStream.on('error', (err) => {
        res.status(500).json({ error: 'Upload failed: ' + err.message });
    });
});

// Unpack package and read zarf.yaml
app.post('/api/zarf/unpack', (req, res) => {
    const { packagePath } = req.body;
    if (!packagePath) return res.status(400).json({ error: 'packagePath is required' });
    
    const fs = require('fs');
    const tempDir = path.join(__dirname, `zarf-unpack-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    exec(`zarf tools archiver decompress "${packagePath}" "${tempDir}"`, (error, stdout, stderr) => {
        if (error) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
            return res.status(500).json({ error: 'Failed to decompress package: ' + (error.message || stderr) });
        }
        
        const yamlPath = path.join(tempDir, 'zarf.yaml');
        if (!fs.existsSync(yamlPath)) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
            return res.status(404).json({ error: 'zarf.yaml not found inside package' });
        }
        
        try {
            const configText = fs.readFileSync(yamlPath, 'utf8');
            res.json({ success: true, tempDir, configText });
        } catch (err) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
            res.status(500).json({ error: 'Failed to read zarf.yaml: ' + err.message });
        }
    });
});

// Rebuild and Deploy unpacked package (using task runner)
app.post('/api/zarf/rebuild-deploy', (req, res) => {
    const { tempDir, configText } = req.body;
    if (!tempDir || !configText) {
        return res.status(400).json({ error: 'tempDir and configText are required' });
    }
    
    const fs = require('fs');
    const yamlPath = path.join(tempDir, 'zarf.yaml');
    try {
        fs.writeFileSync(yamlPath, configText, 'utf8');
    } catch (err) {
        return res.status(500).json({ error: 'Failed to write updated zarf.yaml: ' + err.message });
    }
    
    const runScript = `
        cd "${tempDir}"
        zarf package create --confirm
        PKG_FILE=$(ls zarf-package-*.tar.zst 2>/dev/null | head -n 1)
        if [ -z "$PKG_FILE" ]; then
            echo "ERROR: Failed to create Zarf package"
            exit 1
        fi
        echo "Successfully created package: $PKG_FILE. Starting deployment..."
        zarf package deploy "$PKG_FILE" --confirm
        cd ..
        rm -rf "${tempDir}"
    `;
    
    const taskId = startTask('sh', ['-c', runScript]);
    res.json({ success: true, taskId });
});

// List Zarf local package files and directories in workspace
app.get('/api/zarf/local-packages', (req, res) => {
    const fs = require('fs');
    fs.readdir(__dirname, (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        const list = files
            .filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== 'frontend')
            .map(f => {
                try {
                    const stat = fs.statSync(path.join(__dirname, f));
                    return {
                        name: f,
                        path: path.join(__dirname, f),
                        isDir: stat.isDirectory(),
                        size: stat.size,
                        mtime: stat.mtime
                    };
                } catch (statErr) {
                    return null;
                }
            })
            .filter(Boolean);
        res.json(list);
    });
});

// Delete local package file or folder in workspace
app.delete('/api/zarf/local-packages', (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name query parameter is required' });
    
    const fs = require('fs');
    const targetPath = path.join(__dirname, name);
    
    // Safety check: ensure target is within __dirname
    const relative = path.relative(__dirname, targetPath);
    const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    if (!isSafe && targetPath !== __dirname) {
        return res.status(400).json({ error: 'Invalid file path' });
    }
    
    try {
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'File or folder not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Zarf tools archiver compress folder
app.post('/api/zarf/archiver/compress', (req, res) => {
    const { source, dest } = req.body;
    if (!source || !dest) return res.status(400).json({ error: 'source and dest are required' });
    
    const sourcePath = path.isAbsolute(source) ? source : path.join(__dirname, source);
    const destPath = path.isAbsolute(dest) ? dest : path.join(__dirname, dest);
    
    const taskId = startTask('zarf', ['tools', 'archiver', 'compress', sourcePath, destPath]);
    res.json({ success: true, taskId });
});

// Zarf tools archiver decompress file
app.post('/api/zarf/archiver/decompress', (req, res) => {
    const { source, dest } = req.body;
    if (!source || !dest) return res.status(400).json({ error: 'source and dest are required' });
    
    const sourcePath = path.isAbsolute(source) ? source : path.join(__dirname, source);
    const destPath = path.isAbsolute(dest) ? dest : path.join(__dirname, dest);
    
    const taskId = startTask('zarf', ['tools', 'archiver', 'decompress', sourcePath, destPath]);
    res.json({ success: true, taskId });
});

// Extract SBOMs from Zarf package to static folder
app.post('/api/zarf/sbom/inspect', (req, res) => {
    const { packageName } = req.body;
    if (!packageName) return res.status(400).json({ error: 'packageName is required' });
    
    const fs = require('fs');
    const packagePath = path.join(__dirname, packageName);
    if (!fs.existsSync(packagePath)) {
        return res.status(404).json({ error: 'Zarf package not found in workspace' });
    }
    
    const staticSubdir = 'sboms';
    const outDir = path.join(__dirname, 'frontend', 'dist', staticSubdir, packageName);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    
    exec(`zarf package inspect sbom "${packagePath}" --output "${outDir}"`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        
        // List extracted HTML files
        fs.readdir(outDir, (readErr, files) => {
            if (readErr) return res.status(500).json({ error: readErr.message });
            const htmlFiles = files
                .filter(f => f.endsWith('.html'))
                .map(f => ({
                    name: f,
                    url: `/${staticSubdir}/${packageName}/${f}`
                }));
            res.json({ success: true, files: htmlFiles });
        });
    });
});

// Perform a real-time SBOM scan of a container image
app.post('/api/zarf/sbom/scan', (req, res) => {
    const { imageRef } = req.body;
    if (!imageRef) return res.status(400).json({ error: 'imageRef is required' });
    
    exec(`zarf tools sbom scan "${imageRef}" -o json`, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message || stderr });
        }
        try {
            res.json(JSON.parse(stdout));
        } catch (parseErr) {
            res.status(500).json({ error: 'Failed to parse SBOM JSON: ' + parseErr.message, raw: stdout.substring(0, 1000) });
        }
    });
});

// Zarf tools credentials viewer
app.get('/api/zarf/creds', (req, res) => {
    exec('zarf tools get-creds', (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: error.message || stderr });
        
        const cleanStdout = stdout.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        const lines = cleanStdout.split('\n');
        const creds = [];
        
        lines.forEach(line => {
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 4 && parts[0] && !parts[0].includes('Application') && !parts[0].includes('---')) {
                creds.push({
                    application: parts[0],
                    username: parts[1] || 'N/A',
                    password: parts[2] || 'N/A',
                    connect: parts[3] || 'N/A',
                    key: parts[4] || 'N/A'
                });
            }
        });
        
        res.json(creds);
    });
});

// Zarf tools clear cache
app.post('/api/zarf/clear-cache', (req, res) => {
    exec('zarf tools clear-cache --confirm', (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: error.message || stderr });
        res.json({ success: true, output: stdout });
    });
});

// Helper to ensure Zarf tools registry login before executing crane commands
const ensureZarfRegistryLogin = (onSuccess, onError) => {
    const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
    exec(`zarf tools registry catalog ${registryUrl}`, (error, stdout, stderr) => {
        if (error && (stdout.includes('UNAUTHORIZED') || stderr.includes('UNAUTHORIZED') || error.message.includes('UNAUTHORIZED'))) {
            exec('zarf tools get-creds', (credError, credStdout, credStderr) => {
                if (credError) {
                    return onError(new Error('Failed to retrieve Zarf credentials: ' + (credError.message || credStderr)));
                }
                const cleanStdout = credStdout.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
                const lines = cleanStdout.split('\n');
                let username = 'zarf-push';
                let password = '';
                lines.forEach(line => {
                    const parts = line.split('|').map(p => p.trim());
                    if (parts.length >= 3 && parts[0] && parts[0].trim() === 'Registry') {
                        username = parts[1] || 'zarf-push';
                        password = parts[2] || '';
                    }
                });
                if (!password) {
                    return onError(new Error('Registry push password not found in Zarf credentials'));
                }
                exec(`zarf tools registry login --username ${username} --password "${password}" ${registryUrl}`, (loginError, loginStdout, loginStderr) => {
                    if (loginError) {
                        return onError(new Error('Registry login failed: ' + (loginError.message || loginStderr)));
                    }
                    onSuccess();
                });
            });
        } else if (error) {
            return onError(new Error('Failed to communicate with Zarf registry: ' + (error.message || stderr)));
        } else {
            onSuccess();
        }
    });
};

// Zarf tools registry catalog (repositories)
app.get('/api/zarf/registry/catalog', (req, res) => {
    const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
    const runCatalog = () => {
        exec(`zarf tools registry catalog ${registryUrl}`, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: error.message || stderr });
            const repos = stdout.split('\n').map(r => r.trim()).filter(Boolean);
            res.json(repos);
        });
    };
    ensureZarfRegistryLogin(runCatalog, (err) => res.status(500).json({ error: err.message }));
});

// Zarf tools registry list repo tags (with wildcard support for nested repo paths)
app.get('/api/zarf/registry/repository/*repoPath/tags', (req, res) => {
    const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
    const repoPath = req.params.repoPath;
    const repo = Array.isArray(repoPath) ? repoPath.join('/') : repoPath;
    if (!repo) return res.status(400).json({ error: 'Repository name is required' });
    
    const runLs = () => {
        exec(`zarf tools registry ls ${registryUrl}/${repo}`, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: error.message || stderr });
            const tags = stdout.split('\n').map(t => t.trim()).filter(Boolean);
            res.json(tags);
        });
    };
    ensureZarfRegistryLogin(runLs, (err) => res.status(500).json({ error: err.message }));
});

// Zarf tools registry delete image reference
app.delete('/api/zarf/registry/image', (req, res) => {
    const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
    const { imageRef } = req.query;
    if (!imageRef) return res.status(400).json({ error: 'imageRef query parameter is required' });
    
    const runDelete = () => {
        const fullRef = imageRef.startsWith(registryUrl) ? imageRef : `${registryUrl}/${imageRef}`;
        exec(`zarf tools registry delete ${fullRef}`, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: error.message || stderr });
            res.json({ success: true, output: stdout });
        });
    };
    ensureZarfRegistryLogin(runDelete, (err) => res.status(500).json({ error: err.message }));
});

// Zarf tools registry prune unused images
app.post('/api/zarf/registry/prune', (req, res) => {
    const taskId = startTask('zarf', ['tools', 'registry', 'prune', '--confirm']);
    res.json({ success: true, taskId });
});

// Pod File Explorer: Download File
app.get('/api/resource/pods/:namespace/:name/files/download', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, container } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    
    try {
        let containerName = container;
        if (!containerName) {
            const podInfo = await k8sCoreApi.readNamespacedPod({ name, namespace });
            containerName = podInfo.spec.containers[0].name;
        }
        
        const filename = filePath.split('/').pop() || 'file';
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        const { spawn } = require('child_process');
        const cp = spawn('kubectl', [
            'exec',
            '-n', namespace,
            name,
            '-c', containerName,
            '--',
            'cat', filePath
        ]);
        
        cp.stdout.pipe(res);
        
        let errData = '';
        cp.stderr.on('data', chunk => errData += chunk.toString());
        
        cp.on('close', (code) => {
            if (code !== 0 && !res.headersSent) {
                res.status(500).json({ error: errData || `Download failed with exit status ${code}` });
            }
        });
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

// Pod File Explorer: Upload File (direct binary stream)
app.post('/api/resource/pods/:namespace/:name/files/upload', async (req, res) => {
    const { namespace, name } = req.params;
    const { destDir, container } = req.query;
    const filename = req.headers['x-file-name'];
    
    if (!destDir || !filename) {
        return res.status(400).json({ error: 'destDir and x-file-name header are required' });
    }
    
    try {
        let containerName = container;
        if (!containerName) {
            const podInfo = await k8sCoreApi.readNamespacedPod({ name, namespace });
            containerName = podInfo.spec.containers[0].name;
        }
        
        const dirPath = destDir.endsWith('/') ? destDir : destDir + '/';
        const destPath = dirPath + filename;
        const cmd = `cat > "${destPath.replace(/"/g, '\\"')}"`;
        
        const { spawn } = require('child_process');
        const cp = spawn('kubectl', [
            'exec',
            '-i',
            '-n', namespace,
            name,
            '-c', containerName,
            '--',
            'sh', '-c', cmd
        ]);
        
        req.pipe(cp.stdin);
        
        let errData = '';
        cp.stderr.on('data', chunk => errData += chunk.toString());
        
        cp.on('close', (code) => {
            if (code === 0) {
                res.json({ success: true, message: `File uploaded successfully to ${destPath}` });
            } else {
                res.status(500).json({ error: errData || `Upload failed with exit code ${code}` });
            }
        });
        
        cp.on('error', (err) => {
            if (!res.headersSent) {
                res.status(500).json({ error: err.message });
            }
        });
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

// Pod File Explorer: Delete File or Folder
app.delete('/api/resource/pods/:namespace/:name/files', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, container } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    
    try {
        let containerName = container;
        if (!containerName) {
            const podInfo = await k8sCoreApi.readNamespacedPod({ name, namespace });
            containerName = podInfo.spec.containers[0].name;
        }
        
        const cmd = `rm -rf "${filePath.replace(/"/g, '\\"')}"`;
        exec(`kubectl exec -n ${namespace} ${name} -c ${containerName} -- sh -c '${cmd}'`, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: error.message || stderr });
            res.json({ success: true });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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