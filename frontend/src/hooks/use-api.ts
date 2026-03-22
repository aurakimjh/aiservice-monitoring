'use client';

import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL_MS = 30_000;

/**
 * Generic API hook — 실데이터 우선, 실패 시 demo fallback.
 * use-fleet.ts 패턴을 범용화한 훅.
 *
 * @param apiFn     실데이터 API 호출 함수
 * @param fallbackFn demo 데이터 반환 함수
 * @param deps      리페치 트리거 의존성
 * @param pollMs    폴링 간격 (0이면 폴링 안함, 기본 30초)
 */
export function useApi<T>(
  apiFn: () => Promise<T>,
  fallbackFn: () => T,
  deps: unknown[] = [],
  pollMs: number = POLL_INTERVAL_MS,
): {
  data: T;
  loading: boolean;
  isLive: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [data, setData] = useState<T>(fallbackFn);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const result = await apiFn();
      setData(result);
      setIsLive(true);
      setError(null);
    } catch (e) {
      // API 미가동 시 demo fallback
      setData(fallbackFn());
      setIsLive(false);
      setError(e instanceof Error ? e.message : 'API unavailable');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void loadData();

    if (pollMs > 0) {
      const timer = setInterval(() => void loadData(), pollMs);
      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData, pollMs]);

  return { data, loading, isLive, error, refresh: loadData };
}

/**
 * 다중 API 동시 호출 훅 — use-fleet 패턴.
 * 하나라도 실패하면 전체 fallback.
 */
export function useMultiApi<T extends Record<string, unknown>>(
  apiFns: { [K in keyof T]: () => Promise<T[K]> },
  fallbackFns: { [K in keyof T]: () => T[K] },
  deps: unknown[] = [],
  pollMs: number = POLL_INTERVAL_MS,
): {
  data: T;
  loading: boolean;
  isLive: boolean;
  refresh: () => void;
} {
  const keys = Object.keys(apiFns) as (keyof T)[];

  const buildFallback = useCallback((): T => {
    const result = {} as T;
    for (const key of keys) {
      result[key] = fallbackFns[key]();
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [data, setData] = useState<T>(buildFallback);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const promises = keys.map((key) => apiFns[key]());
      const results = await Promise.all(promises);
      const newData = {} as T;
      keys.forEach((key, i) => {
        newData[key] = results[i] as T[keyof T];
      });
      setData(newData);
      setIsLive(true);
    } catch {
      setData(buildFallback());
      setIsLive(false);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void loadData();

    if (pollMs > 0) {
      const timer = setInterval(() => void loadData(), pollMs);
      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData, pollMs]);

  return { data, loading, isLive, refresh: loadData };
}
