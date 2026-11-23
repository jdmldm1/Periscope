const k8sService = require('./k8sService');

const SEARCH_KINDS = [
    'pods',
    'deployments',
    'statefulsets',
    'daemonsets',
    'services',
    'ingresses',
    'configmaps',
    'secrets',
    'jobs',
    'cronjobs',
    'persistentvolumeclaims',
    'namespaces',
    'nodes',
];
const MAX_QUERY = 100;

function rank(name, q) {
    const n = name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    return n.includes(q) ? 2 : -1;
}

function matchItems(kind, items, q) {
    const out = [];
    for (const item of items) {
        const name = item.metadata?.name;
        if (!name) continue;
        const score = rank(name, q);
        if (score >= 0) out.push({ kind, name, namespace: item.metadata.namespace || null, score });
    }
    return out;
}

async function search(rawQuery, limit = 30) {
    const q = String(rawQuery || '')
        .trim()
        .toLowerCase()
        .slice(0, MAX_QUERY);
    if (q.length < 2) return [];
    const results = await Promise.allSettled(
        SEARCH_KINDS.map(async (kind) => matchItems(kind, await k8sService.getResources(kind, 'all'), q)),
    );
    return results
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
        .slice(0, limit)
        .map(({ score: _score, ...rest }) => rest);
}

module.exports = { search, matchItems, rank, SEARCH_KINDS };
