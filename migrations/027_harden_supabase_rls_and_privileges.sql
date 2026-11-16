-- 027_harden_supabase_rls_and_privileges.sql
-- TIKUM / ARGUS Supabase PostgreSQL Hardening & RLS Enforcement
-- Resolves SEC-01: Revokes excessive permissions from anon/authenticated and enforces RLS.

-- 1. Revoke all privileges from anon and authenticated on public schema
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- 2. Ensure backend application role (tikum_app) has full table & sequence access
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tikum_app') THEN
    GRANT USAGE ON SCHEMA public TO tikum_app;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO tikum_app;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO tikum_app;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO tikum_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tikum_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tikum_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO tikum_app;
  END IF;
END $$;

-- 3. Enable RLS and assign explicit full-access policies to backend role
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    -- Enable Row Level Security
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    
    -- Drop old policies if they exist
    EXECUTE format('DROP POLICY IF EXISTS tikum_app_full_access ON public.%I;', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS postgres_full_access ON public.%I;', r.tablename);
    
    -- Policy for backend role tikum_app
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tikum_app') THEN
      EXECUTE format('CREATE POLICY tikum_app_full_access ON public.%I FOR ALL TO tikum_app USING (true) WITH CHECK (true);', r.tablename);
    END IF;

    -- Policy for superuser / connection role postgres
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
      EXECUTE format('CREATE POLICY postgres_full_access ON public.%I FOR ALL TO postgres USING (true) WITH CHECK (true);', r.tablename);
    END IF;
  END LOOP;
END $$;
