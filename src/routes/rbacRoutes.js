const express = require('express');
const router = express.Router();
const rbacService = require('../services/rbacService');
const logger = require('../utils/logger');
const { queryString, isValidName, isValidNamespace } = require('../utils/validators');

const SUBJECT_KINDS = ['User', 'Group', 'ServiceAccount'];
const TOKEN = /^[a-zA-Z0-9*.\-/]{1,253}$/;

function fail(res, status, message) {
    return res.status(status).json({ error: message });
}

router.get('/subjects', async (req, res) => {
    try {
        res.json({ subjects: rbacService.summarizeSubjects(await rbacService.loadGrants()) });
    } catch (err) {
        logger.error({ error: err.message }, 'Failed to list RBAC subjects');
        fail(res, 500, err.message);
    }
});

router.get('/subject', async (req, res) => {
    const kind = queryString(req.query.kind);
    const name = queryString(req.query.name);
    const namespace = queryString(req.query.namespace);
    if (!SUBJECT_KINDS.includes(kind) || !name || name.length > 253) return fail(res, 400, 'Invalid subject');
    if (kind === 'ServiceAccount' && !isValidNamespace(namespace)) return fail(res, 400, 'Invalid namespace');
    try {
        const grants = rbacService.grantsForSubject(await rbacService.loadGrants(), { kind, name, namespace });
        res.json({ grants: grants.map(({ subject: _subject, ...rest }) => rest) });
    } catch (err) {
        logger.error({ error: err.message }, 'Failed to load RBAC subject');
        fail(res, 500, err.message);
    }
});

router.get('/whocan', async (req, res) => {
    const verb = queryString(req.query.verb);
    const resource = queryString(req.query.resource);
    const apiGroup = queryString(req.query.apiGroup) ?? '';
    const namespace = queryString(req.query.namespace);
    if (!verb || !resource || !TOKEN.test(verb) || !TOKEN.test(resource) || (apiGroup && !isValidName(apiGroup))) {
        return fail(res, 400, 'verb and resource are required');
    }
    if (namespace && !isValidNamespace(namespace)) return fail(res, 400, 'Invalid namespace');
    try {
        const grants = await rbacService.loadGrants();
        res.json({ subjects: rbacService.whoCan(grants, { verb, resource, apiGroup }, namespace) });
    } catch (err) {
        logger.error({ error: err.message }, 'Failed to evaluate RBAC query');
        fail(res, 500, err.message);
    }
});

module.exports = router;
