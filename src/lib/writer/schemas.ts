import { z } from 'zod';
import type { PaymentMethodType } from '@/types/database';

// Pakistani mobile numbers: 03XXXXXXXXX (11 digits) or +923XXXXXXXXX (13 chars)
export const PAKISTANI_MOBILE_REGEX = /^(?:\+92|0)3[0-9]{9}$/;

// Pakistani IBAN: PK + 2 check digits + 4 bank alpha code + 16 alphanumeric account digits = 24 chars
export const PK_IBAN_REGEX = /^PK[0-9]{2}[A-Za-z]{4}[0-9A-Za-z]{16}$/;

/**
 * Validates a Pakistani mobile number.
 */
export function validatePakistaniMobile(input: string): boolean {
  const clean = input.replace(/[\s\-]/g, '');
  return PAKISTANI_MOBILE_REGEX.test(clean);
}

/**
 * Validates a Pakistani IBAN.
 */
export function validatePkIban(input: string): boolean {
  const clean = input.replace(/[\s\-]/g, '').toUpperCase();
  return PK_IBAN_REGEX.test(clean);
}

/**
 * Masks sensitive account numbers for display in lists.
 */
export function maskAccountNumber(methodType: PaymentMethodType | string, accountNumber: string): string {
  const clean = accountNumber.replace(/[\s\-]/g, '');
  if (!clean) return '';

  if (methodType === 'bank_iban') {
    // Show PK + 2 digits, mask middle, show last 4
    if (clean.length < 8) return clean;
    return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
  }

  // Mobile number (JazzCash, EasyPaisa, Raast)
  if (clean.length <= 6) return clean;
  return `${clean.slice(0, 4)}••••${clean.slice(-3)}`;
}

/**
 * Writer Profile update schema
 */
export const writerProfileSchema = z.object({
  pen_name_urdu: z
    .string()
    .trim()
    .min(2, 'Urdu pen name must be at least 2 characters.')
    .max(100, 'Urdu pen name cannot exceed 100 characters.'),
  pen_name_english: z
    .string()
    .trim()
    .min(2, 'English pen name must be at least 2 characters.')
    .max(100, 'English pen name cannot exceed 100 characters.'),
  bio_urdu: z.string().trim().max(2000, 'Urdu bio cannot exceed 2,000 characters.').optional().or(z.literal('')),
  bio_english: z.string().trim().max(2000, 'English bio cannot exceed 2,000 characters.').optional().or(z.literal('')),
  avatar_url: z.string().url('Invalid avatar URL.').nullable().optional().or(z.literal('')),
});

export type WriterProfileInput = z.infer<typeof writerProfileSchema>;

/**
 * Writer Payment Method schema
 */
export const paymentMethodSchema = z
  .object({
    method_id: z.string().uuid().optional(),
    method_type: z.enum(['jazzcash', 'easypaisa', 'raast', 'bank_iban']),
    account_title: z
      .string()
      .trim()
      .min(2, 'Account title is required (at least 2 characters).')
      .max(120, 'Account title cannot exceed 120 characters.'),
    account_number_or_iban: z
      .string()
      .trim()
      .min(5, 'Account number is required.')
      .max(34, 'Account number cannot exceed 34 characters.'),
    bank_name: z.string().trim().max(100).optional().or(z.literal('')),
    instructions_note: z.string().trim().max(500, 'Instructions cannot exceed 500 characters.').optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    const rawNumber = data.account_number_or_iban.replace(/[\s\-]/g, '');

    if (data.method_type === 'bank_iban') {
      if (!validatePkIban(rawNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['account_number_or_iban'],
          message: 'Please enter a valid 24-character Pakistani IBAN (e.g. PK36SCBL0000001123456701).',
        });
      }
      if (!data.bank_name || data.bank_name.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bank_name'],
          message: 'Bank name is required for bank transfer / IBAN.',
        });
      }
    } else {
      // Wallet or Raast
      // Raast can be either an IBAN or a mobile number
      const isMobile = validatePakistaniMobile(rawNumber);
      const isIban = validatePkIban(rawNumber);

      if (data.method_type === 'raast') {
        if (!isMobile && !isIban) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['account_number_or_iban'],
            message: 'Raast ID must be a valid Pakistani mobile number (03XXXXXXXXX) or IBAN.',
          });
        }
      } else {
        // JazzCash or EasyPaisa
        if (!isMobile) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['account_number_or_iban'],
            message: 'Please enter a valid Pakistani mobile number (03XXXXXXXXX or +923XXXXXXXXX).',
          });
        }
      }
    }
  });

export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

/**
 * Novel creation & update schema
 */
export const novelFormSchema = z.object({
  title_urdu: z
    .string()
    .trim()
    .min(2, 'Urdu title is required (at least 2 characters).')
    .max(200, 'Urdu title cannot exceed 200 characters.'),
  title_english: z
    .string()
    .trim()
    .min(2, 'English title is required (at least 2 characters).')
    .max(200, 'English title cannot exceed 200 characters.'),
  synopsis_urdu: z
    .string()
    .trim()
    .min(10, 'Urdu synopsis must be at least 10 characters.')
    .max(3000, 'Urdu synopsis cannot exceed 3,000 characters.'),
  description_urdu: z
    .string()
    .trim()
    .max(10000, 'Detailed description cannot exceed 10,000 characters.')
    .optional()
    .or(z.literal('')),
  cover_url: z.string().url('Invalid cover image URL.').nullable().optional().or(z.literal('')),
  cover_public_id: z.string().optional().nullable().or(z.literal('')),
  price_pkr: z.coerce
    .number()
    .int('Price must be an integer.')
    .min(0, 'Price cannot be negative.')
    .max(5000, 'Price cannot exceed PKR 5,000.'),
  language: z.string().default('ur'),
  genre_ids: z.array(z.string().uuid('Invalid genre ID.')).min(1, 'Please select at least one genre.'),
  rights_declaration_accepted: z.boolean().refine((val) => val === true, {
    message: 'You must declare that you hold full copyright/distribution rights.',
  }),
});

export type NovelFormInput = z.infer<typeof novelFormSchema>;

/**
 * Chapter form schema
 */
export const chapterFormSchema = z.object({
  chapter_number: z.coerce.number().int().positive('Chapter number must be greater than 0.'),
  title_urdu: z
    .string()
    .trim()
    .min(1, 'Urdu chapter title is required.')
    .max(200, 'Title cannot exceed 200 characters.'),
  content_urdu: z
    .string()
    .trim()
    .min(1, 'Chapter content cannot be empty.')
    .max(120000, 'Chapter content exceeds maximum limit of 120,000 characters.'),
  is_free_preview: z.boolean().default(false),
  is_published: z.boolean().default(true),
});

export type ChapterFormInput = z.infer<typeof chapterFormSchema>;
