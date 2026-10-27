import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTipAmount,
  validateTid,
  validateTipMessage,
  validatePresetAmounts,
} from '../src/lib/tips/validation.ts';

test('Tip Jar Validation Helpers', async (t) => {
  await t.test('validateTipAmount bounds and rules', () => {
    // Valid cases
    assert.deepEqual(validateTipAmount(100), { valid: true });
    assert.deepEqual(validateTipAmount(20, 20, 5000), { valid: true });
    assert.deepEqual(validateTipAmount(5000, 20, 5000), { valid: true });
    assert.deepEqual(validateTipAmount(250), { valid: true });

    // Invalid: below min
    const belowMin = validateTipAmount(10, 20, 5000);
    assert.equal(belowMin.valid, false);
    assert.match(belowMin.error || '', /at least PKR 20/);

    // Invalid: above max
    const aboveMax = validateTipAmount(6000, 20, 5000);
    assert.equal(aboveMax.valid, false);
    assert.match(aboveMax.error || '', /cannot exceed PKR 5000/);

    // Invalid: non-numeric or non-finite
    assert.equal(validateTipAmount(NaN).valid, false);
    assert.equal(validateTipAmount(Infinity).valid, false);
    assert.equal(validateTipAmount(0).valid, false);
    assert.equal(validateTipAmount(-50).valid, false);

    // Invalid: fractional paise
    const fractional = validateTipAmount(99.5);
    assert.equal(fractional.valid, false);
    assert.match(fractional.error || '', /whole rupees/);
  });

  await t.test('validateTid rules', () => {
    // Valid TIDs
    assert.deepEqual(validateTid('ABC12345'), { valid: true });
    assert.deepEqual(validateTid('TID-2026-9999'), { valid: true });
    assert.deepEqual(validateTid('TX_123456_789'), { valid: true });

    // Invalid: empty or whitespace
    assert.equal(validateTid('').valid, false);
    assert.equal(validateTid('   ').valid, false);

    // Invalid: too short (< 6)
    const tooShort = validateTid('12345');
    assert.equal(tooShort.valid, false);
    assert.match(tooShort.error || '', /at least 6 characters/);

    // Invalid: too long (> 40)
    const tooLong = validateTid('A'.repeat(41));
    assert.equal(tooLong.valid, false);
    assert.match(tooLong.error || '', /cannot exceed 40 characters/);

    // Invalid characters (spaces, punctuation, emojis)
    assert.equal(validateTid('TID 123456').valid, false);
    assert.equal(validateTid('TID#123456').valid, false);
    assert.equal(validateTid('TID@123456').valid, false);
  });

  await t.test('validateTipMessage rules', () => {
    // Valid: optional
    assert.deepEqual(validateTipMessage(), { valid: true });
    assert.deepEqual(validateTipMessage(null), { valid: true });
    assert.deepEqual(validateTipMessage(''), { valid: true });
    assert.deepEqual(validateTipMessage('بہت خوبصورت کہانی!'), { valid: true });

    // Valid: exactly 300 characters
    const exact300 = 'A'.repeat(300);
    assert.deepEqual(validateTipMessage(exact300), { valid: true });

    // Invalid: 301 characters
    const over300 = 'A'.repeat(301);
    const result = validateTipMessage(over300);
    assert.equal(result.valid, false);
    assert.match(result.error || '', /Maximum allowed is 300 characters/);
  });

  await t.test('validatePresetAmounts rules', () => {
    // Valid presets
    assert.deepEqual(validatePresetAmounts([100, 250, 500]), { valid: true });
    assert.deepEqual(validatePresetAmounts([50, 100, 200, 500]), { valid: true });

    // Invalid: empty array
    assert.equal(validatePresetAmounts([]).valid, false);

    // Invalid: more than 4 presets
    assert.equal(validatePresetAmounts([10, 20, 30, 40, 50]).valid, false);

    // Invalid: outside bounds
    assert.equal(validatePresetAmounts([10], 20, 5000).valid, false);
    assert.equal(validatePresetAmounts([6000], 20, 5000).valid, false);

    // Invalid: non-integer / fractional
    assert.deepEqual(validatePresetAmounts([100.5]), { valid: false, error: 'Presets must be positive whole numbers.' });
  });
});
