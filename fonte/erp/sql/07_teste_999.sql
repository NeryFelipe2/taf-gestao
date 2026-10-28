-- Teste do 07_ia.sql na obra 999 (fictícia). Roda tudo dentro de uma transação e DESFAZ no fim (rollback):
-- nada fica gravado, nem as chaves de teste, nem o uso.
-- Uso: depois de aplicar o 07 (ou junto, colando o 07 logo depois do "begin;"), rodar este arquivo inteiro de uma vez:
--   psql ... -v ON_ERROR_STOP=1 -f fonte/erp/sql/07_teste_999.sql
-- Se alguma regra falhar, para com "FALHOU: ..." e a transação é desfeita. Se tudo passar, mostra "07 OK" e desfaz.
-- As chaves abaixo são textos de teste, só existem dentro desta transação.

begin;

-- relógio fixo do planejador (só nos testes): quarta 28/10/2026, meio-dia em Brasília
select set_config('taf.agora', '2026-10-28 12:00:00-03', true);

insert into public.taf_ciclo_obra (obra, nome, engenheiro, ep, base_rev)
values ('999', 'OBRA 999 · DEMONSTRAÇÃO (TESTE)', 'Eng. Teste 999', '2026-10-05', 'teste do 07')
on conflict (obra) do nothing;
insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras, ativo) values
  (encode(extensions.digest('teste07-eng', 'sha256'), 'hex'), 'teste 07', 'Eng. Teste 999', 'engenheiro', array['999'], true),
  (encode(extensions.digest('teste07-dir', 'sha256'), 'hex'), 'teste 07', 'Diretor Teste',  'diretoria',  array['999'], true),
  (encode(extensions.digest('teste07-lei', 'sha256'), 'hex'), 'teste 07', null,             'leitura',    array['999'], true),
  (encode(extensions.digest('teste07-out', 'sha256'), 'hex'), 'teste 07', 'Outro Eng',      'engenheiro', array['998'], true);
update public.taf_ia_param set valor = 3 where nome = 'limite_dia';

-- erro de uma chamada (null = passou)
create or replace function pg_temp.erro(k text, o text, a text) returns text language plpgsql as $$
begin perform public.taf_ia_contar(k, o, a, 'Alguem'); return null; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.conta(k text) returns int language sql as $$
  select coalesce(sum(n), 0)::int from public.taf_ia_uso where hash = encode(extensions.digest(k, 'sha256'), 'hex') $$;

do $t$
declare r jsonb; m text;
begin
  -- 1. engenheiro: relato e pergunta contam juntos
  r := public.taf_ia_contar('teste07-eng', '999', 'relato', null);
  if (r->>'usado')::int <> 1 or (r->>'resta')::int <> 2 or r->>'papel' <> 'engenheiro' then raise exception 'FALHOU 1a: %', r; end if;
  r := public.taf_ia_contar('teste07-eng', '999', 'pergunta', null);
  if (r->>'usado')::int <> 2 or (r->>'limite')::int <> 3 then raise exception 'FALHOU 1b: %', r; end if;
  if r->>'dia' <> '2026-10-28' then raise exception 'FALHOU 1c: dia de Brasília errado: %', r; end if;

  -- 2. diretoria não lê relato (não aponta), mas pergunta; o uso é por chave
  m := pg_temp.erro('teste07-dir', '999', 'relato');
  if m is distinct from 'SEM PERMISSAO: DIRETORIA NAO PODE USAR A IA PARA RELATO' then raise exception 'FALHOU 2a: %', m; end if;
  r := public.taf_ia_contar('teste07-dir', '999', 'pergunta', null);
  if (r->>'usado')::int <> 1 then raise exception 'FALHOU 2b: %', r; end if;

  -- 3. só leitura não gasta IA
  m := pg_temp.erro('teste07-lei', '999', 'pergunta');
  if m is distinct from 'SEM PERMISSAO: LEITURA NAO PODE USAR A IA PARA PERGUNTA' then raise exception 'FALHOU 3: %', m; end if;

  -- 4. chave errada, obra de outra chave, obra que não existe, ação inválida: recusa e não conta
  m := pg_temp.erro('nao-existe-07', '999', 'pergunta');
  if m is distinct from 'CHAVE INVALIDA' then raise exception 'FALHOU 4a: %', m; end if;
  m := pg_temp.erro('teste07-out', '999', 'relato');
  if m is distinct from 'SEM ACESSO A OBRA' then raise exception 'FALHOU 4b: %', m; end if;
  m := pg_temp.erro('teste07-eng', '000', 'relato');
  if m is distinct from 'OBRA INVALIDA' then raise exception 'FALHOU 4c: %', m; end if;
  m := pg_temp.erro('teste07-eng', '999', 'apagar');
  if m is distinct from 'ACAO DA IA INVALIDA' then raise exception 'FALHOU 4d: %', m; end if;
  m := pg_temp.erro('teste07-eng', '999', null);
  if m is distinct from 'ACAO DA IA INVALIDA' then raise exception 'FALHOU 4e: %', m; end if;
  if pg_temp.conta('teste07-eng') <> 2 or pg_temp.conta('nao-existe-07') <> 0 or pg_temp.conta('teste07-out') <> 0 then
    raise exception 'FALHOU 4f: recusa contou uso'; end if;

  -- 5. limite do dia: a 3ª passa, a 4ª é recusada e não conta
  r := public.taf_ia_contar('teste07-eng', '999', 'relato', null);
  if (r->>'usado')::int <> 3 or (r->>'resta')::int <> 0 then raise exception 'FALHOU 5a: %', r; end if;
  m := pg_temp.erro('teste07-eng', '999', 'relato');
  if m is distinct from 'LIMITE DO DIA DA IA: 3 DE 3' then raise exception 'FALHOU 5b: %', m; end if;
  m := pg_temp.erro('teste07-eng', '999', 'pergunta');
  if m is distinct from 'LIMITE DO DIA DA IA: 3 DE 3' then raise exception 'FALHOU 5c: %', m; end if;
  if pg_temp.conta('teste07-eng') <> 3 then raise exception 'FALHOU 5d: recusa por limite contou'; end if;
  -- a outra chave não foi afetada
  r := public.taf_ia_contar('teste07-dir', '999', 'pergunta', null);
  if (r->>'usado')::int <> 2 then raise exception 'FALHOU 5e: %', r; end if;

  -- 6. dia seguinte (Brasília): conta de novo do zero
  perform set_config('taf.agora', '2026-10-29 00:30:00-03', true);
  r := public.taf_ia_contar('teste07-eng', '999', 'relato', null);
  if (r->>'usado')::int <> 1 or r->>'dia' <> '2026-10-29' then raise exception 'FALHOU 6: %', r; end if;
  perform set_config('taf.agora', '2026-10-28 12:00:00-03', true);

  -- 7. chave geral do site (gestor com nome declarado): pergunta sim, relato não (gestor não aponta)
  if public._taf_ok('chave-geral-teste') then
    m := pg_temp.erro('chave-geral-teste', '999', 'relato');
    if m !~ '^SEM PERMISSAO: (GESTOR|LEITURA) NAO PODE USAR A IA PARA RELATO$' then raise exception 'FALHOU 7a: %', m; end if;
    if (select chave_geral_escreve from public.taf_ciclo_obra where obra = '999') then
      r := public.taf_ia_contar('chave-geral-teste', '999', 'pergunta', 'Alguem');
      if r->>'papel' <> 'gestor' or (r->>'usado')::int < 1 then raise exception 'FALHOU 7b: %', r; end if;
    end if;
  end if;

  -- 8. o que fica gravado: hash, obra, ação e número. A chave em texto não aparece em lugar nenhum
  if exists (select 1 from public.taf_ia_uso u where to_jsonb(u)::text ~ 'teste07-') then raise exception 'FALHOU 8: chave em texto no uso'; end if;
  if (select count(*) from public.taf_ia_uso where hash = encode(extensions.digest('teste07-eng', 'sha256'), 'hex')) <> 3 then
    raise exception 'FALHOU 8b: esperava 3 linhas (dia/obra/ação) da chave do engenheiro'; end if;

  -- 9. limite 0 desliga
  update public.taf_ia_param set valor = 0 where nome = 'limite_dia';
  m := pg_temp.erro('teste07-dir', '999', 'pergunta');
  if m is distinct from 'IA DESLIGADA NO BANCO' then raise exception 'FALHOU 9: %', m; end if;
  update public.taf_ia_param set valor = 30 where nome = 'limite_dia';
end $t$;

-- 10. como o site (papel anon): a função de entrada abre; as tabelas e as funções internas não
set local role anon;
do $t$
declare r jsonb; ok boolean;
begin
  r := public.taf_ia_contar('teste07-dir', '999', 'pergunta', null);
  if (r->>'ok')::boolean is not true then raise exception 'FALHOU 10a: %', r; end if;
  ok := false; begin perform 1 from public.taf_ia_uso limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALHOU 10b: anon leu taf_ia_uso'; end if;
  ok := false; begin perform 1 from public.taf_ia_param limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALHOU 10c: anon leu taf_ia_param'; end if;
  ok := false; begin update public.taf_ia_param set valor = 1000; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALHOU 10d: anon mudou o limite'; end if;
  ok := false; begin insert into public.taf_ia_uso (dia, hash, obra, acao) values (current_date, repeat('0', 64), '999', 'relato');
                exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALHOU 10e: anon gravou uso direto'; end if;
  ok := false; begin perform public._taf_ciclo_ator('teste07-dir', '999', null); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALHOU 10f: anon chamou _taf_ciclo_ator'; end if;
end $t$;
reset role;

select '07 OK' as resultado;
rollback;
