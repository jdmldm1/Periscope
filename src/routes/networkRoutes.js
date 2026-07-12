const express = require('express');
const os = require('os');
const fs = require('fs');
const router = express.Router();
const k8sService = require('../services/k8sService');
const logger = require('../utils/logger');
const { run, spawnSafe } = require('../utils/exec');





function listInterfaces() {
    const names = new Set();
    try {
        fs.readdirSync('/sys/class/net').forEach(n => names.add(n));
    } catch (_) {
        try { Object.keys(os.networkInterfaces()).forEach(n => names.add(n)); } catch (_) {  }
    }
    return ['any', ...Array.from(names).sort()];
}

router.get('/interfaces', (req, res) => {
    res.json({ interfaces: listInterfaces(), default: 'any' });
});








let prevTalkerSnapshot = null;



async function fetchCadvisor(node) {
    const { stdout } = await run(
        'kubectl',
        ['get', '--raw', `/api/v1/nodes/${node}/proxy/metrics/cadvisor`],
        { maxBuffer: 64 * 1024 * 1024 }
    );
    return stdout;
}

function parsePromLabels(str) {
    const out = {};
    str.replace(/(\w+)="((?:[^"\\]|\\.)*)"/g, (_, k, v) => { out[k] = v; return ''; });
    return out;
}

router.get('/top-talkers', async (req, res) => {
    try {
        const nodesRes = await k8sService.core.listNode();
        const nodes = (nodesRes.items || nodesRes.body?.items || []).map(n => n.metadata.name);

        const texts = await Promise.allSettled(nodes.map(fetchCadvisor));
        const pods = {};
        const RX = 'container_network_receive_bytes_total';
        const TX = 'container_network_transmit_bytes_total';

        for (const t of texts) {
            if (t.status !== 'fulfilled') continue;
            for (const line of t.value.split('\n')) {
                if (line.charCodeAt(0) === 35) continue;
                const isRx = line.startsWith(RX + '{');
                const isTx = !isRx && line.startsWith(TX + '{');
                if (!isRx && !isTx) continue;
                const brace = line.indexOf('}');
                if (brace < 0) continue;
                const labels = parsePromLabels(line.slice(line.indexOf('{') + 1, brace));
                if (!labels.pod) continue;
                const value = parseFloat(line.slice(brace + 1).trim());
                if (!isFinite(value)) continue;
                const key = `${labels.namespace}/${labels.pod}`;
                if (!pods[key]) pods[key] = { rx: 0, tx: 0 };
                pods[key][isRx ? 'rx' : 'tx'] += value;
            }
        }

        const now = Date.now();
        const hadPrev = !!prevTalkerSnapshot;
        const talkers = Object.entries(pods).map(([key, v]) => {
            const [namespace, pod] = key.split('/');
            let rxBps = null, txBps = null;
            const prev = prevTalkerSnapshot?.pods[key];
            if (prev) {
                const dt = (now - prevTalkerSnapshot.time) / 1000;
                if (dt > 0) {
                    rxBps = Math.max(0, (v.rx - prev.rx) / dt);
                    txBps = Math.max(0, (v.tx - prev.tx) / dt);
                }
            }
            return { namespace, pod, rxBytes: v.rx, txBytes: v.tx, rxBps, txBps };
        });

        prevTalkerSnapshot = { time: now, pods };
        talkers.sort((a, b) =>
            ((b.rxBps || 0) + (b.txBps || 0)) - ((a.rxBps || 0) + (a.txBps || 0)) ||
            (b.rxBytes + b.txBytes) - (a.rxBytes + a.txBytes));

        res.json({ talkers: talkers.slice(0, 100), hasRates: hadPrev, sampledAt: new Date(now).toISOString() });
    } catch (err) {
        logger.error({ error: err.message }, 'top-talkers failed');
        res.status(500).json({ error: err.stderr || err.message });
    }
});








function sumMetric(text, name, filter) {
    let total = 0;
    const byLabel = {};
    for (const line of text.split('\n')) {
        if (!line.startsWith(name)) continue;
        const brace = line.indexOf('{');
        const labels = brace >= 0 ? parsePromLabels(line.slice(brace + 1, line.indexOf('}'))) : {};
        const value = parseFloat(line.slice(line.lastIndexOf(' ') + 1));
        if (!isFinite(value)) continue;
        if (filter && !filter(labels)) continue;
        total += value;
        if (filter && filter.groupBy) {
            const g = labels[filter.groupBy] || 'unknown';
            byLabel[g] = (byLabel[g] || 0) + value;
        }
    }
    return { total, byLabel };
}

router.get('/dns', async (req, res) => {
    try {
        const podsRes = await k8sService.core.listPodForAllNamespaces();
        const coredns = (podsRes.items || podsRes.body?.items || []).filter(p =>
            (p.metadata.labels?.['k8s-app'] === 'kube-dns' || (p.metadata.name || '').startsWith('coredns')) &&
            p.status?.phase === 'Running');

        if (!coredns.length) {
            return res.json({ available: false, reason: 'No running CoreDNS pods found' });
        }

        const scrapes = await Promise.allSettled(coredns.map(p =>
            run('kubectl', ['get', '--raw',
                `/api/v1/namespaces/${p.metadata.namespace}/pods/${p.metadata.name}:9153/proxy/metrics`],
                { maxBuffer: 32 * 1024 * 1024 }).then(r => r.stdout)));

        const ok = scrapes.filter(s => s.status === 'fulfilled').map(s => s.value);
        if (!ok.length) {
            return res.json({ available: false, reason: 'CoreDNS metrics endpoint (:9153) is not exposed on this cluster' });
        }
        const text = ok.join('\n');

        let requests = 0, nxdomain = 0, servfail = 0, noerror = 0, cacheHits = 0, cacheMisses = 0, durSum = 0, durCount = 0;
        const byType = {};
        for (const line of text.split('\n')) {
            if (line.charCodeAt(0) === 35) continue;
            if (line.startsWith('coredns_dns_requests_total{')) {
                const l = parsePromLabels(line.slice(line.indexOf('{') + 1, line.indexOf('}')));
                const v = parseFloat(line.slice(line.lastIndexOf(' ') + 1));
                if (isFinite(v)) { requests += v; if (l.type) byType[l.type] = (byType[l.type] || 0) + v; }
            } else if (line.startsWith('coredns_dns_responses_total{')) {
                const l = parsePromLabels(line.slice(line.indexOf('{') + 1, line.indexOf('}')));
                const v = parseFloat(line.slice(line.lastIndexOf(' ') + 1));
                if (!isFinite(v)) continue;
                if (l.rcode === 'NXDOMAIN') nxdomain += v;
                else if (l.rcode === 'SERVFAIL') servfail += v;
                else if (l.rcode === 'NOERROR') noerror += v;
            } else if (line.startsWith('coredns_cache_hits_total')) {
                const v = parseFloat(line.slice(line.lastIndexOf(' ') + 1)); if (isFinite(v)) cacheHits += v;
            } else if (line.startsWith('coredns_cache_misses_total')) {
                const v = parseFloat(line.slice(line.lastIndexOf(' ') + 1)); if (isFinite(v)) cacheMisses += v;
            } else if (line.startsWith('coredns_dns_request_duration_seconds_sum')) {
                const v = parseFloat(line.slice(line.lastIndexOf(' ') + 1)); if (isFinite(v)) durSum += v;
            } else if (line.startsWith('coredns_dns_request_duration_seconds_count')) {
                const v = parseFloat(line.slice(line.lastIndexOf(' ') + 1)); if (isFinite(v)) durCount += v;
            }
        }

        res.json({
            available: true,
            replicas: coredns.length,
            requestsTotal: requests,
            byType,
            responses: { noerror, nxdomain, servfail },
            nxdomainRate: requests > 0 ? nxdomain / requests : 0,
            cache: { hits: cacheHits, misses: cacheMisses, hitRatio: (cacheHits + cacheMisses) > 0 ? cacheHits / (cacheHits + cacheMisses) : 0 },
            avgLatencyMs: durCount > 0 ? (durSum / durCount) * 1000 : null,
            note: 'Per-name query breakdowns require CoreDNS query logging (log plugin) or dnstap, which standard metrics do not expose.',
        });
    } catch (err) {
        logger.error({ error: err.message }, 'dns insights failed');
        res.status(500).json({ error: err.stderr || err.message });
    }
});







router.get('/pcap', (req, res) => {
    const requestedIface = req.query.iface || 'any';
    const iface = listInterfaces().includes(requestedIface) ? requestedIface : 'any';

    let count = parseInt(req.query.count, 10);
    if (!(count > 0) || count > 100000) count = 2000;
    let seconds = parseInt(req.query.seconds, 10);
    if (!(seconds > 0) || seconds > 120) seconds = 30;

    res.setHeader('Content-Type', 'application/vnd.tcpdump.pcap');
    res.setHeader('Content-Disposition', `attachment; filename="periscope-${iface}-capture.pcap"`);



    const cp = spawnSafe('tcpdump', ['-w', '-', '-U', '-i', iface, '-c', String(count), '-nn']);
    cp.stdout.pipe(res);
    cp.stderr.on('data', () => {  });

    const timer = setTimeout(() => cp.kill('SIGTERM'), seconds * 1000);
    cp.on('close', () => { clearTimeout(timer); if (!res.writableEnded) res.end(); });
    cp.on('error', (err) => {
        clearTimeout(timer);
        if (!res.headersSent) res.status(500).json({ error: err.message });
        else if (!res.writableEnded) res.end();
    });
    req.on('close', () => cp.kill('SIGKILL'));
});







router.get('/flows', async (req, res) => {
    try {
        const podsRes = await k8sService.core.listPodForAllNamespaces();
        const agents = (podsRes.items || podsRes.body?.items || []).filter(p => {
            const l = p.metadata.labels || {};
            const name = p.metadata.name || '';
            return p.status?.phase === 'Running' &&
                (l['k8s-app'] === 'retina' || l['app.kubernetes.io/name'] === 'retina-agent' ||
                 l['app'] === 'retina-agent' || name.startsWith('retina-agent'));
        });

        if (!agents.length) {
            return res.json({ available: false, reason: 'Retina agent not found. Enable it in the chart (retina.enabled=true) to get eBPF flow metrics.' });
        }

        const scrapes = await Promise.allSettled(agents.map(p =>
            run('kubectl', ['get', '--raw',
                `/api/v1/namespaces/${p.metadata.namespace}/pods/${p.metadata.name}:10093/proxy/metrics`],
                { maxBuffer: 32 * 1024 * 1024 }).then(r => r.stdout)));

        const ok = scrapes.filter(s => s.status === 'fulfilled').map(s => s.value);
        if (!ok.length) {
            return res.json({ available: false, reason: 'Retina agents are present but their metrics endpoint (:10093) could not be scraped.' });
        }
        const text = ok.join('\n');

        const forward = { bytes: {}, count: {} };
        const drop = { bytes: {}, count: {} };
        const tcpState = {};
        for (const line of text.split('\n')) {
            if (line.charCodeAt(0) === 35 || !line.startsWith('networkobservability_')) continue;
            const brace = line.indexOf('{');
            const labels = brace >= 0 ? parsePromLabels(line.slice(brace + 1, line.indexOf('}'))) : {};
            const value = parseFloat(line.slice(line.lastIndexOf(' ') + 1));
            if (!isFinite(value)) continue;
            const dir = labels.direction || 'unknown';
            if (line.startsWith('networkobservability_forward_bytes')) forward.bytes[dir] = (forward.bytes[dir] || 0) + value;
            else if (line.startsWith('networkobservability_forward_count')) forward.count[dir] = (forward.count[dir] || 0) + value;
            else if (line.startsWith('networkobservability_drop_bytes')) { const k = `${dir}/${labels.reason || 'unknown'}`; drop.bytes[k] = (drop.bytes[k] || 0) + value; }
            else if (line.startsWith('networkobservability_drop_count')) { const k = `${dir}/${labels.reason || 'unknown'}`; drop.count[k] = (drop.count[k] || 0) + value; }
            else if (line.startsWith('networkobservability_tcp_state')) { if (labels.state) tcpState[labels.state] = (tcpState[labels.state] || 0) + value; }
        }

        res.json({ available: true, agents: agents.length, forward, drop, tcpState });
    } catch (err) {
        logger.error({ error: err.message }, 'flows (retina) failed');
        res.status(500).json({ error: err.stderr || err.message });
    }
});

module.exports = { router, listInterfaces };
