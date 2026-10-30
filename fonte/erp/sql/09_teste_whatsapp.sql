-- Teste do 09_whatsapp_entrada.sql. Roda numa transação e DESFAZ tudo no fim (rollback): nada fica gravado, nem a configuração
-- de teste, nem os fatos. Só num banco de teste novo (ou local) com o 09 aplicado:
--   psql -v ON_ERROR_STOP=1 -f fonte/erp/sql/09_teste_whatsapp.sql
-- Se alguma regra falhar, para com "FALHOU: ..." e a transação é desfeita. Se tudo passar, mostra "09 OK" e desfaz.
-- O segredo e os números abaixo são de teste (prefixo +550000, que não existe): nunca um número de pessoa.

begin;

-- configuração de teste: hash do segredo e lista com um número liberado
insert into ia.config (chave, valor) values
  ('whatsapp_segredo_banco', jsonb_build_object('sha256', encode(extensions.digest('teste09-segredo', 'sha256'), 'hex'))),
  ('whatsapp_allowlist', '["+5500000000001", "+5500000000002"]'::jsonb)
on conflict (chave) do update set valor = excluded.valor;

-- erro(sql) devolve a mensagem de erro do comando, ou null se deu certo (roda com o papel de quem chama)
create function pg_temp.erro(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
create function pg_temp.confere(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_msg; end if; end $$;

do $t$
declare r jsonb; r2 jsonb; f record; n0 bigint;
begin
  select count(*) into n0 from ia.fato where fonte = 'whatsapp';

  -- 1. sem segredo configurado: porta fechada, nada gravado
  delete from ia.config where chave = 'whatsapp_segredo_banco';
  perform pg_temp.confere(pg_temp.erro($$select public.ia_whatsapp_receber('teste09-segredo', '5500000000001', 'Pessoa Teste', 'oi', 'wamid.T1', now(), '{"tipo":"text"}')$$)
                          = 'SEGREDO NAO CONFIGURADO', '1a sem segredo em ia.config gravou');
  perform pg_temp.confere((select count(*) from ia.fato where fonte = 'whatsapp') = n0, '1b gravou sem segredo configurado');
  insert into ia.config (chave, valor) values ('whatsapp_segredo_banco', jsonb_build_object('sha256', encode(extensions.digest('teste09-segredo', 'sha256'), 'hex')));

  -- 2. segredo errado ou nulo: recusa, nada gravado
  perform pg_temp.confere(pg_temp.erro($$select public.ia_whatsapp_receber('outro-segredo', '5500000000001', 'Pessoa Teste', 'oi', 'wamid.T2', now(), '{}')$$)
                          = 'SEGREDO INVALIDO', '2a segredo errado passou');
  perform pg_temp.confere(pg_temp.erro($$select public.ia_whatsapp_receber(null, '5500000000001', 'Pessoa Teste', 'oi', 'wamid.T2', now(), '{}')$$)
                          = 'SEGREDO INVALIDO', '2b segredo nulo passou');
  perform pg_temp.confere((select count(*) from ia.fato where fonte = 'whatsapp') = n0, '2c gravou com segredo errado');

  -- 3. número fora da lista: registro sem texto, sem nome, só os 4 últimos dígitos
  r := public.ia_whatsapp_receber('teste09-segredo', '5500000000099', 'Desconhecido Teste', 'texto que não pode ficar', 'wamid.T3', '2026-10-30 09:00-03', '{"tipo":"text"}');
  perform pg_temp.confere((r->>'ok')::boolean and (r->>'liberado')::boolean = false and (r->>'fato_id') is not null, '3a resposta fora da lista: ' || r::text);
  select * into f from ia.fato where id = (r->>'fato_id')::bigint;
  perform pg_temp.confere(f.titulo = 'WhatsApp de número não liberado' and f.texto is null and f.empresa = 'GRUPO' and f.tipo = 'mensagem', '3b titulo/texto fora da lista');
  perform pg_temp.confere(f.dados->>'de_final' = '0099' and f.dados->>'de' is null and f.dados->>'nome' is null, '3c dados fora da lista guardaram mais que 4 dígitos');
  perform pg_temp.confere(to_jsonb(f)::text !~ '5500000000099' and to_jsonb(f)::text !~ 'Desconhecido' and to_jsonb(f)::text !~ 'não pode ficar', '3d número, nome ou texto vazou no registro');
  perform pg_temp.confere(f.data = '2026-10-30'::date and f.fonte = 'whatsapp' and f.fonte_id = 'wamid.T3', '3e data/fonte fora da lista');

  -- 4. número na lista (a Meta manda sem o "+"): grava texto, nome, número completo e o bruto
  r := public.ia_whatsapp_receber('teste09-segredo', '5500000000001', 'Pessoa Teste', 'Bertioga: 3 ramais hoje', 'wamid.T4', '2026-10-30 23:30-03', '{"tipo":"text","timestamp":"1"}');
  perform pg_temp.confere((r->>'ok')::boolean and (r->>'liberado')::boolean and (r->>'repetido')::boolean = false, '4a resposta na lista: ' || r::text);
  select * into f from ia.fato where id = (r->>'fato_id')::bigint;
  perform pg_temp.confere(f.titulo = 'WhatsApp de Pessoa Teste' and f.texto = 'Bertioga: 3 ramais hoje', '4b titulo/texto na lista');
  perform pg_temp.confere(f.dados->>'de' = '5500000000001' and f.dados->>'wa_id' = 'wamid.T4' and f.dados->'bruto'->>'tipo' = 'text', '4c dados na lista');
  perform pg_temp.confere(f.data = '2026-10-30'::date, '4d data de Brasília (23h30 de 30/10 não pode virar 31/10)');
  perform pg_temp.confere(f.hash = md5('wa:wamid.T4'), '4e hash');
  -- número com "+" também é aceito; sem nome, o título usa o final do número
  r2 := public.ia_whatsapp_receber('teste09-segredo', '+5500000000002', null, 'sem nome', 'wamid.T4b', now(), '{"tipo":"text"}');
  perform pg_temp.confere((r2->>'liberado')::boolean and (select titulo from ia.fato where id = (r2->>'fato_id')::bigint) = 'WhatsApp de número final 0002', '4f título sem nome');

  -- 5. idempotência: o mesmo id de mensagem chegando de novo não duplica e devolve o mesmo fato_id
  r2 := public.ia_whatsapp_receber('teste09-segredo', '5500000000001', 'Pessoa Teste', 'Bertioga: 3 ramais hoje', 'wamid.T4', '2026-10-30 23:30-03', '{"tipo":"text"}');
  perform pg_temp.confere(r2->>'fato_id' = r->>'fato_id' and (r2->>'repetido')::boolean, '5a reenvio não devolveu o mesmo fato: ' || r2::text);
  perform pg_temp.confere((select count(*) from ia.fato where hash = md5('wa:wamid.T4')) = 1, '5b reenvio duplicou');
  perform pg_temp.confere((select count(*) from ia.fato where fonte = 'whatsapp') = n0 + 3, '5c total de fatos gravados');

  -- 6. mídia: só tipo e id no bruto, texto nulo
  r := public.ia_whatsapp_receber('teste09-segredo', '5500000000001', 'Pessoa Teste', null, 'wamid.T6', now(), '{"tipo":"audio","midia":{"tipo":"audio","id":"m1"}}');
  select * into f from ia.fato where id = (r->>'fato_id')::bigint;
  perform pg_temp.confere(f.texto is null and f.dados->'bruto'->'midia'->>'id' = 'm1' and f.dados->>'tipo' = 'audio', '6 mídia');

  -- 7. entradas inválidas
  perform pg_temp.confere(pg_temp.erro($$select public.ia_whatsapp_receber('teste09-segredo', '5500000000001', 'x', 'x', '', now(), '{}')$$) = 'MENSAGEM SEM ID', '7a sem id');
  perform pg_temp.confere(pg_temp.erro($$select public.ia_whatsapp_receber('teste09-segredo', 'abc', 'x', 'x', 'wamid.T7', now(), '{}')$$) = 'NUMERO INVALIDO', '7b número inválido');

  -- 8. o segredo em texto não está em lugar nenhum do banco
  perform pg_temp.confere(not exists (select 1 from ia.config c where c.valor::text ~ 'teste09-segredo'), '8a segredo em texto em ia.config');
  perform pg_temp.confere(not exists (select 1 from ia.fato f2 where to_jsonb(f2)::text ~ 'teste09-segredo'), '8b segredo em texto em ia.fato');
end $t$;

-- 9. como o site (papel anon, o da chave publicável): a função abre; as tabelas do esquema ia não
set local role anon;
do $t$
declare r jsonb;
begin
  r := public.ia_whatsapp_receber('teste09-segredo', '5500000000001', 'Pessoa Teste', 'como anon', 'wamid.T9', now(), '{"tipo":"text"}');
  perform pg_temp.confere((r->>'ok')::boolean and (r->>'liberado')::boolean, '9a anon não conseguiu gravar pela função');
  perform pg_temp.confere(pg_temp.erro('select * from ia.fato') ~ 'permission denied', '9b anon leu ia.fato');
  perform pg_temp.confere(pg_temp.erro('select * from ia.config') ~ 'permission denied', '9c anon leu ia.config');
  perform pg_temp.confere(pg_temp.erro($$insert into ia.config (chave, valor) values ('x', '{}')$$) ~ 'permission denied', '9d anon gravou ia.config');
  perform pg_temp.confere(pg_temp.erro($$select public.ia_whatsapp_receber('errado', '5500000000001', 'x', 'x', 'wamid.T9b', now(), '{}')$$) = 'SEGREDO INVALIDO', '9e anon com segredo errado passou');
end $t$;
reset role;

select '09 OK' as resultado;
rollback;
