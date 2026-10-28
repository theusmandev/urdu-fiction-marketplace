#!/usr/bin/env node
// scripts/check-terminology.mjs
//
// CI / PRE-COMMIT GATE: User-Facing Terminology Enforcement
//
// Business Rule:
// The words "commission" and "کمیشن" MUST NEVER appear in any user-visible text
// (labels, headings, toasts, tooltips, validation messages, placeholders, badges,
// aria-labels, emails, notifications, legal copy, and error messages).
//
// Instead, use:
// - English: "Platform fee" / "Platform Fee" (or "Fees: None" on checkout order summary)
// - Urdu: "پلیٹ فارم فیس" (with grammatically feminine agreement)
//
// Internal identifiers (database tables, columns, RPC names, route paths, TypeScript types,
// and audit log action_type constants) remain strictly unchanged.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

const violations = [];

// Allowed technical identifiers when present in code/query strings
const ALLOWED_LITERAL_EXACT = new Set([
  'commission_invoices',
  'commission_invoice_lines',
  'commission_payment_reports',
  'commission_invoice_status',
  'default_commission_rate',
  'default_unpaid_commission_limit',
  'custom_commission_rate',
  'unpaid_commission_limit',
  'current_unpaid_commission',
  'is_orders_paused_for_commission',
  'applied_commission_rate',
  'calculated_commission_pkr',
  'commission_rate',
  'platform_commission_pkr',
  'commission_amount_pkr',
  'commission_invoice_id',
  'total_commission_owed_pkr',
  'total_commission_pkr',
  'commission_pkr',
  'unpaid_commission_balance_pkr',
  'unpaid_commission_limit_pkr',
  'customCommissionRate',
  'unpaidCommissionLimit',
  'defaultCommissionRate',
  'defaultUnpaidCommissionLimit',
  'calculate_commission',
  'report_commission_payment',
  'confirm_commission_settlement',
  'record_commission_adjustment',
  'issue_commission_invoice',
  'void_commission_invoice',
  'check_unpaid_commission_threshold',
  'get_writer_commission_summary',
  'preview_commission_invoice',
  'generate_commission_invoice',
  'CONFIRM_COMMISSION_SETTLEMENT',
  'REPORT_COMMISSION_PAYMENT',
  'RECORD_COMMISSION_ADJUSTMENT',
  'ISSUE_COMMISSION_INVOICE',
  'VOID_COMMISSION_INVOICE',
  'commission_unpaid',
  'commission_overdue',
]);

// Allowed route paths and import subpaths
const ALLOWED_PATH_SUBSTRINGS = [
  '/writer/commission',
  '/admin/commission',
  '/lib/commission',
  '../src/lib/commission',
  '../../src/lib/commission',
  '@/lib/commission',
  'browser-image-compression',
];

function getSourceFiles(dir, extensions = ['.ts', '.tsx', '.js', '.mjs']) {
  const files = [];
  if (!dir) return files;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getSourceFiles(fullPath, extensions));
    } else if (extensions.includes(extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// 1. Scan src/ for forbidden user-facing text
// ---------------------------------------------------------------------------
console.log('🔍 Checking user-facing terminology in src/...');

const srcFiles = getSourceFiles(SRC_DIR, ['.ts', '.tsx']);

for (const filePath of srcFiles) {
  const relPath = relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Check Urdu forbidden word "کمیشن" anywhere in src/
    if (trimmed.includes('کمیشن')) {
      violations.push({
        file: relPath,
        line: lineNum,
        content: trimmed,
        reason: 'Forbidden Urdu term "کمیشن" found. Use "پلیٹ فارم فیس".',
      });
      return;
    }

    // Check English "commission" (case-insensitive)
    if (/commission/i.test(trimmed)) {
      // Ignore single-line comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        return;
      }

      // Ignore pure import statements
      if (/^import\s+.*from\s+['"][^'"]*['"]/.test(trimmed)) {
        return;
      }

      // Ignore database query builders (.select, .rpc, .or, .eq, context)
      if (/(?:\.select|\.rpc|\.or|\.eq|\.gt|\.gte|\.order|context:)\s*\(|context:\s*['"]/.test(trimmed)) {
        return;
      }

      // Check if it's in allowed path substrings
      const hasAllowedPath = ALLOWED_PATH_SUBSTRINGS.some(p => trimmed.includes(p));
      if (hasAllowedPath) {
        // If it's an href, push, redirect, or import path without JSX text, it's allowed
        const isPathContext = /(?:href|to|push|replace|redirect|endpoint)\s*[:=]\s*[`'"][^'"]*commission[^'"]*[`'"]/.test(trimmed)
          || /['"][^'"]*\/commission[^'"]*['"]/.test(trimmed);
        if (isPathContext) {
          return;
        }
      }

      // Check JSX text: e.g. >...commission...< (ignoring variables inside {...})
      const textWithoutJsxExpr = trimmed.replace(/\{[^}]*\}/g, '');
      if (/>[^<]*commission[^<]*</i.test(textWithoutJsxExpr)) {
        violations.push({
          file: relPath,
          line: lineNum,
          content: trimmed,
          reason: 'Forbidden term "commission" in user-visible JSX text. Use "Platform fee" or "Fees: None".',
        });
        return;
      }

      // Check user-facing UI attributes & props
      const uiPropMatch = /(?:label|title|placeholder|description|alt|aria-label|heading|helperText|error|message)\s*[:=]\s*[`'"][^'"]*commission[^'"]*[`'"]/i.test(trimmed);
      if (uiPropMatch) {
        violations.push({
          file: relPath,
          line: lineNum,
          content: trimmed,
          reason: 'Forbidden term "commission" in UI prop/attribute. Use "Platform fee".',
        });
        return;
      }

      // Check toast or notification messages
      if (/(?:toast|alert|notify)\.(?:success|error|info|warning)\([^)]*commission[^)]*\)/i.test(trimmed)
        || /(?:toast|alert)\([^)]*commission[^)]*\)/i.test(trimmed)) {
        violations.push({
          file: relPath,
          line: lineNum,
          content: trimmed,
          reason: 'Forbidden term "commission" in toast/alert message. Use "Platform fee".',
        });
        return;
      }

      // Extract string literals to see if there's any user-facing message
      const literalMatches = trimmed.match(/(["'`])(?:(?=(\\?))\2.)*?\1/g) || [];
      for (const literal of literalMatches) {
        const raw = literal.slice(1, -1);
        const textWithoutTemplateExpr = raw.replace(/\$\{[^}]*\}/g, '');
        if (/commission/i.test(textWithoutTemplateExpr)) {
          // If the literal is exactly an allowed identifier, query tag, or route, continue
          if (ALLOWED_LITERAL_EXACT.has(raw)) continue;
          if (ALLOWED_PATH_SUBSTRINGS.some(p => raw.includes(p))) continue;
          if (/^\[(?:Writer|Admin)?Commission[a-zA-Z0-9]*\]$/.test(raw)) continue;
          if (/^(?:asc|desc|nullsfirst|nullslast)$/i.test(raw)) continue;
          if (/commission_invoices!/i.test(raw)) continue;

          // If it contains spaces or sentence words, it is definitely a user-facing string literal
          if (/\s/.test(raw) || /(?:due|rate|limit|settle|accru|invoic|owed|paid)/i.test(raw)) {
            violations.push({
              file: relPath,
              line: lineNum,
              content: trimmed,
              reason: `Forbidden term "commission" in string literal: ${literal}. Use "Platform fee".`,
            });
            return;
          }
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 2. Scan new SQL migrations (0035+) for forbidden user-facing text
// ---------------------------------------------------------------------------
console.log('🔍 Checking user-facing terminology in new SQL migrations (0035+)...');

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of migrationFiles) {
  const numMatch = file.match(/^(\d{4})_/);
  if (!numMatch) continue;
  const num = parseInt(numMatch[1], 10);

  // Scan only new migrations 0035+
  if (num < 35) continue;

  const fullPath = join(MIGRATIONS_DIR, file);
  const relPath = relative(REPO_ROOT, fullPath).replace(/\\/g, '/');
  const content = readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Skip SQL comments
    if (trimmed.startsWith('--')) return;

    // Allow WHERE/REPLACE clauses that match old historical data in the one-off update
    if (/LIKE\s+'%commission%'/i.test(trimmed) || /LIKE\s+'%کمیشن%'/i.test(trimmed) || /replace\(/i.test(trimmed)) {
      return;
    }

    // Check Urdu forbidden word "کمیشن" in user-facing literals
    if (trimmed.includes('کمیشن')) {
      violations.push({
        file: relPath,
        line: lineNum,
        content: trimmed,
        reason: 'Forbidden Urdu term "کمیشن" found in new migration SQL. Use "پلیٹ فارم فیس".',
      });
      return;
    }

    // Check for user-visible RAISE EXCEPTION, notifications, or emails mentioning commission
    if (/RAISE\s+EXCEPTION/i.test(trimmed) && /commission/i.test(trimmed)) {
      violations.push({
        file: relPath,
        line: lineNum,
        content: trimmed,
        reason: 'Forbidden term "commission" in SQL RAISE EXCEPTION message. Use "platform fee".',
      });
      return;
    }

    if (/(?:notification|email_outbox|message|title|subject|body)/i.test(trimmed) && /'[^']*commission[^']*'/i.test(trimmed)) {
      violations.push({
        file: relPath,
        line: lineNum,
        content: trimmed,
        reason: 'Forbidden term "commission" in user-visible notification/email literal. Use "platform fee".',
      });
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Report Results
// ---------------------------------------------------------------------------
if (violations.length > 0) {
  console.error(`\n❌ Found ${violations.length} terminology violation(s):\n`);
  for (const v of violations) {
    console.error(`  - ${v.file}:${v.line}`);
    console.error(`    Line:   ${v.content}`);
    console.error(`    Reason: ${v.reason}\n`);
  }
  process.exit(1);
} else {
  console.log('✅ Terminology check PASSED: Zero forbidden user-facing occurrences of "commission" or "کمیشن".\n');
  process.exit(0);
}
