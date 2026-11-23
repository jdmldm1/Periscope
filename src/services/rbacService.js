const k8sService = require('./k8sService');

function subjectId(s) {
    return `${s.kind}/${s.namespace || ''}/${s.name}`;
}

function ruleAllows(rule, { verb, resource, apiGroup }) {
    const has = (list, value) => (list || []).includes('*') || (list || []).includes(value);
    return has(rule.verbs, verb) && has(rule.apiGroups, apiGroup) && has(rule.resources, resource);
}

function isWildcardRule(rule) {
    return (rule.verbs || []).includes('*') && (rule.resources || []).includes('*');
}

function buildGrants({ clusterRoles, roles, clusterRoleBindings, roleBindings }) {
    const clusterRoleByName = new Map(clusterRoles.map((r) => [r.metadata.name, r]));
    const roleByKey = new Map(roles.map((r) => [`${r.metadata.namespace}/${r.metadata.name}`, r]));
    const grants = [];
    const add = (binding, scope) => {
        const ref = binding.roleRef;
        const role =
            ref.kind === 'ClusterRole'
                ? clusterRoleByName.get(ref.name)
                : roleByKey.get(`${binding.metadata.namespace}/${ref.name}`);
        const rules = role?.rules || [];
        for (const subject of binding.subjects || []) {
            grants.push({
                subject: {
                    kind: subject.kind,
                    name: subject.name,
                    namespace: subject.kind === 'ServiceAccount' ? subject.namespace : undefined,
                },
                binding: { name: binding.metadata.name, kind: scope ? 'RoleBinding' : 'ClusterRoleBinding' },
                role: { kind: ref.kind, name: ref.name, found: !!role },
                scope: scope || 'cluster',
                rules,
                clusterAdmin: ref.kind === 'ClusterRole' && ref.name === 'cluster-admin',
                wildcard: rules.some(isWildcardRule),
            });
        }
    };
    clusterRoleBindings.forEach((b) => add(b, null));
    roleBindings.forEach((b) => add(b, b.metadata.namespace));
    return grants;
}

function summarizeSubjects(grants) {
    const map = new Map();
    for (const g of grants) {
        const id = subjectId(g.subject);
        const entry = map.get(id) || {
            ...g.subject,
            bindings: 0,
            clusterAdmin: false,
            wildcard: false,
            clusterWide: false,
        };
        entry.bindings += 1;
        entry.clusterAdmin ||= g.clusterAdmin;
        entry.wildcard ||= g.wildcard;
        entry.clusterWide ||= g.scope === 'cluster';
        map.set(id, entry);
    }
    return [...map.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

function grantsForSubject(grants, { kind, name, namespace }) {
    return grants.filter(
        (g) =>
            g.subject.kind === kind &&
            g.subject.name === name &&
            (kind !== 'ServiceAccount' || g.subject.namespace === namespace),
    );
}

function whoCan(grants, query, namespace) {
    const matched = grants.filter((g) => {
        if (namespace && g.scope !== 'cluster' && g.scope !== namespace) return false;
        return g.rules.some((r) => ruleAllows(r, query));
    });
    return summarizeSubjects(matched);
}

async function loadGrants() {
    const [crs, rs, crbs, rbs] = await Promise.all([
        k8sService.rbac.listClusterRole(),
        k8sService.rbac.listRoleForAllNamespaces(),
        k8sService.rbac.listClusterRoleBinding(),
        k8sService.rbac.listRoleBindingForAllNamespaces(),
    ]);
    return buildGrants({
        clusterRoles: k8sService.getItems(crs),
        roles: k8sService.getItems(rs),
        clusterRoleBindings: k8sService.getItems(crbs),
        roleBindings: k8sService.getItems(rbs),
    });
}

module.exports = { buildGrants, summarizeSubjects, grantsForSubject, whoCan, ruleAllows, loadGrants };
