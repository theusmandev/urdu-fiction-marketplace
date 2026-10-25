import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapQuery, unwrapSingleQuery } from '../src/lib/supabase/query.ts';
import type { PostgrestError } from '@supabase/supabase-js';

describe('src/lib/supabase/query.ts helper', () => {
  it('returns data and null error on successful query result', () => {
    const mockResult = {
      data: [{ id: 'novel-1', title: 'Test Novel' }],
      error: null,
    };

    const unwrapped = unwrapQuery(mockResult, 'TestContext');
    assert.equal(unwrapped.error, null);
    assert.equal(unwrapped.isNotFound, false);
    assert.deepEqual(unwrapped.data, [{ id: 'novel-1', title: 'Test Novel' }]);
  });

  it('captures error code, message, hint, details and logs them on PostgrestError', () => {
    const mockError: PostgrestError = {
      code: 'PGRST200',
      message: "Could not find a relationship between 'novels' and 'writer_id' in the schema cache",
      details: 'Searched for foreign key relationship',
      hint: 'Perhaps you meant writer_profiles!writer_id',
      name: 'PostgrestError',
    };

    const unwrapped = unwrapQuery({ data: null, error: mockError }, 'NovelsQuery');
    assert.equal(unwrapped.data, null);
    assert.ok(unwrapped.error);
    assert.equal(unwrapped.error.code, 'PGRST200');
    assert.equal(unwrapped.error.message, mockError.message);
    assert.equal(unwrapped.error.hint, mockError.hint);
    assert.equal(unwrapped.error.details, mockError.details);
    assert.equal(unwrapped.error.isNotFound, false);
  });

  it('distinguishes PGRST116 zero-row from genuine errors in unwrapSingleQuery', () => {
    // 1. Genuine error: PGRST200 or 500
    const dbError: PostgrestError = {
      code: '42501',
      message: 'permission denied for table writer_profiles',
      details: null,
      hint: null,
      name: 'PostgrestError',
    };

    const resError = unwrapSingleQuery({ data: null, error: dbError }, 'AdminDetailPage');
    assert.equal(resError.data, null);
    assert.equal(resError.isNotFound, false); // NOT safe to 404! It is a DB error!
    assert.equal(resError.error?.code, '42501');

    // 2. Query succeeded with 0 rows (null data, no error from maybeSingle)
    const emptyResult = unwrapSingleQuery({ data: null, error: null }, 'AdminDetailPage');
    assert.equal(emptyResult.data, null);
    assert.equal(emptyResult.error, null);
    assert.equal(emptyResult.isNotFound, true); // Safe to call notFound()!

    // 3. Query succeeded with data
    const successResult = unwrapSingleQuery({ data: { id: 'writer-123' }, error: null }, 'AdminDetailPage');
    assert.deepEqual(successResult.data, { id: 'writer-123' });
    assert.equal(successResult.error, null);
    assert.equal(successResult.isNotFound, false);
  });
});
