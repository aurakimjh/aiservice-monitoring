'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

/**
 * Server-Sent Events (SSE) 기반 실시간 데이터 스트림 훅.
 *
 * EventBus → WebSocket Hub → SSE → Frontend 실시간 이벤트 수신.
 * 30초 폴링을 대체하며, 연결 끊김 시 자동 재연결.
 *
 * @example
 * ```tsx
 * const { lastEvent, isConnected } = useRealtime(['fleet', 'collect']);
 *
 * useEffect(() => {
 *   if (lastEvent?.type === 'agent.heartbeat') {
 *     // 에이전트 상태 즉시 갱신
 *     refresh();
 *   }
 * }, [lastEvent]);
 * ```
 */

export interface RealtimeEvent {
  type: string;
  channel: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface UseRealtimeOptions {
  /** 구독할 채널 목록 (기본: 전체) */
  channels?: string[];
  /** 자동 재연결 여부 (기본: true) */
  autoReconnect?: boolean;
  /** 재연결 간격 ms (기본: 5000) */
  reconnectInterval?: number;
  /** 이벤트 콜백 */
  onEvent?: (event: RealtimeEvent) => void;
  /** 연결 상태 변경 콜백 */
  onConnectionChange?: (connected: boolean) => void;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const {
    channels = ['*'],
    autoReconnect = true,
    reconnectInterval = 5000,
    onEvent,
    onConnectionChange,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Build SSE URL with channel params
    const params = new URLSearchParams();
    channels.forEach((ch) => params.append('channel', ch));
    const url = `${API_BASE}/events?${params.toString()}`;

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        onConnectionChange?.(true);
      };

      es.onmessage = (event) => {
        try {
          const parsed: RealtimeEvent = JSON.parse(event.data);
          setLastEvent(parsed);
          setEventCount((c) => c + 1);
          onEvent?.(parsed);
        } catch {
          // Ignore non-JSON messages
        }
      };

      es.onerror = () => {
        es.close();
        setIsConnected(false);
        onConnectionChange?.(false);

        // Auto-reconnect
        if (autoReconnect) {
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };
    } catch {
      // SSE not available (e.g., server down) — silently fail
      setIsConnected(false);
    }
  }, [channels, autoReconnect, reconnectInterval, onEvent, onConnectionChange]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    /** 현재 연결 상태 */
    isConnected,
    /** 마지막 수신 이벤트 */
    lastEvent,
    /** 총 수신 이벤트 수 */
    eventCount,
    /** 수동 재연결 */
    reconnect: connect,
    /** 연결 해제 */
    disconnect,
  };
}

/**
 * 특정 이벤트 타입만 필터링하여 수신하는 편의 훅.
 *
 * @example
 * ```tsx
 * useRealtimeEvent('agent.heartbeat', (event) => {
 *   console.log('Agent heartbeat:', event.data);
 * });
 * ```
 */
export function useRealtimeEvent(
  eventType: string,
  callback: (event: RealtimeEvent) => void,
  channels: string[] = ['*'],
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useRealtime({
    channels,
    onEvent: (event) => {
      if (event.type === eventType) {
        callbackRef.current(event);
      }
    },
  });
}
