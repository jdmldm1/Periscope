const yaml = require('js-yaml');
const { run, spawnSafe } = require('../utils/exec');
const { ensureTypeMeta } = require('../utils/k8sHelpers');
const k8sService = require('./k8sService');
async function restart(namespace, name) {
    const { stdout } = await run('kubectl', ['rollout', 'restart', `deployment/${name}`, '-n', namespace]);
    k8sService.clearCache('deployments', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: stdout.trim() };
}
async function scale(namespace, name, replicas) {
    const { stdout } = await run('kubectl', [
        'scale',
        `deployment/${name}`,
        `--replicas=${Number(replicas)}`,
        '-n',
        namespace,
    ]);
    k8sService.clearCache('deployments', namespace);
    return { message: stdout.trim() };
}
async function stop(namespace, name) {
    let previous = 1;
    try {
        const { stdout: getOut } = await run('kubectl', [
            'get',
            `deployment/${name}`,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.replicas}',
        ]);
        const current = parseInt((getOut || '').trim(), 10);
        if (!isNaN(current) && current > 0) previous = current;
    } catch (_) {}
    await run('kubectl', [
        'annotate',
        `deployment/${name}`,
        '-n',
        namespace,
        `periscope-previous-replicas=${previous}`,
        '--overwrite',
    ]);
    await run('kubectl', ['scale', `deployment/${name}`, '--replicas=0', '-n', namespace]);
    k8sService.clearCache('deployments', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: `Deployment ${name} stopped (scaled to 0)`, previousReplicas: previous };
}
async function start(namespace, name, bodyReplicas) {
    let saved = NaN;
    try {
        const { stdout: getOut } = await run('kubectl', [
            'get',
            `deployment/${name}`,
            '-n',
            namespace,
            '-o',
            'jsonpath={.metadata.annotations.periscope-previous-replicas}',
        ]);
        saved = parseInt((getOut || '').trim(), 10);
    } catch (_) {}
    const reqReplicas = Number(bodyReplicas);
    const target = !isNaN(saved) && saved > 0 ? saved : !isNaN(reqReplicas) && reqReplicas > 0 ? reqReplicas : 1;
    await run('kubectl', ['scale', `deployment/${name}`, `--replicas=${target}`, '-n', namespace]);
    k8sService.clearCache('deployments', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: `Deployment ${name} started (scaled to ${target})`, replicas: target };
}
const CLUSTER_SCOPED = new Set([
    'namespaces',
    'namespace',
    'ns',
    'nodes',
    'node',
    'persistentvolumes',
    'pv',
    'customresourcedefinitions',
    'crds',
    'crd',
]);
async function deleteResource(kind, namespace, name) {
    const clusterScoped = CLUSTER_SCOPED.has(String(kind).toLowerCase());
    const args =
        clusterScoped || !namespace || namespace === 'undefined' || namespace === 'all'
            ? ['delete', kind, name]
            : ['delete', kind, name, '-n', namespace];
    const { stdout } = await run('kubectl', args);
    k8sService.clearCache(kind, namespace);
    return { message: stdout.trim() };
}
function normalizeYaml(kind, yamlContent) {
    try {
        const doc = /** @type {any} */ (yaml.load(yamlContent));
        if (doc && typeof doc === 'object' && (!doc.apiVersion || !doc.kind)) {
            return yaml.dump(ensureTypeMeta(doc, kind));
        }
    } catch (_) {}
    return yamlContent;
}
function kubectlWithStdin(args, payload) {
    return new Promise((resolve, reject) => {
        const cp = spawnSafe('kubectl', args);
        cp.stdin.write(payload);
        cp.stdin.end();
        let stdout = '';
        let stderr = '';
        cp.stdout.on('data', (chunk) => (stdout += chunk.toString()));
        cp.stderr.on('data', (chunk) => (stderr += chunk.toString()));
        cp.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
        cp.on('error', reject);
    });
}
function applyArgs(namespace) {
    const args = ['apply', '-f', '-'];
    if (namespace && namespace !== 'all' && namespace !== 'undefined') {
        args.push('-n', namespace);
    }
    return args;
}
async function applyYaml(kind, namespace, yamlContent) {
    const { code, stdout, stderr } = await kubectlWithStdin(applyArgs(namespace), normalizeYaml(kind, yamlContent));
    if (code !== 0) {
        throw new Error(stderr || `Failed to apply resource with exit code ${code}`);
    }
    k8sService.clearCache(kind, namespace);
    return { message: stdout || 'Resource saved successfully' };
}
async function dryRunYaml(kind, namespace, yamlContent) {
    const args = [...applyArgs(namespace), '--dry-run=server'];
    const { code, stdout, stderr } = await kubectlWithStdin(args, normalizeYaml(kind, yamlContent));
    return { valid: code === 0, message: code === 0 ? stdout : stderr || `kubectl exited with code ${code}` };
}

const ROLLOUT_KINDS = { deployments: 'deployment', statefulsets: 'statefulset', daemonsets: 'daemonset' };
const SCALABLE_KINDS = { deployments: 'deployment', statefulsets: 'statefulset' };
function workloadRef(map, kind, name) {
    const resource = map[String(kind).toLowerCase()];
    if (!resource) {
        throw Object.assign(new Error(`Unsupported workload kind: ${kind}`), { statusCode: 400 });
    }
    return `${resource}/${name}`;
}
async function restartWorkload(kind, namespace, name) {
    const { stdout } = await run('kubectl', [
        'rollout',
        'restart',
        workloadRef(ROLLOUT_KINDS, kind, name),
        '-n',
        namespace,
    ]);
    k8sService.clearCache(kind, namespace);
    k8sService.clearCache('pods', namespace);
    return { message: stdout.trim() };
}
async function scaleWorkload(kind, namespace, name, replicas) {
    const count = Number(replicas);
    if (!Number.isInteger(count) || count < 0) {
        throw Object.assign(new Error('replicas must be a non-negative integer'), { statusCode: 400 });
    }
    const { stdout } = await run('kubectl', [
        'scale',
        workloadRef(SCALABLE_KINDS, kind, name),
        `--replicas=${count}`,
        '-n',
        namespace,
    ]);
    k8sService.clearCache(kind, namespace);
    return { message: stdout.trim() };
}
async function setNodeCordon(name, cordoned) {
    const { stdout } = await run('kubectl', [cordoned ? 'cordon' : 'uncordon', name]);
    k8sService.clearCache('nodes');
    return { message: stdout.trim() };
}
async function drainNode(name) {
    const { stdout, stderr } = await run('kubectl', [
        'drain',
        name,
        '--ignore-daemonsets',
        '--delete-emptydir-data',
        '--timeout=120s',
    ]);
    k8sService.clearCache('nodes');
    k8sService.clearCache('pods');
    return { message: (stdout || stderr).trim() };
}
module.exports = {
    restart,
    scale,
    stop,
    start,
    deleteResource,
    applyYaml,
    dryRunYaml,
    restartWorkload,
    scaleWorkload,
    setNodeCordon,
    drainNode,
};
