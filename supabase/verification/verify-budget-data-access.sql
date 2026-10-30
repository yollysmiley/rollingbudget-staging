-- Read-only verification for public.budget_data on rollingbudget-staging.
-- Run after applying 20261029194718_create_staging_budget_data.

-- Confirm RLS is enabled.
SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'budget_data';

-- Confirm the four ownership policies.
SELECT
    policyname,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'budget_data'
ORDER BY policyname;

-- Confirm effective table privileges for ordinary client roles.
SELECT
    role_name,
    has_table_privilege(
        role_name, 'public.budget_data', 'SELECT'
    ) AS can_select,
    has_table_privilege(
        role_name, 'public.budget_data', 'INSERT'
    ) AS can_insert,
    has_table_privilege(
        role_name, 'public.budget_data', 'UPDATE'
    ) AS can_update,
    has_table_privilege(
        role_name, 'public.budget_data', 'DELETE'
    ) AS can_delete,
    has_table_privilege(
        role_name, 'public.budget_data', 'TRUNCATE'
    ) AS can_truncate,
    has_table_privilege(
        role_name, 'public.budget_data', 'REFERENCES'
    ) AS can_reference,
    has_table_privilege(
        role_name, 'public.budget_data', 'TRIGGER'
    ) AS can_create_trigger
FROM (
    VALUES ('anon'::text), ('authenticated'::text)
) AS client_roles(role_name);

-- Expected: anon has no privileges; authenticated has only
-- SELECT/INSERT/UPDATE/DELETE, all subject to RLS.
