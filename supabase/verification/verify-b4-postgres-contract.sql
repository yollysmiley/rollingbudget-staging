-- B4: isolated PostgreSQL contract test after a clean B1 migration replay.
-- PostgreSQL 17 only; all synthetic records are rolled back. No staging credentials.
\set ON_ERROR_STOP on
BEGIN;
GRANT USAGE ON SCHEMA auth TO authenticated;
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202'),
  ('00000000-0000-4000-8000-000000000303');
INSERT INTO public.budget_data (user_id, state)
VALUES ('00000000-0000-4000-8000-000000000101', '{}'::jsonb),
       ('00000000-0000-4000-8000-000000000202', '{}'::jsonb);
INSERT INTO public.budget_ui_years (user_id, year, budget_data)
VALUES ('00000000-0000-4000-8000-000000000101', 2028, '{}'::jsonb),
       ('00000000-0000-4000-8000-000000000202', 2028, '{}'::jsonb);
INSERT INTO public.budget_accounts (user_id, id, name)
VALUES ('00000000-0000-4000-8000-000000000101', 'test-checking', 'Test Checking A'),
       ('00000000-0000-4000-8000-000000000202', 'test-checking', 'Test Checking B');
INSERT INTO public.budget_recurring_rules
  (user_id, id, name, category, amount, frequency, start_date, end_date, due_day, versions)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'rule-1', 'Test rule A', 'fixed', 25, 'monthly', '2028-02-29', '2029-02-28', 29, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000202', 'rule-1', 'Test rule B', 'fixed', 25, 'monthly', '2028-02-29', '2029-02-28', 29, '[]'::jsonb);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
DO $contract$
DECLARE
  other_user uuid := '00000000-0000-4000-8000-000000000202';
  tables text[] := ARRAY['budget_data','budget_ui_years','budget_accounts','budget_recurring_rules'];
  table_name text;
  owned_count integer;
  foreign_count integer;
  affected integer;
  denied boolean;
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', table_name)
      INTO foreign_count USING other_user;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', table_name)
      INTO owned_count USING '00000000-0000-4000-8000-000000000101'::uuid;
    IF foreign_count <> 0 OR owned_count <> 1 THEN
      RAISE EXCEPTION '% SELECT leaks owner data or hides owned data (foreign %, owned %)',
        table_name, foreign_count, owned_count;
    END IF;
    EXECUTE format('UPDATE public.%I SET user_id=user_id WHERE user_id=$1', table_name)
      USING other_user;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
      RAISE EXCEPTION '% UPDATE changed another owner row', table_name;
    END IF;
    EXECUTE format('DELETE FROM public.%I WHERE user_id=$1', table_name)
      USING other_user;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
      RAISE EXCEPTION '% DELETE removed another owner row', table_name;
    END IF;
    -- A visible own row may not be reassigned to another owner (UPDATE WITH CHECK).
    denied := false;
    BEGIN
      EXECUTE format('UPDATE public.%I SET user_id=$1 WHERE user_id=$2', table_name)
        USING '00000000-0000-4000-8000-000000000303'::uuid,
              '00000000-0000-4000-8000-000000000101'::uuid;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION '% UPDATE allowed changing an owned row to another owner', table_name;
    END IF;
    denied := false;
    BEGIN
      IF table_name = 'budget_data' THEN
        INSERT INTO public.budget_data(user_id, state)
          VALUES ('00000000-0000-4000-8000-000000000303','{}'::jsonb);
      ELSIF table_name = 'budget_ui_years' THEN
        INSERT INTO public.budget_ui_years(user_id, year, budget_data)
          VALUES ('00000000-0000-4000-8000-000000000303', 2029, '{}'::jsonb);
      ELSIF table_name = 'budget_accounts' THEN
        INSERT INTO public.budget_accounts(user_id, id, name)
          VALUES ('00000000-0000-4000-8000-000000000303', 'intrusion', 'Foreign account');
      ELSIF table_name = 'budget_recurring_rules' THEN
        INSERT INTO public.budget_recurring_rules
          (user_id,id,name,category,amount,frequency,start_date,versions)
          VALUES ('00000000-0000-4000-8000-000000000303','intrusion','Foreign rule',
                  'fixed', 2, 'monthly', '2028-01-15','[]'::jsonb);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION '% INSERT accepted another owner', table_name;
    END IF;
  END LOOP;
END
$contract$;

-- Date contract: February 29, month ends, non-first-of-month and nullable accounts.
INSERT INTO public.budget_recurring_rules
 (user_id,id,name,category,amount,frequency,start_date,end_date,due_day,versions,account_id)
VALUES
 ('00000000-0000-4000-8000-000000000101','leap-rule','Leap anchored',
  'fixed',30,'annually','2028-02-29','2029-02-28',29,'[]'::jsonb,NULL),
 ('00000000-0000-4000-8000-000000000101','month-end-rule','Month end',
  'variable',30,'quarterly','2028-01-31','2028-12-31',31,'[]'::jsonb,'test-checking');
DO $dates$
DECLARE
  failed boolean;
BEGIN
  IF (SELECT count(*) FROM public.budget_recurring_rules
      WHERE user_id='00000000-0000-4000-8000-000000000101'
        AND id IN ('leap-rule','month-end-rule')) <> 2 THEN
    RAISE EXCEPTION 'Valid calendar dates or nullable accounts were rejected';
  END IF;

  failed := false;
  BEGIN
    INSERT INTO public.budget_recurring_rules
     (user_id,id,name,category,amount,frequency,start_date,due_day,versions)
    VALUES ('00000000-0000-4000-8000-000000000101','bad-due','Bad due',
      'fixed',5,'monthly','2028-01-15',32,'[]'::jsonb);
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Invalid due day was accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO public.budget_recurring_rules
     (user_id,id,name,category,amount,frequency,start_date,end_date,versions)
    VALUES ('00000000-0000-4000-8000-000000000101','bad-range','Bad range',
      'fixed',5,'monthly','2028-04-15','2028-03-31','[]'::jsonb);
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'End date before start date was accepted'; END IF;

  failed := false;
  BEGIN
    EXECUTE $bad$
      INSERT INTO public.budget_recurring_rules
        (user_id,id,name,category,amount,frequency,start_date,versions)
      VALUES ('00000000-0000-4000-8000-000000000101','bad-leap','Bad leap',
        'fixed',5,'annually','2027-02-29'::date,'[]'::jsonb)
    $bad$;
  EXCEPTION WHEN datetime_field_overflow THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Invalid leap day was accepted'; END IF;
END
$dates$;

RESET ROLE;
ROLLBACK;
SELECT 'B4 PostgreSQL RLS and recurring date contract passed' AS result;
