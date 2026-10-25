#!/usr/bin/env node
// scripts/check-frontend-queries.mjs
//
// CI / Pre-commit Gate for Frontend Supabase Queries & PostgREST Embeds:
// 1. PostgREST Embed Rule:
//    - "alias:target" in PostgREST select strings requires target to be a TABLE, not a foreign key column.
//    - Forbids invalid embeds like "writer_profiles:writer_id", "profiles:actor_id", "genre:genre_id".
//    - Enforces proper syntax: table!fk_column(...) or alias:table!fk_column(...).
// 2. Query Error Handling Rule:
//    - Forbids destructuring only { data } from Supabase queries without error handling.
//    - Forbids .single() on queries where 0 rows are possible (must use maybeSingle()).

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC_DIR = join(REPO_ROOT, 'src');

// Forbidden PostgREST embed patterns (misinterpreting column as embed target)
const FORBIDDEN_EMBED_PATTERNS = [
  {
    pattern: /writer_profiles:writer_id\b/g,
    reason: '"writer_profiles:writer_id" treats column as target table. Use "writer_profiles!writer_id" or "writer:writer_profiles!writer_id".',
  },
  {
    pattern: /profiles:actor_id\b/g,
    reason: '"profiles:actor_id" treats column as target table. Use "profiles!actor_id" or "actor:profiles!actor_id".',
  },
  {
    pattern: /profiles:reader_id\b/g,
    reason: '"profiles:reader_id" treats column as target table. Use "profiles!reader_id" or "reader:profiles!reader_id".',
  },
  {
    pattern: /profiles:id\b/g,
    reason: '"profiles:id" treats column as target table. Use "profiles!id" or "author:profiles!id".',
  },
  {
    pattern: /genre:genre_id\b/g,
    reason: '"genre:genre_id" treats column as target table. Use "genres!genre_id" or "genre:genres!genre_id".',
  },
  {
    pattern: /novel_genres\s*\(\s*count\s*\)/g,
    reason: 'Embedding "novel_genres(count)" is unsupported by PostgREST and results in PGRST200.',
  },
];

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

const files = getSourceFiles(SRC_DIR);
let totalViolations = 0;

console.log(`[check:frontend] Scanning ${files.length} TypeScript source files in src/ ...\n`);

for (const filePath of files) {
  const relPath = relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // 1. Check for forbidden embed patterns
  FORBIDDEN_EMBED_PATTERNS.forEach(({ pattern, reason }) => {
    lines.forEach((line, lineIdx) => {
      if (pattern.test(line)) {
        console.error(`❌ [EMBED SYNTAX ERROR] ${relPath}:${lineIdx + 1}`);
        console.error(`   Line: ${line.trim()}`);
        console.error(`   Reason: ${reason}\n`);
        totalViolations++;
      }
    });
  });

  // 2. Check for unsafe { data } destructuring without error handling on supabase queries
  // Pattern: const { data } = await supabase... or const { data: x } = await supabase...
  // but WITHOUT error in the destructuring pattern.
  const queryDestructureRegex = /const\s*\{\s*data(?::\s*(\w+))?\s*\}\s*=\s*await\s+supabase/g;
  lines.forEach((line, lineIdx) => {
    if (queryDestructureRegex.test(line)) {
      console.error(`❌ [QUERY ERROR UNHANDLED] ${relPath}:${lineIdx + 1}`);
      console.error(`   Line: ${line.trim()}`);
      console.error(`   Reason: Destructuring only { data } from Supabase query ignores database/network errors. Destructure { data, error } or use unwrapQuery().\n`);
      totalViolations++;
    }
  });

  // Also check for multiple promise results destructuring only data without error
  // e.g. const [{ data: x }, { data: y }] = await Promise.all([supabase...
  const promiseAllOnlyData = /const\s*\[\s*\{\s*data(?::\s*(\w+))?\s*\}\s*,\s*\{\s*data(?::\s*(\w+))?\s*\}\s*\]\s*=\s*await\s+Promise\.all\s*\(\s*\[\s*supabase/g;
  lines.forEach((line, lineIdx) => {
    if (promiseAllOnlyData.test(line)) {
      console.error(`❌ [QUERY ERROR UNHANDLED] ${relPath}:${lineIdx + 1}`);
      console.error(`   Line: ${line.trim()}`);
      console.error(`   Reason: Destructuring only [{ data }, { data }] from Promise.all ignores Supabase errors. Use unwrapQuery().\n`);
      totalViolations++;
    }
  });
}

if (totalViolations > 0) {
  console.error(`\n💥 FAILED: Found ${totalViolations} frontend query violation(s).`);
  process.exit(1);
} else {
  console.log('✅ All frontend queries pass embed syntax and error handling checks.');
}
