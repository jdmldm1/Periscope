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

module.exports = router;
