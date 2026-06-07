import { describe, it, expect } from 'vitest';
import { parseCpu, parseMem } from './App';

describe('Frontend CPU Metric Parser', () => {
  it('should parse nanocores correctly', () => {
    expect(parseCpu('500000000n')).toBe(0.5);
  });

  it('should parse microcores correctly', () => {
    expect(parseCpu('500000u')).toBe(0.5);
  });

  it('should parse millicores correctly', () => {
    expect(parseCpu('500m')).toBe(0.5);
  });

  it('should parse raw cores correctly', () => {
    expect(parseCpu('2')).toBe(2);
  });

  it('should return 0 for empty values', () => {
    expect(parseCpu('')).toBe(0);
  });
});

describe('Frontend Memory Metric Parser', () => {
  it('should parse KiB correctly', () => {
    expect(parseMem('1024Ki')).toBe(1024 * 1024);
  });

  it('should parse MiB correctly', () => {
    expect(parseMem('256Mi')).toBe(256 * 1024 * 1024);
  });

  it('should parse GiB correctly', () => {
    expect(parseMem('2Gi')).toBe(2 * 1024 * 1024 * 1024);
  });

  it('should parse raw bytes correctly', () => {
    expect(parseMem('1000000')).toBe(1000000);
  });

  it('should return 0 for empty values', () => {
    expect(parseMem('')).toBe(0);
  });
});
