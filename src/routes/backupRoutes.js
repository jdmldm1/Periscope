const express = require('express');
const router = express.Router();
const backupService = require('../services/backupService');
const logger = require('../utils/logger');

router.get('/list', (req, res) => {
    try {
        const backups = backupService.listBackups();
        res.json(backups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/create', async (req, res) => {
    const { namespace, label } = req.body;
    try {
        const meta = await backupService.createBackup(namespace, label);
        res.json(meta);
    } catch (err) {
        logger.error({ err: err.message }, 'Backup creation failed');
        res.status(500).json({ error: err.message });
    }
});

router.post('/restore/:name', async (req, res) => {
    const { name } = req.params;
    const { dryRun } = req.body;
    try {
        const results = await backupService.restoreBackup(name, !!dryRun);
        res.json(results);
    } catch (err) {
        logger.error({ err: err.message }, 'Restore failed');
        res.status(500).json({ error: err.message });
    }
});

router.get('/download/:name', (req, res) => {
    try {
        const filePath = backupService.getBackupFile(req.params.name);
        res.download(filePath, `${req.params.name}.yaml`);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

router.delete('/:name', (req, res) => {
    try {
        backupService.deleteBackup(req.params.name);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
