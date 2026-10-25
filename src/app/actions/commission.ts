'use server';

import { createServerClient } from '@/lib/supabase/server';
import { reportCommissionPaymentSchema, type ReportCommissionPaymentInput } from '@/lib/commission/schemas';
import { revalidatePath } from 'next/cache';

export async function reportCommissionPaymentAction(rawInput: ReportCommissionPaymentInput): Promise<{
  success: boolean;
  error?: string;
  reportId?: string;
  isDuplicateTid?: boolean;
}> {
  try {
    const parseResult = reportCommissionPaymentSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message || 'Invalid payment report data.',
      };
    }

    const { invoiceId, amountPkr, tid, screenshotPath, writerNote } = parseResult.data;
    const supabase = await createServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const { data, error } = await supabase.rpc('report_commission_payment', {
      p_invoice_id: invoiceId,
      p_amount_pkr: amountPkr,
      p_tid: tid,
      p_screenshot_path: screenshotPath,
      p_writer_note: writerNote || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/writer/commission/${invoiceId}`);
    revalidatePath('/writer/commission');
    revalidatePath('/writer');

    return {
      success: true,
      reportId: data?.report_id,
      isDuplicateTid: data?.is_duplicate_tid ?? false,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred.',
    };
  }
}
