const k8s = require('@kubernetes/client-node');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const logger = require('../utils/logger');

const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp/periscope-backups';

class BackupService {
    constructor() {
        this.kc = new k8s.KubeConfig();
        this.kc.loadFromDefault();
        this.core = this.kc.makeApiClient(k8s.CoreV1Api);
        this.apps = this.kc.makeApiClient(k8s.AppsV1Api);
        this.batch = this.kc.makeApiClient(k8s.BatchV1Api);
        this.networking = this.kc.makeApiClient(k8s.NetworkingV1Api);

        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
    }

    _stripManagedFields(obj) {
        if (!obj) return obj;
        const stripped = JSON.parse(JSON.stringify(obj));
        if (stripped.metadata) {
            delete stripped.metadata.resourceVersion;
            delete stripped.metadata.uid;
            delete stripped.metadata.creationTimestamp;
            delete stripped.metadata.generation;
            delete stripped.metadata.managedFields;
            delete stripped.metadata.selfLink;
            if (stripped.metadata.annotations) {
                delete stripped.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'];
                delete stripped.metadata.annotations['deployment.kubernetes.io/revision'];
            }
        }
        delete stripped.status;
        return stripped;
    }

    async _fetchAll(namespace) {
        const ns = namespace === 'all' ? undefined : namespace;
        const resources = [];

        const fetchers = ns ? [
            { kind: 'Deployment', fn: () => this.apps.listNamespacedDeployment({ namespace: ns }) },
            { kind: 'StatefulSet', fn: () => this.apps.listNamespacedStatefulSet({ namespace: ns }) },
            { kind: 'DaemonSet', fn: () => this.apps.listNamespacedDaemonSet({ namespace: ns }) },
            { kind: 'Service', fn: () => this.core.listNamespacedService({ namespace: ns }) },
            { kind: 'ConfigMap', fn: () => this.core.listNamespacedConfigMap({ namespace: ns }) },
            { kind: 'Secret', fn: () => this.core.listNamespacedSecret({ namespace: ns }) },
            { kind: 'CronJob', fn: () => this.batch.listNamespacedCronJob({ namespace: ns }) },
            { kind: 'Ingress', fn: () => this.networking.listNamespacedIngress({ namespace: ns }) },
            { kind: 'PersistentVolumeClaim', fn: () => this.core.listNamespacedPersistentVolumeClaim({ namespace: ns }) },
        ] : [
            { kind: 'Deployment', fn: () => this.apps.listDeploymentForAllNamespaces() },
            { kind: 'StatefulSet', fn: () => this.apps.listStatefulSetForAllNamespaces() },
            { kind: 'DaemonSet', fn: () => this.apps.listDaemonSetForAllNamespaces() },
            { kind: 'Service', fn: () => this.core.listServiceForAllNamespaces() },
            { kind: 'ConfigMap', fn: () => this.core.listConfigMapForAllNamespaces() },
            { kind: 'Secret', fn: () => this.core.listSecretForAllNamespaces() },
            { kind: 'CronJob', fn: () => this.batch.listCronJobForAllNamespaces() },
            { kind: 'Ingress', fn: () => this.networking.listIngressForAllNamespaces() },
            { kind: 'PersistentVolumeClaim', fn: () => this.core.listPersistentVolumeClaimForAllNamespaces() },
        ];

        await Promise.allSettled(
            fetchers.map(async ({ kind, fn }) => {
                try {
                    const res = await fn();
                    (res.items || []).forEach(item => {
                        item.kind = kind;
                        item.apiVersion = this._apiVersionFor(kind);
                        resources.push(this._stripManagedFields(item));
                    });
                } catch (err) {
                    logger.warn({ kind, err: err.message }, 'Skipping resource type in backup');
                }
            })
        );

        return resources;
    }

    _apiVersionFor(kind) {
        const map = {
            Deployment: 'apps/v1',
            StatefulSet: 'apps/v1',
            DaemonSet: 'apps/v1',
            Service: 'v1',
            ConfigMap: 'v1',
            Secret: 'v1',
            PersistentVolumeClaim: 'v1',
            CronJob: 'batch/v1',
            Ingress: 'networking.k8s.io/v1',
        };
        return map[kind] || 'v1';
    }

    async createBackup(namespace, label) {
        const resources = await this._fetchAll(namespace);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const name = `${label || 'backup'}-${timestamp}`;
        const filePath = path.join(BACKUP_DIR, `${name}.yaml`);

        const yamlDocs = resources.map(r => yaml.dump(r)).join('---\n');
        fs.writeFileSync(filePath, yamlDocs, 'utf8');

        const meta = {
            name,
            namespace: namespace || 'all',
            timestamp: new Date().toISOString(),
            resourceCount: resources.length,
            filePath,
            sizeMb: (fs.statSync(filePath).size / 1024 / 1024).toFixed(2),
        };

        logger.info(meta, 'Backup created');
        return meta;
    }

    listBackups() {
        if (!fs.existsSync(BACKUP_DIR)) return [];
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.yaml'));
        return files.map(f => {
            const filePath = path.join(BACKUP_DIR, f);
            const stat = fs.statSync(filePath);
            const parts = f.replace('.yaml', '').split('-');
            return {
                name: f.replace('.yaml', ''),
                filePath,
                createdAt: stat.mtime.toISOString(),
                sizeMb: (stat.size / 1024 / 1024).toFixed(2),
            };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    deleteBackup(name) {
        const filePath = path.join(BACKUP_DIR, `${name}.yaml`);
        if (!fs.existsSync(filePath)) throw new Error('Backup not found');
        fs.unlinkSync(filePath);
    }

    getBackupFile(name) {
        const filePath = path.join(BACKUP_DIR, `${name}.yaml`);
        if (!fs.existsSync(filePath)) throw new Error('Backup not found');
        return filePath;
    }

    async restoreBackup(name, dryRun = false) {
        const filePath = path.join(BACKUP_DIR, `${name}.yaml`);
        if (!fs.existsSync(filePath)) throw new Error('Backup not found');

        const content = fs.readFileSync(filePath, 'utf8');
        const docs = yaml.loadAll(content).filter(Boolean);

        const results = { applied: [], skipped: [], errors: [] };

        const drySuffix = dryRun ? ' (dry-run)' : '';

        for (const doc of docs) {
            const kind = doc.kind;
            const name = doc.metadata?.name;
            const ns = doc.metadata?.namespace;
            try {
                await this._applyResource(doc, dryRun);
                results.applied.push({ kind, name, namespace: ns, status: `Applied${drySuffix}` });
            } catch (err) {
                if (err.statusCode === 409) {
                    results.skipped.push({ kind, name, namespace: ns, status: 'Already exists' });
                } else {
                    results.errors.push({ kind, name, namespace: ns, error: err.message });
                }
            }
        }

        return results;
    }

    async _applyResource(doc, dryRun) {
        const kind = doc.kind;
        const ns = doc.metadata?.namespace;
        const opts = dryRun ? { dryRun: 'All' } : {};

        const creators = {
            Deployment: () => this.apps.createNamespacedDeployment({ namespace: ns, body: doc, ...opts }),
            StatefulSet: () => this.apps.createNamespacedStatefulSet({ namespace: ns, body: doc, ...opts }),
            DaemonSet: () => this.apps.createNamespacedDaemonSet({ namespace: ns, body: doc, ...opts }),
            Service: () => this.core.createNamespacedService({ namespace: ns, body: doc, ...opts }),
            ConfigMap: () => this.core.createNamespacedConfigMap({ namespace: ns, body: doc, ...opts }),
            Secret: () => this.core.createNamespacedSecret({ namespace: ns, body: doc, ...opts }),
            CronJob: () => this.batch.createNamespacedCronJob({ namespace: ns, body: doc, ...opts }),
            Ingress: () => this.networking.createNamespacedIngress({ namespace: ns, body: doc, ...opts }),
            PersistentVolumeClaim: () => this.core.createNamespacedPersistentVolumeClaim({ namespace: ns, body: doc, ...opts }),
        };

        const fn = creators[kind];
        if (!fn) throw new Error(`Unsupported kind: ${kind}`);
        await fn();
    }
}

module.exports = new BackupService();
