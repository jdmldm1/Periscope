const WebSocket = require('ws');
const logger = require('../utils/logger');
const k8sService = require('../services/k8sService');

function parsePacketLine(line, ipMap) {
    const match = line.match(/^(\d{2}:\d{2}:\d{2}\.\d+)\s+(?:.*\s+)?IP\s+([\d.]+)\.(\d+)\s+>\s+([\d.]+)\.(\d+):\s+(.*)/);
    if (!match) return null;

    const [_, timestamp, srcIp, srcPortStr, destIp, destPortStr, info] = match;
    const srcPort = parseInt(srcPortStr, 10);
    const destPort = parseInt(destPortStr, 10);
    const lenMatch = info.match(/length (\d+)/);

    const isTcp = info.includes('Flags [');
    const onPort = (p) => srcPort === p || destPort === p;

    let protocol;
    if (onPort(53)) {
        protocol = 'DNS';
    } else if (!isTcp) {
        protocol = 'UDP';
    } else if (onPort(443) || onPort(8443)) {
        protocol = 'HTTPS';
    } else if (onPort(80) || onPort(8080)) {
        protocol = 'HTTP';
    } else {
        protocol = 'TCP';
    }

    return {
        timestamp,
        srcIp,
        srcPort,
        srcRes: ipMap[srcIp] || { type: 'external', name: srcIp },
        destIp,
        destPort,
        destRes: ipMap[destIp] || { type: 'external', name: destIp },
        protocol,
        length: lenMatch ? parseInt(lenMatch[1], 10) : 0,
        info: info.trim()
    };
}

async function refreshIpMap() {
    try {
        const [pods, svcs] = await Promise.all([
            k8sService.core.listPodForAllNamespaces(),
            k8sService.core.listServiceForAllNamespaces()
        ]);

        const newIpMap = {};
        pods.items.forEach(p => {
            if (p.status?.podIP) {
                newIpMap[p.status.podIP] = {
                    type: 'pod',
                    name: p.metadata.name,
                    namespace: p.metadata.namespace
                };
            }
        });

        svcs.items.forEach(s => {
            if (s.spec?.clusterIP && s.spec.clusterIP !== 'None') {
                newIpMap[s.spec.clusterIP] = {
                    type: 'service',
                    name: s.metadata.name,
                    namespace: s.metadata.namespace
                };
            }
        });

        return newIpMap;
    } catch (err) {
        logger.error(err, 'Error refreshing IP lookup map');
        return {};
    }
}

function handleNetworkSniff(ws, params) {
    logger.info('Establishing live network packet capture session');
    const { spawn } = require('child_process');
    const { listInterfaces } = require('../routes/networkRoutes');

    const requestedIface = params.get('iface') || 'any';
    const iface = listInterfaces().includes(requestedIface) ? requestedIface : 'any';
    const targetPod = params.get('pod');
    const targetNs = params.get('namespace') || 'default';

    let ipMap = {};
    let refreshInterval;

    refreshIpMap().then(map => ipMap = map);
    refreshInterval = setInterval(async () => {
        const map = await refreshIpMap();
        ipMap = map;
    }, 15000);

    let lineBuffer = '';
    const handleData = (data) => {
        lineBuffer += data.toString('utf8');
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        lines.forEach(line => {
            const packet = parsePacketLine(line, ipMap);
            if (packet && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(packet));
            }
        });
    };

    if (targetPod) {
        const podCaptureService = require('../services/podCaptureService');
        let capture = null;

        podCaptureService.startEphemeralCapture({
            ns: targetNs,
            pod: targetPod,
            iface,
            onData: handleData
        })
        .then((c) => {
            capture = c;
            if (ws.readyState !== WebSocket.OPEN) {
                c.stop();
            }
        })
        .catch((err) => {
            logger.error({ targetNs, targetPod, error: err.message }, 'Ephemeral capture failed');
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    error: `Could not capture ${targetNs}/${targetPod}: ${err.body?.message || err.message}`
                }));
            }
        });

        ws.on('close', () => {
            clearInterval(refreshInterval);
            if (capture) capture.stop();
        });
        return;
    }

    const tcpdump = spawn('tcpdump', ['-l', '-nn', '-i', iface], {
        env: { ...process.env }
    });

    tcpdump.stdout.on('data', handleData);

    let stderrBuf = '';
    tcpdump.stderr.on('data', (data) => {
        stderrBuf += data.toString('utf8');
        const low = stderrBuf.toLowerCase();
        if (/(permission|denied|can't|cannot|no such device|failed|error)/.test(low)) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ error: stderrBuf.trim() }));
            }
        }
    });

    tcpdump.on('error', (err) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ error: `Failed to start tcpdump: ${err.message}` }));
        }
    });

    tcpdump.on('exit', (code) => {
        if (code && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                error: stderrBuf.trim() || `tcpdump exited with code ${code}`
            }));
        }
    });

    ws.on('close', () => {
        clearInterval(refreshInterval);
        tcpdump.kill('SIGKILL');
    });
}

module.exports = { handleNetworkSniff };
