-- Reverter o ERP no site (só objetos taf_erp_*; o ciclo semanal e o resto do site não são tocados)

-- PASSO A (antes de apagar): cópia de tudo em um único JSON. Rodar e salvar o resultado em
-- backup/erp-AAAA-MM-DD.json (fora do repositório público: tem documentos reais da obra).
-- A base de cada obra (taf_erp_obra.base_gz) fica de fora porque se recarrega dos arquivos originais do ERP (carga.py).
select jsonb_build_object(
  'gerado_em', now(),
  'taf_erp_obra',      (select coalesce(jsonb_agg(to_jsonb(x) - 'base_gz'), '[]') from public.taf_erp_obra x),
  'taf_erp_doc',       (select coalesce(jsonb_agg(to_jsonb(x) order by x.mud), '[]') from public.taf_erp_doc x),
  'taf_erp_doc_hist',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.hid), '[]') from public.taf_erp_doc_hist x),
  'taf_erp_obra_hist', (select coalesce(jsonb_agg(to_jsonb(x) order by x.hid), '[]') from public.taf_erp_obra_hist x),
  'taf_erp_contador',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_erp_contador x)
) as backup;

-- PASSO B: apagar funções, tabelas e sequência do ERP
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'taf\_erp\_%' or p.proname like '\_taf\_erp\_%') loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;
drop table if exists public.taf_erp_doc_hist, public.taf_erp_obra_hist, public.taf_erp_doc, public.taf_erp_item,
  public.taf_erp_contador, public.taf_erp_obra cascade;
drop sequence if exists public.taf_erp_mud_seq;

-- PASSO C (restaurar, se decidir voltar): aplicar de novo 01_erp.sql e 02_rastro.sql, recarregar a base das obras
-- (carga.py) e depois rodar o bloco abaixo trocando o arquivo pelo JSON do passo A. No psql: \set backup `cat arquivo.json` e depois
-- select set_config('taf.backup', :'backup', false);  (o psql não troca variáveis dentro de $$ ... $$, por isso o DO lê da configuração).
-- Os gatilhos ficam desligados durante a carga para não duplicar o histórico.
-- do $$ declare b jsonb := current_setting('taf.backup')::jsonb; begin
--   alter table public.taf_erp_doc disable trigger user;
--   insert into public.taf_erp_doc select * from jsonb_populate_recordset(null::public.taf_erp_doc, b->'taf_erp_doc');
--   alter table public.taf_erp_doc enable trigger user;
--   insert into public.taf_erp_doc_hist overriding system value select * from jsonb_populate_recordset(null::public.taf_erp_doc_hist, b->'taf_erp_doc_hist');
--   insert into public.taf_erp_obra_hist overriding system value select * from jsonb_populate_recordset(null::public.taf_erp_obra_hist, b->'taf_erp_obra_hist');
--   insert into public.taf_erp_contador select * from jsonb_populate_recordset(null::public.taf_erp_contador, b->'taf_erp_contador')
--     on conflict (obra, tipo) do update set ultimo = excluded.ultimo;
--   update public.taf_erp_obra o set estado = x.estado from jsonb_populate_recordset(null::public.taf_erp_obra, b->'taf_erp_obra') x where x.codigo = o.codigo;
--   perform setval(pg_get_serial_sequence('public.taf_erp_doc_hist','hid'), coalesce((select max(hid) from public.taf_erp_doc_hist),0)+1, false);
--   perform setval(pg_get_serial_sequence('public.taf_erp_obra_hist','hid'), coalesce((select max(hid) from public.taf_erp_obra_hist),0)+1, false);
--   perform setval('public.taf_erp_mud_seq', coalesce((select max(mud) from public.taf_erp_doc),0)+1, false);
-- end $$;
