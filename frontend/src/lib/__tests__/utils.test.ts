import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cn,
  formatNumber,
  formatDuration,
  formatBytes,
  formatPercent,
  formatCost,
  getStatusColor,
  getRelativeTime,
} from '../utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('ignores falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('handles conditional objects', () => {
    expect(cn({ active: true, hidden: false })).toBe('active');
  });
});

describe('formatNumber', () => {
  it('formats millions', () => {
    expect(formatNumber(1_500_000)).toBe('1.5M');
  });

  it('formats thousands', () => {
    expect(formatNumber(2_500)).toBe('2.5K');
  });

  it('formats small numbers', () => {
    expect(formatNumber(42)).toBe('42.0');
  });

  it('respects decimals parameter', () => {
    expect(formatNumber(1_234, 2)).toBe('1.23K');
    expect(formatNumber(1_234, 0)).toBe('1K');
  });
});

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(90_000)).toBe('1.5m');
  });

  it('formats seconds', () => {
    expect(formatDuration(2_500)).toBe('2.5s');
  });

  it('formats milliseconds', () => {
    expect(formatDuration(42)).toBe('42ms');
  });
});

describe('formatBytes', () => {
  it('formats GB', () => {
    expect(formatBytes(2_147_483_648)).toBe('2.0GB');
  });

  it('formats MB', () => {
    expect(formatBytes(5_242_880)).toBe('5.0MB');
  });

  it('formats KB', () => {
    expect(formatBytes(2_048)).toBe('2.0KB');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512B');
  });
});

describe('formatPercent', () => {
  it('formats with default decimals', () => {
    expect(formatPercent(99.5)).toBe('99.5%');
  });

  it('formats with custom decimals', () => {
    expect(formatPercent(99.567, 2)).toBe('99.57%');
    expect(formatPercent(100, 0)).toBe('100%');
  });
});

describe('formatCost', () => {
  it('formats dollar amounts', () => {
    expect(formatCost(1.5)).toBe('$1.50');
    expect(formatCost(100)).toBe('$100.00');
    expect(formatCost(0.1)).toBe('$0.10');
  });
});

describe('getStatusColor', () => {
  it('returns CSS variable for known statuses', () => {
    expect(getStatusColor('healthy')).toBe('var(--status-healthy)');
    expect(getStatusColor('warning')).toBe('var(--status-warning)');
    expect(getStatusColor('critical')).toBe('var(--status-critical)');
    expect(getStatusColor('info')).toBe('var(--status-info)');
    expect(getStatusColor('unknown')).toBe('var(--status-unknown)');
  });
});

describe('getRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats seconds ago', () => {
    const date = new Date('2026-01-01T11:59:30Z');
    expect(getRelativeTime(date)).toBe('30초 전');
  });

  it('formats minutes ago', () => {
    const date = new Date('2026-01-01T11:30:00Z');
    expect(getRelativeTime(date)).toBe('30분 전');
  });

  it('formats hours ago', () => {
    const date = new Date('2026-01-01T09:00:00Z');
    expect(getRelativeTime(date)).toBe('3시간 전');
  });

  it('formats days ago', () => {
    const date = new Date('2025-12-30T12:00:00Z');
    expect(getRelativeTime(date)).toBe('2일 전');
  });

  it('accepts string dates', () => {
    const result = getRelativeTime('2026-01-01T11:59:00Z');
    expect(result).toContain('전');
  });
});
