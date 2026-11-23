const { X509Certificate } = require('node:crypto');
const k8sService = require('./k8sService');
const logger = require('../utils/logger');

const DAY_MS = 86400000;

function statusFor(daysLeft) {
    if (daysLeft < 0) return 'expired';
    if (daysLeft < 7) return 'critical';
    if (daysLeft < 30) return 'warning';
    return 'ok';
}

function parseTlsSecret(secret, now = Date.now()) {
    const b64 = secret.data?.['tls.crt'];
    if (!b64) return null;
    const base = { source: 'secret', name: secret.metadata.name, namespace: secret.metadata.namespace };
    let cert;
    try {
        cert = new X509Certificate(Buffer.from(b64, 'base64'));
    } catch (err) {
        return { ...base, status: 'invalid', error: err.message };
    }
    const validTo = new Date(cert.validTo);
    const daysLeft = Math.floor((validTo.getTime() - now) / DAY_MS);
    return {
        ...base,
        subject: cert.subject.replace(/\n/g, ', '),
        issuer: cert.issuer.replace(/\n/g, ', '),
        dnsNames: cert.subjectAltName ? cert.subjectAltName.split(', ') : [],
        notBefore: new Date(cert.validFrom).toISOString(),
        notAfter: validTo.toISOString(),
        daysLeft,
        status: statusFor(daysLeft),
    };
}

function parseCertManagerCertificate(cr, now = Date.now()) {
    const notAfter = cr.status?.notAfter;
    const ready = (cr.status?.conditions || []).find((c) => c.type === 'Ready');
    const daysLeft = notAfter ? Math.floor((new Date(notAfter).getTime() - now) / DAY_MS) : null;
    return {
        source: 'cert-manager',
        name: cr.metadata.name,
        namespace: cr.metadata.namespace,
        secretName: cr.spec?.secretName,
        issuer: cr.spec?.issuerRef ? `${cr.spec.issuerRef.kind || 'Issuer'}/${cr.spec.issuerRef.name}` : undefined,
        dnsNames: cr.spec?.dnsNames || [],
        notAfter: notAfter || null,
        renewalTime: cr.status?.renewalTime || null,
        daysLeft,
        ready: ready ? ready.status === 'True' : null,
        readyMessage: ready?.message,
        status: daysLeft === null ? 'unknown' : statusFor(daysLeft),
    };
}

function summarize(certs) {
    const summary = { total: certs.length, expired: 0, critical: 0, warning: 0, ok: 0, other: 0 };
    for (const c of certs) {
        if (['expired', 'critical', 'warning', 'ok'].includes(c.status)) summary[c.status] += 1;
        else summary.other += 1;
    }
    return summary;
}

async function listCertificates() {
    const secretsRes = await k8sService.core.listSecretForAllNamespaces({ fieldSelector: 'type=kubernetes.io/tls' });
    const certs = k8sService
        .getItems(secretsRes)
        .map((s) => parseTlsSecret(s))
        .filter(Boolean);
    let certManager = false;
    try {
        const crRes = await k8sService.custom.listClusterCustomObject({
            group: 'cert-manager.io',
            version: 'v1',
            plural: 'certificates',
        });
        certManager = true;
        certs.push(...k8sService.getItems(crRes).map((c) => parseCertManagerCertificate(c)));
    } catch (err) {
        logger.debug({ error: err.message }, 'cert-manager Certificates not available');
    }
    certs.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
    return { certManager, summary: summarize(certs), certificates: certs };
}

module.exports = { listCertificates, parseTlsSecret, parseCertManagerCertificate, statusFor, summarize };
