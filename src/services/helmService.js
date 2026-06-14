const { exec } = require('child_process');
const logger = require('../utils/logger');

class HelmService {
    async listReleases(namespace) {
        const cmd = (namespace && namespace !== 'all') ? `helm list --namespace ${namespace} -o json` : 'helm list --all-namespaces -o json';
        const releases = await this._execJson(cmd);
        return (releases || []).map(r => ({
            ...r,
            metadata: {
                name: r.name,
                namespace: r.namespace,
                uid: `helm-${r.namespace}-${r.name}`,
                creationTimestamp: r.updated
            },
            status: {
                phase: r.status
            }
        }));
    }

    async getStatus(namespace, name) {
        const cmd = `helm status ${name} --namespace ${namespace}`;
        return this._exec(cmd);
    }

    async uninstall(namespace, name) {
        const cmd = `helm uninstall ${name} --namespace ${namespace}`;
        return this._exec(cmd);
    }

    async getHistory(namespace, name) {
        const cmd = `helm history ${name} --namespace ${namespace} -o json`;
        return this._execJson(cmd);
    }

    async rollback(namespace, name, revision) {
        const cmd = `helm rollback ${name} ${revision} --namespace ${namespace}`;
        return this._exec(cmd);
    }

    async listRepos() {
        return this._execJson('helm repo list -o json');
    }

    async addRepo(name, url) {
        return this._exec(`helm repo add ${name} ${url}`);
    }

    async removeRepo(name) {
        return this._exec(`helm repo remove ${name}`);
    }

    async updateRepos() {
        return this._exec('helm repo update');
    }

    async searchRepos(query) {
        return this._execJson(`helm search repo ${query} -o json`);
    }

    async getValues(namespace, name, revision = null) {
        let cmd = `helm get values ${name} --namespace ${namespace} -o json`;
        if (revision) {
            cmd = `helm get values ${name} --revision ${revision} --namespace ${namespace} -o json`;
        }
        try {
            return await this._execJson(cmd);
        } catch (err) {
            // Fallback to non-json if it fails (as seen in server.old.js)
            let fallbackCmd = `helm get values ${name} --namespace ${namespace}`;
            if (revision) {
                fallbackCmd = `helm get values ${name} --revision ${revision} --namespace ${namespace}`;
            }
            return this._exec(fallbackCmd);
        }
    }

    async getManifest(namespace, name) {
        return this._exec(`helm get manifest ${name} --namespace ${namespace}`);
    }

    async getNotes(namespace, name) {
        return this._exec(`helm get notes ${name} --namespace ${namespace}`);
    }

    _exec(cmd) {
        return new Promise((resolve, reject) => {
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    logger.error({ cmd, error: error.message }, 'Helm command failed');
                    return reject(new Error(error.message || stderr));
                }
                resolve(stdout);
            });
        });
    }

    async _execJson(cmd) {
        const stdout = await this._exec(cmd);
        try {
            return JSON.parse(stdout);
        } catch (e) {
            logger.error({ cmd, stdout }, 'Failed to parse Helm JSON output');
            throw new Error('Failed to parse helm output');
        }
    }
}

module.exports = new HelmService();
