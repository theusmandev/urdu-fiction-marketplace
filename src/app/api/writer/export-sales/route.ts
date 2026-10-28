import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateCsvContent } from '@/lib/commission/csv';
import type { WriterLedgerEntry } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new NextResponse('Unauthorized: Please log in.', { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get('from') || null;
    const to = searchParams.get('to') || null;
    const entryType = searchParams.get('entry_type') || null;

    // Fetch up to 1000 rows for the author
    const { data, error } = await supabase.rpc('get_my_ledger', {
      p_from: from,
      p_to: to,
      p_entry_type: entryType,
      p_limit: 1000,
      p_offset: 0,
    });

    if (error) {
      return new NextResponse(`Export failed: ${error.message}`, { status: 500 });
    }

    const entries: WriterLedgerEntry[] = data?.entries || [];

    const headers = [
      'Date (UTC)',
      'Order Number',
      'Novel Title',
      'Reader',
      'Entry Type',
      'Gross Amount (PKR)',
      'Platform Fee Rate (%)',
      'Platform Fee (PKR)',
      'Writer Net (PKR)',
      'Invoice Number',
      'Notes',
    ];

    const rows = entries.map((entry) => [
      entry.created_at,
      entry.order_number || 'N/A',
      entry.novel_title,
      entry.reader_display_name,
      entry.entry_type,
      entry.gross_amount_pkr.toFixed(2),
      entry.commission_rate.toFixed(2),
      entry.platform_commission_pkr.toFixed(2),
      entry.writer_net_pkr.toFixed(2),
      entry.invoice_number || 'Unbilled',
      entry.notes || '',
    ]);

    const csvContent = generateCsvContent(headers, rows);
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `unb_sales_ledger_${dateStamp}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during CSV generation';
    return new NextResponse(message, { status: 500 });
  }
}
