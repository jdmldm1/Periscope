const express = require('express');
const router = express.Router();
const zarfService = require('../services/zarfService');

router.get('/status', async (req, res) => {
    try {
        const status = await zarfService.getStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/packages', async (req, res) => {
    try {
        const packages = await zarfService.listPackages();
        res.json(packages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/deploy', async (req, res) => {
    try {
        const taskId = await zarfService.deployPackage(req.body.packagePath, req.body.configPath);
        res.json({ success: true, taskId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/packages/:name', async (req, res) => {
    try {
        const output = await zarfService.removePackage(req.params.name);
        res.json({ success: true, output });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/registry/all-images', async (req, res) => {
    try {
        const images = await zarfService.getRegistryAllImages();
        res.json(images);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/upload', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const filename = req.headers['x-file-name'] || `zarf-upload-${Date.now()}.tar.zst`;
    const filepath = path.join(process.cwd(), filename);
    const writeStream = fs.createWriteStream(filepath);
    
    req.pipe(writeStream);
    
    writeStream.on('finish', () => {
        res.json({ success: true, filepath, filename });
    });
    
    writeStream.on('error', (err) => {
        res.status(500).json({ error: 'Upload failed: ' + err.message });
    });
});

router.post('/config', async (req, res) => {
    const { content, filename } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    const targetName = filename || 'zarf-config.yaml';
    const path = require('path');
    const targetPath = path.join(process.cwd(), targetName);
    try {
        const fs = require('fs');
        fs.writeFileSync(targetPath, content, 'utf8');
        res.json({ success: true, filepath: targetPath, filename: targetName });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save config: ' + err.message });
    }
});

router.post('/unpack', async (req, res) => {
    try {
        const result = await zarfService.unpackPackage(req.body.packagePath);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/rebuild-deploy', async (req, res) => {
    try {
        const taskId = await zarfService.rebuildDeploy(req.body.tempDir, req.body.configText);
        res.json({ success: true, taskId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/local-packages', async (req, res) => {
    try {
        const list = await zarfService.listLocalPackages();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/local-packages', async (req, res) => {
    try {
        const result = await zarfService.deleteLocalPackage(req.query.name);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/archiver/compress', async (req, res) => {
    try {
        const taskId = await zarfService.compressFolder(req.body.source, req.body.dest);
        res.json({ success: true, taskId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/archiver/decompress', async (req, res) => {
    try {
        const taskId = await zarfService.decompressPackage(req.body.source, req.body.dest);
        res.json({ success: true, taskId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/sbom/inspect', async (req, res) => {
    try {
        const result = await zarfService.inspectSbom(req.body.packageName);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/clear-cache', async (req, res) => {
    try {
        const result = await zarfService.clearCache();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/packages/:name', async (req, res) => {
    try {
        const detail = await zarfService.getPackage(req.params.name);
        res.json(detail);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/state', async (req, res) => {
    try {
        const state = await zarfService.getZarfState();
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/creds', async (req, res) => {
    try {
        const creds = await zarfService.getCreds();
        res.json(creds);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/registry/catalog', async (req, res) => {
    try {
        const catalog = await zarfService.getRegistryCatalog();
        res.json(catalog);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/registry/repository/*repoPath/tags', async (req, res) => {
    try {
        const repo = req.params.repoPath;
        const tags = await zarfService.getRegistryRepositoryTags(repo);
        res.json(tags);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/registry/image', async (req, res) => {
    try {
        const result = await zarfService.deleteRegistryImage(req.query.imageRef);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/registry/prune', async (req, res) => {
    try {
        const taskId = await zarfService.pruneRegistry();
        res.json({ success: true, taskId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/registry/pull', async (req, res) => {
    try {
        const taskId = await zarfService.pullRegistryImage(req.body.source, req.body.target);
        res.json({ success: true, taskId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/registry/download', async (req, res) => {
    try {
        const { taskId, tempFileName } = await zarfService.downloadRegistryImage(req.query.imageRef);
        res.json({ success: true, taskId, downloadPath: `/api/zarf/registry/download-ready?file=${tempFileName}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/registry/download-ready', async (req, res) => {
    const fileName = req.query.file;
    if (!fileName) return res.status(400).send('File name required');
    const path = require('path');
    const os = require('os');
    const filePath = path.join(os.tmpdir(), fileName);
    const fs = require('fs');
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found or still generating');
    res.download(filePath, fileName);
});

router.post('/registry/push', async (req, res) => {
    const targetRef = req.headers['x-target-ref'];
    if (!targetRef) return res.status(400).json({ error: 'x-target-ref header is required' });
    const fs = require('fs');
    const path = require('path');
    const tempDir = '/tmp';
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = path.join(tempDir, `image-${Date.now()}-${Math.floor(Math.random() * 1000)}.tar`);
    const outStream = fs.createWriteStream(tempPath);
    req.pipe(outStream);
    outStream.on('error', (err) => {
        res.status(500).json({ error: 'Failed to write uploaded image' });
    });
    outStream.on('finish', async () => {
        try {
            const taskId = await zarfService.pushRegistryImage(targetRef, tempPath);
            res.json({ success: true, taskId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
});

module.exports = router;
