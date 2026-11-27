import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChapterContent,
  renderChapterBodyToHtml,
} from '../src/lib/reader/chapter-body-model.ts';
import { cleanUrduText } from '../src/lib/text/clean-urdu.ts';

describe('ChapterBody Renderer & parseChapterContent', () => {
  test('N lines -> N paragraphs', () => {
    const raw = 'سطر نمبر ۱\nسطر نمبر ۲\nسطر نمبر ۳';
    const blocks = parseChapterContent(raw);

    assert.equal(blocks.length, 3);
    assert.equal(blocks[0].type, 'paragraph');
    assert.equal(blocks[0].text, 'سطر نمبر ۱');
    assert.equal(blocks[1].type, 'paragraph');
    assert.equal(blocks[1].text, 'سطر نمبر ۲');
    assert.equal(blocks[2].type, 'paragraph');
    assert.equal(blocks[2].text, 'سطر نمبر ۳');

    const html = renderChapterBodyToHtml(raw);
    // Verify 3 distinct <p> tags rendered
    const pMatches = html.match(/<p\b[^>]*>.*?<\/p>/g) || [];
    assert.equal(pMatches.length, 3);
    assert.ok(html.includes('سطر نمبر ۱'));
    assert.ok(html.includes('سطر نمبر ۲'));
    assert.ok(html.includes('سطر نمبر ۳'));
  });

  test('a standalone **** line renders as a divider ornament, not as raw characters', () => {
    const raw = 'وہاں سے چلی گئی۔\n****\nہال میں روشنیوں کی چمک تھی۔';
    const blocks = parseChapterContent(raw);

    assert.equal(blocks.length, 3);
    assert.equal(blocks[0].type, 'paragraph');
    assert.equal(blocks[0].text, 'وہاں سے چلی گئی۔');

    assert.equal(blocks[1].type, 'scene-break');
    assert.equal(blocks[1].text, undefined);

    assert.equal(blocks[2].type, 'paragraph');
    assert.equal(blocks[2].text, 'ہال میں روشنیوں کی چمک تھی۔');

    const html = renderChapterBodyToHtml(raw);
    // Must render a separator role ornament
    assert.ok(html.includes('role="separator"'));
    // The raw literal '****' string must NOT appear in the rendered body
    assert.ok(!html.includes('****'));
  });

  test('an inline **** inside text stays literal text', () => {
    const raw = 'اس نے کہا: **** تم کہاں جا رہے ہو؟';
    const blocks = parseChapterContent(raw);

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'paragraph');
    assert.equal(blocks[0].text, raw);

    const html = renderChapterBodyToHtml(raw);
    // Must NOT render separator
    assert.ok(!html.includes('role="separator"'));
    // Must keep inline **** as literal text
    assert.ok(html.includes('****'));
  });

  test('blank-line runs map to paragraph spacing and extra gaps', () => {
    // Single blank line (\n\n) -> normal paragraph spacing (hasExtraTopGap: false)
    // Double blank line (\n\n\n) -> larger gap (hasExtraTopGap: true)
    const raw = `پیراگراف ۱

پیراگراف ۲


پیراگراف ۳`;

    const blocks = parseChapterContent(raw);
    assert.equal(blocks.length, 3);

    assert.equal(blocks[0].text, 'پیراگراف ۱');
    assert.equal(blocks[0].hasExtraTopGap, false);

    assert.equal(blocks[1].text, 'پیراگراف ۲');
    assert.equal(blocks[1].hasExtraTopGap, false); // 1 blank line = standard spacing

    assert.equal(blocks[2].text, 'پیراگراف ۳');
    assert.equal(blocks[2].hasExtraTopGap, true); // 2 blank lines = extra gap!

    const html = renderChapterBodyToHtml(raw, { paragraphSpacing: 'normal' });
    // Paragraph 3 receives extra top padding/gap class
    assert.ok(html.includes('pt-5'));
  });

  test('no raw HTML is interpreted — <script> or <b> tags show literally (XSS prevention)', () => {
    const dangerous = 'یہ <b>خطرناک</b> متن ہے۔ <script>alert("xss")</script>';
    const html = renderChapterBodyToHtml(dangerous);

    // Must be HTML-escaped
    assert.ok(html.includes('&lt;b&gt;خطرناک&lt;/b&gt;'));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<b>خطرناک</b>'));
  });
});

describe('End-to-End Pure Functions Chain (Editor -> Cleaner -> Save Payload -> Render Model)', () => {
  test('proves 100% newline preservation across the entire pipeline', () => {
    // 1. Writer types or pastes chapter manuscript in Editor
    const originalEditorText = [
      'یہ ناول کا پہلا پیراگراف ہے جس میں کہانی شروع ہوتی ہے۔',
      'یہ پہلی ہی فصل کی دوسری سطر ہے جو بغیر خالی سطر کے لکھی گئی۔',
      '',
      'یہ دوسرا پیراگراف ہے جو ایک خالی سطر کے بعد آتا ہے۔',
      '',
      '',
      '****',
      '',
      'منظر تبدیل ہو گیا۔ ہال میں ہر طرف سناٹا چھا گیا تھا۔',
      'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾',
    ].join('\n');

    // 2. Editor cleaner / server action cleanUrduText() executes
    const cleanedText = cleanUrduText(originalEditorText);

    // Verify non-empty lines are identical
    const origNonEmpty = originalEditorText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const cleanedNonEmpty = cleanedText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    assert.deepEqual(cleanedNonEmpty, origNonEmpty);

    // 3. Save payload is constructed (as sent to Supabase update / insert)
    const savePayload = {
      novel_id: '11111111-1111-1111-1111-111111111111',
      chapter_number: 1,
      title_urdu: 'باب اول',
      content_urdu: cleanedText,
    };

    // 4. Reader receives payload from get_chapter_for_reader RPC
    const readerChapter = {
      chapter_title: savePayload.title_urdu,
      content_urdu: savePayload.content_urdu,
    };

    // 5. Reader parses content into ChapterBody render model
    const blocks = parseChapterContent(readerChapter.content_urdu);

    // Verify:
    // Block 0: paragraph 1
    assert.equal(blocks[0].type, 'paragraph');
    assert.equal(blocks[0].text, 'یہ ناول کا پہلا پیراگراف ہے جس میں کہانی شروع ہوتی ہے۔');

    // Block 1: paragraph 2 (immediate next line)
    assert.equal(blocks[1].type, 'paragraph');
    assert.equal(blocks[1].text, 'یہ پہلی ہی فصل کی دوسری سطر ہے جو بغیر خالی سطر کے لکھی گئی۔');
    assert.equal(blocks[1].hasExtraTopGap, false);

    // Block 2: paragraph 3 (after 1 blank line)
    assert.equal(blocks[2].type, 'paragraph');
    assert.equal(blocks[2].text, 'یہ دوسرا پیراگراف ہے جو ایک خالی سطر کے بعد آتا ہے۔');
    assert.equal(blocks[2].hasExtraTopGap, false);

    // Block 3: scene break (after 2 blank lines)
    assert.equal(blocks[3].type, 'scene-break');
    assert.equal(blocks[3].hasExtraTopGap, true);

    // Block 4: paragraph 4
    assert.equal(blocks[4].type, 'paragraph');
    assert.equal(blocks[4].text, 'منظر تبدیل ہو گیا۔ ہال میں ہر طرف سناٹا چھا گیا تھا۔');

    // Block 5: Quranic verse with tashkeel
    assert.equal(blocks[5].type, 'paragraph');
    assert.equal(blocks[5].text, 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾');

    // 6. ChapterBody JSX renders to HTML without newline collapsing
    const finalHtml = renderChapterBodyToHtml(readerChapter.content_urdu, {
      fontSize: 'lg',
      lineHeight: 'relaxed',
      paragraphSpacing: 'normal',
    });

    // Assert that every paragraph rendered as discrete <p> and scene break rendered as ornament
    assert.ok(finalHtml.includes('role="separator"'));
    const pTags = finalHtml.match(/<p\b[^>]*>.*?<\/p>/g) || [];
    assert.equal(pTags.length, 5); // 5 text paragraphs
  });
});

describe('ChapterBody Nastaliq (Gulzar) Glyph Overhang & Clipping Protection', () => {
  test('inner prose container enforces padding-inline in em units to prevent glyph clipping at RTL line-start', () => {
    const raw = 'گھر کے سامنے خوبصورت باغ تھا۔\nگرم موسم میں ٹھنڈی ہوا چلی۔\nکچھ فاصلے پر نہر بہتی تھی۔';
    const html = renderChapterBodyToHtml(raw, { fontSize: 'lg' });

    // Must contain em-based padding-inline on container to give overhang breathing room
    assert.ok(
      html.includes('[padding-inline:0.5em]'),
      'Rendered HTML container must include [padding-inline:0.5em] for Gulzar overhang'
    );

    // Must contain vertical padding to protect top Madd/ascenders and bottom descenders
    assert.ok(
      html.includes('py-1.5'),
      'Rendered HTML container must include py-1.5 vertical breathing room'
    );

    // Must preserve all initial tall Nastaliq lines starting with گ and ک
    assert.ok(html.includes('گھر کے سامنے خوبصورت باغ تھا۔'));
    assert.ok(html.includes('گرم موسم میں ٹھنڈی ہوا چلی۔'));
    assert.ok(html.includes('کچھ فاصلے پر نہر بہتی تھی۔'));
  });

  test('empty chapter content fallback also retains safe inline padding', () => {
    const emptyHtml = renderChapterBodyToHtml('');
    assert.ok(
      emptyHtml.includes('[padding-inline:0.5em]'),
      'Empty state container must retain [padding-inline:0.5em]'
    );
  });
});

describe('ChapterBody Nastaliq (Jameel Noori) Calibration & Deep-Cascade Metrics', () => {
  test('inner prose container enforces calibrated padding-inline and py when readerFont is noori', () => {
    const raw = 'گھر کے سامنے خوبصورت باغ تھا۔\nگرم موسم میں ٹھنڈی ہوا چلی۔\nکچھ فاصلے پر نہر بہتی تھی۔';
    const html = renderChapterBodyToHtml(raw, { fontSize: 'lg', readerFont: 'noori' });

    assert.ok(
      html.includes('[padding-inline:var(--reader-padding-inline,0.6em)]'),
      'Rendered HTML container must include [padding-inline:var(--reader-padding-inline,0.6em)] for calibrated Noori overhang'
    );

    assert.ok(
      html.includes('py-2.5'),
      'Rendered HTML container must include py-2.5 vertical breathing room for deep descenders'
    );

    assert.ok(
      html.includes('data-reader-font="noori"'),
      'Rendered HTML container must set data-reader-font="noori"'
    );

    assert.ok(
      html.includes('reader-canvas'),
      'Rendered HTML container must include reader-canvas class'
    );
  });

  test('empty chapter content fallback for noori retains calibrated padding', () => {
    const emptyHtml = renderChapterBodyToHtml('', { readerFont: 'noori' });
    assert.ok(
      emptyHtml.includes('[padding-inline:var(--reader-padding-inline,0.6em)]'),
      'Empty state container must retain [padding-inline:var(--reader-padding-inline,0.6em)] when noori is selected'
    );
    assert.ok(
      emptyHtml.includes('data-reader-font="noori"'),
      'Empty state container must retain data-reader-font="noori"'
    );
  });

  test('default renderChapterBodyToHtml uses normal line-height and compact paragraph spacing', () => {
    const raw = 'پہلا پیراگراف۔\nدوسرا پیراگراف۔';
    const defaultHtml = renderChapterBodyToHtml(raw);

    // Default line-height is normal ('leading-[2.2]')
    assert.ok(defaultHtml.includes('leading-[2.2]'), 'Default line height should be normal (leading-[2.2])');

    // Default paragraph spacing is compact ('mb-3.5')
    assert.ok(defaultHtml.includes('mb-3.5'), 'Default paragraph spacing should be compact (mb-3.5)');
  });

  test('rendered paragraphs are properly enclosed in data-reader-font container with rtl urdu semantics', () => {
    const raw = 'پہلا پیراگراف۔\nدوسرا پیراگراف۔';
    const htmlNoori = renderChapterBodyToHtml(raw, { readerFont: 'noori' });

    assert.ok(htmlNoori.includes('data-reader-font="noori"'), 'Must have data-reader-font="noori"');
    assert.ok(htmlNoori.includes('<p dir="rtl" lang="ur"'), 'All paragraphs must set dir="rtl" and lang="ur"');
    assert.ok(htmlNoori.includes('پہلا پیراگراف۔'));
    assert.ok(htmlNoori.includes('دوسرا پیراگراف۔'));

    const htmlGulzar = renderChapterBodyToHtml(raw, { readerFont: 'gulzar' });
    assert.ok(htmlGulzar.includes('data-reader-font="gulzar"'), 'Must have data-reader-font="gulzar"');
    assert.ok(htmlGulzar.includes('font-urdu'), 'Gulzar container must include font-urdu class');
  });

  test('prose paragraphs apply optical font scaling calc formula with base font size', () => {
    const raw = 'منظر کا آغاز ہوا۔';
    
    // Default size (lg -> 1.125rem)
    const htmlLg = renderChapterBodyToHtml(raw, { readerFont: 'noori', fontSize: 'lg' });
    assert.ok(
      htmlLg.includes('style="--reader-base-font-size: 1.125rem;"'),
      'Must inject --reader-base-font-size: 1.125rem for lg preset'
    );
    assert.ok(
      htmlLg.includes('[font-size:calc(var(--reader-base-font-size,1.125rem)*var(--reader-font-scale,1))]'),
      'Must apply optical font-size calculation to paragraph'
    );

    // Small size (sm -> 0.875rem)
    const htmlSm = renderChapterBodyToHtml(raw, { readerFont: 'noori', fontSize: 'sm' });
    assert.ok(
      htmlSm.includes('style="--reader-base-font-size: 0.875rem;"'),
      'Must inject --reader-base-font-size: 0.875rem for sm preset'
    );

    // Extra large size (2xl -> 1.5rem)
    const html2Xl = renderChapterBodyToHtml(raw, { readerFont: 'noori', fontSize: '2xl' });
    assert.ok(
      html2Xl.includes('style="--reader-base-font-size: 1.5rem;"'),
      'Must inject --reader-base-font-size: 1.5rem for 2xl preset'
    );
  });
});
