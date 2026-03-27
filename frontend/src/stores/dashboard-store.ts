'use client';

import { create } from 'zustand';
import type { DashboardConfig, WidgetConfig, WidgetType } from '@/types/monitoring';
import { getDashboardTemplates } from '@/lib/demo-data';

// ═══════════════════════════════════════════════════════════════
// Dashboard Store — 다중 대시보드 CRUD + LocalStorage 영속화
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'aitop-dashboards';

let widgetCounter = Date.now();
function newWidgetId() { return `w-${++widgetCounter}`; }
function newDashboardId() { return `db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

function loadFromStorage(): DashboardConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveToStorage(dashboards: DashboardConfig[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));
  } catch { /* ignore */ }
}

interface DashboardState {
  dashboards: DashboardConfig[];
  activeDashboardId: string | null;
  editMode: boolean;
  editingWidgetId: string | null;

  // Init
  init: () => void;

  // Dashboard CRUD
  createDashboard: (name: string, description?: string) => string;
  cloneDashboard: (id: string) => string;
  renameDashboard: (id: string, name: string) => void;
  deleteDashboard: (id: string) => void;
  setActiveDashboard: (id: string) => void;
  importDashboard: (config: DashboardConfig) => string;
  loadTemplate: (templateId: string) => string;

  // Edit mode
  setEditMode: (mode: boolean) => void;
  setEditingWidget: (widgetId: string | null) => void;

  // Widget CRUD
  addWidget: (type: WidgetType) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (widgetId: string, updates: Partial<WidgetConfig>) => void;
  reorderWidgets: (sourceId: string, targetId: string) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboards: [],
  activeDashboardId: null,
  editMode: true,
  editingWidgetId: null,

  init: () => {
    let dashboards = loadFromStorage();
    if (dashboards.length === 0) {
      // Seed with templates
      const templates = getDashboardTemplates();
      dashboards = templates.map((t) => ({ ...t, id: newDashboardId() }));
      saveToStorage(dashboards);
    }
    set({ dashboards, activeDashboardId: dashboards[0]?.id ?? null });
  },

  createDashboard: (name, description = '') => {
    const id = newDashboardId();
    const now = Date.now();
    const db: DashboardConfig = {
      id, name, description, widgets: [], createdAt: now, updatedAt: now,
    };
    const dashboards = [...get().dashboards, db];
    saveToStorage(dashboards);
    set({ dashboards, activeDashboardId: id, editMode: true });
    return id;
  },

  cloneDashboard: (id) => {
    const source = get().dashboards.find((d) => d.id === id);
    if (!source) return id;
    const newId = newDashboardId();
    const now = Date.now();
    const cloned: DashboardConfig = {
      ...source,
      id: newId,
      name: `${source.name} (copy)`,
      widgets: source.widgets.map((w) => ({ ...w, id: newWidgetId() })),
      createdAt: now,
      updatedAt: now,
    };
    const dashboards = [...get().dashboards, cloned];
    saveToStorage(dashboards);
    set({ dashboards, activeDashboardId: newId });
    return newId;
  },

  renameDashboard: (id, name) => {
    const dashboards = get().dashboards.map((d) =>
      d.id === id ? { ...d, name, updatedAt: Date.now() } : d,
    );
    saveToStorage(dashboards);
    set({ dashboards });
  },

  deleteDashboard: (id) => {
    const dashboards = get().dashboards.filter((d) => d.id !== id);
    saveToStorage(dashboards);
    const activeId = get().activeDashboardId === id
      ? (dashboards[0]?.id ?? null)
      : get().activeDashboardId;
    set({ dashboards, activeDashboardId: activeId });
  },

  setActiveDashboard: (id) => set({ activeDashboardId: id, editingWidgetId: null }),

  importDashboard: (config) => {
    const id = newDashboardId();
    const imported: DashboardConfig = {
      ...config,
      id,
      widgets: config.widgets.map((w) => ({ ...w, id: newWidgetId() })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const dashboards = [...get().dashboards, imported];
    saveToStorage(dashboards);
    set({ dashboards, activeDashboardId: id });
    return id;
  },

  loadTemplate: (templateId) => {
    const templates = getDashboardTemplates();
    const tpl = templates.find((t) => t.id === templateId) ?? templates[0];
    const id = newDashboardId();
    const db: DashboardConfig = {
      ...tpl,
      id,
      name: `${tpl.name} (copy)`,
      widgets: tpl.widgets.map((w) => ({ ...w, id: newWidgetId() })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const dashboards = [...get().dashboards, db];
    saveToStorage(dashboards);
    set({ dashboards, activeDashboardId: id, editMode: true });
    return id;
  },

  setEditMode: (editMode) => set({ editMode, editingWidgetId: editMode ? get().editingWidgetId : null }),
  setEditingWidget: (editingWidgetId) => set({ editingWidgetId }),

  addWidget: (type) => {
    const { activeDashboardId } = get();
    if (!activeDashboardId) return;
    const w: WidgetConfig = {
      id: newWidgetId(),
      type,
      title: `New ${type}`,
      size: type === 'kpi' ? '1x1' : '2x1',
      metric: type !== 'text' ? 'http_requests_total' : undefined,
      content: type === 'text' ? 'Enter notes...' : undefined,
    };
    const dashboards = get().dashboards.map((d) =>
      d.id === activeDashboardId
        ? { ...d, widgets: [...d.widgets, w], updatedAt: Date.now() }
        : d,
    );
    saveToStorage(dashboards);
    set({ dashboards, editingWidgetId: w.id });
  },

  removeWidget: (widgetId) => {
    const { activeDashboardId, editingWidgetId } = get();
    if (!activeDashboardId) return;
    const dashboards = get().dashboards.map((d) =>
      d.id === activeDashboardId
        ? { ...d, widgets: d.widgets.filter((w) => w.id !== widgetId), updatedAt: Date.now() }
        : d,
    );
    saveToStorage(dashboards);
    set({ dashboards, editingWidgetId: editingWidgetId === widgetId ? null : editingWidgetId });
  },

  updateWidget: (widgetId, updates) => {
    const { activeDashboardId } = get();
    if (!activeDashboardId) return;
    const dashboards = get().dashboards.map((d) =>
      d.id === activeDashboardId
        ? { ...d, widgets: d.widgets.map((w) => w.id === widgetId ? { ...w, ...updates } : w), updatedAt: Date.now() }
        : d,
    );
    saveToStorage(dashboards);
    set({ dashboards });
  },

  reorderWidgets: (sourceId, targetId) => {
    const { activeDashboardId } = get();
    if (!activeDashboardId || sourceId === targetId) return;
    const dashboards = get().dashboards.map((d) => {
      if (d.id !== activeDashboardId) return d;
      const widgets = [...d.widgets];
      const srcIdx = widgets.findIndex((w) => w.id === sourceId);
      const tgtIdx = widgets.findIndex((w) => w.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return d;
      const [moved] = widgets.splice(srcIdx, 1);
      widgets.splice(tgtIdx, 0, moved);
      return { ...d, widgets, updatedAt: Date.now() };
    });
    saveToStorage(dashboards);
    set({ dashboards });
  },
}));
