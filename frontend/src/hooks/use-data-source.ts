'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUIStore } from '@/stores/ui-store';
import type { DataSourceMode } from '@/stores/ui-store';

// ═══════════════════════════════════════════════════════════════
// Data Source Hook — Demo/Live/Auto 모드 지원
//
// 사용법:
//   const { data, source, loading, error, refetch } = useDataSource(
//     '/api/v1/realdata/overview',           // API URL
//     () => getDemoOverviewData(),            // Demo fallback 함수
//   );
//
// source: 'live' | 'demo' — 현재 데이터가 어디서 왔는지
// ═══════════════════════════════════════════════════════════════

export type DataSource = 'live' | 'demo';

interface UseDataSourceResult<T> {
  data: T | null;
  source: DataSource;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Global counter for status bar
let liveCount = 0;
let demoCount = 0;
const listeners = new Set<() => void>();

export function getDataSourceCounts() {
  return { live: liveCount, demo: demoCount };
}

export function subscribeDataSourceCounts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')
  : 'http://localhost:8080/api/v1';

export function useDataSource<T>(
  apiPath: string,
  demoFallback: () => T,
  options?: {
    refreshInterval?: number;
    transform?: (raw: unknown) => T;
  },
): UseDataSourceResult<T> {
  const mode = useUIStore((s) => s.dataSourceMode);
  const [data, setData] = useState<T | null>(null);
  const [source, setSource] = useState<DataSource>('demo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevSourceRef = useRef<DataSource>('demo');

  // Stabilize transform/demoFallback refs to prevent infinite loops
  const transformRef = useRef(options?.transform);
  transformRef.current = options?.transform;
  const demoRef = useRef(demoFallback);
  demoRef.current = demoFallback;

  const fetchData = useCallback(async () => {
    // Demo mode — 즉시 fallback 사용
    if (mode === 'demo') {
      setData(demoRef.current());
      setSource('demo');
      setLoading(false);
      setError(null);
      return;
    }

    // Live or Auto mode — API 호출 시도
    try {
      setLoading(true);
      const url = apiPath.startsWith('http') ? apiPath : `${API_BASE}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`;
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const raw = await res.json();
      const transformed = transformRef.current ? transformRef.current(raw) : raw as T;
      setData(transformed);
      setSource('live');
      setError(null);
    } catch (err) {
      if (mode === 'auto') {
        // Auto mode: 실패 시 demo fallback
        setData(demoRef.current());
        setSource('demo');
        setError(null);
      } else {
        // Live mode: 에러 표시 (fallback 없음)
        setData(null);
        setSource('live');
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  }, [apiPath, mode]); // demoFallback and transform are stabilized via refs

  // Update global counters
  useEffect(() => {
    if (prevSourceRef.current === 'live') liveCount--;
    if (prevSourceRef.current === 'demo') demoCount--;

    if (source === 'live') liveCount++;
    if (source === 'demo') demoCount++;
    prevSourceRef.current = source;
    notifyListeners();

    return () => {
      if (source === 'live') liveCount--;
      if (source === 'demo') demoCount--;
      notifyListeners();
    };
  }, [source]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto refresh
  useEffect(() => {
    if (!options?.refreshInterval) return;
    const interval = setInterval(fetchData, options.refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, options?.refreshInterval]);

  return { data, source, loading, error, refetch: fetchData };
}
