const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const logger = require('../utils/logger');
const zarfService = require('../services/zarfService');

const router = express.Router();
const ORAS_BIN_DIR = '/app/bin';
const ORAS_PATH = path.join(ORAS_BIN_DIR, 'oras');

function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stdout, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

async function getOrasBinaryPath() {
    // Check if in PATH
    try {
        await runCommand('oras version');
        return 'oras';
    } catch (e) {}

    // Check if in /app/bin
    if (fs.existsSync(ORAS_PATH)) {
        return ORAS_PATH;
    }
    return null;
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
        const binPath = await getOrasBinaryPath();
        if (binPath) {
            return res.json({ success: true, message: 'ORAS binary is already installed' });
        }

        logger.info('Downloading ORAS binary...');
        if (!fs.existsSync(ORAS_BIN_DIR)) {
            fs.mkdirSync(ORAS_BIN_DIR, { recursive: true });
        }

        const arch = process.arch === 'x64' ? 'amd64' : 'arm64';
        const url = `https://github.com/oras-project/oras/releases/download/v1.2.0/oras_1.2.0_linux_${arch}.tar.gz`;
        const tarPath = path.join(ORAS_BIN_DIR, 'oras.tar.gz');

        await runCommand(`curl -sSL "${url}" -o "${tarPath}"`);
        await runCommand(`tar -zxf "${tarPath}" -C "${ORAS_BIN_DIR}" oras`);
        fs.unlinkSync(tarPath);
        fs.chmodSync(ORAS_PATH, '755');

        res.json({ success: true, message: 'ORAS binary downloaded successfully' });
    } catch (err) {
        logger.error(err, 'Failed to download ORAS binary');
        res.status(500).json({ error: err.message || 'Failed to download ORAS binary' });
    }
});

router.post('/oras/upload', (req, res) => {
    const filename = req.headers['x-file-name'] || `oras-upload-${Date.now()}`;
    const uploadDir = path.join(os.tmpdir(), 'oras-uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filepath = path.join(uploadDir, filename);
    const writeStream = fs.createWriteStream(filepath);
    
    req.pipe(writeStream);
    
    writeStream.on('finish', () => {
        res.json({ success: true, filepath, filename });
    });
    
    writeStream.on('error', (err) => {
        res.status(500).json({ error: 'Upload failed: ' + err.message });
    });
});

router.post('/oras/push', async (req, res) => {
    const { ref, filepath, username, password, useZarfCreds, insecure } = req.body;
    if (!ref || !filepath) {
        return res.status(400).json({ error: 'Ref and filepath are required' });
    }
    if (!fs.existsSync(filepath)) {
        return res.status(400).json({ error: 'Uploaded file not found on server' });
    }

    const binPath = await getOrasBinaryPath();
    if (!binPath) {
        return res.status(500).json({ error: 'ORAS binary not installed' });
    }

    const configPath = path.join(os.tmpdir(), `oras-config-${Date.now()}.json`);
    let logs = '';

    try {
        let pushUser = username;
        let pushPass = password;

        if (useZarfCreds) {
            const creds = await zarfService.getCreds();
            const registryCred = creds.find(c => c.application === 'Registry');
            if (registryCred) {
                pushUser = registryCred.username;
                pushPass = registryCred.password;
            } else {
                throw new Error('Zarf registry credentials not found');
            }
        }

        if (pushUser && pushPass) {
            const registryDomain = ref.split('/')[0];
            logs += `Logging into registry ${registryDomain}...\n`;
            const loginCmd = `"${binPath}" login --registry-config "${configPath}" -u "${pushUser.replace(/"/g, '\\"')}" -p "${pushPass.replace(/"/g, '\\"')}" "${registryDomain}"`;
            const loginRes = await runCommand(loginCmd);
            logs += `${loginRes.stdout}\n${loginRes.stderr}\n`;
        }

        logs += `Pushing artifact ${ref}...\n`;
        const filename = path.basename(filepath);
        const fileDir = path.dirname(filepath);
        const insecureFlag = insecure ? ' --insecure' : '';
        const pushCmd = `"${binPath}" push --registry-config "${configPath}"${insecureFlag} "${ref}" "${filename}"`;
        
        const pushRes = await new Promise((resolve, reject) => {
            exec(pushCmd, { cwd: fileDir }, (err, stdout, stderr) => {
                if (err) reject({ err, stdout, stderr });
                else resolve({ stdout, stderr });
            });
        });

        logs += `${pushRes.stdout}\n${pushRes.stderr}\n`;
        
        try { fs.unlinkSync(filepath); } catch (e) {}
        try { fs.unlinkSync(configPath); } catch (e) {}

        res.json({ success: true, logs });
    } catch (errObj) {
        logger.error(errObj.error || errObj, 'ORAS push failed');
        const errLogs = logs + `\nERROR: ${errObj.err?.message || errObj.message || ''}\n${errObj.stderr || ''}\n${errObj.stdout || ''}`;
        try { fs.unlinkSync(filepath); } catch (e) {}
        try { fs.unlinkSync(configPath); } catch (e) {}
        res.status(500).json({ error: 'ORAS push failed', logs: errLogs });
    }
});

router.post('/oras/pull', async (req, res) => {
    const { ref, username, password, useZarfCreds, insecure } = req.body;
    if (!ref) {
        return res.status(400).json({ error: 'Ref is required' });
    }

    const binPath = await getOrasBinaryPath();
    if (!binPath) {
        return res.status(500).json({ error: 'ORAS binary not installed' });
    }

    const configPath = path.join(os.tmpdir(), `oras-config-${Date.now()}.json`);
    const tempPullDir = path.join(os.tmpdir(), `oras-pull-${Date.now()}`);
    fs.mkdirSync(tempPullDir, { recursive: true });

    let logs = '';

    try {
        let pullUser = username;
        let pullPass = password;

        if (useZarfCreds) {
            const creds = await zarfService.getCreds();
            const registryCred = creds.find(c => c.application === 'Registry');
            if (registryCred) {
                pullUser = registryCred.username;
                pullPass = registryCred.password;
            } else {
                throw new Error('Zarf registry credentials not found');
            }
        }

        if (pullUser && pullPass) {
            const registryDomain = ref.split('/')[0];
            logs += `Logging into registry ${registryDomain}...\n`;
            const loginCmd = `"${binPath}" login --registry-config "${configPath}" -u "${pullUser.replace(/"/g, '\\"')}" -p "${pullPass.replace(/"/g, '\\"')}" "${registryDomain}"`;
            const loginRes = await runCommand(loginCmd);
            logs += `${loginRes.stdout}\n${loginRes.stderr}\n`;
        }

        logs += `Pulling artifact ${ref}...\n`;
        const insecureFlag = insecure ? ' --insecure' : '';
        const pullCmd = `"${binPath}" pull --registry-config "${configPath}"${insecureFlag} -o "${tempPullDir}" "${ref}"`;
        const pullRes = await runCommand(pullCmd);
        logs += `${pullRes.stdout}\n${pullRes.stderr}\n`;

        const files = fs.readdirSync(tempPullDir);
        if (files.length === 0) {
            throw new Error('No files pulled from the OCI artifact');
        }

        try { fs.unlinkSync(configPath); } catch (e) {}

        if (files.length === 1) {
            const fileToStream = files[0];
            const fullFilePath = path.join(tempPullDir, fileToStream);
            res.download(fullFilePath, fileToStream, () => {
                try { fs.rmSync(tempPullDir, { recursive: true, force: true }); } catch (e) {}
            });
        } else {
            const tarPath = path.join(os.tmpdir(), `oras-pulled-${Date.now()}.tar.gz`);
            await runCommand(`tar -czf "${tarPath}" -C "${tempPullDir}" .`);
            res.download(tarPath, 'artifact.tar.gz', () => {
                try { fs.unlinkSync(tarPath); } catch (e) {}
                try { fs.rmSync(tempPullDir, { recursive: true, force: true }); } catch (e) {}
            });
        }
    } catch (errObj) {
        logger.error(errObj.error || errObj, 'ORAS pull failed');
        const errLogs = logs + `\nERROR: ${errObj.err?.message || errObj.message || ''}\n${errObj.stderr || ''}\n${errObj.stdout || ''}`;
        try { fs.unlinkSync(configPath); } catch (e) {}
        try { fs.rmSync(tempPullDir, { recursive: true, force: true }); } catch (e) {}
        res.status(500).json({ error: 'ORAS pull failed', logs: errLogs });
    }
});

module.exports = router;
