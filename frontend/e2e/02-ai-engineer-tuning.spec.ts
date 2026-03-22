import { test, expect } from '@playwright/test';
import { loginAsDemo, assertPageLoaded } from './helpers';

/**
 * E2E 시나리오 2: AI Engineer 성능 튜닝
 * 경로: AI 서비스 → LLM 성능 → GPU 클러스터 → RAG 파이프라인 → 진단 보고서
 */
test.describe('AI Engineer Performance Tuning Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page, 'ai');
  });

  test('AI overview → AI detail → GPU cluster → Diagnostics', async ({ page }) => {
    // Step 1: AI 서비스 개요
    await page.goto('/ai');
    await assertPageLoaded(page);
    await expect(page.locator('text=/TTFT|TPS|GPU|token|AI/i').first()).toBeVisible();

    // Step 2: AI 서비스 상세 (LLM 성능)
    const aiServiceLink = page.locator('a[href*="/ai/"]').first();
    if (await aiServiceLink.isVisible()) {
      await aiServiceLink.click();
      await assertPageLoaded(page);
    }

    // Step 3: GPU 클러스터 뷰
    await page.goto('/ai/gpu');
    await assertPageLoaded(page);
    await expect(page.locator('text=/GPU|VRAM|temperature|power/i').first()).toBeVisible();

    // Step 4: 진단 보고서
    await page.goto('/diagnostics');
    await assertPageLoaded(page);
    await expect(page.locator('text=/diagnostic|진단|pass|warn|fail/i').first()).toBeVisible();
  });
});
