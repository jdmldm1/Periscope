const test = require('node:test');
const assert = require('node:assert');
const { isScanningEnabled, isAirgap, isAirgapLite } = require('./featureFlags');

test('featureFlags - defaults to scanning enabled and airgap false', () => {
    delete process.env.SCANNING_ENABLED;
    delete process.env.AIRGAP_LITE;
    delete process.env.AIRGAP;

    assert.strictEqual(isScanningEnabled(), true);
    assert.strictEqual(isAirgap(), false);
    assert.strictEqual(isAirgapLite(), false);
});

test('featureFlags - respects SCANNING_ENABLED=false', () => {
    process.env.SCANNING_ENABLED = 'false';
    assert.strictEqual(isScanningEnabled(), false);
    delete process.env.SCANNING_ENABLED;
});

test('featureFlags - respects AIRGAP_LITE=true', () => {
    process.env.AIRGAP_LITE = 'true';
    assert.strictEqual(isScanningEnabled(), false);
    assert.strictEqual(isAirgapLite(), true);
    delete process.env.AIRGAP_LITE;
});

test('featureFlags - respects AIRGAP=true', () => {
    process.env.AIRGAP = 'true';
    assert.strictEqual(isAirgap(), true);
    delete process.env.AIRGAP;
});
