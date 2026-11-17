-- Phase 4A: additive, owner-scoped storage for cross-year recurring definitions.
-- Existing budget_ui_years documents and generated entries remain untouched.
BEGIN;
CREATE TABLE public.budget_recurring_rules (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  category text NOT NULL CHECK (category IN ('income','fixed','variable','loan','cc')),
  amount numeric NOT NULL CHECK (amount >= 0),
  due text NOT NULL DEFAULT '',
  account_id text,
  frequency text NOT NULL CHECK (frequency IN ('monthly','every-2-months','quarterly','every-6-months','annually')),
  start_date date NOT NULL,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  versions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(versions) = 'array'),
  source_year integer,
  source_rule_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,id),
  CONSTRAINT recurring_dates_valid CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT recurring_start_month CHECK (extract(day from start_date) = 1),
  CONSTRAINT recurring_end_month CHECK (end_date IS NULL OR extract(day from end_date) = 1),
  CONSTRAINT recurring_source_pair CHECK ((source_year IS NULL) = (source_rule_id IS NULL))
);
CREATE UNIQUE INDEX budget_recurring_rules_legacy_source_unique
 ON public.budget_recurring_rules (user_id,source_year,source_rule_id)
 WHERE source_year IS NOT NULL;
REVOKE ALL ON TABLE public.budget_recurring_rules FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.budget_recurring_rules TO authenticated;
ALTER TABLE public.budget_recurring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_select_own ON public.budget_recurring_rules FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY recurring_insert_own ON public.budget_recurring_rules FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()));
CREATE POLICY recurring_update_own ON public.budget_recurring_rules FOR UPDATE TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
CREATE POLICY recurring_delete_own ON public.budget_recurring_rules FOR DELETE TO authenticated USING (user_id=(SELECT auth.uid()));
COMMIT;
