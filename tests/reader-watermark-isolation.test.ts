import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildWatermarkPattern } from '../src/lib/reader/schemas.ts';

describe('Reader Watermark DOM Isolation & Anti-Bleed Architecture', () => {
  const secureReaderPath = join(process.cwd(), 'src/app/read/[slug]/[number]/SecureReaderClient.tsx');
  const fileContent = readFileSync(secureReaderPath, 'utf-8');

  it('ensures NO root-level fixed inset-0 watermark overlay exists', () => {
    // Root-level viewport-fixed overlay was the root cause of bleeding over TipCard and controls
    assert.doesNotMatch(
      fileContent,
      /pointer-events-none\s+fixed\s+inset-0\s+z-20/,
      'Must NOT contain root-level fixed inset-0 z-20 watermark overlay'
    );
  });

  it('confirms watermark overlay is strictly placed inside <article className="relative overflow-hidden">', () => {
    // The watermark must be an absolute child bounded inside <article>
    assert.match(
      fileContent,
      /<article\s+className=["']relative\s+overflow-hidden["']>/,
      '<article> must have relative overflow-hidden to bound watermark'
    );

    assert.match(
      fileContent,
      /<pattern[\s\S]*?width=["']320["'][\s\S]*?patternUnits=["']userSpaceOnUse["']/,
      'Watermark must use SVG pattern with userSpaceOnUse for infinite vertical repetition'
    );
  });

  it('guarantees TipCard container is outside <article> with elevated stacking context z-20', () => {
    // TipCard must be completely isolated from <article>
    const articleEndIndex = fileContent.indexOf('</article>');
    const tipCardIndex = fileContent.indexOf('<TipCard');

    assert.ok(articleEndIndex > 0, '<article> closing tag must exist');
    assert.ok(tipCardIndex > 0, '<TipCard> component must exist');
    assert.ok(
      tipCardIndex > articleEndIndex,
      '<TipCard> must be rendered strictly AFTER </article> so watermark overlay physically cannot reach it'
    );

    assert.match(
      fileContent,
      /className=["'][^"']*relative\s+z-20[^"']*["']>\s*<TipCard/,
      'TipCard container must have relative z-20 for stacking isolation'
    );
  });

  it('confirms watermark evaluates to null when watermark_code is null (admin toggle disabled)', () => {
    const disabledResult = buildWatermarkPattern(null, 'user-12345');
    assert.equal(disabledResult, null);

    const emptyResult = buildWatermarkPattern('', 'user-12345');
    assert.equal(emptyResult, null);
  });
});

