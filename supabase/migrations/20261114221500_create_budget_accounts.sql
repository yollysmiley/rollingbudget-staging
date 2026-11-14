-- Phase 1: per-user account catalog; existing budget year documents are unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS public.budget_accounts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(trim(id)) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budget_accounts_pkey PRIMARY KEY (user_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS budget_accounts_user_name_unique
  ON public.budget_accounts (user_id, lower(trim(name)));
REVOKE ALL ON public.budget_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_accounts TO authenticated;
ALTER TABLE public.budget_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_accounts_select_own ON public.budget_accounts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY budget_accounts_insert_own ON public.budget_accounts FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY budget_accounts_update_own ON public.budget_accounts FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY budget_accounts_delete_own ON public.budget_accounts FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
COMMIT;
