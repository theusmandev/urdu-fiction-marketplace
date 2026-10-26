#!/usr/bin/env node
// scripts/check-sql-syntax-constructs.mjs
//
// MECHANICAL GUARDS:
// 1. Fails if any .sql file contains SQL syntax constructs or special keywords
//    incorrectly schema-qualified as pg_catalog.<name>.
// 2. Fails if any .sql file contains format(...) with format specifiers other than
//    %s, %I, %L, %%, or valid width/position forms (e.g. %1$s, %-10s).
//    PostgreSQL format() does NOT support printf specifiers like %.2f, %d, %f, %i.
// 3. Fails if any test fixture INSERT is missing required NOT NULL columns.
// 4. Fails if any migration creating a trigger function omits REVOKE EXECUTE.
// 5. Fails if any PL/pgSQL block (DO $$ ... $$ or CREATE FUNCTION body) uses an
//    undeclared variable as an INTO target, := target, or FOR loop variable.
//
// SCAN POLICY:
//   - All migrations (0001+) and all test files (supabase/tests/**/*.sql) are scanned.
//   - Known historical violations in applied migrations (0001-0022) must be explicitly
//     documented in HISTORICAL_EXCEPTIONS with who fixes them.
//   - Applied migration undeclared variable findings are reported rather than edited.
//   - SQL line comments (-- ...) are stripped before matching.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// ---------------------------------------------------------------------------
// FORBIDDEN SQL syntax constructs — matched case-insensitively
// ---------------------------------------------------------------------------
const FORBIDDEN_CONSTRUCTS = [
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
// TEST FIXTURE VALIDATION: Required NOT NULL columns (no defaults) for key tables
// Scanned across all test files under supabase/tests/
// ---------------------------------------------------------------------------
const TEST_REQUIRED_COLUMNS = {
  'orders': [
    'order_number',
    'reader_id',
    'writer_id',
    'novel_id',
    'novel_title_snapshot',
    'amount_pkr',
    'applied_commission_rate',
    'calculated_commission_pkr',
    'calculated_writer_share_pkr',
    'status'
  ],
  'payment_submissions': [
    'order_id',
    'reader_id',
    'writer_id',
    'transaction_reference_tid',
    'screenshot_url'
  ],
  'purchase_entitlements': [
    'reader_id',
    'novel_id'
  ],
  'sales_ledger': [
    'order_id',
    'writer_id',
    'reader_id',
    'novel_id',
    'entry_type',
    'gross_amount_pkr',
    'commission_rate',
    'platform_commission_pkr',
    'writer_net_pkr'
  ],
  'commission_invoices': [
    'writer_id',
    'invoice_number',
    'period_start',
    'period_end'
  ]
};

// ---------------------------------------------------------------------------
// Documented historical exception list
// Applied migrations cannot be edited in place. Any historical construct violation
// must be listed here with an explicit reference to the forward migration that fixes it.
// ---------------------------------------------------------------------------
const HISTORICAL_EXCEPTIONS = {
  'supabase/migrations/0022_protection_triggers_and_search_path_lockdown.sql': {
    reason: 'Initial search_path lockdown inadvertently schema-qualified SQL syntax constructs (51 occurrences); superseded and fully corrected by migration 0023_fix_sql_construct_qualification_regression.sql',
    maxAllowedViolations: 51
  }
};

// ---------------------------------------------------------------------------
// Historical exceptions for trigger function privilege revokes (applied migrations 0001-0025)
// Applied migrations cannot be edited in place. Any historical migration defining
// trigger functions without REVOKE EXECUTE is documented here; historical triggers
// were revoked collectively by migrations 0021 and 0026.
// ---------------------------------------------------------------------------
const HISTORICAL_TRIGGER_REVOKE_EXCEPTIONS = {
  'supabase/migrations/0003_triggers_and_rpc_functions.sql': 'Initial triggers; revoked retroactively in 0021',
  'supabase/migrations/0009_order_flow_fixes.sql': 'trg_protect_writer_profile_columns; revoked retroactively in 0021',
  'supabase/migrations/0014_min_novel_price.sql': 'Novel price trigger; revoked retroactively in 0021',
  'supabase/migrations/0020_database_reconciliation_and_immutability_hardening.sql': 'Reconciliation triggers; revoked in 0021 and 0026',
  'supabase/migrations/0025_commission_settlement_and_audit_hardening.sql': 'trg_commission_invoices_updated_at; revoked retroactively in 0026'
};

// ---------------------------------------------------------------------------
// File collection: collect all .sql files in supabase/ (migrations + tests)
// ---------------------------------------------------------------------------
function walkSql(dir, results) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '.temp' || entry === 'node_modules') continue;
      walkSql(full, results);
    } else if (st.isFile() && extname(entry) === '.sql') {
      results.push(full);
    }
  }
}

const files = [];
walkSql(join(REPO_ROOT, 'supabase'), files);
files.sort();

// ---------------------------------------------------------------------------
// Strip SQL line comments (-- ...) while preserving character indices / line breaks
// ---------------------------------------------------------------------------
function stripLineComments(text) {
  return text.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
}

// ---------------------------------------------------------------------------
// PL/pgSQL parsing helpers for Guard 5
// ---------------------------------------------------------------------------
const BUILTIN_PLPGSQL_VARS = new Set([
  'new', 'old', 'tg_name', 'tg_when', 'tg_level', 'tg_op',
  'tg_relid', 'tg_relname', 'tg_table_name', 'tg_table_schema',
  'tg_nargs', 'tg_argv', 'found', 'sqlerrm', 'sqlstate'
]);

function maskCommentsAndStrings(code) {
  let res = code.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
  res = res.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  res = res.replace(/'(?:[^']|'')*'/g, m => m.replace(/[^\n]/g, ' '));
  return res;
}

function extractParams(paramStr) {
  const params = new Set();
  if (!paramStr) return params;
  const clean = paramStr.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const parts = clean.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    let idx = 0;
    if (['in', 'out', 'inout', 'variadic'].includes(tokens[0]?.toLowerCase())) {
      idx = 1;
    }
    if (tokens[idx]) {
      const name = tokens[idx].toLowerCase().replace(/["'`]/g, '');
      params.add(name);
    }
  }
  return params;
}

function extractDeclaredVars(declareBlock) {
  const declared = new Set();
  if (!declareBlock) return declared;
  const statements = declareBlock.split(';');
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (m) {
      const name = m[1].toLowerCase();
      if (!['declare', 'begin', 'cursor'].includes(name)) {
        declared.add(name);
      }
    }
  }
  return declared;
}

function computeParenDepths(str) {
  const depths = new Int32Array(str.length);
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') {
      depth++;
      depths[i] = depth;
    } else if (ch === ')') {
      depths[i] = depth;
      if (depth > 0) depth--;
    } else {
      depths[i] = depth;
    }
  }
  return depths;
}

// ---------------------------------------------------------------------------
// Scan for violations
// ---------------------------------------------------------------------------
const constructViolations = [];
const formatViolations = [];
const fixtureViolations = [];
const triggerPrivilegeViolations = [];
const undeclaredVariableViolations = [];
const historicalUndeclaredViolations = [];
const historicalAllowedCounts = {};

for (const filePath of files) {
  const rel = relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const raw = readFileSync(filePath, 'utf8');
  const stripped = stripLineComments(raw);
  const rawLines = raw.split('\n');

  // 1. Scan for forbidden pg_catalog.<construct>
  const isHistorical = Boolean(HISTORICAL_EXCEPTIONS[rel]);

  for (const { pattern, name, reason } of FORBIDDEN_CONSTRUCTS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(stripped)) !== null) {
      const before = stripped.slice(0, match.index);
      const lineNum = before.split('\n').length;
      const col = match.index - before.lastIndexOf('\n');
      const lineText = rawLines[lineNum - 1]?.trim() ?? '';

      if (isHistorical) {
        historicalAllowedCounts[rel] = (historicalAllowedCounts[rel] || 0) + 1;
      } else {
        constructViolations.push({ file: rel, line: lineNum, col, name, reason, text: lineText });
      }
      if (match.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }

  // 2. Scan for invalid format(...) placeholders
  // PostgreSQL format() specification:
  // %[position][flags][width]type
  // Valid types: 's', 'I', 'L', '%'
  // Precision (e.g. .2) is NOT supported! Types like d, f, i, u, x are NOT supported!
  const formatRegex = /\bformat\s*\(\s*('([^']|'')*')/gi;
  let fMatch;
  while ((fMatch = formatRegex.exec(stripped)) !== null) {
    const tmpl = fMatch[1];
    const tmplOffset = fMatch.index;

    // Scan placeholders within tmpl
    const pRegex = /%([0-9]+\$)?(-?[0-9]+)?(\.[0-9]+)?([a-zA-Z%])/g;
    let pm;
    while ((pm = pRegex.exec(tmpl)) !== null) {
      const fullPlaceholder = pm[0];
      const precision = pm[3];
      const typeChar = pm[4];

      if (precision !== undefined || !['s', 'I', 'L', '%'].includes(typeChar)) {
        const before = stripped.slice(0, tmplOffset + pm.index);
        const lineNum = before.split('\n').length;
        const col = (tmplOffset + pm.index) - before.lastIndexOf('\n');
        const lineText = rawLines[lineNum - 1]?.trim() ?? '';
        formatViolations.push({
          file: rel,
          line: lineNum,
          col,
          placeholder: fullPlaceholder,
          reason: `PostgreSQL format() only supports %s, %I, %L, %% (no printf specifiers such as "${fullPlaceholder}"). Use %s with explicit casting/rounding (e.g. to_char() or ::numeric(12,2)::text).`,
          text: lineText
        });
      }
    }
  }

  // 3. For test files in supabase/tests/, scan for missing required NOT NULL columns in INSERTs
  if (rel.startsWith('supabase/tests/')) {
    const insertRegex = /\binsert\s+into\s+(?:public\.)?([a-z_]+)\s*\(([^)]+)\)/gi;
    let iMatch;
    while ((iMatch = insertRegex.exec(stripped)) !== null) {
      const tableName = iMatch[1].toLowerCase();
      const required = TEST_REQUIRED_COLUMNS[tableName];
      if (required) {
        const cols = iMatch[2].split(',').map(c => c.trim().toLowerCase().replace(/["'`]/g, ''));
        const missing = required.filter(col => !cols.includes(col));
        if (missing.length > 0) {
          const before = stripped.slice(0, iMatch.index);
          const lineNum = before.split('\n').length;
          const col = iMatch.index - before.lastIndexOf('\n');
          const lineText = rawLines[lineNum - 1]?.trim() ?? '';
          fixtureViolations.push({
            file: rel,
            line: lineNum,
            col,
            table: tableName,
            missing,
            reason: `Test fixture INSERT INTO ${tableName} is missing mandatory NOT NULL column(s): [${missing.join(', ')}]. See docs/SCHEMA_SNAPSHOT.md.`,
            text: lineText
          });
        }
      }
    }

    const positionalRegex = /\binsert\s+into\s+(?:public\.)?([a-z_]+)\s+values\b/gi;
    let pMatch;
    while ((pMatch = positionalRegex.exec(stripped)) !== null) {
      const tableName = pMatch[1].toLowerCase();
      if (TEST_REQUIRED_COLUMNS[tableName]) {
        const before = stripped.slice(0, pMatch.index);
        const lineNum = before.split('\n').length;
        const col = pMatch.index - before.lastIndexOf('\n');
        const lineText = rawLines[lineNum - 1]?.trim() ?? '';
        fixtureViolations.push({
          file: rel,
          line: lineNum,
          col,
          table: tableName,
          missing: TEST_REQUIRED_COLUMNS[tableName],
          reason: `Positional INSERT INTO ${tableName} without column list is forbidden in tests. List all NOT NULL columns explicitly.`,
          text: lineText
        });
      }
    }
  }

  // 4. For migrations in supabase/migrations/, verify that any migration defining a trigger function
  //    (CREATE FUNCTION ... RETURNS trigger) also contains an explicit REVOKE EXECUTE ON FUNCTION
  //    or the dynamic trigger privilege revocation loop over pg_proc.
  if (rel.startsWith('supabase/migrations/')) {
    const triggerFnRegex = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s*\([^)]*\)\s+returns\s+trigger\b/gi;
    let tMatch;
    const triggerFns = [];
    while ((tMatch = triggerFnRegex.exec(stripped)) !== null) {
      triggerFns.push(tMatch[1]);
    }

    if (triggerFns.length > 0) {
      const hasRevoke = /\brevoke\s+execute\s+on\s+function\b/i.test(stripped) ||
                        /\bprorettype\s*=\s*'trigger'::regtype\b/i.test(stripped);
      if (!hasRevoke) {
        if (HISTORICAL_TRIGGER_REVOKE_EXCEPTIONS[rel]) {
          // Documented historical exception in applied migration (0001-0025)
        } else {
          triggerPrivilegeViolations.push({
            file: rel,
            functions: triggerFns,
            reason: `Migration ${rel} creates trigger function(s) [${triggerFns.join(', ')}] without revoking EXECUTE privileges. Every migration creating a trigger function must include REVOKE EXECUTE ON FUNCTION <name> FROM PUBLIC, anon, authenticated (or the pg_proc dynamic trigger revocation loop).`
          });
        }
      }
    }
  }

  // 5. Scan PL/pgSQL blocks for undeclared variable targets (:=, INTO, FOR)
  const isAppliedMigration = (() => {
    const m = rel.match(/^supabase\/migrations\/(\d+)_/);
    return m ? parseInt(m[1], 10) <= 22 : false;
  })();

  const maskedFull = maskCommentsAndStrings(raw);
  const blockRegex = /(?:(\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)[\s\S]*?\bAS\s+(\$[a-zA-Z0-9_]*\$))|(\bDO\s+(?:LANGUAGE\s+[a-zA-Z0-9_]+\s+)?(\$[a-zA-Z0-9_]*\$)))/gi;

  let bMatch;
  while ((bMatch = blockRegex.exec(raw)) !== null) {
    const isFunction = Boolean(bMatch[1]);
    const fnName = isFunction ? bMatch[2] : 'DO_BLOCK';
    const paramStr = isFunction ? bMatch[3] : '';
    const tag = isFunction ? bMatch[4] : bMatch[6];
    const startIndex = bMatch.index + bMatch[0].length;

    const endTagIndex = raw.indexOf(tag, startIndex);
    if (endTagIndex === -1) continue;

    const maskedBody = maskedFull.slice(startIndex, endTagIndex);

    // Skip if LANGUAGE sql
    const context = raw.slice(Math.max(0, bMatch.index - 50), Math.min(raw.length, endTagIndex + tag.length + 50));
    if (/\bLANGUAGE\s+sql\b/i.test(context)) {
      continue;
    }

    const declared = new Set(BUILTIN_PLPGSQL_VARS);
    if (isFunction) {
      for (const p of extractParams(paramStr)) declared.add(p);
    }

    const declareMatch = maskedBody.match(/\bDECLARE\b([\s\S]*?)\bBEGIN\b/i);
    if (declareMatch) {
      for (const v of extractDeclaredVars(declareMatch[1])) declared.add(v);
    }

    const forRegex = /\bFOR\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+\bIN\b/gi;
    let forMatch;
    const loopVars = new Set();
    while ((forMatch = forRegex.exec(maskedBody)) !== null) {
      loopVars.add(forMatch[1].toLowerCase());
    }

    const inScope = new Set([...declared, ...loopVars]);
    const parenDepths = computeParenDepths(maskedBody);

    // Check := targets
    const assignRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z0-9_]+|\[[^\]]+\])*\s*:=/g;
    let aMatch;
    while ((aMatch = assignRegex.exec(maskedBody)) !== null) {
      const targetVar = aMatch[1].toLowerCase();
      // Skip if in DECLARE section
      if (declareMatch && aMatch.index < declareMatch.index + declareMatch[0].length) {
        continue;
      }
      // Skip named parameters inside function calls: func(param := val)
      if (parenDepths[aMatch.index] > 0) {
        continue;
      }
      if (!inScope.has(targetVar)) {
        const offset = startIndex + aMatch.index;
        const before = raw.slice(0, offset);
        const lineNum = before.split('\n').length;
        const col = offset - before.lastIndexOf('\n');
        const lineText = rawLines[lineNum - 1]?.trim() ?? '';
        const violation = {
          file: rel,
          line: lineNum,
          col,
          block: fnName,
          target: targetVar,
          kind: ':=',
          reason: `Target "${targetVar}" assigned via := is not declared in the DECLARE list of ${fnName} (or in scope).`,
          text: lineText
        };
        if (isAppliedMigration) {
          historicalUndeclaredViolations.push(violation);
        } else {
          undeclaredVariableViolations.push(violation);
        }
      }
    }

    // Check INTO targets
    const intoRegex = /\bINTO\s+(?:STRICT\s+)?([^;]+?)(?:\bFROM\b|\bWHERE\b|\bRETURNING\b|;|\bLOOP\b|\bHAVING\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|\bWINDOW\b)/gi;
    let iMatch;
    while ((iMatch = intoRegex.exec(maskedBody)) !== null) {
      const beforeInto = maskedBody.slice(Math.max(0, iMatch.index - 30), iMatch.index);
      if (/\bINSERT\s+$/i.test(beforeInto)) continue;
      const targetText = iMatch[1].trim();
      if (/^(?:TEMP|TEMPORARY)\s+TABLE\b/i.test(targetText)) continue;

      const targets = targetText.split(',');
      for (const t of targets) {
        const trimmed = t.trim();
        if (!trimmed) continue;
        const varMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (varMatch) {
          const varName = varMatch[1].toLowerCase();
          if (!inScope.has(varName)) {
            const offset = startIndex + iMatch.index;
            const before = raw.slice(0, offset);
            const lineNum = before.split('\n').length;
            const col = offset - before.lastIndexOf('\n');
            const lineText = rawLines[lineNum - 1]?.trim() ?? '';
            const violation = {
              file: rel,
              line: lineNum,
              col,
              block: fnName,
              target: varName,
              kind: 'INTO',
              reason: `Target "${varName}" in INTO clause is not declared in the DECLARE list of ${fnName} (or in scope).`,
              text: lineText
            };
            if (isAppliedMigration) {
              historicalUndeclaredViolations.push(violation);
            } else {
              undeclaredVariableViolations.push(violation);
            }
          }
        }
      }
    }
  }
}

// Check if any historical file exceeded its allowed count
for (const [file, exp] of Object.entries(HISTORICAL_EXCEPTIONS)) {
  const count = historicalAllowedCounts[file] || 0;
  if (count > exp.maxAllowedViolations) {
    constructViolations.push({
      file,
      line: 1,
      col: 1,
      name: 'Historical threshold exceeded',
      reason: `Found ${count} violations, expected at most ${exp.maxAllowedViolations}. ${exp.reason}`,
      text: ''
    });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const totalViolations = constructViolations.length + formatViolations.length + fixtureViolations.length + triggerPrivilegeViolations.length + undeclaredVariableViolations.length;

if (historicalUndeclaredViolations.length > 0) {
  console.log(`\n⚠️  Found ${historicalUndeclaredViolations.length} undeclared variable finding(s) in applied migrations (reported only, not editable):`);
  for (const v of historicalUndeclaredViolations) {
    console.log(`  ${v.file}:${v.line}:${v.col}  [${v.block}] Undeclared ${v.kind} target: "${v.target}"`);
    console.log(`    ${v.text}`);
    console.log(`    → ${v.reason}\n`);
  }
}

if (totalViolations === 0) {
  console.log(`✅  check:sql PASSED — No forbidden pg_catalog.<construct>, invalid format() specifiers, trigger privilege leaks, test fixture NOT NULL omissions, or undeclared PL/pgSQL variable targets found.`);
  console.log(`   Scanned : ${files.length} SQL file(s) (all migrations & test suites)`);
  for (const file of Object.keys(HISTORICAL_EXCEPTIONS)) {
    console.log(`   Documented historical exception: ${file} (${historicalAllowedCounts[file] || 0} occurrences — fixed in 0023)`);
  }
  for (const [file, reason] of Object.entries(HISTORICAL_TRIGGER_REVOKE_EXCEPTIONS)) {
    console.log(`   Documented historical trigger exception: ${file} (${reason})`);
  }
  process.exit(0);
} else {
  console.error(`\n❌  check:sql FAILED — Found ${totalViolations} SQL syntax / format / fixture / trigger / undeclared-variable violation(s):\n`);

  if (constructViolations.length > 0) {
    console.error(`--- Schema Qualification Violations (${constructViolations.length}) ---`);
    for (const v of constructViolations) {
      console.error(`  ${v.file}:${v.line}:${v.col}  [${v.name}]`);
      console.error(`    ${v.text}`);
      console.error(`    → ${v.reason}\n`);
    }
  }

  if (formatViolations.length > 0) {
    console.error(`--- Invalid format() Placeholders (${formatViolations.length}) ---`);
    for (const v of formatViolations) {
      console.error(`  ${v.file}:${v.line}:${v.col}  [Placeholder: "${v.placeholder}"]`);
      console.error(`    ${v.text}`);
      console.error(`    → ${v.reason}\n`);
    }
  }

  if (fixtureViolations.length > 0) {
    console.error(`--- Test Fixture Missing NOT NULL Columns (${fixtureViolations.length}) ---`);
    for (const v of fixtureViolations) {
      console.error(`  ${v.file}:${v.line}:${v.col}  [Table: ${v.table}]`);
      console.error(`    ${v.text}`);
      console.error(`    → ${v.reason}\n`);
    }
  }

  if (triggerPrivilegeViolations.length > 0) {
    console.error(`--- Trigger Function Privilege Revoke Omissions (${triggerPrivilegeViolations.length}) ---`);
    for (const v of triggerPrivilegeViolations) {
      console.error(`  ${v.file}  [Functions: ${v.functions.join(', ')}]`);
      console.error(`    → ${v.reason}\n`);
    }
  }

  if (undeclaredVariableViolations.length > 0) {
    console.error(`--- Undeclared PL/pgSQL Variables (${undeclaredVariableViolations.length}) ---`);
    for (const v of undeclaredVariableViolations) {
      console.error(`  ${v.file}:${v.line}:${v.col}  [${v.block}] Undeclared ${v.kind} target: "${v.target}"`);
      console.error(`    ${v.text}`);
      console.error(`    → ${v.reason}\n`);
    }
  }

  console.error('Rules:');
  console.error('  1. SQL syntax constructs (coalesce, nullif, greatest, least, trim, current_user, etc.) must NEVER be schema-qualified.');
  console.error('  2. PostgreSQL format() only supports %s, %I, %L, %%, and positional/width modifiers. Format numbers with %s and to_char() / explicit casts.');
  console.error('  3. In test fixtures (supabase/tests/), INSERT statements on orders, payment_submissions, purchase_entitlements, sales_ledger, and commission_invoices must supply all mandatory NOT NULL columns without default.');
  console.error('  4. Any migration creating a trigger function (RETURNS trigger) must contain REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated (or the pg_proc dynamic trigger revocation loop).');
  console.error('  5. Every identifier used as an INTO target, := target, or FOR loop variable in PL/pgSQL must be declared in the block DECLARE list (or function parameter / loop variable).');
  process.exit(1);
}
