/**
 * UNB Premium — Tip Validation & Security Helpers
 */

export interface TipValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates custom or preset tip amount against platform/writer bounds.
 */
export function validateTipAmount(
  amount: number,
  min: number = 20,
  max: number = 5000
): TipValidationResult {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { valid: false, error: 'Please enter a valid numeric amount.' };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Tip amount must be a positive number.' };
  }

  // Must be whole rupees (no fractional paise)
  if (Math.floor(amount) !== amount) {
    return { valid: false, error: 'Tip amount must be in whole rupees (no paise).' };
  }

  if (amount < min) {
    return { valid: false, error: `Tip amount must be at least PKR ${min}.` };
  }

  if (amount > max) {
    return { valid: false, error: `Tip amount cannot exceed PKR ${max}.` };
  }

  return { valid: true };
}

/**
 * Validates Transaction Reference ID (TID) according to Pakistani payment rails standards.
 */
export function validateTid(tid: string): TipValidationResult {
  const clean = (tid || '').trim();

  if (clean.length === 0) {
    return { valid: false, error: 'Transaction reference (TID) is required.' };
  }

  if (clean.length < 6) {
    return { valid: false, error: 'Transaction reference (TID) must be at least 6 characters.' };
  }

  if (clean.length > 40) {
    return { valid: false, error: 'Transaction reference (TID) cannot exceed 40 characters.' };
  }

  // Only alphanumeric, hyphens, and underscores
  if (!/^[A-Za-z0-9_-]+$/.test(clean)) {
    return {
      valid: false,
      error: 'TID can only contain letters, numbers, hyphens, and underscores (no spaces or symbols).',
    };
  }

  return { valid: true };
}

/**
 * Validates optional reader appreciation message (max 300 characters).
 */
export function validateTipMessage(message?: string | null): TipValidationResult {
  if (!message) return { valid: true };

  const clean = message.trim();
  if (clean.length > 300) {
    return {
      valid: false,
      error: `Message is ${clean.length} characters long. Maximum allowed is 300 characters.`,
    };
  }

  return { valid: true };
}

/**
 * Validates writer preset amounts (1 to 4 integers, within bounds).
 */
export function validatePresetAmounts(
  presets: number[],
  min: number = 20,
  max: number = 50000
): TipValidationResult {
  if (!Array.isArray(presets) || presets.length === 0) {
    return { valid: false, error: 'At least one preset amount is required.' };
  }

  if (presets.length > 4) {
    return { valid: false, error: 'At most 4 preset amounts can be configured.' };
  }

  for (const p of presets) {
    if (typeof p !== 'number' || isNaN(p) || p <= 0 || Math.floor(p) !== p) {
      return { valid: false, error: 'Presets must be positive whole numbers.' };
    }
    if (p < min || p > max) {
      return { valid: false, error: `Preset PKR ${p} is outside allowed bounds [${min}, ${max}].` };
    }
  }

  return { valid: true };
}
