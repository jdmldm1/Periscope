const test = require('node:test');
const assert = require('node:assert');

test('scanner and security services honor SCANNING_ENABLED=false', async (t) => {
    process.env.SCANNING_ENABLED = 'false';

    // Clear require cache for isolated testing
    delete require.cache[require.resolve('../utils/featureFlags')];
    delete require.cache[require.resolve('./scannerService')];
    delete require.cache[require.resolve('./securityService')];

    const scannerService = require('./scannerService');
    const securityService = require('./securityService');

    assert.strictEqual(scannerService.isScanningEnabled(), false);
    assert.strictEqual(await scannerService.ensureGrypeDb(), false);
    assert.strictEqual(scannerService.getDbStatus().enabled, false);
    assert.deepStrictEqual(await scannerService.getAllScans(), {});
    assert.deepStrictEqual(await scannerService.getRunningImages(), []);

    await assert.rejects(
        () => scannerService.performSbomScan('alpine:latest'),
        /disabled/i
    );
    await assert.rejects(
        () => scannerService.performVulnsScan('alpine:latest'),
        /disabled/i
    );

    assert.strictEqual(securityService.scanningEnabled, false);
    assert.strictEqual(await securityService.ensureKubescapeArtifacts(), false);
    const secStatus = await securityService.getStatus();
    assert.strictEqual(secStatus.enabled, false);
    assert.strictEqual(secStatus.scanning, false);
    assert.strictEqual(secStatus.report, null);
    assert.strictEqual(securityService.getDbStatus().enabled, false);

    await assert.rejects(
        () => securityService.triggerScan(),
        /disabled/i
    );

    delete process.env.SCANNING_ENABLED;
    delete require.cache[require.resolve('../utils/featureFlags')];
    delete require.cache[require.resolve('./scannerService')];
    delete require.cache[require.resolve('./securityService')];
});

test('scanner and security services honor AIRGAP_LITE=true', async (t) => {
    process.env.AIRGAP_LITE = 'true';

    delete require.cache[require.resolve('../utils/featureFlags')];
    delete require.cache[require.resolve('./scannerService')];
    delete require.cache[require.resolve('./securityService')];

    const scannerService = require('./scannerService');
    const securityService = require('./securityService');

    assert.strictEqual(scannerService.isScanningEnabled(), false);
    assert.strictEqual(securityService.scanningEnabled, false);

    delete process.env.AIRGAP_LITE;
    delete require.cache[require.resolve('../utils/featureFlags')];
    delete require.cache[require.resolve('./scannerService')];
    delete require.cache[require.resolve('./securityService')];
});
