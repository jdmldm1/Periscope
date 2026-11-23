const BINARY = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6 };
const DECIMAL = { n: 1e-9, u: 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18 };
// eslint-disable-next-line security/detect-unsafe-regex -- input length is capped before matching
const QUANTITY = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|[numkKMGTPE])?$/;

function parseQuantity(value) {
    if (value === undefined || value === null || value === '') return 0;
    const text = String(value).trim();
    if (text.length > 32) return 0;
    const match = QUANTITY.exec(text);
    if (!match) return 0;
    const number = parseFloat(match[1]);
    const suffix = match[2] || '';
    const factor = BINARY[suffix] ?? DECIMAL[suffix];
    return number * factor;
}

function cpuMillis(value) {
    return Math.round(parseQuantity(value) * 1000);
}

function memBytes(value) {
    return Math.round(parseQuantity(value));
}

module.exports = { parseQuantity, cpuMillis, memBytes };
