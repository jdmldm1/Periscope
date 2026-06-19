const logger = require('../utils/logger');

const API_KEY = process.env.PERISCOPE_API_KEY;

function authMiddleware(req, res, next) {
    // If no API key configured, auth is disabled (backward compatible)
    if (!API_KEY) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    if (token !== API_KEY) {
        logger.warn({ ip: req.ip }, 'Unauthorized API access attempt');
        return res.status(403).json({ error: 'Forbidden: Invalid API key' });
    }

    next();
}

function wsAuthCheck(request) {
    if (!API_KEY) return true;
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    return token === API_KEY;
}

module.exports = { authMiddleware, wsAuthCheck };
