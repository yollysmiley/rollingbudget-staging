-- Custom expense categories are user-defined cards, not fixed/variable classifications.
-- Preserve historical kind values for backward compatibility; new categories have no kind.
BEGIN;
ALTER TABLE public.budget_expense_categories ALTER COLUMN kind DROP NOT NULL;
ALTER TABLE public.budget_expense_categories DROP CONSTRAINT IF EXISTS budget_expense_categories_kind_check;
ALTER TABLE public.budget_expense_categories ADD CONSTRAINT budget_expense_categories_kind_check
  CHECK (kind IS NULL OR kind IN ('fixed', 'variable'));
COMMIT;
