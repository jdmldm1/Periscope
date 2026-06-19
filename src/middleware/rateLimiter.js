const logger = require('../utils/logger');

function createRateLimiter({ windowMs = 60000, maxRequests = 30 } = {}) {
    const hits = new Map();

    // Clean up old entries periodically
    setInterval(() => {
        const now = Date.now();
        for (const [key, data] of hits) {
            if (now - data.windowStart > windowMs) {
                hits.delete(key);
            }
        }
    }, windowMs).unref();

    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        let entry = hits.get(key);

        if (!entry || now - entry.windowStart > windowMs) {
            entry = { windowStart: now, count: 0 };
            hits.set(key, entry);
        }

        entry.count++;

        if (entry.count > maxRequests) {
            logger.warn({ ip: key, count: entry.count }, 'Rate limit exceeded');
            return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }

        next();
    };
}

module.exports = { createRateLimiter };
