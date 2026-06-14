const express = require('express');
const router = express.Router();
const k8s = require('@kubernetes/client-node');
const k8sService = require('../services/k8sService');
const pvcService = require('../services/pvcService');
const alertService = require('../services/alertService');
const pruneService = require('../services/pruneService');
const logger = require('../utils/logger');

// Context Comparisons
router.get('/kube/contexts/comparison', async (req, res) => {
    try {
        const contexts = k8sService.kc.contexts;
        const currentContext = k8sService.kc.currentContext;
        const comparisonList = [];

        for (const ctx of contexts) {
            const kc = new k8s.KubeConfig();
            kc.loadFromDefault();
            try {
                kc.setCurrentContext(ctx.name);
                const core = kc.makeApiClient(k8s.CoreV1Api);
                
                // Fetch basic metrics
                const [nodesRes, podsRes, nsRes] = await Promise.all([
                    core.listNode(),
                    core.listPodForAllNamespaces(),
                    core.listNamespace()
                ]);

                const nodes = nodesRes.items || nodesRes.body?.items || [];
                const pods = podsRes.items || podsRes.body?.items || [];
                const namespaces = nsRes.items || nsRes.body?.items || [];

                comparisonList.push({
                    name: ctx.name,
                    cluster: ctx.cluster,
                    user: ctx.user,
                    isReachable: true,
                    nodeCount: nodes.length,
                    podCount: pods.length,
                    namespaceCount: namespaces.length,
                    isCurrent: ctx.name === currentContext
                });
            } catch (err) {
                // Unreachable or offline context
                comparisonList.push({
                    name: ctx.name,
                    cluster: ctx.cluster,
                    user: ctx.user,
                    isReachable: false,
                    nodeCount: 0,
                    podCount: 0,
                    namespaceCount: 0,
                    isCurrent: ctx.name === currentContext,
                    error: err.message
                });
            }
        }
        res.json(comparisonList);
    } catch (err) {
        logger.error(err, 'Failed to compare cluster contexts');
        res.status(500).json({ error: err.message });
    }
});

// PVC Folder Browser
router.get('/volumes/:namespace/:pvcName/browse', async (req, res) => {
    const { namespace, pvcName } = req.params;
    const { path } = req.query;
    try {
        const files = await pvcService.listFiles(namespace, pvcName, path);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/volumes/:namespace/:pvcName/view', async (req, res) => {
    const { namespace, pvcName } = req.params;
    const { path } = req.query;
    try {
        const content = await pvcService.viewFile(namespace, pvcName, path);
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/volumes/:namespace/:pvcName/delete', async (req, res) => {
    const { namespace, pvcName } = req.params;
    const { path } = req.query;
    try {
        await pvcService.deleteFile(namespace, pvcName, path);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/volumes/:namespace/:pvcName/cleanup', async (req, res) => {
    const { namespace, pvcName } = req.params;
    try {
        await pvcService.deleteHelperPod(namespace, pvcName);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Event Notification / Webhooks
router.get('/alerts/settings', (req, res) => {
    res.json(alertService.getSettings());
});

router.post('/alerts/settings', (req, res) => {
    try {
        alertService.saveSettings(req.body);
        res.json({ success: true, settings: alertService.getSettings() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/alerts/test', async (req, res) => {
    try {
        const success = await alertService.sendNotification('🔔 *Periscope Notification Test*: Alert system is successfully connected!');
        if (success) {
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Failed to send test alert. Verify your Webhook URL.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cluster Cleanup Pruner
router.get('/prune/scan', async (req, res) => {
    try {
        const scanResults = await pruneService.scanOrphaned();
        res.json(scanResults);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/prune/cleanup', async (req, res) => {
    const { resources } = req.body;
    if (!resources || !Array.isArray(resources)) {
        return res.status(400).json({ error: 'resources array is required' });
    }
    try {
        const results = await pruneService.pruneResources(resources);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
