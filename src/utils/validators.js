/**
 * Input validation for Kubernetes identifiers.
 *
 * These guards are defense-in-depth: the primary protection against command
 * injection is that we no longer build shell strings (see src/utils/exec.js).
 * On top of that, rejecting values that can't be legal Kubernetes identifiers
 * gives callers clean 400 errors instead of confusing downstream failures, and
 * keeps obviously-hostile input from ever reaching an external binary.
 */

// RFC 1123 label (namespaces, container names): lower alphanumeric + '-', <=63.
const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
// RFC 1123 subdomain (most resource names): allows dots too, <=253.
const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
// Kubernetes kinds and CRD names: letters/digits/dots/hyphens (e.g. 'deployments', 'foos.example.com').
const KIND = /^[a-zA-Z][a-zA-Z0-9.-]*$/;

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
    }
}

function isValidNamespace(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 63 && DNS_LABEL.test(value);
}

function isValidName(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 253 && DNS_SUBDOMAIN.test(value);
}

function isValidKind(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 253 && KIND.test(value);
}

// Namespace, but also accepting the sentinel values the codebase uses for
// "every namespace".
function isValidNamespaceOrAll(value) {
    return value === 'all' || value === 'undefined' || isValidNamespace(value);
}

function assertNamespace(value, field = 'namespace') {
    if (!isValidNamespaceOrAll(value)) {
        throw new ValidationError(`Invalid ${field}: must be a valid Kubernetes namespace`);
    }
    return value;
}

function assertName(value, field = 'name') {
    if (!isValidName(value)) {
        throw new ValidationError(`Invalid ${field}: must be a valid Kubernetes resource name`);
    }
    return value;
}

function assertKind(value, field = 'kind') {
    if (!isValidKind(value)) {
        throw new ValidationError(`Invalid ${field}: must be a valid Kubernetes kind`);
    }
    return value;
}

// Container names follow the DNS-label rules; optional (undefined means "default
// container").
function assertContainer(value, field = 'container') {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string' || value.length > 63 || !DNS_LABEL.test(value)) {
        throw new ValidationError(`Invalid ${field}: must be a valid container name`);
    }
    return value;
}

/**
 * Express middleware: validate common :namespace/:name/:kind route params.
 * Skips any param that isn't present on the route.
 */
function validateResourceParams(req, res, next) {
    try {
        const { namespace, name, kind, podName } = req.params;
        if (namespace !== undefined) assertNamespace(namespace);
        if (name !== undefined) assertName(name);
        if (podName !== undefined) assertName(podName, 'podName');
        if (kind !== undefined) assertKind(kind.replace(/^resource\//, ''));
        next();
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    }
}

module.exports = {
    ValidationError,
    isValidNamespace,
    isValidName,
    isValidKind,
    isValidNamespaceOrAll,
    assertNamespace,
    assertName,
    assertKind,
    assertContainer,
    validateResourceParams,
};
