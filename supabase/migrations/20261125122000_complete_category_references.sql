BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.budget_ui_years, public.budget_recurring_rules IN SHARE ROW EXCLUSIVE MODE;
CREATE FUNCTION budget_internal.extract_rule_category_refs(items jsonb)
RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $rule_refs$
DECLARE item jsonb; field text; ref text;
BEGIN
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid recurring inventory' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid recurring item' USING ERRCODE='23514'; END IF;
  FOREACH field IN ARRAY ARRAY['category','categoryId','category_id'] LOOP
   IF NOT item ? field THEN CONTINUE; END IF;
   IF jsonb_typeof(item->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid recurring category' USING ERRCODE='23514'; END IF;
   ref := item->>field;
   IF ref !~ '^[a-zA-Z0-9_-]{1,80}$' THEN RAISE EXCEPTION 'Invalid recurring category' USING ERRCODE='23514'; END IF;
   IF ref NOT IN ('income','fixed','variable','loan','cc') THEN RETURN NEXT ref; END IF;
  END LOOP;
  IF item ? 'versions' THEN
   RETURN QUERY SELECT * FROM budget_internal.extract_rule_category_refs(item->'versions');
  END IF;
 END LOOP;
END $rule_refs$;
REVOKE ALL ON FUNCTION budget_internal.extract_rule_category_refs(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION budget_internal.extract_category_refs(document jsonb)
RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $extract$
DECLARE month_doc jsonb; entry jsonb; collection text; field text; ref text;
BEGIN
 IF jsonb_typeof(document) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid budget document' USING ERRCODE='23514'; END IF;
 IF document ? 'recurringRules' THEN
  RETURN QUERY SELECT * FROM budget_internal.extract_rule_category_refs(document->'recurringRules');
 END IF;
 IF NOT document ? 'months' THEN RETURN; END IF;
 IF jsonb_typeof(document->'months') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid budget months' USING ERRCODE='23514'; END IF;
 FOR month_doc IN SELECT value FROM jsonb_array_elements(document->'months') LOOP
  IF jsonb_typeof(month_doc) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid budget month' USING ERRCODE='23514'; END IF;
  FOREACH collection IN ARRAY ARRAY['expenses','fixed','variable'] LOOP
   IF NOT month_doc ? collection THEN CONTINUE; END IF;
   IF jsonb_typeof(month_doc->collection) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid expense collection' USING ERRCODE='23514'; END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(month_doc->collection) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid expense entry' USING ERRCODE='23514'; END IF;
    IF collection='expenses' AND NOT (entry ? 'categoryId' OR entry ? 'category_id') THEN
     RAISE EXCEPTION 'Missing expense category' USING ERRCODE='23514';
    END IF;
    IF entry ? 'categoryId' AND entry ? 'category_id' AND entry->'categoryId' IS DISTINCT FROM entry->'category_id' THEN
     RAISE EXCEPTION 'Conflicting expense category aliases' USING ERRCODE='23514';
    END IF;
    FOREACH field IN ARRAY ARRAY['categoryId','category_id'] LOOP
     IF NOT entry ? field THEN CONTINUE; END IF;
     IF jsonb_typeof(entry->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid category reference' USING ERRCODE='23514'; END IF;
     ref := entry->>field;
     IF ref !~ '^[a-zA-Z0-9_-]{1,80}$' THEN RAISE EXCEPTION 'Invalid category reference' USING ERRCODE='23514'; END IF;
     IF ref NOT IN ('fixed','variable') THEN RETURN NEXT ref; END IF;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
END $extract$;

CREATE TABLE budget_internal.rule_category_refs (
 user_id uuid NOT NULL, rule_id text NOT NULL, category_id text NOT NULL,
 PRIMARY KEY(user_id,rule_id,category_id),
 FOREIGN KEY(user_id,rule_id) REFERENCES public.budget_recurring_rules(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,category_id) REFERENCES public.budget_expense_categories(user_id,id) ON DELETE NO ACTION
);
ALTER TABLE budget_internal.rule_category_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON budget_internal.rule_category_refs FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX rule_category_refs_category_idx ON budget_internal.rule_category_refs(user_id,category_id);
CREATE FUNCTION budget_internal.sync_rule_category_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $sync_rule$
BEGIN
 IF current_setting('role',true)='authenticated' AND auth.uid() IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Rule owner mismatch' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN DELETE FROM budget_internal.rule_category_refs WHERE user_id=OLD.user_id AND rule_id=OLD.id; END IF;
 INSERT INTO budget_internal.rule_category_refs SELECT DISTINCT NEW.user_id,NEW.id,ref FROM budget_internal.extract_rule_category_refs(NEW.versions) AS refs(ref);
 RETURN NEW;
END $sync_rule$;
REVOKE ALL ON FUNCTION budget_internal.sync_rule_category_refs() FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO budget_internal.rule_category_refs SELECT DISTINCT r.user_id,r.id,ref FROM public.budget_recurring_rules r CROSS JOIN LATERAL budget_internal.extract_rule_category_refs(r.versions) AS refs(ref);
INSERT INTO budget_internal.year_category_refs SELECT DISTINCT y.user_id,y.year,ref FROM public.budget_ui_years y CROSS JOIN LATERAL budget_internal.extract_category_refs(y.budget_data) AS refs(ref) ON CONFLICT DO NOTHING;
CREATE TRIGGER sync_rule_category_refs AFTER INSERT OR UPDATE ON public.budget_recurring_rules FOR EACH ROW EXECUTE FUNCTION budget_internal.sync_rule_category_refs();
COMMIT;
