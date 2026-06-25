const { run } = require('../utils/exec');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const taskService = require('./taskService');
const k8sService = require('./k8sService');

const REGISTRY_URL = 'zarf-docker-registry.zarf.svc.cluster.local:5000';

// Strip ANSI terminal escape sequences from CLI output before parsing tables.
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

// Every zarf invocation goes through run() with an argv array (no shell), so
// package names, image refs, repo names, file paths and registry credentials are
// passed as single arguments and can't be interpreted as shell syntax.
class ZarfService {
    async getStatus() {
        try {
            const { stdout } = await run('zarf', ['version']);
            return { installed: true, version: stdout.trim() };
        } catch (error) {
            return { installed: false, error: error.stderr || error.message };
        }
    }

    async listPackages() {
        const { stdout } = await run('zarf', ['package', 'list', '-o', 'json']);
        const packages = this._extractZarfJson(stdout);
        return (packages || []).map(p => ({
            ...p,
            metadata: {
                name: p.package || p.name,
                namespace: 'zarf',
                uid: `zarf-${p.package || p.name}`,
                creationTimestamp: p.timestamp || new Date().toISOString()
            },
            status: {
                phase: 'deployed'
            }
        }));
    }

    async deployPackage(packagePath, configPath) {
        const args = ['package', 'deploy', packagePath, '--confirm'];
        if (configPath) {
            args.push('--config', configPath);
        }
        return taskService.startTask('zarf', args);
    }

    async removePackage(name) {
        const { stdout } = await run('zarf', ['package', 'remove', name, '--confirm']);
        return stdout;
    }

    async getRegistryAllImages() {
        await this._ensureRegistryLogin();
        const { stdout } = await run('zarf', ['tools', 'registry', 'catalog', REGISTRY_URL]);
        const repos = stdout.split('\n').map(r => r.trim()).filter(Boolean);

        const results = [];
        await Promise.all(repos.map(async (repo) => {
            try {
                const { stdout: lsOut } = await run('zarf', ['tools', 'registry', 'ls', `${REGISTRY_URL}/${repo}`]);
                lsOut.split('\n').map(t => t.trim()).filter(Boolean).forEach(tag => {
                    results.push({ repository: repo, tag, full: `${repo}:${tag}` });
                });
            } catch (err) {
                // Skip repos we can't list.
            }
        }));
        return results;
    }

    _extractZarfJson(stdout) {
        if (!stdout) return [];
        const trimmed = stdout.trim();
        if (trimmed.endsWith('null')) {
            return [];
        }
        const startIdx = trimmed.indexOf('[');
        if (startIdx === -1) {
            const objStartIdx = trimmed.indexOf('{');
            if (objStartIdx === -1) {
                return [];
            }
            try {
                return [JSON.parse(trimmed.slice(objStartIdx))];
            } catch (e) {
                return [];
            }
        }
        try {
            return JSON.parse(trimmed.slice(startIdx));
        } catch (e) {
            return [];
        }
    }

    /**
     * Ensure we're authenticated to the in-cluster Zarf registry. Resolves on
     * success, rejects with an Error on failure.
     *
     * Accepts optional (onSuccess, onError) callbacks for legacy callers; when
     * provided it invokes them, otherwise it behaves as a normal promise.
     */
    async _ensureRegistryLogin(onSuccess, onError) {
        const done = (err) => {
            if (err) {
                if (onError) { onError(err); return; }
                throw err;
            }
            if (onSuccess) onSuccess();
        };

        try {
            await run('zarf', ['tools', 'registry', 'catalog', REGISTRY_URL]);
            return done();
        } catch (error) {
            const blob = `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`;
            if (!blob.includes('UNAUTHORIZED')) {
                return done(new Error('Failed to communicate with Zarf registry: ' + (error.stderr || error.message)));
            }
        }

        // Unauthorized — fetch creds and log in.
        let credStdout;
        try {
            ({ stdout: credStdout } = await run('zarf', ['tools', 'get-creds']));
        } catch (credError) {
            return done(new Error('Failed to retrieve Zarf credentials: ' + (credError.stderr || credError.message)));
        }

        const cleanStdout = credStdout.replace(ANSI_RE, '');
        let username = 'zarf-push';
        let password = '';
        cleanStdout.split('\n').forEach(line => {
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 3 && parts[0] && parts[0].trim() === 'Registry') {
                username = parts[1] || 'zarf-push';
                password = parts[2] || '';
            }
        });
        if (!password) {
            return done(new Error('Registry push password not found in Zarf credentials'));
        }

        try {
            await run('zarf', ['tools', 'registry', 'login', '--username', username, '--password', password, REGISTRY_URL]);
            return done();
        } catch (loginError) {
            return done(new Error('Registry login failed: ' + (loginError.stderr || loginError.message)));
        }
    }

    async getCreds() {
        const { stdout } = await run('zarf', ['tools', 'get-creds']);
        const cleanStdout = stdout.replace(ANSI_RE, '');
        const creds = [];
        cleanStdout.split('\n').forEach(line => {
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 4 && parts[0] && !parts[0].includes('Application') && !parts[0].includes('---')) {
                creds.push({
                    application: parts[0],
                    username: parts[1] || 'N/A',
                    password: parts[2] || 'N/A',
                    connect: parts[3] || 'N/A',
                    key: parts[4] || 'N/A'
                });
            }
        });
        return creds;
    }

    async clearCache() {
        const { stdout } = await run('zarf', ['tools', 'clear-cache', '--confirm']);
        return { success: true, output: stdout };
    }

    async unpackPackage(packagePath) {
        const tempDir = path.join(process.cwd(), `zarf-unpack-${Date.now()}`);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
        try {
            await run('zarf', ['tools', 'archiver', 'decompress', packagePath, tempDir]);
        } catch (error) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
            throw new Error('Failed to decompress package: ' + (error.stderr || error.message));
        }
        const yamlPath = path.join(tempDir, 'zarf.yaml');
        if (!fs.existsSync(yamlPath)) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
            throw new Error('zarf.yaml not found inside package');
        }
        try {
            const configText = fs.readFileSync(yamlPath, 'utf8');
            return { success: true, tempDir, configText };
        } catch (err) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
            throw new Error('Failed to read zarf.yaml: ' + err.message);
        }
    }

    async rebuildDeploy(tempDir, configText) {
        const yamlPath = path.join(tempDir, 'zarf.yaml');
        fs.writeFileSync(yamlPath, configText, 'utf8');

        // tempDir is server-generated (see unpackPackage); no user input is
        // interpolated into this script. The shell is the package builder's, run
        // via an explicit `sh -c`, not from spawn({shell:true}).
        const runScript = `
            cd "${tempDir}"
            zarf package create --confirm
            PKG_FILE=$(ls zarf-package-*.tar.zst 2>/dev/null | head -n 1)
            if [ -z "$PKG_FILE" ]; then
                echo "ERROR: Failed to create Zarf package"
                exit 1
            fi
            echo "Successfully created package: $PKG_FILE. Starting deployment..."
            zarf package deploy "$PKG_FILE" --confirm
            cd ..
            rm -rf "${tempDir}"
        `;
        return taskService.startTask('sh', ['-c', runScript]);
    }

    async listLocalPackages() {
        const rootDir = process.cwd();
        return new Promise((resolve, reject) => {
            fs.readdir(rootDir, (err, files) => {
                if (err) return reject(err);
                const list = files
                    .filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== 'frontend')
                    .map(f => {
                        try {
                            const stat = fs.statSync(path.join(rootDir, f));
                            return {
                                name: f,
                                path: path.join(rootDir, f),
                                isDir: stat.isDirectory(),
                                size: stat.size,
                                mtime: stat.mtime
                            };
                        } catch (statErr) {
                            return null;
                        }
                    })
                    .filter(Boolean);
                resolve(list);
            });
        });
    }

    async deleteLocalPackage(name) {
        const rootDir = process.cwd();
        const targetPath = path.join(rootDir, name);
        const relative = path.relative(rootDir, targetPath);
        const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        if (!isSafe && targetPath !== rootDir) {
            throw new Error('Invalid file path');
        }
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return { success: true };
        } else {
            throw new Error('File or folder not found');
        }
    }

    async compressFolder(source, dest) {
        const rootDir = process.cwd();
        const sourcePath = path.isAbsolute(source) ? source : path.join(rootDir, source);
        const destPath = path.isAbsolute(dest) ? dest : path.join(rootDir, dest);
        return taskService.startTask('zarf', ['tools', 'archiver', 'compress', sourcePath, destPath]);
    }

    async decompressPackage(source, dest) {
        const rootDir = process.cwd();
        const sourcePath = path.isAbsolute(source) ? source : path.join(rootDir, source);
        const destPath = path.isAbsolute(dest) ? dest : path.join(rootDir, dest);
        return taskService.startTask('zarf', ['tools', 'archiver', 'decompress', sourcePath, destPath]);
    }

    async inspectSbom(packageName) {
        const rootDir = process.cwd();
        const packagePath = path.join(rootDir, packageName);
        if (!fs.existsSync(packagePath)) {
            throw new Error('Zarf package not found in workspace');
        }
        const staticSubdir = 'sboms';
        const outDir = path.join(rootDir, 'frontend', 'dist', staticSubdir, packageName);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        await run('zarf', ['package', 'inspect', 'sbom', packagePath, '--output', outDir]);
        const files = fs.readdirSync(outDir);
        const htmlFiles = files
            .filter(f => f.endsWith('.html'))
            .map(f => ({
                name: f,
                url: `/${staticSubdir}/${packageName}/${f}`
            }));
        return { success: true, files: htmlFiles };
    }

    async getPackage(name) {
        const secretName = `zarf-package-${name}`;
        const secret = await k8sService.core.readNamespacedSecret({ name: secretName, namespace: 'zarf' });
        const secretBody = secret.body || secret;
        if (!secretBody || !secretBody.data || !secretBody.data.data) {
            throw new Error(`Zarf package secret '${secretName}' not found`);
        }
        const base64Data = secretBody.data.data;
        const decodedString = Buffer.from(base64Data, 'base64').toString('utf8');
        return JSON.parse(decodedString);
    }

    async getZarfState() {
        const secret = await k8sService.core.readNamespacedSecret({ name: 'zarf-state', namespace: 'zarf' });
        const secretBody = secret.body || secret;
        if (!secretBody || !secretBody.data || !secretBody.data.state) {
            throw new Error("Zarf state secret 'zarf-state' not found in 'zarf' namespace");
        }
        const base64Data = secretBody.data.state;
        const decodedString = Buffer.from(base64Data, 'base64').toString('utf8');
        const parsedJson = JSON.parse(decodedString);

        if (parsedJson.registryInfo) {
            if (parsedJson.registryInfo.pushPassword) parsedJson.registryInfo.pushPassword = '●●●●●●●●';
            if (parsedJson.registryInfo.pullPassword) parsedJson.registryInfo.pullPassword = '●●●●●●●●';
            if (parsedJson.registryInfo.secret) parsedJson.registryInfo.secret = '●●●●●●●●';
        }
        if (parsedJson.gitServer) {
            if (parsedJson.gitServer.pushPassword) parsedJson.gitServer.pushPassword = '●●●●●●●●';
            if (parsedJson.gitServer.pullPassword) parsedJson.gitServer.pullPassword = '●●●●●●●●';
        }
        if (parsedJson.artifactServer) {
            if (parsedJson.artifactServer.pushPassword) parsedJson.artifactServer.pushPassword = '●●●●●●●●';
        }
        if (parsedJson.agentTLS) {
            if (parsedJson.agentTLS.key) parsedJson.agentTLS.key = '●●●●●●●●';
        }
        return parsedJson;
    }

    async getRegistryCatalog() {
        await this._ensureRegistryLogin();
        const { stdout } = await run('zarf', ['tools', 'registry', 'catalog', REGISTRY_URL]);
        return stdout.split('\n').map(r => r.trim()).filter(Boolean);
    }

    async getRegistryRepositoryTags(repo) {
        await this._ensureRegistryLogin();
        const { stdout } = await run('zarf', ['tools', 'registry', 'ls', `${REGISTRY_URL}/${repo}`]);
        return stdout.split('\n').map(t => t.trim()).filter(Boolean);
    }

    async deleteRegistryImage(imageRef) {
        await this._ensureRegistryLogin();
        const fullRef = imageRef.startsWith(REGISTRY_URL) ? imageRef : `${REGISTRY_URL}/${imageRef}`;
        const { stdout } = await run('zarf', ['tools', 'registry', 'delete', fullRef]);
        return { success: true, output: stdout };
    }

    async pruneRegistry() {
        return taskService.startTask('zarf', ['tools', 'registry', 'prune', '--confirm']);
    }

    async pullRegistryImage(source, target) {
        await this._ensureRegistryLogin();
        const targetRef = target.includes(':') ? target : `${target}:latest`;
        const fullTarget = `${REGISTRY_URL}/${targetRef}`;
        return taskService.startTask('zarf', [
            'tools', 'registry', 'copy', source, fullTarget, '--insecure'
        ]);
    }

    async downloadRegistryImage(imageRef) {
        const fullSource = imageRef.startsWith(REGISTRY_URL) ? imageRef : `${REGISTRY_URL}/${imageRef}`;
        const os = require('os');
        const tempFileName = `image-${imageRef.replace(/[:/]/g, '-')}-${Date.now()}.tar`;
        const tempFilePath = path.join(os.tmpdir(), tempFileName);

        await this._ensureRegistryLogin();
        const taskId = taskService.startTask('zarf', [
            'tools', 'registry', 'copy', fullSource, tempFilePath, '--insecure'
        ]);
        return { taskId, tempFileName };
    }

    async pushRegistryImage(targetRef, tempFilePath) {
        const fullTarget = `${REGISTRY_URL}/${targetRef}`;
        try {
            await this._ensureRegistryLogin();
        } catch (err) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
            throw err;
        }
        return taskService.startTask('zarf', [
            'tools', 'registry', 'copy', tempFilePath, fullTarget, '--insecure'
        ], process.cwd(), () => {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        });
    }
}

module.exports = new ZarfService();
