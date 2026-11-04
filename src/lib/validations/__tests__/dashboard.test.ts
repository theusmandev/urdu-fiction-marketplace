import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardTimeframeSchema } from '../schemas';

describe('Validation Schemas — Dashboard Timeframe', () => {
  it('validates 7, 30, 90, 365, and All Time options', () => {
    assert.equal(dashboardTimeframeSchema.safeParse(7).success, true);
    assert.equal(dashboardTimeframeSchema.safeParse(30).success, true);
    assert.equal(dashboardTimeframeSchema.safeParse(90).success, true);
    assert.equal(dashboardTimeframeSchema.safeParse(365).success, true);
    assert.equal(dashboardTimeframeSchema.safeParse(0).success, true);
    assert.equal(dashboardTimeframeSchema.safeParse(-1).success, true);
  });

  it('rejects unallowed durations', () => {
    assert.equal(dashboardTimeframeSchema.safeParse(15).success, false);
    assert.equal(dashboardTimeframeSchema.safeParse(60).success, false);
    assert.equal(dashboardTimeframeSchema.safeParse('invalid').success, false);
  });
});

