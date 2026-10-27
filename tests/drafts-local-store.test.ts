import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveLocalDraft,
  getLocalDraft,
  listLocalDraftsForNovel,
  listAllLocalDrafts,
  deleteLocalDraft,
  archiveLocalDraftUnderDifferentKey,
  clearSyncedLocalDrafts,
  generateDraftClientKey,
  getRememberDraftsOnDevice,
  setRememberDraftsOnDevice,
  resetDraftsDB,
  openDraftsDB,
} from '../src/lib/drafts/local-store.ts';

describe('Offline Chapter Drafts — Local Store (IndexedDB)', () => {
  const userA = '11111111-1111-1111-1111-111111111111';
  const userB = '22222222-2222-2222-2222-222222222222';
  const novel1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const novel2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const chap1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  beforeEach(async () => {
    resetDraftsDB();
    const db = await openDraftsDB();
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  });

  it('saves and restores a chapter draft with intact Urdu text and newlines', async () => {
    const clientKey = generateDraftClientKey(userA, novel1, chap1);
    const urduContent = 'یہ پہلا پیراگراف ہے۔\n\nیہ دوسرا پیراگراف ہے جس میں اردو الفاظ محفوظ ہیں۔';

    const saved = await saveLocalDraft({
      client_key: clientKey,
      userId: userA,
      novelId: novel1,
      chapterId: chap1,
      title: 'باب اول',
      content: urduContent,
      chapterNumber: 1,
      baseChapterUpdatedAt: '2026-10-26T12:00:00Z',
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: 'Chrome on Windows',
    });

    assert.strictEqual(saved.localSeq, 1);
    assert.strictEqual(saved.dirty, true);
    assert.strictEqual(saved.content, urduContent);

    // Retrieve from store
    const retrieved = await getLocalDraft(clientKey, userA);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.client_key, clientKey);
    assert.strictEqual(retrieved.content, urduContent);
    assert.strictEqual(retrieved.title, 'باب اول');
    assert.strictEqual(retrieved.localSeq, 1);
  });

  it('increments localSeq monotonically on subsequent saves', async () => {
    const clientKey = generateDraftClientKey(userA, novel1, chap1);

    await saveLocalDraft({
      client_key: clientKey,
      userId: userA,
      novelId: novel1,
      chapterId: chap1,
      title: 'باب اول',
      content: 'پہلا ڈرافٹ',
      chapterNumber: 1,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: 'Chrome on Windows',
    });

    const secondSave = await saveLocalDraft({
      client_key: clientKey,
      userId: userA,
      novelId: novel1,
      chapterId: chap1,
      title: 'باب اول — ترمیم شدہ',
      content: 'دوسرا ڈرافٹ ترمیم شدہ',
      chapterNumber: 1,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: 'Chrome on Windows',
    });

    assert.strictEqual(secondSave.localSeq, 2);

    const thirdSave = await saveLocalDraft({
      client_key: clientKey,
      userId: userA,
      novelId: novel1,
      chapterId: chap1,
      title: 'باب اول — مزید ترمیم',
      content: 'تیسرا ڈرافٹ',
      chapterNumber: 1,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: 'Chrome on Windows',
    });

    assert.strictEqual(thirdSave.localSeq, 3);
  });

  it('strictly enforces user isolation: User B cannot access User A drafts', async () => {
    const clientKey = generateDraftClientKey(userA, novel1, chap1);

    await saveLocalDraft({
      client_key: clientKey,
      userId: userA,
      novelId: novel1,
      chapterId: chap1,
      title: 'صرف مصنف الف کا مسودہ',
      content: 'خفیہ مواد جو صارف ب کو نظر نہیں آنا چاہیے',
      chapterNumber: 1,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: 'Device A',
    });

    // User A reads their own draft -> succeeds
    const userADraft = await getLocalDraft(clientKey, userA);
    assert.ok(userADraft);
    assert.strictEqual(userADraft.title, 'صرف مصنف الف کا مسودہ');

    // User B attempts to read the same client_key -> returns null
    const userBDraft = await getLocalDraft(clientKey, userB);
    assert.strictEqual(userBDraft, null);

    // User B listing novel drafts -> empty array
    const userBDraftsList = await listLocalDraftsForNovel(userB, novel1);
    assert.strictEqual(userBDraftsList.length, 0);

    // User B listing all drafts -> empty array
    const userBAllDrafts = await listAllLocalDrafts(userB);
    assert.strictEqual(userBAllDrafts.length, 0);
  });

  it('lists drafts per novel and per user correctly sorted by updatedAt', async () => {
    const key1 = generateDraftClientKey(userA, novel1, chap1);
    const key2 = generateDraftClientKey(userA, novel1, null, 'slot_two');
    const keyOtherNovel = generateDraftClientKey(userA, novel2, null, 'slot_other');

    await saveLocalDraft({
      client_key: key1,
      userId: userA,
      novelId: novel1,
      chapterId: chap1,
      title: 'ناول ۱ باب ۱',
      content: 'متن ۱',
      chapterNumber: 1,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: '',
      updatedAt: '2026-10-26T10:00:00Z',
    });

    await saveLocalDraft({
      client_key: key2,
      userId: userA,
      novelId: novel1,
      chapterId: null,
      title: 'ناول ۱ نیا باب',
      content: 'متن نیا',
      chapterNumber: null,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: '',
      updatedAt: '2026-10-26T12:00:00Z',
    });

    await saveLocalDraft({
      client_key: keyOtherNovel,
      userId: userA,
      novelId: novel2,
      chapterId: null,
      title: 'ناول ۲ کا باب',
      content: 'متن ناول ۲',
      chapterNumber: null,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: '',
      updatedAt: '2026-10-26T11:00:00Z',
    });

    const novel1Drafts = await listLocalDraftsForNovel(userA, novel1);
    assert.strictEqual(novel1Drafts.length, 2);
    // Ordered by updatedAt DESC: key2 (12:00) should come before key1 (10:00)
    assert.strictEqual(novel1Drafts[0].client_key, key2);
    assert.strictEqual(novel1Drafts[1].client_key, key1);

    const allUserADrafts = await listAllLocalDrafts(userA);
    assert.strictEqual(allUserADrafts.length, 3);
  });

  it('archives conflicting local draft under a distinct key without data loss', async () => {
    const clientKey = generateDraftClientKey(userA, novel1, chap1);

    await saveLocalDraft({
      client_key: clientKey,
      userId: userA,
      novelId: novel1,
      chapterId: chap1,
      title: 'متنازعہ باب',
      content: 'مصنف کی ذاتی محنت کا ڈرافٹ جو سرور سے تبدیل ہوا',
      chapterNumber: 1,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: 'Device',
    });

    const archiveKey = await archiveLocalDraftUnderDifferentKey(clientKey, userA);
    assert.ok(archiveKey);
    assert.notStrictEqual(archiveKey, clientKey);
    assert.ok(archiveKey.includes('_arch_'));

    // Check that archived record exists with exact content preserved
    const archived = await getLocalDraft(archiveKey, userA);
    assert.ok(archived);
    assert.strictEqual(archived.content, 'مصنف کی ذاتی محنت کا ڈرافٹ جو سرور سے تبدیل ہوا');
    assert.ok(archived.title.includes('Archived Conflict'));
    assert.strictEqual(archived.dirty, false);

    // Original key still exists until caller updates or deletes it
    const original = await getLocalDraft(clientKey, userA);
    assert.ok(original);
  });

  it('clears only cleanly synced drafts when clearSyncedLocalDrafts is called', async () => {
    const keyClean = generateDraftClientKey(userA, novel1, chap1);
    const keyDirty = generateDraftClientKey(userA, novel1, null, 'dirty_slot');

    await saveLocalDraft({
      client_key: keyClean,
      userId: userA,
      novelId: novel1,
      chapterId: chap1,
      title: 'کلین ڈرافٹ',
      content: 'یہ سرور پر محفوظ ہو چکا ہے',
      chapterNumber: 1,
      baseChapterUpdatedAt: null,
      serverRevision: 2,
      lastSyncedSeq: 1,
      lastSyncedAt: new Date().toISOString(),
      dirty: false, // clean!
      deviceLabel: '',
    });

    await saveLocalDraft({
      client_key: keyDirty,
      userId: userA,
      novelId: novel1,
      chapterId: null,
      title: 'ڈورٹی ڈرافٹ',
      content: 'یہ ابھی سرور پر محفوظ نہیں ہوا',
      chapterNumber: null,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      dirty: true, // unsynced dirty
      deviceLabel: '',
    });

    const clearedCount = await clearSyncedLocalDrafts(userA);
    assert.strictEqual(clearedCount, 1);

    // Clean draft was removed
    const cleanCheck = await getLocalDraft(keyClean, userA);
    assert.strictEqual(cleanCheck, null);

    // Dirty draft was strictly PRESERVED
    const dirtyCheck = await getLocalDraft(keyDirty, userA);
    assert.ok(dirtyCheck);
    assert.strictEqual(dirtyCheck.dirty, true);
  });

  it('handles deleteLocalDraft securely and idempotently', async () => {
    const clientKey = generateDraftClientKey(userA, novel1, chap1);

    await saveLocalDraft({
      client_key: clientKey,
      userId: userA,
      novelId: novel1,
      chapterId: chap1,
      title: 'حذف کے لیے ڈرافٹ',
      content: 'مواد',
      chapterNumber: 1,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      deviceLabel: '',
    });

    // User B attempts to delete User A's draft -> fails
    const deletedByB = await deleteLocalDraft(clientKey, userB);
    assert.strictEqual(deletedByB, false);

    // Draft still exists
    assert.ok(await getLocalDraft(clientKey, userA));

    // User A deletes their own draft -> succeeds
    const deletedByA = await deleteLocalDraft(clientKey, userA);
    assert.strictEqual(deletedByA, true);

    // Draft is gone
    assert.strictEqual(await getLocalDraft(clientKey, userA), null);
  });

  it('manages "remember drafts on this device" preference safely', () => {
    // Default is false on first use
    assert.strictEqual(getRememberDraftsOnDevice(userA), false);

    setRememberDraftsOnDevice(userA, true);
    assert.strictEqual(getRememberDraftsOnDevice(userA), true);

    setRememberDraftsOnDevice(userA, false);
    assert.strictEqual(getRememberDraftsOnDevice(userA), false);
  });
});
