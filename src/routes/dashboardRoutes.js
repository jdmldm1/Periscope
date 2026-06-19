const express = require('express');
const router = express.Router();
const k8sService = require('../services/k8sService');
const helmService = require('../services/helmService');
const zarfService = require('../services/zarfService');
const logger = require('../utils/logger');
const { parseCpu, parseMem, getItems } = require('../utils/k8sHelpers');

router.get('/stats', async (req, res) => {
    const ns = req.query.namespace;
    try {
        const [nodesRaw, podsRaw, deploymentsRaw, servicesRaw, configmapsRaw, secretsRaw, helmreleases, zarfpackages, nodeMetricsRaw] = await Promise.all([
            k8sService.core.listNode(),
            ns && ns !== 'all' ? k8sService.core.listNamespacedPod({ namespace: ns }) : k8sService.core.listPodForAllNamespaces(),
            ns && ns !== 'all' ? k8sService.apps.listNamespacedDeployment({ namespace: ns }) : k8sService.apps.listDeploymentForAllNamespaces(),
            ns && ns !== 'all' ? k8sService.core.listNamespacedService({ namespace: ns }) : k8sService.core.listServiceForAllNamespaces(),
            ns && ns !== 'all' ? k8sService.core.listNamespacedConfigMap({ namespace: ns }) : k8sService.core.listConfigMapForAllNamespaces(),
            ns && ns !== 'all' ? k8sService.core.listNamespacedSecret({ namespace: ns }) : k8sService.core.listSecretForAllNamespaces(),
            helmService.listReleases(ns),
            zarfService.listPackages(),
            k8sService.custom.listClusterCustomObject({
                group: 'metrics.k8s.io',
                version: 'v1beta1',
                plural: 'nodes'
            }).catch(() => ({ items: [] }))
        ]);


        
        const nodes = getItems(nodesRaw);
        const pods = getItems(podsRaw);
        const deployments = getItems(deploymentsRaw);
        const services = getItems(servicesRaw);
        const configmaps = getItems(configmapsRaw);
        const secrets = getItems(secretsRaw);
        const nodeMetrics = getItems(nodeMetricsRaw);

        const podPhases = {
            running: pods.filter(p => p.status?.phase === 'Running').length,
            pending: pods.filter(p => p.status?.phase === 'Pending').length,
            succeeded: pods.filter(p => p.status?.phase === 'Succeeded').length,
            failed: pods.filter(p => p.status?.phase === 'Failed').length
        };

        // Resource usage calculation
        let cpuUse = 0;
        let cpuCap = 0;
        let memUse = 0;
        let memCap = 0;



        nodes.forEach(node => {
            cpuCap += parseCpu(node.status?.capacity?.cpu);
            memCap += parseMem(node.status?.capacity?.memory);
            const metric = nodeMetrics.find(m => m.metadata?.name === node.metadata?.name);
            if (metric) {
                cpuUse += parseCpu(metric.usage?.cpu);
                memUse += parseMem(metric.usage?.memory);
            }
        });

        res.json({
            counts: {
                nodes: nodes.length,
                pods: pods.length,
                deployments: deployments.length,
                services: services.length,
                configmaps: configmaps.length,
                secrets: secrets.length,
                helmreleases: helmreleases.length,
                zarfpackages: zarfpackages.length
            },
            podPhases,
            resources: {
                cpuUse,
                cpuCap,
                memUse,
                memCap,
                cpuPct: cpuCap > 0 ? Math.round((cpuUse / cpuCap) * 100) : 0,
                memPct: memCap > 0 ? Math.round((memUse / memCap) * 100) : 0
            }
        });
    } catch (err) {
        logger.error(err, 'Error getting dashboard stats');
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
