const { run } = require('../utils/exec');
const logger = require('../utils/logger');

// All helm invocations go through run() with an argv array, so release names,
// namespaces, repo names/URLs and search queries are passed as single arguments
// and can never be interpreted as shell syntax.
class HelmService {
    async listReleases(namespace) {
        const args = (namespace && namespace !== 'all')
            ? ['list', '--namespace', namespace, '-o', 'json']
            : ['list', '--all-namespaces', '-o', 'json'];
        const releases = await this._execJson(args);
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
        return this._exec(['status', name, '--namespace', namespace]);
    }

    async uninstall(namespace, name) {
        return this._exec(['uninstall', name, '--namespace', namespace]);
    }

    async getHistory(namespace, name) {
        return this._execJson(['history', name, '--namespace', namespace, '-o', 'json']);
    }

    async rollback(namespace, name, revision) {
        const rev = String(revision);
        return this._exec(['rollback', name, rev, '--namespace', namespace]);
    }

    async listRepos() {
        return this._execJson(['repo', 'list', '-o', 'json']);
    }

    async addRepo(name, url) {
        return this._exec(['repo', 'add', name, url]);
    }

    async removeRepo(name) {
        return this._exec(['repo', 'remove', name]);
    }

    async updateRepos() {
        return this._exec(['repo', 'update']);
    }

    async searchRepos(query) {
        return this._execJson(['search', 'repo', query, '-o', 'json']);
    }

    async getValues(namespace, name, revision = null) {
        const baseArgs = ['get', 'values', name, '--namespace', namespace, '-o', 'json'];
        const args = revision
            ? ['get', 'values', name, '--revision', String(revision), '--namespace', namespace, '-o', 'json']
            : baseArgs;
        try {
            return await this._execJson(args);
        } catch (err) {
            // Fallback to non-json if it fails (as seen in server.old.js)
            const fallbackArgs = revision
                ? ['get', 'values', name, '--revision', String(revision), '--namespace', namespace]
                : ['get', 'values', name, '--namespace', namespace];
            return this._exec(fallbackArgs);
        }
    }

    async getManifest(namespace, name) {
        return this._exec(['get', 'manifest', name, '--namespace', namespace]);
    }

    async getNotes(namespace, name) {
        return this._exec(['get', 'notes', name, '--namespace', namespace]);
    }

    async _exec(args) {
        try {
            const { stdout } = await run('helm', args);
            return stdout;
        } catch (error) {
            logger.error({ args, error: error.message }, 'Helm command failed');
            throw new Error(error.stderr || error.message);
        }
    }

    async _execJson(args) {
        const stdout = await this._exec(args);
        try {
            return JSON.parse(stdout);
        } catch (e) {
            logger.error({ args, stdout }, 'Failed to parse Helm JSON output');
            throw new Error('Failed to parse helm output');
        }
    }
}

module.exports = new HelmService();
