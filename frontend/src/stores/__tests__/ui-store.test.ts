import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../ui-store';

// Helper to get current state
const getState = () => useUIStore.getState();

describe('useUIStore', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    useUIStore.setState({
      sidebarExpanded: true,
      theme: 'dark',
      locale: 'ko',
      autoRefresh: true,
      refreshInterval: 5000,
      commandPaletteOpen: false,
    });
  });

  describe('sidebar', () => {
    it('starts expanded by default', () => {
      expect(getState().sidebarExpanded).toBe(true);
    });

    it('toggles sidebar', () => {
      getState().toggleSidebar();
      expect(getState().sidebarExpanded).toBe(false);
      getState().toggleSidebar();
      expect(getState().sidebarExpanded).toBe(true);
    });

    it('sets sidebar expanded directly', () => {
      getState().setSidebarExpanded(false);
      expect(getState().sidebarExpanded).toBe(false);
      getState().setSidebarExpanded(true);
      expect(getState().sidebarExpanded).toBe(true);
    });
  });

  describe('theme', () => {
    it('starts with dark theme', () => {
      expect(getState().theme).toBe('dark');
    });

    it('sets theme to light', () => {
      getState().setTheme('light');
      expect(getState().theme).toBe('light');
    });

    it('sets theme back to dark', () => {
      getState().setTheme('light');
      getState().setTheme('dark');
      expect(getState().theme).toBe('dark');
    });
  });

  describe('locale', () => {
    it('starts with Korean locale', () => {
      expect(getState().locale).toBe('ko');
    });

    it('changes locale to en', () => {
      getState().setLocale('en');
      expect(getState().locale).toBe('en');
    });

    it('changes locale to ja', () => {
      getState().setLocale('ja');
      expect(getState().locale).toBe('ja');
    });
  });

  describe('timeRange', () => {
    it('has a default timeRange', () => {
      const { timeRange } = getState();
      expect(timeRange).toBeDefined();
      expect(timeRange).toHaveProperty('label');
      expect(timeRange).toHaveProperty('value');
    });

    it('sets a new timeRange', () => {
      const newRange = { label: 'Last 5m', value: '5m', ms: 300_000 };
      getState().setTimeRange(newRange);
      expect(getState().timeRange).toEqual(newRange);
    });
  });

  describe('autoRefresh', () => {
    it('starts with autoRefresh enabled', () => {
      expect(getState().autoRefresh).toBe(true);
    });

    it('disables autoRefresh', () => {
      getState().setAutoRefresh(false);
      expect(getState().autoRefresh).toBe(false);
    });

    it('changes refresh interval', () => {
      getState().setRefreshInterval(10_000);
      expect(getState().refreshInterval).toBe(10_000);
    });
  });

  describe('commandPalette', () => {
    it('starts closed', () => {
      expect(getState().commandPaletteOpen).toBe(false);
    });

    it('opens command palette', () => {
      getState().setCommandPaletteOpen(true);
      expect(getState().commandPaletteOpen).toBe(true);
    });

    it('closes command palette', () => {
      getState().setCommandPaletteOpen(true);
      getState().setCommandPaletteOpen(false);
      expect(getState().commandPaletteOpen).toBe(false);
    });
  });
});
