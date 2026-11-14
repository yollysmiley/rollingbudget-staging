-- Separate storage for the redesigned multi-year budget UI.
-- Deliberately does not alter or migrate legacy Release 2 rows in public.budget_data.

BEGIN;

CREATE TABLE public.budget_ui_years (
    user_id uuid NOT NULL
        REFERENCES auth.users (id) ON DELETE NO ACTION,
    year integer NOT NULL
        CHECK (year BETWEEN 1900 AND 2200),
    budget_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT budget_ui_years_pkey PRIMARY KEY (user_id, year)
);

COMMENT ON TABLE public.budget_ui_years IS
    'Year-by-year documents for the redesigned staging budget UI. Separate from legacy Release 2 public.budget_data.';

REVOKE ALL PRIVILEGES
    ON TABLE public.budget_ui_years
    FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.budget_ui_years
    TO authenticated;

ALTER TABLE public.budget_ui_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY budget_ui_years_select_own
    ON public.budget_ui_years
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY budget_ui_years_insert_own
    ON public.budget_ui_years
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY budget_ui_years_update_own
    ON public.budget_ui_years
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY budget_ui_years_delete_own
    ON public.budget_ui_years
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

COMMIT;
