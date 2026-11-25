-- Phase 3C.2B: enforce owner-scoped custom recurring categories.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.budget_expense_categories
 ADD CONSTRAINT budget_expense_categories_reserved_id_check
 CHECK (id NOT IN ('income','fixed','variable','loan','cc'));
ALTER TABLE public.budget_recurring_rules
 ADD COLUMN custom_category_id text GENERATED ALWAYS AS
 (CASE WHEN category IN ('income','fixed','variable','loan','cc') THEN NULL ELSE category END) STORED;
ALTER TABLE public.budget_recurring_rules
 ADD CONSTRAINT budget_recurring_category_owner_fk
 FOREIGN KEY (user_id,custom_category_id)
 REFERENCES public.budget_expense_categories(user_id,id) ON DELETE NO ACTION;
CREATE INDEX budget_recurring_category_owner_idx
 ON public.budget_recurring_rules(user_id,custom_category_id);
COMMIT;
