const express = require('express');
const router = express.Router();
const workloadService = require('../services/workloadService');
const rolloutService = require('../services/rolloutService');
const searchService = require('../services/searchService');
const crdService = require('../services/crdService');
const logger = require('../utils/logger');
const { assertName, assertKind, isValidNamespace, queryString, ValidationError } = require('../utils/validators');

const WORKLOAD_KINDS = ['deployments', 'statefulsets', 'daemonsets'];

function handle(fn) {
    return async (req, res) => {
        try {
            res.json(await fn(req));
        } catch (err) {
            const status = err.statusCode || 500;
            if (status >= 500) logger.error({ url: req.path, error: err.message }, 'Operation failed');
            res.status(status).json({ error: err.stderr || err.message });
        }
    };
}

function ns(req) {
    if (!isValidNamespace(req.params.namespace)) {
        throw new ValidationError('Invalid namespace: must be a valid Kubernetes namespace');
    }
    return req.params.namespace;
}

function workloadKind(req) {
    const kind = String(req.params.kind).toLowerCase();
    if (!WORKLOAD_KINDS.includes(kind)) throw new ValidationError(`Unsupported workload kind: ${kind}`);
    return kind;
}

router.get(
    '/search',
    handle(async (req) => ({ results: await searchService.search(queryString(req.query.q)) })),
);

router.post(
    '/resource/:kind/:namespace/:name/dry-run',
    handle(async (req) => {
        const kind = assertKind(req.params.kind);
        const yamlContent = req.body?.yaml;
        if (typeof yamlContent !== 'string' || !yamlContent) {
            throw new ValidationError('yaml content is required');
        }
        assertName(req.params.name);
        const namespace = ['undefined', 'all'].includes(req.params.namespace) ? undefined : ns(req);
        return workloadService.dryRunYaml(kind, namespace, yamlContent);
    }),
);

router.get(
    '/resource/deployments/:namespace/:name/rollout-history',
    handle(async (req) => ({ revisions: await rolloutService.history(ns(req), assertName(req.params.name)) })),
);

router.post(
    '/resource/deployments/:namespace/:name/rollback',
    handle(async (req) => {
        const revision = Number(req.body?.revision);
        return rolloutService.rollback(ns(req), assertName(req.params.name), revision);
    }),
);

router.put(
    '/workloads/:kind/:namespace/:name/restart',
    handle((req) => workloadService.restartWorkload(workloadKind(req), ns(req), assertName(req.params.name))),
);

router.put(
    '/workloads/:kind/:namespace/:name/scale',
    handle((req) =>
        workloadService.scaleWorkload(workloadKind(req), ns(req), assertName(req.params.name), req.body?.replicas),
    ),
);

router.put(
    '/nodes/:name/cordon',
    handle((req) => workloadService.setNodeCordon(assertName(req.params.name), true)),
);
router.put(
    '/nodes/:name/uncordon',
    handle((req) => workloadService.setNodeCordon(assertName(req.params.name), false)),
);
router.put(
    '/nodes/:name/drain',
    handle((req) => workloadService.drainNode(assertName(req.params.name))),
);

router.get(
    '/crd/:name/schema',
    handle((req) => crdService.getCrdSchema(assertName(req.params.name))),
);

module.exports = router;
