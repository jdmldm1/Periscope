const crypto = require('crypto');
const logger = require('../utils/logger');

const API_KEY = process.env.PERISCOPE_API_KEY;

// Constant-time comparison so a network attacker can't recover the key one byte
// at a time by measuring response timing. Lengths are compared first because
// timingSafeEqual throws on mismatched buffer lengths.
function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function authMiddleware(req, res, next) {
    // If no API key configured, auth is disabled (backward compatible)
    if (!API_KEY) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    if (!safeEqual(token, API_KEY)) {
        logger.warn({ ip: req.ip }, 'Unauthorized API access attempt');
        return res.status(403).json({ error: 'Forbidden: Invalid API key' });
    }

    next();
}

function wsAuthCheck(request) {
    if (!API_KEY) return true;
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    return safeEqual(token || '', API_KEY);
}

module.exports = { authMiddleware, wsAuthCheck, safeEqual };
