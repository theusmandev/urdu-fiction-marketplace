'use server';

import { createServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import {
  confirmCommissionSettlementSchema,
  rejectCommissionReportSchema,
  recordCommissionAdjustmentSchema,
  voidCommissionInvoiceSchema,
  platformPaymentMethodSchema,
  type ConfirmCommissionSettlementInput,
  type RejectCommissionReportInput,
  type RecordCommissionAdjustmentInput,
  type VoidCommissionInvoiceInput,
  type PlatformPaymentMethodInput,
} from '@/lib/commission/schemas';
import { revalidatePath } from 'next/cache';

export async function previewCommissionInvoiceAction(
  writerId: string,
  periodStart: string,
  periodEnd: string
) {
  await requireRole('admin', '/admin/commission');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('preview_commission_invoice', {
    p_writer_id: writerId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, preview: data };
}

export async function generateCommissionInvoiceAction(
  writerId: string,
  periodStart: string,
  periodEnd: string
) {
  await requireRole('admin', '/admin/commission');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('generate_commission_invoice', {
    p_writer_id: writerId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/commission/writers/${writerId}`);
  revalidatePath('/admin/commission');
  revalidatePath('/admin');

  return { success: true, invoice: data };
}

export async function voidCommissionInvoiceAction(rawInput: VoidCommissionInvoiceInput) {
  await requireRole('admin', '/admin/invoices');
  const parsed = voidCommissionInvoiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input.' };
  }

  const { invoiceId, reason } = parsed.data;
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('void_commission_invoice', {
    p_invoice_id: invoiceId,
    p_reason: reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath('/admin/invoices');
  revalidatePath('/admin/commission');

  return { success: true, result: data };
}

export async function confirmCommissionSettlementAction(rawInput: ConfirmCommissionSettlementInput) {
  await requireRole('admin', '/admin/invoices');
  const parsed = confirmCommissionSettlementSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid settlement data.' };
  }

  const { invoiceId, amountPkr, reportId, adminNote } = parsed.data;
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('confirm_commission_settlement', {
    p_invoice_id: invoiceId,
    p_amount_pkr: amountPkr,
    p_report_id: reportId || null,
    p_admin_note: adminNote || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath('/admin/invoices');
  revalidatePath('/admin/commission');
  revalidatePath('/admin/commission/reports');
  revalidatePath('/admin');

  return { success: true, result: data };
}

export async function rejectCommissionReportAction(rawInput: RejectCommissionReportInput) {
  await requireRole('admin', '/admin/invoices');
  const parsed = rejectCommissionReportSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid rejection data.' };
  }

  const { reportId, reason } = parsed.data;
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('reject_commission_report', {
    p_report_id: reportId,
    p_reason: reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/commission/reports');
  revalidatePath('/admin/invoices');
  revalidatePath('/admin');

  return { success: true, result: data };
}

export async function recordCommissionAdjustmentAction(rawInput: RecordCommissionAdjustmentInput) {
  await requireRole('admin', '/admin/commission');
  const parsed = recordCommissionAdjustmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid adjustment data.' };
  }

  const { writerId, amountPkr, reason } = parsed.data;
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('record_commission_adjustment', {
    p_writer_id: writerId,
    p_amount_pkr: amountPkr,
    p_reason: reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/commission/writers/${writerId}`);
  revalidatePath('/admin/commission');
  revalidatePath('/admin');

  return { success: true, result: data };
}

export async function applyOverdueRulesAction(apply: boolean) {
  await requireRole('admin', '/admin/commission');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('apply_overdue_rules', {
    p_apply: apply,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/commission');
  revalidatePath('/admin/invoices');
  revalidatePath('/admin');

  return { success: true, result: data };
}

export async function upsertPlatformPaymentMethodAction(rawInput: PlatformPaymentMethodInput) {
  await requireRole('admin', '/admin/settings');
  const parsed = platformPaymentMethodSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid payment method data.' };
  }

  const { id, methodType, accountTitle, accountNumberOrIban, bankName, instructionsNote } = parsed.data;
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('upsert_platform_payment_method', {
    p_id: id || null,
    p_method_type: methodType,
    p_account_title: accountTitle,
    p_account_number_or_iban: accountNumberOrIban,
    p_bank_name: bankName || null,
    p_instructions_note: instructionsNote || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin/commission');

  return { success: true, result: data };
}

export async function deactivatePlatformPaymentMethodAction(id: string) {
  await requireRole('admin', '/admin/settings');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('deactivate_platform_payment_method', {
    p_id: id,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin/commission');

  return { success: true, result: data };
}
