/**
 * Phase 18-3: Visual Regression Tests
 *
 * Captures and compares screenshots for key pages.
 * Run with: npm run test:e2e:visual
 *
 * First run: generates baseline snapshots
 * Subsequent runs: compares against baseline, fails on pixel diff > threshold
 *
 * To update snapshots: playwright test --update-snapshots
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, waitForPageReady } from './helpers';

const PAGES = [
  { name: 'home',       path: '/' },
  { name: 'infra',      path: '/infra' },
  { name: 'ai',         path: '/ai' },
  { name: 'services',   path: '/services' },
  { name: 'alerts',     path: '/alerts' },
  { name: 'agents',     path: '/agents' },
  { name: 'traces',     path: '/traces' },
  { name: 'logs',       path: '/logs' },
  { name: 'diagnostics',path: '/diagnostics' },
  { name: 'slo',        path: '/slo' },
  { name: 'costs',      path: '/costs' },
  { name: 'settings',   path: '/settings' },
];

test.describe('Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    // Disable animations for stable screenshots
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });
  });

  for (const { name, path } of PAGES) {
    test(`${name} page matches snapshot`, async ({ page }) => {
      await page.goto(path);
      await waitForPageReady(page);

      // Mask dynamic content (timestamps, live metrics) before comparing
      await expect(page).toHaveScreenshot(`${name}.png`, {
        maxDiffPixels: 100,
        mask: [
          // Time-based elements
          page.locator('[data-testid="timestamp"]'),
          page.locator('[data-testid="metric-value"]'),
          page.locator('[data-testid="chart"]'),
          page.locator('time'),
        ],
        animations: 'disabled',
      });
    });
  }

  test('dark theme renders correctly', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);
    // Dark theme is default — verify CSS custom properties
    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
    );
    expect(bgColor).toBeTruthy();

    await expect(page).toHaveScreenshot('home-dark.png', {
      maxDiffPixels: 100,
      animations: 'disabled',
    });
  });

  test('sidebar collapsed state matches snapshot', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    // Collapse sidebar
    const sidebarToggle = page.locator('[data-testid="sidebar-toggle"], [aria-label*="sidebar"], [aria-label*="메뉴"]').first();
    if (await sidebarToggle.isVisible()) {
      await sidebarToggle.click();
      await page.waitForTimeout(100);
    }

    await expect(page).toHaveScreenshot('home-sidebar-collapsed.png', {
      maxDiffPixels: 100,
      animations: 'disabled',
    });
  });

  test('mobile viewport matches snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForPageReady(page);

    await expect(page).toHaveScreenshot('home-mobile.png', {
      maxDiffPixels: 150,
      animations: 'disabled',
    });
  });
});
