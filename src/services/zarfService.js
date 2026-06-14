const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const taskService = require('./taskService');
const k8sService = require('./k8sService');

class ZarfService {
    async getStatus() {
        return new Promise((resolve) => {
            exec('zarf version', (error, stdout, stderr) => {
                if (error) {
                    return resolve({ installed: false, error: error.message || stderr });
                }
                resolve({ installed: true, version: stdout.trim() });
            });
        });
    }

    async listPackages() {
        return new Promise((resolve, reject) => {
            exec('zarf package list -o json', (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(error.message || stderr));
                }
                try {
                    const packages = this._extractZarfJson(stdout);
                    const shimmed = (packages || []).map(p => ({
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
                    resolve(shimmed);
                } catch (e) {
                    reject(new Error('Failed to parse zarf packages output: ' + e.message));
                }
            });
        });
    }

    async deployPackage(packagePath, configPath) {
        const args = ['package', 'deploy', packagePath, '--confirm'];
        if (configPath) {
            args.push('--config', configPath);
        }
        return taskService.startTask('zarf', args);
    }

    async removePackage(name) {
        return new Promise((resolve, reject) => {
            const cmd = `zarf package remove "${name}" --confirm`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(error.message || stderr));
                }
                resolve(stdout);
            });
        });
    }

    async getRegistryAllImages() {
        const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
        return new Promise((resolve, reject) => {
            this._ensureRegistryLogin(() => {
                exec(`zarf tools registry catalog ${registryUrl}`, (error, stdout, stderr) => {
                    if (error) return reject(new Error(error.message || stderr));
                    const repos = stdout.split('\n').map(r => r.trim()).filter(Boolean);
                    
                    const results = [];
                    let completed = 0;
                    
                    if (repos.length === 0) return resolve([]);
                    
                    repos.forEach(repo => {
                        exec(`zarf tools registry ls ${registryUrl}/${repo}`, (lsError, lsStdout, lsStderr) => {
                            if (!lsError) {
                                const tags = lsStdout.split('\n').map(t => t.trim()).filter(Boolean);
                                tags.forEach(tag => {
                                    results.push({ repository: repo, tag: tag, full: `${repo}:${tag}` });
                                });
                            }
                            completed++;
                            if (completed === repos.length) {
                                resolve(results);
                            }
                        });
                    });
                });
            }, (err) => reject(err));
        });
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

    _ensureRegistryLogin(onSuccess, onError) {
        const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
        exec(`zarf tools registry catalog ${registryUrl}`, (error, stdout, stderr) => {
            if (error && (stdout.includes('UNAUTHORIZED') || stderr.includes('UNAUTHORIZED') || error.message.includes('UNAUTHORIZED'))) {
                exec('zarf tools get-creds', (credError, credStdout, credStderr) => {
                    if (credError) {
                        return onError(new Error('Failed to retrieve Zarf credentials: ' + (credError.message || credStderr)));
                    }
                    const cleanStdout = credStdout.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
                    const lines = cleanStdout.split('\n');
                    let username = 'zarf-push';
                    let password = '';
                    lines.forEach(line => {
                        const parts = line.split('|').map(p => p.trim());
                        if (parts.length >= 3 && parts[0] && parts[0].trim() === 'Registry') {
                            username = parts[1] || 'zarf-push';
                            password = parts[2] || '';
                        }
                    });
                    if (!password) {
                        return onError(new Error('Registry push password not found in Zarf credentials'));
                    }
                    exec(`zarf tools registry login --username ${username} --password "${password}" ${registryUrl}`, (loginError, loginStdout, loginStderr) => {
                        if (loginError) {
                            return onError(new Error('Registry login failed: ' + (loginError.message || loginStderr)));
                        }
                        onSuccess();
                    });
                });
            } else if (error) {
                return onError(new Error('Failed to communicate with Zarf registry: ' + (error.message || stderr)));
            } else {
                onSuccess();
            }
        });
    }

    async getCreds() {
        return new Promise((resolve, reject) => {
            exec('zarf tools get-creds', (error, stdout, stderr) => {
                if (error) return reject(new Error(error.message || stderr));
                const cleanStdout = stdout.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
                const lines = cleanStdout.split('\n');
                const creds = [];
                lines.forEach(line => {
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
                resolve(creds);
            });
        });
    }

    async clearCache() {
        return new Promise((resolve, reject) => {
            exec('zarf tools clear-cache --confirm', (error, stdout, stderr) => {
                if (error) return reject(new Error(error.message || stderr));
                resolve({ success: true, output: stdout });
            });
        });
    }

    async unpackPackage(packagePath) {
        return new Promise((resolve, reject) => {
            const tempDir = path.join(process.cwd(), `zarf-unpack-${Date.now()}`);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }
            exec(`zarf tools archiver decompress "${packagePath}" "${tempDir}"`, (error, stdout, stderr) => {
                if (error) {
                    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
                    return reject(new Error('Failed to decompress package: ' + (error.message || stderr)));
                }
                const yamlPath = path.join(tempDir, 'zarf.yaml');
                if (!fs.existsSync(yamlPath)) {
                    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
                    return reject(new Error('zarf.yaml not found inside package'));
                }
                try {
                    const configText = fs.readFileSync(yamlPath, 'utf8');
                    resolve({ success: true, tempDir, configText });
                } catch (err) {
                    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
                    reject(new Error('Failed to read zarf.yaml: ' + err.message));
                }
            });
        });
    }

    async rebuildDeploy(tempDir, configText) {
        const yamlPath = path.join(tempDir, 'zarf.yaml');
        fs.writeFileSync(yamlPath, configText, 'utf8');
        
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
        return new Promise((resolve, reject) => {
            exec(`zarf package inspect sbom "${packagePath}" --output "${outDir}"`, (error, stdout, stderr) => {
                if (error) return reject(new Error(error.message || stderr));
                fs.readdir(outDir, (readErr, files) => {
                    if (readErr) return reject(readErr);
                    const htmlFiles = files
                        .filter(f => f.endsWith('.html'))
                        .map(f => ({
                            name: f,
                            url: `/${staticSubdir}/${packageName}/${f}`
                        }));
                    resolve({ success: true, files: htmlFiles });
                });
            });
        });
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
        const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
        return new Promise((resolve, reject) => {
            this._ensureRegistryLogin(() => {
                exec(`zarf tools registry catalog ${registryUrl}`, (error, stdout, stderr) => {
                    if (error) return reject(new Error(error.message || stderr));
                    const repos = stdout.split('\n').map(r => r.trim()).filter(Boolean);
                    resolve(repos);
                });
            }, (err) => reject(err));
        });
    }

    async getRegistryRepositoryTags(repo) {
        const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
        return new Promise((resolve, reject) => {
            this._ensureRegistryLogin(() => {
                exec(`zarf tools registry ls ${registryUrl}/${repo}`, (error, stdout, stderr) => {
                    if (error) return reject(new Error(error.message || stderr));
                    const tags = stdout.split('\n').map(t => t.trim()).filter(Boolean);
                    resolve(tags);
                });
            }, (err) => reject(err));
        });
    }

    async deleteRegistryImage(imageRef) {
        const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
        return new Promise((resolve, reject) => {
            this._ensureRegistryLogin(() => {
                const fullRef = imageRef.startsWith(registryUrl) ? imageRef : `${registryUrl}/${imageRef}`;
                exec(`zarf tools registry delete ${fullRef}`, (error, stdout, stderr) => {
                    if (error) return reject(new Error(error.message || stderr));
                    resolve({ success: true, output: stdout });
                });
            }, (err) => reject(err));
        });
    }

    async pruneRegistry() {
        return taskService.startTask('zarf', ['tools', 'registry', 'prune', '--confirm']);
    }

    async pullRegistryImage(source, target) {
        const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
        return new Promise((resolve, reject) => {
            this._ensureRegistryLogin(() => {
                const targetRef = target.includes(':') ? target : `${target}:latest`;
                const fullTarget = `${registryUrl}/${targetRef}`;
                const taskId = taskService.startTask('zarf', [
                    'tools', 'registry', 'copy',
                    source,
                    fullTarget,
                    '--insecure'
                ]);
                resolve(taskId);
            }, (err) => reject(err));
        });
    }

    async downloadRegistryImage(imageRef) {
        const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
        const fullSource = imageRef.startsWith(registryUrl) ? imageRef : `${registryUrl}/${imageRef}`;
        const os = require('os');
        const tempFileName = `image-${imageRef.replace(/[:/]/g, '-')}-${Date.now()}.tar`;
        const tempFilePath = path.join(os.tmpdir(), tempFileName);
        
        return new Promise((resolve, reject) => {
            this._ensureRegistryLogin(() => {
                const taskId = taskService.startTask('zarf', [
                    'tools', 'registry', 'copy',
                    fullSource,
                    tempFilePath,
                    '--insecure'
                ]);
                resolve({ taskId, tempFileName });
            }, (err) => reject(err));
        });
    }

    async pushRegistryImage(targetRef, tempFilePath) {
        const registryUrl = 'zarf-docker-registry.zarf.svc.cluster.local:5000';
        const fullTarget = `${registryUrl}/${targetRef}`;
        return new Promise((resolve, reject) => {
            this._ensureRegistryLogin(() => {
                const taskId = taskService.startTask('zarf', [
                    'tools', 'registry', 'copy',
                    tempFilePath,
                    fullTarget,
                    '--insecure'
                ], process.cwd(), () => {
                    try { fs.unlinkSync(tempFilePath); } catch (e) {}
                });
                resolve(taskId);
            }, (err) => {
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
                reject(err);
            });
        });
    }
}

module.exports = new ZarfService();
