import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function scanDirectory(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

test('Native Browser Dialog Lint — Prohibits window.confirm, window.alert, and window.prompt', async (t) => {
  const srcDir = path.join(process.cwd(), 'src');
  const files = scanDirectory(srcDir);

  await t.test('src/ contains zero window.confirm, window.alert, or window.prompt calls', () => {
    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Ignore comments
        if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;

        const match = line.match(/\bwindow\.(confirm|alert|prompt)\s*\(/);
        if (match) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: index + 1,
            match: match[0],
          });
        }
      });
    }

    assert.equal(
      violations.length,
      0,
      `Forbidden native window dialogs detected in src:\n${violations.map((v) => `  ${v.file}:${v.line} -> ${v.match}`).join('\n')}`
    );
  });

  await t.test('src/ contains zero native prompt calls', () => {
    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;

        const match = line.match(/\bprompt\s*\(/);
        if (match) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: index + 1,
            match: match[0],
          });
        }
      });
    }

    assert.equal(
      violations.length,
      0,
      `Forbidden native prompt() detected in src:\n${violations.map((v) => `  ${v.file}:${v.line} -> ${v.match}`).join('\n')}`
    );
  });

  await t.test('ConfirmProvider exports useConfirm hook with confirm and alert methods', async () => {
    const providerFile = path.join(process.cwd(), 'src/components/ui/confirm-provider.tsx');
    assert.equal(fs.existsSync(providerFile), true, 'ConfirmProvider file must exist');

    const content = fs.readFileSync(providerFile, 'utf8');
    assert.match(content, /export function useConfirm/);
    assert.match(content, /export function ConfirmProvider/);
    assert.match(content, /confirm:\s*\(options:\s*ConfirmOptions\)\s*=>/);
    assert.match(content, /alert:\s*\(options:\s*AlertOptions/);
  });
});

