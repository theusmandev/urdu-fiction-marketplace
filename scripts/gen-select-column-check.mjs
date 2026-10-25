#!/usr/bin/env node
// scripts/gen-select-column-check.mjs
//
// Extracts every table and column named in .from('t').select('...') and chained filter calls
// across src/ via TypeScript AST, checks for sensitive exposures, and generates
// supabase/tests/16_frontend_columns_check.sql.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const OUTPUT_SQL_PATH = join(REPO_ROOT, 'supabase', 'tests', '16_frontend_columns_check.sql');

function getSourceFiles(dir) {
  const files = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
    } else if (['.ts', '.tsx'].includes(extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
}

// Sensitive columns that hold personal or financial data
const SENSITIVE_COLUMNS = new Set([
  'email',
  'phone_number',
  'account_number_or_iban',
  'account_number',
  'iban',
  'custom_commission_rate',
  'unpaid_commission_limit',
  'current_unpaid_commission',
  'is_orders_paused_for_commission',
  'platform_commission_pkr',
  'calculated_commission_pkr',
  'applied_commission_rate',
  'unpaid_commission_threshold_pkr',
  'total_commission_owed_pkr',
  'amount_settled_pkr'
]);

function parseSelectTokens(selectStr, baseTable, filePath, line) {
  const columns = [];
  const relations = [];

  // Parse comma-separated tokens taking care of nested parentheses
  function splitTopLevel(str) {
    const tokens = [];
    let depth = 0;
    let cur = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        if (cur.trim()) tokens.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) tokens.push(cur.trim());
    return tokens;
  }

  function parseLevel(currentStr, currentTable) {
    const tokens = splitTopLevel(currentStr);
    for (const rawToken of tokens) {
      const token = rawToken.trim();
      if (!token) continue;

      const parenIdx = token.indexOf('(');
      if (parenIdx !== -1) {
        // Embed relation: e.g. "writer:writer_profiles!writer_id ( id, pen_name )"
        const prefix = token.slice(0, parenIdx).trim();
        const inner = token.slice(parenIdx + 1, token.lastIndexOf(')')).trim();

        let alias = null;
        let targetWithFk = prefix;
        if (prefix.includes(':')) {
          const colonIdx = prefix.indexOf(':');
          alias = prefix.slice(0, colonIdx).trim();
          targetWithFk = prefix.slice(colonIdx + 1).trim();
        }

        let childTable = targetWithFk;
        let fkHint = null;
        if (targetWithFk.includes('!')) {
          const bangIdx = targetWithFk.indexOf('!');
          childTable = targetWithFk.slice(0, bangIdx).trim();
          fkHint = targetWithFk.slice(bangIdx + 1).trim();
        }

        relations.push({
          filePath,
          line,
          parentTable: currentTable,
          childTable,
          fkHint,
          alias
        });

        // Recurse into child table columns
        parseLevel(inner, childTable);
      } else {
        // Simple column or count/modifier
        let col = token.trim();
        // Ignore JSON/modifiers or count: 'exact'
        if (col.startsWith('{') || col.endsWith('}') || col === 'count') continue;
        // Strip alias if any: e.g. "my_alias:col_name"
        if (col.includes(':')) {
          col = col.split(':')[1].trim();
        }
        // Strip PostgREST modifiers, e.g. "col.asc"
        if (col.includes('.')) {
          col = col.split('.')[0].trim();
        }
        if (col && /^[a-zA-Z0-9_]+$/.test(col)) {
          columns.push({
            filePath,
            line,
            table: currentTable,
            column: col,
            isFilter: false
          });
        }
      }
    }
  }

  parseLevel(selectStr, baseTable);
  return { columns, relations };
}

export function extractFrontendQueries() {
  const files = getSourceFiles(SRC_DIR);
  const allColumns = [];
  const allRelations = [];
  const sensitiveExposures = [];

  for (const file of files) {
    const relPath = relative(REPO_ROOT, file).replace(/\\/g, '/');
    const isAdminOnly = relPath.startsWith('src/app/admin/');
    const code = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

    function visit(node) {
      if (ts.isCallExpression(node)) {
        // Look for .from('tableName')
        const expr = node.expression;
        if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'from') {
          const args = node.arguments;
          if (args.length > 0 && (ts.isStringLiteral(args[0]) || ts.isNoSubstitutionTemplateLiteral(args[0]))) {
            const tableName = args[0].text;
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            const lineNumber = line + 1;

            // Traverse the chained method calls upward: .select(...).eq(...)...
            let cur = node.parent;
            while (cur && (ts.isPropertyAccessExpression(cur) || ts.isCallExpression(cur))) {
              if (ts.isCallExpression(cur)) {
                const callExpr = cur.expression;
                if (ts.isPropertyAccessExpression(callExpr)) {
                  const methodName = callExpr.name.text;
                  const methodArgs = cur.arguments;

                  // 1. .select('...')
                  if (methodName === 'select' && methodArgs.length > 0) {
                    const selArg = methodArgs[0];
                    if (ts.isStringLiteral(selArg) || ts.isNoSubstitutionTemplateLiteral(selArg)) {
                      const { columns, relations } = parseSelectTokens(selArg.text, tableName, relPath, lineNumber);
                      allColumns.push(...columns);
                      allRelations.push(...relations);

                      // Check for sensitive exposures on non-admin pages
                      if (!isAdminOnly) {
                        for (const colItem of columns) {
                          if (SENSITIVE_COLUMNS.has(colItem.column)) {
                            sensitiveExposures.push(colItem);
                          }
                        }
                      }
                    }
                  }

                  // 2. Chained filters: .eq('col', ...), .in('col', ...), .order('col', ...)
                  if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'order'].includes(methodName)) {
                    if (methodArgs.length > 0 && (ts.isStringLiteral(methodArgs[0]) || ts.isNoSubstitutionTemplateLiteral(methodArgs[0]))) {
                      const filterCol = methodArgs[0].text;
                      if (/^[a-zA-Z0-9_]+$/.test(filterCol)) {
                        allColumns.push({
                          filePath: relPath,
                          line: lineNumber,
                          table: tableName,
                          column: filterCol,
                          isFilter: true
                        });
                      }
                    }
                  }

                  // 3. .or('col1.eq.val,col2.eq.val')
                  if (methodName === 'or' && methodArgs.length > 0) {
                    if (ts.isStringLiteral(methodArgs[0]) || ts.isNoSubstitutionTemplateLiteral(methodArgs[0])) {
                      const orStr = methodArgs[0].text;
                      const parts = orStr.split(',');
                      for (const part of parts) {
                        const colName = part.split('.')[0].trim();
                        if (/^[a-zA-Z0-9_]+$/.test(colName)) {
                          allColumns.push({
                            filePath: relPath,
                            line: lineNumber,
                            table: tableName,
                            column: colName,
                            isFilter: true
                          });
                        }
                      }
                    }
                  }
                }
              }
              cur = cur.parent;
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  // Deduplicate columns by (table, column)
  const uniqueColumns = [];
  const colSeen = new Set();
  for (const c of allColumns) {
    const key = `${c.table}|${c.column}`;
    if (!colSeen.has(key)) {
      colSeen.add(key);
      uniqueColumns.push(c);
    }
  }

  // Deduplicate relations by (parentTable, childTable, fkHint)
  const uniqueRelations = [];
  const relSeen = new Set();
  for (const r of allRelations) {
    const key = `${r.parentTable}|${r.childTable}|${r.fkHint || ''}`;
    if (!relSeen.has(key)) {
      relSeen.add(key);
      uniqueRelations.push(r);
    }
  }

  return { uniqueColumns, uniqueRelations, allColumns, allRelations, sensitiveExposures };
}

export function generateColumnsSql(columns, relations) {
  const colInserts = columns.map((c, idx) => {
    const id = idx + 1;
    const file = c.filePath.replace(/'/g, "''");
    const tbl = c.table.replace(/'/g, "''");
    const col = c.column.replace(/'/g, "''");
    const isFilt = c.isFilter ? 'TRUE' : 'FALSE';
    return `    (${id}, '${file}', ${c.line}, '${tbl}', '${col}', ${isFilt})`;
  }).join(',\n');

  const relInserts = relations.map((r, idx) => {
    const id = idx + 1;
    const file = r.filePath.replace(/'/g, "''");
    const parent = r.parentTable.replace(/'/g, "''");
    const child = r.childTable.replace(/'/g, "''");
    const fk = r.fkHint ? `'${r.fkHint.replace(/'/g, "''")}'` : 'NULL';
    return `    (${id}, '${file}', ${r.line}, '${parent}', '${child}', ${fk})`;
  }).join(',\n');

  return `-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: FRONTEND COLUMNS & RELATIONSHIPS CHECK (16)
-- ==============================================================================
-- File: supabase/tests/16_frontend_columns_check.sql
-- Generated by: scripts/gen-select-column-check.mjs
-- Description:
--   Mechanically verifies that:
--   1. Every table and column queried in src/ exists in information_schema.columns.
--   2. Every embedded relation used in PostgREST select strings has a valid foreign key.
--   3. Transaction ends in ROLLBACK with zero database mutations.
-- ==============================================================================

BEGIN;

CREATE TEMP TABLE frontend_columns (
    id integer PRIMARY KEY,
    file_path text NOT NULL,
    line_num integer NOT NULL,
    table_name text NOT NULL,
    column_name text NOT NULL,
    is_filter boolean NOT NULL DEFAULT false
);

CREATE TEMP TABLE frontend_relations (
    id integer PRIMARY KEY,
    file_path text NOT NULL,
    line_num integer NOT NULL,
    parent_table text NOT NULL,
    child_table text NOT NULL,
    fk_hint text
);

CREATE TEMP TABLE columns_check_results (
    id integer,
    item_type text,
    target_item text,
    call_site text,
    status text,
    details text
);

INSERT INTO frontend_columns (id, file_path, line_num, table_name, column_name, is_filter)
VALUES
${colInserts};

INSERT INTO frontend_relations (id, file_path, line_num, parent_table, child_table, fk_hint)
VALUES
${relInserts};

DO $$
DECLARE
    c record;
    r record;
    v_exists boolean;
    v_fk_exists boolean;
BEGIN
    -- 1. Validate Columns exist in information_schema.columns
    FOR c IN SELECT * FROM frontend_columns ORDER BY id LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = c.table_name
              AND column_name = c.column_name
        ) INTO v_exists;

        IF v_exists THEN
            INSERT INTO columns_check_results VALUES (
                c.id,
                'COLUMN',
                c.table_name || '.' || c.column_name,
                c.file_path || ':' || c.line_num,
                'PASS',
                'Column exists in public schema'
            );
        ELSE
            INSERT INTO columns_check_results VALUES (
                c.id,
                'COLUMN',
                c.table_name || '.' || c.column_name,
                c.file_path || ':' || c.line_num,
                'FAIL',
                'Column does NOT exist in public.' || c.table_name
            );
        END IF;
    END LOOP;

    -- 2. Validate Embedded Relationships have Foreign Key Constraints
    FOR r IN SELECT * FROM frontend_relations ORDER BY id LOOP
        SELECT EXISTS (
            SELECT 1
            FROM pg_constraint con
            JOIN pg_class c1 ON c1.oid = con.conrelid
            JOIN pg_namespace n1 ON n1.oid = c1.relnamespace
            JOIN pg_class c2 ON c2.oid = con.confrelid
            JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
            WHERE con.contype = 'f'
              AND n1.nspname = 'public'
              AND n2.nspname = 'public'
              AND (
                  (c1.relname = r.parent_table AND c2.relname = r.child_table) OR
                  (c1.relname = r.child_table AND c2.relname = r.parent_table)
              )
              AND (
                  r.fk_hint IS NULL OR
                  EXISTS (
                      SELECT 1 FROM unnest(con.conkey) k
                      JOIN pg_attribute att ON att.attrelid = c1.oid AND att.attnum = k
                      WHERE att.attname = r.fk_hint
                  )
              )
        ) INTO v_fk_exists;

        IF v_fk_exists THEN
            INSERT INTO columns_check_results VALUES (
                r.id + 10000,
                'RELATION',
                r.parent_table || ' -> ' || r.child_table || coalesce(' (' || r.fk_hint || ')', ''),
                r.file_path || ':' || r.line_num,
                'PASS',
                'Foreign key constraint verified in pg_constraint'
            );
        ELSE
            INSERT INTO columns_check_results VALUES (
                r.id + 10000,
                'RELATION',
                r.parent_table || ' -> ' || r.child_table || coalesce(' (' || r.fk_hint || ')', ''),
                r.file_path || ':' || r.line_num,
                'FAIL',
                'No valid foreign key constraint found between tables'
            );
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- DETAILED PASS / FAIL TABLE
-- ------------------------------------------------------------------------------
SELECT 
    id,
    item_type,
    target_item,
    call_site,
    status,
    details
FROM columns_check_results
ORDER BY id;

-- ------------------------------------------------------------------------------
-- SUMMARY REPORT
-- ------------------------------------------------------------------------------
SELECT 
    count(*) AS total_checks,
    count(*) FILTER (WHERE status = 'PASS') AS passed,
    count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM columns_check_results;

DO $$
DECLARE
    v_fail_count integer;
BEGIN
    SELECT count(*) INTO v_fail_count FROM columns_check_results WHERE status = 'FAIL';
    IF v_fail_count > 0 THEN
        RAISE EXCEPTION 'TEST 16 FAILED: % column or relationship check(s) failed.', v_fail_count;
    END IF;
END $$;

ROLLBACK;
`;
}

// Main execution
const { uniqueColumns, uniqueRelations, sensitiveExposures } = extractFrontendQueries();
const sql = generateColumnsSql(uniqueColumns, uniqueRelations);
writeFileSync(OUTPUT_SQL_PATH, sql, 'utf8');

console.log(`[gen-select-column-check] Extracted ${uniqueColumns.length} unique table.column pairs and ${uniqueRelations.length} relations.`);
console.log(`[gen-select-column-check] Generated: supabase/tests/16_frontend_columns_check.sql`);

if (sensitiveExposures.length > 0) {
  console.log(`[gen-select-column-check] WARNING: Found ${sensitiveExposures.length} sensitive column reference(s) outside src/app/admin/:`);
  for (const exp of sensitiveExposures) {
    console.log(` - ${exp.table}.${exp.column} at ${exp.filePath}:${exp.line}`);
  }
} else {
  console.log(`[gen-select-column-check] No sensitive column references found outside src/app/admin/.`);
}
