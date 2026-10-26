-- Teste do 03_nota_alcada.sql na obra 999 (fictícia). Roda tudo dentro de uma transação e DESFAZ no fim (rollback):
-- nada fica gravado, nem as chaves de teste, nem as notas.
-- Uso: depois de aplicar o 03 (ou junto, colando o 03 logo depois do "begin;"), rodar este arquivo inteiro de uma vez.
-- Se alguma regra falhar, para com "FALHOU: ..." e a transação é desfeita. Se tudo passar, mostra "03 OK" e desfaz.
-- As chaves abaixo são textos de teste, só existem dentro desta transação.

begin;

insert into public.taf_erp_obra (codigo, nome) values ('999', 'Obra de teste') on conflict (codigo) do nothing;
insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras, ativo) values
  (encode(extensions.digest('teste03-eng', 'sha256'), 'hex'), 'teste', 'Teste Engenheira', 'engenheiro', array['999'], true),
  (encode(extensions.digest('teste03-dir', 'sha256'), 'hex'), 'teste', 'Teste Diretor',    'diretoria',  array['999'], true);

create temp table t03 (passo text, resp jsonb) on commit drop;
create or replace function pg_temp.salva(k text, papel text, id text, d jsonb) returns jsonb language sql as $$
  select public.taf_erp_salvar(k, '999', 'qualquer', papel, jsonb_build_array(jsonb_build_object('id', id, 'tipo', 'nf', 'dados', d)), null) $$;
create or replace function pg_temp.motivo(r jsonb) returns text language sql as $$ select r->'recusados'->0->>'motivo' $$;
create or replace function pg_temp.dados(id text) returns jsonb language sql as $$ select dados from public.taf_erp_doc where obra = '999' and id = $1 $$;

do $t$
declare r jsonb; d0 jsonb; d jsonb;
  base constant jsonb := '{"num":"NF-T03","valor":5000,"fornecedor":"Fornecedor teste","emissao":"2099-01-10","status":"rateada",
    "rateio":[{"item":"A.1","valor":5000}],"sem":"amarelo","alcada":"gerente","aprov":"pendente",
    "solicitante":"Teste Engenheira","solicitanteId":"pessoa:teste engenheira"}';
begin
  -- 1. engenheira lança a nota pendente (regra antiga, continua)
  r := pg_temp.salva('teste03-eng', null, 't03-n1', base);
  if (r->>'gravados')::int <> 1 then raise exception 'FALHOU 1: engenheira nao gravou a nota: %', r; end if;

  -- 2. diretor aprova: grava
  d := base || '{"aprov":"aprovada","aprovador":"Teste Diretor","aprovadorId":"pessoa:teste diretor"}';
  r := pg_temp.salva('teste03-dir', null, 't03-n1', d);
  if (r->>'gravados')::int <> 1 or pg_temp.dados('t03-n1')->>'aprov' <> 'aprovada' then raise exception 'FALHOU 2: aprovacao nao gravou: %', r; end if;

  -- 3. nota já decidida: diretor não muda mais nada
  r := pg_temp.salva('teste03-dir', null, 't03-n1', d || '{"aprov":"reprovada"}');
  if pg_temp.motivo(r) <> 'PAPEL DIRETORIA NAO GRAVA NF' then raise exception 'FALHOU 3: %', r; end if;

  -- 4. aprovar e mudar o valor junto: recusado
  r := pg_temp.salva('teste03-eng', null, 't03-n2', base || '{"num":"NF-T03B"}');
  r := pg_temp.salva('teste03-dir', null, 't03-n2', base || '{"num":"NF-T03B","valor":9000,"aprov":"aprovada","aprovador":"Teste Diretor","aprovadorId":"pessoa:teste diretor"}');
  if pg_temp.motivo(r) <> 'GERENTE E DIRETORIA SO DECIDEM A NOTA, NAO MUDAM OUTROS CAMPOS' then raise exception 'FALHOU 4: %', r; end if;

  -- 5. chave geral do site com papel gerente (nome digitado): recusado (D4)
  r := public.taf_erp_salvar('chave-geral-teste', '999', 'Alguem', 'gerente',
         jsonb_build_array(jsonb_build_object('id','t03-n2','tipo','nf','dados', base || '{"num":"NF-T03B","aprov":"aprovada","aprovador":"Alguem"}')), null);
  if to_regprocedure('public._taf_ok(text)') is not null and public._taf_ok('chave-geral-teste') then
    if pg_temp.motivo(r) <> 'DECISAO DA NOTA SO COM CHAVE PESSOAL' then raise exception 'FALHOU 5: %', r; end if;
  end if;

  -- 6. reprovar sem motivo: recusado; com motivo e rateio guardado: grava
  d0 := pg_temp.dados('t03-n2');
  r := pg_temp.salva('teste03-dir', null, 't03-n2', d0 || '{"aprov":"reprovada","aprovador":"Teste Diretor","aprovadorId":"pessoa:teste diretor","rateio":[],"status":"lancada"}'
         || jsonb_build_object('rateioRecusado', d0->'rateio'));
  if pg_temp.motivo(r) <> 'REPROVAR PEDE MOTIVO' then raise exception 'FALHOU 6a: %', r; end if;
  r := pg_temp.salva('teste03-dir', null, 't03-n2', d0 || '{"aprov":"reprovada","aprovador":"Teste Diretor","aprovadorId":"pessoa:teste diretor","rateio":[],"status":"lancada","motivoAlcada":"renegociar"}'
         || jsonb_build_object('rateioRecusado', d0->'rateio'));
  if (r->>'gravados')::int <> 1 then raise exception 'FALHOU 6b: %', r; end if;

  -- 7. quem lançou não decide (nota com o diretor como solicitante)
  r := pg_temp.salva('teste03-eng', null, 't03-n3', base || '{"num":"NF-T03C","solicitante":"Teste Diretor","solicitanteId":"pessoa:teste diretor"}');
  r := pg_temp.salva('teste03-dir', null, 't03-n3', base || '{"num":"NF-T03C","solicitante":"Teste Diretor","solicitanteId":"pessoa:teste diretor","aprov":"aprovada","aprovador":"Teste Diretor","aprovadorId":"pessoa:teste diretor"}');
  if pg_temp.motivo(r) <> 'QUEM LANCOU A NOTA NAO DECIDE' then raise exception 'FALHOU 7: %', r; end if;

  -- 8. só recálculo do semáforo antes de aprovar: grava
  r := pg_temp.salva('teste03-dir', null, 't03-n3', base || '{"num":"NF-T03C","solicitante":"Teste Diretor","solicitanteId":"pessoa:teste diretor","sem":"vermelho","alcada":"diretoria"}');
  if (r->>'gravados')::int <> 1 then raise exception 'FALHOU 8: %', r; end if;

  -- 9. nota na alçada da Diretoria: Gerente não decide (não existe chave pessoal de gerente, então testa a regra direto)
  if public._taf_erp_nf_decisao('gerente', 'Teste Gerente', true, base || '{"alcada":"diretoria"}',
       base || '{"alcada":"diretoria","aprov":"aprovada","aprovador":"Teste Gerente"}') <> 'NOTA NA ALCADA DA DIRETORIA' then raise exception 'FALHOU 9'; end if;

  -- 10. aprovar não pode mexer no rateio
  if public._taf_erp_nf_decisao('diretoria', 'Teste Diretor', true, base,
       base || '{"aprov":"aprovada","aprovador":"Teste Diretor","rateio":[]}') <> 'APROVAR NAO MUDA RATEIO NEM SITUACAO' then raise exception 'FALHOU 10'; end if;

  -- 11. aprovador gravado tem que ser quem grava
  if public._taf_erp_nf_decisao('diretoria', 'Teste Diretor', true, base,
       base || '{"aprov":"aprovada","aprovador":"Outra Pessoa"}') <> 'APROVADOR DIFERENTE DE QUEM GRAVA' then raise exception 'FALHOU 11'; end if;

  -- 12. engenheira continua editando nota normalmente (nada mudou para quem já gravava)
  r := pg_temp.salva('teste03-eng', null, 't03-n1', pg_temp.dados('t03-n1') || '{"obs":"conferida"}');
  if (r->>'gravados')::int <> 1 then raise exception 'FALHOU 12: %', r; end if;

  raise notice '03 OK: 12 regras conferidas na obra 999';
end $t$;

rollback;
