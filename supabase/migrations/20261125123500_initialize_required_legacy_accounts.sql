-- Initialize only recognized legacy accounts referenced by saved years.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.budget_accounts, public.budget_ui_years IN SHARE ROW EXCLUSIVE MODE;
WITH RECURSIVE documents AS (
 SELECT user_id,budget_data AS doc FROM public.budget_ui_years
), months AS (
 SELECT user_id,m FROM documents CROSS JOIN LATERAL jsonb_array_elements(COALESCE(doc->'months','[]'::jsonb)) m
), entries AS (
 SELECT user_id,k,e FROM months CROSS JOIN unnest(ARRAY['income','fixed','variable','creditCards','loans','expenses']) k
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m->k,'[]'::jsonb)) e
), rules AS (
 SELECT user_id,e FROM documents CROSS JOIN LATERAL jsonb_array_elements(COALESCE(doc->'recurringRules','[]'::jsonb)) e
 UNION ALL
 SELECT user_id,v FROM rules CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e->'versions','[]'::jsonb)) v
), refs AS (
 SELECT user_id,e->>field AS id FROM (SELECT user_id,e FROM entries UNION ALL SELECT user_id,e FROM rules) items
 CROSS JOIN unnest(ARRAY['accountId','account_id','acct']) field
 WHERE jsonb_typeof(e->field)='string'
 UNION
 SELECT user_id,legacy FROM entries CROSS JOIN unnest(ARRAY['cpm','usaa']) legacy
 WHERE k='income' AND CASE WHEN btrim(e->>legacy) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
 THEN (e->>legacy)::numeric<>0 ELSE false END
)
INSERT INTO public.budget_accounts(user_id,id,name,included)
SELECT DISTINCT user_id,id,CASE id WHEN 'cpm' THEN 'CPM Federal' ELSE 'USAA' END,true
FROM refs WHERE id IN ('cpm','usaa')
ON CONFLICT (user_id,id) DO NOTHING;
-- Unknown or malformed references remain subject to the subsequent strict FK migration.
COMMIT;
