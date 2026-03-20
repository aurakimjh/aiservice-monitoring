import { useCallback } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { t as translate, formatDateLocale, formatNumberLocale, formatRelativeTimeLocale, LOCALE_CONFIG } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

export function useI18n() {
  const locale = useUIStore((s) => s.locale);
  const setLocale = useUIStore((s) => s.setLocale);

  const t = useCallback((key: string) => translate(key, locale), [locale]);
  const formatDate = useCallback((date: Date | number, options?: Intl.DateTimeFormatOptions) => formatDateLocale(date, locale, options), [locale]);
  const formatNumber = useCallback((value: number, options?: Intl.NumberFormatOptions) => formatNumberLocale(value, locale, options), [locale]);
  const formatRelativeTime = useCallback((date: Date | string | number) => formatRelativeTimeLocale(date, locale), [locale]);

  return { locale, setLocale, t, formatDate, formatNumber, formatRelativeTime, localeConfig: LOCALE_CONFIG[locale] };
}
