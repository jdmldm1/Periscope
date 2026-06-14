const express = require('express');
const router = express.Router();
const zarfService = require('../services/zarfService');

router.get('/status', async (req, res) => {
    try {
        const status = await zarfService.getStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/packages', async (req, res) => {
    try {
        const packages = await zarfService.listPackages();
        res.json(packages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/deploy', async (req, res) => {
    try {
        const taskId = await zarfService.deployPackage(req.body.packagePath, req.body.configPath);
        res.json({ success: true, taskId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/packages/:name', async (req, res) => {
    try {
        const output = await zarfService.removePackage(req.params.name);
        res.json({ success: true, output });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/registry/all-images', async (req, res) => {
    try {
        const images = await zarfService.getRegistryAllImages();
        res.json(images);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
