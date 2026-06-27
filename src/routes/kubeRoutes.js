const express = require('express');
const router = express.Router();
const k8sService = require('../services/k8sService');
const workloadService = require('../services/workloadService');
const diagnoseService = require('../services/diagnoseService');
const logger = require('../utils/logger');
const yaml = require('js-yaml');
const { run } = require('../utils/exec');
const { assertNamespace, assertName, assertKind } = require('../utils/validators');

// Validate path params before any handler runs. Combined with argv-based command
// execution below, this means a hostile :namespace/:name/:kind can neither inject
// shell syntax nor reach an external binary as a malformed identifier.
router.param('namespace', (req, res, next, val) => {
    try { assertNamespace(val); next(); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.param('name', (req, res, next, val) => {
    try { assertName(val); next(); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.param('podName', (req, res, next, val) => {
    try { assertName(val, 'podName'); next(); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.param('kind', (req, res, next, val) => {
    try { assertKind(val.replace(/^resource\//, '')); next(); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

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
        const { message } = await workloadService.applyYaml(kind, namespace, yamlContent);
        res.json({ success: true, message });
    } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

router.put('/resource/deployments/:namespace/:name/restart', async (req, res) => {
    const { namespace, name } = req.params;
    try {
        const { message } = await workloadService.restart(namespace, name);
        res.json({ success: true, message });
    } catch (err) {
        res.status(500).json({ error: err.stderr || err.message });
    }
});

router.put('/resource/deployments/:namespace/:name/scale', async (req, res) => {
    const { namespace, name } = req.params;
    const { replicas } = req.body;
    if (replicas === undefined || isNaN(Number(replicas))) {
        return res.status(400).json({ error: 'Valid replicas count is required' });
    }
    try {
        const { message } = await workloadService.scale(namespace, name, replicas);
        res.json({ success: true, message });
    } catch (err) {
        res.status(500).json({ error: err.stderr || err.message });
    }
});

router.put('/resource/deployments/:namespace/:name/stop', async (req, res) => {
    const { namespace, name } = req.params;
    try {
        const { message, previousReplicas } = await workloadService.stop(namespace, name);
        res.json({ success: true, message, previousReplicas });
    } catch (err) {
        res.status(500).json({ error: err.stderr || err.message });
    }
});

router.put('/resource/deployments/:namespace/:name/start', async (req, res) => {
    const { namespace, name } = req.params;
    try {
        const { message, replicas } = await workloadService.start(namespace, name, req.body && req.body.replicas);
        res.json({ success: true, message, replicas });
    } catch (err) {
        res.status(500).json({ error: err.stderr || err.message });
    }
});

router.delete('/resource/:kind/:namespace/:name', async (req, res) => {
    const { kind, namespace, name } = req.params;
    try {
        const { message } = await workloadService.deleteResource(kind, namespace, name);
        res.json({ success: true, message });
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
        res.json(await diagnoseService.diagnosePod(namespace, podName));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/resource/pods/:namespace/:name/remediate', async (req, res) => {
    const { namespace, name } = req.params;
    const { type, params } = req.body;
    try {
        const { message } = await diagnoseService.remediate(namespace, name, type, params);
        res.json({ success: true, message });
    } catch (err) {
        const status = err.statusCode || 500;
        if (status === 500) logger.error({ namespace, name, type, error: err.message }, 'Failed to apply remediation');
        res.status(status).json({ error: err.message });
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
        const containerName = await k8sService.resolveContainerName(namespace, name, container);
        // `command` runs inside the target pod via `sh -c` (the intended
        // "exec into pod" feature); namespace/name/container are argv elements,
        // so nothing is interpreted by a shell on the server itself.
        try {
            const { stdout, stderr } = await run('kubectl',
                ['exec', '-n', namespace, name, '-c', containerName, '--', 'sh', '-c', String(command)]);
            res.json({ stdout, stderr });
        } catch (error) {
            if (error.stdout) return res.json({ stdout: error.stdout, stderr: error.stderr });
            res.status(500).json({ error: error.stderr || error.message });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pod File Explorer: Download File/Folder
router.get('/resource/pods/:namespace/:name/files/download', async (req, res) => {
    const { namespace, name } = req.params;
    const { path: filePath, container, isDir } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    
    try {
        const containerName = await k8sService.resolveContainerName(namespace, name, container);
        
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
        const containerName = await k8sService.resolveContainerName(namespace, name, container);
        
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
        const containerName = await k8sService.resolveContainerName(namespace, name, container);
        
        // filePath is passed straight to `cat` as a single argv element, so no
        // quoting/escaping is needed and shell metacharacters are inert.
        try {
            const { stdout } = await run('kubectl',
                ['exec', '-n', namespace, name, '-c', containerName, '--', 'cat', filePath]);
            res.json({ content: stdout });
        } catch (error) {
            res.status(500).json({ error: error.stderr || error.message });
        }
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
        const containerName = await k8sService.resolveContainerName(namespace, name, container);
        
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
        const containerName = await k8sService.resolveContainerName(namespace, name, container);
        
        // `rm` receives filePath as a single argv element; no shell on the
        // server side, and `--` stops kubectl/rm from treating it as a flag.
        try {
            await run('kubectl',
                ['exec', '-n', namespace, name, '-c', containerName, '--', 'rm', '-rf', '--', filePath]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.stderr || error.message });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
