import { z } from 'zod';

export const usernameRegex = /^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/;

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(100, 'Password is too long.')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must include at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character.');

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters.')
      .max(100, 'Full name cannot exceed 100 characters.'),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Username must be at least 3 characters.')
      .max(30, 'Username cannot exceed 30 characters.')
      .regex(
        usernameRegex,
        'Username must use lowercase letters, numbers, and underscores (3-30 chars, cannot start or end with underscore).'
      ),
    email: z.string().trim().email('Please enter a valid email address.').toLowerCase(),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password.').optional(),
  })
  .refine(
    (data) => !data.confirmPassword || data.password === data.confirmPassword,
    {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    }
  );

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').toLowerCase(),
  password: z.string().min(1, 'Password is required.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').toLowerCase(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const profileUpdateSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(100, 'Full name cannot exceed 100 characters.'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters.')
    .max(30, 'Username cannot exceed 30 characters.')
    .regex(
      usernameRegex,
      'Username must use lowercase letters, numbers, and underscores (3-30 chars).'
    ),
  avatarUrl: z.string().url('Invalid avatar URL.').nullable().optional().or(z.literal('')),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export const profileEditSchema = profileUpdateSchema;

export const becomeWriterSchema = z.object({
  penNameUrdu: z
    .string()
    .trim()
    .min(2, 'Urdu pen name is required (at least 2 characters).')
    .max(100, 'Urdu pen name cannot exceed 100 characters.'),
  penNameEnglish: z
    .string()
    .trim()
    .min(2, 'English pen name is required (at least 2 characters).')
    .max(100, 'English pen name cannot exceed 100 characters.'),
  bioUrdu: z.string().trim().max(1000, 'Bio cannot exceed 1,000 characters.').optional().or(z.literal('')),
  bioEnglish: z.string().trim().max(1000, 'Bio cannot exceed 1,000 characters.').optional().or(z.literal('')),
  acceptAgreement: z.boolean().refine((val) => val === true, {
    message: 'You must accept the Writer Platform Agreement to apply.',
  }),
});

export type BecomeWriterInput = z.infer<typeof becomeWriterSchema>;
export const writerApplicationSchema = becomeWriterSchema;
