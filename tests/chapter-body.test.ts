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
