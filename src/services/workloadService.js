const { run, spawnSafe } = require('../utils/exec');
const k8sService = require('./k8sService');

// Mutating operations on workloads, all funnelled through argv-based kubectl
// (no shell). Each call invalidates the caches it affects so the UI reflects the
// change on the next poll instead of showing stale state.

async function restart(namespace, name) {
    const { stdout } = await run('kubectl', ['rollout', 'restart', `deployment/${name}`, '-n', namespace]);
    k8sService.clearCache('deployments', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: stdout.trim() };
}

async function scale(namespace, name, replicas) {
    const { stdout } = await run('kubectl', ['scale', `deployment/${name}`, `--replicas=${Number(replicas)}`, '-n', namespace]);
    k8sService.clearCache('deployments', namespace);
    return { message: stdout.trim() };
}

// Stop a deployment by scaling it to 0 replicas. The current replica count is
// stashed in an annotation so that start() can restore it later.
async function stop(namespace, name) {
    let previous = 1;
    try {
        const { stdout: getOut } = await run('kubectl', ['get', `deployment/${name}`, '-n', namespace, '-o', 'jsonpath={.spec.replicas}']);
        const current = parseInt((getOut || '').trim(), 10);
        if (!isNaN(current) && current > 0) previous = current;
    } catch (_) { /* default to 1 */ }

    await run('kubectl', ['annotate', `deployment/${name}`, '-n', namespace, `periscope-previous-replicas=${previous}`, '--overwrite']);
    await run('kubectl', ['scale', `deployment/${name}`, '--replicas=0', '-n', namespace]);

    k8sService.clearCache('deployments', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: `Deployment ${name} stopped (scaled to 0)`, previousReplicas: previous };
}

// Start a previously-stopped deployment by restoring the replica count saved
// when it was stopped (falling back to the request body, then 1).
async function start(namespace, name, bodyReplicas) {
    let saved = NaN;
    try {
        const { stdout: getOut } = await run('kubectl', ['get', `deployment/${name}`, '-n', namespace, '-o', 'jsonpath={.metadata.annotations.periscope-previous-replicas}']);
        saved = parseInt((getOut || '').trim(), 10);
    } catch (_) { /* fall through to body/default */ }

    const reqReplicas = Number(bodyReplicas);
    const target = (!isNaN(saved) && saved > 0)
        ? saved
        : (!isNaN(reqReplicas) && reqReplicas > 0 ? reqReplicas : 1);

    await run('kubectl', ['scale', `deployment/${name}`, `--replicas=${target}`, '-n', namespace]);
    k8sService.clearCache('deployments', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: `Deployment ${name} started (scaled to ${target})`, replicas: target };
}

async function deleteResource(kind, namespace, name) {
    const { stdout } = await run('kubectl', ['delete', kind, name, '-n', namespace]);
    k8sService.clearCache(kind, namespace);
    return { message: stdout.trim() };
}

// Apply a YAML document via `kubectl apply -f -`, piping the content over stdin.
// Resolves with the kubectl output on success; rejects with stderr on failure.
function applyYaml(kind, namespace, yamlContent) {
    return new Promise((resolve, reject) => {
        const args = ['apply', '-f', '-'];
        if (namespace && namespace !== 'all' && namespace !== 'undefined') {
            args.push('-n', namespace);
        }

        const cp = spawnSafe('kubectl', args);
        cp.stdin.write(yamlContent);
        cp.stdin.end();

        let stdout = '';
        let stderr = '';
        cp.stdout.on('data', chunk => stdout += chunk.toString());
        cp.stderr.on('data', chunk => stderr += chunk.toString());

        cp.on('close', (code) => {
            if (code === 0) {
                k8sService.clearCache(kind, namespace);
                resolve({ message: stdout.trim() || 'Resource saved successfully' });
            } else {
                reject(new Error(stderr.trim() || `Failed to apply resource with exit code ${code}`));
            }
        });
        cp.on('error', reject);
    });
}

module.exports = {
    restart,
    scale,
    stop,
    start,
    deleteResource,
    applyYaml,
};
