import { create } from 'zustand';
import type { TimeRange } from '@/types/monitoring';
import { TIME_RANGES } from '@/types/monitoring';
import type { Locale } from '@/lib/i18n';

interface UIState {
  sidebarExpanded: boolean;
  theme: 'dark' | 'light';
  locale: Locale;
  timeRange: TimeRange;
  autoRefresh: boolean;
  refreshInterval: number;
  commandPaletteOpen: boolean;

  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setLocale: (locale: Locale) => void;
  setTimeRange: (range: TimeRange) => void;
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (ms: number) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarExpanded: true,
  theme: 'dark',
  locale: 'ko',
  timeRange: TIME_RANGES[2], // Last 1h
  autoRefresh: true,
  refreshInterval: 5000,
  commandPaletteOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setTheme: (theme) => set({ theme }),
  setLocale: (locale) => set({ locale }),
  setTimeRange: (timeRange) => set({ timeRange }),
  setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
  setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
}));
