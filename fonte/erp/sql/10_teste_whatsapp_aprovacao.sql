-- Teste do 10_whatsapp_aprovacao.sql. Roda numa transação e DESFAZ tudo no fim (rollback): nada fica gravado, nem a configuração de
-- teste, nem as aprovações, nem os fatos. Só num banco de teste novo (ou local) com o 10 aplicado (por cima do 09 ou sozinho):
--   psql -v ON_ERROR_STOP=1 -f fonte/erp/sql/10_teste_whatsapp_aprovacao.sql
-- Depois rodar também o 09_teste_whatsapp.sql contra o mesmo banco: tem de continuar "09 OK" (o 10 preserva o que o 09 faz).
-- Se alguma regra falhar, para com "FALHOU: ..." e a transação é desfeita. Se tudo passar, mostra "10 OK" e desfaz.
-- O segredo e os números abaixo são de teste (prefixo +550000, que não existe): nunca um número de pessoa.

begin;

-- configuração de teste: hash do segredo e lista com dois números liberados
insert into ia.config (chave, valor) values
  ('whatsapp_segredo_banco', jsonb_build_object('sha256', encode(extensions.digest('teste10-segredo', 'sha256'), 'hex'))),
  ('whatsapp_allowlist', '["+5500000000001", "+5500000000002"]'::jsonb)
on conflict (chave) do update set valor = excluded.valor;

-- erro(sql) devolve a mensagem de erro do comando, ou null se deu certo (roda com o papel de quem chama)
create function pg_temp.erro(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
create function pg_temp.confere(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_msg; end if; end $$;
-- envia(texto, id da mensagem, número): chama a função com o segredo de teste, como o endpoint chamaria
create function pg_temp.envia(p_texto text, p_wa text, p_de text default '5500000000001') returns jsonb language sql as $$
  select public.ia_whatsapp_receber('teste10-segredo', p_de, 'Pessoa Teste', p_texto, p_wa, '2026-10-30 10:00-03', '{"tipo":"text"}') $$;
-- nova(status): cria uma aprovação de teste e devolve o número; as já decididas levam dono, data e motivo "de antes"
create function pg_temp.nova(p_status text default 'pendente') returns bigint language sql as $$
  insert into ia.aprovacao (tipo, destinatario, conteudo, status, decidido_em, decidido_por, motivo)
  values ('mensagem', 'destinatario de teste', 'conteudo de teste', p_status,
          case when p_status = 'pendente' then null else '2026-10-01 08:00-03'::timestamptz end,
          case when p_status = 'pendente' then null else 'decisao de antes' end,
          case when p_status = 'recusado' then 'motivo de antes' else null end)
  returning id $$;
create function pg_temp.apr(p_id bigint) returns ia.aprovacao language sql as $$ select * from ia.aprovacao where id = p_id $$;
create function pg_temp.fato_dados(p_r jsonb) returns jsonb language sql as $$ select dados from ia.fato where id = (p_r->>'fato_id')::bigint $$;
create temp table t10 (k text primary key, v bigint);
grant all on t10 to anon;

do $t$
declare
  r jsonb; a bigint; b bigint; ap ia.aprovacao; n0 bigint; nf0 bigint; fmt text; st text; wa int := 0; txt text; inexistente bigint;
begin
  -- 1. número liberado aprova: status, quem e quando, retorno e fato (com o texto, para auditoria)
  a := pg_temp.nova();
  r := pg_temp.envia('ok ' || a, 'wamid.A1');
  perform pg_temp.confere(r->>'comando' = 'aprovado' and (r->>'aprovacao_id')::bigint = a and (r->>'liberado')::boolean and not (r->>'repetido')::boolean, '1a retorno: ' || r::text);
  ap := pg_temp.apr(a);
  perform pg_temp.confere(ap.status = 'aprovado' and ap.decidido_em is not null and ap.decidido_por = 'whatsapp final 0001' and ap.motivo is null, '1b aprovação ficou assim: ' || to_jsonb(ap)::text);
  perform pg_temp.confere(pg_temp.fato_dados(r)->>'comando' = 'aprovado' and (pg_temp.fato_dados(r)->>'aprovacao_id')::bigint = a, '1c fato sem o comando');
  perform pg_temp.confere((select texto from ia.fato where id = (r->>'fato_id')::bigint) = 'ok ' || a, '1d fato sem o texto (auditoria)');
  perform pg_temp.confere((select titulo from ia.fato where id = (r->>'fato_id')::bigint) = 'WhatsApp de Pessoa Teste', '1e título do fato mudou');

  -- 2. as formas de aprovar (maiúscula, #, ponto final, exclamação, espaços), cada uma com uma aprovação pendente nova
  foreach fmt in array array['OK %s', 'Sim %s.', 'pode %s!', 'aprovo #%s', 'Aprovado  %s ', E'  ok   %s  \n', 'SIM #%s', 'ok 000%s'] loop
    a := pg_temp.nova(); wa := wa + 1;
    r := pg_temp.envia(format(fmt, a), 'wamid.F' || wa);
    perform pg_temp.confere(r->>'comando' = 'aprovado' and (pg_temp.apr(a)).status = 'aprovado', '2 forma de aprovar não pegou: [' || format(fmt, a) || '] ' || r::text);
  end loop;

  -- 3. recusa: o número SOZINHO, ou seguido de um separador (: ; , . - – —) e só então o motivo; sem motivo o campo fica nulo
  a := pg_temp.nova();
  r := pg_temp.envia('não ' || a || ': falta documento', 'wamid.R1');
  ap := pg_temp.apr(a);
  perform pg_temp.confere(r->>'comando' = 'recusado' and (r->>'aprovacao_id')::bigint = a, '3a retorno: ' || r::text);
  perform pg_temp.confere(ap.status = 'recusado' and ap.motivo = 'falta documento' and ap.decidido_em is not null and ap.decidido_por = 'whatsapp final 0001', '3b recusa ficou assim: ' || to_jsonb(ap)::text);
  perform pg_temp.confere(pg_temp.fato_dados(r)->>'comando' = 'recusado', '3c fato sem o comando');
  a := pg_temp.nova(); r := pg_temp.envia('NÃO ' || a, 'wamid.R2'); ap := pg_temp.apr(a);
  perform pg_temp.confere(r->>'comando' = 'recusado' and ap.status = 'recusado' and ap.motivo is null, '3d NÃO maiúsculo com acento: ' || to_jsonb(ap)::text);
  a := pg_temp.nova(); r := pg_temp.envia('nao #' || a, 'wamid.R3'); ap := pg_temp.apr(a);
  perform pg_temp.confere(r->>'comando' = 'recusado' and ap.status = 'recusado' and ap.motivo is null, '3e nao sem acento e com #: ' || to_jsonb(ap)::text);
  a := pg_temp.nova(); r := pg_temp.envia('não ' || a, 'wamid.R3b'); ap := pg_temp.apr(a);
  perform pg_temp.confere(r->>'comando' = 'recusado' and ap.status = 'recusado' and ap.motivo is null, '3e2 não sozinho com o número: ' || to_jsonb(ap)::text);
  -- cada palavra e cada separador (o que vem depois do "|" é o motivo esperado; vazio = nulo). O separador seguido de ESPAÇO e depois
  -- dígito continua valendo (": 3 equipes", "- 15 pessoas"): a trava (?!\d) é só para o dígito COLADO no separador.
  foreach fmt in array array['Recuso %s|', 'CANCELA %s|', 'Não %s|', 'recusado %s: motivo qualquer|motivo qualquer', 'cancela #%s, por chuva|por chuva',
                             'não %s; falta ASO|falta ASO', 'não %s. fora do escopo|fora do escopo', 'não %s - sem verba|sem verba',
                             'não %s – sem verba|sem verba', 'não %s — sem verba|sem verba', 'não %s:sem espaço|sem espaço',
                             'NÃO #%s :  dois espaços  |dois espaços', 'recuso %s.|', 'recusado %s:|', 'não %s.|', 'não %s - motivo|motivo',
                             'não %s: 3 equipes faltaram|3 equipes faltaram', 'não %s - 15 pessoas|15 pessoas'] loop
    a := pg_temp.nova(); wa := wa + 1;
    r := pg_temp.envia(format(split_part(fmt, '|', 1), a), 'wamid.G' || wa);
    perform pg_temp.confere(r->>'comando' = 'recusado' and (pg_temp.apr(a)).status = 'recusado'
                            and (pg_temp.apr(a)).motivo is not distinct from nullif(split_part(fmt, '|', 2), ''),
                            '3f forma de recusar não pegou ou motivo errado: [' || format(split_part(fmt, '|', 1), a) || '] motivo [' || coalesce((pg_temp.apr(a)).motivo, 'nulo') || '] ' || r::text);
  end loop;
  a := pg_temp.nova(); r := pg_temp.envia('não ' || a || ': ' || repeat('x', 600), 'wamid.R4');
  perform pg_temp.confere(length((pg_temp.apr(a)).motivo) = 500, '3g motivo não foi cortado em 500: ' || coalesce(length((pg_temp.apr(a)).motivo), -1));
  a := pg_temp.nova(); r := pg_temp.envia(E'não ' || a || E': primeira linha\nsegunda linha', 'wamid.R5');
  perform pg_temp.confere((pg_temp.apr(a)).motivo = E'primeira linha\nsegunda linha', '3h motivo com quebra de linha: [' || coalesce((pg_temp.apr(a)).motivo, 'nulo') || ']');

  -- 3i. frase comum que COMEÇA como recusa ou aprovação (palavra + número) mas não é só o comando NÃO vira comando e não altera nada.
  -- É a regra que a regex frouxa antiga ("não 3 equipes foram à obra" recusava a aprovação 3) não cumpria. Aqui também entram os
  -- números escritos com dígito colado no separador ("não 3,5 metros", "não 3.5 toneladas", "não 12:30 da tarde", "não 12-15 pessoas"):
  -- a trava (?!\d) da regex impede que a vírgula, o ponto, os dois pontos ou o hífen do número virem o separador do motivo.
  a := pg_temp.nova();
  foreach txt in array array['não ' || a || ' equipes foram à obra', 'não ' || a || ' falta documento', 'ok ' || a || ' equipes', 'Não ' || a || ' de março',
                             'nao ' || a || ' pessoas faltaram', E'não ' || a || E'\nfalta documento', 'cancela ' || a || ' reunião', 'recuso ' || a || ' !',
                             'recusado ' || a || ' sem ASO', 'cancela #' || a || ' reunião de quinta', 'NÃO ' || a || ' obrigado', 'não ' || a || ' ' || a,
                             'sim ' || a || ' equipes', 'pode ' || a || ' ok',
                             'não ' || a || ',5 metros', 'não ' || a || '.5 toneladas', 'não ' || a || ':30 da tarde', 'não ' || a || '-15 pessoas',
                             'recuso ' || a || ',5 metros', 'cancela ' || a || ':30 reunião', 'NÃO ' || a || '–15 pessoas', 'não ' || a || '—15 pessoas',
                             'nao #' || a || ';5 itens', 'recusado ' || a || '.25', 'não ' || a || ' ,5 metros'] loop
    wa := wa + 1;
    r := pg_temp.envia(txt, 'wamid.H' || wa);
    perform pg_temp.confere(jsonb_typeof(r->'comando') = 'null' and jsonb_typeof(r->'aprovacao_id') = 'null' and (r->>'liberado')::boolean, '3i virou comando: [' || txt || '] ' || r::text);
    perform pg_temp.confere((pg_temp.apr(a)).status = 'pendente' and (pg_temp.apr(a)).motivo is null and (pg_temp.apr(a)).decidido_em is null and (pg_temp.apr(a)).decidido_por is null,
                            '3j mudou a aprovação: [' || txt || '] ' || to_jsonb(pg_temp.apr(a))::text);
    perform pg_temp.confere(not (pg_temp.fato_dados(r) ? 'comando'), '3k fato com comando: [' || txt || ']');
    perform pg_temp.confere((select texto from ia.fato where id = (r->>'fato_id')::bigint) = left(txt, 8000), '3l texto não foi gravado: [' || txt || ']');
  end loop;

  -- 4. número FORA da lista não aprova nem recusa; o fato fica sem texto e sem comando
  a := pg_temp.nova();
  r := pg_temp.envia('ok ' || a, 'wamid.X1', '5500000000099');
  perform pg_temp.confere((r->>'liberado')::boolean = false and jsonb_typeof(r->'comando') = 'null' and jsonb_typeof(r->'aprovacao_id') = 'null', '4a retorno fora da lista: ' || r::text);
  perform pg_temp.confere((pg_temp.apr(a)).status = 'pendente' and (pg_temp.apr(a)).decidido_em is null, '4b número fora da lista aprovou');
  perform pg_temp.confere((select texto from ia.fato where id = (r->>'fato_id')::bigint) is null and not (pg_temp.fato_dados(r) ? 'comando'), '4c fato fora da lista com texto ou comando');
  r := pg_temp.envia('não ' || a || ': vou barrar', 'wamid.X2', '5500000000099');
  perform pg_temp.confere((pg_temp.apr(a)).status = 'pendente' and (pg_temp.apr(a)).motivo is null, '4d número fora da lista recusou');

  -- 5. aprovação que já não está pendente não muda (aprovada, recusada, enviada, expirada): nao_encontrado
  foreach st in array array['aprovado', 'recusado', 'enviado', 'expirado'] loop
    a := pg_temp.nova(st); wa := wa + 1;
    r := pg_temp.envia('ok ' || a, 'wamid.D' || wa);
    perform pg_temp.confere(r->>'comando' = 'nao_encontrado' and (r->>'aprovacao_id')::bigint = a, '5a ' || st || ': retorno ' || r::text);
    ap := pg_temp.apr(a);
    perform pg_temp.confere(ap.status = st and ap.decidido_por = 'decisao de antes' and ap.decidido_em = '2026-10-01 08:00-03'::timestamptz, '5b ' || st || ' foi alterada pelo ok: ' || to_jsonb(ap)::text);
    perform pg_temp.confere(pg_temp.fato_dados(r)->>'comando' = 'nao_encontrado', '5c fato sem nao_encontrado');
    wa := wa + 1;
    r := pg_temp.envia('não ' || a || ': tarde demais', 'wamid.D' || wa);
    ap := pg_temp.apr(a);
    perform pg_temp.confere(r->>'comando' = 'nao_encontrado' and ap.status = st and ap.decidido_por = 'decisao de antes' and ap.motivo is not distinct from case when st = 'recusado' then 'motivo de antes' else null end,
                            '5d ' || st || ' foi alterada pela recusa: ' || to_jsonb(ap)::text);
  end loop;

  -- 6. número que não existe: nao_encontrado e nada criado nem mudado
  select count(*), coalesce(max(id), 0) + 1000 into n0, inexistente from ia.aprovacao;
  r := pg_temp.envia('ok ' || inexistente, 'wamid.N1');
  perform pg_temp.confere(r->>'comando' = 'nao_encontrado' and (r->>'aprovacao_id')::bigint = inexistente, '6a retorno: ' || r::text);
  r := pg_temp.envia('não ' || inexistente || ': motivo', 'wamid.N2');
  perform pg_temp.confere(r->>'comando' = 'nao_encontrado', '6b recusa de número que não existe: ' || r::text);
  perform pg_temp.confere((select count(*) from ia.aprovacao) = n0, '6c criou ou apagou aprovação');
  r := pg_temp.envia('ok 123456789', 'wamid.N3');   -- 9 dígitos: ainda é comando
  perform pg_temp.confere(r->>'comando' = 'nao_encontrado', '6d 9 dígitos é comando: ' || r::text);

  -- 7. o mesmo id de mensagem chegando de novo (reenvio da Meta ou da Bird) NÃO reaplica o comando
  a := pg_temp.nova();
  r := pg_temp.envia('ok ' || a, 'wamid.REP');
  perform pg_temp.confere(r->>'comando' = 'aprovado', '7a primeira entrega: ' || r::text);
  update ia.aprovacao set status = 'pendente', decidido_em = null, decidido_por = null where id = a;   -- como se alguém tivesse reaberto
  nf0 := (select count(*) from ia.fato where fonte = 'whatsapp');
  r := pg_temp.envia('ok ' || a, 'wamid.REP');
  perform pg_temp.confere((r->>'repetido')::boolean and jsonb_typeof(r->'comando') = 'null' and jsonb_typeof(r->'aprovacao_id') = 'null', '7b retorno do reenvio: ' || r::text);
  perform pg_temp.confere((pg_temp.apr(a)).status = 'pendente', '7c o reenvio reaplicou o comando');
  perform pg_temp.confere((select count(*) from ia.fato where fonte = 'whatsapp') = nf0, '7d o reenvio duplicou o fato');
  perform pg_temp.confere(pg_temp.fato_dados(r)->>'comando' = 'aprovado', '7e o fato original perdeu o comando');
  r := pg_temp.envia('ok ' || a, 'wamid.REP2');   -- outra mensagem, mesmo texto: essa vale
  perform pg_temp.confere(r->>'comando' = 'aprovado' and (pg_temp.apr(a)).status = 'aprovado', '7f mensagem nova com o mesmo texto não valeu: ' || r::text);

  -- 8. texto comum não vira comando (nenhuma aprovação pendente muda, o fato não ganha "comando")
  a := pg_temp.nova();
  foreach txt in array array['Bertioga: 3 ramais hoje', 'ok', 'ok bom dia', 'sim senhor', 'aprovo', 'sim', 'pode', 'ok ' || a || ' obrigado', 'pode ' || a || ' agora',
                             'oi, não ' || a, 'ok ' || a || ' ' || a, 'ok #', 'sim, ' || a, 'ok' || a, 'ok ' || a || '5555555555', 'aprovado: ' || a, 'ok ' || a || ' ok',
                             'quero ok ' || a, E'bom dia\nok ' || a, 'okk ' || a, 'sim-' || a, 'ok -' || a, '👍 ' || a, 'ok 0x' || a] loop
    wa := wa + 1;
    r := pg_temp.envia(txt, 'wamid.T' || wa);
    perform pg_temp.confere(jsonb_typeof(r->'comando') = 'null' and jsonb_typeof(r->'aprovacao_id') = 'null' and (r->>'liberado')::boolean, '8a virou comando: [' || txt || '] ' || r::text);
    perform pg_temp.confere((pg_temp.apr(a)).status = 'pendente', '8b mudou a aprovação: [' || txt || ']');
    perform pg_temp.confere(not (pg_temp.fato_dados(r) ? 'comando'), '8c fato com comando: [' || txt || ']');
    perform pg_temp.confere((select texto from ia.fato where id = (r->>'fato_id')::bigint) = left(txt, 8000), '8d texto não foi gravado: [' || txt || ']');
  end loop;
  -- mensagem sem texto (áudio) de número liberado: sem comando
  r := public.ia_whatsapp_receber('teste10-segredo', '5500000000001', 'Pessoa Teste', null, 'wamid.AUD', now(), '{"tipo":"audio"}');
  perform pg_temp.confere(jsonb_typeof(r->'comando') = 'null' and (pg_temp.apr(a)).status = 'pendente', '8e áudio virou comando: ' || r::text);

  -- 9. o segundo número da lista também decide, e o "quem" mostra os 4 últimos dígitos dele
  r := pg_temp.envia('ok ' || a, 'wamid.OUTRO', '+5500000000002');
  perform pg_temp.confere(r->>'comando' = 'aprovado' and (pg_temp.apr(a)).decidido_por = 'whatsapp final 0002', '9 segundo número: ' || to_jsonb(pg_temp.apr(a))::text);

  -- 10. o que o 09 devolvia continua: mensagem comum tem os mesmos campos de antes, mais comando/aprovacao_id nulos
  r := pg_temp.envia('Bertioga: 3 ramais hoje', 'wamid.COMUM');
  perform pg_temp.confere(r ?& array['ok', 'fato_id', 'liberado', 'repetido', 'comando', 'aprovacao_id'] and (r->>'ok')::boolean, '10a campos do retorno: ' || r::text);
  perform pg_temp.confere((pg_temp.fato_dados(r)->>'de') = '5500000000001' and (pg_temp.fato_dados(r)->>'wa_id') = 'wamid.COMUM', '10b dados do fato mudaram');

  -- 11. segredo: tudo o que o 09 recusava continua recusado, sem tocar em aprovação
  a := pg_temp.nova();
  perform pg_temp.confere(pg_temp.erro(format($$select public.ia_whatsapp_receber('outro-segredo', '5500000000001', 'x', 'ok %s', 'wamid.S1', now(), '{}')$$, a)) = 'SEGREDO INVALIDO', '11a segredo errado passou');
  perform pg_temp.confere(pg_temp.erro(format($$select public.ia_whatsapp_receber(null, '5500000000001', 'x', 'ok %s', 'wamid.S2', now(), '{}')$$, a)) = 'SEGREDO INVALIDO', '11b segredo nulo passou');
  perform pg_temp.confere(pg_temp.erro(format($$select public.ia_whatsapp_receber('teste10-segredo', '5500000000001', 'x', 'ok %s', '', now(), '{}')$$, a)) = 'MENSAGEM SEM ID', '11c sem id');
  perform pg_temp.confere(pg_temp.erro(format($$select public.ia_whatsapp_receber('teste10-segredo', 'abc', 'x', 'ok %s', 'wamid.S3', now(), '{}')$$, a)) = 'NUMERO INVALIDO', '11d número inválido');
  perform pg_temp.confere((pg_temp.apr(a)).status = 'pendente', '11e uma chamada recusada aprovou');
  delete from ia.config where chave = 'whatsapp_segredo_banco';
  perform pg_temp.confere(pg_temp.erro(format($$select public.ia_whatsapp_receber('teste10-segredo', '5500000000001', 'x', 'ok %s', 'wamid.S4', now(), '{}')$$, a)) = 'SEGREDO NAO CONFIGURADO', '11f sem segredo configurado');
  perform pg_temp.confere((pg_temp.apr(a)).status = 'pendente', '11g sem segredo configurado aprovou');
  insert into ia.config (chave, valor) values ('whatsapp_segredo_banco', jsonb_build_object('sha256', encode(extensions.digest('teste10-segredo', 'sha256'), 'hex')));
  -- sem lista de liberados, ninguém aprova
  delete from ia.config where chave = 'whatsapp_allowlist';
  r := pg_temp.envia('ok ' || a, 'wamid.S5');
  perform pg_temp.confere(not (r->>'liberado')::boolean and (pg_temp.apr(a)).status = 'pendente', '11h sem lista aprovou: ' || r::text);
  insert into ia.config (chave, valor) values ('whatsapp_allowlist', '["+5500000000001", "+5500000000002"]'::jsonb);

  -- 12. o segredo em texto não está em lugar nenhum do banco
  perform pg_temp.confere(not exists (select 1 from ia.config c where c.valor::text ~ 'teste10-segredo'), '12a segredo em texto em ia.config');
  perform pg_temp.confere(not exists (select 1 from ia.fato f2 where to_jsonb(f2)::text ~ 'teste10-segredo'), '12b segredo em texto em ia.fato');

  -- aprovação pendente para o teste do papel anon (lá a tabela não pode ser lida)
  insert into t10 values ('anon', pg_temp.nova());
end $t$;

-- 13. como o site (papel anon, o da chave publicável): a função aprova; as tabelas do esquema ia não abrem
set local role anon;
do $t$
declare r jsonb; a bigint := (select v from t10 where k = 'anon');
begin
  r := public.ia_whatsapp_receber('teste10-segredo', '5500000000001', 'Pessoa Teste', 'ok ' || a, 'wamid.ANON', now(), '{"tipo":"text"}');
  perform pg_temp.confere(r->>'comando' = 'aprovado' and (r->>'aprovacao_id')::bigint = a, '13a anon não conseguiu aprovar pela função: ' || r::text);
  perform pg_temp.confere(pg_temp.erro('select * from ia.aprovacao') ~ 'permission denied', '13b anon leu ia.aprovacao');
  perform pg_temp.confere(pg_temp.erro('update ia.aprovacao set status = ''aprovado''') ~ 'permission denied', '13c anon mudou ia.aprovacao direto');
  perform pg_temp.confere(pg_temp.erro('select * from ia.fato') ~ 'permission denied', '13d anon leu ia.fato');
  perform pg_temp.confere(pg_temp.erro('select * from ia.config') ~ 'permission denied', '13e anon leu ia.config');
  perform pg_temp.confere(pg_temp.erro($$select public.ia_whatsapp_receber('errado', '5500000000001', 'x', 'ok 1', 'wamid.ANON2', now(), '{}')$$) = 'SEGREDO INVALIDO', '13f anon com segredo errado passou');
end $t$;
reset role;
do $t$
begin
  perform pg_temp.confere((pg_temp.apr((select v from t10 where k = 'anon'))).status = 'aprovado', '13g a aprovação por anon não ficou gravada');
end $t$;

select '10 OK' as resultado;
rollback;
