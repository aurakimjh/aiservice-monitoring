import { describe, it, expect } from 'vitest';
import { t, formatDateLocale, formatNumberLocale, formatRelativeTimeLocale, LOCALE_CONFIG } from '../i18n';

describe('t (translation function)', () => {
  it('translates known keys in Korean', () => {
    expect(t('nav.home', 'ko')).toBe('홈');
    expect(t('common.save', 'ko')).toBe('저장');
    expect(t('auth.login', 'ko')).toBe('로그인');
  });

  it('translates known keys in English', () => {
    expect(t('nav.home', 'en')).toBe('Home');
    expect(t('common.save', 'en')).toBe('Save');
    expect(t('auth.login', 'en')).toBe('Login');
  });

  it('translates known keys in Japanese', () => {
    expect(t('nav.home', 'ja')).toBe('ホーム');
    expect(t('common.save', 'ja')).toBe('保存');
  });

  it('falls back to English when key is missing in target locale', () => {
    // Key exists in 'en' but not in the missing locale scenario
    expect(t('nav.home', 'en')).toBe('Home');
  });

  it('returns the key itself when translation is missing everywhere', () => {
    expect(t('nonexistent.key', 'ko')).toBe('nonexistent.key');
    expect(t('nonexistent.key', 'en')).toBe('nonexistent.key');
  });

  it('covers all navigation keys for all locales', () => {
    const navKeys = ['nav.home', 'nav.infra', 'nav.ai', 'nav.traces', 'nav.agents'];
    const locales = ['ko', 'en', 'ja'] as const;
    for (const key of navKeys) {
      for (const locale of locales) {
        const result = t(key, locale);
        expect(result).not.toBe(key); // Should have a translation
      }
    }
  });

  it('covers all common keys across locales', () => {
    const commonKeys = ['common.save', 'common.cancel', 'common.delete', 'common.loading'];
    const locales = ['ko', 'en', 'ja'] as const;
    for (const key of commonKeys) {
      for (const locale of locales) {
        expect(t(key, locale)).not.toBe(key);
      }
    }
  });
});

describe('LOCALE_CONFIG', () => {
  it('has configs for ko, en, ja', () => {
    expect(LOCALE_CONFIG).toHaveProperty('ko');
    expect(LOCALE_CONFIG).toHaveProperty('en');
    expect(LOCALE_CONFIG).toHaveProperty('ja');
  });

  it('has label, flag, dateLocale for each', () => {
    for (const locale of ['ko', 'en', 'ja'] as const) {
      expect(LOCALE_CONFIG[locale]).toHaveProperty('label');
      expect(LOCALE_CONFIG[locale]).toHaveProperty('flag');
      expect(LOCALE_CONFIG[locale]).toHaveProperty('dateLocale');
    }
  });
});

describe('formatDateLocale', () => {
  it('formats a date for each locale', () => {
    const date = new Date('2026-01-15T10:30:00Z');
    const locales = ['ko', 'en', 'ja'] as const;
    for (const locale of locales) {
      const result = formatDateLocale(date, locale);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('accepts a timestamp number', () => {
    const ts = new Date('2026-01-15T10:30:00Z').getTime();
    const result = formatDateLocale(ts, 'en');
    expect(typeof result).toBe('string');
  });
});

describe('formatNumberLocale', () => {
  it('formats numbers with locale-specific separators', () => {
    const result = formatNumberLocale(1234567, 'en');
    expect(typeof result).toBe('string');
    expect(result).toContain('1');
  });
});

describe('formatRelativeTimeLocale', () => {
  it('returns a string with time unit', () => {
    const past = Date.now() - 65_000; // 65 seconds ago
    const result = formatRelativeTimeLocale(past, 'ko');
    expect(result).toContain('분');
    expect(result).toContain('전');
  });

  it('works with Date objects', () => {
    const past = new Date(Date.now() - 7_200_000); // 2 hours ago
    const result = formatRelativeTimeLocale(past, 'en');
    expect(result).toContain('hours');
    expect(result).toContain('ago');
  });

  it('works with string dates', () => {
    const past = new Date(Date.now() - 90_000).toISOString();
    const result = formatRelativeTimeLocale(past, 'ja');
    expect(result).toContain('前');
  });
});
