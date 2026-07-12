const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const logger = require('./logger');

function decompressGrypeDatabase() {
    const dbBaseDir = '/app/.cache/grype';

    if (!fs.existsSync(dbBaseDir)) {
        return;
    }

    try {
        const schemas = fs.readdirSync(dbBaseDir);

        for (const schema of schemas) {
            const schemaDir = path.join(dbBaseDir, schema);

            if (!fs.statSync(schemaDir).isDirectory()) {
                continue;
            }

            const files = fs.readdirSync(schemaDir);
            const compressedFile = files.find(f => f.endsWith('.db.zst'));

            if (!compressedFile) {
                continue;
            }

            const compressedPath = path.join(schemaDir, compressedFile);
            const decompressedPath = path.join(schemaDir, 'vulnerability.db');

            if (fs.existsSync(decompressedPath)) {
                continue;
            }

            logger.info(`Found compressed Grype database in schema v${schema}. Decompressing in background...`);

            exec(`zstd -d -f -q --rm "${compressedPath}" -o "${decompressedPath}"`, (err) => {
                if (err) {
                    logger.error(`Failed to decompress Grype database for schema v${schema}:`, err);
                } else {
                    logger.info(`Successfully decompressed Grype database for schema v${schema}.`);
                }
            });
        }
    } catch (err) {
        logger.error('Error during initial Grype database check/decompression:', err);
    }
}

module.exports = { decompressGrypeDatabase };
