const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('../utils/logger');
const zarfService = require('../services/zarfService');
const { run, runWithStdin } = require('../utils/exec');
const { UPLOAD_DIR, OrasInputError, assertRef, safeUploadName, resolveUploadPath } = require('../utils/oras');
const router = express.Router();
const ORAS_BIN_DIR = '/app/bin';
const ORAS_PATH = path.join(ORAS_BIN_DIR, 'oras');
const MAX_UPLOAD_BYTES = parseInt(process.env.ORAS_MAX_UPLOAD_BYTES || String(8 * 1024 ** 3), 10);
async function getOrasBinaryPath() {
    try {
        await run('oras', ['version']);
        return 'oras';
    }
    catch (e) { }
    return fs.existsSync(ORAS_PATH) ? ORAS_PATH : null;
}
function removeQuietly(target) {
    try {
        fs.rmSync(target, { recursive: true, force: true });
    }
    catch (e) { }
}
// Resolve the credentials for a push/pull: Zarf's registry creds, or the ones in the request.
async function resolveCredentials({ username, password, useZarfCreds }) {
    if (useZarfCreds) {
        const creds = await zarfService.getCreds();
        const registryCred = creds.find(c => c.application === 'Registry');
        if (!registryCred) {
            throw new Error('Zarf registry credentials not found');
        }
        return { user: registryCred.username, pass: registryCred.password };
    }
    return { user: username, pass: password };
}
// Log in using a private, per-request registry config. The password goes over stdin, never argv.
async function login(binPath, configPath, ref, { user, pass }) {
    if (!user || !pass) {
        return '';
    }
    const registryDomain = ref.split('/')[0];
    const { stdout, stderr } = await runWithStdin(binPath, [
        'login', '--registry-config', configPath, '-u', String(user), '--password-stdin', registryDomain,
    ], String(pass));
    return `Logging into registry ${registryDomain}...\n${stdout}\n${stderr}\n`;
}
function errorLogs(logs, errObj) {
    return logs + `\nERROR: ${errObj.message || ''}\n${errObj.stderr || ''}\n${errObj.stdout || ''}`;
}
function sendFailure(res, errObj, label, logs) {
    if (errObj instanceof OrasInputError) {
        return res.status(errObj.statusCode).json({ error: errObj.message });
    }
    logger.error(errObj, `ORAS ${label} failed`);
    return res.status(500).json({ error: `ORAS ${label} failed`, logs: errorLogs(logs, errObj) });
}
router.get('/oras/status', async (req, res) => {
    const binPath = await getOrasBinaryPath();
    const isAirgapped = process.env.AIRGAP === 'true';
    res.json({
        installed: binPath !== null,
        mode: isAirgapped ? 'airgap' : 'connected'
    });
});
router.post('/oras/download-binary', async (req, res) => {
    try {
        if (await getOrasBinaryPath()) {
            return res.json({ success: true, message: 'ORAS binary is already installed' });
        }
        logger.info('Downloading ORAS binary...');
        fs.mkdirSync(ORAS_BIN_DIR, { recursive: true });
        const arch = process.arch === 'x64' ? 'amd64' : 'arm64';
        const url = `https://github.com/oras-project/oras/releases/download/v1.2.0/oras_1.2.0_linux_${arch}.tar.gz`;
        const tarPath = path.join(ORAS_BIN_DIR, 'oras.tar.gz');
        await run('curl', ['-fsSL', url, '-o', tarPath]);
        await run('tar', ['-zxf', tarPath, '-C', ORAS_BIN_DIR, 'oras']);
        fs.unlinkSync(tarPath);
        fs.chmodSync(ORAS_PATH, '755');
        res.json({ success: true, message: 'ORAS binary downloaded successfully' });
    }
    catch (err) {
        logger.error(err, 'Failed to download ORAS binary');
        res.status(500).json({ error: err.message || 'Failed to download ORAS binary' });
    }
});
router.post('/oras/upload', (req, res) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });
    const filename = safeUploadName(req.headers['x-file-name']);
    const filepath = path.join(UPLOAD_DIR, filename);
    const writeStream = fs.createWriteStream(filepath, { mode: 0o600 });
    let received = 0;
    req.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_UPLOAD_BYTES) {
            req.unpipe(writeStream);
            writeStream.destroy();
            removeQuietly(filepath);
            if (!res.headersSent) {
                res.status(413).json({ error: 'Upload too large' });
            }
            req.destroy();
        }
    });
    req.pipe(writeStream);
    writeStream.on('finish', () => {
        res.json({ success: true, filepath, filename });
    });
    writeStream.on('error', (err) => {
        removeQuietly(filepath);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Upload failed: ' + err.message });
        }
    });
});
router.post('/oras/push', async (req, res) => {
    const { ref, filepath, username, password, useZarfCreds, insecure } = req.body || {};
    let workDir;
    let file;
    let logs = '';
    try {
        if (!ref || !filepath) {
            throw new OrasInputError('Ref and filepath are required');
        }
        assertRef(ref);
        file = resolveUploadPath(filepath);
        if (!fs.existsSync(file)) {
            throw new OrasInputError('Uploaded file not found on server');
        }
        const binPath = await getOrasBinaryPath();
        if (!binPath) {
            return res.status(500).json({ error: 'ORAS binary not installed' });
        }
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oras-push-'));
        const configPath = path.join(workDir, 'config.json');
        logs += await login(binPath, configPath, ref, await resolveCredentials({ username, password, useZarfCreds }));
        logs += `Pushing artifact ${ref}...\n`;
        const args = ['push', '--registry-config', configPath];
        if (insecure) {
            args.push('--insecure');
        }
        args.push(ref, path.basename(file));
        const pushRes = await run(binPath, args, { cwd: path.dirname(file) });
        logs += `${pushRes.stdout}\n${pushRes.stderr}\n`;
        res.json({ success: true, logs });
    }
    catch (errObj) {
        sendFailure(res, errObj, 'push', logs);
    }
    finally {
        if (file) {
            removeQuietly(file);
        }
        if (workDir) {
            removeQuietly(workDir);
        }
    }
});
router.post('/oras/pull', async (req, res) => {
    const { ref, username, password, useZarfCreds, insecure } = req.body || {};
    let workDir;
    let logs = '';
    let handedOffCleanup = false;
    try {
        assertRef(ref);
        const binPath = await getOrasBinaryPath();
        if (!binPath) {
            return res.status(500).json({ error: 'ORAS binary not installed' });
        }
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oras-pull-'));
        const configPath = path.join(workDir, 'config.json');
        const pullDir = path.join(workDir, 'out');
        fs.mkdirSync(pullDir);
        logs += await login(binPath, configPath, ref, await resolveCredentials({ username, password, useZarfCreds }));
        logs += `Pulling artifact ${ref}...\n`;
        const args = ['pull', '--registry-config', configPath];
        if (insecure) {
            args.push('--insecure');
        }
        args.push('-o', pullDir, ref);
        const pullRes = await run(binPath, args);
        logs += `${pullRes.stdout}\n${pullRes.stderr}\n`;
        // The config file holds registry credentials: drop it before streaming anything back.
        removeQuietly(configPath);
        const files = fs.readdirSync(pullDir);
        if (files.length === 0) {
            throw new Error('No files pulled from the OCI artifact');
        }
        let downloadPath = path.join(pullDir, files[0]);
        let downloadName = files[0];
        if (files.length > 1 || fs.statSync(downloadPath).isDirectory()) {
            downloadPath = path.join(workDir, 'artifact.tar.gz');
            downloadName = 'artifact.tar.gz';
            await run('tar', ['-czf', downloadPath, '-C', pullDir, '.']);
        }
        handedOffCleanup = true;
        res.download(downloadPath, downloadName, () => removeQuietly(workDir));
    }
    catch (errObj) {
        sendFailure(res, errObj, 'pull', logs);
    }
    finally {
        if (workDir && !handedOffCleanup) {
            removeQuietly(workDir);
        }
    }
});
module.exports = router;
