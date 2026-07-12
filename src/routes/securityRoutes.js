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


router.get('/kubescape/db-status', (req, res) => {
    res.json(securityService.getDbStatus());
});


router.post('/kubescape/db-update', async (req, res) => {
    const success = await securityService.ensureKubescapeArtifacts();
    res.json({ success, status: securityService.getDbStatus() });
});

router.get('/kubescape/config', (req, res) => {
    res.json({
        autoUpdateArtifacts: securityService.autoUpdateArtifacts,
        artifactsUpdateIntervalHours: securityService.artifactsUpdateIntervalHours,
    });
});

router.post('/kubescape/config', (req, res) => {
    const { autoUpdateArtifacts, artifactsUpdateIntervalHours } = req.body;
    const hasAuto = typeof autoUpdateArtifacts === 'boolean';
    const hasInterval = artifactsUpdateIntervalHours !== undefined;

    if (!hasAuto && !hasInterval) {
        return res.status(400).json({ error: 'No valid config fields provided' });
    }
    if (artifactsUpdateIntervalHours !== undefined &&
        (!Number.isFinite(Number(artifactsUpdateIntervalHours)) || Number(artifactsUpdateIntervalHours) <= 0)) {
        return res.status(400).json({ error: 'artifactsUpdateIntervalHours must be a positive number' });
    }

    if (hasAuto) securityService.autoUpdateArtifacts = autoUpdateArtifacts;
    if (hasInterval) securityService.artifactsUpdateIntervalHours = Number(artifactsUpdateIntervalHours);

    securityService.saveSecurityConfig();
    securityService.startArtifactsAutoUpdateLoop();

    res.json({
        success: true,
        autoUpdateArtifacts: securityService.autoUpdateArtifacts,
        artifactsUpdateIntervalHours: securityService.artifactsUpdateIntervalHours,
    });
});

module.exports = router;
