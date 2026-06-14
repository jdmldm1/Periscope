const express = require('express');
const router = express.Router();
const forwardService = require('../services/forwardService');

router.get('/', (req, res) => {
    res.json(forwardService.listForwards());
});

router.post('/', async (req, res) => {
    const { namespace, podName, remotePort, localPort } = req.body;
    try {
        const forward = await forwardService.createForward(namespace, podName, remotePort, localPort);
        res.json({ success: true, ...forward });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/', (req, res) => {
    const { id } = req.body;
    const success = forwardService.deleteForward(id);
    if (success) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Port forward not found' });
    }
});

module.exports = router;
