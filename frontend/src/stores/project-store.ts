import { create } from 'zustand';
import type { Project } from '@/types/monitoring';
import { DEMO_PROJECTS } from '@/lib/demo-data';

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  isLiveMode: boolean;

  setCurrentProject: (id: string | null) => void;
  setProjects: (projects: Project[]) => void;
  setLiveMode: (live: boolean) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  getProject: (id: string) => Project | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: DEMO_PROJECTS,
  currentProjectId: DEMO_PROJECTS[0]?.id ?? null,
  isLiveMode: false,

  setCurrentProject: (id) => set({ currentProjectId: id }),

  setProjects: (projects) => set({
    projects,
    currentProjectId: projects[0]?.id ?? null,
  }),

  setLiveMode: (isLiveMode) => {
    if (isLiveMode) {
      // Live 모드: 빈 목록 (API에서 가져올 때까지)
      set({ isLiveMode, projects: [], currentProjectId: null });
    } else {
      // Demo/Auto 모드: 데모 프로젝트 복원
      set({ isLiveMode, projects: DEMO_PROJECTS, currentProjectId: DEMO_PROJECTS[0]?.id ?? null });
    }
  },

  addProject: (project) =>
    set((s) => ({ projects: [...s.projects, project] })),

  removeProject: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
    })),

  getProject: (id) => get().projects.find((p) => p.id === id),
}));
