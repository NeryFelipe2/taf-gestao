-- Teste do 04_obra_nova.sql no banco de TESTE (obras 995 a 998, fictícias). Roda tudo dentro de uma transação e DESFAZ no fim
-- (rollback): nada fica gravado, nem as chaves de teste, nem as obras.
-- Uso: depois de aplicar o 04 (ou junto, colando o 04 logo depois do "begin;"), rodar este arquivo inteiro de uma vez:
--   psql -v ON_ERROR_STOP=1 -f fonte/erp/sql/04_teste_obra_nova.sql
-- Se alguma regra falhar, para com "FALHOU: ..." e a transação é desfeita. Se tudo passar, mostra "04 OK" e desfaz.
-- Precisa da chave geral de teste 'chave-geral-teste' em taf_chave (só existe no banco de teste); sem ela, os passos da chave geral
-- são pulados. As chaves pessoais abaixo são textos de teste e só existem dentro desta transação.

begin;

insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras, ativo) values
  (encode(extensions.digest('teste04-gestor', 'sha256'), 'hex'), 'teste', 'Teste Gestora', 'gestor', array['342'], true),
  (encode(extensions.digest('teste04-dir', 'sha256'), 'hex'), 'teste', 'Teste Diretor', 'diretoria', array['342'], true),
  (encode(extensions.digest('teste04-eng', 'sha256'), 'hex'), 'teste', 'Teste Engenheira', 'engenheiro', array['342'], true),
  (encode(extensions.digest('teste04-ler', 'sha256'), 'hex'), 'teste', null, 'leitura', array['342'], true);

-- devolve a mensagem do erro, ou '(sem erro)' se a chamada passou (com null, um "not like" nunca acusaria a chamada aceita)
create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return '(sem erro)'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.gz(p text) returns text language sql as $$
  select case p when 'v1' then 'H4sIAAAAAAAAA6tWclGyqlYqSS0uSVWyMqytBQDTs0FsEQAAAA==' else 'H4sIAAAAAAAAA6tWclGyqlYqSS0uSVWyMqqtBQCKDQduEQAAAA==' end $$;
create or replace function pg_temp.sha(p text) returns text language sql as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;
create or replace function pg_temp.itens(n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('codigo', '1.' || g, 'descricao', 'Item fictício ' || g, 'unidade', 'm', 'qtd', 10 * g,
                                      'pacote', 'TUBO', 'evento', '1.1.1', 'venda', 100 * g, 'meta', null, 'teto', null, 'meta_unit', null) order by g)
    from generate_series(1, n) g $$;
create or replace function pg_temp.grava(k text, obra text, gz text, it jsonb, papel text default null, quem text default null) returns jsonb language sql as $$
  select public.taf_erp_base_gravar(k, obra, gz, pg_temp.sha(gz), it, quem, papel) $$;

do $t$
declare r jsonb; m text; v_geral boolean := public._taf_ok('chave-geral-teste'); v_hid bigint; v_n int;
begin
  -- 1. chave pessoal de gestor cria a obra 997 e ela entra na lista da chave
  r := public.taf_erp_obra_criar('teste04-gestor', '997', '  OBRA 997  TESTE  fictícia ', 'CONTRATANTE FICTÍCIO');
  if not (r->>'ok')::boolean or r->'obra'->>'nome' <> 'OBRA 997 TESTE fictícia' or r->>'chave' <> 'pessoal' or r->>'quem' <> 'Teste Gestora' then raise exception 'FALHOU 1: %', r; end if;
  if (select obras from public.taf_ciclo_chave where hash = pg_temp.sha('teste04-gestor')) <> array['342','997'] then raise exception 'FALHOU 1b: a obra nao entrou na lista da chave'; end if;
  if (select ordem from public.taf_erp_obra where codigo = '997') <> (select max(ordem) from public.taf_erp_obra) then raise exception 'FALHOU 1c: obra nova nao foi para o fim'; end if;
  if not exists (select 1 from public.taf_erp_base_hist where codigo = '997' and acao = 'criar' and quem = 'Teste Gestora' and verificado) then raise exception 'FALHOU 1d: sem historico'; end if;

  -- 2. código repetido e inválido
  m := pg_temp.erro($$select public.taf_erp_obra_criar('teste04-gestor', '997', 'Outra', 'X Y')$$);
  if m is distinct from 'OBRA 997 JA EXISTE NO ERP' then raise exception 'FALHOU 2a: %', m; end if;
  foreach m in array array['99', '9a8', '0998', '', ' 99 '] loop
    if pg_temp.erro(format('select public.taf_erp_obra_criar(%L, %L, %L, %L)', 'teste04-gestor', m, 'Obra teste', 'Contratante')) not like 'CODIGO DA OBRA INVALIDO%' then
      raise exception 'FALHOU 2b: codigo % aceito', m; end if;
  end loop;

  -- 3. nome e contratante
  if pg_temp.erro($$select public.taf_erp_obra_criar('teste04-gestor', '996', 'ab', 'Contratante')$$) not like 'NOME DA OBRA%' then raise exception 'FALHOU 3a'; end if;
  if pg_temp.erro($$select public.taf_erp_obra_criar('teste04-gestor', '996', 'Obra teste', ' ')$$) not like 'CONTRATANTE%' then raise exception 'FALHOU 3b'; end if;
  if pg_temp.erro($$select public.taf_erp_obra_criar('teste04-gestor', '996', 'Obra <b>teste</b>', 'Contratante')$$) not like 'NOME OU CONTRATANTE%' then raise exception 'FALHOU 3c'; end if;
  if pg_temp.erro($$select public.taf_erp_obra_criar('teste04-gestor', '996', 'Obra teste', 'Contratante "x" onmouseover=')$$) not like 'NOME OU CONTRATANTE%' then raise exception 'FALHOU 3d: aspas aceitas'; end if;

  -- 4. quem não pode: engenheiro, leitura, chave errada
  m := pg_temp.erro($$select public.taf_erp_obra_criar('teste04-eng', '996', 'Obra teste', 'Contratante')$$);
  if m not like 'SEM PERMISSAO%' then raise exception 'FALHOU 4a: %', m; end if;
  m := pg_temp.erro($$select public.taf_erp_obra_criar('teste04-ler', '996', 'Obra teste', 'Contratante')$$);
  if m is distinct from 'CHAVE SO DE LEITURA' then raise exception 'FALHOU 4b: %', m; end if;
  m := pg_temp.erro($$select public.taf_erp_obra_criar('chave-que-nao-existe', '996', 'Obra teste', 'Contratante')$$);
  if m is distinct from 'CHAVE INVALIDA' then raise exception 'FALHOU 4c: %', m; end if;

  -- 5. diretoria cria a 996
  r := public.taf_erp_obra_criar('teste04-dir', '996', 'OBRA 996 TESTE', 'CONTRATANTE FICTÍCIO', null, 'engenheiro');   -- papel da tela não vale com chave pessoal
  if r->>'papel' <> 'diretoria' then raise exception 'FALHOU 5: %', r; end if;

  -- 6. chave geral: só com papel Gestão ou Diretoria escolhido e com o nome
  if v_geral then
    foreach m in array array[null, '', 'engenheiro', 'admin', 'gerente'] loop
      if pg_temp.erro(format('select public.taf_erp_obra_criar(%L, %L, %L, %L, %L, %L)', 'chave-geral-teste', '998', 'Obra teste', 'Contratante', 'Fulano', m)) not like 'SEM PERMISSAO%' then
        raise exception 'FALHOU 6a: papel % aceito', coalesce(m, 'null'); end if;
    end loop;
    m := pg_temp.erro($$select public.taf_erp_obra_criar('chave-geral-teste', '998', 'Obra teste', 'Contratante', '  ', 'gestao')$$);
    if m is distinct from 'INFORME SEU NOME' then raise exception 'FALHOU 6b: %', m; end if;
    r := public.taf_erp_obra_criar('chave-geral-teste', '998', 'OBRA 998 TESTE', 'CONTRATANTE FICTÍCIO', 'Nome Digitado', 'gestao');
    if r->>'chave' <> 'geral' or r->>'quem' <> 'Nome Digitado' or r->'obras_da_chave' <> 'null'::jsonb then raise exception 'FALHOU 6c: %', r; end if;
    if not exists (select 1 from public.taf_erp_base_hist where codigo = '998' and acao = 'criar' and quem = 'Nome Digitado' and not verificado) then raise exception 'FALHOU 6d'; end if;
  else
    raise notice 'sem chave geral de teste: passos 6 e da chave geral pulados';
    perform public.taf_erp_obra_criar('teste04-gestor', '998', 'OBRA 998 TESTE', 'CONTRATANTE FICTÍCIO');
  end if;

  -- 7. base: recusas
  m := pg_temp.erro($$select public.taf_erp_base_gravar('teste04-gestor', '997', pg_temp.gz('v1'), repeat('0', 64), pg_temp.itens(2))$$);
  if m is distinct from 'BASE_SHA NAO CONFERE COM A BASE ENVIADA' then raise exception 'FALHOU 7a: %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '997', 'eyJEIjp7fX0AAAAAAAAAAAAAAAA=', pg_temp.itens(2))$$);
  if m is distinct from 'BASE INVALIDA: ESPERADO GZIP EM BASE64' then raise exception 'FALHOU 7b: %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '997', 'H4sI' || repeat('A', 3000000), pg_temp.itens(2))$$);
  if m not like 'BASE GRANDE DEMAIS%' then raise exception 'FALHOU 7c: %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '997', pg_temp.gz('v1'), '[]')$$);
  if m not like 'PLANILHA VAZIA OU GRANDE DEMAIS%' then raise exception 'FALHOU 7d: %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '997', pg_temp.gz('v1'), pg_temp.itens(5001))$$);
  if m not like 'PLANILHA VAZIA OU GRANDE DEMAIS (5001%' then raise exception 'FALHOU 7e: %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '997', pg_temp.gz('v1'), pg_temp.itens(2) || pg_temp.itens(1))$$);
  if m not like 'ORCAMENTO RECUSADO (1 PROBLEMA(S)): código repetido: 1.1%' then raise exception 'FALHOU 7f: %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '997', pg_temp.gz('v1'), '[{"codigo":"1\"><b>","qtd":"10","unidade":"m<","pacote":"A B","evento":"1;1"}]')$$);
  if m not like 'ORCAMENTO RECUSADO (5 PROBLEMA(S))%' or m not like '%qtd não é número%' or m not like '%código de item inválido%'
     or m not like '%unidade inválida%' or m not like '%pacote inválido%' or m not like '%evento inválido%' then raise exception 'FALHOU 7g: %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-eng', '997', pg_temp.gz('v1'), pg_temp.itens(2))$$);
  if m not like 'SEM PERMISSAO%' then raise exception 'FALHOU 7h: %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-dir', '997', pg_temp.gz('v1'), pg_temp.itens(2))$$);
  if m is distinct from 'SEM ACESSO A OBRA' then raise exception 'FALHOU 7i (diretor sem a 997 na lista): %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '995', pg_temp.gz('v1'), pg_temp.itens(2))$$);
  if m is distinct from 'OBRA INVALIDA' then raise exception 'FALHOU 7j: %', m; end if;

  -- 8. primeira gravação: itens entram, histórico sem base anterior
  r := pg_temp.grava('teste04-gestor', '997', pg_temp.gz('v1'), pg_temp.itens(3));
  if (r->>'itens')::int <> 3 or (r->>'igual')::boolean or r->>'anterior' is not null then raise exception 'FALHOU 8a: %', r; end if;
  if (select count(*) from public.taf_erp_item where obra = '997') <> 3 then raise exception 'FALHOU 8b'; end if;
  if (select venda from public.taf_erp_item where obra = '997' and codigo = '1.2') <> 200 or (select meta from public.taf_erp_item where obra = '997' and codigo = '1.2') is not null then raise exception 'FALHOU 8c'; end if;
  -- o banco grava a marca "tela:" (o ERP abre esta base pela lista fechada de campos) e devolve o valor com a marca
  if (select base_sha from public.taf_erp_obra where codigo = '997') <> 'tela:' || pg_temp.sha(pg_temp.gz('v1')) or r->>'base_sha' <> 'tela:' || pg_temp.sha(pg_temp.gz('v1')) then raise exception 'FALHOU 8d: %', r; end if;
  if not exists (select 1 from public.taf_erp_base_hist where codigo = '997' and acao = 'base' and base_gz is null and itens is null and n_itens = 3) then raise exception 'FALHOU 8e'; end if;
  -- o ERP lê a base pela entrada de sempre
  r := public.taf_erp_ler('teste04-gestor', '997');
  if r->>'base_gz' <> pg_temp.gz('v1') or r->>'base_sha' <> 'tela:' || pg_temp.sha(pg_temp.gz('v1')) then raise exception 'FALHOU 8f: %', r; end if;
  if not exists (select 1 from jsonb_array_elements(public.taf_erp_entrar('teste04-gestor') -> 'obras') o where o->>'codigo' = '997') then raise exception 'FALHOU 8g'; end if;

  -- 9. mesma base de novo: nada muda
  r := pg_temp.grava('teste04-gestor', '997', pg_temp.gz('v1'), pg_temp.itens(3));
  if not (r->>'igual')::boolean or (select count(*) from public.taf_erp_base_hist where codigo = '997' and acao = 'base') <> 1 then raise exception 'FALHOU 9: %', r; end if;

  -- 10. base nova (chave pessoal, obra criada pela tela e sem nada lançado): a anterior vai para o histórico com os itens dela
  r := pg_temp.grava('teste04-gestor', '997', pg_temp.gz('v2'), pg_temp.itens(2));
  v_hid := (r->>'hid')::bigint;
  if r->>'anterior' <> 'tela:' || pg_temp.sha(pg_temp.gz('v1')) or (select count(*) from public.taf_erp_item where obra = '997') <> 2 then raise exception 'FALHOU 10a: %', r; end if;
  if (select base_gz from public.taf_erp_base_hist where hid = v_hid) <> pg_temp.gz('v1')
     or jsonb_array_length((select itens from public.taf_erp_base_hist where hid = v_hid)) <> 3 then raise exception 'FALHOU 10b'; end if;

  -- 11. voltar para a versão anterior (só por SQL)
  r := public._taf_erp_base_voltar('997', v_hid, 'Teste');
  if (select base_gz from public.taf_erp_obra where codigo = '997') <> pg_temp.gz('v1') or (select base_sha from public.taf_erp_obra where codigo = '997') <> 'tela:' || pg_temp.sha(pg_temp.gz('v1'))
     or (select count(*) from public.taf_erp_item where obra = '997') <> 3
     or (select descricao from public.taf_erp_item where obra = '997' and codigo = '1.3') <> 'Item fictício 3' then raise exception 'FALHOU 11a: %', r; end if;
  if not exists (select 1 from public.taf_erp_base_hist where codigo = '997' and acao = 'voltar' and base_gz = pg_temp.gz('v2')) then raise exception 'FALHOU 11b'; end if;

  -- 12. linha de base congelada: não regrava
  update public.taf_erp_obra set estado = '{"frozen":true}' where codigo = '996';
  m := pg_temp.erro($$select pg_temp.grava('teste04-dir', '996', pg_temp.gz('v1'), pg_temp.itens(2))$$);
  if m not like 'LINHA DE BASE DA OBRA 996 JA CONGELADA%' then raise exception 'FALHOU 12: %', m; end if;

  -- 13. obra com nota lançada: não regrava (o caminho é Atualizar pela planilha)
  insert into public.taf_erp_doc (obra, id, tipo, dados, criado_por, atualizado_por, papel) values ('997', 't04-nf', 'nf', '{"num":"NF-T04"}', 'teste', 'teste', 'adm');
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '997', pg_temp.gz('v2'), pg_temp.itens(2))$$);
  if m not like 'OBRA 997 JA TEM DOCUMENTO LANCADO (1 DOCUMENTO(S))%' then raise exception 'FALHOU 13a: %', m; end if;
  m := pg_temp.erro(format('select public._taf_erp_base_voltar(%L, %s)', '997', v_hid));
  if m not like 'OBRA 997 JA TEM DOCUMENTO LANCADO%' then raise exception 'FALHOU 13b: %', m; end if;

  -- 14. chave geral grava a base da 998 (que ela criou) com o nome digitado, uma vez só
  if v_geral then
    m := pg_temp.erro($$select pg_temp.grava('chave-geral-teste', '998', pg_temp.gz('v1'), pg_temp.itens(4), null, 'Nome Digitado')$$);
    if m not like 'SEM PERMISSAO%' then raise exception 'FALHOU 14a: sem papel mandado pela tela foi aceito: %', m; end if;
    r := pg_temp.grava('chave-geral-teste', '998', pg_temp.gz('v2'), pg_temp.itens(4), 'diretoria', 'Nome Digitado');
    if r->>'quem' <> 'Nome Digitado' or r->>'papel' <> 'diretoria' or r->>'base_sha' not like 'tela:%' then raise exception 'FALHOU 14: %', r; end if;
    -- a mesma base de novo responde igual (a tela que perdeu a resposta tenta de novo)
    r := pg_temp.grava('chave-geral-teste', '998', pg_temp.gz('v2'), pg_temp.itens(4), 'gestao', 'Outro Nome');
    if not (r->>'igual')::boolean then raise exception 'FALHOU 14b: %', r; end if;
    -- [revisão] regravar com a chave geral: recusado (antes trocava a base de qualquer obra sem compra)
    m := pg_temp.erro($$select pg_temp.grava('chave-geral-teste', '998', pg_temp.gz('v1'), pg_temp.itens(4), 'gestao', 'Intruso')$$);
    if m not like 'COM A CHAVE DO SITE O ORCAMENTO SO E GRAVADO UMA VEZ%' then raise exception 'FALHOU 14c: %', m; end if;
    if (select base_sha from public.taf_erp_obra where codigo = '998') <> 'tela:' || pg_temp.sha(pg_temp.gz('v2')) then raise exception 'FALHOU 14d'; end if;
    -- chave pessoal de diretoria (com a 998 na lista) regrava a obra limpa
    update public.taf_ciclo_chave set obras = obras || '998'::text where hash = pg_temp.sha('teste04-dir');
    r := pg_temp.grava('teste04-dir', '998', pg_temp.gz('v1'), pg_temp.itens(3));
    if (r->>'itens')::int <> 3 or r->>'quem' <> 'Teste Diretor' then raise exception 'FALHOU 14e: %', r; end if;
    -- [revisão] chave geral não grava a primeira base de obra criada por chave pessoal (a 996 é da diretoria; sem a trava de congelada)
    update public.taf_erp_obra set estado = '{}' where codigo = '996';
    m := pg_temp.erro($$select pg_temp.grava('chave-geral-teste', '996', pg_temp.gz('v1'), pg_temp.itens(2), 'gestao', 'Intruso')$$);
    if m not like 'OBRA 996 FOI CRIADA COM CHAVE PESSOAL%' then raise exception 'FALHOU 14f: %', m; end if;
    update public.taf_erp_obra set estado = '{"frozen":true}' where codigo = '996';
  end if;

  -- 16. [revisão] obra antiga (como o carga.py grava: base, itens, estado com meta e documentos, sem a linha 'criar'): ninguém regrava por aqui
  alter table public.taf_erp_obra disable trigger taf_erp_obra_trg;
  insert into public.taf_erp_obra (codigo, nome, contratante, ordem, base_gz, base_sha, estado)
  values ('990', 'OBRA 990 ANTIGA (fictícia)', 'CONTRATANTE FICTÍCIO', 90, pg_temp.gz('v1'), repeat('a', 64), '{}');
  alter table public.taf_erp_obra enable trigger taf_erp_obra_trg;
  insert into public.taf_erp_item (obra, codigo, descricao, venda) values ('990', '1.1', 'Item antigo', 10);
  update public.taf_ciclo_chave set obras = obras || '990'::text where hash in (pg_temp.sha('teste04-gestor'), pg_temp.sha('teste04-dir'));
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '990', pg_temp.gz('v2'), pg_temp.itens(2))$$);
  if m not like 'OBRA 990 NAO FOI CRIADA PELA TELA%' then raise exception 'FALHOU 16a: %', m; end if;
  if v_geral then
    m := pg_temp.erro($$select pg_temp.grava('chave-geral-teste', '990', pg_temp.gz('v2'), pg_temp.itens(2), 'gestao', 'Intruso')$$);
    if m not like 'OBRA 990 NAO FOI CRIADA PELA TELA%' then raise exception 'FALHOU 16b: %', m; end if;
  end if;
  if (select base_sha from public.taf_erp_obra where codigo = '990') <> repeat('a', 64)
     or (select string_agg(codigo, ',') from public.taf_erp_item where obra = '990') <> '1.1' then raise exception 'FALHOU 16c: a obra antiga mudou'; end if;

  -- 17. [revisão] documento de qualquer tipo trava (tarefa ligada ao item, apontamento, contrato, título...), não só compra e nota
  perform public.taf_erp_obra_criar('teste04-gestor', '994', 'OBRA 994 TESTE', 'CONTRATANTE FICTÍCIO');
  perform pg_temp.grava('teste04-gestor', '994', pg_temp.gz('v1'), pg_temp.itens(2));
  foreach m in array array['elo', 'apt', 'ctr', 'tit', 'aud'] loop
    insert into public.taf_erp_doc (obra, id, tipo, dados, criado_por, atualizado_por, papel) values ('994', 't04-' || m, m, '{"item":"1.1"}', 'teste', 'teste', 'gestao');
    v_n := (select count(*) from public.taf_erp_doc where obra = '994');
    if pg_temp.erro($$select pg_temp.grava('teste04-gestor', '994', pg_temp.gz('v2'), pg_temp.itens(2))$$) not like format('OBRA 994 JA TEM DOCUMENTO LANCADO (%s DOCUMENTO(S))%%', v_n) then
      raise exception 'FALHOU 17: documento % não travou', m; end if;
    alter table public.taf_erp_doc disable trigger taf_erp_doc_trg;
    delete from public.taf_erp_doc where obra = '994';
    alter table public.taf_erp_doc enable trigger taf_erp_doc_trg;
  end loop;

  -- 18. [revisão] meta ou ajuste no estado trava; estado só com parâmetros não
  update public.taf_erp_obra set estado = '{"frozen":false,"versao":1,"hist":[],"metaOv":{"1.1":123},"baseOv":{},"basePac":{}}' where codigo = '994';
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '994', pg_temp.gz('v2'), pg_temp.itens(2))$$);
  if m not like 'OBRA 994 JA TEM META OU AJUSTE NA LINHA DE BASE%' then raise exception 'FALHOU 18a: %', m; end if;
  update public.taf_erp_obra set estado = '{"metaOv":{},"basePac":{"TUBO":{"meta":5}}}' where codigo = '994';
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '994', pg_temp.gz('v2'), pg_temp.itens(2))$$);
  if m not like 'OBRA 994 JA TEM META OU AJUSTE NA LINHA DE BASE%' then raise exception 'FALHOU 18b: %', m; end if;
  update public.taf_erp_obra set estado = '{"frozen":false,"versao":1,"hist":[],"metaOv":{},"baseOv":null,"basePac":{},"par":{"tol":0.02}}' where codigo = '994';
  r := pg_temp.grava('teste04-gestor', '994', pg_temp.gz('v2'), pg_temp.itens(2));
  if (r->>'igual')::boolean or (r->>'itens')::int <> 2 then raise exception 'FALHOU 18c: %', r; end if;

  -- 19. [revisão] descrição com < > ou aspas é recusada (a tela troca por ‹ › ″ antes de mandar)
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '994', pg_temp.gz('v1'), '[{"codigo":"1.1","descricao":"Tubo <img src=x onerror=alert(1)>","qtd":1,"venda":1}]')$$);
  if m not like 'ORCAMENTO RECUSADO (1 PROBLEMA(S)): 1.1: descrição com < > ou aspas%' then raise exception 'FALHOU 19a: %', m; end if;
  m := pg_temp.erro($$select pg_temp.grava('teste04-gestor', '994', pg_temp.gz('v1'), '[{"codigo":"1.1","descricao":"Tubo 4\" PVC","qtd":1,"venda":1}]')$$);
  if m not like 'ORCAMENTO RECUSADO (1 PROBLEMA(S)): 1.1: descrição com < > ou aspas%' then raise exception 'FALHOU 19b: %', m; end if;
  r := pg_temp.grava('teste04-gestor', '994', pg_temp.gz('v1'), '[{"codigo":"1.1","descricao":"Tubo 4″ PVC ‹DN 100›","qtd":1,"venda":1}]');
  if (select descricao from public.taf_erp_item where obra = '994' and codigo = '1.1') <> 'Tubo 4″ PVC ‹DN 100›' then raise exception 'FALHOU 19c: %', r; end if;
end $t$;

-- 15. como o site chama (papel anon): as duas entradas funcionam; as internas e a tabela não
set local role anon;
do $t$
declare r jsonb; m text;
begin
  r := public.taf_erp_obra_criar('teste04-gestor', '995', 'OBRA 995 TESTE', 'CONTRATANTE FICTÍCIO');
  if not (r->>'ok')::boolean then raise exception 'FALHOU 15a: %', r; end if;
  r := public.taf_erp_base_gravar('teste04-gestor', '995', 'H4sIAAAAAAAAA6tWclGyqlYqSS0uSVWyMqytBQDTs0FsEQAAAA==',
         '14af22521f675229c7d04ecf59346caf7bbd27a418fd9b59dfb73d30ee31f1b8', '[{"codigo":"1.1","descricao":"Item","unidade":"m","qtd":1,"venda":10}]');
  if (r->>'itens')::int <> 1 then raise exception 'FALHOU 15b: %', r; end if;
  begin perform public._taf_erp_gestor('teste04-gestor', null, null); raise exception 'FALHOU 15c: anon chamou _taf_erp_gestor';
  exception when insufficient_privilege then null; end;
  begin perform public._taf_erp_base_voltar('995', 1, 'x'); raise exception 'FALHOU 15d: anon chamou _taf_erp_base_voltar';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.taf_erp_base_hist; raise exception 'FALHOU 15e: anon leu taf_erp_base_hist';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.taf_erp_item; raise exception 'FALHOU 15f: anon leu taf_erp_item';
  exception when insufficient_privilege then null; end;
  raise notice '04 OK';
end $t$;
reset role;

rollback;
