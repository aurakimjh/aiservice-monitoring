import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useI18n } from '../use-i18n';
import { useUIStore } from '@/stores/ui-store';

describe('useI18n', () => {
  beforeEach(() => {
    // Reset store to default (ko)
    useUIStore.setState({ locale: 'ko' });
  });

  it('returns default locale as ko', () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.locale).toBe('ko');
  });

  it('translates a key in the current locale', () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.t('nav.home')).toBe('홈');
  });

  it('updates translation when locale changes', () => {
    const { result } = renderHook(() => useI18n());

    act(() => {
      result.current.setLocale('en');
    });

    expect(result.current.locale).toBe('en');
    expect(result.current.t('nav.home')).toBe('Home');
  });

  it('provides localeConfig', () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.localeConfig).toHaveProperty('label');
    expect(result.current.localeConfig).toHaveProperty('flag');
    expect(result.current.localeConfig).toHaveProperty('dateLocale');
    expect(result.current.localeConfig.dateLocale).toBe('ko-KR');
  });

  it('formatDate returns a string', () => {
    const { result } = renderHook(() => useI18n());
    const date = new Date('2026-01-15T10:30:00Z');
    expect(typeof result.current.formatDate(date)).toBe('string');
  });

  it('formatNumber returns a string', () => {
    const { result } = renderHook(() => useI18n());
    expect(typeof result.current.formatNumber(1234567)).toBe('string');
  });

  it('formatRelativeTime returns a string with time unit', () => {
    const { result } = renderHook(() => useI18n());
    const past = new Date(Date.now() - 3_600_000); // 1 hour ago
    const relStr = result.current.formatRelativeTime(past);
    expect(typeof relStr).toBe('string');
    expect(relStr.length).toBeGreaterThan(0);
  });

  it('switches between all three locales', () => {
    const { result } = renderHook(() => useI18n());
    const locales = ['ko', 'en', 'ja'] as const;
    for (const locale of locales) {
      act(() => {
        result.current.setLocale(locale);
      });
      expect(result.current.locale).toBe(locale);
      expect(result.current.t('common.save')).not.toBe('common.save');
    }
  });
});
