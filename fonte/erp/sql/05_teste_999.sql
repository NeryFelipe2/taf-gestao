-- Teste do 05_meta.sql na obra 999 (fictícia). Roda tudo dentro de uma transação e DESFAZ no fim (rollback):
-- nada fica gravado, nem as chaves de teste, nem os itens, nem as propostas.
-- Uso: depois de aplicar o 05 num banco de teste (ou junto, colando o 05 logo depois do "begin;"), rodar este arquivo inteiro de uma vez.
-- As regras são conferidas chamando as funções como o site chama (papel anon). Se alguma falhar, para com "FALHOU: ..."
-- e a transação é desfeita. Se tudo passar, mostra "05 OK" e desfaz.
-- As chaves abaixo são textos de teste, só existem dentro desta transação.

begin;

insert into public.taf_erp_obra (codigo, nome) values ('999', 'Obra de teste') on conflict (codigo) do nothing;
insert into public.taf_erp_obra (codigo, nome) values ('998', 'Outra obra de teste') on conflict (codigo) do nothing;
insert into public.taf_erp_item (obra, codigo, descricao, pacote, venda, meta, teto) values
  ('999', 'T05.1', 'Item de teste 1', 'PT05', 1000, 800, 900),
  ('999', 'T05.2', 'Item de teste 2', 'PT05', 2000, 1500, 1700),
  ('999', 'T05.3', 'Item de teste 3', 'QT05', 3000, 2500, 2800),
  ('999', 'T05.4', 'Item de teste 4', 'QT05', 400, 300, 350)
  on conflict (obra, codigo) do nothing;
update public.taf_erp_obra set estado = jsonb_set(coalesce(estado, '{}'::jsonb), '{metaOv}', coalesce(estado->'metaOv', '{}'::jsonb) || '{"T05.4": 333}') where codigo = '999';
insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras, ativo) values
  (encode(extensions.digest('teste05-eng', 'sha256'), 'hex'), 'teste', 'Engenheira Teste', 'engenheiro', array['999'], true),
  (encode(extensions.digest('teste05-ges', 'sha256'), 'hex'), 'teste', 'Gestor Teste',     'gestor',     array['999'], true),
  (encode(extensions.digest('teste05-dir', 'sha256'), 'hex'), 'teste', 'Diretora Teste',   'diretoria',  array['999'], true),
  (encode(extensions.digest('teste05-lei', 'sha256'), 'hex'), 'teste', null,               'leitura',    array['999'], true),
  (encode(extensions.digest('teste05-out', 'sha256'), 'hex'), 'teste', 'Outra Obra',       'diretoria',  array['998'], true);

-- devolve a mensagem de erro do comando (ou null se passou)
create or replace function pg_temp.erro(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.confere(passo text, obtido text, esperado text) returns void language plpgsql as $$
begin if obtido is distinct from esperado then raise exception 'FALHOU %: esperado "%", veio "%"', passo, esperado, obtido; end if; end $$;
create temp table t05 (k text primary key, v jsonb) on commit drop;
grant all on t05 to anon;
-- a chave geral de teste existe neste banco? (os passos com ela só rodam se existir)
insert into t05 values ('geral', to_jsonb(to_regprocedure('public._taf_ok(text)') is not null and public._taf_ok('chave-geral-teste')));

set local role anon;   -- daqui em diante, como o site (chave publicável)

do $t$
declare r jsonb; n int; geral constant text := 'chave-geral-teste';
  v_geral boolean := (select (v #>> '{}')::boolean from t05 where k = 'geral');
begin
  -- 1. engenheira propõe a meta do item T05.1: fica pendente, o "antes" vem do banco
  r := public.taf_erp_meta_propor('teste05-eng', '999', null, null, 'item', 'T05.1', 850, 950, null, 'cotação real veio maior', '{"meta": 1}');
  perform pg_temp.confere('1 situacao', r->>'situacao', 'pendente');
  perform pg_temp.confere('1 quem', r->>'proposto_por', 'Engenheira Teste');
  perform pg_temp.confere('1 papel', r->>'proposto_papel', 'engenheiro');
  perform pg_temp.confere('1 pessoal', r->>'proposto_pessoal', 'true');
  perform pg_temp.confere('1 antes da meta (do banco, não da tela)', r->'antes'->>'meta', '800');
  perform pg_temp.confere('1 antes do teto', r->'antes'->>'teto', '900');
  insert into t05 values ('p1', r);

  -- 2. segunda proposta pendente no mesmo item: recusada
  perform pg_temp.confere('2', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-eng','999',null,null,'item','T05.1',860,null,null,'outra vez')$q$),
    'JA HA PROPOSTA PENDENTE PARA ESTE ITEM');
  -- 3 a 7. pedido incompleto ou errado
  perform pg_temp.confere('3', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-eng','999',null,null,'item','T05.2',10,null,null,'  ')$q$), 'MOTIVO OBRIGATORIO');
  perform pg_temp.confere('4', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-eng','999',null,null,'item','NAO.EXISTE',10,null,null,'motivo')$q$), 'ITEM NAO EXISTE NA OBRA');
  perform pg_temp.confere('5', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-eng','999',null,null,'item','T05.2',10,null,'2030-01-01','motivo')$q$), 'FECHAR ATE SO NO PACOTE');
  perform pg_temp.confere('6', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-eng','999',null,null,'item','T05.2',null,null,null,'motivo')$q$), 'INFORME META, TETO OU DATA');
  perform pg_temp.confere('7', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-eng','999',null,null,'item','T05.2',-1,null,null,'motivo')$q$), 'VALOR INVALIDO');
  perform pg_temp.confere('7b', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-eng','999',null,null,'pacote','NAO_EXISTE',10,null,null,'motivo')$q$), 'PACOTE NAO EXISTE NA OBRA');
  perform pg_temp.confere('7c', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-eng','999',null,null,'evento','T05.2',10,null,null,'motivo')$q$), 'ALVO INVALIDO');
  -- 8 e 9. quem não propõe
  perform pg_temp.confere('9', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-lei','999',null,null,'item','T05.2',10,null,null,'motivo')$q$), 'CHAVE SO DE LEITURA');
  perform pg_temp.confere('9b', pg_temp.erro($q$select public.taf_erp_meta_propor('teste05-out','999',null,null,'item','T05.2',10,null,null,'motivo')$q$), 'SEM ACESSO A OBRA');
  if v_geral then
    perform pg_temp.confere('8', pg_temp.erro($q$select public.taf_erp_meta_propor('chave-geral-teste','999','Alguém','compras','item','T05.2',10,null,null,'motivo')$q$), 'PAPEL COMPRAS NAO PROPOE META');
    perform pg_temp.confere('8b', pg_temp.erro($q$select public.taf_erp_meta_propor('chave-geral-teste','999',null,'gestao','item','T05.2',10,null,null,'motivo')$q$), 'INFORME SEU NOME');
    -- 10. chave geral do site, papel Gestão escolhido na tela: propõe o pacote (fica marcado como nome digitado)
    r := public.taf_erp_meta_propor(geral, '999', 'Planejador Digitado', 'gestao', 'pacote', 'PT05', 2500, 2700, '2031-02-01', 'pacote fechou mais caro',
                                    '{"meta": 2300, "teto": "xx", "fechar_ate": "2030-12-01", "lixo": "<b>"}');
    perform pg_temp.confere('10 pessoal', r->>'proposto_pessoal', 'false');
    perform pg_temp.confere('10 antes', (r->'antes')::text, '{"meta": 2300, "fechar_ate": "2030-12-01"}');
    insert into t05 values ('p10', r);
    -- 11. com a chave geral ninguém decide (D4), nem com papel Gestão
    perform pg_temp.confere('11', pg_temp.erro(format($q$select public.taf_erp_meta_decidir('chave-geral-teste','999','Outro Nome','gestao',%s,true,null)$q$, (select v->>'id' from t05 where k = 'p1'))),
      'DECIDIR META SO COM CHAVE PESSOAL');
    perform pg_temp.confere('11b', pg_temp.erro($q$select public.taf_erp_meta_direta('chave-geral-teste','999','Outro Nome','gestao','item','T05.3',10,null,null,'direto')$q$),
      'MUDAR META DIRETO SO COM CHAVE PESSOAL');
  end if;

  -- 12. engenheira não decide
  perform pg_temp.confere('12', pg_temp.erro(format($q$select public.taf_erp_meta_decidir('teste05-eng','999',null,null,%s,true,null)$q$, (select v->>'id' from t05 where k = 'p1'))),
    'PAPEL ENGENHEIRO NAO DECIDE META');
  -- 13. recusar pede motivo
  perform pg_temp.confere('13', pg_temp.erro(format($q$select public.taf_erp_meta_decidir('teste05-ges','999',null,null,%s,false,' ')$q$, (select v->>'id' from t05 where k = 'p1'))),
    'RECUSAR PEDE MOTIVO');
  -- 14. gestor (chave pessoal) aprova a da engenheira
  r := public.taf_erp_meta_decidir('teste05-ges', '999', 'nome ignorado', 'compras', (select (v->>'id')::bigint from t05 where k = 'p1'), true, null);
  perform pg_temp.confere('14 situacao', r->>'situacao', 'aprovada');
  perform pg_temp.confere('14 quem', r->>'decidido_por', 'Gestor Teste');
  perform pg_temp.confere('14 papel', r->>'decidido_papel', 'gestao');
  if r->>'ordem' is null or r->>'decidido_em' is null then raise exception 'FALHOU 14: sem ordem ou data: %', r; end if;
  insert into t05 values ('a1', r);
  -- 15. decidida não muda
  perform pg_temp.confere('15', pg_temp.erro(format($q$select public.taf_erp_meta_decidir('teste05-dir','999',null,null,%s,false,'mudei de ideia')$q$, (select v->>'id' from t05 where k = 'p1'))),
    'PROPOSTA JA DECIDIDA');
  -- 15b. depois de decidida, o item aceita proposta nova
  r := public.taf_erp_meta_propor('teste05-eng', '999', null, null, 'item', 'T05.1', 870, null, null, 'ajuste fino');
  insert into t05 values ('p15', r);

  -- 16. gestor propõe; ele não decide a própria; a diretora recusa com motivo
  r := public.taf_erp_meta_propor('teste05-ges', '999', null, null, 'item', 'T05.2', 1400, null, null, 'economia na compra');
  insert into t05 values ('p16', r);
  perform pg_temp.confere('16a', pg_temp.erro(format($q$select public.taf_erp_meta_decidir('teste05-ges','999',null,null,%s,true,null)$q$, r->>'id')), 'QUEM PROPOS NAO DECIDE');
  r := public.taf_erp_meta_decidir('teste05-dir', '999', null, null, (r->>'id')::bigint, false, 'segurar até a medição');
  perform pg_temp.confere('16b', r->>'situacao', 'recusada');
  perform pg_temp.confere('16c', r->>'decisao_motivo', 'segurar até a medição');
  if r->>'ordem' is not null then raise exception 'FALHOU 16d: recusada com ordem'; end if;

  -- 17. mesma pessoa pela chave geral (nome digitado sem acento e em minúsculas) não decide pela chave pessoal
  if v_geral then
    r := public.taf_erp_meta_propor(geral, '999', '  diretora   teste ', 'diretoria', 'item', 'T05.3', 2600, null, null, 'proposta digitada');
    perform pg_temp.confere('17', pg_temp.erro(format($q$select public.taf_erp_meta_decidir('teste05-dir','999',null,null,%s,true,null)$q$, r->>'id')), 'QUEM PROPOS NAO DECIDE');
    -- 17b. e quem propôs pela chave geral cancela pela chave geral com o mesmo nome
    r := public.taf_erp_meta_cancelar(geral, '999', 'Diretora Teste', (r->>'id')::bigint, null);
    perform pg_temp.confere('17b', r->>'situacao', 'cancelada');
  end if;

  -- 18. cancelar: só quem propôs, e proposta de chave pessoal só com a chave pessoal
  r := public.taf_erp_meta_propor('teste05-eng', '999', null, null, 'item', 'T05.3', 2400, null, null, 'vou rever');
  insert into t05 values ('p18', r);
  if v_geral then
    perform pg_temp.confere('18a', pg_temp.erro(format($q$select public.taf_erp_meta_cancelar('chave-geral-teste','999','Engenheira Teste',%s,null)$q$, r->>'id')),
      'CANCELE COM A SUA CHAVE PESSOAL');
  end if;
  perform pg_temp.confere('18b', pg_temp.erro(format($q$select public.taf_erp_meta_cancelar('teste05-dir','999',null,%s,null)$q$, r->>'id')), 'SO QUEM PROPOS CANCELA');
  r := public.taf_erp_meta_cancelar('teste05-eng', '999', null, (r->>'id')::bigint, 'desisti');
  perform pg_temp.confere('18c', r->>'situacao', 'cancelada');
  perform pg_temp.confere('18d', r->>'decidido_por', 'Engenheira Teste');
  perform pg_temp.confere('18e', pg_temp.erro(format($q$select public.taf_erp_meta_cancelar('teste05-eng','999',null,%s,null)$q$, r->>'id')), 'PROPOSTA JA DECIDIDA');

  -- 19. mudar direto: só Gestão ou Diretoria com chave pessoal; não passa por cima de proposta pendente
  perform pg_temp.confere('19a', pg_temp.erro($q$select public.taf_erp_meta_direta('teste05-eng','999',null,null,'item','T05.3',10,null,null,'direto')$q$),
    'SO GESTAO E DIRETORIA MUDAM META DIRETO');
  perform pg_temp.confere('19b', pg_temp.erro($q$select public.taf_erp_meta_direta('teste05-ges','999',null,null,'item','T05.1',10,null,null,'direto')$q$),
    'JA HA PROPOSTA PENDENTE PARA ESTE ITEM');
  perform pg_temp.confere('19c', pg_temp.erro($q$select public.taf_erp_meta_direta('teste05-ges','999',null,null,'item','T05.3',10,null,null,'')$q$), 'MOTIVO OBRIGATORIO');
  r := public.taf_erp_meta_direta('teste05-ges', '999', null, null, 'item', 'T05.4', 310, 360, null, 'revisão da gestão');
  perform pg_temp.confere('19d', r->>'situacao', 'aprovada');
  perform pg_temp.confere('19e', r->>'origem', 'direta');
  perform pg_temp.confere('19f', r->>'decidido_por', 'Gestor Teste');
  perform pg_temp.confere('19g antes com a meta remanejada do estado', r->'antes'->>'meta', '333');
  if (r->>'ordem')::bigint <= (select (v->>'ordem')::bigint from t05 where k = 'a1') then raise exception 'FALHOU 19h: ordem não cresce'; end if;
  r := public.taf_erp_meta_direta('teste05-dir', '999', null, null, 'pacote', 'QT05', null, null, '2031-03-01', 'data nova do pacote', '{"fechar_ate": "2030-05-05"}');
  perform pg_temp.confere('19i', r->>'fechar_ate', '2031-03-01');

  -- 20. listar: a obra inteira, a mais nova primeiro; sem acesso à obra não lista
  r := public.taf_erp_meta_listar('teste05-eng', '999', null);
  n := (select count(*) from jsonb_array_elements(r));
  if n < 6 then raise exception 'FALHOU 20a: listou % propostas', n; end if;
  if (r->0->>'id')::bigint < (r->1->>'id')::bigint then raise exception 'FALHOU 20b: ordem da lista'; end if;
  perform pg_temp.confere('20c', pg_temp.erro($q$select public.taf_erp_meta_listar('teste05-out','999',null)$q$), 'SEM ACESSO A OBRA');
  perform pg_temp.confere('20d', pg_temp.erro($q$select public.taf_erp_meta_listar('chave-que-nao-existe','999',null)$q$), 'CHAVE INVALIDA');

  -- 21. o site não lê nem grava a tabela direto, nem chama as funções internas
  perform pg_temp.confere('21a', pg_temp.erro($q$select count(*) from public.taf_erp_meta_prop$q$), 'permission denied for table taf_erp_meta_prop');
  perform pg_temp.confere('21b', pg_temp.erro($q$update public.taf_erp_meta_prop set meta = 1$q$), 'permission denied for table taf_erp_meta_prop');
  perform pg_temp.confere('21c', pg_temp.erro($q$select public._taf_erp_meta_valida('999','item','T05.1',1,null,null,'x x x')$q$), 'permission denied for function _taf_erp_meta_valida');
  perform pg_temp.confere('21d', pg_temp.erro($q$select public._taf_erp_meta_norm('x')$q$), 'permission denied for function _taf_erp_meta_norm');
  raise notice '05 (como o site): regras 1 a 21 conferidas';
end $t$;

reset role;

do $t$
begin
  -- 22. nem o dono do banco apaga, nem muda a proposta: só a decisão, uma vez
  perform pg_temp.confere('22a', pg_temp.erro($q$delete from public.taf_erp_meta_prop where obra = '999'$q$), 'NADA E APAGADO');
  perform pg_temp.confere('22b', pg_temp.erro(format($q$update public.taf_erp_meta_prop set meta = 1 where id = %s$q$, (select v->>'id' from t05 where k = 'p1'))), 'PROPOSTA JA DECIDIDA');
  perform pg_temp.confere('22c', pg_temp.erro(format($q$update public.taf_erp_meta_prop set meta = 1 where id = %s$q$, (select v->>'id' from t05 where k = 'p15'))), 'PROPOSTA NAO MUDA, SO RECEBE A DECISAO');
  -- 23. a tabela e as sequências não ficam abertas para o site
  if has_table_privilege('anon', 'public.taf_erp_meta_prop', 'select') or has_sequence_privilege('anon', 'public.taf_erp_meta_ordem_seq', 'usage') then
    raise exception 'FALHOU 23: tabela ou sequência aberta para anon'; end if;
  if not has_function_privilege('anon', 'public.taf_erp_meta_listar(text, text, text)', 'execute') then raise exception 'FALHOU 23b: listar fechado para anon'; end if;
  raise notice '05 OK: 23 grupos de regras conferidos na obra 999';
end $t$;

rollback;
