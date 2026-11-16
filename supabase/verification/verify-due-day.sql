-- Read-only staging verification; no user data is returned.
SELECT
  COUNT(*) AS recurring_rules,
  COUNT(*) FILTER (WHERE due_day BETWEEN 1 AND 31) AS rules_with_valid_due_day,
  COUNT(*) FILTER (WHERE due_day IS NULL) AS rules_missing_due_day,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(versions) AS version
    WHERE NOT version ? 'dueDay' OR
      jsonb_typeof(version->'dueDay') <> 'number' OR
      NOT ((version->>'dueDay') ~ '^[0-9]{1,2}$')
  )) AS rules_with_invalid_version_due_day
FROM public.budget_recurring_rules;

SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.budget_recurring_rules'::regclass
  AND conname IN ('budget_recurring_due_day_range', 'recurring_start_month', 'recurring_end_month')
ORDER BY conname;
