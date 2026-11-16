-- 027_rollback_supabase_rls_and_privileges.sql
-- Rollback for Supabase PostgreSQL Hardening & RLS Enforcement

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS tikum_app_full_access ON public.%I;', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS postgres_full_access ON public.%I;', r.tablename);
  END LOOP;
END $$;
