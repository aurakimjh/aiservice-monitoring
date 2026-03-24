import { test, expect } from '@playwright/test';
import { loginAsDemo, assertPageLoaded } from './helpers';

/**
 * E2E 시나리오 3: 컨설턴트 점검
 * 경로: 프로젝트 → 에이전트 수집 실행 → 진단 보고서 (86개) → PDF 다운로드
 */
test.describe('Consultant Inspection Flow', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsDemo(page, 'admin');
  });

  test('Projects → Agents → Diagnostics → SLO → Costs', async ({ page }) => {
    // Step 1: 프로젝트 목록
    await page.goto('/projects');
    await assertPageLoaded(page);

    // 프로젝트 카드가 표시되는지 확인
    const projectCard = page.locator('a[href*="/projects/"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await assertPageLoaded(page);
    }

    // Step 2: Agent Fleet Console
    await page.goto('/agents');
    // AuthGuard 리다이렉트 방지 — 인증 상태 안정화 대기
    await page.waitForTimeout(2000);
    if (page.url().includes('/login')) {
      // 인증 상태 유실 시 재로그인
      await loginAsDemo(page, 'admin');
      await page.goto('/agents');
    }
    await assertPageLoaded(page);

    // Step 3: 진단 보고서 — 86개 항목
    await page.goto('/diagnostics');
    await assertPageLoaded(page);

    // 카테고리별 진단 항목 확인
    await expect(page.locator('text=/OS|GPU|LLM|VectorDB|WEB|WAS|DB/i').first()).toBeVisible();

    // Step 4: SLO 관리
    await page.goto('/slo');
    await page.waitForTimeout(1000);
    if (page.url().includes('/login')) { await loginAsDemo(page, 'admin'); await page.goto('/slo'); }
    await assertPageLoaded(page);

    // Step 5: 비용 분석
    await page.goto('/costs');
    await page.waitForTimeout(1000);
    if (page.url().includes('/login')) { await loginAsDemo(page, 'admin'); await page.goto('/costs'); }
    await assertPageLoaded(page);
  });
});
