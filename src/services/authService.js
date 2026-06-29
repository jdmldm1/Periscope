const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const AUTH_DIR = '/app/.cache';
const AUTH_FILE = path.join(AUTH_DIR, 'auth-config.json');

class AuthService {
    constructor() {
        this.configPath = this._getAuthFilePath();
        this.activeTokens = new Set();
        this.config = this._loadConfig();
    }

    _getAuthFilePath() {
        try {
            if (!fs.existsSync(AUTH_DIR)) {
                fs.mkdirSync(AUTH_DIR, { recursive: true });
            }
            // Test write access
            const testFile = path.join(AUTH_DIR, '.write-test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            return AUTH_FILE;
        } catch (e) {
            // Fallback to project root directory
            return path.join(__dirname, '../../auth-config.json');
        }
    }

    _loadConfig() {
        if (fs.existsSync(this.configPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                if (data && data.username && data.passwordHash && data.salt) {
                    return data;
                }
            } catch (e) {
                logger.error(e, 'Failed to parse auth config file, using defaults');
            }
        }
        
        // Generate default config
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = this._hashPassword('periscope', salt);
        return {
            username: 'admin',
            passwordHash: hash,
            salt: salt,
            isDefault: true
        };
    }

    _saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
        } catch (e) {
            logger.error(e, 'Failed to write auth config file');
        }
    }

    _hashPassword(password, salt) {
        return crypto.scryptSync(password, salt, 64).toString('hex');
    }

    verifyCredentials(username, password) {
        if (username !== this.config.username) {
            return false;
        }
        const hash = this._hashPassword(password, this.config.salt);
        return hash === this.config.passwordHash;
    }

    changePassword(newPassword) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = this._hashPassword(newPassword, salt);
        this.config.passwordHash = hash;
        this.config.salt = salt;
        this.config.isDefault = false;
        this._saveConfig();
        // Clear all active tokens on password change for security
        this.activeTokens.clear();
        logger.info('User password changed successfully');
        return true;
    }

    createSession() {
        const token = crypto.randomBytes(32).toString('hex');
        this.activeTokens.add(token);
        return token;
    }

    verifySession(token) {
        return this.activeTokens.has(token);
    }

    destroySession(token) {
        this.activeTokens.delete(token);
    }

    isDefaultPassword() {
        return this.config.isDefault;
    }

    isAuthEnabled() {
        return process.env.AUTH_ENABLED !== 'false';
    }

    resetConfig() {
        if (fs.existsSync(this.configPath)) {
            try {
                fs.unlinkSync(this.configPath);
            } catch (e) {}
        }
        this.config = this._loadConfig();
        this.activeTokens.clear();
    }
}

module.exports = new AuthService();
