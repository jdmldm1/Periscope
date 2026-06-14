const express = require('express');
const router = express.Router();
const helmService = require('../services/helmService');
const logger = require('../utils/logger');

router.get('/', async (req, res) => {
    try {
        const releases = await helmService.listReleases(req.query.namespace);
        res.json(releases);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:namespace/:name/status', async (req, res) => {
    try {
        const status = await helmService.getStatus(req.params.namespace, req.params.name);
        res.send(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:namespace/:name', async (req, res) => {
    try {
        const output = await helmService.uninstall(req.params.namespace, req.params.name);
        res.send(output);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:namespace/:name/history', async (req, res) => {
    try {
        const history = await helmService.getHistory(req.params.namespace, req.params.name);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:namespace/:name/rollback', async (req, res) => {
    try {
        const output = await helmService.rollback(req.params.namespace, req.params.name, req.body.revision);
        res.send(output);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/repos', async (req, res) => {
    try {
        const repos = await helmService.listRepos();
        res.json(repos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/repos', async (req, res) => {
    try {
        const output = await helmService.addRepo(req.body.name, req.body.url);
        res.send(output);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/repos/:name', async (req, res) => {
    try {
        const output = await helmService.removeRepo(req.params.name);
        res.send(output);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/repos/update', async (req, res) => {
    try {
        const output = await helmService.updateRepos();
        res.send(output);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/search', async (req, res) => {
    try {
        const results = await helmService.searchRepos(req.query.q);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:namespace/:name/values', async (req, res) => {
    try {
        const values = await helmService.getValues(req.params.namespace, req.params.name);
        res.send(values);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:namespace/:name/values/revision/:revision', async (req, res) => {
    try {
        const values = await helmService.getValues(req.params.namespace, req.params.name, req.params.revision);
        res.send(values);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:namespace/:name/manifest', async (req, res) => {
    try {
        const manifest = await helmService.getManifest(req.params.namespace, req.params.name);
        res.send(manifest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:namespace/:name/notes', async (req, res) => {
    try {
        const notes = await helmService.getNotes(req.params.namespace, req.params.name);
        res.send(notes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
