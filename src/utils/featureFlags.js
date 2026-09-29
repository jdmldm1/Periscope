function isScanningEnabled() {
    return process.env.SCANNING_ENABLED !== 'false' && process.env.AIRGAP_LITE !== 'true';
}

function isAirgap() {
    return process.env.AIRGAP === 'true';
}

function isAirgapLite() {
    return process.env.AIRGAP_LITE === 'true';
}

module.exports = {
    isScanningEnabled,
    isAirgap,
    isAirgapLite,
};
