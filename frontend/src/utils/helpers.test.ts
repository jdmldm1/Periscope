import { describe, it, expect } from 'vitest';
import { parseCpu, parseMem, matchesSelector, pluralizeKind, getNodeUsagePercent } from './helpers';

describe('helpers', () => {
    describe('parseCpu', () => {
        it('handles empty or missing string', () => {
            expect(parseCpu('')).toBe(0);
        });

        it('parses nanocores (n)', () => {
            expect(parseCpu('500000000n')).toBe(0.5);
        });

        it('parses microcores (u)', () => {
            expect(parseCpu('250000u')).toBe(0.25);
        });

        it('parses millicores (m)', () => {
            expect(parseCpu('1500m')).toBe(1.5);
        });

        it('parses whole cores', () => {
            expect(parseCpu('4')).toBe(4);
            expect(parseCpu('2.5')).toBe(2.5);
        });
    });

    describe('parseMem', () => {
        it('handles empty string', () => {
            expect(parseMem('')).toBe(0);
        });

        it('parses Ki (kibibytes)', () => {
            expect(parseMem('10Ki')).toBe(10 * 1024);
        });

        it('parses Mi (mebibytes)', () => {
            expect(parseMem('256Mi')).toBe(256 * 1024 * 1024);
        });

        it('parses Gi (gibibytes)', () => {
            expect(parseMem('2Gi')).toBe(2 * 1024 * 1024 * 1024);
        });

        it('parses plain bytes', () => {
            expect(parseMem('4096')).toBe(4096);
        });
    });

    describe('matchesSelector', () => {
        it('returns false for invalid selector or labels', () => {
            expect(matchesSelector(null, null)).toBe(false);
            expect(matchesSelector({}, {})).toBe(false);
            expect(matchesSelector({ app: 'web' }, null)).toBe(false);
            expect(matchesSelector(null, { app: 'web' })).toBe(false);
        });

        it('returns true when all selector entries match', () => {
            expect(matchesSelector({ app: 'web', tier: 'frontend' }, { app: 'web' })).toBe(true);
            expect(matchesSelector({ app: 'web', env: 'prod' }, { app: 'web', env: 'prod' })).toBe(true);
        });

        it('returns false when any selector entry does not match', () => {
            expect(matchesSelector({ app: 'web' }, { app: 'api' })).toBe(false);
            expect(matchesSelector({ app: 'web' }, { app: 'web', env: 'prod' })).toBe(false);
        });
    });

    describe('pluralizeKind', () => {
        it('pluralizes singular kinds', () => {
            expect(pluralizeKind('Pod')).toBe('pods');
            expect(pluralizeKind('deployment')).toBe('deployments');
        });

        it('leaves already pluralized kinds with lowercase', () => {
            expect(pluralizeKind('pods')).toBe('pods');
            expect(pluralizeKind('Services')).toBe('services');
        });
    });

    describe('getNodeUsagePercent', () => {
        it('returns 0% if node is not found', () => {
            const res = getNodeUsagePercent({ metadata: { name: 'node-1' } }, []);
            expect(res).toEqual({ cpuPercent: 0, memPercent: 0 });
        });

        it('computes percentage based on capacity and usage', () => {
            const metric = {
                metadata: { name: 'node-1' },
                usage: { cpu: '2000m', memory: '512Mi' },
            };
            const nodes = [
                {
                    metadata: { name: 'node-1' },
                    status: {
                        capacity: { cpu: '4', memory: '1024Mi' },
                    },
                },
            ];
            const res = getNodeUsagePercent(metric, nodes);
            expect(res.cpuPercent).toBe(50);
            expect(res.memPercent).toBe(50);
        });
    });
});
