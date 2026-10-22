-- Reverter o ciclo semanal v1 (só objetos taf_ciclo_*; nada do site atual é tocado)

-- PASSO A (antes de apagar): cópia de tudo em um único JSON. Rodar e salvar o resultado em
-- backup/ciclo-AAAA-MM-DD.json (fora do repositório público).
select jsonb_build_object(
  'gerado_em', now(),
  'taf_ciclo_obra',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_obra x),
  'taf_ciclo_feriado', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_feriado x),
  'taf_ciclo_area',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_area x),
  'taf_ciclo_chave',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_chave x),
  'taf_ciclo_ativ',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_ativ x),
  'taf_ciclo_semana',  (select coalesce(jsonb_agg(to_jsonb(x) - 'sexta'), '[]') from public.taf_ciclo_semana x),
  'taf_ciclo_demanda', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_demanda x),
  'taf_ciclo_comp',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_comp x),
  'taf_ciclo_fora',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_fora x),
  'taf_ciclo_preparo', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_preparo x),
  'taf_ciclo_apont',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.taf_ciclo_apont x),
  'taf_ciclo_replan',  (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from public.taf_ciclo_replan x),
  'taf_ciclo_evento',  (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from public.taf_ciclo_evento x),
  'taf_ciclo_log',     (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from public.taf_ciclo_log x)
) as backup;

-- PASSO B: apagar funções, tabelas e domínio do ciclo (migration taf_ciclo_v1_reverter)
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'taf\_ciclo\_%' or p.proname like '\_taf\_ciclo\_%') loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;
drop table if exists public.taf_ciclo_log, public.taf_ciclo_evento, public.taf_ciclo_replan, public.taf_ciclo_apont,
  public.taf_ciclo_preparo, public.taf_ciclo_fora, public.taf_ciclo_comp, public.taf_ciclo_demanda,
  public.taf_ciclo_semana, public.taf_ciclo_ativ, public.taf_ciclo_chave, public.taf_ciclo_area,
  public.taf_ciclo_feriado, public.taf_ciclo_obra cascade;
drop domain if exists public.taf_ciclo_causa;

-- PASSO C (restaurar, se decidir voltar): aplicar de novo 01_tabelas.sql e 02_funcoes.sql (NÃO o 03) e
-- depois rodar o bloco abaixo trocando o arquivo pelo JSON do passo A. No psql: \set backup `cat arquivo.json` e depois
-- select set_config('taf.backup', :'backup', false);  (o psql não troca variáveis dentro de $$ ... $$, por isso o DO lê da configuração).
-- Os gatilhos ficam desligados durante a carga para não duplicar o histórico nem barrar o congelado.
-- do $$ declare b jsonb := current_setting('taf.backup')::jsonb; t text; begin
--   foreach t in array array['taf_ciclo_obra','taf_ciclo_feriado','taf_ciclo_area','taf_ciclo_chave','taf_ciclo_ativ',
--     'taf_ciclo_semana','taf_ciclo_demanda','taf_ciclo_comp','taf_ciclo_fora','taf_ciclo_preparo','taf_ciclo_apont',
--     'taf_ciclo_replan','taf_ciclo_evento','taf_ciclo_log'] loop
--     execute format('alter table public.%I disable trigger user', t);
--     execute format('insert into public.%I overriding system value select * from jsonb_populate_recordset(null::public.%I, $1)', t, t)
--       using b -> t;
--     execute format('alter table public.%I enable trigger user', t);
--   end loop;
--   perform setval(pg_get_serial_sequence('public.taf_ciclo_replan','id'), coalesce((select max(id) from public.taf_ciclo_replan),0)+1, false);
--   perform setval(pg_get_serial_sequence('public.taf_ciclo_evento','id'), coalesce((select max(id) from public.taf_ciclo_evento),0)+1, false);
--   perform setval(pg_get_serial_sequence('public.taf_ciclo_log','id'),    coalesce((select max(id) from public.taf_ciclo_log),0)+1, false);
-- end $$;
