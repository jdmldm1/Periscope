const test = require('node:test');
const assert = require('node:assert/strict');
const { flattenSchema, summarizeCrd } = require('./crdService');

const schema = {
    type: 'object',
    properties: {
        spec: {
            type: 'object',
            required: ['size'],
            properties: {
                size: { type: 'integer', description: 'Replica count' },
                tags: { type: 'array', items: { type: 'string' } },
                ports: { type: 'array', items: { type: 'object', properties: { port: { type: 'integer' } } } },
            },
        },
    },
};

test('flattenSchema walks nested properties with required flags', () => {
    const rows = flattenSchema(schema);
    const byPath = Object.fromEntries(rows.map((r) => [r.path, r]));
    assert.equal(byPath['spec.size'].required, true);
    assert.equal(byPath['spec.size'].description, 'Replica count');
    assert.equal(byPath['spec.tags'].type, 'array<string>');
    assert.ok(byPath['spec.ports[].port']);
});

test('summarizeCrd lists versions and printer columns', () => {
    const out = summarizeCrd({
        metadata: { name: 'widgets.example.com' },
        spec: {
            group: 'example.com',
            scope: 'Namespaced',
            names: { kind: 'Widget', plural: 'widgets' },
            versions: [
                {
                    name: 'v1',
                    served: true,
                    storage: true,
                    additionalPrinterColumns: [{ name: 'Age', type: 'date', jsonPath: '.metadata.creationTimestamp' }],
                    schema: { openAPIV3Schema: schema },
                },
            ],
        },
    });
    assert.equal(out.versions[0].printerColumns[0].name, 'Age');
    assert.ok(out.versions[0].fields.length > 0);
});
