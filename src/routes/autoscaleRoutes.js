const express = require('express');
const router = express.Router();
const autoscaleService = require('../services/autoscaleService');
const logger = require('../utils/logger');

router.get('/hpa', async (req, res) => {
    const { namespace } = req.query;
    try {
        const hpas = await autoscaleService.listHPAs(namespace);
        res.json(hpas);
    } catch (err) {
        logger.error({ err: err.message }, 'GET /hpa failed');
        res.status(500).json({ error: err.message });
    }
});

router.get('/hpa/:namespace/:name', async (req, res) => {
    try {
        const hpa = await autoscaleService.getHPA(req.params.namespace, req.params.name);
        res.json(hpa);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/hpa', async (req, res) => {
    const { namespace, ...spec } = req.body;
    try {
        const hpa = await autoscaleService.createHPA(namespace, spec);
        res.json(hpa);
    } catch (err) {
        logger.error({ err: err.message }, 'POST /hpa failed');
        res.status(500).json({ error: err.message });
    }
});

router.put('/hpa/:namespace/:name', async (req, res) => {
    try {
        const hpa = await autoscaleService.updateHPA(req.params.namespace, req.params.name, req.body);
        res.json(hpa);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/hpa/:namespace/:name', async (req, res) => {
    try {
        await autoscaleService.deleteHPA(req.params.namespace, req.params.name);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/targets', async (req, res) => {
    const { namespace } = req.query;
    try {
        const targets = await autoscaleService.listScalableTargets(namespace);
        res.json(targets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
