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
    watermarkEnabled: z.boolean().default(true),
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

export const impersonateWriterSchema = z.object({
  writerId: uuidSchema,
  reason: z
    .string()
    .trim()
    .min(5, 'A support justification reason of at least 5 characters is required'),
});

export const retentionSettingsSchema = z.object({
  retention_audit_logs_days: z.coerce
    .number()
    .int('Days must be an integer')
    .min(-1, 'Must be at least -1 (-1 or 0 means unlimited)')
    .max(3650, 'Retention cannot exceed 3,650 days (10 years)'),
  retention_chapter_reads_days: z.coerce
    .number()
    .int('Days must be an integer')
    .min(-1, 'Must be at least -1 (-1 or 0 means unlimited)')
    .max(3650, 'Retention cannot exceed 3,650 days (10 years)'),
  retention_chapter_revisions_days: z.coerce
    .number()
    .int('Days must be an integer')
    .min(-1, 'Must be at least -1 (-1 or 0 means unlimited)')
    .max(3650, 'Retention cannot exceed 3,650 days (10 years)'),
  retention_email_outbox_days: z.coerce
    .number()
    .int('Days must be an integer')
    .min(-1, 'Must be at least -1 (-1 or 0 means unlimited)')
    .max(3650, 'Retention cannot exceed 3,650 days (10 years)'),
  retention_notifications_days: z.coerce
    .number()
    .int('Days must be an integer')
    .min(-1, 'Must be at least -1 (-1 or 0 means unlimited)')
    .max(3650, 'Retention cannot exceed 3,650 days (10 years)'),
  retention_rate_limits_days: z.coerce
    .number()
    .int('Days must be an integer')
    .min(-1, 'Must be at least -1 (-1 or 0 means unlimited)')
    .max(3650, 'Retention cannot exceed 3,650 days (10 years)'),
  retention_chapter_drafts_days: z.coerce
    .number()
    .int('Days must be an integer')
    .min(-1, 'Must be at least -1 (-1 or 0 means unlimited)')
    .max(3650, 'Retention cannot exceed 3,650 days (10 years)'),
  retention_payment_proofs_days: z.coerce
    .number()
    .int('Days must be an integer')
    .min(-1, 'Must be at least -1 (-1 or 0 means unlimited)')
    .max(3650, 'Retention cannot exceed 3,650 days (10 years)'),
});

export type RetentionSettingsInput = z.infer<typeof retentionSettingsSchema>;

export const writerAnnouncementSchema = z
  .object({
    enabled: z.boolean().default(false),
    variant: z.enum(['info', 'feature', 'warning', 'success'], {
      message: 'Invalid announcement tone variant',
    }),
    title_en: z.string().trim().max(160, 'English title cannot exceed 160 characters').default(''),
    title_ur: z.string().trim().max(160, 'Urdu title cannot exceed 160 characters').default(''),
    body_en: z.string().trim().max(600, 'English body cannot exceed 600 characters').default(''),
    body_ur: z.string().trim().max(600, 'Urdu body cannot exceed 600 characters').default(''),
    link_url: z
      .string()
      .trim()
      .default('')
      .refine(
        (url) => {
          if (!url) return true;
          if (/^(javascript|data|vbscript):/i.test(url)) return false;
          return /^(\/|https?:\/\/)/i.test(url);
        },
        {
          message:
            'Link URL must start with "/" (internal route) or "http://" / "https://"',
        }
      ),
    link_label: z.string().trim().max(60, 'Link label cannot exceed 60 characters').default(''),
    dismissible: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (!data.enabled) return true;
      return (
        data.title_en.length > 0 ||
        data.title_ur.length > 0 ||
        data.body_en.length > 0 ||
        data.body_ur.length > 0
      );
    },
    {
      message: 'Active announcements must have at least one non-empty title or message (English or Urdu).',
      path: ['title_en'],
    }
  );

export type WriterAnnouncementInput = z.infer<typeof writerAnnouncementSchema>;

export const dashboardTimeframeSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined || typeof val === 'object') return NaN;
    if (typeof val === 'string' && val.trim() === '') return NaN;
    return Number(val);
  },
  z
    .number()
    .int('Timeframe days must be an integer')
    .refine((days) => [-1, 0, 7, 30, 90, 365].includes(days), {
      message: 'Timeframe must be 7, 30, 90, 365 days, or -1 / 0 for All Time',
    })
);

export type DashboardTimeframeInput = z.infer<typeof dashboardTimeframeSchema>;


