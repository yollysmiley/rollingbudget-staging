BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.budget_accounts, public.budget_ui_years, public.budget_recurring_rules IN SHARE ROW EXCLUSIVE MODE;
CREATE FUNCTION budget_internal.extract_account_fields(item jsonb)
RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fields$
DECLARE field text; ref text; prior text;
BEGIN
 IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid account reference object' USING ERRCODE='23514'; END IF;
 FOREACH field IN ARRAY ARRAY['accountId','account_id','acct'] LOOP
  IF NOT item ? field OR item->field='null'::jsonb THEN CONTINUE; END IF;
  IF jsonb_typeof(item->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid account reference' USING ERRCODE='23514'; END IF;
  ref:=item->>field;
  IF ref='' THEN CONTINUE; END IF;
  IF ref !~ '^[^[:space:]](.*[^[:space:]])?$' OR length(ref)>80 THEN RAISE EXCEPTION 'Invalid account reference' USING ERRCODE='23514'; END IF;
  IF prior IS NOT NULL AND prior<>ref THEN RAISE EXCEPTION 'Conflicting account aliases' USING ERRCODE='23514'; END IF;
  prior:=ref;
 END LOOP;
 IF prior IS NOT NULL THEN RETURN NEXT prior; END IF;
END $fields$;
CREATE FUNCTION budget_internal.extract_rule_account_refs(items jsonb)
RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $rules$
DECLARE item jsonb;
BEGIN
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid recurring inventory' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  RETURN QUERY SELECT * FROM budget_internal.extract_account_fields(item);
  IF item ? 'versions' THEN RETURN QUERY SELECT * FROM budget_internal.extract_rule_account_refs(item->'versions'); END IF;
 END LOOP;
END $rules$;
CREATE FUNCTION budget_internal.extract_year_account_refs(document jsonb)
RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $years$
DECLARE month_doc jsonb; entry jsonb; collection text; legacy text; raw text;
BEGIN
 IF jsonb_typeof(document) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid budget document' USING ERRCODE='23514'; END IF;
 IF document ? 'recurringRules' THEN RETURN QUERY SELECT * FROM budget_internal.extract_rule_account_refs(document->'recurringRules'); END IF;
 IF NOT document ? 'months' THEN RETURN; END IF;
 IF jsonb_typeof(document->'months') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid budget months' USING ERRCODE='23514'; END IF;
 FOR month_doc IN SELECT value FROM jsonb_array_elements(document->'months') LOOP
  IF jsonb_typeof(month_doc) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid budget month' USING ERRCODE='23514'; END IF;
  FOREACH collection IN ARRAY ARRAY['income','fixed','variable','creditCards','loans','expenses'] LOOP
   IF NOT month_doc ? collection THEN CONTINUE; END IF;
   IF jsonb_typeof(month_doc->collection) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid account collection' USING ERRCODE='23514'; END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(month_doc->collection) LOOP
    RETURN QUERY SELECT * FROM budget_internal.extract_account_fields(entry);
    IF collection='income' THEN
     FOREACH legacy IN ARRAY ARRAY['cpm','usaa'] LOOP
      raw:=entry->>legacy;
      IF raw IS NULL OR btrim(raw)='' THEN CONTINUE; END IF;
      IF btrim(raw) !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' THEN RAISE EXCEPTION 'Invalid legacy income' USING ERRCODE='23514'; END IF;
      IF raw::numeric<>0 THEN RETURN NEXT legacy; END IF;
     END LOOP;
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END $years$;
REVOKE ALL ON FUNCTION budget_internal.extract_account_fields(jsonb), budget_internal.extract_rule_account_refs(jsonb), budget_internal.extract_year_account_refs(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE budget_internal.year_account_refs (
 user_id uuid NOT NULL, year integer NOT NULL, account_id text NOT NULL,
 PRIMARY KEY(user_id,year,account_id),
 FOREIGN KEY(user_id,year) REFERENCES public.budget_ui_years(user_id,year) ON DELETE CASCADE,
 FOREIGN KEY(user_id,account_id) REFERENCES public.budget_accounts(user_id,id) ON DELETE NO ACTION
);
ALTER TABLE budget_internal.year_account_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON budget_internal.year_account_refs FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX year_account_refs_account_idx ON budget_internal.year_account_refs(user_id,account_id);
CREATE FUNCTION budget_internal.sync_year_account_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $sync_year$
DECLARE refs text[];
BEGIN
 IF current_setting('role',true)='authenticated' AND auth.uid() IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Owner mismatch' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.year IS DISTINCT FROM NEW.year THEN RAISE EXCEPTION 'Reference parent identity cannot change' USING ERRCODE='23514'; END IF;
  IF OLD.budget_data IS NOT DISTINCT FROM NEW.budget_data THEN RETURN NEW; END IF;
 END IF;
 SELECT ARRAY(SELECT DISTINCT ref FROM budget_internal.extract_year_account_refs(NEW.budget_data) AS x(ref)) INTO refs;
 DELETE FROM budget_internal.year_account_refs WHERE user_id=NEW.user_id AND year=NEW.year AND NOT(account_id=ANY(refs));
 INSERT INTO budget_internal.year_account_refs(user_id,year,account_id)
 SELECT NEW.user_id,NEW.year,ref FROM unnest(refs) AS x(ref)
 WHERE NOT EXISTS (SELECT 1 FROM budget_internal.year_account_refs e WHERE e.user_id=NEW.user_id AND e.year=NEW.year AND e.account_id=x.ref);
 RETURN NEW;
END $sync_year$;
REVOKE ALL ON FUNCTION budget_internal.sync_year_account_refs() FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO budget_internal.year_account_refs SELECT DISTINCT p.user_id,p.year,ref FROM public.budget_ui_years p CROSS JOIN LATERAL budget_internal.extract_year_account_refs(p.budget_data) AS x(ref);
CREATE TRIGGER sync_year_account_refs AFTER INSERT OR UPDATE ON public.budget_ui_years FOR EACH ROW EXECUTE FUNCTION budget_internal.sync_year_account_refs();

CREATE TABLE budget_internal.rule_account_refs (
 user_id uuid NOT NULL, rule_id text NOT NULL, account_id text NOT NULL,
 PRIMARY KEY(user_id,rule_id,account_id),
 FOREIGN KEY(user_id,rule_id) REFERENCES public.budget_recurring_rules(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,account_id) REFERENCES public.budget_accounts(user_id,id) ON DELETE NO ACTION
);
ALTER TABLE budget_internal.rule_account_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON budget_internal.rule_account_refs FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX rule_account_refs_account_idx ON budget_internal.rule_account_refs(user_id,account_id);
CREATE FUNCTION budget_internal.sync_rule_account_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $sync_rule$
DECLARE refs text[];
BEGIN
 IF current_setting('role',true)='authenticated' AND auth.uid() IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Owner mismatch' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.id IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'Reference parent identity cannot change' USING ERRCODE='23514'; END IF;
  IF OLD.versions IS NOT DISTINCT FROM NEW.versions THEN RETURN NEW; END IF;
 END IF;
 SELECT ARRAY(SELECT DISTINCT ref FROM budget_internal.extract_rule_account_refs(NEW.versions) AS x(ref)) INTO refs;
 DELETE FROM budget_internal.rule_account_refs WHERE user_id=NEW.user_id AND rule_id=NEW.id AND NOT(account_id=ANY(refs));
 INSERT INTO budget_internal.rule_account_refs(user_id,rule_id,account_id)
 SELECT NEW.user_id,NEW.id,ref FROM unnest(refs) AS x(ref)
 WHERE NOT EXISTS (SELECT 1 FROM budget_internal.rule_account_refs e WHERE e.user_id=NEW.user_id AND e.rule_id=NEW.id AND e.account_id=x.ref);
 RETURN NEW;
END $sync_rule$;
REVOKE ALL ON FUNCTION budget_internal.sync_rule_account_refs() FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO budget_internal.rule_account_refs SELECT DISTINCT p.user_id,p.id,ref FROM public.budget_recurring_rules p CROSS JOIN LATERAL budget_internal.extract_rule_account_refs(p.versions) AS x(ref);
CREATE TRIGGER sync_rule_account_refs AFTER INSERT OR UPDATE ON public.budget_recurring_rules FOR EACH ROW EXECUTE FUNCTION budget_internal.sync_rule_account_refs();
COMMIT;
