function parseCpu(cpuStr) {
    if (!cpuStr) return 0;
    if (cpuStr.endsWith('n')) return parseFloat(cpuStr) / 1000000;
    if (cpuStr.endsWith('u')) return parseFloat(cpuStr) / 1000;
    if (cpuStr.endsWith('m')) return parseFloat(cpuStr);
    return parseFloat(cpuStr) * 1000;
}

function parseMem(memStr) {
    if (!memStr) return 0;
    if (memStr.endsWith('Ki')) return parseFloat(memStr);
    if (memStr.endsWith('Mi')) return parseFloat(memStr) * 1024;
    if (memStr.endsWith('Gi')) return parseFloat(memStr) * 1024 * 1024;
    return parseFloat(memStr) / 1024;
}

function getItems(raw) {
    return raw?.items || raw?.body?.items || [];
}

module.exports = { parseCpu, parseMem, getItems };
