const express = require('express');
const router = express.Router();
const giteaService = require('../services/giteaService');

router.get('/config', (req, res) => {
    res.json(giteaService.getConfig());
});

router.post('/config', (req, res) => {
    try {
        const result = giteaService.saveConfig(req.body.url, req.body.token);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/exec', async (req, res) => {
    try {
        const result = await giteaService.execTea(req.body.command);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
