import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: '../reports/playwright' }],
    ['list'],
    ['json', { outputFile: '../reports/playwright/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // ── Unit E2E scenarios ───────────────────────────────────────
    {
      name: 'chromium',
      testMatch: [
        '01-sre-incident-response.spec.ts',
        '02-ai-engineer-tuning.spec.ts',
        '03-consultant-inspection.spec.ts',
        '04-agent-management.spec.ts',
        '05-navigation-and-i18n.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
    },

    // ── Visual regression ────────────────────────────────────────
    {
      name: 'visual',
      testMatch: 'visual-regression.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // Screenshots stored in e2e/snapshots/
      },
    },

    // ── Accessibility ────────────────────────────────────────────
    {
      name: 'a11y',
      testMatch: 'a11y.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  snapshotDir: './e2e/snapshots',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
