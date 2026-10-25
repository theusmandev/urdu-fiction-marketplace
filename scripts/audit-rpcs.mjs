import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { extractRpcCalls } from './gen-rpc-signature-check.mjs';

const calls = extractRpcCalls();
const migDir = 'supabase/migrations';
const migFiles = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();

// Collect all functions
const functions = new Map();

for (const file of migFiles) {
  const content = readFileSync(join(migDir, file), 'utf8');
  // Match CREATE OR REPLACE FUNCTION public.<name>(
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*RETURNS/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].toLowerCase();
    const rawArgs = m[2].trim();
    const params = [];
    if (rawArgs.length > 0) {
      // Split on top-level commas
      const argParts = [];
      let depth = 0;
      let cur = '';
      for (let i = 0; i < rawArgs.length; i++) {
        const ch = rawArgs[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === ',' && depth === 0) {
          argParts.push(cur.trim());
          cur = '';
          continue;
        }
        cur += ch;
      }
      if (cur.trim()) argParts.push(cur.trim());

      for (const part of argParts) {
        // e.g. p_novel_id uuid DEFAULT NULL
        const match = /^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_.[\]]+)(?:\s+DEFAULT\s+([\s\S]*))?$/i.exec(part.trim());
        if (match) {
          params.push({
            name: match[1],
            type: match[2],
            hasDefault: match[3] !== undefined
          });
        } else {
          const simple = /^([a-zA-Z0-9_]+)/.exec(part.trim());
          if (simple) {
            params.push({
              name: simple[1],
              type: 'unknown',
              hasDefault: part.toLowerCase().includes('default')
            });
          }
        }
      }
    }
    if (!functions.has(name)) functions.set(name, []);
    functions.get(name).push({ file, rawArgs, params });
  }
}

console.log('Total functions extracted from migrations:', functions.size);

const issues = [];
for (const c of calls) {
  const name = c.funcName.toLowerCase();
  if (!functions.has(name)) {
    issues.push({
      call: `${c.funcName} (${c.filePath}:${c.line})`,
      issue: 'FUNCTION NOT IN ANY MIGRATION'
    });
    continue;
  }

  const overloads = functions.get(name);
  const latest = overloads[overloads.length - 1];
  const allParamNames = latest.params.map(p => p.name);
  const reqParamNames = latest.params.filter(p => !p.hasDefault).map(p => p.name);

  const missingReq = reqParamNames.filter(p => !c.sentArgs.includes(p));
  const unknownKeys = c.sentArgs.filter(k => !allParamNames.includes(k));

  if (missingReq.length > 0 || unknownKeys.length > 0) {
    issues.push({
      call: `${c.funcName} (${c.filePath}:${c.line})`,
      sentArgs: c.sentArgs,
      definedParams: allParamNames,
      missingReq,
      unknownKeys,
      latestMig: latest.file
    });
  }
}

console.log('Discrepancies found:', issues.length);
if (issues.length > 0) {
  console.log(JSON.stringify(issues, null, 2));
} else {
  console.log('ALL FRONTEND RPC CALLS MATCH PostgreSQL DEFINITIONS EXACTLY!');
}
