-- anon ko public tables par koi write nahi
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- financial tables par client writes band (sab kuch RPC se hoga)
revoke insert, update, delete, truncate on public.orders from authenticated;
revoke insert, update, delete, truncate on public.payment_submissions from authenticated;
revoke insert, update, delete, truncate on public.commission_invoices from authenticated;

-- notifications: user sirf apni read-status badal sake
revoke update on public.notifications from authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;