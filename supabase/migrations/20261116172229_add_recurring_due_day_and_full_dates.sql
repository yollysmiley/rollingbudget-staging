-- Additive staging migration: preserve existing clients' text due column while
-- new clients write an integer due_day and new versions carry numeric dueDay.
-- Existing scheduler used start_date's day, so derive legacy due_day from it.
BEGIN;
ALTER TABLE public.budget_recurring_rules
  ADD COLUMN IF NOT EXISTS due_day smallint;
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.budget_recurring_rules'::regclass
      AND conname = 'budget_recurring_due_day_range'
  ) THEN
    ALTER TABLE public.budget_recurring_rules
      ADD CONSTRAINT budget_recurring_due_day_range
      CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31);
  END IF;
END
$migration$;
UPDATE public.budget_recurring_rules
SET due_day = EXTRACT(DAY FROM start_date)::smallint
WHERE due_day IS NULL;
UPDATE public.budget_recurring_rules AS r
SET versions = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN item ? 'dueDay' THEN item
      ELSE item || jsonb_build_object('dueDay', r.due_day) END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(r.versions) WITH ORDINALITY AS v(item, ord)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(r.versions) AS item
  WHERE NOT item ? 'dueDay'
);
-- The UI already accepts exact start/end dates; remove month-first-only
-- constraints that rejected valid day-of-month selections.
ALTER TABLE public.budget_recurring_rules
  DROP CONSTRAINT IF EXISTS recurring_start_month,
  DROP CONSTRAINT IF EXISTS recurring_end_month;
COMMENT ON COLUMN public.budget_recurring_rules.due_day IS
  'Nominal day of month (1-31); occurrences clamp to the final calendar day of shorter months.';
COMMIT;
