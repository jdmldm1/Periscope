const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const taskService = require('./taskService');

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
}

module.exports = new ZarfService();
