const k8s = require('@kubernetes/client-node');
const fs = require('fs');
const os = require('os');
const { PassThrough } = require('stream');
const k8sService = require('./k8sService');
const logger = require('../utils/logger');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let cachedImage = null;

// Which image to run the capture with. It needs tcpdump — periscope's own image
// has it (with the CAP_NET_RAW file capability). Prefer an explicit override,
// otherwise discover it by reading our own pod.
async function getCaptureImage() {
    if (cachedImage) return cachedImage;
    if (process.env.PERISCOPE_CAPTURE_IMAGE) { cachedImage = process.env.PERISCOPE_CAPTURE_IMAGE; return cachedImage; }
    const ns = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'utf8').trim();
    const name = os.hostname();
    const res = await k8sService.core.readNamespacedPod({ name, namespace: ns });
    const pod = res.body || res;
    cachedImage = pod.spec.containers[0].image;
    return cachedImage;
}

// Capture packets on ANY pod by injecting an ephemeral debug container into it.
// Containers in a pod share a network namespace, so tcpdump there sees the target
// pod's traffic. The ephemeral container runs as root with NET_RAW (root gets the
// capability effectively, regardless of the target's user) and self-terminates via
// `timeout`; ephemeral containers can't be removed, so it lingers in Completed
// until the pod is recreated. Returns { ecName, stop } — stop() aborts the stream.
async function startEphemeralCapture({ ns, pod, iface, maxSeconds = 300, onData }) {
    const ecName = `periscope-sniff-${Math.random().toString(36).slice(2, 8)}`;
    const image = await getCaptureImage();

    const target = await k8sService.core.readNamespacedPod({ name: pod, namespace: ns });
    const existing = (target.body || target).spec.ephemeralContainers || [];

    const ec = {
        name: ecName,
        image,
        imagePullPolicy: 'IfNotPresent',
        command: ['timeout', String(maxSeconds), 'tcpdump', '-l', '-nn', '-i', iface],
        securityContext: {
            runAsUser: 0,
            runAsNonRoot: false,
            allowPrivilegeEscalation: true,
            capabilities: { add: ['NET_RAW'] },
        },
        stdin: false,
        tty: false,
    };

    logger.info({ ns, pod, ecName, iface }, 'Injecting ephemeral capture container');
    // The client sends this subresource patch as JSON Patch (json-patch+json), so
    // build a JSON Patch. A single `add` to /spec/ephemeralContainers with the
    // full list works whether or not the field already exists (add replaces an
    // existing value), avoiding a missing-path error on pods with none yet.
    await k8sService.core.patchNamespacedPodEphemeralcontainers(
        { name: pod, namespace: ns, body: [{ op: 'add', path: '/spec/ephemeralContainers', value: [...existing, ec] }] }
    );

    // Wait for it to be running, or surface a fast failure.
    let running = false;
    for (let i = 0; i < 40; i++) {
        await sleep(1000);
        const s = await k8sService.core.readNamespacedPod({ name: pod, namespace: ns });
        const st = ((s.body || s).status.ephemeralContainerStatuses || []).find(c => c.name === ecName);
        if (st?.state?.running) { running = true; break; }
        if (st?.state?.terminated) {
            throw new Error(`capture container exited immediately (${st.state.terminated.reason || 'unknown'})`);
        }
        const waitReason = st?.state?.waiting?.reason;
        if (waitReason && /Err|BackOff|Invalid|Failed/i.test(waitReason)) {
            throw new Error(`capture container error: ${waitReason} ${st.state.waiting.message || ''}`.trim());
        }
    }
    if (!running) throw new Error('capture container did not start within 40s');

    const stream = new PassThrough();
    stream.on('data', onData);
    const log = new k8s.Log(k8sService.kc);
    const controller = await log.log(ns, pod, ecName, stream, { follow: true, tailLines: 0, pretty: false });

    return {
        ecName,
        stop() {
            try { controller.abort(); } catch (e) { /* already gone */ }
            try { stream.destroy(); } catch (e) { /* already gone */ }
        },
    };
}

module.exports = { startEphemeralCapture, getCaptureImage };
