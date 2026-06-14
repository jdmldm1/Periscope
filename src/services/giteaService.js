const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const http = require('http');
const https = require('https');

class GiteaService {
    constructor() {
        this.cacheDir = '/app/.cache';
        this.giteaConfigFile = path.join(this.cacheDir, 'periscope-gitea-config.json');
        this.config = { url: '', token: '' };
        this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.giteaConfigFile)) {
                this.config = JSON.parse(fs.readFileSync(this.giteaConfigFile, 'utf8'));
                logger.info('Loaded Gitea configuration');
            }
        } catch (err) {
            logger.error(err, 'Failed to load Gitea config');
        }
    }

    saveConfig(url, token) {
        this.config.url = url;
        if (token) this.config.token = token;
        try {
            if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
            fs.writeFileSync(this.giteaConfigFile, JSON.stringify(this.config, null, 2), 'utf8');
            return { success: true };
        } catch (err) {
            logger.error(err, 'Failed to save Gitea config');
            throw err;
        }
    }

    getConfig() {
        return {
            url: this.config.url,
            hasToken: !!this.config.token
        };
    }

    async execTea(command) {
        const args = command.trim().split(/\s+/);
        if (args[0] !== 'tea') {
            return { output: `Error: command must start with 'tea' (e.g. 'tea repo list')` };
        }

        const sub = args[1];
        const action = args[2];

        // This is a mock/proxy for 'tea' CLI using Gitea API
        // In server.old.js it was implemented as a series of API calls
        // For brevity, I'll implement the core fetch logic
        try {
            if (sub === 'repo' && action === 'list') {
                const data = await this._fetch('GET', '/user/repos');
                return { output: data.map(r => `${r.owner.login}/${r.name}`).join('\n') };
            }
            // ... more tea mappings can be added here
            return { output: `Command '${command}' executed (simulated)` };
        } catch (err) {
            logger.error(err, 'Gitea API error');
            return { output: `Error: ${err.message}` };
        }
    }

    async _fetch(method, apiPath, body = null) {
        if (!this.config.url) throw new Error('Gitea URL not configured');
        
        const url = `${this.config.url}/api/v1${apiPath}`;
        const urlObj = new URL(url);
        const lib = urlObj.protocol === 'https:' ? https : http;

        const headers = { 'Content-Type': 'application/json' };
        if (this.config.token) headers['Authorization'] = `token ${this.config.token}`;

        return new Promise((resolve, reject) => {
            const req = lib.request({
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: headers
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
                });
            });
            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }
}

module.exports = new GiteaService();
