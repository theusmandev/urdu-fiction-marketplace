import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { extractRpcCalls } from './gen-rpc-signature-check.mjs';

const calls = extractRpcCalls();
const migDir = 'supabase/migrations';
const migFiles = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();

// Find jsonb_build_object keys for each function in migrations
const funcReturns = new Map();

for (const file of migFiles) {
  const content = readFileSync(join(migDir, file), 'utf8');
  // Match CREATE ... FUNCTION public.<name>( ... ) RETURNS jsonb ... AS $$ ... $$;
  const funcRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([a-zA-Z0-9_]+)[\s\S]*?AS\s*\$\$([\s\S]*?)\$\$/gi;
  let m;
  while ((m = funcRegex.exec(content)) !== null) {
    const name = m[1].toLowerCase();
    const retType = m[3].toLowerCase();
    const body = m[4];
    
    const jsonKeys = new Set();
    // find all jsonb_build_object('key', ...
    const jbRegex = /jsonb_build_object\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/gi;
    let jbm;
    while ((jbm = jbRegex.exec(body)) !== null) {
      jsonKeys.add(jbm[1]);
    }

    if (!funcReturns.has(name)) funcReturns.set(name, []);
    funcReturns.get(name).push({ file, retType, jsonKeys: Array.from(jsonKeys) });
  }
}

// Now check each frontend call to see what properties are read from data/result
console.log('Inspecting JSON key reads in frontend...');
const results = [];

for (const call of calls) {
  const file = call.filePath;
  const code = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

  // Find the call expression at line
  let callNode = null;
  function findCall(node) {
    if (ts.isCallExpression(node)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      if (line + 1 === call.line) {
        callNode = node;
        return;
      }
    }
    ts.forEachChild(node, findCall);
  }
  findCall(sf);

  let readKeys = [];

  if (callNode) {
    // Find parent variable statement or assignment, e.g. const { data, error } = await supabase.rpc(...)
    let current = callNode;
    while (current && !ts.isVariableDeclaration(current) && !ts.isBinaryExpression(current)) {
      current = current.parent;
    }

    let dataVarName = 'data';
    if (current && ts.isVariableDeclaration(current)) {
      // check pattern: const { data } = ... or const { data: result } = ...
      if (ts.isObjectBindingPattern(current.name)) {
        for (const el of current.name.elements) {
          const propName = el.propertyName ? el.propertyName.getText(sf) : el.name.getText(sf);
          if (propName === 'data') {
            dataVarName = el.name.getText(sf);
          }
        }
      }
    }

    // Now search the enclosing function block for accesses on dataVarName or casts: (data as { key: ... })
    let enclosingBlock = callNode;
    while (enclosingBlock && !ts.isFunctionDeclaration(enclosingBlock) && !ts.isFunctionExpression(enclosingBlock) && !ts.isArrowFunction(enclosingBlock) && !ts.isSourceFile(enclosingBlock)) {
      enclosingBlock = enclosingBlock.parent;
    }

    if (enclosingBlock) {
      function findReads(node) {
        // e.g. data.something
        if (ts.isPropertyAccessExpression(node)) {
          if (node.expression.getText(sf) === dataVarName) {
            readKeys.push(node.name.text);
          }
        }
        // e.g. (data as { something: ... }) or const res = data as ...
        if (ts.isAsExpression(node) && node.expression.getText(sf) === dataVarName) {
          if (ts.isTypeLiteralNode(node.type)) {
            for (const member of node.type.members) {
              if (ts.isPropertySignature(member)) {
                readKeys.push(member.name.getText(sf));
              }
            }
          }
        }
        // e.g. if (!data.something)
        ts.forEachChild(node, findReads);
      }
      findReads(enclosingBlock);
    }
  }

  const name = call.funcName.toLowerCase();
  const dbOverloads = funcReturns.get(name) || [];
  const latestDb = dbOverloads[dbOverloads.length - 1];

  results.push({
    funcName: call.funcName,
    callSite: `${call.filePath}:${call.line}`,
    readKeys: Array.from(new Set(readKeys)),
    dbReturn: latestDb ? latestDb.retType : 'unknown',
    dbKeys: latestDb ? latestDb.jsonKeys : []
  });
}

// Print results table
console.log(JSON.stringify(results.filter(r => r.readKeys.length > 0 || r.dbKeys.length > 0), null, 2));
