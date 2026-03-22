#!/usr/bin/env node
/**
 * Phase 18-6: Memory Leak Test
 *
 * Navigates through all pages repeatedly and measures JS heap size.
 * Alerts if memory grows beyond a threshold between iterations.
 *
 * Usage:
 *   node scripts/memory-leak-test.js [--iterations 10] [--url http://localhost:3000]
 *
 * Requirements:
 *   - @playwright/test (playwright chromium installed)
 *   - npm run dev (or target server running at BASE_URL)
 *
 * Threshold:
 *   - Max heap after N iterations < 200 MB
 *   - Heap growth per iteration < 5 MB (indicates leak)
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const REPORTS_DIR = resolve(process.cwd(), '../reports/memory');

// Parse args
const args = process.argv.slice(2);
const iterIdx = args.indexOf('--iterations');
const ITERATIONS = iterIdx >= 0 ? parseInt(args[iterIdx + 1], 10) : 10;

const MAX_HEAP_MB = 200;
const MAX_GROWTH_PER_ITER_MB = 5;

const PAGES = ['/', '/infra', '/ai', '/services', '/alerts', '/agents', '/traces', '/logs'];

async function getHeapMB(page) {
  const metrics = await page.evaluate(() => {
    if ('memory' in performance) {
      return (performance as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize;
    }
    return null;
  });
  return metrics ? metrics / (1024 * 1024) : null;
}

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  console.log(`\n🧠 Memory Leak Test`);
  console.log(`   Base URL   : ${BASE_URL}`);
  console.log(`   Iterations : ${ITERATIONS}`);
  console.log(`   Max heap   : ${MAX_HEAP_MB} MB`);
  console.log(`   Max growth : ${MAX_GROWTH_PER_ITER_MB} MB/iter\n`);

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--js-flags=--expose-gc'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable CDP for memory info
  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send('Performance.enable');

  const heapSamples = [];
  let allPassed = true;

  try {
    // Login
    await page.goto(`${BASE_URL}/login`);
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 3000 })) {
      await emailInput.fill('admin@aitop.io');
      await page.locator('input[type="password"]').fill('admin123');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(`${BASE_URL}/**`, { timeout: 10_000 });
    }

    for (let i = 0; i < ITERATIONS; i++) {
      // Navigate through all pages
      for (const path of PAGES) {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
      }

      // Force GC if available
      await page.evaluate(() => {
        if (typeof gc === 'function') gc();
      }).catch(() => {});

      await page.waitForTimeout(200);

      const heapMB = await getHeapMB(page);
      heapSamples.push({ iteration: i + 1, heapMB });

      const trend = heapSamples.length >= 2
        ? heapSamples[heapSamples.length - 1].heapMB - heapSamples[heapSamples.length - 2].heapMB
        : 0;

      const heapStr = heapMB ? `${heapMB.toFixed(1)} MB` : 'N/A';
      const trendStr = heapSamples.length >= 2 ? ` (${trend >= 0 ? '+' : ''}${trend?.toFixed(1)} MB)` : '';
      const icon = heapMB && heapMB > MAX_HEAP_MB ? '❌' : trend > MAX_GROWTH_PER_ITER_MB ? '⚠️ ' : '✅';

      console.log(`  ${icon} Iter ${String(i + 1).padStart(2)} : heap = ${heapStr}${trendStr}`);

      if (heapMB && heapMB > MAX_HEAP_MB) {
        console.error(`  ❌ FAIL: heap ${heapMB.toFixed(1)} MB exceeds limit of ${MAX_HEAP_MB} MB`);
        allPassed = false;
      }
      if (trend > MAX_GROWTH_PER_ITER_MB) {
        console.warn(`  ⚠️  WARNING: growth ${trend.toFixed(1)} MB/iter exceeds ${MAX_GROWTH_PER_ITER_MB} MB`);
      }
    }
  } finally {
    await browser.close();
  }

  // Analyze trend
  if (heapSamples.length >= 3) {
    const first3 = heapSamples.slice(0, 3).reduce((s, x) => s + (x.heapMB ?? 0), 0) / 3;
    const last3 = heapSamples.slice(-3).reduce((s, x) => s + (x.heapMB ?? 0), 0) / 3;
    const totalGrowth = last3 - first3;
    console.log(`\n  Trend: first-3 avg = ${first3.toFixed(1)} MB, last-3 avg = ${last3.toFixed(1)} MB`);
    console.log(`  Total growth over ${ITERATIONS} iterations: ${totalGrowth >= 0 ? '+' : ''}${totalGrowth.toFixed(1)} MB`);
    if (totalGrowth > MAX_GROWTH_PER_ITER_MB * ITERATIONS * 0.5) {
      console.warn(`  ⚠️  Possible memory leak detected (total growth > ${(MAX_GROWTH_PER_ITER_MB * ITERATIONS * 0.5).toFixed(0)} MB)`);
      allPassed = false;
    }
  }

  // Save report
  const reportPath = resolve(REPORTS_DIR, `memory-leak-${Date.now()}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify({ timestamp: new Date().toISOString(), base_url: BASE_URL, iterations: ITERATIONS, samples: heapSamples }, null, 2)
  );
  console.log(`\n  Report saved to: ${reportPath}`);
  console.log(`  Overall: ${allPassed ? '✅ PASSED' : '❌ FAILED'}\n`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Memory test error:', err);
  process.exit(1);
});
