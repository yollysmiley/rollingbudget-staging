-- B3 forward-only, non-destructive owner-scoped protection for global recurring rules.
-- Do not delete, reassign, or rewrite existing recurring definitions or budget entries.
-- Fail closed if legacy/orphan references exist; remediate through owner-approved
-- account restoration or explicit rule reassignment before applying this migration.
BEGIN;
DO $audit$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.budget_recurring_rules AS r
    LEFT JOIN public.budget_accounts AS a
      ON a.user_id = r.user_id AND a.id = r.account_id
    WHERE r.account_id IS NOT NULL AND a.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot add recurring-account FK: orphaned or cross-owner rule account reference exists';
  END IF;
END
$audit$;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.budget_recurring_rules'::regclass
      AND conname = 'budget_recurring_account_owner_fk'
  ) THEN
    ALTER TABLE public.budget_recurring_rules
      ADD CONSTRAINT budget_recurring_account_owner_fk
      FOREIGN KEY (user_id, account_id)
      REFERENCES public.budget_accounts (user_id, id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$constraint$;

ALTER TABLE public.budget_recurring_rules
  VALIDATE CONSTRAINT budget_recurring_account_owner_fk;
COMMIT;
