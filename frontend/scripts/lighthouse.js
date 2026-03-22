#!/usr/bin/env node
/**
 * Phase 18-5: Lighthouse Performance Measurement
 *
 * Usage:
 *   node scripts/lighthouse.js [--url http://localhost:3000] [--pages /,/infra,/ai]
 *
 * Requirements (install with: npm install):
 *   - lighthouse ^12.2.0
 *   - chromium (via playwright: npx playwright install chromium)
 *
 * Thresholds:
 *   - Performance ≥ 80
 *   - Accessibility ≥ 90
 *   - Best Practices ≥ 85
 *   - SEO ≥ 80
 */

import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const REPORTS_DIR = resolve(process.cwd(), '../reports/lighthouse');

// Parse --pages flag or use defaults
const args = process.argv.slice(2);
const pagesIdx = args.indexOf('--pages');
const PAGE_PATHS =
  pagesIdx >= 0
    ? args[pagesIdx + 1].split(',')
    : ['/', '/infra', '/ai', '/services', '/alerts', '/agents'];

const THRESHOLDS = {
  performance: 80,
  accessibility: 90,
  'best-practices': 85,
  seo: 80,
};

async function runLighthouse(url, chrome) {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false,
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      disabled: false,
    },
  });
  return result?.lhr;
}

function formatScore(score) {
  const pct = Math.round((score ?? 0) * 100);
  const icon = pct >= 90 ? '✅' : pct >= 50 ? '⚠️ ' : '❌';
  return `${icon} ${pct}`;
}

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  console.log(`\n🔍 Lighthouse Performance Audit`);
  console.log(`   Base URL : ${BASE_URL}`);
  console.log(`   Pages    : ${PAGE_PATHS.join(', ')}`);
  console.log(`   Reports  : ${REPORTS_DIR}\n`);

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  });

  const summary = [];
  let allPassed = true;

  try {
    for (const path of PAGE_PATHS) {
      const url = `${BASE_URL}${path}`;
      console.log(`  Auditing ${url} ...`);

      const lhr = await runLighthouse(url, chrome);
      if (!lhr) {
        console.error(`  ❌ Failed to get results for ${url}`);
        allPassed = false;
        continue;
      }

      const scores = {
        performance: lhr.categories.performance?.score,
        accessibility: lhr.categories.accessibility?.score,
        'best-practices': lhr.categories['best-practices']?.score,
        seo: lhr.categories.seo?.score,
      };

      const pageName = path === '/' ? 'home' : path.replace(/\//g, '-').slice(1);
      const reportPath = resolve(REPORTS_DIR, `${pageName}.json`);
      writeFileSync(reportPath, JSON.stringify(lhr, null, 2));

      console.log(`\n  📄 ${path}`);
      for (const [cat, score] of Object.entries(scores)) {
        const threshold = THRESHOLDS[cat];
        const pct = Math.round((score ?? 0) * 100);
        const passed = pct >= threshold;
        if (!passed) allPassed = false;
        console.log(
          `     ${cat.padEnd(16)} ${formatScore(score)} / ${threshold} ${passed ? '' : `← FAIL (need ≥${threshold})`}`
        );
      }

      // Key metrics
      const fcp = lhr.audits['first-contentful-paint']?.displayValue;
      const lcp = lhr.audits['largest-contentful-paint']?.displayValue;
      const tbt = lhr.audits['total-blocking-time']?.displayValue;
      const cls = lhr.audits['cumulative-layout-shift']?.displayValue;
      console.log(`\n     FCP: ${fcp}  LCP: ${lcp}  TBT: ${tbt}  CLS: ${cls}`);

      summary.push({ path, scores, pageName });
    }
  } finally {
    await chrome.kill();
  }

  // Write summary
  const summaryPath = resolve(REPORTS_DIR, 'summary.json');
  writeFileSync(summaryPath, JSON.stringify({ timestamp: new Date().toISOString(), base_url: BASE_URL, pages: summary }, null, 2));

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Summary:`);
  for (const { path, scores } of summary) {
    const perf = Math.round((scores.performance ?? 0) * 100);
    const a11y = Math.round((scores.accessibility ?? 0) * 100);
    const icon = perf >= THRESHOLDS.performance && a11y >= THRESHOLDS.accessibility ? '✅' : '❌';
    console.log(`  ${icon} ${path.padEnd(20)} perf=${perf}  a11y=${a11y}`);
  }
  console.log(`\n  Reports saved to: ${REPORTS_DIR}`);
  console.log(`  Overall: ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}\n`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Lighthouse error:', err);
  process.exit(1);
});
