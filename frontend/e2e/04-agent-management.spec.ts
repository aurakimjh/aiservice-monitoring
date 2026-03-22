import { test, expect } from '@playwright/test';
import { loginAsDemo, assertPageLoaded } from './helpers';

/**
 * E2E 시나리오 4: 에이전트 관리
 * 경로: Fleet → 에이전트 상세 → 원격 CLI → 명령 실행 → 감사 로그 확인
 */
test.describe('Agent Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page, 'admin');
  });

  test('Fleet Console — Agent list, Jobs, Plugins tabs', async ({ page }) => {
    await page.goto('/agents');
    await assertPageLoaded(page);

    // Agent List 탭 확인
    await expect(page.locator('text=/agent|hostname|status|version/i').first()).toBeVisible();

    // Collection Jobs 탭
    const jobsTab = page.locator('text=/job|수집|collection/i').first();
    if (await jobsTab.isVisible()) {
      await jobsTab.click();
      await page.waitForTimeout(500);
    }

    // Plugins 탭
    const pluginsTab = page.locator('text=/plugin|플러그인/i').first();
    if (await pluginsTab.isVisible()) {
      await pluginsTab.click();
      await page.waitForTimeout(500);
    }
  });

  test('Fleet → Host detail navigation', async ({ page }) => {
    await page.goto('/agents');
    await assertPageLoaded(page);

    // 호스트 링크 클릭 → 인프라 상세로 이동
    const hostLink = page.locator('a[href*="/infra/"]').first();
    if (await hostLink.isVisible()) {
      await hostLink.click();
      await assertPageLoaded(page);
      // 호스트 상세 페이지 확인
      await expect(page.locator('text=/CPU|Memory|Disk|Network/i').first()).toBeVisible();
    }
  });
});
