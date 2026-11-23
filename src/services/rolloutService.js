const k8sService = require('./k8sService');
const { run } = require('../utils/exec');

const REVISION = 'deployment.kubernetes.io/revision';
const CHANGE_CAUSE = 'kubernetes.io/change-cause';

function buildHistory(deployment, replicaSets) {
    const currentRevision = deployment.metadata.annotations?.[REVISION];
    return replicaSets
        .filter((rs) =>
            (rs.metadata.ownerReferences || []).some(
                (o) => o.kind === 'Deployment' && o.uid === deployment.metadata.uid,
            ),
        )
        .map((rs) => ({
            revision: Number(rs.metadata.annotations?.[REVISION]),
            name: rs.metadata.name,
            createdAt: rs.metadata.creationTimestamp,
            changeCause: rs.metadata.annotations?.[CHANGE_CAUSE] || null,
            images: (rs.spec?.template?.spec?.containers || []).map((c) => c.image),
            replicas: rs.status?.replicas || 0,
            readyReplicas: rs.status?.readyReplicas || 0,
            current: rs.metadata.annotations?.[REVISION] === currentRevision,
        }))
        .filter((r) => Number.isInteger(r.revision))
        .sort((a, b) => b.revision - a.revision);
}

async function history(namespace, name) {
    const [deployment, rsRes] = await Promise.all([
        k8sService.apps.readNamespacedDeployment({ name, namespace }),
        k8sService.apps.listNamespacedReplicaSet({ namespace }),
    ]);
    return buildHistory(deployment, k8sService.getItems(rsRes));
}

async function rollback(namespace, name, revision) {
    if (!Number.isInteger(revision) || revision < 1) {
        throw Object.assign(new Error('revision must be a positive integer'), { statusCode: 400 });
    }
    const { stdout } = await run('kubectl', [
        'rollout',
        'undo',
        `deployment/${name}`,
        '-n',
        namespace,
        `--to-revision=${revision}`,
    ]);
    k8sService.clearCache('deployments', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: stdout.trim() };
}

module.exports = { history, rollback, buildHistory };
