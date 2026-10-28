-- Teste do 08_resumo.sql na OBRA 999 · DEMONSTRAÇÃO (fictícia). Roda numa transação e DESFAZ tudo no fim (rollback):
-- nada fica gravado, nem as chaves de teste, nem a obra, nem os destinatários.
-- Uso: num banco de teste com o 08 aplicado: psql -v ON_ERROR_STOP=1 -f fonte/erp/sql/08_teste_resumo.sql
-- Se alguma regra falhar, para com "FALHOU: ..." e a transação é desfeita. Se tudo passar, mostra "08 OK" e desfaz.
-- Os e-mails são do domínio example.com (reservado para exemplo); as chaves são textos de teste.
-- Relógio do teste: quarta 28/10/2026 às 9h de Brasília (taf.agora). Toda data abaixo é inventada.

begin;
set local taf.agora = '2026-10-28 09:00:00-03';

-- ===== SEMENTE INICIO (obra 999 no planejador e no ERP, obra 998 vazia, chaves de teste)
insert into public.taf_ciclo_obra (obra, nome, engenheiro, ep, base_rev, equipe, setores)
values ('999', 'OBRA 999 · DEMONSTRAÇÃO', 'Engenheiro 999', '2026-09-07', 'FICTÍCIO', array['Engenheiro 999', 'Encarregado 999'], array['SUPRIMENTOS']),
       ('998', 'OBRA 998 · VAZIA (fictícia)', 'Engenheiro 998', '2026-09-07', 'FICTÍCIO', '{}', '{}');
insert into public.taf_ciclo_area (obra, area, rotulo, dono, ordem)
values ('999', 'TECNICA', 'Técnica', 'Engenheiro 999', 1), ('999', 'SUPRIMENTOS', 'Suprimentos', null, 2);

-- cronograma: dia zero 07/09/2026; b0 = início em dias desde o dia zero; b1 = fim + 1 (marco das 17h: b0 = b1 = dia + 1)
insert into public.taf_ciclo_ativ (obra, id, ordem, topo, nome, fase, tipo, evento, contratual, cal, dur, hora_marco, b0, b1, ini_base, fim_base, pred, ini_real, fim_real, real_origem)
values
 ('999', 'T1', 1, 1, 'Mobilização do canteiro (fictício)', '1 CANTEIRO', 'ativ', null, false, 'CORRIDOS', 5, null, 0, 5, '2026-09-07', '2026-09-11', '[]', '2026-09-07', '2026-09-11', 'manual'),
 ('999', 'T2', 2, 2, 'Escavação da elevatória (fictício)', '2 ELEVATÓRIA', 'ativ', null, false, 'CORRIDOS', 20, null, 28, 48, '2026-10-05', '2026-10-24', '[["T1","FS",0]]', '2026-10-05', null, 'manual'),
 ('999', 'T3', 3, 3, 'Assentamento de tubos (fictício)', '2 ELEVATÓRIA', 'ativ', null, false, 'CORRIDOS', 10, null, 43, 53, '2026-10-20', '2026-10-29', '[["T2","SS",15]]', null, null, null),
 ('999', 'T4', 4, 4, 'Montagem hidráulica (fictício)', '2 ELEVATÓRIA', 'ativ', null, false, 'CORRIDOS', 10, null, 56, 66, '2026-11-02', '2026-11-11', '[["T3","FS",3]]', null, null, null),
 ('999', 'T5', 5, 5, 'Elevatória montada (fictício)', '2 ELEVATÓRIA', 'evento', '2.1.1', false, 'CORRIDOS', 0, 17, 66, 66, '2026-11-11', '2026-11-11', '[["T4","FS",0]]', null, null, null),
 ('999', 'T6', 6, 6, 'Partida da elevatória (fictício)', '4 PARTIDA', 'marco', null, true, 'CORRIDOS', 0, 17, 86, 86, '2026-12-01', '2026-12-01', '[["T5","FS",0]]', null, null, null);

-- semana de 19/10: publicada e fechada com 3 de 4 cumpridos (PPC 75%)
insert into public.taf_ciclo_semana (obra, seg) values ('999', '2026-10-19'), ('999', '2026-10-26');
insert into public.taf_ciclo_comp (obra, seg, cid, ativ, titulo, frente, entrega_tipo, entrega, resp, prometido, quem)
values ('999', '2026-10-19', 'C1', 'T2', null, null, 'etapa', 'Escavar o trecho A', 'Encarregado 999', '2026-10-21', 'Engenheiro 999'),
       ('999', '2026-10-19', 'C2', 'T2', null, null, 'etapa', 'Escavar o trecho B', 'Encarregado 999', '2026-10-23', 'Engenheiro 999'),
       ('999', '2026-10-19', 'C3', null, 'Limpeza do canteiro', 'ADM', 'concluir', 'Canteiro limpo', 'Encarregado 999', '2026-10-23', 'Engenheiro 999'),
       ('999', '2026-10-19', 'C4', 'T3', null, null, 'etapa', 'Assentar os primeiros tubos', 'Encarregado 999', '2026-10-23', 'Engenheiro 999'),
       ('999', '2026-10-26', 'C1', 'T2', null, null, 'etapa', 'Escavar o trecho C', 'Encarregado 999', '2026-10-28', 'Engenheiro 999'),
       ('999', '2026-10-26', 'C2', 'T2', null, null, 'concluir', 'Terminar a escavação', 'Encarregado 999', '2026-10-30', 'Engenheiro 999'),
       ('999', '2026-10-26', 'C3', null, 'Boletim de medição', 'BM', 'concluir', 'Boletim enviado', 'Engenheiro 999', '2026-10-30', 'Engenheiro 999');
update public.taf_ciclo_semana set estado = 'publicada', publicada_em = '2026-10-19 09:00-03', publicada_por = 'Engenheiro 999',
       status_pub = 'NO_PRAZO', cobertura = 'COMPLETA', janela = '{}' where obra = '999' and seg in ('2026-10-19', '2026-10-26');
update public.taf_ciclo_comp set publicado = jsonb_build_object('resp', resp, 'entrega', entrega) where obra = '999';
insert into public.taf_ciclo_apont (obra, seg, cid, dia, situacao, quem)
select '999', '2026-10-19', 'C1', d::date, 'andou', 'Encarregado 999' from generate_series('2026-10-19'::date, '2026-10-23'::date, interval '1 day') d;
update public.taf_ciclo_comp set resultado = 'cumprido', fechado_em = '2026-10-23 15:00-03', fechado_por = 'Engenheiro 999'
 where obra = '999' and seg = '2026-10-19' and cid in ('C1', 'C2', 'C3');
update public.taf_ciclo_comp set resultado = 'nao', causa = 'MATERIAL', fechado_em = '2026-10-23 15:00-03', fechado_por = 'Engenheiro 999'
 where obra = '999' and seg = '2026-10-19' and cid = 'C4';
update public.taf_ciclo_semana set estado = 'fechada', fechada_em = '2026-10-23 16:00-03', fechada_por = 'Engenheiro 999',
       resumo = public._taf_ciclo_resumo('999', '2026-10-19') where obra = '999' and seg = '2026-10-19';

-- restrições: 2 vencidas (uma com nova data), 1 vence em 7 dias, 1 resolvida (não conta)
insert into public.taf_ciclo_demanda (obra, num, area, oque, resp, prazo, nova_data, vezes, ativs, situacao, resolvida_em, resolvida_por, origem, criada_por, quem)
values ('999', 1, 'TECNICA', 'Projeto dos tubos aprovado', 'Engenheiro 999', '2026-10-20', null, 0, array['T3'], 'aberta', null, null, 'manual', 'Engenheiro 999', 'Engenheiro 999'),
       ('999', 2, 'SUPRIMENTOS', 'Válvulas entregues na obra', 'SUPRIMENTOS', '2026-10-10', '2026-10-25', 1, array['T4'], 'aberta', null, null, 'manual', 'Engenheiro 999', 'Engenheiro 999'),
       ('999', 3, 'TECNICA', 'Frente da montagem liberada', 'Engenheiro 999', '2026-10-30', null, 0, array['T4'], 'aberta', null, null, 'manual', 'Engenheiro 999', 'Engenheiro 999'),
       ('999', 4, 'TECNICA', 'Licença de escavação emitida', 'Engenheiro 999', '2026-10-01', null, 0, array['T2'], 'resolvida', '2026-10-02', 'Engenheiro 999', 'manual', 'Engenheiro 999', 'Engenheiro 999');

-- ERP: itens da OBRA 999 · DEMONSTRAÇÃO (os mesmos de fonte/erp/teste/obra999.js) e o cenário do plano
insert into public.taf_erp_obra (codigo, nome, contratante) values ('999', 'OBRA 999 · DEMONSTRAÇÃO', 'DEMONSTRAÇÃO (fictícia)'),
                                                                 ('998', 'OBRA 998 · VAZIA (fictícia)', 'DEMONSTRAÇÃO (fictícia)');
insert into public.taf_erp_item (obra, codigo, descricao, unidade, qtd, pacote, evento, venda, meta, teto, meta_unit)
values ('999', '1.1', 'Barracão e instalações provisórias', 'vb', 1, 'CANT', '1.1.1', 12000, 9000, 9900, 9000),
       ('999', '1.2', 'Mobilização de equipamentos', 'vb', 1, 'CANT', '1.1.1', 8000, 6000, 6600, 6000),
       ('999', '2.1', 'Tubos e conexões da elevatória', 'vb', 1, 'HIDR', '2.1.1', 40000, 30000, 33000, 30000),
       ('999', '2.2', 'Montagem hidráulica', 'vb', 1, 'HIDR', '2.1.1', 15000, 11000, 12100, 11000),
       ('999', '3.1', 'Quadro elétrico de comando', 'vb', 1, 'ELET', '4.1.1', 10000, 7000, 7000, 7000),
       ('999', '3.2', 'Cabos e eletrodutos', 'vb', 1, 'ELET', '4.1.1', 10000, 6000, 5500, 6000),
       ('999', '3.3', 'Comissionamento e partida', 'vb', 1, 'ELET', '4.1.2', 5000, 3000, 3000, 3000),
       ('999', '3.4', 'Tubulação de recalque', 'vb', 1, 'HIDR', '4.1.1', 6000, 4000, 4400, 4000),
       ('999', '3.5', 'Serviços diversos (sem evento)', 'vb', 1, 'ELET', null, 3000, 2000, 1500, 2000);
insert into public.taf_erp_doc (obra, id, tipo, dados, criado_por, atualizado_por, papel)
values ('999', 'o9991', 'oc', '{"num":"OC-9001","item":"1.1","valor":3000,"status":"aprovada","forn":"FORNECEDOR FICTÍCIO LTDA"}', 'teste', 'teste', 'compras'),
       ('999', 'o9992', 'oc', '{"num":"OC-9002","item":"2.1","valor":8000,"status":"aprovada","forn":"FORNECEDOR FICTÍCIO LTDA"}', 'teste', 'teste', 'compras'),
       ('999', 'o9993', 'oc', '{"num":"OC-9003","item":"3.1","valor":2500,"status":"em_alcada","forn":"FORNECEDOR FICTÍCIO LTDA"}', 'teste', 'teste', 'compras'),
       ('999', 'n9991', 'nf', '{"num":"NF-9001","oc":"o9991","valor":3000,"status":"rateada","rateio":[{"item":"2.2","valor":3000}]}', 'teste', 'teste', 'adm'),
       ('999', 'n9992', 'nf', '{"num":"NF-9002","oc":"o9992","valor":5000,"status":"rateada","rateio":[{"item":"2.1","valor":5000}]}', 'teste', 'teste', 'adm'),
       ('999', 'n9993', 'nf', '{"num":"NF-9003","oc":"","valor":700,"status":"rateada","rateio":[{"item":"1.2","valor":700}]}', 'teste', 'teste', 'adm');

-- chaves de teste (só o hash)
insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras, ativo) values
  (encode(extensions.digest('teste08-dir', 'sha256'), 'hex'), 'teste', 'Diretor Teste', 'diretoria', array['998', '999'], true),
  (encode(extensions.digest('teste08-ges', 'sha256'), 'hex'), 'teste', 'Gestor Teste', 'gestor', array['999'], true),
  (encode(extensions.digest('teste08-eng', 'sha256'), 'hex'), 'teste', 'Engenheiro 999', 'engenheiro', array['999'], true),
  (encode(extensions.digest('teste08-lei', 'sha256'), 'hex'), 'leitura de teste', null, 'leitura', array['999'], true);
insert into public.taf_pessoa_chave (hash, pessoa) values (encode(extensions.digest('teste08-pes', 'sha256'), 'hex'), 'Pessoa Teste 342')
  on conflict do nothing;
-- ===== SEMENTE FIM

-- erro(sql) devolve a mensagem de erro do comando, ou null se deu certo (roda com o papel de quem chama)
create function pg_temp.erro(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
create function pg_temp.confere(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_msg; end if; end $$;
create temp table t08 (k text primary key, v text);
grant all on t08 to anon;

-- ===== daqui em diante, como o site: papel anon (o mesmo que a chave publicável usa)
set local role anon;

do $t$
declare r jsonb; e text; v_dir bigint; v_ges bigint; v_rob text; v_rob2 text; m jsonb; x jsonb; i int;
begin
  -- 1. tabelas e funções internas fechadas
  perform pg_temp.confere(pg_temp.erro('select * from public.taf_resumo_dest') ~ 'permission denied', '1a anon le a tabela de destinatarios');
  perform pg_temp.confere(pg_temp.erro('select * from public.taf_resumo_envio') ~ 'permission denied', '1b anon le a tabela de envios');
  perform pg_temp.confere(pg_temp.erro('insert into public.taf_resumo_dest (nome, email, frequencia, cadastrado_por) values (''x'', ''x@example.com'', ''diaria'', ''x'')') ~ 'permission denied', '1c anon grava direto');
  perform pg_temp.confere(pg_temp.erro('select public._taf_resumo_obra(''999'')') ~ 'permission denied', '1d anon chama a interna do resumo');
  perform pg_temp.confere(pg_temp.erro('select public._taf_resumo_gestor(''teste08-dir'')') ~ 'permission denied', '1e anon chama a interna do gestor');

  -- 2. quem não cadastra
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_destinatarios(''chave-geral-teste'')') = 'USE SUA CHAVE PESSOAL', '2a chave geral listou');
  perform pg_temp.confere(pg_temp.erro($$select public.taf_resumo_destinatario_salvar('chave-geral-teste', null, 'Alguem', 'alguem@example.com', null, 'diaria')$$) = 'USE SUA CHAVE PESSOAL', '2b chave geral cadastrou');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_destinatarios(''teste08-eng'')') = 'SO DIRETORIA OU GESTOR', '2c engenheiro listou');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_destinatarios(''teste08-lei'')') = 'SO DIRETORIA OU GESTOR', '2d leitura listou');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_destinatarios(''teste08-pes'')') = 'SO DIRETORIA OU GESTOR', '2e chave do site listou');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_destinatarios(''chave-errada'')') = 'CHAVE INVALIDA', '2f chave errada');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_destinatarios(null)') = 'CHAVE INVALIDA', '2g sem chave');

  -- 3. Diretoria cadastra (todas as obras, é o e-mail dela)
  r := public.taf_resumo_destinatario_salvar('teste08-dir', null, '  Diretor Teste ', 'Diretor.Teste@Example.com ', null, 'diaria', true);
  v_dir := (r ->> 'id')::bigint;
  perform pg_temp.confere(r ->> 'nome' = 'Diretor Teste' and r ->> 'email' = 'diretor.teste@example.com' and (r ->> 'todas')::boolean
                          and (r ->> 'meu')::boolean and r ->> 'cadastrado_por' = 'Diretor Teste' and (r ->> 'ativo')::boolean, '3a cadastro da Diretoria: ' || r::text);
  perform pg_temp.confere(pg_temp.erro($$select public.taf_resumo_destinatario_salvar('teste08-dir', null, 'Outro', 'diretor.teste@example.com', '["999"]', 'diaria')$$) = 'ESTE E-MAIL JA RECEBE O RESUMO DIARIA', '3b e-mail repetido na mesma frequencia');
  r := public.taf_resumo_destinatario_salvar('teste08-dir', null, 'Diretor Teste', 'diretor.teste@example.com', '["999"]', 'semanal', false);
  perform pg_temp.confere(r ->> 'frequencia' = 'semanal' and not (r ->> 'meu')::boolean, '3c mesmo e-mail no semanal');
  foreach e in array array['nao-e-email', 'a@b', 'x@y.com, z@w.com', 'x y@example.com', 'x@example.com<script>', ''] loop
    perform pg_temp.confere(pg_temp.erro(format($$select public.taf_resumo_destinatario_salvar('teste08-dir', null, 'Fulano', %L, null, 'diaria')$$, e)) = 'E-MAIL INVALIDO', '3d e-mail invalido aceito: ' || e);
  end loop;
  perform pg_temp.confere(pg_temp.erro($$select public.taf_resumo_destinatario_salvar('teste08-dir', null, 'X', 'x@example.com', null, 'diaria')$$) = 'NOME INVALIDO', '3e nome curto');
  perform pg_temp.confere(pg_temp.erro($$select public.taf_resumo_destinatario_salvar('teste08-dir', null, 'Fulano', 'x@example.com', null, 'mensal')$$) = 'FREQUENCIA INVALIDA', '3f frequencia');
  perform pg_temp.confere(pg_temp.erro($$select public.taf_resumo_destinatario_salvar('teste08-dir', null, 'Fulano', 'x@example.com', '[]', 'diaria')$$) = 'ESCOLHA AS OBRAS', '3g lista vazia');
  perform pg_temp.confere(pg_temp.erro($$select public.taf_resumo_destinatario_salvar('teste08-dir', null, 'Fulano', 'x@example.com', '["123"]', 'diaria')$$) = 'OBRA INVALIDA: 123', '3h obra que nao existe');

  -- 4. gestor só com a 999 (a 998 existe): não escolhe "todas" nem a 998
  perform pg_temp.confere(pg_temp.erro($$select public.taf_resumo_destinatario_salvar('teste08-ges', null, 'Gestor Teste', 'gestor.teste@example.com', null, 'diaria')$$) = 'ESCOLHA AS OBRAS: SUA CHAVE NAO TEM TODAS', '4a gestor escolheu todas');
  perform pg_temp.confere(pg_temp.erro($$select public.taf_resumo_destinatario_salvar('teste08-ges', null, 'Gestor Teste', 'gestor.teste@example.com', '["998"]', 'diaria')$$) = 'SEM ACESSO A OBRA 998', '4b gestor escolheu obra fora da chave');
  r := public.taf_resumo_destinatario_salvar('teste08-ges', null, 'Gestor Teste', 'gestor.teste@example.com', '["999","999"]', 'diaria', true);
  v_ges := (r ->> 'id')::bigint;
  perform pg_temp.confere(r -> 'obras' = '["999"]'::jsonb and (r ->> 'meu')::boolean, '4c cadastro do gestor: ' || r::text);
  r := public.taf_resumo_destinatarios('teste08-ges');
  perform pg_temp.confere(not (r ->> 'cobre_todas')::boolean and jsonb_array_length(r -> 'destinatarios') = 2 and r -> 'robo' = 'null'::jsonb
                          and r -> 'obras' = '[{"obra":"999","nome":"OBRA 999 · DEMONSTRAÇÃO"}]'::jsonb, '4d lista do gestor so com o que ele cobre: ' || r::text);
  perform pg_temp.confere(pg_temp.erro(format($$select public.taf_resumo_destinatario_salvar('teste08-ges', %s, 'Diretor Teste', 'diretor.teste@example.com', '["999"]', 'diaria')$$, v_dir)) = 'SEM ACESSO A ESTE DESTINATARIO', '4e gestor mexeu no destinatario de todas as obras');
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_resumo_destinatario_desativar(''teste08-ges'', %s)', v_dir)) = 'SEM ACESSO A ESTE DESTINATARIO', '4f gestor desativou o de todas');
  r := public.taf_resumo_destinatarios('teste08-dir');
  perform pg_temp.confere((r ->> 'cobre_todas')::boolean and jsonb_array_length(r -> 'destinatarios') = 3 and jsonb_array_length(r -> 'obras') = 2, '4g lista da Diretoria: ' || r::text);

  -- 5. desativar e reativar (nada se apaga; a versão anterior fica guardada)
  r := public.taf_resumo_destinatario_desativar('teste08-dir', v_ges);
  perform pg_temp.confere(not (r ->> 'ativo')::boolean, '5a desativar');
  r := public.taf_resumo_destinatario_salvar('teste08-ges', v_ges, 'Gestor Teste', 'gestor.teste@example.com', '["999"]', 'diaria', true);
  perform pg_temp.confere((r ->> 'ativo')::boolean and r ->> 'atualizado_por' = 'Gestor Teste', '5b reativar pelo salvar');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_destinatario_desativar(''teste08-dir'', 999999)') = 'DESTINATARIO NAO EXISTE', '5c desativar o que nao existe');

  -- 6. chave do robô
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_robo_gerar(''teste08-ges'')') = 'SO QUEM TEM TODAS AS OBRAS GERA A CHAVE DO ROBO', '6a gestor sem todas gerou');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_robo_gerar(''chave-geral-teste'')') = 'USE SUA CHAVE PESSOAL', '6b chave geral gerou');
  r := public.taf_resumo_robo_gerar('teste08-dir');
  v_rob := r ->> 'chave';
  perform pg_temp.confere(v_rob ~ '^robo-[0-9a-f]{48}$' and r ->> 'criado_por' = 'Diretor Teste', '6c chave do robo: formato');
  perform pg_temp.confere(public.taf_erp_entrar(v_rob) -> 'obras' = '[]'::jsonb, '6d o robo nao abre obra no ERP');
  perform pg_temp.confere(public.taf_ciclo_obras(v_rob) = '[]'::jsonb, '6e o robo nao abre obra no planejador');
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_erp_ler(%L, ''999'')', v_rob)) = 'SEM ACESSO A OBRA', '6f o robo leu o ERP');
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_ciclo_situacao(%L, ''999'')', v_rob)) = 'SEM ACESSO A OBRA', '6g o robo leu o planejador');
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_resumo_destinatarios(%L)', v_rob)) = 'SO DIRETORIA OU GESTOR', '6h o robo listou destinatarios');
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_resumo_previa(%L)', v_rob)) = 'A CHAVE DO ROBO NAO FAZ PREVIA', '6i o robo pediu previa');
  r := public.taf_resumo_destinatarios('teste08-dir');
  perform pg_temp.confere(r #>> '{robo,criado_por}' = 'Diretor Teste' and r::text !~ 'robo-[0-9a-f]', '6j a lista mostra que existe robo e nunca a chave');

  -- 7. resumo da obra 999 (planejador + ERP), pelo robô
  r := public.taf_resumo_obra(v_rob, '999');
  perform pg_temp.confere(r ->> 'nome' = 'OBRA 999 · DEMONSTRAÇÃO' and r ->> 'hoje' = '2026-10-28' and r ->> 'semana' = '2026-10-26', '7a cabecalho: ' || r::text);
  perform pg_temp.confere(r #>> '{ciclo,ultima_fechada,seg}' = '2026-10-19' and (r #>> '{ciclo,ultima_fechada,ppc}')::int = 75
                          and (r #>> '{ciclo,ultima_fechada,cumpridos}')::int = 3 and (r #>> '{ciclo,ultima_fechada,publicados}')::int = 4, '7b PPC da ultima fechada: ' || (r #> '{ciclo,ultima_fechada}')::text);
  perform pg_temp.confere(r #>> '{ciclo,semana_atual,estado}' = 'publicada' and (r #>> '{ciclo,semana_atual,publicados}')::int = 3
                          and (r #>> '{ciclo,semana_atual,cumpridos}')::int = 0 and (r #>> '{ciclo,semana_atual,sem_resultado}')::int = 3
                          and r #> '{ciclo,semana_atual,ppc}' = 'null'::jsonb and not (r #>> '{ciclo,semana_atual,fora_do_prazo}')::boolean, '7c semana atual: ' || (r #> '{ciclo,semana_atual}')::text);
  perform pg_temp.confere((r #>> '{ciclo,atrasadas,total}')::int = 2 and r #>> '{ciclo,atrasadas,lista,0,id}' = 'T3'
                          and r #>> '{ciclo,atrasadas,lista,0,tipo}' = 'inicio' and (r #>> '{ciclo,atrasadas,lista,0,dias}')::int = 8
                          and r #>> '{ciclo,atrasadas,lista,1,id}' = 'T2' and r #>> '{ciclo,atrasadas,lista,1,tipo}' = 'termino'
                          and (r #>> '{ciclo,atrasadas,lista,1,dias}')::int = 4, '7d atrasadas: ' || (r #> '{ciclo,atrasadas}')::text);
  perform pg_temp.confere((r #>> '{ciclo,restricoes,vencidas}')::int = 2 and (r #>> '{ciclo,restricoes,vencem_7}')::int = 1
                          and r #>> '{ciclo,restricoes,lista_vencidas,0,num}' = '1' and r #>> '{ciclo,restricoes,lista_vencidas,1,data}' = '2026-10-25'
                          and r #>> '{ciclo,restricoes,lista_vencem,0,num}' = '3', '7e restricoes: ' || (r #> '{ciclo,restricoes}')::text);
  perform pg_temp.confere(r #>> '{ciclo,apontamento,ultimo}' = '2026-10-23' and (r #>> '{ciclo,apontamento,dias_uteis_sem}')::int = 2, '7f apontamento: ' || (r #> '{ciclo,apontamento}')::text);
  perform pg_temp.confere(r #>> '{ciclo,luzes,producao,cor}' is not null and r #>> '{ciclo,luzes,plano,cor}' = 'AMARELO'
                          and r #>> '{ciclo,luzes,plano,motivo}' like '2 vencida(s)%' and r ->> 'ciclo' ~ 'frase', '7g luzes: ' || (r #> '{ciclo,luzes}')::text);
  perform pg_temp.confere((r #>> '{ciclo,criticas,total}')::int >= 1 and r #>> '{ciclo,criticas,lista,0,id}' in ('T5', 'T6'), '7h criticas: ' || (r #> '{ciclo,criticas}')::text);
  perform pg_temp.confere((r #>> '{erp,itens}')::int = 9 and (r #>> '{erp,licitado}')::numeric = 109000 and (r #>> '{erp,meta}')::numeric = 78000
                          and (r #>> '{erp,comprometido}')::numeric = 6000 and (r #>> '{erp,realizado}')::numeric = 8700
                          and (r #>> '{erp,pedidos}')::int = 3 and (r #>> '{erp,notas}')::int = 3, '7i ERP: ' || (r -> 'erp')::text);
  -- o ERP soma pelo mesmo critério do ERP (_taf_erp_valores)
  perform pg_temp.confere(pg_temp.erro('select count(*) from public._taf_erp_valores(''999'')') ~ 'permission denied', '7j anon chama _taf_erp_valores');

  -- 8. obra 998: planejador sem cronograma e ERP sem item. Vazio não é zero
  r := public.taf_resumo_obra(v_rob, '998');
  perform pg_temp.confere(r -> 'ciclo' = '{"cronograma": false}'::jsonb and (r #>> '{erp,itens}')::int = 0
                          and r #> '{erp,licitado}' = 'null'::jsonb and r #> '{erp,meta}' = 'null'::jsonb and r #> '{erp,realizado}' = 'null'::jsonb, '8a obra vazia: ' || r::text);

  -- 9. quem pede o resumo de uma obra
  perform pg_temp.confere(public.taf_resumo_obra('teste08-eng', '999') ->> 'obra' = '999', '9a engenheiro da obra');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_obra(''teste08-eng'', ''998'')') = 'SEM ACESSO A OBRA', '9b engenheiro em obra que nao e dele');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_obra(''chave-geral-teste'', ''999'')') = 'USE SUA CHAVE PESSOAL', '9c chave geral');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_obra(''chave-errada'', ''999'')') = 'CHAVE INVALIDA', '9d chave errada');
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_resumo_obra(%L, ''123'')', v_rob)) = 'OBRA INVALIDA', '9e obra que nao existe');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_obra(''teste08-pes'', ''999'')') = 'SEM ACESSO A OBRA', '9f chave do site de outra obra');

  -- 10. montar (só o robô) e registrar; nada sai duas vezes no mesmo dia
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_montar(''teste08-dir'', ''diario'')') = 'CHAVE DO ROBO INVALIDA', '10a Diretoria montou');
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_resumo_montar(%L, ''mensal'')', v_rob)) = 'QUANDO INVALIDO', '10b quando invalido');
  m := public.taf_resumo_montar(v_rob, 'diario');
  perform pg_temp.confere(jsonb_array_length(m -> 'envios') = 2 and m ->> 'dia' = '2026-10-28' and m -> 'obras' = '["998","999"]'::jsonb, '10c montar diario: ' || m::text);
  perform pg_temp.confere(m #> '{envios,0,obras}' = '["998","999"]'::jsonb and m #>> '{envios,0,email}' = 'diretor.teste@example.com'
                          and m #> '{envios,1,obras}' = '["999"]'::jsonb, '10d obras por destinatario: ' || m::text);
  r := public.taf_resumo_montar(v_rob, 'diario');
  perform pg_temp.confere(jsonb_array_length(r -> 'envios') = 0 and (r ->> 'ja_enviados')::int = 2, '10e reservado nao sai de novo: ' || r::text);
  r := public.taf_resumo_registrar(v_rob, jsonb_build_array(
         jsonb_build_object('envio', (m #>> '{envios,0,envio}')::bigint, 'ok', true, 'id', 'id-falso-1'),
         jsonb_build_object('envio', (m #>> '{envios,1,envio}')::bigint, 'ok', false, 'erro', 'Resend respondeu 500'),
         jsonb_build_object('envio', 'abc'), '"texto"'::jsonb));
  perform pg_temp.confere((r ->> 'gravados')::int = 2 and (r ->> 'ignorados')::int = 2, '10f registrar: ' || r::text);
  r := public.taf_resumo_registrar(v_rob, jsonb_build_array(jsonb_build_object('envio', (m #>> '{envios,0,envio}')::bigint, 'ok', false)));
  perform pg_temp.confere((r ->> 'ignorados')::int = 1, '10g envio ja registrado nao muda');
  r := public.taf_resumo_montar(v_rob, 'diario');
  perform pg_temp.confere(jsonb_array_length(r -> 'envios') = 1 and (r #>> '{envios,0,envio}') = (m #>> '{envios,1,envio}') and (r ->> 'ja_enviados')::int = 1, '10h so o que deu erro sai de novo: ' || r::text);
  for i in 1 .. 2 loop
    perform public.taf_resumo_registrar(v_rob, jsonb_build_array(jsonb_build_object('envio', (m #>> '{envios,1,envio}')::bigint, 'ok', false, 'erro', 'falha de teste')));
    r := public.taf_resumo_montar(v_rob, 'diario');
  end loop;
  perform public.taf_resumo_registrar(v_rob, jsonb_build_array(jsonb_build_object('envio', (m #>> '{envios,1,envio}')::bigint, 'ok', false, 'erro', 'falha de teste')));
  r := public.taf_resumo_montar(v_rob, 'diario');
  perform pg_temp.confere(jsonb_array_length(r -> 'envios') = 0 and (r ->> 'desistidos')::int = 1, '10i desiste depois de 3 tentativas: ' || r::text);
  r := public.taf_resumo_destinatarios('teste08-dir');
  perform pg_temp.confere((select z.d #>> '{ultimo,estado}' from jsonb_array_elements(r -> 'destinatarios') z(d) where (z.d ->> 'id')::bigint = v_dir) = 'enviado'
                          and (select z.d #>> '{ultimo,erro}' from jsonb_array_elements(r -> 'destinatarios') z(d) where (z.d ->> 'id')::bigint = v_ges) = 'falha de teste', '10j ultimo envio na lista');
  -- semanal: só quem é semanal, dia = segunda da semana
  m := public.taf_resumo_montar(v_rob, 'semanal');
  perform pg_temp.confere(jsonb_array_length(m -> 'envios') = 1 and m ->> 'dia' = '2026-10-26' and m #> '{envios,0,obras}' = '["999"]'::jsonb, '10k semanal: ' || m::text);

  -- 11. limite por execução
  for i in 1 .. 3 loop
    perform public.taf_resumo_destinatario_salvar('teste08-dir', null, 'Pessoa ' || i, 'pessoa' || i || '@example.com', '["999"]', 'diaria');
  end loop;
  r := public.taf_resumo_montar(v_rob, 'diario', 2);
  perform pg_temp.confere(jsonb_array_length(r -> 'envios') = 2 and (r ->> 'restantes')::int = 1, '11a limite 2: ' || r::text);
  r := public.taf_resumo_montar(v_rob, 'diario', 2);
  perform pg_temp.confere(jsonb_array_length(r -> 'envios') = 1 and (r ->> 'restantes')::int = 0, '11b o que sobrou sai na proxima: ' || r::text);

  -- 12. prévia e "Mandar agora para mim"
  r := public.taf_resumo_previa('teste08-dir');
  perform pg_temp.confere(r -> 'obras' = '["998","999"]'::jsonb and jsonb_array_length(r -> 'meus') = 1 and r #>> '{meus,0,email}' = 'd***@example.com'
                          and r -> 'envios' = 'null'::jsonb, '12a previa da Diretoria: ' || r::text);
  r := public.taf_resumo_previa('teste08-dir', v_ges);
  perform pg_temp.confere(r -> 'obras' = '["999"]'::jsonb, '12b previa de um destinatario');
  r := public.taf_resumo_previa('teste08-eng');
  perform pg_temp.confere(r -> 'obras' = '["999"]'::jsonb and r -> 'meus' = '[]'::jsonb, '12c previa do engenheiro');
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_resumo_previa(''teste08-eng'', %s)', v_dir)) = 'SEM ACESSO A ESTE DESTINATARIO', '12d engenheiro ve destinatario dos outros');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_previa(''teste08-eng'', null, true)') = 'SEU E-MAIL NAO ESTA NA LISTA', '12e engenheiro sem e-mail na lista');
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_previa(''chave-geral-teste'')') = 'USE SUA CHAVE PESSOAL', '12f chave geral');
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_resumo_previa(''teste08-lei'', %s)', v_ges)) = 'SEM ACESSO A ESTE DESTINATARIO', '12g leitura ve destinatario');
  r := public.taf_resumo_previa('teste08-dir', null, true);
  perform pg_temp.confere(jsonb_array_length(r -> 'envios') = 1 and r #>> '{envios,0,email}' = 'diretor.teste@example.com', '12h mandar para mim: ' || r::text);
  x := r #> '{envios,0}';
  perform pg_temp.confere((public.taf_resumo_registrar('teste08-eng', jsonb_build_array(jsonb_build_object('envio', (x ->> 'envio')::bigint, 'ok', true))) ->> 'ignorados')::int = 1, '12i outra pessoa registrou o teste');
  perform pg_temp.confere((public.taf_resumo_registrar('teste08-dir', jsonb_build_array(jsonb_build_object('envio', (x ->> 'envio')::bigint, 'ok', true))) ->> 'gravados')::int = 1, '12j a propria pessoa registra o teste');
  perform pg_temp.confere((public.taf_resumo_registrar('teste08-dir', jsonb_build_array(jsonb_build_object('envio', (m #>> '{envios,0,envio}')::bigint, 'ok', true))) ->> 'ignorados')::int = 1, '12k pessoa registrou envio do robo');
  for i in 2 .. 5 loop perform public.taf_resumo_previa('teste08-dir', null, true); end loop;
  perform pg_temp.confere(pg_temp.erro('select public.taf_resumo_previa(''teste08-dir'', null, true)') = 'LIMITE DE 5 ENVIOS DE TESTE POR DIA', '12l limite de testes');

  -- 13. nova chave do robô: a anterior para de valer
  v_rob2 := public.taf_resumo_robo_gerar('teste08-dir') ->> 'chave';
  perform pg_temp.confere(pg_temp.erro(format('select public.taf_resumo_montar(%L, ''diario'')', v_rob)) = 'CHAVE DO ROBO INVALIDA', '13a chave antiga do robo ainda vale');
  perform pg_temp.confere(public.taf_resumo_montar(v_rob2, 'diario') ? 'envios', '13b chave nova vale');

  raise notice '08 OK: cadastro, robô, resumo da obra 999 (planejador e ERP), envios, limite e prévia conferidos';
end $t$;

reset role;
-- 14. nada se apaga (como dono do banco)
do $t$ begin
  begin delete from public.taf_resumo_dest; raise exception 'FALHOU 14a: apagou destinatario';
  exception when others then if sqlerrm <> 'DESTINATARIO NAO SE APAGA: DESATIVE' then raise; end if; end;
  if (select count(*) from public.taf_resumo_dest_hist) < 2 then raise exception 'FALHOU 14b: mudanca sem historico'; end if;
  raise notice '08 OK: destinatário não se apaga e a mudança fica no histórico';
end $t$;

rollback;
