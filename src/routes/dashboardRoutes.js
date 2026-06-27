const express = require('express');
const router = express.Router();
const dashboardService = require('../services/dashboardService');
const logger = require('../utils/logger');

// Cluster-wide health overview shown on the dashboard.
router.get('/stats', async (req, res) => {
    try {
        res.json(await dashboardService.getStats(req.query.namespace));
    } catch (err) {
        logger.error(err, 'Error getting dashboard stats');
        res.status(500).json({ error: err.message });
    }
});

// Drill-down evidence for a single problematic Node / Deployment / Pod.
router.get('/issue-detail', async (req, res) => {
    const { kind, namespace, name } = req.query;
    if (!kind || !name) return res.status(400).json({ error: 'kind and name are required' });

    try {
        res.json(await dashboardService.getIssueDetail({ kind, namespace, name }));
    } catch (err) {
        logger.error({ error: err.message, kind, name }, 'Error getting issue detail');
        res.status(500).json({ error: err.message });
    }
});

// Integration readiness: quotas, image-pull failures, restarts, and OOM risk.
router.get('/integration', async (req, res) => {
    try {
        res.json(await dashboardService.getIntegrationReadiness(req.query.namespace));
    } catch (err) {
        logger.error(err, 'Error getting integration readiness');
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
