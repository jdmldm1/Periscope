const express = require('express');
const authService = require('../services/authService');
const router = express.Router();

router.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    if (authService.verifyCredentials(username, password)) {
        const token = authService.createSession();
        return res.json({
            success: true,
            token,
            isDefault: authService.isDefaultPassword()
        });
    }

    return res.status(401).json({ error: 'Invalid username or password' });
});

router.post('/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        authService.destroySession(token);
    }
    res.json({ success: true });
});

router.get('/auth/status', (req, res) => {
    res.json({
        enabled: authService.isAuthEnabled(),
        isDefault: authService.isDefaultPassword()
    });
});

router.post('/auth/change-password', (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    authService.changePassword(password);
    res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = router;
