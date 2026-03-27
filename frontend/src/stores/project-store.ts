import { create } from 'zustand';
import type { Project } from '@/types/monitoring';
import { DEMO_PROJECTS } from '@/lib/demo-data';

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')
  : 'http://localhost:8080/api/v1';

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  loaded: boolean;
  source: 'api' | 'demo';

  setCurrentProject: (id: string | null) => void;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  getProject: (id: string) => Project | undefined;
  fetchProjects: (mode: 'demo' | 'live' | 'auto') => Promise<void>;
}

// Transform API project → frontend Project type
function mapApiProject(item: Record<string, unknown>): Project {
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    description: String(item.description ?? ''),
    environment: (item.environment as Project['environment']) ?? 'production',
    tags: {},
    hostCount: 0,
    serviceCount: 0,
    aiServiceCount: 0,
    alertCount: 0,
    errorRate: 0,
    p95Latency: 0,
    sloCompliance: 99.9,
    status: 'healthy',
    lastActivity: String(item.updated_at ?? new Date().toISOString()),
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  loaded: false,
  source: 'demo',

  setCurrentProject: (id) => set({ currentProjectId: id }),

  setProjects: (projects) => set({
    projects,
    currentProjectId: get().currentProjectId ?? projects[0]?.id ?? null,
  }),

  addProject: (project) =>
    set((s) => ({ projects: [...s.projects, project] })),

  removeProject: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      currentProjectId: s.currentProjectId === id ? (s.projects[0]?.id ?? null) : s.currentProjectId,
    })),

  getProject: (id) => get().projects.find((p) => p.id === id),

  fetchProjects: async (mode) => {
    // Demo 모드: 데모 프로젝트 사용
    if (mode === 'demo') {
      set({ projects: DEMO_PROJECTS, currentProjectId: DEMO_PROJECTS[0]?.id ?? null, loaded: true, source: 'demo' });
      return;
    }

    // Live/Auto 모드: API에서 가져오기
    try {
      const res = await fetch(`${API_BASE}/projects`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const apiProjects = (data.items ?? []).map((item: Record<string, unknown>) => mapApiProject(item));
        if (apiProjects.length > 0) {
          const currentId = get().currentProjectId;
          const validCurrent = apiProjects.find((p: Project) => p.id === currentId);
          set({
            projects: apiProjects,
            currentProjectId: validCurrent ? currentId : apiProjects[0].id,
            loaded: true,
            source: 'api',
          });
          return;
        }
      }
    } catch { /* ignore */ }

    // Auto 모드: API 실패 시 데모 fallback
    if (mode === 'auto') {
      set({ projects: DEMO_PROJECTS, currentProjectId: DEMO_PROJECTS[0]?.id ?? null, loaded: true, source: 'demo' });
    } else {
      // Live 모드: API 실패 시 빈 목록
      set({ projects: [], currentProjectId: null, loaded: true, source: 'api' });
    }
  },
}));
