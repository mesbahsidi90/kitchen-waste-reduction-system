-- Supabase creates this trigger function when automatic RLS is enabled.
-- Trigger execution does not require Data API roles to call it directly.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
