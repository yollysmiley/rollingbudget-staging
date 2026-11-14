-- Read-only verification of staging public-schema default privileges.
-- Run after 20261114192802_harden_public_default_privileges.

SELECT
    d.defaclrole::regrole::text AS creator_role,
    n.nspname AS schema_name,
    d.defaclobjtype AS object_type,
    d.defaclacl AS default_acl
FROM pg_default_acl AS d
LEFT JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
WHERE d.defaclrole = 'postgres'::regrole
  AND (n.nspname = 'public' OR n.nspname IS NULL)
ORDER BY d.defaclobjtype, n.nspname;

-- Expected for postgres-created objects in public: client roles have no
-- default table, sequence, or function privileges; PUBLIC has no EXECUTE.

SELECT
    has_table_privilege('anon', 'public.budget_data', 'SELECT') AS anon_can_read_legacy,
    has_table_privilege('authenticated', 'public.budget_data', 'SELECT') AS authenticated_can_read_legacy,
    has_table_privilege('authenticated', 'public.budget_data', 'TRUNCATE') AS authenticated_can_truncate_legacy,
    has_table_privilege('authenticated', 'public.budget_ui_years', 'SELECT') AS authenticated_can_read_new_ui;
