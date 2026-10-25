const pino = require('pino');
let usePretty = false;
if (process.env.NODE_ENV !== 'production' && !process.pkg) {
    try {
        require.resolve('pino-pretty');
        usePretty = true;
    }
    catch {
        usePretty = false;
    }
}
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: usePretty ? {
        target: 'pino-pretty',
        options: {
            colorize: true
        }
    } : undefined
});
module.exports = logger;
