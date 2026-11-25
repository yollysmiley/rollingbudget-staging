BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION budget_internal.sync_year_category_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $sync_year$
DECLARE refs text[];
BEGIN
 IF current_setting('role',true)='authenticated' AND auth.uid() IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Owner mismatch' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.year IS DISTINCT FROM NEW.year THEN
   RAISE EXCEPTION 'Reference parent identity cannot change' USING ERRCODE='23514';
  END IF;
  IF OLD.budget_data IS NOT DISTINCT FROM NEW.budget_data THEN RETURN NEW; END IF;
 END IF;
 SELECT ARRAY(SELECT DISTINCT ref FROM budget_internal.extract_category_refs(NEW.budget_data) AS x(ref)) INTO refs;
 DELETE FROM budget_internal.year_category_refs WHERE user_id=NEW.user_id AND year=NEW.year AND NOT(category_id=ANY(refs));
 INSERT INTO budget_internal.year_category_refs(user_id,year,category_id)
 SELECT NEW.user_id,NEW.year,ref FROM unnest(refs) AS x(ref)
 WHERE NOT EXISTS (SELECT 1 FROM budget_internal.year_category_refs existing WHERE existing.user_id=NEW.user_id AND existing.year=NEW.year AND existing.category_id=x.ref);
 RETURN NEW;
END $sync_year$;
CREATE OR REPLACE FUNCTION budget_internal.sync_rule_category_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $sync_rule$
DECLARE refs text[];
BEGIN
 IF current_setting('role',true)='authenticated' AND auth.uid() IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Owner mismatch' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.id IS DISTINCT FROM NEW.id THEN
   RAISE EXCEPTION 'Reference parent identity cannot change' USING ERRCODE='23514';
  END IF;
  IF OLD.versions IS NOT DISTINCT FROM NEW.versions THEN RETURN NEW; END IF;
 END IF;
 SELECT ARRAY(SELECT DISTINCT ref FROM budget_internal.extract_rule_category_refs(NEW.versions) AS x(ref)) INTO refs;
 DELETE FROM budget_internal.rule_category_refs WHERE user_id=NEW.user_id AND rule_id=NEW.id AND NOT(category_id=ANY(refs));
 INSERT INTO budget_internal.rule_category_refs(user_id,rule_id,category_id)
 SELECT NEW.user_id,NEW.id,ref FROM unnest(refs) AS x(ref)
 WHERE NOT EXISTS (SELECT 1 FROM budget_internal.rule_category_refs existing WHERE existing.user_id=NEW.user_id AND existing.rule_id=NEW.id AND existing.category_id=x.ref);
 RETURN NEW;
END $sync_rule$;
COMMIT;
