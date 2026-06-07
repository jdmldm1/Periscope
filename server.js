const express = require('express');
const cors = require('cors');
const k8s = require('@kubernetes/client-node');
const path = require('path');
const stream = require('stream');
const net = require('net');
const { exec } = require('child_process');
const http = require('http');
const fs = require('fs');



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
let k8sRbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api);

let pulseClients = [];
let pulseWatchReq = null;


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
                k8sRbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
                
                if (pulseClients.length > 0) {
                    startClusterPulseWatcher();
                }
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

// Live Event Streamer SSE route
function broadcastPulse(event) {
    const data = JSON.stringify(event);
    pulseClients.forEach(client => {
        try {
            client.res.write(`data: ${data}\n\n`);
        } catch (e) {
            console.error('Failed to write to client:', e);
        }
    });
}

function startClusterPulseWatcher() {
    if (pulseWatchReq) {
        try { pulseWatchReq.abort(); } catch(e) {}
        pulseWatchReq = null;
    }
    
    try {
        const watch = new k8s.Watch(kc);
        watch.watch(
            '/api/v1/events',
            {},
            (type, event) => {
                broadcastPulse({ type, event });
            },
            (err) => {
                if (err) {
                    console.error('Pulse Watch error/close:', err);
                }
                if (pulseClients.length > 0) {
                    setTimeout(startClusterPulseWatcher, 5000);
                }
            }
        ).then(req => {
            pulseWatchReq = req;
        }).catch(err => {
            console.error('Failed to start Pulse Watcher promise:', err);
            if (pulseClients.length > 0) {
                setTimeout(startClusterPulseWatcher, 5000);
            }
        });
    } catch (err) {
        console.error('Pulse Watcher synchronous error:', err);
        if (pulseClients.length > 0) {
            setTimeout(startClusterPulseWatcher, 5000);
        }
    }
}

app.get('/api/cluster/pulse', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.write('\n');

    const clientId = Date.now();
    pulseClients.push({ id: clientId, res });

    if (pulseClients.length === 1) {
        startClusterPulseWatcher();
    }

    req.on('close', () => {
        pulseClients = pulseClients.filter(c => c.id !== clientId);
        if (pulseClients.length === 0 && pulseWatchReq) {
            try { pulseWatchReq.abort(); } catch(e) {}
            pulseWatchReq = null;
        }
    });
});

// Smart Pod Doctor diagnostics check route
app.get('/api/diagnose/:namespace/:podName', async (req, res) => {
    const { namespace, podName } = req.params;
    try {
        const pod = await k8sCoreApi.readNamespacedPod({ name: podName, namespace });
        const eventsResponse = await k8sCoreApi.listNamespacedEvent({ namespace });
        const allEvents = eventsResponse.items || [];
        const events = allEvents.filter(e => e.involvedObject && e.involvedObject.uid === pod.metadata.uid);
        
        let targetContainer = null;
        if (pod.status?.containerStatuses) {
            const failing = pod.status.containerStatuses.find(cs => cs.state?.waiting || (cs.state?.terminated && cs.state.terminated.exitCode !== 0));
            if (failing) {
                targetContainer = failing.name;
            }
        }
        if (!targetContainer && pod.spec?.containers?.length > 0) {
            targetContainer = pod.spec.containers[0].name;
        }

        let logTail = '';
        if (targetContainer) {
            try {
                const logRes = await k8sCoreApi.readNamespacedPodLog({
                    name: podName,
                    namespace,
                    container: targetContainer,
                    tailLines: 50
                });
                logTail = logRes;
            } catch (logErr) {
                logTail = `Could not fetch logs for container ${targetContainer}: ${logErr.message}`;
            }
        } else {
            logTail = 'No containers found in pod spec.';
        }

        let diagnosis = {
            status: 'Healthy',
            summary: 'No issues detected. The pod is running normally.',
            details: [],
            events: events.map(e => ({
                type: e.type,
                reason: e.reason,
                message: e.message,
                firstTimestamp: e.firstTimestamp || e.metadata.creationTimestamp,
                count: e.count
            })),
            logTail: logTail
        };

        const containerStatuses = [
            ...(pod.status?.containerStatuses || []),
            ...(pod.status?.initContainerStatuses || [])
        ];

        let hasIssue = false;

        containerStatuses.forEach(cs => {
            const name = cs.name;
            const state = cs.state || {};
            const lastState = cs.lastState || {};
            
            if (state.waiting) {
                hasIssue = true;
                const reason = state.waiting.reason;
                const message = state.waiting.message || '';
                
                if (reason === 'CrashLoopBackOff') {
                    diagnosis.status = 'Critical';
                    const exitCode = lastState.terminated?.exitCode;
                    const termReason = lastState.terminated?.reason;
                    let detail = `Container '${name}' is in CrashLoopBackOff.`;
                    if (exitCode !== undefined) {
                        detail += ` It terminated with exit code ${exitCode} (${termReason || 'unknown reason'}).`;
                    }
                    if (exitCode === 137 || termReason === 'OOMKilled') {
                        detail += ` Root cause: Out Of Memory (OOMKilled). The container exceeded its memory limit.`;
                    } else if (exitCode === 1) {
                        detail += ` This usually indicates an application crash or misconfiguration.`;
                    } else if (exitCode === 127) {
                        detail += ` Command or entrypoint binary not found.`;
                    }
                    diagnosis.details.push(detail);
                } else if (reason === 'ErrImagePull' || reason === 'ImagePullBackOff') {
                    diagnosis.status = 'Critical';
                    diagnosis.details.push(`Container '${name}' failed to pull image. Reason: ${reason}. Check if the image reference is correct, the registry exists, and credentials are correct.`);
                } else if (reason === 'CreateContainerConfigError' || reason === 'CreateContainerError') {
                    diagnosis.status = 'Critical';
                    diagnosis.details.push(`Container '${name}' failed to create. Reason: ${reason}. This is often caused by a missing ConfigMap, Secret, or invalid command arguments.`);
                } else {
                    diagnosis.status = 'Warning';
                    diagnosis.details.push(`Container '${name}' is waiting. Reason: ${reason}. Message: ${message}`);
                }
            }
            
            if (state.terminated && state.terminated.exitCode !== 0) {
                hasIssue = true;
                const term = state.terminated;
                let detail = `Container '${name}' terminated with non-zero exit code ${term.exitCode}. Reason: ${term.reason}.`;
                if (term.reason === 'OOMKilled') {
                    diagnosis.status = 'Critical';
                    detail += ` The container was terminated because it ran out of memory. Try increasing the memory limits in the deployment spec.`;
                } else {
                    if (diagnosis.status !== 'Critical') diagnosis.status = 'Warning';
                }
                diagnosis.details.push(detail);
            }
        });

        if (pod.status?.phase === 'Pending') {
            hasIssue = true;
            diagnosis.status = 'Critical';
            let unschedulable = false;
            (pod.status.conditions || []).forEach(cond => {
                if (cond.type === 'PodScheduled' && cond.status === 'False' && cond.reason === 'Unschedulable') {
                    unschedulable = true;
                    diagnosis.details.push(`Pod scheduling failed. Reason: Unschedulable. Message: ${cond.message || 'No resources available.'}`);
                }
            });
            if (!unschedulable) {
                diagnosis.details.push(`Pod is pending. Current conditions: ${(pod.status.conditions || []).map(c => `${c.type}=${c.status}`).join(', ')}`);
            }
        }

        const warnings = events.filter(e => e.type === 'Warning');
        warnings.forEach(w => {
            if (w.reason === 'Unhealthy') {
                hasIssue = true;
                if (diagnosis.status !== 'Critical') diagnosis.status = 'Warning';
                diagnosis.details.push(`Probe failure: ${w.message} (Reason: ${w.reason}, Count: ${w.count})`);
            } else if (w.reason === 'FailedScheduling') {
                hasIssue = true;
                diagnosis.status = 'Critical';
                diagnosis.details.push(`Scheduling issue: ${w.message}`);
            } else if (w.reason === 'FailedMount') {
                hasIssue = true;
                diagnosis.status = 'Critical';
                diagnosis.details.push(`Volume mount failure: ${w.message}`);
            }
        });

        if (hasIssue) {
            if (diagnosis.status === 'Critical') {
                diagnosis.summary = `Critical issues detected in pod '${podName}'. Actions are required to restore service.`;
            } else {
                diagnosis.summary = `Warnings detected in pod '${podName}'. The resource may be unstable or misconfigured.`;
            }
        }

        res.json(diagnosis);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

// Helm upgrade values
app.post('/api/helm/:namespace/:name/upgrade', (req, res) => {
    const { namespace, name } = req.params;
    const { valuesYaml } = req.body;
    if (!valuesYaml) return res.status(400).json({ error: 'valuesYaml is required' });
    
    // Find chart name from helm list
    exec(`helm list --namespace ${namespace} -o json`, (errList, stdoutList) => {
        let chartRef = '';
        if (!errList) {
            try {
                const list = JSON.parse(stdoutList);
                const rel = list.find(r => r.name === name);
                if (rel && rel.chart) {
                    const lastDashIdx = rel.chart.lastIndexOf('-');
                    const baseChartName = lastDashIdx > 0 ? rel.chart.substring(0, lastDashIdx) : rel.chart;
                    
                    const localPath = path.join(__dirname, 'charts', baseChartName);
                    if (fs.existsSync(localPath)) {
                        chartRef = `./charts/${baseChartName}`;
                    } else {
                        chartRef = baseChartName;
                    }
                }
            } catch (e) {
                console.error('Failed to parse helm list in upgrade:', e);
            }
        }
        
        if (!chartRef) {
            chartRef = name;
        }
        
        let cmd = `helm upgrade ${name} ${chartRef} --namespace ${namespace}`;
        const tempFileName = `temp-values-${Date.now()}-${Math.floor(Math.random() * 1000)}.yaml`;
        const tempFilePath = path.join(__dirname, tempFileName);
        
        try {
            fs.writeFileSync(tempFilePath, valuesYaml, 'utf8');
            cmd += ` -f "${tempFilePath}"`;
        } catch (err) {
            return res.status(500).json({ error: 'Failed to write temporary values file: ' + err.message });
        }
        
        exec(cmd, (error, stdout, stderr) => {
            if (fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
            }
            if (error) return res.status(500).json({ error: error.message || stderr });
            res.json({ success: true, output: stdout });
        });
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

// Port Forward Proxy
app.all(/^\/api\/portforward\/proxy\/(\d+)(.*)/, (req, res) => {
    const localPort = req.params[0];
    let subpath = req.params[1] || '/';
    
    const queryIndex = req.originalUrl.indexOf('?');
    if (queryIndex !== -1) {
        subpath += req.originalUrl.substring(queryIndex);
    }

    const headers = { ...req.headers };
    headers.host = `127.0.0.1:${localPort}`;

    const proxyReq = http.request({
        host: '127.0.0.1',
        port: Number(localPort),
        path: subpath,
        method: req.method,
        headers: headers
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error(`Proxy error for port ${localPort} and path ${subpath}:`, err);
        res.status(502).send('Proxy error: ' + err.message);
    });

    req.pipe(proxyReq, { end: true });
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

function startTask(cmd, args, cwd = __dirname, onClose = null) {
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
        if (onClose) {
            try { onClose(code); } catch(e) { console.error('onClose callback error:', e); }
        }
    });
    
    child.on('error', (err) => {
        activeTasks[taskId].status = 'failed';
        activeTasks[taskId].logs += `\nError: ${err.message}\n`;
        if (onClose) {
            try { onClose(-1); } catch(e) { console.error('onClose callback error:', e); }
        }
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

// Helm get revision values route
app.get('/api/helm/:namespace/:name/values/revision/:revision', (req, res) => {
    const { namespace, name, revision } = req.params;
    const cmd = `helm get values ${name} --revision ${revision} --namespace ${namespace} -o json`;
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            exec(`helm get values ${name} --revision ${revision} --namespace ${namespace}`, (error2, stdout2, stderr2) => {
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

// In-memory caches for scans
const sbomScanCache = new Map();
const vulnsScanCache = new Map();

// Perform a real-time SBOM scan of a container image
app.post('/api/zarf/sbom/scan', (req, res) => {
    const { imageRef } = req.body;
    if (!imageRef) return res.status(400).json({ error: 'imageRef is required' });
    
    if (sbomScanCache.has(imageRef)) {
        return res.json(sbomScanCache.get(imageRef));
    }
    
    let targetRef = imageRef;
    const isLocalRegistry = targetRef.includes('127.0.0.1:31999') || 
                            targetRef.includes('localhost:31999') || 
                            targetRef.includes('zarf-docker-registry.zarf.svc.cluster.local:5000');

    targetRef = targetRef
        .replace('127.0.0.1:31999', 'zarf-docker-registry.zarf.svc.cluster.local:5000')
        .replace('localhost:31999', 'zarf-docker-registry.zarf.svc.cluster.local:5000');

    if (isLocalRegistry) {
        // Force registry scheme for local in-cluster registry scan (no docker daemon in pod)
        if (!targetRef.startsWith('registry:')) {
            targetRef = `registry:${targetRef}`;
        }
        
        const runScan = () => {
            exec(`zarf tools sbom scan "${targetRef}" -o json`, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    return res.status(500).json({ error: error.message || stderr });
                }
                try {
                    const parsed = JSON.parse(stdout);
                    sbomScanCache.set(imageRef, parsed);
                    res.json(parsed);
                } catch (parseErr) {
                    res.status(500).json({ error: 'Failed to parse SBOM JSON: ' + parseErr.message, raw: stdout.substring(0, 1000) });
                }
            });
        };
        
        ensureZarfRegistryLogin(runScan, (err) => {
            res.status(500).json({ error: 'Local registry authentication failed: ' + err.message });
        });
    } else {
        exec(`zarf tools sbom scan "${targetRef}" -o json`, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ error: error.message || stderr });
            }
            try {
                const parsed = JSON.parse(stdout);
                sbomScanCache.set(imageRef, parsed);
                res.json(parsed);
            } catch (parseErr) {
                res.status(500).json({ error: 'Failed to parse SBOM JSON: ' + parseErr.message, raw: stdout.substring(0, 1000) });
            }
        });
    }
});

// Perform a real-time vulnerability scan of a container image using Grype
app.post('/api/zarf/sbom/vulnerabilities', (req, res) => {
    const { imageRef } = req.body;
    if (!imageRef) return res.status(400).json({ error: 'imageRef is required' });
    
    if (vulnsScanCache.has(imageRef)) {
        return res.json(vulnsScanCache.get(imageRef));
    }
    
    let targetRef = imageRef;
    const isLocalRegistry = targetRef.includes('127.0.0.1:31999') || 
                            targetRef.includes('localhost:31999') || 
                            targetRef.includes('zarf-docker-registry.zarf.svc.cluster.local:5000');

    targetRef = targetRef
        .replace('127.0.0.1:31999', 'zarf-docker-registry.zarf.svc.cluster.local:5000')
        .replace('localhost:31999', 'zarf-docker-registry.zarf.svc.cluster.local:5000');

    const execOptions = {
        maxBuffer: 25 * 1024 * 1024,
        env: {
            ...process.env,
            GRYPE_DB_AUTO_UPDATE: 'false',
            GRYPE_CHECK_FOR_APP_UPDATE: 'false',
            GRYPE_REGISTRY_INSECURE_USE_HTTP: 'true',
            GRYPE_REGISTRY_INSECURE_SKIP_TLS_VERIFY: 'true'
        }
    };

    if (isLocalRegistry) {
        if (!targetRef.startsWith('registry:')) {
            targetRef = `registry:${targetRef}`;
        }
        
        const runScan = () => {
            exec(`grype "${targetRef}" -o json`, execOptions, (error, stdout, stderr) => {
                if (error) {
                    return res.status(500).json({ error: error.message || stderr });
                }
                try {
                    const parsed = JSON.parse(stdout);
                    vulnsScanCache.set(imageRef, parsed);
                    res.json(parsed);
                } catch (parseErr) {
                    res.status(500).json({ error: 'Failed to parse Vulnerability JSON: ' + parseErr.message, raw: stdout.substring(0, 1000) });
                }
            });
        };
        
        ensureZarfRegistryLogin(runScan, (err) => {
            res.status(500).json({ error: 'Local registry authentication failed: ' + err.message });
        });
    } else {
        let scanRef = targetRef;
        if (!scanRef.startsWith('registry:')) {
            scanRef = `registry:${scanRef}`;
        }
        exec(`grype "${scanRef}" -o json`, execOptions, (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ error: error.message || stderr });
            }
            try {
                const parsed = JSON.parse(stdout);
                vulnsScanCache.set(imageRef, parsed);
                res.json(parsed);
            } catch (parseErr) {
                res.status(500).json({ error: 'Failed to parse Vulnerability JSON: ' + parseErr.message, raw: stdout.substring(0, 1000) });
            }
        });
    }
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

// Zarf tools registry pull (copy from upstream)
app.post('/api/zarf/registry/pull', (req, res) => {
    const { source, target } = req.body;
    if (!source || !target) return res.status(400).json({ error: 'source and target are required' });
    
    const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
    const runPull = () => {
        const targetRef = target.includes(':') ? target : `${target}:latest`;
        const fullTarget = `${registryUrl}/${targetRef}`;
        
        const taskId = startTask('zarf', [
            'tools', 'registry', 'copy',
            source,
            fullTarget,
            '--insecure'
        ]);
        res.json({ success: true, taskId });
    };
    ensureZarfRegistryLogin(runPull, (err) => res.status(500).json({ error: err.message }));
});

// Zarf tools registry push (tarball upload)
app.post('/api/zarf/registry/push', (req, res) => {
    const targetRef = req.headers['x-target-ref'];
    if (!targetRef) return res.status(400).json({ error: 'x-target-ref header is required' });

    const tempDir = '/tmp';
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = path.join(tempDir, `image-${Date.now()}-${Math.floor(Math.random() * 1000)}.tar`);
    const outStream = fs.createWriteStream(tempPath);
    
    req.pipe(outStream);
    
    outStream.on('error', (err) => {
        console.error('File write error:', err);
        res.status(500).json({ error: 'Failed to write uploaded image' });
    });

    outStream.on('finish', () => {
        const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
        const fullTarget = `${registryUrl}/${targetRef}`;
        
        const runPush = () => {
            const taskId = startTask('zarf', [
                'tools', 'registry', 'push',
                tempPath,
                fullTarget,
                '--insecure'
            ], __dirname, () => {
                fs.unlink(tempPath, (err) => {
                    if (err) console.error('Failed to delete temp image upload:', err);
                });
            });
            res.json({ success: true, taskId });
        };
        
        ensureZarfRegistryLogin(runPush, (err) => {
            fs.unlink(tempPath, () => {});
            res.status(500).json({ error: err.message });
        });
    });
});


// Pod File Explorer: Download File
app.get('/api/resource/pods/:namespace/:name/files/download', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, container, isDir } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    
    try {
        let containerName = container;
        if (!containerName) {
            const podInfo = await k8sCoreApi.readNamespacedPod({ name, namespace });
            containerName = podInfo.spec.containers[0].name;
        }
        
        const { spawn } = require('child_process');
        let cp;
        
        if (isDir === 'true') {
            let normalizedPath = filePath;
            if (normalizedPath.endsWith('/') && normalizedPath !== '/') {
                normalizedPath = normalizedPath.slice(0, -1);
            }
            const parts = normalizedPath.split('/');
            const folderName = parts.pop() || 'folder';
            const parentDir = parts.join('/') || '/';

            res.setHeader('Content-Disposition', `attachment; filename="${folderName}.tar.gz"`);
            res.setHeader('Content-Type', 'application/gzip');

            cp = spawn('kubectl', [
                'exec',
                '-n', namespace,
                name,
                '-c', containerName,
                '--',
                'tar', '-czf', '-', '-C', parentDir, folderName
            ]);
        } else {
            const filename = filePath.split('/').pop() || 'file';
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/octet-stream');

            cp = spawn('kubectl', [
                'exec',
                '-n', namespace,
                name,
                '-c', containerName,
                '--',
                'cat', filePath
            ]);
        }
        
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

// Pod File Explorer: View File (cat)
app.get('/api/resource/pods/:namespace/:name/files/view', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, container } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    
    try {
        let containerName = container;
        if (!containerName) {
            const podInfo = await k8sCoreApi.readNamespacedPod({ name, namespace });
            containerName = podInfo.spec.containers[0].name;
        }
        
        exec(`kubectl exec -n ${namespace} ${name} -c ${containerName} -- cat "${filePath.replace(/"/g, '\\"')}"`, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ error: error.message || stderr });
            }
            res.json({ content: stdout });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pod File Explorer: Save File (cat >)
app.post('/api/resource/pods/:namespace/:name/files/save', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, content, container } = req.body;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    if (content === undefined) return res.status(400).json({ error: 'content is required' });
    
    try {
        let containerName = container;
        if (!containerName) {
            const podInfo = await k8sCoreApi.readNamespacedPod({ name, namespace });
            containerName = podInfo.spec.containers[0].name;
        }
        
        const cmd = `cat > "${filePath.replace(/"/g, '\\"')}"`;
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
        
        cp.stdin.write(content);
        cp.stdin.end();
        
        let errData = '';
        cp.stderr.on('data', chunk => errData += chunk.toString());
        
        cp.on('close', (code) => {
            if (code === 0) {
                res.json({ success: true, message: 'File saved successfully' });
            } else {
                res.status(500).json({ error: errData || `Failed to save file with exit code ${code}` });
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

// Kubernetes Configuration Linter & Security Auditor
app.get('/api/cluster/audit', async (req, res) => {
    try {
        const [
            podsRes,
            deploymentsRes,
            servicesRes,
            nodesRes,
            namespacesRes,
            netpolsRes,
            quotasRes,
            limitRangesRes,
            rolesRes,
            roleBindingsRes,
            clusterRolesRes,
            clusterRoleBindingsRes,
            ingressesRes,
            cronJobsRes,
            versionRes
        ] = await Promise.all([
            k8sCoreApi.listPodForAllNamespaces(),
            k8sAppsApi.listDeploymentForAllNamespaces(),
            k8sCoreApi.listServiceForAllNamespaces(),
            k8sCoreApi.listNode(),
            k8sCoreApi.listNamespace(),
            k8sNetApi.listNetworkPolicyForAllNamespaces(),
            k8sCoreApi.listResourceQuotaForAllNamespaces(),
            k8sCoreApi.listLimitRangeForAllNamespaces(),
            k8sRbacApi.listRoleForAllNamespaces(),
            k8sRbacApi.listRoleBindingForAllNamespaces(),
            k8sRbacApi.listClusterRole(),
            k8sRbacApi.listClusterRoleBinding(),
            k8sNetApi.listIngressForAllNamespaces(),
            k8sBatchApi.listCronJobForAllNamespaces(),
            kc.makeApiClient(k8s.VersionApi).getCode().catch(err => {
                console.warn('Failed to fetch cluster version:', err);
                return { gitVersion: 'v1.30.0' }; // fallback
            })
        ]);

        const pods = podsRes.items || [];
        const deployments = deploymentsRes.items || [];
        const services = servicesRes.items || [];
        const nodes = nodesRes.items || [];
        const namespaces = namespacesRes.items || [];
        const netpols = netpolsRes.items || [];
        const quotas = quotasRes.items || [];
        const limitRanges = limitRangesRes.items || [];
        const roles = rolesRes.items || [];
        const roleBindings = roleBindingsRes.items || [];
        const clusterRoles = clusterRolesRes.items || [];
        const clusterRoleBindings = clusterRoleBindingsRes.items || [];
        const ingresses = ingressesRes.items || [];
        const cronJobs = cronJobsRes.items || [];
        const clusterVersion = versionRes.gitVersion || 'v1.30.0';

        const minorMatch = clusterVersion.match(/v?1\.(\d+)/);
        const minorVersion = minorMatch ? parseInt(minorMatch[1], 10) : 30;

        const issues = [];
        let criticalCount = 0;
        let errorCount = 0;
        let warningCount = 0;
        let infoCount = 0;

        const addIssue = (severity, category, rule, message, resource, namespace = 'N/A') => {
            if (severity === 'Critical') criticalCount++;
            else if (severity === 'Error') errorCount++;
            else if (severity === 'Warning') warningCount++;
            else if (severity === 'Info') infoCount++;

            issues.push({
                severity,
                category,
                rule,
                message,
                resource,
                namespace
            });
        };

        // 1. Audit Nodes
        nodes.forEach(node => {
            const name = node.metadata.name;
            const readyCond = (node.status?.conditions || []).find(c => c.type === 'Ready');
            if (!readyCond || readyCond.status !== 'True') {
                addIssue(
                    'Critical',
                    'Reliability',
                    'Node Not Ready',
                    `Node '${name}' is not reporting a Ready status. Current status: ${readyCond ? readyCond.status : 'Unknown'}.`,
                    `Node/${name}`
                );
            }
        });

        // Helper to check container specs
        const auditContainers = (containers, podName, namespace, controllerName, kind) => {
            if (!containers) return;
            containers.forEach(c => {
                const cName = c.name;
                const refName = controllerName ? `${kind}/${controllerName} (Container: ${cName})` : `${kind}/${podName} (Container: ${cName})`;

                // Resource Limits
                if (!c.resources?.limits || !c.resources.limits.cpu || !c.resources.limits.memory) {
                    addIssue(
                        'Warning',
                        'Efficiency',
                        'No CPU/Memory Limit',
                        `Container '${cName}' has no resource limits configured. A runaway container can exhaust host node resources.`,
                        refName,
                        namespace
                    );
                }

                // Resource Requests
                if (!c.resources?.requests || !c.resources.requests.cpu || !c.resources.requests.memory) {
                    addIssue(
                        'Warning',
                        'Efficiency',
                        'No CPU/Memory Request',
                        `Container '${cName}' has no resource requests configured. Kubernetes scheduler cannot guarantee optimal node scheduling without requests.`,
                        refName,
                        namespace
                    );
                }

                // Security: Privileged
                if (c.securityContext?.privileged === true) {
                    addIssue(
                        'Critical',
                        'Security',
                        'Privileged Container',
                        `Container '${cName}' is running in privileged mode. This grants root-level privileges on the host kernel.`,
                        refName,
                        namespace
                    );
                }

                // Security: Allow Privilege Escalation
                if (c.securityContext?.allowPrivilegeEscalation !== false) {
                    addIssue(
                        'Warning',
                        'Security',
                        'Privilege Escalation Allowed',
                        `Container '${cName}' allows privilege escalation. Container processes can gain more privileges than their parent process.`,
                        refName,
                        namespace
                    );
                }

                // Security: Run as Non Root
                const runAsNonRoot = c.securityContext?.runAsNonRoot === true || c.securityContext?.runAsUser > 0;
                if (!runAsNonRoot) {
                    addIssue(
                        'Warning',
                        'Security',
                        'Running as Root',
                        `Container '${cName}' is not explicitly restricted to run as a non-root user. Running containerized processes as root is a security risk.`,
                        refName,
                        namespace
                    );
                }

                // Bare Secrets in Env
                if (c.env) {
                    c.env.forEach(envVar => {
                        const nameUpper = (envVar.name || '').toUpperCase();
                        
                        // Flag plain text values containing sensitive names
                        const isSensitiveName = nameUpper.includes('PASSWORD') || nameUpper.includes('SECRET') || nameUpper.includes('TOKEN') || nameUpper.includes('KEY') || nameUpper.includes('PASS') || nameUpper.includes('AUTH');
                        const isPlainValue = envVar.value !== undefined && !envVar.valueFrom;

                        if (isSensitiveName && isPlainValue && String(envVar.value).length > 0) {
                            addIssue(
                                'Warning',
                                'Security',
                                'Plaintext Secret in Env',
                                `Container '${cName}' exposes sensitive environment variable '${envVar.name}' in plaintext. Use secretKeyRef instead.`,
                                refName,
                                namespace
                            );
                        }
                    });
                }
            });
        };

        // 2. Audit Pods
        pods.forEach(pod => {
            const name = pod.metadata.name;
            const ns = pod.metadata.namespace;
            const ownerRef = pod.metadata.ownerReferences?.[0];
            const controllerName = ownerRef ? ownerRef.name : null;
            const controllerKind = ownerRef ? ownerRef.kind : 'Pod';

            // Check Host Namespaces
            if (pod.spec?.hostNetwork === true) {
                addIssue(
                    'Critical',
                    'Security',
                    'Host Network Shared',
                    `Pod '${name}' shares the host network namespace. This allows access to host loopback devices and network traffic.`,
                    `${controllerKind}/${controllerName || name}`,
                    ns
                );
            }
            if (pod.spec?.hostPID === true) {
                addIssue(
                    'Critical',
                    'Security',
                    'Host PID Shared',
                    `Pod '${name}' shares the host process ID (PID) namespace. It can inspect and terminate processes on the host.`,
                    `${controllerKind}/${controllerName || name}`,
                    ns
                );
            }
            if (pod.spec?.hostIPC === true) {
                addIssue(
                    'Critical',
                    'Security',
                    'Host IPC Shared',
                    `Pod '${name}' shares the host IPC namespace. It can read/write shared memory segments on the host.`,
                    `${controllerKind}/${controllerName || name}`,
                    ns
                );
            }

            // Check HostPath volumes
            const volumes = pod.spec?.volumes || [];
            volumes.forEach(vol => {
                if (vol.hostPath) {
                    addIssue(
                        'Critical',
                        'Security',
                        'HostPath Volume Mounted',
                        `Pod '${name}' mounts host directory '${vol.hostPath.path}' via hostPath volume '${vol.name}'. If compromised, the pod can access the host filesystem.`,
                        `${controllerKind}/${controllerName || name}`,
                        ns
                    );
                }
            });

            // Container Checks (only if direct Pod, to avoid duplicate alerts if we already check templates via Deployments)
            if (!ownerRef || ownerRef.kind !== 'ReplicaSet') {
                auditContainers(pod.spec?.containers, name, ns, null, 'Pod');
                auditContainers(pod.spec?.initContainers, name, ns, null, 'Pod');
            }
        });

        // 3. Audit Deployments
        deployments.forEach(dep => {
            const name = dep.metadata.name;
            const ns = dep.metadata.namespace;

            // Single Replica Check
            const replicas = dep.spec?.replicas ?? 1;
            if (replicas === 1) {
                addIssue(
                    'Warning',
                    'Reliability',
                    'Single Replica Deployment',
                    `Deployment '${name}' has only 1 replica. A single node crash or pod restart will cause downtime.`,
                    `Deployment/${name}`,
                    ns
                );
            }

            // Container Checks on Deployment Templates
            const templateSpec = dep.spec?.template?.spec;
            if (templateSpec) {
                auditContainers(templateSpec.containers, name, ns, name, 'Deployment');
                auditContainers(templateSpec.initContainers, name, ns, name, 'Deployment');

                // Probes Check (Liveness / Readiness)
                templateSpec.containers.forEach(c => {
                    if (!c.livenessProbe || !c.readinessProbe) {
                        addIssue(
                            'Warning',
                            'Reliability',
                            'Missing Probes',
                            `Deployment '${name}' container '${c.name}' is missing liveness or readiness probes. Kubernetes cannot monitor healthy containers.`,
                            `Deployment/${name} (Container: ${c.name})`,
                            ns
                        );
                    }
                });
            }
        });

        // 4. Audit Services
        services.forEach(svc => {
            const name = svc.metadata.name;
            const ns = svc.metadata.namespace;
            const selector = svc.spec?.selector;

            // Skip Headless/ExternalName/Kube-system services
            if (svc.spec?.type === 'ExternalName' || name === 'kubernetes') return;

            if (selector && Object.keys(selector).length > 0) {
                // Find matching pods
                const matchingPods = pods.filter(pod => {
                    if (pod.metadata.namespace !== ns) return false;
                    const labels = pod.metadata.labels || {};
                    return Object.entries(selector).every(([k, v]) => labels[k] === v);
                });

                if (matchingPods.length === 0) {
                    addIssue(
                        'Error',
                        'Reliability',
                        'Service Lacks Matching Pods',
                        `Service '${name}' selector does not match any running pods. Incoming traffic to this service will fail.`,
                        `Service/${name}`,
                        ns
                    );
                }
            } else {
                if (svc.spec?.type !== 'ExternalName' && svc.spec?.clusterIP !== 'None') {
                     addIssue(
                        'Info',
                        'Reliability',
                        'Service Without Selector',
                        `Service '${name}' does not define a pod selector.`,
                        `Service/${name}`,
                        ns
                    );
                }
            }
        });

        // 5. Audit Network Policy Coverage
        pods.forEach(pod => {
            const podName = pod.metadata.name;
            const ns = pod.metadata.namespace;
            const podLabels = pod.metadata.labels || {};

            if (ns === 'kube-system' || ns === 'kube-public' || ns === 'kube-node-lease' || ns === 'local-path-storage') {
                return;
            }

            const nsNetpols = netpols.filter(np => np.metadata.namespace === ns);
            let hasCoverage = false;
            
            if (nsNetpols.length > 0) {
                hasCoverage = nsNetpols.some(np => {
                    const selector = np.spec?.podSelector;
                    if (!selector || !selector.matchLabels || Object.keys(selector.matchLabels).length === 0) {
                        return true;
                    }
                    return Object.entries(selector.matchLabels).every(([k, v]) => podLabels[k] === v);
                });
            }

            if (!hasCoverage) {
                addIssue(
                    'Warning',
                    'Security',
                    'Pod Missing NetworkPolicy',
                    `Pod '${podName}' is not targeted by any NetworkPolicy. It runs without ingress/egress network isolation.`,
                    `Pod/${podName}`,
                    ns
                );
            }
        });

        // 6. Audit RBAC Policies for Overprivileged ServiceAccounts
        const analyzeRoleRules = (rules) => {
            if (!rules || rules.length === 0) return null;
            const risks = [];
            rules.forEach(rule => {
                const verbs = rule.verbs || [];
                const resources = rule.resources || [];
                
                const hasWildcardVerb = verbs.includes('*');
                const hasEscalate = verbs.includes('escalate');
                const hasBind = verbs.includes('bind');
                const hasExec = verbs.includes('exec') || (verbs.includes('create') && resources.includes('pods/exec'));
                
                const hasWildcardResource = resources.includes('*');
                const hasSecrets = resources.includes('secrets');
                const hasPods = resources.includes('pods');
                
                if (hasWildcardVerb && hasWildcardResource) {
                    risks.push('wildcard verbs on all resources (*/*)');
                } else {
                    const highRiskVerbs = [];
                    if (hasWildcardVerb) highRiskVerbs.push('*');
                    if (hasEscalate) highRiskVerbs.push('escalate');
                    if (hasBind) highRiskVerbs.push('bind');
                    if (hasExec) highRiskVerbs.push('exec');
                    
                    const criticalResources = [];
                    if (hasWildcardResource) criticalResources.push('*');
                    if (hasSecrets) criticalResources.push('secrets');
                    if (hasPods) criticalResources.push('pods');
                    
                    if (highRiskVerbs.length > 0 && criticalResources.length > 0) {
                        risks.push(`verbs [${highRiskVerbs.join(',')}] on resources [${criticalResources.join(',')}]`);
                    }
                }
            });
            return risks.length > 0 ? risks : null;
        };

        const roleMap = new Map();
        roles.forEach(r => roleMap.set(`${r.metadata.namespace}/${r.metadata.name}`, r));
        
        const clusterRoleMap = new Map();
        clusterRoles.forEach(cr => clusterRoleMap.set(cr.metadata.name, cr));

        const checkBinding = (binding, isClusterScope) => {
            const bindingName = binding.metadata.name;
            const ns = binding.metadata.namespace || 'Cluster';
            const roleRef = binding.roleRef;
            if (!roleRef) return;

            let referencedRole = null;
            if (roleRef.kind === 'ClusterRole') {
                referencedRole = clusterRoleMap.get(roleRef.name);
            } else if (roleRef.kind === 'Role') {
                const searchNs = isClusterScope ? 'default' : ns;
                referencedRole = roleMap.get(`${binding.metadata.namespace}/${roleRef.name}`);
            }

            if (!referencedRole) return;
            const risks = analyzeRoleRules(referencedRole.rules);
            if (risks) {
                const subjects = binding.subjects || [];
                subjects.forEach(sub => {
                    if (sub.kind === 'ServiceAccount') {
                        const saNs = sub.namespace || binding.metadata.namespace || 'default';
                        const saName = sub.name;
                        
                        if ((saNs === 'kube-system' || saNs === 'zarf') && (saName === 'default' || saName.startsWith('kube-') || saName.startsWith('zarf-'))) {
                            return;
                        }

                        addIssue(
                            'Critical',
                            'Security',
                            'Overprivileged ServiceAccount',
                            `ServiceAccount '${saName}' is bound to ${roleRef.kind} '${roleRef.name}' via Binding '${bindingName}', granting: ${risks.join('; ')}.`,
                            `ServiceAccount/${saName}`,
                            saNs
                        );
                    }
                });
            }
        };

        roleBindings.forEach(b => checkBinding(b, false));
        clusterRoleBindings.forEach(b => checkBinding(b, true));

        // 7. Audit Namespace ResourceQuotas & LimitRanges
        const systemNamespaces = ['kube-system', 'kube-public', 'kube-node-lease', 'local-path-storage', 'zarf'];
        namespaces.forEach(nsObj => {
            const nsName = nsObj.metadata.name;
            if (systemNamespaces.includes(nsName)) return;

            const nsQuotas = quotas.filter(q => q.metadata.namespace === nsName);
            if (nsQuotas.length === 0) {
                addIssue(
                    'Warning',
                    'Efficiency',
                    'Namespace Missing ResourceQuota',
                    `Namespace '${nsName}' has no ResourceQuota configured. CPU/Memory usage is unrestricted at the namespace scope.`,
                    `Namespace/${nsName}`,
                    nsName
                );
            }

            const nsLimitRanges = limitRanges.filter(lr => lr.metadata.namespace === nsName);
            if (nsLimitRanges.length === 0) {
                addIssue(
                    'Warning',
                    'Efficiency',
                    'Namespace Missing LimitRange',
                    `Namespace '${nsName}' has no LimitRange configured. Container requests/limits will default to host-level defaults if omitted.`,
                    `Namespace/${nsName}`,
                    nsName
                );
            }
        });

        // 8. Audit API Deprecations
        const deprecationRules = [
            {
                kind: 'Ingress',
                apiGroup: 'networking.k8s.io/v1beta1',
                removedIn: 22,
                alternative: 'networking.k8s.io/v1'
            },
            {
                kind: 'CronJob',
                apiGroup: 'batch/v1beta1',
                removedIn: 21,
                alternative: 'batch/v1'
            },
            {
                kind: 'HorizontalPodAutoscaler',
                apiGroup: 'autoscaling/v2beta2',
                removedIn: 26,
                alternative: 'autoscaling/v2'
            }
        ];

        const checkDeprecation = (resourcesList, kind) => {
            resourcesList.forEach(res => {
                const apiVersion = res.apiVersion || '';
                const name = res.metadata.name;
                const ns = res.metadata.namespace || 'default';
                
                const matchedRule = deprecationRules.find(rule => rule.kind === kind && apiVersion.startsWith(rule.apiGroup));
                if (matchedRule && minorVersion >= matchedRule.removedIn) {
                    addIssue(
                        'Error',
                        'Reliability',
                        'Deprecated API Version',
                        `${kind} '${name}' uses apiVersion '${apiVersion}' which is deprecated/removed in v1.${matchedRule.removedIn}+. Use '${matchedRule.alternative}' instead.`,
                        `${kind}/${name}`,
                        ns
                    );
                }
            });
        };

        checkDeprecation(ingresses, 'Ingress');
        checkDeprecation(cronJobs, 'CronJob');

        const weightedViolations = (criticalCount * 4) + (errorCount * 2) + (warningCount * 0.5) + (infoCount * 0.1);
        const totalResources = Math.max(1, nodes.length + deployments.length + services.length + namespaces.length + pods.length);
        const density = weightedViolations / totalResources;
        const score = Math.max(0, Math.round(100 * Math.exp(-0.4 * density)));

        let grade = 'F';
        if (score >= 95) grade = 'A+';
        else if (score >= 90) grade = 'A';
        else if (score >= 80) grade = 'B';
        else if (score >= 70) grade = 'C';
        else if (score >= 60) grade = 'D';

        res.json({
            score,
            grade,
            issues,
            clusterVersion
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Zarf Deployed Package Inspector Secret Reader
app.get('/api/zarf/packages/:name', async (req, res) => {
    const { name } = req.params;
    try {
        const secretName = `zarf-package-${name}`;
        const secret = await k8sCoreApi.readNamespacedSecret({ name: secretName, namespace: 'zarf' });
        
        if (!secret || !secret.data || !secret.data.data) {
            return res.status(404).json({ error: `Zarf package secret '${secretName}' not found` });
        }
        
        const base64Data = secret.data.data;
        const decodedString = Buffer.from(base64Data, 'base64').toString('utf8');
        const parsedJson = JSON.parse(decodedString);
        res.json(parsedJson);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Zarf Deployed Package State Endpoint (State Secret Reader)
app.get('/api/zarf/state', async (req, res) => {
    try {
        const secret = await k8sCoreApi.readNamespacedSecret({ name: 'zarf-state', namespace: 'zarf' });
        if (!secret || !secret.data || !secret.data.state) {
            return res.status(404).json({ error: "Zarf state secret 'zarf-state' not found in 'zarf' namespace" });
        }
        const base64Data = secret.data.state;
        const decodedString = Buffer.from(base64Data, 'base64').toString('utf8');
        const parsedJson = JSON.parse(decodedString);
        
        if (parsedJson.registryInfo) {
            if (parsedJson.registryInfo.pushPassword) parsedJson.registryInfo.pushPassword = '●●●●●●●●';
            if (parsedJson.registryInfo.pullPassword) parsedJson.registryInfo.pullPassword = '●●●●●●●●';
            if (parsedJson.registryInfo.secret) parsedJson.registryInfo.secret = '●●●●●●●●';
        }
        if (parsedJson.gitServer) {
            if (parsedJson.gitServer.pushPassword) parsedJson.gitServer.pushPassword = '●●●●●●●●';
            if (parsedJson.gitServer.pullPassword) parsedJson.gitServer.pullPassword = '●●●●●●●●';
        }
        if (parsedJson.artifactServer) {
            if (parsedJson.artifactServer.pushPassword) parsedJson.artifactServer.pushPassword = '●●●●●●●●';
        }
        if (parsedJson.agentTLS) {
            if (parsedJson.agentTLS.key) parsedJson.agentTLS.key = '●●●●●●●●';
        }
        
        res.json(parsedJson);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all running unique container images in the cluster
app.get('/api/zarf/running-images', async (req, res) => {
    try {
        const pods = await k8sCoreApi.listPodForAllNamespaces();
        const images = new Set();
        
        pods.items.forEach(pod => {
            const containers = [...(pod.spec?.containers || []), ...(pod.spec?.initContainers || [])];
            containers.forEach(c => {
                if (c.image) {
                    images.add(c.image);
                }
            });
            const statuses = [...(pod.status?.containerStatuses || []), ...(pod.status?.initContainerStatuses || [])];
            statuses.forEach(s => {
                if (s.image) images.add(s.image);
            });
        });
        
        res.json(Array.from(images).sort());
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