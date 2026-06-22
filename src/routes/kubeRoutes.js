const express = require('express');
const router = express.Router();
const k8sService = require('../services/k8sService');
const logger = require('../utils/logger');
const stream = require('stream');
const yaml = require('js-yaml');

// Specific routes MUST come before generic ones
router.get('/contexts', async (req, res) => {
    try {
        const data = await k8sService.getContexts();
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/namespaces', async (req, res) => {
    try {
        const namespaces = await k8sService.getNamespaces();
        res.json(namespaces);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/resource/topology', async (req, res) => {
    const { namespace } = req.query;
    try {
        const data = await k8sService.getTopologyData(namespace);
        res.json(data);
    } catch (err) {
        logger.error({ namespace, error: err.message }, 'Error getting topology data');
        res.status(500).json({ error: err.message });
    }
});

const handleGenericResource = async (req, res) => {
    let { kind } = req.params;
    const { namespace } = req.query;
    
    if (kind.startsWith('resource/')) kind = kind.replace('resource/', '');
    
    try {
        const resources = await k8sService.getResources(kind, namespace);
        if (!resources) return res.status(404).json({ error: `Kind ${kind} not found` });
        res.json(resources);
    } catch (err) {
        logger.error({ kind, namespace, error: err.message }, 'Error in handleGenericResource');
        res.status(500).json({ error: err.message });
    }
};

router.get('/resource/:kind', handleGenericResource);
router.get('/:kind', (req, res, next) => {
    if (['namespaces', 'contexts', 'resource', 'topology'].includes(req.params.kind)) return next();
    handleGenericResource(req, res);
});

// Resource Detail Endpoints
router.get('/resource/:kind/:namespace/:name', async (req, res) => {
    const { kind, namespace, name } = req.params;
    try {
        const items = await k8sService.getResources(kind, namespace);
        const item = items.find(i => i.metadata?.name === name);
        if (!item) return res.status(404).json({ error: 'Resource not found' });
        res.json(item);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/resource/:kind/:namespace/:name/yaml', async (req, res) => {
    const { kind, namespace, name } = req.params;
    try {
        const items = await k8sService.getResources(kind, namespace);
        const item = items.find(i => i.metadata.name === name);
        if (!item) return res.status(404).json({ error: 'Resource not found' });
        res.send(yaml.dump(item));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/resource/:kind/:namespace/:name/save', async (req, res) => {
    const { kind, namespace } = req.params;
    const { yaml: yamlContent } = req.body;
    if (!yamlContent) return res.status(400).json({ error: 'yaml content is required' });

    try {
        const { spawn } = require('child_process');
        const args = ['apply', '-f', '-'];
        if (namespace && namespace !== 'all' && namespace !== 'undefined') {
            args.push('-n', namespace);
        }
        
        const cp = spawn('kubectl', args);
        cp.stdin.write(yamlContent);
        cp.stdin.end();

        let stdout = '';
        let stderr = '';
        cp.stdout.on('data', chunk => stdout += chunk.toString());
        cp.stderr.on('data', chunk => stderr += chunk.toString());

        cp.on('close', (code) => {
            if (code === 0) {
                if (typeof k8sService.clearCache === 'function') {
                    k8sService.clearCache(kind, namespace);
                }
                res.json({ success: true, message: stdout.trim() || 'Resource saved successfully' });
            } else {
                res.status(500).json({ error: stderr.trim() || `Failed to apply resource with exit code ${code}` });
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

router.put('/resource/deployments/:namespace/:name/restart', async (req, res) => {
    const { namespace, name } = req.params;
    try {
        const { exec } = require('child_process');
        const cmd = `kubectl rollout restart deployment/${name} -n ${namespace}`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: error.message || stderr });
            if (typeof k8sService.clearCache === 'function') {
                k8sService.clearCache('deployments', namespace);
                k8sService.clearCache('pods', namespace);
            }
            res.json({ success: true, message: stdout.trim() });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/resource/deployments/:namespace/:name/scale', async (req, res) => {
    const { namespace, name } = req.params;
    const { replicas } = req.body;
    if (replicas === undefined || isNaN(Number(replicas))) {
        return res.status(400).json({ error: 'Valid replicas count is required' });
    }
    try {
        const { exec } = require('child_process');
        const cmd = `kubectl scale deployment/${name} --replicas=${replicas} -n ${namespace}`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: error.message || stderr });
            if (typeof k8sService.clearCache === 'function') {
                k8sService.clearCache('deployments', namespace);
            }
            res.json({ success: true, message: stdout.trim() });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Stop a deployment by scaling it to 0 replicas. The current replica count is
// stashed in an annotation so that "start" can restore it later.
router.put('/resource/deployments/:namespace/:name/stop', async (req, res) => {
    const { namespace, name } = req.params;
    try {
        const { exec } = require('child_process');
        const getCmd = `kubectl get deployment/${name} -n ${namespace} -o jsonpath="{.spec.replicas}"`;
        exec(getCmd, (getErr, getOut) => {
            const current = parseInt((getOut || '').trim(), 10);
            const previous = (!getErr && !isNaN(current) && current > 0) ? current : 1;
            const cmd = `kubectl annotate deployment/${name} -n ${namespace} periscope-previous-replicas=${previous} --overwrite && kubectl scale deployment/${name} --replicas=0 -n ${namespace}`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) return res.status(500).json({ error: error.message || stderr });
                if (typeof k8sService.clearCache === 'function') {
                    k8sService.clearCache('deployments', namespace);
                    k8sService.clearCache('pods', namespace);
                }
                res.json({ success: true, message: `Deployment ${name} stopped (scaled to 0)`, previousReplicas: previous });
            });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start a previously-stopped deployment by restoring the replica count saved
// when it was stopped (falling back to 1 if none was recorded).
router.put('/resource/deployments/:namespace/:name/start', async (req, res) => {
    const { namespace, name } = req.params;
    try {
        const { exec } = require('child_process');
        const getCmd = `kubectl get deployment/${name} -n ${namespace} -o jsonpath="{.metadata.annotations.periscope-previous-replicas}"`;
        exec(getCmd, (getErr, getOut) => {
            const saved = parseInt((getOut || '').trim(), 10);
            const bodyReplicas = Number(req.body && req.body.replicas);
            const target = (!getErr && !isNaN(saved) && saved > 0)
                ? saved
                : (!isNaN(bodyReplicas) && bodyReplicas > 0 ? bodyReplicas : 1);
            const cmd = `kubectl scale deployment/${name} --replicas=${target} -n ${namespace}`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) return res.status(500).json({ error: error.message || stderr });
                if (typeof k8sService.clearCache === 'function') {
                    k8sService.clearCache('deployments', namespace);
                    k8sService.clearCache('pods', namespace);
                }
                res.json({ success: true, message: `Deployment ${name} started (scaled to ${target})`, replicas: target });
            });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/resource/:kind/:namespace/:name', async (req, res) => {
    const { kind, namespace, name } = req.params;
    try {
        const { exec } = require('child_process');
        const cmd = `kubectl delete ${kind} ${name} -n ${namespace}`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: error.message || stderr });
            if (typeof k8sService.clearCache === 'function') {
                k8sService.clearCache(kind, namespace);
            }
            res.json({ success: true, message: stdout.trim() });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/resource/:kind/:namespace/:name/events', async (req, res) => {
    const { namespace, name, kind } = req.params;
    try {
        const ns = (namespace && namespace !== 'all') ? namespace : undefined;
        let events;
        if (ns) {
            events = await k8sService.core.listNamespacedEvent({ namespace: ns });
        } else {
            events = await k8sService.core.listEventForAllNamespaces();
        }
        
        const rawItems = events.items || events.body?.items || [];
        const filtered = rawItems.filter(e => 
            e.involvedObject.name === name && 
            (!kind || e.involvedObject.kind.toLowerCase() === kind.toLowerCase().replace(/s$/, ''))
        );
        res.json(filtered);
    } catch (err) {
        logger.error({ name, namespace, kind, error: err.message }, 'Error getting events');
        res.status(500).json({ error: err.message });
    }
});

router.get('/diagnose/:namespace/:podName', async (req, res) => {
    const { namespace, podName } = req.params;
    try {
        const podRes = await k8sService.core.readNamespacedPod({ name: podName, namespace });
        const pod = podRes.body || podRes;
        const eventsResponse = await k8sService.core.listNamespacedEvent({ namespace });
        const allEvents = eventsResponse.items || eventsResponse.body?.items || [];
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
                const logRes = await k8sService.core.readNamespacedPodLog({
                    name: podName,
                    namespace,
                    container: targetContainer,
                    tailLines: 50
                });
                logTail = logRes.body || logRes;
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

router.get('/resource/pods/:namespace/:name/logs', async (req, res) => {
    const { namespace, name } = req.params;
    const { container } = req.query;
    try {
        const response = await k8sService.core.readNamespacedPodLog({
            name, namespace, container: container || undefined, tailLines: 1000
        });
        res.send(response.body || response);
    } catch (err) {
        logger.error(err, 'Error reading pod logs');
        res.status(500).json({ error: err.message });
    }
});

router.post('/resource/pods/:namespace/:name/exec', async (req, res) => {
    const { namespace, name } = req.params;
    const { command, container } = req.body;
    try {
        let containerName = container;
        if (!containerName) {
            const podRes = await k8sService.core.readNamespacedPod({ name, namespace });
            const pod = podRes.body || podRes;
            containerName = pod.spec.containers[0].name;
        }
        const { exec } = require('child_process');
        exec(`kubectl exec -n ${namespace} ${name} -c ${containerName} -- ${command}`, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error && !stdout) return res.status(500).json({ error: error.message || stderr });
            res.json({ stdout, stderr });
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pod File Explorer: Download File/Folder
router.get('/resource/pods/:namespace/:name/files/download', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, container, isDir } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    
    try {
        let containerName = container;
        if (!containerName) {
            const podRes = await k8sService.core.readNamespacedPod({ name, namespace });
            const pod = podRes.body || podRes;
            containerName = pod.spec.containers[0].name;
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

// Pod File Explorer: Upload File
router.post('/resource/pods/:namespace/:name/files/upload', async (req, res) => {
    const { namespace, name } = req.params;
    const { destDir, container } = req.query;
    const filename = req.headers['x-file-name'];
    
    if (!destDir || !filename) {
        return res.status(400).json({ error: 'destDir and x-file-name header are required' });
    }
    
    try {
        let containerName = container;
        if (!containerName) {
            const podRes = await k8sService.core.readNamespacedPod({ name, namespace });
            const pod = podRes.body || podRes;
            containerName = pod.spec.containers[0].name;
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

// Pod File Explorer: View File
router.get('/resource/pods/:namespace/:name/files/view', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, container } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    
    try {
        let containerName = container;
        if (!containerName) {
            const podRes = await k8sService.core.readNamespacedPod({ name, namespace });
            const pod = podRes.body || podRes;
            containerName = pod.spec.containers[0].name;
        }
        
        const { exec } = require('child_process');
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

// Pod File Explorer: Save File
router.post('/resource/pods/:namespace/:name/files/save', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, content, container } = req.body;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    if (content === undefined) return res.status(400).json({ error: 'content is required' });
    
    try {
        let containerName = container;
        if (!containerName) {
            const podRes = await k8sService.core.readNamespacedPod({ name, namespace });
            const pod = podRes.body || podRes;
            containerName = pod.spec.containers[0].name;
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
router.delete('/resource/pods/:namespace/:name/files', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, container } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    
    try {
        let containerName = container;
        if (!containerName) {
            const podRes = await k8sService.core.readNamespacedPod({ name, namespace });
            const pod = podRes.body || podRes;
            containerName = pod.spec.containers[0].name;
        }
        
        const cmd = `rm -rf "${filePath.replace(/"/g, '\\"')}"`;
        const { exec } = require('child_process');
        exec(`kubectl exec -n ${namespace} ${name} -c ${containerName} -- sh -c '${cmd}'`, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: error.message || stderr });
            res.json({ success: true });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
