-- Expand recurring categories without rewriting existing rules or historical entries.
-- Owner-scoped application validation requires custom IDs in budget_expense_categories.
BEGIN;
ALTER TABLE public.budget_recurring_rules
  DROP CONSTRAINT IF EXISTS budget_recurring_rules_category_check;
ALTER TABLE public.budget_recurring_rules
  ADD CONSTRAINT budget_recurring_rules_category_check
  CHECK (category IN ('income','fixed','variable','loan','cc')
    OR (category ~ '^[a-zA-Z0-9_-]{1,80}$'
      AND category NOT IN ('income','loan','cc')));
COMMIT;
