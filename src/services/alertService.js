const fs = require('fs');
const path = require('path');
const k8sService = require('./k8sService');
const logger = require('../utils/logger');

class AlertService {
    constructor() {
        this.settingsPath = path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share'), 'periscope-alerts.json');
        this.settings = { webhookUrl: '', enabled: false };
        this.sentEvents = new Set();
        this.intervalId = null;
        this.loadSettings();
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsPath)) {
                const data = fs.readFileSync(this.settingsPath, 'utf8');
                this.settings = JSON.parse(data);
            }
        } catch (err) {
            logger.error(err, 'Failed to load alert settings');
        }
    }

    saveSettings(settings) {
        try {
            this.settings = { ...this.settings, ...settings };
            fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
            
            // Restart or stop background watcher based on settings
            if (this.settings.enabled && this.settings.webhookUrl) {
                this.startWatcher();
            } else {
                this.stopWatcher();
            }
            return true;
        } catch (err) {
            logger.error(err, 'Failed to save alert settings');
            throw err;
        }
    }

    getSettings() {
        return this.settings;
    }

    async sendNotification(text) {
        if (!this.settings.webhookUrl) return false;
        
        let payload = { text }; // Default Slack format
        if (this.settings.webhookUrl.includes('discord.com')) {
            payload = { content: text }; // Discord format
        }

        try {
            const response = await fetch(this.settings.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return true;
        } catch (err) {
            logger.error({ url: this.settings.webhookUrl, error: err.message }, 'Failed to send alert notification');
            return false;
        }
    }

    startWatcher() {
        if (this.intervalId) return;
        
        logger.info('Starting background warning alert watcher');
        
        // Populate initial event set so we don't spam alerts on startup
        this.checkWarnings(true);

        this.intervalId = setInterval(() => {
            this.checkWarnings(false);
        }, 15000);
    }

    stopWatcher() {
        if (this.intervalId) {
            logger.info('Stopping background warning alert watcher');
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async checkWarnings(isInitial = false) {
        if (!this.settings.enabled || !this.settings.webhookUrl) {
            this.stopWatcher();
            return;
        }

        try {
            const eventsRes = await k8sService.core.listEventForAllNamespaces();
            const events = eventsRes.items || eventsRes.body?.items || [];
            
            const warnings = events.filter(e => e.type === 'Warning');

            for (const event of warnings) {
                const key = `${event.metadata.uid}-${event.lastTimestamp || event.metadata.resourceVersion}`;
                
                if (this.sentEvents.has(key)) continue;
                this.sentEvents.add(key);

                if (!isInitial) {
                    const message = `⚠️ *Kube Alert [Warning]*: *${event.reason}* on ${event.involvedObject.kind} \`${event.involvedObject.namespace}/${event.involvedObject.name}\`\n> ${event.message}`;
                    logger.warn({ key, reason: event.reason, name: event.involvedObject.name }, 'New warning event detected, sending notification');
                    await this.sendNotification(message);
                }
            }

            // Keep cache clean by trimming old event keys
            if (this.sentEvents.size > 1000) {
                const keys = Array.from(this.sentEvents);
                const toRemove = keys.slice(0, 200);
                toRemove.forEach(k => this.sentEvents.delete(k));
            }
        } catch (err) {
            logger.error(err, 'Error checking warning events');
        }
    }
}

module.exports = new AlertService();
