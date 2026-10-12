const fs = require('fs');
const os = require('os');
const path = require('path');
const UPLOAD_DIR = path.join(os.tmpdir(), 'oras-uploads');
// registry[:port]/repository[:tag|@digest]. Must start alphanumeric so it can never be parsed as a CLI flag.
const OCI_REF = /^[a-zA-Z0-9][a-zA-Z0-9._\-:/@]*$/;
class OrasInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OrasInputError';
        this.statusCode = 400;
    }
}
function assertRef(ref) {
    if (typeof ref !== 'string' || ref.length === 0 || ref.length > 512 || !OCI_REF.test(ref)) {
        throw new OrasInputError('Invalid OCI reference');
    }
    return ref;
}
// Reduce a client-supplied file name to a harmless single path segment.
function safeUploadName(header) {
    const raw = Array.isArray(header) ? header[0] : header;
    const base = path.basename(String(raw || ''))
        .replace(/[^A-Za-z0-9._-]/g, '_')
        .replace(/^[.-]+/, '')
        .slice(0, 128);
    return base || `oras-upload-${Date.now()}`;
}
// Only files inside the upload directory may be pushed (and deleted afterwards).
function resolveUploadPath(filepath, uploadDir = UPLOAD_DIR) {
    if (typeof filepath !== 'string' || filepath.length === 0) {
        throw new OrasInputError('Invalid file path');
    }
    const root = fs.existsSync(uploadDir) ? fs.realpathSync(uploadDir) : path.resolve(uploadDir);
    const resolved = path.resolve(filepath);
    const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
    if (path.dirname(real) !== root) {
        throw new OrasInputError('File must be one uploaded through /oras/upload');
    }
    return real;
}
module.exports = { UPLOAD_DIR, OrasInputError, assertRef, safeUploadName, resolveUploadPath };
