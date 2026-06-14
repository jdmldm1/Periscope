const k8s = require('@kubernetes/client-node');
const net = require('net');
const logger = require('../utils/logger');
const k8sService = require('./k8sService');

class ForwardService {
    constructor() {
        this.activeForwards = {};
    }

    async createForward(namespace, podName, remotePort, localPort = 0) {
        const portForwarder = new k8s.PortForward(k8sService.kc);
        const server = net.createServer((socket) => {
            socket.on('error', (err) => {
                logger.error({ namespace, podName, remotePort, error: err.message }, 'Socket error in port-forward');
            });
            portForwarder.portForward(namespace, podName, [Number(remotePort)], socket, null, socket);
        });

        return new Promise((resolve, reject) => {
            server.on('error', (err) => {
                logger.error({ namespace, podName, remotePort, error: err.message }, 'Server error in port-forward');
                reject(err);
            });

            server.listen(localPort ? Number(localPort) : 0, '127.0.0.1', () => {
                const allocatedPort = server.address().port;
                const id = `${namespace}/${podName}/${remotePort}`;

                if (this.activeForwards[id]) {
                    try { this.activeForwards[id].server.close(); } catch(e) {}
                }

                this.activeForwards[id] = {
                    id,
                    server,
                    localPort: allocatedPort,
                    remotePort,
                    podName,
                    namespace
                };

                logger.info({ id, localPort: allocatedPort }, 'Port forward created');
                resolve(this.activeForwards[id]);
            });
        });
    }

    deleteForward(id) {
        if (this.activeForwards[id]) {
            try {
                this.activeForwards[id].server.close();
                delete this.activeForwards[id];
                logger.info({ id }, 'Port forward closed');
                return true;
            } catch (err) {
                logger.error({ id, error: err.message }, 'Error closing port forward');
            }
        }
        return false;
    }

    listForwards() {
        return Object.values(this.activeForwards).map(pf => ({
            id: pf.id,
            localPort: pf.localPort,
            remotePort: pf.remotePort,
            podName: pf.podName,
            namespace: pf.namespace
        }));
    }
}

module.exports = new ForwardService();
