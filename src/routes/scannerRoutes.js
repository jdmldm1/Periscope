const express = require('express');
const router = express.Router();
const scannerService = require('../services/scannerService');

router.get('/grype/db-status', (req, res) => {
    res.json(scannerService.getDbStatus());
});

router.post('/grype/db-update', async (req, res) => {
    const success = await scannerService.ensureGrypeDb();
    res.json({ success });
});

router.post('/sbom/scan', async (req, res) => {
    const { imageRef, rescan } = req.body;
    if (!imageRef) return res.status(400).json({ error: 'imageRef is required' });
    try {
        if (rescan) {
            scannerService.clearImageCache(imageRef);
        }
        const result = await scannerService.performSbomScan(imageRef);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/sbom/vulnerabilities', async (req, res) => {
    const { imageRef } = req.body;
    if (!imageRef) return res.status(400).json({ error: 'imageRef is required' });
    try {
        const result = await scannerService.performVulnsScan(imageRef);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/sbom/scans', async (req, res) => {
    try {
        const scans = await scannerService.getAllScans();
        res.json(scans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/running-images', async (req, res) => {
    const k8sService = require('../services/k8sService');
    try {
        const pods = await k8sService.core.listPodForAllNamespaces();
        const images = new Set();
        pods.items.forEach(pod => {
            pod.spec.containers.forEach(c => images.add(c.image));
            if (pod.spec.initContainers) pod.spec.initContainers.forEach(c => images.add(c.image));
        });
        res.json(Array.from(images).sort());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/config', (req, res) => {
    res.json({ enableAutoScan: scannerService.enableAutoScan });
});

router.post('/config', (req, res) => {
    const { enableAutoScan } = req.body;
    if (typeof enableAutoScan === 'boolean') {
        scannerService.enableAutoScan = enableAutoScan;
        scannerService.saveScannerConfig();
        res.json({ success: true, enableAutoScan });
    } else {
        res.status(400).json({ error: 'enableAutoScan must be a boolean' });
    }
});

module.exports = router;
