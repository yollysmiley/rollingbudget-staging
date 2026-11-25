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
       ('00000000-0000-4000-8000-000000000202', 'test-checking', 'Test Checking B'),
       ('00000000-0000-4000-8000-000000000202', 'other-only', 'Foreign Owner Only');
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

-- B3 contract: cross-owner account IDs and deletion races must be denied
-- by PostgreSQL even when an application-side preflight has become stale.
DO $account_refs$
DECLARE
  rejected boolean;
  count_int integer;
BEGIN
  rejected := false;
  BEGIN
    INSERT INTO public.budget_recurring_rules
      (user_id,id,name,category,amount,frequency,start_date,versions,account_id)
    VALUES
      ('00000000-0000-4000-8000-000000000101','cross-owner-reference','Cross-owner reference',
       'fixed',25,'monthly','2028-01-15','[]'::jsonb,'other-only');
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Composite FK permitted another owner account'; END IF;

  rejected := false;
  BEGIN
    DELETE FROM public.budget_accounts
    WHERE user_id='00000000-0000-4000-8000-000000000101'
      AND id='test-checking';
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Referenced account was deleted'; END IF;

  SELECT count(*) INTO count_int FROM public.budget_accounts
  WHERE user_id='00000000-0000-4000-8000-000000000101' AND id='test-checking';
  IF count_int <> 1 THEN RAISE EXCEPTION 'Failed deletion changed referenced account'; END IF;
  SELECT count(*) INTO count_int FROM public.budget_recurring_rules
  WHERE user_id='00000000-0000-4000-8000-000000000101'
    AND id='month-end-rule' AND account_id='test-checking';
  IF count_int <> 1 THEN RAISE EXCEPTION 'Failed deletion changed the recurring rule'; END IF;

  INSERT INTO public.budget_accounts(user_id,id,name)
  VALUES ('00000000-0000-4000-8000-000000000101','no-rules','Unreferenced A');
  DELETE FROM public.budget_accounts
  WHERE user_id='00000000-0000-4000-8000-000000000101' AND id='no-rules';
  GET DIAGNOSTICS count_int = ROW_COUNT;
  IF count_int <> 1 THEN RAISE EXCEPTION 'Unreferenced account cannot be deleted'; END IF;
END
$account_refs$;


-- B3 lifecycle contract: inactive, future and expired references remain protected.
-- Use dedicated synthetic accounts so existing RLS/date fixtures remain intact.
DO $lifecycle$
DECLARE
  scenario text;
  affected integer;
  rejected boolean;
  owner_id uuid := '00000000-0000-4000-8000-000000000101';
BEGIN
  FOREACH scenario IN ARRAY ARRAY['inactive','future','historical'] LOOP
    INSERT INTO public.budget_accounts (user_id,id,name)
    VALUES (owner_id, 'lifecycle-' || scenario, 'Lifecycle ' || scenario);
    INSERT INTO public.budget_recurring_rules
      (user_id,id,name,category,amount,frequency,start_date,end_date,active,account_id,versions)
    VALUES
      (owner_id,'lifecycle-' || scenario,'Lifecycle ' || scenario,'fixed',1,'monthly',
       CASE WHEN scenario = 'future' THEN '2199-01-15'::date ELSE '2020-01-15'::date END,
       CASE WHEN scenario = 'historical' THEN '2020-02-15'::date ELSE NULL END,
       scenario <> 'inactive','lifecycle-' || scenario,'[]'::jsonb);

    rejected := false;
    BEGIN
      DELETE FROM public.budget_accounts
      WHERE user_id = owner_id AND id = 'lifecycle-' || scenario;
    EXCEPTION WHEN foreign_key_violation THEN rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'Referenced % account was deleted', scenario;
    END IF;
    IF (SELECT count(*) FROM public.budget_accounts
        WHERE user_id = owner_id AND id = 'lifecycle-' || scenario) <> 1 OR
       (SELECT count(*) FROM public.budget_recurring_rules
        WHERE user_id = owner_id AND id = 'lifecycle-' || scenario
          AND account_id = 'lifecycle-' || scenario) <> 1 THEN
      RAISE EXCEPTION 'Failed % deletion modified account or rule', scenario;
    END IF;

    -- Only an explicit owner-scoped dependency removal may unblock deletion.
    DELETE FROM public.budget_recurring_rules
    WHERE user_id = owner_id AND id = 'lifecycle-' || scenario;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Rule cleanup failed for %', scenario; END IF;
    DELETE FROM public.budget_accounts
    WHERE user_id = owner_id AND id = 'lifecycle-' || scenario;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Account deletion remained blocked for %', scenario; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.budget_accounts
      WHERE user_id = owner_id AND id LIKE 'lifecycle-%') OR
     EXISTS (SELECT 1 FROM public.budget_recurring_rules
      WHERE user_id = owner_id AND id LIKE 'lifecycle-%') THEN
    RAISE EXCEPTION 'Lifecycle fixture cleanup incomplete';
  END IF;
END
$lifecycle$;

-- #92: embedded references must be enforced by the database.
DO $embedded$
DECLARE owner_id uuid := '00000000-0000-4000-8000-000000000101';
BEGIN
 INSERT INTO public.budget_accounts(user_id,id,name) VALUES(owner_id,'embedded','Embedded account');
 INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES(owner_id,'embedded','Embedded category');
 UPDATE public.budget_ui_years SET budget_data='{"months":[{"expenses":[{"accountId":"embedded","categoryId":"embedded"}]}]}' WHERE user_id=owner_id AND year=2028;
 BEGIN
  DELETE FROM public.budget_accounts WHERE user_id=owner_id AND id='embedded';
  RAISE EXCEPTION 'Embedded account deletion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  DELETE FROM public.budget_expense_categories WHERE user_id=owner_id AND id='embedded';
  RAISE EXCEPTION 'Embedded category deletion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 UPDATE public.budget_ui_years SET budget_data='{}' WHERE user_id=owner_id AND year=2028;
 UPDATE public.budget_recurring_rules SET versions='[{"accountId":"embedded","category":"embedded"}]' WHERE user_id=owner_id AND id='rule-1';
 BEGIN
  DELETE FROM public.budget_accounts WHERE user_id=owner_id AND id='embedded';
  RAISE EXCEPTION 'Historical account deletion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  DELETE FROM public.budget_expense_categories WHERE user_id=owner_id AND id='embedded';
  RAISE EXCEPTION 'Historical category deletion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 UPDATE public.budget_recurring_rules SET versions='[]' WHERE user_id=owner_id AND id='rule-1';
 DELETE FROM public.budget_accounts WHERE user_id=owner_id AND id='embedded';
 DELETE FROM public.budget_expense_categories WHERE user_id=owner_id AND id='embedded';
END
$embedded$;

RESET ROLE;
ROLLBACK;
SELECT 'B4 PostgreSQL RLS, date, and B3 account FK contracts passed' AS result;
