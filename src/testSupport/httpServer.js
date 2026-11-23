const express = require('express');

async function withRouter(mountPath, router, fn) {
    const app = express();
    app.use(express.json());
    app.use(mountPath, router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        const { port } = /** @type {import('net').AddressInfo} */ (server.address());
        await fn(`http://127.0.0.1:${port}${mountPath}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

function jsonRequest(url, method, body) {
    return fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

function stubMethods(target, stubs) {
    const originals = {};
    for (const [name, fn] of Object.entries(stubs)) {
        originals[name] = target[name];
        target[name] = fn;
    }
    return () => {
        for (const [name, fn] of Object.entries(originals)) target[name] = fn;
    };
}

module.exports = { withRouter, jsonRequest, stubMethods };
