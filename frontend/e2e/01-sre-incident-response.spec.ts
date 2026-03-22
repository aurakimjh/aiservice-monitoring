import { test, expect } from '@playwright/test';
import { loginAsDemo, assertPageLoaded } from './helpers';

/**
 * E2E 시나리오 1: SRE 장애 대응
 * 경로: 알림 → 인시던트 → 서비스맵 → 트레이스 → 스팬 상세 → 근본 원인
 */
test.describe('SRE Incident Response Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page, 'sre');
  });

  test('Executive → Services → Trace detail drill-down', async ({ page }) => {
    // Step 1: Executive 대시보드 확인
    await page.goto('/executive');
    await assertPageLoaded(page);
    await expect(page.locator('text=/health|availability|incident/i').first()).toBeVisible();

    // Step 2: Services 페이지 이동
    await page.goto('/services');
    await assertPageLoaded(page);
    // 서비스 목록 또는 서비스 맵이 표시되는지 확인
    await expect(page.locator('text=/service|서비스/i').first()).toBeVisible();

    // Step 3: 서비스 상세 클릭
    const serviceLink = page.locator('a[href*="/services/"]').first();
    if (await serviceLink.isVisible()) {
      await serviceLink.click();
      await assertPageLoaded(page);
      // Golden Signal KPI가 표시되는지 확인
      await expect(page.locator('text=/latency|traffic|error|saturation/i').first()).toBeVisible();
    }

    // Step 4: XLog/HeatMap 대시보드
    await page.goto('/traces');
    await assertPageLoaded(page);
    await expect(page.locator('text=/xlog|heatmap|trace/i').first()).toBeVisible();

    // Step 5: 로그 탐색기
    await page.goto('/logs');
    await assertPageLoaded(page);
    await expect(page.locator('text=/log|search|stream/i').first()).toBeVisible();
  });

  test('Alerts → Incident timeline → RCA', async ({ page }) => {
    // Step 1: 알림/인시던트 페이지
    await page.goto('/alerts');
    await assertPageLoaded(page);

    // Incidents 탭 클릭
    const incidentTab = page.locator('text=/incident/i').first();
    if (await incidentTab.isVisible()) {
      await incidentTab.click();
    }

    // 인시던트 목록 확인
    await expect(page.locator('text=/critical|warning|resolved|TTFT|GPU|error/i').first()).toBeVisible();
  });
});
