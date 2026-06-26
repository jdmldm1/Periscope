const test = require('node:test');
const assert = require('node:assert');

// Stub KubeConfig and API client classes before requiring k8sService
const mockK8s = {
    KubeConfig: class {
        loadFromDefault() {}
        makeApiClient(apiClass) {
            return new apiClass();
        }
        contexts = [{ name: 'test-context', cluster: 'cluster', user: 'user' }];
        currentContext = 'test-context';
    },
    CoreV1Api: class {
        async listNamespacedPod() {
            return { items: [{ metadata: { name: 'pod-1' } }] };
        }
        async listNode() {
            return { items: [{ metadata: { name: 'node-1' } }] };
        }
        async listNamespace() {
            return { items: [{ metadata: { name: 'default' } }] };
        }
        async listNamespacedService() {
            return { items: [{ metadata: { name: 'svc-1' } }] };
        }
    },
    AppsV1Api: class {
        async listNamespacedDeployment() {
            return { items: [{ metadata: { name: 'deploy-1' } }] };
        }
    },
    BatchV1Api: class {},
    NetworkingV1Api: class {},
    CustomObjectsApi: class {},
    ApiextensionsV1Api: class {},
    RbacAuthorizationV1Api: class {}
};

// Require override or use require cache override
require.cache[require.resolve('@kubernetes/client-node')] = {
    exports: mockK8s
};

const k8sService = require('./k8sService');

test('k8sService.getResources - pod namespace default', async () => {
    k8sService.clearCache();
    const pods = await k8sService.getResources('pods', 'default');
    assert.strictEqual(pods.length, 1);
    assert.strictEqual(pods[0].metadata.name, 'pod-1');
});

test('k8sService.getTopologyData', async () => {
    const topo = await k8sService.getTopologyData('default');
    assert.ok(topo.nodes);
    assert.ok(topo.pods);
    assert.strictEqual(topo.pods[0].metadata.name, 'pod-1');
});
