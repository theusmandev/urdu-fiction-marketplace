import { z } from 'zod';

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const uuidSchema = z
  .string()
  .regex(uuidRegex, 'Invalid UUID format');

export const suspendNovelSchema = z.object({
  novelId: uuidSchema,
  reason: z
    .string()
    .trim()
    .min(3, 'A justification reason of at least 3 characters is required'),
});

export const unsuspendNovelSchema = z.object({
  novelId: uuidSchema,
});

export const setNovelFeaturedSchema = z.object({
  novelId: uuidSchema,
  featured: z.boolean(),
});

export const createGenreSchema = z.object({
  nameEnglish: z.string().trim().min(2, 'English name must be at least 2 characters'),
  nameUrdu: z.string().trim().min(2, 'Urdu name must be at least 2 characters'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .optional()
    .or(z.literal('')),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

export const updateGenreSchema = z.object({
  genreId: uuidSchema,
  nameEnglish: z.string().trim().min(2, 'English name must be at least 2 characters'),
  nameUrdu: z.string().trim().min(2, 'Urdu name must be at least 2 characters'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .optional()
    .or(z.literal('')),
  isActive: z.boolean().default(true),
});

export const platformSettingsSchema = z
  .object({
    defaultCommissionRate: z.coerce
      .number()
      .min(0, 'Platform fee rate cannot be less than 0%')
      .max(100, 'Platform fee rate cannot exceed 100%'),
    defaultUnpaidCommissionLimit: z.coerce
      .number()
      .min(0, 'Unpaid platform fee threshold cannot be negative'),
    disputeWindowDays: z.coerce
      .number()
      .int('Dispute window must be whole days')
      .min(1, 'Dispute window must be at least 1 day')
      .max(365, 'Dispute window cannot exceed 365 days'),
    minNovelPricePkr: z.coerce
      .number()
      .int('Minimum novel price must be a whole rupee amount')
      .min(1, 'Minimum novel price must be at least 1 PKR'),
    maxNovelPricePkr: z.coerce
      .number()
      .int('Maximum novel price must be a whole rupee amount')
      .min(1, 'Maximum novel price must be greater than 0 PKR'),
    maxOrdersPerHour: z.coerce
      .number()
      .int('Max orders per hour must be a whole number')
      .min(1, 'Max orders per hour must be at least 1')
      .max(100, 'Max orders per hour cannot exceed 100')
      .default(5),
    maxChapterReadsPerWindow: z.coerce
      .number()
      .int('Max chapter reads must be a whole number')
      .min(1, 'Max chapter reads must be at least 1')
      .max(1000, 'Max chapter reads cannot exceed 1000')
      .default(20),
    chapterReadWindowMinutes: z.coerce
      .number()
      .int('Window minutes must be a whole number')
      .min(1, 'Window minutes must be at least 1')
      .max(1440, 'Window minutes cannot exceed 1440')
      .default(10),
    invoiceDueDays: z.coerce
      .number()
      .int('Invoice due days must be a whole number')
      .min(1, 'Invoice due days must be at least 1 day')
      .max(90, 'Invoice due days cannot exceed 90 days')
      .default(7),
    overdueGraceDays: z.coerce
      .number()
      .int('Overdue grace days must be a whole number')
      .min(0, 'Overdue grace days cannot be negative')
      .max(60, 'Overdue grace days cannot exceed 60 days')
      .default(3),
    minDisputeWaitHours: z.coerce
      .number()
      .int('Min dispute wait hours must be a whole number')
      .min(0, 'Min dispute wait hours must be between 0 and 168')
      .max(168, 'Min dispute wait hours cannot exceed 168 hours')
      .default(24),
    verificationReminderHours: z.coerce
      .number()
      .int('Verification reminder hours must be a whole number')
      .min(1, 'Verification reminder hours must be between 1 and 168')
      .max(168, 'Verification reminder hours cannot exceed 168 hours')
      .default(12),
    supportEmail: z.string().trim().email('Please enter a valid support email address'),
    tipsEnabled: z.boolean().default(true),
    tipMinPkr: z.coerce
      .number()
      .int('Minimum tip must be a whole number')
      .min(1, 'Minimum tip must be at least 1 PKR')
      .max(50000, 'Minimum tip cannot exceed 50,000 PKR')
      .default(20),
    tipMaxPkr: z.coerce
      .number()
      .int('Maximum tip must be a whole number')
      .min(1, 'Maximum tip must be at least 1 PKR')
      .max(50000, 'Maximum tip cannot exceed 50,000 PKR')
      .default(5000),
    maxTipsPerHour: z.coerce
      .number()
      .int('Max tips per hour must be a whole number')
      .min(1, 'Max tips per hour must be at least 1')
      .max(100, 'Max tips per hour cannot exceed 100')
      .default(5),
    tipDailyCapPkrPerReader: z.coerce
      .number()
      .int('Daily tip cap must be a whole number')
      .min(100, 'Daily tip cap must be at least 100 PKR')
      .max(500000, 'Daily tip cap cannot exceed 500,000 PKR')
      .default(10000),
    tipConfirmReminderHours: z.coerce
      .number()
      .int('Tip reminder hours must be a whole number')
      .min(1, 'Tip reminder hours must be between 1 and 168')
      .max(168, 'Tip reminder hours cannot exceed 168 hours')
      .default(48),
  })
  .refine((data) => data.minNovelPricePkr <= data.maxNovelPricePkr, {
    message: 'Minimum novel price cannot exceed maximum novel price',
    path: ['minNovelPricePkr'],
  })
  .refine((data) => data.tipMinPkr <= data.tipMaxPkr, {
    message: 'Minimum tip cannot exceed maximum tip',
    path: ['tipMinPkr'],
  });

export const writerCommissionTermsSchema = z.object({
  writerId: uuidSchema,
  customCommissionRate: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
      z.number().min(0).max(100).nullable()
    )
    .optional(),
  unpaidCommissionLimit: z.coerce
    .number()
    .min(0, 'Limit cannot be negative')
    .optional(),
  reason: z
    .string()
    .trim()
    .min(3, 'A justification reason of at least 3 characters is required'),
});

export const adminUpdateUserRoleStatusSchema = z.object({
  userId: uuidSchema,
  role: z.enum(['reader', 'writer', 'admin'], {
    message: 'Invalid role selection',
  }),
  isActive: z.boolean(),
  reason: z
    .string()
    .trim()
    .min(3, 'A reason of at least 3 characters is required for this action'),
});

export const rejectNovelSchema = z.object({
  novelId: uuidSchema,
  reason: z
    .string()
    .trim()
    .min(3, 'Rejection reason must be at least 3 characters'),
});

export const writerActionReasonSchema = z.object({
  writerId: uuidSchema,
  reason: z
    .string()
    .trim()
    .min(3, 'A reason of at least 3 characters is required'),
});
