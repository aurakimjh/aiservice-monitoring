import { type Page, expect } from '@playwright/test';

/**
 * 데모 계정으로 로그인
 */
export async function loginAsDemo(page: Page, role: 'admin' | 'sre' | 'ai' | 'viewer' = 'admin') {
  const emails: Record<string, string> = {
    admin: 'admin@aitop.io',
    sre: 'sre@aitop.io',
    ai: 'ai@aitop.io',
    viewer: 'viewer@aitop.io',
  };
  const buttonText: Record<string, string> = {
    admin: 'Administrator',
    sre: 'SRE',
    ai: 'AI Engineer',
    viewer: 'Viewer',
  };

  // 최대 2회 시도 (Docker 환경에서 첫 시도 실패 시 재시도)
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // 방법 1: 데모 버튼 클릭
    const btn = page.locator(`button:has-text("${buttonText[role]}")`).first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      await btn.click();
    } catch {
      // 방법 2: email/password 입력
      await page.fill('input[type="email"]', emails[role]);
      await page.fill('input[type="password"]', role);
      await page.click('button[type="submit"]');
    }

    // 로그인 완료 대기
    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
      return; // 성공 시 종료
    } catch {
      if (attempt === 0) continue; // 첫 시도 실패 → 재시도
      // 2회 모두 실패 — 마지막으로 email/password 재시도
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      await page.fill('input[type="email"]', emails[role]);
      await page.fill('input[type="password"]', role);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
    }
  }
}

/**
 * 사이드바 메뉴 클릭으로 페이지 이동
 */
export async function navigateTo(page: Page, menuText: string) {
  const sidebar = page.locator('nav, aside').first();
  await sidebar.getByText(menuText, { exact: false }).click();
  await page.waitForLoadState('networkidle');
}

/**
 * 페이지가 에러 없이 로드되었는지 확인
 */
export async function assertPageLoaded(page: Page) {
  // AuthGuard Loading 해제 대기
  await expect(page.locator('text=Loading...')).toBeHidden({ timeout: 15_000 }).catch(() => {});
  // 500 에러 페이지가 아닌지
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  // 메인 콘텐츠 또는 사이드바가 표시되는지 (레이아웃 로드 확인)
  await expect(page.locator('main, [role="main"], nav, aside').first()).toBeVisible({ timeout: 10_000 });
}

/**
 * 페이지 로딩 완료 대기 (a11y/visual 테스트용)
 */
export async function waitForPageReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  // 동적 콘텐츠가 렌더링될 시간 확보
  await page.waitForTimeout(1000);
}

/**
 * KPI 카드가 표시되는지 확인
 */
export async function assertKPIVisible(page: Page, count: number = 1) {
  const kpiCards = page.locator('[class*="kpi"], [class*="stat"], [class*="card"]');
  await expect(kpiCards.first()).toBeVisible({ timeout: 10_000 });
}
