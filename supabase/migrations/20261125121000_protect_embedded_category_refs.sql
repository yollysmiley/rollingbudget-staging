BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.budget_ui_years IN SHARE ROW EXCLUSIVE MODE;
CREATE SCHEMA budget_internal;
REVOKE ALL ON SCHEMA budget_internal FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE budget_internal.year_category_refs (
 user_id uuid NOT NULL,
 year integer NOT NULL,
 category_id text NOT NULL,
 PRIMARY KEY (user_id,year,category_id),
 FOREIGN KEY (user_id,year) REFERENCES public.budget_ui_years(user_id,year) ON DELETE CASCADE,
 FOREIGN KEY (user_id,category_id) REFERENCES public.budget_expense_categories(user_id,id) ON DELETE NO ACTION
);
ALTER TABLE budget_internal.year_category_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON budget_internal.year_category_refs FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX year_category_refs_category_idx ON budget_internal.year_category_refs(user_id,category_id);
CREATE FUNCTION budget_internal.extract_category_refs(document jsonb)
RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $extract$
DECLARE month_doc jsonb; entry jsonb; collection text; field text; ref text;
BEGIN
 IF jsonb_typeof(document) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid budget document' USING ERRCODE='23514'; END IF;
 IF NOT document ? 'months' THEN RETURN; END IF;
 IF jsonb_typeof(document->'months') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid budget months' USING ERRCODE='23514'; END IF;
 FOR month_doc IN SELECT value FROM jsonb_array_elements(document->'months') LOOP
  IF jsonb_typeof(month_doc) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid budget month' USING ERRCODE='23514'; END IF;
  FOREACH collection IN ARRAY ARRAY['expenses','fixed','variable'] LOOP
   IF NOT month_doc ? collection THEN CONTINUE; END IF;
   IF jsonb_typeof(month_doc->collection) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid expense collection' USING ERRCODE='23514'; END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(month_doc->collection) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid expense entry' USING ERRCODE='23514'; END IF;
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
REVOKE ALL ON FUNCTION budget_internal.extract_category_refs(jsonb) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION budget_internal.sync_year_category_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $sync$
BEGIN
 IF current_setting('role',true) = 'authenticated' AND auth.uid() IS DISTINCT FROM NEW.user_id THEN
  RAISE EXCEPTION 'Budget owner mismatch' USING ERRCODE='42501';
 END IF;
 IF TG_OP = 'UPDATE' THEN
  DELETE FROM budget_internal.year_category_refs WHERE user_id=OLD.user_id AND year=OLD.year;
 END IF;
 INSERT INTO budget_internal.year_category_refs(user_id,year,category_id)
 SELECT DISTINCT NEW.user_id,NEW.year,ref FROM budget_internal.extract_category_refs(NEW.budget_data) AS refs(ref);
 RETURN NEW;
END $sync$;
REVOKE ALL ON FUNCTION budget_internal.sync_year_category_refs() FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO budget_internal.year_category_refs(user_id,year,category_id)
 SELECT DISTINCT y.user_id,y.year,ref FROM public.budget_ui_years y
 CROSS JOIN LATERAL budget_internal.extract_category_refs(y.budget_data) AS refs(ref);
CREATE TRIGGER sync_year_category_refs AFTER INSERT OR UPDATE ON public.budget_ui_years
 FOR EACH ROW EXECUTE FUNCTION budget_internal.sync_year_category_refs();
COMMIT;
