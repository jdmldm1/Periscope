const express = require('express');
const router = express.Router();
const k8s = require('@kubernetes/client-node');
const logger = require('../utils/logger');

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const batch = kc.makeApiClient(k8s.BatchV1Api);
const core = kc.makeApiClient(k8s.CoreV1Api);

router.post('/create', async (req, res) => {
    const {
        name, namespace, schedule, image, command, args,
        restartPolicy, successfulJobsHistoryLimit, failedJobsHistoryLimit,
        concurrencyPolicy, suspend, envVars, resources,
    } = req.body;

    const manifest = {
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name, namespace },
        spec: {
            schedule,
            concurrencyPolicy: concurrencyPolicy || 'Allow',
            suspend: !!suspend,
            successfulJobsHistoryLimit: parseInt(successfulJobsHistoryLimit) || 3,
            failedJobsHistoryLimit: parseInt(failedJobsHistoryLimit) || 1,
            jobTemplate: {
                spec: {
                    template: {
                        spec: {
                            restartPolicy: restartPolicy || 'OnFailure',
                            containers: [{
                                name: name,
                                image,
                                command: command ? (Array.isArray(command) ? command : command.split(' ')) : undefined,
                                args: args ? (Array.isArray(args) ? args : args.split(' ')) : undefined,
                                env: (envVars || []).filter(e => e.name).map(e => ({ name: e.name, value: e.value })),
                                resources: resources || {},
                            }],
                        },
                    },
                },
            },
        },
    };

    try {
        const created = await batch.createNamespacedCronJob({ namespace, body: manifest });
        res.json(created);
    } catch (err) {
        logger.error({ err: err.message }, 'Failed to create CronJob');
        res.status(500).json({ error: err.message });
    }
});

router.put('/suspend/:namespace/:name', async (req, res) => {
    const { namespace, name } = req.params;
    const { suspend } = req.body;
    try {
        const existing = await batch.readNamespacedCronJob({ namespace, name });
        existing.spec.suspend = !!suspend;
        const updated = await batch.replaceNamespacedCronJob({ namespace, name, body: existing });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/trigger/:namespace/:name', async (req, res) => {
    const { namespace, name } = req.params;
    try {
        const cj = await batch.readNamespacedCronJob({ namespace, name });
        const jobName = `${name}-manual-${Date.now()}`;
        const jobManifest = {
            apiVersion: 'batch/v1',
            kind: 'Job',
            metadata: {
                name: jobName,
                namespace,
                annotations: { 'cronjob.kubernetes.io/instantiate': 'manual' },
            },
            spec: JSON.parse(JSON.stringify(cj.spec.jobTemplate.spec)),
        };
        const job = await batch.createNamespacedJob({ namespace, body: jobManifest });
        res.json({ jobName: job.metadata.name });
    } catch (err) {
        logger.error({ err: err.message }, 'Failed to trigger CronJob');
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:namespace/:name', async (req, res) => {
    const { namespace, name } = req.params;
    try {
        await batch.deleteNamespacedCronJob({ namespace, name });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/jobs/:namespace/:name', async (req, res) => {
    const { namespace, name } = req.params;
    try {
        const jobs = await batch.listNamespacedJob({ namespace, labelSelector: `job-name` });
        const related = (jobs.items || []).filter(j =>
            j.metadata?.ownerReferences?.some(r => r.name === name && r.kind === 'CronJob') ||
            j.metadata?.name?.startsWith(name)
        );
        res.json(related);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
