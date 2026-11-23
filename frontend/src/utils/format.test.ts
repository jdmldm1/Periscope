import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { KIND_TO_TAB, apiErrorMessage, formatAge, formatBytes, formatCpu } from './format';

describe('formatCpu', () => {
    it('formats millicores and cores', () => {
        expect(formatCpu(250)).toBe('250m');
        expect(formatCpu(1000)).toBe('1 cores');
        expect(formatCpu(1500)).toBe('1.50 cores');
    });
    it('returns a dash when there is no value', () => {
        expect(formatCpu(null)).toBe('–');
        expect(formatCpu(undefined)).toBe('–');
    });
});

describe('formatBytes', () => {
    it('scales through binary units', () => {
        expect(formatBytes(512)).toBe('512B');
        expect(formatBytes(1024)).toBe('1.0Ki');
        expect(formatBytes(128 * 1024 * 1024)).toBe('128Mi');
        expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5Gi');
    });
    it('returns a dash when there is no value', () => {
        expect(formatBytes(null)).toBe('–');
    });
});

describe('formatAge', () => {
    afterEach(() => {
        vi.useRealTimers();
    });
    it('uses the largest sensible unit', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2030-01-10T12:00:00Z'));
        expect(formatAge('2030-01-10T11:59:30Z')).toBe('30s');
        expect(formatAge('2030-01-10T11:50:00Z')).toBe('10m');
        expect(formatAge('2030-01-10T09:00:00Z')).toBe('3h');
        expect(formatAge('2030-01-07T12:00:00Z')).toBe('3d');
    });
    it('never returns a negative age and handles missing input', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2030-01-10T12:00:00Z'));
        expect(formatAge('2031-01-01T00:00:00Z')).toBe('0s');
        expect(formatAge(undefined)).toBe('–');
    });
});

describe('apiErrorMessage', () => {
    it('prefers the error field of an API response', () => {
        const err = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
            data: { error: 'namespace not found' },
            status: 404,
            statusText: 'Not Found',
            headers: {},
            config: { headers: {} } as never,
        });
        expect(apiErrorMessage(err)).toBe('namespace not found');
    });
    it('falls back to the transport message, Error message or a default', () => {
        expect(apiErrorMessage(new AxiosError('Network Error'))).toBe('Network Error');
        expect(apiErrorMessage(new Error('plain'))).toBe('plain');
        expect(apiErrorMessage('weird')).toBe('Unknown error');
    });
});

describe('KIND_TO_TAB', () => {
    it('maps Kubernetes kinds to sidebar tabs', () => {
        expect(KIND_TO_TAB.Pod).toBe('pods');
        expect(KIND_TO_TAB.PersistentVolumeClaim).toBe('persistentvolumeclaims');
        expect(KIND_TO_TAB.ReplicaSet).toBeUndefined();
    });
});
