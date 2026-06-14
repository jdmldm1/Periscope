const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const extensions = kc.makeApiClient(k8s.ApiextensionsV1Api);

async function test() {
    try {
        const res = await extensions.listCustomResourceDefinition();
        console.log('CRDs found:', res.items ? res.items.length : 'no items');
    } catch (err) {
        console.error('Error:', err.message);
    }
}
test();
