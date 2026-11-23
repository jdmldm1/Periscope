const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGrants, summarizeSubjects, grantsForSubject, whoCan, ruleAllows } = require('./rbacService');

const meta = (name, namespace) => ({ name, namespace });
const fixture = () => ({
    clusterRoles: [
        { metadata: meta('cluster-admin'), rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }] },
        { metadata: meta('pod-reader'), rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] }] },
    ],
    roles: [
        {
            metadata: meta('secret-reader', 'prod'),
            rules: [{ apiGroups: [''], resources: ['secrets'], verbs: ['get'] }],
        },
    ],
    clusterRoleBindings: [
        {
            metadata: meta('admins'),
            roleRef: { kind: 'ClusterRole', name: 'cluster-admin' },
            subjects: [{ kind: 'Group', name: 'ops' }],
        },
    ],
    roleBindings: [
        {
            metadata: meta('rb1', 'prod'),
            roleRef: { kind: 'Role', name: 'secret-reader' },
            subjects: [{ kind: 'ServiceAccount', name: 'app', namespace: 'prod' }],
        },
        {
            metadata: meta('rb2', 'dev'),
            roleRef: { kind: 'ClusterRole', name: 'pod-reader' },
            subjects: [{ kind: 'User', name: 'alice' }],
        },
    ],
});

test('ruleAllows honours wildcards and exact matches', () => {
    const rule = { apiGroups: [''], resources: ['pods'], verbs: ['get'] };
    assert.equal(ruleAllows(rule, { verb: 'get', resource: 'pods', apiGroup: '' }), true);
    assert.equal(ruleAllows(rule, { verb: 'delete', resource: 'pods', apiGroup: '' }), false);
    assert.equal(ruleAllows(rule, { verb: 'get', resource: 'pods', apiGroup: 'apps' }), false);
    const wildcard = { apiGroups: ['*'], resources: ['*'], verbs: ['*'] };
    assert.equal(ruleAllows(wildcard, { verb: 'x', resource: 'y', apiGroup: 'z' }), true);
});

test('buildGrants flags cluster-admin and wildcard bindings and scopes role bindings', () => {
    const grants = buildGrants(fixture());
    const ops = grants.find((g) => g.subject.name === 'ops');
    assert.equal(ops.clusterAdmin, true);
    assert.equal(ops.wildcard, true);
    assert.equal(ops.scope, 'cluster');
    const alice = grants.find((g) => g.subject.name === 'alice');
    assert.equal(alice.scope, 'dev');
    assert.equal(alice.clusterAdmin, false);
});

test('summarizeSubjects merges bindings per subject', () => {
    const grants = buildGrants(fixture());
    const subjects = summarizeSubjects([...grants, ...grants]);
    assert.equal(subjects.length, 3);
    assert.equal(subjects.find((s) => s.name === 'ops').bindings, 2);
});

test('grantsForSubject matches service accounts by namespace', () => {
    const grants = buildGrants(fixture());
    assert.equal(grantsForSubject(grants, { kind: 'ServiceAccount', name: 'app', namespace: 'prod' }).length, 1);
    assert.equal(grantsForSubject(grants, { kind: 'ServiceAccount', name: 'app', namespace: 'dev' }).length, 0);
});

test('whoCan respects namespace scope', () => {
    const grants = buildGrants(fixture());
    const query = { verb: 'get', resource: 'secrets', apiGroup: '' };
    const names = (ns) => whoCan(grants, query, ns).map((s) => s.name);
    assert.deepEqual(names('prod').sort(), ['app', 'ops']);
    assert.deepEqual(names('dev'), ['ops']);
    assert.deepEqual(names(undefined).sort(), ['app', 'ops']);
});
