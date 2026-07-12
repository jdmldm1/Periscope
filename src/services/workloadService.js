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
    const { stdout } = await run('kubectl', ['scale', `deployment/${name}`, `--replicas=${Number(replicas)}`, '-n', namespace]);
    k8sService.clearCache('deployments', namespace);
    return { message: stdout.trim() };
}



async function stop(namespace, name) {
    let previous = 1;
    try {
        const { stdout: getOut } = await run('kubectl', ['get', `deployment/${name}`, '-n', namespace, '-o', 'jsonpath={.spec.replicas}']);
        const current = parseInt((getOut || '').trim(), 10);
        if (!isNaN(current) && current > 0) previous = current;
    } catch (_) {  }

    await run('kubectl', ['annotate', `deployment/${name}`, '-n', namespace, `periscope-previous-replicas=${previous}`, '--overwrite']);
    await run('kubectl', ['scale', `deployment/${name}`, '--replicas=0', '-n', namespace]);

    k8sService.clearCache('deployments', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: `Deployment ${name} stopped (scaled to 0)`, previousReplicas: previous };
}



async function start(namespace, name, bodyReplicas) {
    let saved = NaN;
    try {
        const { stdout: getOut } = await run('kubectl', ['get', `deployment/${name}`, '-n', namespace, '-o', 'jsonpath={.metadata.annotations.periscope-previous-replicas}']);
        saved = parseInt((getOut || '').trim(), 10);
    } catch (_) {  }

    const reqReplicas = Number(bodyReplicas);
    const target = (!isNaN(saved) && saved > 0)
        ? saved
        : (!isNaN(reqReplicas) && reqReplicas > 0 ? reqReplicas : 1);

    await run('kubectl', ['scale', `deployment/${name}`, `--replicas=${target}`, '-n', namespace]);
    k8sService.clearCache('deployments', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: `Deployment ${name} started (scaled to ${target})`, replicas: target };
}



const CLUSTER_SCOPED = new Set(['namespaces', 'namespace', 'ns', 'nodes', 'node', 'persistentvolumes', 'pv', 'customresourcedefinitions', 'crds', 'crd']);

async function deleteResource(kind, namespace, name) {
    const clusterScoped = CLUSTER_SCOPED.has(String(kind).toLowerCase());
    const args = clusterScoped || !namespace || namespace === 'undefined' || namespace === 'all'
        ? ['delete', kind, name]
        : ['delete', kind, name, '-n', namespace];
    const { stdout } = await run('kubectl', args);
    k8sService.clearCache(kind, namespace);
    return { message: stdout.trim() };
}



function applyYaml(kind, namespace, yamlContent) {
    return new Promise((resolve, reject) => {



        let payload = yamlContent;
        try {
            const doc = yaml.load(yamlContent);
            if (doc && typeof doc === 'object' && (!doc.apiVersion || !doc.kind)) {
                payload = yaml.dump(ensureTypeMeta(doc, kind));
            }
        } catch (_) {  }

        const args = ['apply', '-f', '-'];
        if (namespace && namespace !== 'all' && namespace !== 'undefined') {
            args.push('-n', namespace);
        }

        const cp = spawnSafe('kubectl', args);
        cp.stdin.write(payload);
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
