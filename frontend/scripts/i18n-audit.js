#!/usr/bin/env node
/**
 * Phase 18-7: i18n Audit Script
 *
 * Checks:
 *   1. Hardcoded Korean strings in TSX/TS source files (non-i18n keys)
 *   2. Missing translation keys across locales (ko / en / ja)
 *   3. Keys defined in one locale but missing in others
 *   4. Translation coverage percentage per locale
 *
 * Usage:
 *   node scripts/i18n-audit.js [--src src] [--i18n src/lib/i18n.ts]
 *
 * Exit code 0 = all checks passed, 1 = issues found
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, extname } from 'path';

const SRC_DIR = resolve(process.cwd(), 'src');
const I18N_FILE = resolve(process.cwd(), 'src/lib/i18n.ts');
const LOCALES = ['ko', 'en', 'ja'];

// Korean Unicode range: \uAC00-\uD7AF (Hangul syllables) + \u1100-\u11FF (Jamo)
const KOREAN_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF]/;

// Files/dirs to skip
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', 'test', 'snapshots']);
const SKIP_FILES = new Set(['i18n.ts', 'i18n.js', 'setup.ts']);

// Patterns that are okay to have Korean in (test data, comments, etc.)
const SKIP_CONTEXTS = [
  /\/\/.*/,          // Line comments
  /\/\*[\s\S]*?\*\//, // Block comments
  /`[^`]*`/,         // Template literals in demo-data
];

function walkDir(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, results);
    } else if (['.ts', '.tsx'].includes(extname(entry)) && !SKIP_FILES.has(entry)) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractTranslationKeys(i18nContent) {
  // Parse locale → keys from the translations object in i18n.ts
  const localeBlocks = {};
  const localeBlockRegex = /(\w+):\s*\{([^}]+)\}/g;
  let match;
  while ((match = localeBlockRegex.exec(i18nContent)) !== null) {
    const locale = match[1];
    if (!LOCALES.includes(locale)) continue;
    const blockContent = match[2];
    const keyRegex = /'([^']+)':\s*'[^']*'/g;
    const keys = new Set();
    let keyMatch;
    while ((keyMatch = keyRegex.exec(blockContent)) !== null) {
      keys.add(keyMatch[1]);
    }
    localeBlocks[locale] = keys;
  }
  return localeBlocks;
}

function findHardcodedKorean(filePath, content) {
  const issues = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Skip comment lines
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

    // Skip lines in demo-data.ts (intentional Korean)
    if (filePath.includes('demo-data')) return;

    // Skip lines that use t() translation function
    if (line.includes('t(') || line.includes("t('") || line.includes('t("')) return;

    // Skip lines in i18n files
    if (filePath.includes('i18n')) return;

    if (KOREAN_REGEX.test(line)) {
      // Check if Korean is inside a string that's an i18n key lookup
      // Allow: console.log, throw new Error (for error messages in non-UI code)
      if (!line.includes('console.') && !line.includes('throw') && !line.includes('// ')) {
        issues.push({
          line: idx + 1,
          text: line.trim().substring(0, 80),
        });
      }
    }
  });

  return issues;
}

function main() {
  console.log('\n🌐 i18n Audit');
  console.log(`   Source : ${SRC_DIR}`);
  console.log(`   i18n   : ${I18N_FILE}`);
  console.log(`   Locales: ${LOCALES.join(', ')}\n`);

  let exitCode = 0;

  // ── 1. Parse translation keys ──────────────────────────────────
  const i18nContent = readFileSync(I18N_FILE, 'utf-8');
  const localeKeys = extractTranslationKeys(i18nContent);

  // Find all unique keys across all locales
  const allKeys = new Set();
  for (const keys of Object.values(localeKeys)) {
    for (const k of keys) allKeys.add(k);
  }

  console.log(`  📦 Total unique keys: ${allKeys.size}`);
  for (const locale of LOCALES) {
    const keys = localeKeys[locale] ?? new Set();
    const coverage = allKeys.size > 0 ? ((keys.size / allKeys.size) * 100).toFixed(1) : '0.0';
    const icon = parseFloat(coverage) >= 100 ? '✅' : parseFloat(coverage) >= 90 ? '⚠️ ' : '❌';
    console.log(`  ${icon} ${locale.padEnd(4)} : ${keys.size}/${allKeys.size} keys (${coverage}%)`);
  }

  // ── 2. Missing keys per locale ─────────────────────────────────
  let missingTotal = 0;
  console.log('\n  🔍 Missing keys:');
  for (const locale of LOCALES) {
    const keys = localeKeys[locale] ?? new Set();
    const missing = [...allKeys].filter((k) => !keys.has(k));
    if (missing.length > 0) {
      console.log(`\n  [${locale}] Missing ${missing.length} key(s):`);
      for (const key of missing.slice(0, 20)) {
        console.log(`    - ${key}`);
      }
      if (missing.length > 20) {
        console.log(`    ... and ${missing.length - 20} more`);
      }
      missingTotal += missing.length;
      if (locale !== 'ja') exitCode = 1; // ko and en must be 100%
    } else {
      console.log(`  [${locale}] ✅ No missing keys`);
    }
  }

  // ── 3. Hardcoded Korean strings in source ──────────────────────
  const sourceFiles = walkDir(SRC_DIR);
  const hardcodedIssues = [];

  for (const filePath of sourceFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const issues = findHardcodedKorean(filePath, content);
    if (issues.length > 0) {
      hardcodedIssues.push({ file: filePath.replace(SRC_DIR, ''), issues });
    }
  }

  console.log(`\n  🔤 Hardcoded Korean strings in source files:`);
  if (hardcodedIssues.length === 0) {
    console.log('  ✅ None found');
  } else {
    for (const { file, issues } of hardcodedIssues) {
      console.log(`\n  ${file}:`);
      for (const { line, text } of issues.slice(0, 5)) {
        console.log(`    Line ${line}: ${text}`);
      }
    }
    const total = hardcodedIssues.reduce((s, f) => s + f.issues.length, 0);
    console.log(`\n  ⚠️  ${total} potential hardcoded string(s) in ${hardcodedIssues.length} file(s)`);
    // Warning only — don't fail CI for this (some intentional Korean in demo data)
  }

  // ── 4. Summary ─────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Coverage: ${allKeys.size > 0 ? (((allKeys.size - missingTotal / LOCALES.length) / allKeys.size) * 100).toFixed(1) : 100}%`);
  console.log(`  Missing keys total: ${missingTotal}`);
  console.log(`  Hardcoded strings : ${hardcodedIssues.reduce((s, f) => s + f.issues.length, 0)}`);
  console.log(`  Overall: ${exitCode === 0 ? '✅ PASSED' : '❌ FAILED (ko/en must be 100%)'}\n`);

  process.exit(exitCode);
}

main();
