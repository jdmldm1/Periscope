const crypto = require('crypto');
const logger = require('../utils/logger');
const authService = require('../services/authService');

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
    const path = req.path;
    // Whitelisted routes that don't need authentication
    if (path === '/auth/login' || path === '/auth/status') {
        return next();
    }

    const authEnabled = authService.isAuthEnabled();

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        // Verify against active session tokens
        if (authEnabled && authService.verifySession(token)) {
            return next();
        }
        // Verify against API key if configured
        if (API_KEY && safeEqual(token, API_KEY)) {
            return next();
        }
    }

    // If auth is disabled and no API key is configured, allow it (backward compatible)
    if (!authEnabled && !API_KEY) {
        return next();
    }

    // Otherwise, unauthorized
    logger.warn({ ip: req.ip, path: req.originalUrl }, 'Unauthorized API access attempt');
    return res.status(401).json({ error: 'Unauthorized: Access token is invalid or missing' });
}

function wsAuthCheck(request) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    
    const authEnabled = authService.isAuthEnabled();
    if (authEnabled) {
        if (token && authService.verifySession(token)) return true;
        if (API_KEY && token && safeEqual(token, API_KEY)) return true;
        return false;
    }

    if (!API_KEY) return true;
    return safeEqual(token || '', API_KEY);
}

module.exports = { authMiddleware, wsAuthCheck, safeEqual };
