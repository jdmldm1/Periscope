const express = require('express');
const router = express.Router();
const certService = require('../services/certService');
const logger = require('../utils/logger');

router.get('/', async (req, res) => {
    try {
        res.json(await certService.listCertificates());
    } catch (err) {
        logger.error({ error: err.message }, 'Failed to list certificates');
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
