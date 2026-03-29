'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FleetAgent, CollectionJob, AgentPlugin, AgentGroup, UpdateStatus, CollectionSchedule } from '@/types/monitoring';
import { fleetApi } from '@/lib/api-client';
import { getProjectHosts, getCollectionJobs, getAgentPlugins, getAgentGroups, getUpdateStatuses, getCollectionSchedules } from '@/lib/demo-data';
import { useUIStore } from '@/stores/ui-store';

export interface FleetState {
  agents: FleetAgent[];
  jobs: CollectionJob[];
  plugins: AgentPlugin[];
  groups: AgentGroup[];
  updateStatuses: UpdateStatus[];
  schedules: CollectionSchedule[];
  loading: boolean;
  /** true = Collection Server에서 실데이터 수신 중, false = demo fallback */
  isLive: boolean;
  refresh: () => void;
}

const POLL_INTERVAL_MS = 30_000;

export function useFleet(projectId?: string): FleetState {
  const mode = useUIStore((s) => s.dataSourceMode);
  const [agents, setAgents] = useState<FleetAgent[]>([]);
  const [jobs, setJobs] = useState<CollectionJob[]>([]);
  const [plugins, setPlugins] = useState<AgentPlugin[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [updateStatuses, setUpdateStatuses] = useState<UpdateStatus[]>([]);
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDemoData = useCallback(() => {
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
    setGroups(getAgentGroups());
    setUpdateStatuses(getUpdateStatuses());
    setSchedules(getCollectionSchedules());
    setIsLive(false);
  }, [projectId]);

  const loadData = useCallback(async () => {
    // Demo mode — 즉시 fallback
    if (mode === 'demo') {
      loadDemoData();
      setLoading(false);
      return;
    }

    try {
      const [agentsRes, jobsRes, pluginsRes, groupsRes, updatesRes, schedulesRes] = await Promise.all([
        fleetApi.listAgents(projectId),
        fleetApi.listJobs(projectId),
        fleetApi.listPlugins(),
        fleetApi.listGroups(),
        fleetApi.listUpdates(),
        fleetApi.listSchedules(),
      ]);
      setAgents(agentsRes.items);
      setJobs(jobsRes.items);
      setPlugins(pluginsRes.items);
      setGroups(groupsRes.items);
      setUpdateStatuses(updatesRes.items);
      setSchedules(schedulesRes.items);
      setIsLive(true);
    } catch {
      if (mode === 'auto') {
        // Auto mode: 실패 시 demo fallback
        loadDemoData();
      } else {
        // Live mode: 빈 상태 유지 (fallback 없음)
        setIsLive(false);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, mode, loadDemoData]);

  useEffect(() => {
    void loadData();
    timerRef.current = setInterval(() => void loadData(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadData]);

  return { agents, jobs, plugins, groups, updateStatuses, schedules, loading, isLive, refresh: loadData };
}
