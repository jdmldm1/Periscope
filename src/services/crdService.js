const k8sService = require('./k8sService');

const MAX_DEPTH = 8;
const MAX_ROWS = 2000;

function flattenSchema(schema, path = '', required = false, depth = 0, rows = []) {
    if (!schema || rows.length >= MAX_ROWS) return rows;
    const type = schema.type || (schema['x-kubernetes-int-or-string'] ? 'int-or-string' : 'object');
    if (path) {
        rows.push({
            path,
            type: type === 'array' && schema.items?.type ? `array<${schema.items.type}>` : type,
            required,
            description: schema.description || '',
            enum: schema.enum,
        });
    }
    if (depth >= MAX_DEPTH) return rows;
    const children = schema.properties || {};
    const requiredKeys = new Set(schema.required || []);
    for (const key of Object.keys(children).sort()) {
        flattenSchema(children[key], path ? `${path}.${key}` : key, requiredKeys.has(key), depth + 1, rows);
    }
    if (schema.items?.properties) {
        flattenSchema({ ...schema.items, description: '' }, `${path}[]`, false, depth + 1, rows);
    }
    return rows;
}

function summarizeCrd(crd) {
    return {
        name: crd.metadata.name,
        group: crd.spec.group,
        scope: crd.spec.scope,
        kind: crd.spec.names?.kind,
        plural: crd.spec.names?.plural,
        versions: (crd.spec.versions || []).map((v) => ({
            name: v.name,
            served: !!v.served,
            storage: !!v.storage,
            deprecated: !!v.deprecated,
            printerColumns: (v.additionalPrinterColumns || []).map((c) => ({
                name: c.name,
                type: c.type,
                jsonPath: c.jsonPath,
            })),
            fields: flattenSchema(v.schema?.openAPIV3Schema),
        })),
    };
}

async function getCrdSchema(name) {
    const crd = await k8sService.extensions.readCustomResourceDefinition({ name });
    return summarizeCrd(crd);
}

module.exports = { getCrdSchema, summarizeCrd, flattenSchema };
