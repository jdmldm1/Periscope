const k8s = require('@kubernetes/client-node');
const k8sService = require('./k8sService');
const logger = require('../utils/logger');

class WatchService {
    constructor() {
        this.clients = new Set();
        this.watchRequest = null;
        this.isConnecting = false;
    }

    addClient(ws) {
        this.clients.add(ws);
        logger.info({ totalClients: this.clients.size }, 'WebSocket resource watcher client connected');
        
        if (this.clients.size === 1) {
            this.startWatch();
        }

        ws.on('close', () => {
            this.clients.delete(ws);
            logger.info({ totalClients: this.clients.size }, 'WebSocket resource watcher client disconnected');
            if (this.clients.size === 0) {
                this.stopWatch();
            }
        });
    }

    async startWatch() {
        if (this.watchRequest || this.isConnecting) return;
        this.isConnecting = true;
        logger.info('Initializing K8s Watcher for real-time events');
        
        try {
            const watch = new k8s.Watch(k8sService.kc);
            
            this.watchRequest = await watch.watch(
                '/api/v1/events',
                { follow: true },
                (type, obj) => {
                    if (!obj || !obj.involvedObject) return;

                    const payload = {
                        action: type,
                        kind: obj.involvedObject.kind,
                        namespace: obj.involvedObject.namespace,
                        name: obj.involvedObject.name,
                        reason: obj.reason,
                        message: obj.message,
                        type: obj.type
                    };

                    this.broadcast(payload);
                },
                (err) => {
                    this.watchRequest = null;
                    this.isConnecting = false;
                    if (err) {
                        logger.error(err, 'Event watcher closed with error. Retrying in 10 seconds...');
                        setTimeout(() => this.startWatch(), 10000);
                    } else {
                        logger.info('Event watcher closed normally.');
                    }
                }
            );
        } catch (err) {
            this.watchRequest = null;
            this.isConnecting = false;
            logger.error(err, 'Failed to initialize K8s watch. Retrying in 10 seconds...');
            setTimeout(() => this.startWatch(), 10000);
        }
    }

    stopWatch() {
        logger.info('Stopping K8s Watcher (no active clients)');
        if (this.watchRequest && typeof this.watchRequest.abort === 'function') {
            try {
                this.watchRequest.abort();
            } catch (e) {
                logger.error(e, 'Error aborting watch request');
            }
        }
        this.watchRequest = null;
        this.isConnecting = false;
    }

    broadcast(data) {
        const message = JSON.stringify(data);
        const WebSocket = require('ws');
        this.clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }
}

module.exports = new WatchService();
