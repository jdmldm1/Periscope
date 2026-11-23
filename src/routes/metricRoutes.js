const express = require('express');
const router = express.Router();
const k8sService = require('../services/k8sService');
const usageService = require('../services/usageService');
const logger = require('../utils/logger');
const { queryString, isValidNamespaceOrAll } = require('../utils/validators');
router.get('/nodes', async (req, res) => {
    try {
        const [metricsResponse, nodesResponse] = await Promise.allSettled([
            k8sService.custom.listClusterCustomObject({
                group: 'metrics.k8s.io',
                version: 'v1beta1',
                plural: 'nodes',
            }),
            k8sService.core.listNode(),
        ]);
        const metricsRaw = metricsResponse.status === 'fulfilled' ? metricsResponse.value : { items: [] };
        const metrics = metricsRaw.items || metricsRaw.body?.items || [];
        const nodesRaw = nodesResponse.status === 'fulfilled' ? nodesResponse.value : { items: [] };
        const nodes = nodesRaw.items || [];
        const items = metrics.map((nm) => {
            const node = nodes.find((n) => n.metadata?.name === nm.metadata?.name);
            return {
                ...nm,
                capacity: node
                    ? {
                          cpu: node.status?.capacity?.cpu || '1',
                          memory: node.status?.capacity?.memory || '1Ki',
                      }
                    : { cpu: '1', memory: '1Ki' },
            };
        });
        res.json(items);
    } catch (err) {
        logger.error(err, 'Unexpected error getting node metrics');
        res.json([]);
    }
});
router.get('/pods', async (req, res) => {
    try {
        const response = await k8sService.custom.listClusterCustomObject({
            group: 'metrics.k8s.io',
            version: 'v1beta1',
            plural: 'pods',
        });
        res.json(response.items || response.body?.items || []);
    } catch (err) {
        logger.warn({ error: err.message }, 'Metrics server might not be available');
        res.json([]);
    }
});
router.get('/usage', async (req, res) => {
    const namespace = queryString(req.query.namespace) || 'all';
    if (!isValidNamespaceOrAll(namespace)) return res.status(400).json({ error: 'Invalid namespace' });
    try {
        res.json(await usageService.getUsage(namespace));
    } catch (err) {
        logger.error({ error: err.message }, 'Failed to compute resource usage');
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
