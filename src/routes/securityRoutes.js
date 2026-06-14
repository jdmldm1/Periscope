const express = require('express');
const router = express.Router();
const securityService = require('../services/securityService');

router.get('/kubescape/status', async (req, res) => {
    const status = await securityService.getStatus();
    res.json(status);
});

router.post('/kubescape/scan', async (req, res) => {
    try {
        const result = await securityService.triggerScan();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
