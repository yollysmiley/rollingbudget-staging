-- Phase 3: owner-global expense category definitions. Existing year documents remain untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.budget_expense_categories (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id ~ '^[a-zA-Z0-9_-]{1,80}$' AND id NOT IN ('fixed', 'variable')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('fixed', 'variable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS budget_expense_categories_user_name_unique
  ON public.budget_expense_categories (user_id, lower(btrim(name)));
REVOKE ALL ON public.budget_expense_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_expense_categories TO authenticated;
ALTER TABLE public.budget_expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_expense_categories_select_own ON public.budget_expense_categories
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY budget_expense_categories_insert_own ON public.budget_expense_categories
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY budget_expense_categories_update_own ON public.budget_expense_categories
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY budget_expense_categories_delete_own ON public.budget_expense_categories
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
COMMIT;
