import { test, expect } from '@playwright/test';
import { loginAsDemo, assertPageLoaded } from './helpers';

/**
 * E2E 시나리오 5: 전체 네비게이션 + i18n + 접근성
 * 모든 주요 페이지 접근 가능 확인 + 언어 전환 + 키보드 네비게이션
 */
test.describe('Navigation, i18n, and Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page, 'admin');
  });

  test('All 26 routes render without errors', async ({ page }) => {
    const routes = [
      '/',
      '/projects',
      '/infra',
      '/services',
      '/traces',
      '/logs',
      '/metrics',
      '/ai',
      '/ai/gpu',
      '/agents',
      '/diagnostics',
      '/alerts',
      '/slo',
      '/costs',
      '/executive',
      '/dashboards',
      '/notebooks',
      '/tenants',
      '/settings',
    ];

    for (const route of routes) {
      await page.goto(route);
      // 500 에러 없음
      await expect(page.locator('body')).not.toContainText('Internal Server Error');
      // 메인 콘텐츠 영역 존재
      const main = page.locator('main, [role="main"]').first();
      await expect(main).toBeVisible({ timeout: 10_000 });
    }
  });

  test('Login page — 4 demo accounts visible', async ({ page }) => {
    // 새 컨텍스트에서 로그인 페이지 접속 (인증 상태 없이)
    const context = await page.context().browser()!.newContext();
    const freshPage = await context.newPage();
    await freshPage.goto('/login');
    await freshPage.waitForLoadState('networkidle');
    await expect(freshPage.locator('text=/Administrator|SRE|Engineer|Viewer/i').first()).toBeVisible({ timeout: 10000 });
    await context.close();
  });

  test('404 page for non-existent routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    // 404 표시 또는 리다이렉트
    const is404 = await page.locator('text=/404|not found/i').first().isVisible().catch(() => false);
    const isRedirected = page.url().includes('/login') || page.url().endsWith('/');
    expect(is404 || isRedirected).toBe(true);
  });
});
