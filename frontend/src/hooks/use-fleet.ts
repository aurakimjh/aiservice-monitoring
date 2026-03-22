'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FleetAgent, CollectionJob, AgentPlugin } from '@/types/monitoring';
import { fleetApi } from '@/lib/api-client';
import { getProjectHosts, getCollectionJobs, getAgentPlugins } from '@/lib/demo-data';

export interface FleetState {
  agents: FleetAgent[];
  jobs: CollectionJob[];
  plugins: AgentPlugin[];
  loading: boolean;
  /** true = Collection Server에서 실데이터 수신 중, false = demo fallback */
  isLive: boolean;
  refresh: () => void;
}

const POLL_INTERVAL_MS = 30_000;

export function useFleet(projectId?: string): FleetState {
  const [agents, setAgents] = useState<FleetAgent[]>([]);
  const [jobs, setJobs] = useState<CollectionJob[]>([]);
  const [plugins, setPlugins] = useState<AgentPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [agentsRes, jobsRes, pluginsRes] = await Promise.all([
        fleetApi.listAgents(projectId),
        fleetApi.listJobs(projectId),
        fleetApi.listPlugins(),
      ]);
      setAgents(agentsRes.items);
      setJobs(jobsRes.items);
      setPlugins(pluginsRes.items);
      setIsLive(true);
    } catch {
      // Collection Server가 아직 기동되지 않은 경우 demo 데이터로 fallback
      const hosts = getProjectHosts(projectId ?? 'proj-ai-prod');
      setAgents(
        hosts
          .filter((h) => h.agent)
          .map((h) => ({
            ...h.agent!,
            hostname: h.hostname,
            os: h.os,
          })),
      );
      setJobs(getCollectionJobs());
      setPlugins(getAgentPlugins());
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
    timerRef.current = setInterval(() => void loadData(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadData]);

  return { agents, jobs, plugins, loading, isLive, refresh: loadData };
}
