-- Applied to rollingbudget-staging (phiscfwfuzeptetimdbo) as migration
-- 20261029194718_create_staging_budget_data on 2026-10-29.
--
-- Initial schema migration only. No production records, users, credentials,
-- or policies are copied. Staging uses synthetic data only.

BEGIN;

CREATE TABLE public.budget_data (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    state jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz DEFAULT now(),

    CONSTRAINT budget_data_pkey
        PRIMARY KEY (id),

    CONSTRAINT budget_data_user_id_key
        UNIQUE (user_id),

    CONSTRAINT budget_data_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users (id)
        ON DELETE NO ACTION
);

COMMENT ON TABLE public.budget_data IS
    'One budget document per authenticated user. Staging uses synthetic data only.';

-- Remove inherited/default table grants for client roles.
-- This also removes any PUBLIC grants on this table.
REVOKE ALL PRIVILEGES
    ON TABLE public.budget_data
    FROM PUBLIC, anon, authenticated;

-- Required for authenticated API access to objects in this schema.
GRANT USAGE ON SCHEMA public TO authenticated;

-- Row operations only: no TRUNCATE, REFERENCES, or TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.budget_data
    TO authenticated;

ALTER TABLE public.budget_data
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY budget_data_select_own
    ON public.budget_data
    FOR SELECT
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
    );

CREATE POLICY budget_data_insert_own
    ON public.budget_data
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
    );

CREATE POLICY budget_data_update_own
    ON public.budget_data
    FOR UPDATE
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
    )
    WITH CHECK (
        user_id = (SELECT auth.uid())
    );

CREATE POLICY budget_data_delete_own
    ON public.budget_data
    FOR DELETE
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
    );

COMMIT;
