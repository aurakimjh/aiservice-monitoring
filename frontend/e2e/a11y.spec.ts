/**
 * Phase 18-4: Accessibility Tests
 *
 * Uses @axe-core/playwright to detect WCAG 2.1 AA violations.
 * Run with: npm run test:a11y
 *
 * Standard: WCAG 2.1 Level AA
 * Target: 0 violations on all primary pages
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAsDemo, waitForPageReady } from './helpers';

const PRIMARY_PAGES = [
  { name: 'Home',        path: '/' },
  { name: 'Infra',       path: '/infra' },
  { name: 'AI Services', path: '/ai' },
  { name: 'Services',    path: '/services' },
  { name: 'Alerts',      path: '/alerts' },
  { name: 'Agents',      path: '/agents' },
  { name: 'Diagnostics', path: '/diagnostics' },
  { name: 'Settings',    path: '/settings' },
];

test.describe('Accessibility — WCAG 2.1 AA', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  for (const { name, path } of PRIMARY_PAGES) {
    test(`${name} page has no critical a11y violations`, async ({ page }) => {
      await page.goto(path);
      await waitForPageReady(page);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        // Suppress known third-party library issues
        .exclude('[data-axe-ignore]')
        .analyze();

      // Log violations for debugging
      if (results.violations.length > 0) {
        console.log(`[a11y] ${name} violations:`);
        for (const v of results.violations) {
          console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
          for (const node of v.nodes) {
            console.log(`    ↳ ${node.html}`);
          }
        }
      }

      // Critical (critical + serious) violations = 0
      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );
      expect(criticalViolations, `Critical a11y violations on ${name}`).toHaveLength(0);
    });
  }

  test('login page has no a11y violations', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test('keyboard navigation works on main nav', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    // Tab through navigation elements
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).not.toBeNull();

    // Verify skip link is accessible
    const skipLink = page.locator('a[href="#main-content"], a:has-text("본문으로"), a:has-text("Skip")').first();
    if (await skipLink.count() > 0) {
      await expect(skipLink).toBeVisible();
    }
  });

  test('focus indicators are visible', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    // Check that focus-visible styles apply
    const focusStyle = await page.evaluate(() => {
      const btn = document.querySelector('button');
      if (!btn) return null;
      btn.focus();
      return getComputedStyle(btn).outlineStyle;
    });

    // Should not be 'none' when focused
    expect(focusStyle).not.toBe('none');
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    const imgsWithoutAlt = await page.$$eval(
      'img:not([alt])',
      (imgs) => imgs.map((img) => (img as HTMLImageElement).src)
    );
    expect(imgsWithoutAlt).toHaveLength(0);
  });

  test('color contrast meets AA standard', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    const contrastViolations = results.violations.filter((v) => v.id === 'color-contrast');
    // Allow up to 3 minor contrast issues from third-party chart libraries
    expect(contrastViolations.flatMap((v) => v.nodes)).toHaveLength(0);
  });

  test('ARIA roles and labels are correct', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    const results = await new AxeBuilder({ page })
      .withRules(['aria-allowed-attr', 'aria-required-attr', 'aria-valid-attr-value', 'aria-roles'])
      .analyze();

    expect(results.violations).toHaveLength(0);
  });
});
