#!/usr/bin/env node
// scripts/check-sql-syntax-constructs.mjs
//
// MECHANICAL GUARD: Fails the build if any .sql file contains SQL syntax
// constructs or special keywords incorrectly schema-qualified as pg_catalog.<name>.
//
// PostgreSQL grammar rule: the following are NOT real functions — they are
// reserved keywords / special syntax constructs that the SQL parser handles
// directly. Writing pg_catalog.coalesce(...) causes plpgsql_check to report
// "function pg_catalog.coalesce(...) does not exist" at parse time because the
// planner resolves them purely as syntax, never as catalog lookups.
//
// FORBIDDEN (syntax constructs / special values — NEVER qualify with pg_catalog.):
//   coalesce, nullif, greatest, least
//   trim         — TRIM is a syntax keyword; btrim/ltrim/rtrim ARE real functions.
//   extract      — keyword form; pg_catalog.date_part IS a real function.
//   overlay, position, cast — SQL syntax forms.
//   current_user, session_user — SQL special keyword values (not functions).
//   current_date, current_time, current_timestamp — SQL special keyword values.
//   localtime, localtimestamp — SQL special keyword values.
//   user         — alias for current_user; write plain current_user.
//
// EXPLICITLY ALLOWED (these ARE real pg_catalog functions — keep qualified):
//   pg_catalog.now(), pg_catalog.btrim(), pg_catalog.ltrim(), pg_catalog.rtrim()
//   pg_catalog.count(), pg_catalog.sum(), pg_catalog.max(), pg_catalog.min()
//   pg_catalog.round(), pg_catalog.abs(), pg_catalog.to_char(), pg_catalog.to_date()
//   pg_catalog.upper(), pg_catalog.lower(), pg_catalog.length()
//   pg_catalog.substring(), pg_catalog.replace(), pg_catalog.substr()
//   pg_catalog.jsonb_build_object(), pg_catalog.jsonb_agg(), all pg_catalog.jsonb_*
//   pg_catalog.date_part(), pg_catalog.age(), pg_catalog.date_trunc()
//   pg_catalog.array_agg(), pg_catalog.string_agg()
//
// SCAN POLICY:
//   Applied migrations (0001-0022) are EXCLUDED — they cannot be changed
//   without a new forward migration. The guard only scans:
//     - supabase/migrations/0023_*.sql and later
//     - supabase/tests/**/*.sql
//   SQL line comments (-- ...) are stripped before matching so in-comment
//   documentation of the rule does not trigger false positives.
//
// Usage:
//   node scripts/check-sql-syntax-constructs.mjs
//   npm run check:sql

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// ---------------------------------------------------------------------------
// FORBIDDEN patterns — matched case-insensitively against non-comment SQL text
// ---------------------------------------------------------------------------
const FORBIDDEN = [
  { pattern: /\bpg_catalog\.coalesce\s*\(/gi,       name: 'pg_catalog.coalesce',       reason: 'COALESCE is a SQL syntax construct, not a pg_catalog function — write: coalesce(...)' },
  { pattern: /\bpg_catalog\.nullif\s*\(/gi,         name: 'pg_catalog.nullif',         reason: 'NULLIF is a SQL syntax construct, not a pg_catalog function — write: nullif(...)' },
  { pattern: /\bpg_catalog\.greatest\s*\(/gi,       name: 'pg_catalog.greatest',       reason: 'GREATEST is a SQL syntax construct, not a pg_catalog function — write: greatest(...)' },
  { pattern: /\bpg_catalog\.least\s*\(/gi,          name: 'pg_catalog.least',          reason: 'LEAST is a SQL syntax construct, not a pg_catalog function — write: least(...)' },
  { pattern: /\bpg_catalog\.trim\s*\(/gi,           name: 'pg_catalog.trim',           reason: 'pg_catalog.trim does not exist; use pg_catalog.btrim(text) or unqualified btrim(text)' },
  { pattern: /\bpg_catalog\.extract\s*\(/gi,        name: 'pg_catalog.extract',        reason: 'EXTRACT is a SQL syntax construct; use pg_catalog.date_part() instead' },
  { pattern: /\bpg_catalog\.overlay\s*\(/gi,        name: 'pg_catalog.overlay',        reason: 'OVERLAY is a SQL syntax construct — never qualify with pg_catalog.' },
  { pattern: /\bpg_catalog\.position\s*\(/gi,       name: 'pg_catalog.position',       reason: 'POSITION is a SQL syntax construct — never qualify with pg_catalog.' },
  { pattern: /\bpg_catalog\.cast\s*\(/gi,           name: 'pg_catalog.cast',           reason: 'CAST is a SQL syntax construct — use ::type or CAST(x AS type) without schema' },
  { pattern: /\bpg_catalog\.current_user\b/gi,      name: 'pg_catalog.current_user',   reason: 'current_user is a SQL special keyword value, not a function — write plain: current_user' },
  { pattern: /\bpg_catalog\.session_user\b/gi,      name: 'pg_catalog.session_user',   reason: 'session_user is a SQL special keyword value — write plain: session_user' },
  { pattern: /\bpg_catalog\.current_date\b/gi,      name: 'pg_catalog.current_date',   reason: 'current_date is a SQL special keyword value — write plain: current_date' },
  { pattern: /\bpg_catalog\.current_time\b/gi,      name: 'pg_catalog.current_time',   reason: 'current_time is a SQL special keyword value — write plain: current_time' },
  { pattern: /\bpg_catalog\.current_timestamp\b/gi, name: 'pg_catalog.current_timestamp', reason: 'current_timestamp is a SQL special keyword value — write plain: current_timestamp' },
  { pattern: /\bpg_catalog\.localtime\b/gi,         name: 'pg_catalog.localtime',      reason: 'localtime is a SQL special keyword value — write plain: localtime' },
  { pattern: /\bpg_catalog\.localtimestamp\b/gi,    name: 'pg_catalog.localtimestamp', reason: 'localtimestamp is a SQL special keyword value — write plain: localtimestamp' },
  { pattern: /\bpg_catalog\.user\b/gi,              name: 'pg_catalog.user',           reason: '"user" is an alias for current_user — write plain: current_user' },
];

// ---------------------------------------------------------------------------
// Scan policy: skip applied migrations 0001-0022 (already in database)
// ---------------------------------------------------------------------------
const MAX_APPLIED_MIGRATION = 22;

function isAppliedMigration(filename) {
  const m = /^0*(\d+)_/.exec(filename);
  if (!m) return false;
  return parseInt(m[1], 10) <= MAX_APPLIED_MIGRATION;
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------
function walkSql(dir, results, skipped) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '.temp' || entry === 'node_modules') continue;
      walkSql(full, results, skipped);
    } else if (st.isFile() && extname(entry) === '.sql') {
      if (isAppliedMigration(basename(full))) {
        skipped.push(full);
      } else {
        results.push(full);
      }
    }
  }
}

const files = [];
const skippedFiles = [];
walkSql(join(REPO_ROOT, 'supabase'), files, skippedFiles);

// ---------------------------------------------------------------------------
// Strip SQL line comments before matching
// (preserves character offsets — whitespace-pads removed comment text)
// ---------------------------------------------------------------------------
function stripLineComments(text) {
  return text.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------
const violations = [];

for (const filePath of files) {
  const rel = relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const raw = readFileSync(filePath, 'utf8');
  const stripped = stripLineComments(raw);
  const rawLines = raw.split('\n');

  for (const { pattern, name, reason } of FORBIDDEN) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(stripped)) !== null) {
      const before = stripped.slice(0, match.index);
      const lineNum = before.split('\n').length;
      const col = match.index - before.lastIndexOf('\n');
      const lineText = rawLines[lineNum - 1]?.trim() ?? '';
      violations.push({ file: rel, line: lineNum, col, name, reason, text: lineText });
      if (match.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (violations.length === 0) {
  console.log(`✅  check:sql PASSED — No forbidden pg_catalog.<construct> qualifications found.`);
  console.log(`   Scanned : ${files.length} SQL file(s) (migrations 0023+ and all test files)`);
  console.log(`   Skipped : ${skippedFiles.length} applied migration(s) (0001-${String(MAX_APPLIED_MIGRATION).padStart(4,'0')}) — fix in a new migration`);
  process.exit(0);
} else {
  console.error(`\n❌  check:sql FAILED — Found ${violations.length} forbidden pg_catalog.<construct> qualification(s):\n`);
  console.error(`   Scanned : ${files.length} SQL file(s)`);
  console.error(`   Skipped : ${skippedFiles.length} applied migration(s)\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}:${v.col}  [${v.name}]`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.reason}`);
    console.error('');
  }
  console.error('Rule: SQL syntax constructs and special keyword values must NEVER be schema-qualified.');
  console.error('      Real pg_catalog functions (btrim, ltrim, rtrim, now, count, jsonb_*, substr…) remain qualified.');
  process.exit(1);
}
