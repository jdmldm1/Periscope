



const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;

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



function assertContainer(value, field = 'container') {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string' || value.length > 63 || !DNS_LABEL.test(value)) {
        throw new ValidationError(`Invalid ${field}: must be a valid container name`);
    }
    return value;
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
};
