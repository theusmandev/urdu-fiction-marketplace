import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/proofs/signed-url?path={order_id}/{filename}
 * 
 * Secure route handler that generates a 60-second temporary signed URL for private payment proofs.
 * Authenticates the caller and authoritatively verifies DB ownership:
 * - Must be the order's reader, OR
 * - Must be the order's writer, OR
 * - Must be a platform administrator.
 */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path');

  if (!path || typeof path !== 'string') {
    return NextResponse.json(
      { error: 'Query parameter "path" is required.' },
      { status: 400 }
    );
  }

  // Prevent path traversal
  if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
    return NextResponse.json(
      { error: 'Invalid path format.' },
      { status: 400 }
    );
  }

  const parts = path.split('/');
  if (parts.length !== 2) {
    return NextResponse.json(
      { error: 'Path must adhere to "{order_id}/{filename}" structure.' },
      { status: 400 }
    );
  }

  const orderId = parts[0];
  if (!UUID_REGEX.test(orderId)) {
    return NextResponse.json(
      { error: 'Invalid order identifier in storage path.' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Authoritative server-verified authentication check
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Authentication required to access private payment proofs.' },
      { status: 401 }
    );
  }

  // Database verification: Look up in orders, or in commission_invoices
  const { data: order } = await supabase
    .from('orders')
    .select('id, reader_id, writer_id')
    .eq('id', orderId)
    .maybeSingle();

  let isAuthorized = false;

  if (order) {
    if (order.reader_id === user.id || order.writer_id === user.id) {
      isAuthorized = true;
    }
  } else {
    // Check if this identifier is a commission invoice
    const { data: invoice } = await supabase
      .from('commission_invoices')
      .select('id, writer_id')
      .eq('id', orderId)
      .maybeSingle();

    if (invoice && invoice.writer_id === user.id) {
      isAuthorized = true;
    }
  }

  // If not direct owner/reader/writer, check if caller is an admin
  if (!isAuthorized) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role === 'admin') {
      isAuthorized = true;
    }
  }

  // Strict multi-tenant isolation guard
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Forbidden: You do not have permission to view payment receipts for this record.' },
      { status: 403 }
    );
  }

  // Generate a strictly time-bounded 60-second signed URL
  const { data: signedData, error: signedError } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(path, 60);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: 'Unable to retrieve private receipt from storage.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { url: signedData.signedUrl },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
