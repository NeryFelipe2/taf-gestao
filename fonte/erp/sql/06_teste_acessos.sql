-- Teste do 06_acessos.sql na OBRA 999 · DEMONSTRAÇÃO e na 998 (fictícias). Roda numa transação e DESFAZ tudo no fim (rollback):
-- nada fica gravado, nem as obras, nem as chaves, nem o registro.
-- Uso: num banco que já tem o 06 (ou colando o 06 logo depois do "begin;"), rodar este arquivo inteiro de uma vez, por exemplo
--   psql -v ON_ERROR_STOP=1 -f fonte/erp/sql/06_teste_acessos.sql
-- Se uma regra falhar, para com "FALHOU: ..." e a transação é desfeita. Se tudo passar, mostra "06 OK" e desfaz.
-- As chamadas das telas rodam como o papel anon (igual ao site). Precisa da chave geral de teste 'chave-geral-teste' em taf_chave
-- (o banco de teste local já tem; noutro banco, troque o texto abaixo por uma chave geral de teste e apague depois).
-- Nenhuma chave real: as chaves pessoais deste teste nascem aqui dentro e somem no rollback.

begin;

-- ---------- cenário (como dono do banco)
insert into public.taf_erp_obra (codigo, nome, contratante) values ('999', 'OBRA 999 · DEMONSTRAÇÃO', 'Cliente fictício'),
  ('998', 'OBRA 998 · DEMONSTRAÇÃO 2', 'Cliente fictício') on conflict (codigo) do nothing;
insert into public.taf_ciclo_obra (obra, nome, engenheiro, ep, base_rev, equipe)
values ('999', 'OBRA 999 · DEMONSTRAÇÃO', 'Engenheira Demonstração', date '2026-09-01', 'teste 06', array['Engenheira Demonstração'])
on conflict (obra) do nothing;
-- partida limpa: nenhuma chave de Diretoria ativa (o rollback devolve como estava)
update public.taf_ciclo_chave set ativo = false where papel = 'diretoria' and ativo;

create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'OK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FALHOU: %', p_msg; end if; end $$;
create or replace function pg_temp.lit(p text) returns text language sql as $$ select quote_literal(p) $$;
create temp table t06 (k text primary key, v text) on commit drop;
grant all on t06 to anon;

-- ---------- tudo o que as telas fazem, como o site faz (papel anon)
set local role anon;

do $t$
declare r jsonb; e text; g constant text := 'chave-geral-teste';
  k_dir text; k_dir2 text; k_ges text; k_ges2 text; k_eng text; k_eng_errado text; k_enc text; k_lei text; k_eng2obras text;
  id_dir text; id_dir2 text; id_ges2 text; id_eng text; id_eng2obras text; id_enc text;
begin
  perform set_config('taf.agora', '2026-10-28 10:00:00-03', true);   -- relógio do planejador no teste: quarta-feira, semana de 26/10
  -- 1. partida: sem Diretoria ativa, a chave geral só vê o estado e só pode criar Diretoria
  r := public.taf_acesso_listar(g, 'Felipe Teste');
  perform pg_temp.ok((r->>'partida')::boolean, '1a partida');
  perform pg_temp.ok(r->'pode_criar' = '["diretoria"]'::jsonb, '1b pode_criar na partida: ' || (r->>'pode_criar'));
  perform pg_temp.ok(r->'chaves' = '[]'::jsonb, '1c chave geral nao ve a lista');
  perform pg_temp.ok(jsonb_array_length(r->'obras') >= 2, '1d obras para escolher');
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', g, 'Diretor Teste', 'Diretor Teste', 'diretoria', '999'));
  perform pg_temp.ok(e = 'INFORME SEU NOME', '1e chave geral sem nome: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], %L)', g, 'Gestor Teste', 'Gestor Teste', 'gestor', '999', 'Felipe Teste'));
  perform pg_temp.ok(e = 'NA PARTIDA A CHAVE GERAL SO CRIA A PRIMEIRA CHAVE DE DIRETORIA', '1f partida so diretoria: ' || e);

  -- 2. a primeira Diretoria nasce pela chave geral; a chave volta uma vez, legível, e só o sha256 fica no banco
  r := public.taf_acesso_criar(g, 'Diretor Teste', 'Diretor Teste', 'diretoria', array['999','998'], 'Felipe Teste');
  k_dir := r->>'chave'; id_dir := r->>'id';
  perform pg_temp.ok(k_dir ~ '^diretor-[0-9a-f]{4}(-[0-9a-f]{4}){5}$', '2a formato da chave: ' || k_dir);
  perform pg_temp.ok(id_dir ~ '^[0-9a-f]{10}$', '2b id curto');   -- e que é o começo do sha256: conferido no 12c
  perform pg_temp.ok((r->>'partida')::boolean and r->>'criado_por' = 'Felipe Teste (chave geral)', '2c criado pela chave geral');
  insert into t06 values ('k_dir', k_dir);

  -- 3. depois da primeira Diretoria a chave geral não cria mais nada nem vê a lista
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], %L)', g, 'Outro Diretor', 'Outro Diretor', 'diretoria', '999', 'Felipe Teste'));
  perform pg_temp.ok(e like 'A CHAVE GERAL NAO CRIA ACESSO%', '3a chave geral depois da partida: ' || e);
  r := public.taf_acesso_listar(g, 'Felipe Teste');
  perform pg_temp.ok(not (r->>'partida')::boolean and r->'pode_criar' = '[]'::jsonb and r->'chaves' = '[]'::jsonb and r->'obras' = '[]'::jsonb, '3b listar geral: ' || r::text);
  e := pg_temp.err(format('select public.taf_acesso_desativar(%L, %L, null, %L)', g, id_dir, 'Felipe Teste'));
  perform pg_temp.ok(e like 'A CHAVE GERAL NAO DESATIVA ACESSO%', '3c chave geral nao desativa: ' || e);

  -- 4. Diretoria cria qualquer papel, em qualquer obra
  r := public.taf_acesso_listar(k_dir);
  perform pg_temp.ok(r->'pode_criar' = '["diretoria","gestor","engenheiro","encarregado","leitura"]'::jsonb, '4a pode_criar diretoria');
  perform pg_temp.ok(r#>>'{ator,nome}' = 'Diretor Teste' and (r#>>'{ator,verificado}')::boolean, '4b ator');
  perform pg_temp.ok(jsonb_array_length(r->'chaves') >= 1 and exists (select 1 from jsonb_array_elements(r->'chaves') c
                     where c->>'id' = id_dir and (c->>'sua')::boolean and c->>'bloqueio' like 'NAO DESATIVE A PROPRIA CHAVE%'), '4c a propria chave na lista');
  perform pg_temp.ok(not (r::text ~ '[0-9a-f]{64}') and position(k_dir in r::text) = 0, '4d lista sem hash inteiro e sem a chave');
  r := public.taf_acesso_criar(k_dir, 'Gestor Teste', 'Gestor Teste', 'gestor', array['999'], null); k_ges := r->>'chave';
  r := public.taf_acesso_criar(k_dir, 'Gestor Dois', 'Gestor Dois', 'gestor', array['999'], null); k_ges2 := r->>'chave'; id_ges2 := r->>'id';
  r := public.taf_acesso_criar(k_dir, 'Diretora Dois', 'Diretora Dois', 'diretoria', array['999','998'], null); k_dir2 := r->>'chave'; id_dir2 := r->>'id';
  perform pg_temp.ok(r->>'criado_por' = 'Diretor Teste', '4e criado_por pessoal');
  -- engenheiro com o nome certo: sem aviso; com outro nome: aviso (não bloqueia)
  r := public.taf_acesso_criar(k_dir, 'Engenheira 999', 'Engenheira Demonstração', 'engenheiro', array['999'], null); k_eng := r->>'chave'; id_eng := r->>'id';
  perform pg_temp.ok(r->'avisos' = '[]'::jsonb, '4f nome certo sem aviso: ' || (r->>'avisos'));
  r := public.taf_acesso_criar(k_dir, 'Eng nome errado', 'Engenheiro Outro', 'engenheiro', array['999'], null); k_eng_errado := r->>'chave';
  perform pg_temp.ok(r->>'avisos' like '%o engenheiro no planejador é Engenheira Demonstração e esta chave está em nome de Engenheiro Outro%', '4g aviso do nome: ' || (r->>'avisos'));
  r := public.taf_acesso_criar(k_dir, 'Eng duas obras', 'Engenheira Demonstração', 'engenheiro', array['999','998'], null); k_eng2obras := r->>'chave'; id_eng2obras := r->>'id';
  perform pg_temp.ok(r->>'avisos' like '%Obra 998 ainda sem cronograma no planejador%', '4h aviso obra sem planejador: ' || (r->>'avisos'));
  r := public.taf_acesso_listar(k_dir);
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(r->'chaves') c where c->>'nome' = 'Eng nome errado' and jsonb_array_length(c->'avisos') = 1), '4i aviso tambem na lista');

  -- 5. gestor: só engenheiro, encarregado e leitura, só nas obras da própria chave
  r := public.taf_acesso_listar(k_ges);
  perform pg_temp.ok(r->'pode_criar' = '["engenheiro","encarregado","leitura"]'::jsonb, '5a pode_criar gestor');
  perform pg_temp.ok(jsonb_array_length(r->'obras') = 1 and r#>>'{obras,0,codigo}' = '999', '5b gestor so ve as obras dele');
  r := public.taf_acesso_criar(k_ges, 'Encarregado 999', 'Encarregado Demonstração', 'encarregado', array['999'], null); k_enc := r->>'chave'; id_enc := r->>'id';
  perform pg_temp.ok(k_enc ~ '^encarregado-', '5c prefixo do nome (sem acento): ' || k_enc);
  r := public.taf_acesso_criar(k_ges, 'Leitura cliente', '', 'leitura', array['999'], null); k_lei := r->>'chave';
  perform pg_temp.ok(r->>'pessoa' is null and k_lei ~ '^leitura-', '5d leitura sem pessoa usa o nome: ' || k_lei);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_ges, 'Novo Diretor', 'Novo Diretor', 'diretoria', '999'));
  perform pg_temp.ok(e = 'SEM PERMISSAO: GESTOR NAO CRIA CHAVE DE DIRETORIA', '5e gestor nao cria diretoria: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_ges, 'Novo Gestor', 'Novo Gestor', 'gestor', '999'));
  perform pg_temp.ok(e = 'SEM PERMISSAO: GESTOR NAO CRIA CHAVE DE GESTOR', '5f gestor nao cria gestor: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_ges, 'Eng 998', 'Eng 998', 'engenheiro', '998'));
  perform pg_temp.ok(e like 'SEM ACESSO A OBRA 998%', '5g gestor fora da obra: ' || e);

  -- 6. validação
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_dir, 'Admin X', 'Admin X', 'admin', '999'));
  perform pg_temp.ok(e = 'PAPEL INVALIDO', '6a papel: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_dir, 'Obra X', 'Obra X', 'engenheiro', '123'));
  perform pg_temp.ok(e = 'OBRA 123 NAO EXISTE', '6b obra inexistente: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_dir, 'Obra Y', 'Obra Y', 'engenheiro', 'abc'));
  perform pg_temp.ok(e = 'OBRA abc NAO EXISTE', '6c obra mal escrita: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, %L::text[], null)', k_dir, 'Sem Obra', 'Sem Obra', 'engenheiro', '{}'));
  perform pg_temp.ok(e = 'ESCOLHA AO MENOS UMA OBRA', '6d sem obra: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_dir, 'ab', 'Pessoa Ok', 'engenheiro', '999'));
  perform pg_temp.ok(e like 'NOME DA CHAVE: DE 3 A 60 LETRAS', '6e nome curto: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_dir, 'Nome <b>', 'Pessoa Ok', 'engenheiro', '999'));
  perform pg_temp.ok(e like 'NOME COM SINAL QUE NAO PODE%', '6f sinal proibido: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_dir, 'Sem Pessoa', '  ', 'engenheiro', '999'));
  perform pg_temp.ok(e = 'INFORME A PESSOA', '6g engenheiro sem pessoa: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', k_dir, 'gestor   TESTE', 'Gestor Teste', 'gestor', '999'));
  perform pg_temp.ok(e like 'JA EXISTE CHAVE ATIVA COM O NOME%', '6h nome repetido entre as ativas: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_listar(%L)', 'chave-que-nao-existe'));
  perform pg_temp.ok(e = 'CHAVE INVALIDA', '6i chave invalida: ' || e);

  -- 7. engenheiro, encarregado e leitura não cuidam de acessos
  foreach e in array array[k_eng, k_enc, k_lei] loop
    perform pg_temp.ok(pg_temp.err(format('select public.taf_acesso_listar(%L)', e)) = 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS', '7a listar ' || left(e, 12));
    perform pg_temp.ok(pg_temp.err(format('select public.taf_acesso_criar(%L, %L, %L, %L, array[%L], null)', e, 'Tentativa X', 'Tentativa X', 'leitura', '999'))
                       = 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS', '7b criar ' || left(e, 12));
    perform pg_temp.ok(pg_temp.err(format('select public.taf_acesso_desativar(%L, %L, null, null)', e, id_eng)) = 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS', '7c desativar ' || left(e, 12));
  end loop;

  -- 8. desativar: regras de quem pode
  e := pg_temp.err(format('select public.taf_acesso_desativar(%L, %L, null, null)', k_ges, id_ges2));
  perform pg_temp.ok(e = 'SEM PERMISSAO: O GESTOR SO DESATIVA ENGENHEIRO, ENCARREGADO E LEITURA', '8a gestor nao desativa gestor: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_desativar(%L, %L, null, null)', k_ges, id_eng2obras));
  perform pg_temp.ok(e = 'SEM PERMISSAO: A CHAVE TEM OBRA FORA DAS SUAS', '8b gestor e obra fora: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_desativar(%L, %L, null, null)', k_dir, id_dir));
  perform pg_temp.ok(e like 'NAO DESATIVE A PROPRIA CHAVE%', '8c propria chave: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_desativar(%L, %L, null, null)', k_dir, 'XYZ'));
  perform pg_temp.ok(e = 'IDENTIFICADOR INVALIDO', '8d id invalido: ' || e);
  e := pg_temp.err(format('select public.taf_acesso_desativar(%L, %L, null, null)', k_dir, 'ffffffffff'));
  perform pg_temp.ok(e in ('CHAVE NAO ENCONTRADA'), '8e id que nao existe: ' || e);
  r := public.taf_acesso_desativar(k_ges, id_eng, 'trocou de celular', null);
  perform pg_temp.ok((r->>'ok')::boolean and r->>'desativado_por' = 'Gestor Teste', '8f gestor desativa engenheiro');
  e := pg_temp.err(format('select public.taf_acesso_desativar(%L, %L, null, null)', k_dir, id_eng));
  perform pg_temp.ok(e = 'CHAVE JA DESATIVADA', '8g ja desativada: ' || e);
  -- chave desativada não entra mais em lugar nenhum
  perform pg_temp.ok(pg_temp.err(format('select public.taf_erp_entrar(%L, null, null)', k_eng)) = 'CHAVE INVALIDA', '8h desativada no ERP');
  perform pg_temp.ok(pg_temp.err(format('select public.taf_ciclo_ler(%L, %L, null, null)', k_eng, '999')) = 'CHAVE INVALIDA', '8i desativada no planejador');
  r := public.taf_acesso_listar(k_dir);
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(r->'chaves') c where c->>'id' = id_eng and not (c->>'ativo')::boolean
                     and c->>'desativado_por' = 'Gestor Teste' and c->>'criado_por' = 'Diretor Teste' and c->>'bloqueio' = 'CHAVE JA DESATIVADA'), '8j lista mostra a desativada');

  -- 9. Diretoria: desativa outra Diretoria; a última Diretoria ativa fica (ninguém desativa a própria)
  r := public.taf_acesso_desativar(k_dir2, id_dir, 'teste da partida', null);
  perform pg_temp.ok((r->>'ok')::boolean, '9a diretoria desativa diretoria');
  perform pg_temp.ok(pg_temp.err(format('select public.taf_acesso_listar(%L)', k_dir)) = 'CHAVE INVALIDA', '9b a desativada nao entra');
  e := pg_temp.err(format('select public.taf_acesso_desativar(%L, %L, null, null)', k_dir2, id_dir2));
  perform pg_temp.ok(e like 'NAO DESATIVE A PROPRIA CHAVE%', '9c a ultima diretoria nao se desativa: ' || e);
  r := public.taf_acesso_listar(g, 'Felipe Teste');
  perform pg_temp.ok(not (r->>'partida')::boolean, '9d continua sem partida: a chave geral nao volta a criar');

  -- 10. encarregado: entra no ERP e no planejador como encarregado, aponta o dia e não monta nem publica
  r := public.taf_erp_entrar(k_enc, null, null);
  perform pg_temp.ok(r->>'papel' = 'encarregado' and (r->>'fixo')::boolean and not (r->>'leitura')::boolean and r->>'quem' = 'Encarregado Demonstração', '10a ERP: ' || r::text);
  r := public.taf_erp_entrar(k_ges, null, null);
  perform pg_temp.ok(r->>'papel' = 'gestao', '10b gestor no ERP e gestao');
  r := public.taf_erp_entrar(k_lei, null, null);
  perform pg_temp.ok((r->>'leitura')::boolean and r->>'quem' = 'Leitura cliente', '10c leitura no ERP');
  r := public.taf_ciclo_ler(k_enc, '999', null, null);
  perform pg_temp.ok(r#>>'{ator,papel}' = 'encarregado' and (r#>>'{ator,verificado}')::boolean, '10d planejador: ' || (r->>'ator'));
  e := pg_temp.err(format('select public.taf_ciclo_salvar(%L, %L, %L, %L::jsonb, gen_random_uuid(), null)', k_enc, '999', 'comp',
         '{"seg":"2026-10-26","titulo":"Limpeza do canteiro","frente":"ADM","entrega":"Canteiro limpo","resp":"Encarregado Demonstração"}'));
  perform pg_temp.ok(e = 'SEM PERMISSAO: ENCARREGADO NAO PODE COMP', '10e encarregado nao monta compromisso: ' || e);
  -- o engenheiro (nome certo) monta e publica a semana
  r := public.taf_acesso_criar(k_dir2, 'Engenheira 999 nova', 'Engenheira Demonstração', 'engenheiro', array['999'], null); k_eng := r->>'chave';
  r := public.taf_ciclo_salvar(k_eng, '999', 'comp', '{"seg":"2026-10-26","titulo":"Limpeza do canteiro","frente":"ADM","entrega":"Canteiro limpo","resp":"Encarregado Demonstração"}'::jsonb, gen_random_uuid(), null);
  perform pg_temp.ok(r->>'cid' = 'C1' and r->>'quem' = 'Engenheira Demonstração', '10f engenheiro monta: ' || r::text);
  r := public.taf_ciclo_salvar(k_eng, '999', 'comp', '{"seg":"2026-10-26","titulo":"Sinalização da vala","frente":"SST","entrega":"Vala sinalizada","resp":"Encarregado Demonstração"}'::jsonb, gen_random_uuid(), null);
  e := pg_temp.err(format('select public.taf_ciclo_salvar(%L, %L, %L, %L::jsonb, gen_random_uuid(), null)', k_enc, '999', 'publicar', '{"seg":"2026-10-26"}'));
  perform pg_temp.ok(e = 'SEM PERMISSAO: ENCARREGADO NAO PODE PUBLICAR', '10g encarregado nao publica: ' || e);
  r := public.taf_ciclo_salvar(k_eng, '999', 'publicar', '{"seg":"2026-10-26"}'::jsonb, gen_random_uuid(), null);
  perform pg_temp.ok((r->>'ok')::boolean, '10h engenheiro publica: ' || r::text);
  -- o encarregado aponta
  r := public.taf_ciclo_salvar(k_enc, '999', 'apont', '{"seg":"2026-10-26","cid":"C1","dia":"2026-10-27","situacao":"andou","obs":"metade feita"}'::jsonb, gen_random_uuid(), null);
  perform pg_temp.ok((r->>'ok')::boolean and r->>'papel' = 'encarregado' and r->>'quem' = 'Encarregado Demonstração', '10i encarregado aponta: ' || r::text);
  r := public.taf_ciclo_salvar(k_enc, '999', 'apont', '{"seg":"2026-10-26","cid":"C1","dia":"2026-10-28","situacao":"parado","causa":"CHUVA"}'::jsonb, gen_random_uuid(), null);
  perform pg_temp.ok((r->>'ok')::boolean, '10j encarregado aponta parado');
  r := public.taf_ciclo_salvar(k_enc, '999', 'apont_lote', '{"seg":"2026-10-26","dia":"2026-10-26","situacao":"andou"}'::jsonb, gen_random_uuid(), null);
  perform pg_temp.ok((r->>'gravados')::int = 2, '10k encarregado aponta em lote: ' || r::text);
  r := public.taf_ciclo_salvar(k_enc, '999', 'apont_apagar', '{"seg":"2026-10-26","cid":"C2","dia":"2026-10-26"}'::jsonb, gen_random_uuid(), null);
  perform pg_temp.ok((r->>'ok')::boolean, '10l encarregado apaga o proprio apontamento');
  foreach e in array array['preparo','preparo_ok','comp_tirar','comp_cancelar','fora','real','fechar_item','fechar_semana','reabrir','replan','efeito','acordo','saldo','demanda','demanda_resp','cobrar','impacto'] loop
    perform pg_temp.ok(pg_temp.err(format('select public.taf_ciclo_salvar(%L, %L, %L, %L::jsonb, gen_random_uuid(), null)', k_enc, '999', e, '{"seg":"2026-10-26"}'))
                       = 'SEM PERMISSAO: ENCARREGADO NAO PODE ' || upper(e), '10m encarregado nao pode ' || e);
  end loop;
  r := public.taf_ciclo_ler(k_enc, '999', null, null);
  perform pg_temp.ok((select count(*) from jsonb_array_elements(r#>'{semana,comps}') c, jsonb_array_elements(c->'apont') a where a->>'quem' = 'Encarregado Demonstração') = 3, '10n apontamentos com o nome do encarregado');
  -- quem tem papel engenheiro continua podendo tudo o que podia; gestor e diretoria continuam sem apontar
  perform pg_temp.ok(pg_temp.err(format('select public.taf_ciclo_salvar(%L, %L, %L, %L::jsonb, gen_random_uuid(), null)', k_ges, '999', 'apont', '{"seg":"2026-10-26"}'))
                     = 'SEM PERMISSAO: GESTOR NAO PODE APONT', '10o gestor nao aponta');

  -- 11. o registro só entra
  perform pg_temp.ok(pg_temp.err('select count(*) from public.taf_acesso_log') like 'permission denied%', '11a site nao le o registro');
  perform pg_temp.ok(pg_temp.err('select count(*) from public.taf_ciclo_chave') like 'permission denied%', '11b site nao le as chaves');
  perform pg_temp.ok(pg_temp.err(format('select public._taf_acesso_ator(%L, null)', k_dir2)) like 'permission denied%', '11c interna fechada');
  perform pg_temp.ok(pg_temp.err(format('select public._taf_ciclo_pode(%L, %L)', 'encarregado', 'apont')) like 'permission denied%', '11d _taf_ciclo_pode fechada');
  insert into t06 values ('k_dir2', k_dir2), ('k_ges', k_ges), ('k_ges2', k_ges2), ('k_eng', k_eng), ('k_eng_errado', k_eng_errado),
    ('k_enc', k_enc), ('k_lei', k_lei), ('k_eng2obras', k_eng2obras);
end $t$;

-- ---------- conferências como dono do banco
reset role;
do $t$
declare n int; v text; c public.taf_ciclo_chave;
begin
  select count(*) into n from public.taf_acesso_log;
  perform pg_temp.ok(n = 12, '12a registro: 10 criadas e 2 desativadas, deu ' || n);
  -- nenhuma chave em texto no banco: só o sha256
  for v in select t.v from t06 t loop
    perform pg_temp.ok(not exists (select 1 from public.taf_acesso_log l where position(v in l::text) > 0), '12b chave em texto no registro');
    perform pg_temp.ok(exists (select 1 from public.taf_ciclo_chave k where k.hash = encode(extensions.digest(v, 'sha256'), 'hex')), '12c sha256 gravado');
    perform pg_temp.ok(exists (select 1 from public.taf_acesso_log l where l.chave_id = left(encode(extensions.digest(v, 'sha256'), 'hex'), 10)), '12c id curto = começo do sha256');
    perform pg_temp.ok(not exists (select 1 from public.taf_ciclo_chave k where position(v in k::text) > 0), '12d chave em texto na tabela');
  end loop;
  perform pg_temp.ok(pg_temp.err('update public.taf_acesso_log set quem = ''x''') = 'HISTORICO NAO SE ALTERA', '12e registro nao muda');
  perform pg_temp.ok(pg_temp.err('delete from public.taf_acesso_log') = 'HISTORICO NAO SE ALTERA', '12f registro nao apaga');
  -- a regra da última Diretoria, direto na função (pela tela ela só aparece como "própria chave", porque só Diretoria desativa Diretoria)
  select * into c from public.taf_ciclo_chave k where k.papel = 'diretoria' and k.ativo;
  perform pg_temp.ok(public._taf_acesso_bloqueio('pessoal', 'diretoria', array['999'], repeat('0', 64), c) like 'ULTIMA CHAVE DE DIRETORIA ATIVA%', '12g ultima diretoria');
  -- grants: só as três de entrada
  perform pg_temp.ok(has_function_privilege('anon', 'public.taf_acesso_listar(text, text)', 'execute')
                 and has_function_privilege('anon', 'public.taf_acesso_criar(text, text, text, text, text[], text)', 'execute')
                 and has_function_privilege('anon', 'public.taf_acesso_desativar(text, text, text, text)', 'execute'), '12h entradas abertas');
  perform pg_temp.ok(not has_function_privilege('anon', 'public._taf_acesso_ator(text, text)', 'execute')
                 and not has_function_privilege('anon', 'public._taf_acesso_pode_criar(text, text, boolean)', 'execute')
                 and not has_function_privilege('anon', 'public._taf_acesso_bloqueio(text, text, text[], text, public.taf_ciclo_chave)', 'execute')
                 and not has_function_privilege('anon', 'public._taf_acesso_avisos(text, text, text[])', 'execute')
                 and not has_function_privilege('anon', 'public._taf_ciclo_pode(text, text)', 'execute')
                 and not has_function_privilege('authenticated', 'public._taf_acesso_ator(text, text)', 'execute'), '12i internas fechadas');
  perform pg_temp.ok(not has_table_privilege('anon', 'public.taf_acesso_log', 'select') and not has_table_privilege('anon', 'public.taf_acesso_log', 'insert'), '12j tabela fechada');
  -- o papel novo só existe com pessoa
  perform pg_temp.ok(pg_temp.err('insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras) values (repeat(''a'', 64), ''x'', null, ''encarregado'', array[''999''])') like '%taf_ciclo_chave_check%', '12k encarregado precisa de pessoa');
  perform pg_temp.ok(pg_temp.err('insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras) values (repeat(''b'', 64), ''x'', ''y'', ''gerente'', array[''999''])') like '%taf_ciclo_chave_papel_check%', '12l papel fora da lista');
  raise notice '06 OK';
end $t$;

rollback;
