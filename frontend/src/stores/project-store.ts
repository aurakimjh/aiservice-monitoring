import { create } from 'zustand';
import type { Project } from '@/types/monitoring';
import { DEMO_PROJECTS } from '@/lib/demo-data';

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;

  setCurrentProject: (id: string | null) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  getProject: (id: string) => Project | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: DEMO_PROJECTS,
  currentProjectId: DEMO_PROJECTS[0]?.id ?? null,

  setCurrentProject: (id) => set({ currentProjectId: id }),

  addProject: (project) =>
    set((s) => ({ projects: [...s.projects, project] })),

  removeProject: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
    })),

  getProject: (id) => get().projects.find((p) => p.id === id),
}));
