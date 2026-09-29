import { describe, it, expect } from 'vitest';

describe('Airgap Lite Feature Flag Tests', () => {
    it('verifies scanning tab names that should be omitted in lite mode', () => {
        const scanningTabs = ['image-scanner', 'kubescape'];
        const allTabs = ['dashboard', 'topology', 'nodes', 'pods', 'image-scanner', 'kubescape', 'networkpolicies'];

        const filterTabs = (tabs: string[], scanningEnabled: boolean) => {
            return scanningEnabled ? tabs : tabs.filter(t => !scanningTabs.includes(t));
        };

        expect(filterTabs(allTabs, true)).toContain('image-scanner');
        expect(filterTabs(allTabs, true)).toContain('kubescape');
        expect(filterTabs(allTabs, false)).not.toContain('image-scanner');
        expect(filterTabs(allTabs, false)).not.toContain('kubescape');
        expect(filterTabs(allTabs, false)).toContain('networkpolicies');
        expect(filterTabs(allTabs, false)).toContain('dashboard');
    });

    it('verifies command palette items filtering based on scanningEnabled', () => {
        const createCommands = (scanningEnabled: boolean) => [
            { name: 'Dashboard' },
            ...(scanningEnabled ? [
                { name: 'Image SBOM Scanner (:scanner)' },
                { name: 'Kubescape Compliance Audit (:security)' },
            ] : []),
            { name: 'Pods List (:pods)' },
            ...(scanningEnabled ? [
                { name: 'Scan All Running Images' }
            ] : []),
        ];

        const commandsEnabled = createCommands(true);
        const commandsDisabled = createCommands(false);

        expect(commandsEnabled.some(c => c.name.includes('Image SBOM Scanner'))).toBe(true);
        expect(commandsEnabled.some(c => c.name.includes('Kubescape'))).toBe(true);
        expect(commandsEnabled.some(c => c.name.includes('Scan All Running Images'))).toBe(true);

        expect(commandsDisabled.some(c => c.name.includes('Image SBOM Scanner'))).toBe(false);
        expect(commandsDisabled.some(c => c.name.includes('Kubescape'))).toBe(false);
        expect(commandsDisabled.some(c => c.name.includes('Scan All Running Images'))).toBe(false);
        expect(commandsDisabled.some(c => c.name.includes('Pods List'))).toBe(true);
    });
});
