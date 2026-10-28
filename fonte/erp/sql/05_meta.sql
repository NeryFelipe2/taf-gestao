-- 05 (item 2 do "sistema sozinho"): META PELA TELA. O engenheiro propõe, a Gestão aprova.
-- RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar (05_teste_999.sql, na obra 999 fictícia).
--
-- O que faz:
--   uma tabela nova, taf_erp_meta_prop, com as propostas de meta de item ou de pacote (meta, teto e, no pacote, "fechar até"),
--   o motivo de quem propôs, a situação (pendente, aprovada, recusada, cancelada), quem propôs (com o papel e se usou chave pessoal),
--   quem decidiu, quando e o motivo da decisão. Nada é apagado: a proposta só nasce e depois é decidida uma vez.
--   Funções de entrada (chamadas pelo ERP com a mesma chave do site, como as taf_erp_* do 01_erp.sql):
--     taf_erp_meta_propor   engenheiro, gerente, gestão ou diretoria propõem (chave pessoal ou chave geral do site);
--     taf_erp_meta_listar   lista as propostas da obra (quem abre a obra lê);
--     taf_erp_meta_decidir  aprova ou recusa: só Gerente, Gestão ou Diretoria com CHAVE PESSOAL (regra D4) e quem propôs não decide;
--     taf_erp_meta_cancelar quem propôs cancela a própria proposta enquanto está pendente;
--     taf_erp_meta_direta   Gestão ou Diretoria com chave pessoal mudam a meta direto, com motivo (fica registrada como já aprovada).
--
-- O que NÃO faz: não grava a meta no estado da obra. Quem aplica a meta aprovada é o navegador de quem pode gravar o estado
-- (Gestão, Diretoria ou Gerente), pelo mesmo caminho do Remanejar e do Atualizar pela planilha (estado.baseOv / estado.basePac,
-- versão nova da linha de base, histórico e auditoria), em fonte/erp/js/54_meta.js. O histórico da linha de base guarda o número
-- da proposta aplicada; ao abrir a obra, um aprovador aplica as aprovadas que ainda não estão no histórico.
-- Na decisão (e na mudança direta) o banco guarda em antes_decisao a meta, o teto e o "fechar até" que a tela de quem decidiu
-- mostrava. Antes de aplicar, o navegador confere: se o item (ou pacote) mudou depois da decisão, não aplica sozinho e mostra
-- "precisa de conferência" para Gerente, Gestão ou Diretoria escolherem (aplicar mesmo assim ou não aplicar).
-- Não mexe em taf_erp_salvar, _taf_erp_pode, _taf_erp_ator nem em nenhuma tabela que já existe.
--
-- ATENÇÃO (achado): as chaves pessoais (taf_ciclo_chave) só têm os papéis engenheiro, gestor, diretoria e leitura.
-- Não existe chave pessoal de Gerente. A função aceita Gerente com chave pessoal, mas hoje só Gestão (gestor) e Diretoria decidem.
--
-- RISCOS QUE ESTE ARQUIVO NÃO RESOLVE (precisam do sim do Felipe, em item separado):
--   1. A regra D4 protege a PROPOSTA e a DECISÃO (estas funções). A meta em si mora no estado da obra, e o taf_erp_salvar
--      (01_erp.sql, que esta tarefa não pode redefinir) grava o estado para Gestão, Diretoria e Gerente também com a chave geral
--      do site, em que o papel é escolhido na tela. Quem tem a chave geral pode mudar baseOv/metaOv/basePac pela planilha, pelo
--      Remanejar ou chamando taf_erp_salvar direto, e pode gravar marcas hist[].prop falsas (a proposta marcada não é aplicada).
--      A D4 da meta só fica completa quando taf_erp_salvar recusar mudança em baseOv, metaOv, basePac e hist vinda de chave não pessoal.
--   2. O ERP não confere a versão do estado antes de gravar: um navegador com o estado velho grava por cima do que outro gravou
--      (vale para tudo do estado, não só para a meta). A meta aprovada que some assim volta a ser aplicada, ou fica "precisa de
--      conferência" se o item mudou; mas o que o navegador velho apagou de outros (um remanejamento, uma planilha) se perde.
--      Enquanto isso, o banco fica sem a meta até um navegador de Gestão, Diretoria ou Gerente com a obra aberta ler o banco
--      (o ERP lê a cada 30 segundos e a tela de metas confere a cada minuto) ou, se nenhum estiver aberto, até alguém desses
--      papéis abrir a obra. A correção de fundo é conferir a versão antes de gravar (taf_erp_salvar e chSync).
--
-- Antes de aplicar: backup (PASSO A de 99_reverter.sql). Pode rodar mais de uma vez (tudo é "if not exists" ou "create or replace").
-- Para desfazer: ver o fim do arquivo.

create sequence if not exists public.taf_erp_meta_ordem_seq;

create table if not exists public.taf_erp_meta_prop (
  id bigserial primary key,
  obra text not null references public.taf_erp_obra(codigo),
  alvo text not null check (alvo in ('item', 'pacote')),
  codigo text not null check (length(codigo) between 1 and 60),
  meta numeric(16, 2) check (meta is null or meta between 0 and 9999999999),
  teto numeric(16, 2) check (teto is null or teto between 0 and 9999999999),
  fechar_ate date check (fechar_ate is null or fechar_ate between date '2000-01-01' and date '2100-12-31'),
  antes jsonb not null default '{}'::jsonb,                 -- o que valia na hora da proposta (item: lido do banco; pacote: o que a tela mostrava)
  motivo text not null check (length(btrim(regexp_replace(motivo, '[[:space:]]+', ' ', 'g'))) between 3 and 500),
  origem text not null default 'proposta' check (origem in ('proposta', 'direta')),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovada', 'recusada', 'cancelada')),
  proposto_por text not null,
  proposto_papel text not null,
  proposto_pessoal boolean not null,                         -- true = chave pessoal (nome fixo); false = chave geral do site (nome digitado)
  proposto_em timestamptz not null default now(),
  decidido_por text,
  decidido_papel text,
  decidido_em timestamptz,
  decisao_motivo text check (decisao_motivo is null or length(decisao_motivo) <= 500),
  ordem bigint unique,                                       -- ordem das aprovadas: a mais nova vale por cima das mais velhas
  check (meta is not null or teto is not null or fechar_ate is not null),
  check (alvo = 'pacote' or fechar_ate is null),
  check ((situacao = 'pendente') = (decidido_em is null)),
  check ((situacao = 'aprovada') = (ordem is not null))
);
-- uma proposta pendente por item (ou pacote) de cada vez: a segunda espera a primeira ser decidida ou cancelada
-- o que a tela de quem decidiu mostrava (meta, teto e, no pacote, "fechar até"): o navegador só aplica sozinho se o item ainda estiver assim
alter table public.taf_erp_meta_prop add column if not exists antes_decisao jsonb;
create unique index if not exists taf_erp_meta_prop_pendente on public.taf_erp_meta_prop (obra, alvo, codigo) where situacao = 'pendente';
create index if not exists taf_erp_meta_prop_obra on public.taf_erp_meta_prop (obra, id);

-- Nada é apagado; a proposta não muda depois de feita, só recebe a decisão, uma vez.
create or replace function public._taf_erp_meta_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'NADA E APAGADO'; end if;
  if old.situacao <> 'pendente' then raise exception 'PROPOSTA JA DECIDIDA'; end if;
  if (new.id, new.obra, new.alvo, new.codigo, new.meta, new.teto, new.fechar_ate, new.antes, new.motivo, new.origem,
      new.proposto_por, new.proposto_papel, new.proposto_pessoal, new.proposto_em)
     is distinct from
     (old.id, old.obra, old.alvo, old.codigo, old.meta, old.teto, old.fechar_ate, old.antes, old.motivo, old.origem,
      old.proposto_por, old.proposto_papel, old.proposto_pessoal, old.proposto_em) then
    raise exception 'PROPOSTA NAO MUDA, SO RECEBE A DECISAO';
  end if;
  return new;
end $$;
drop trigger if exists taf_erp_meta_trg on public.taf_erp_meta_prop;
create trigger taf_erp_meta_trg before update or delete on public.taf_erp_meta_prop for each row execute function public._taf_erp_meta_trg();

alter table public.taf_erp_meta_prop enable row level security;
revoke all on public.taf_erp_meta_prop from public, anon, authenticated;
revoke all on sequence public.taf_erp_meta_prop_id_seq, public.taf_erp_meta_ordem_seq from public, anon, authenticated;

-- Mesma identidade do navegador (05_motor_de_regras.js nomeNorm): sem acento, minúsculo, espaços simples.
create or replace function public._taf_erp_meta_norm(p text) returns text
language sql immutable set search_path = public as $$
  select lower(translate(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'),
    'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN')) $$;

-- Número de um campo do "antes" mandado pela tela (só número; o resto vira vazio).
create or replace function public._taf_erp_meta_num(p text) returns numeric
language sql immutable set search_path = public as $$
  select case when p ~ '^-?[0-9]{1,13}(\.[0-9]{1,6})?$' then p::numeric end $$;

-- Texto digitado (motivo): qualquer sequência de espaço, quebra de linha, tabulação ou espaço invisível vira um espaço só, sem
-- espaço nas pontas. "Motivo" feito só disso fica vazio (a tela já barra; aqui vale para quem chama a função direto).
create or replace function public._taf_erp_meta_texto(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(coalesce(p, ''), '[[:space:]   -​    　﻿]+', ' ', 'g')) $$;

-- O que a tela de quem decide mostrava (meta, teto, "fechar até"), mandado pelo navegador: só número (2 casas) e data; o resto some.
create or replace function public._taf_erp_meta_tela(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'meta', case when coalesce(p->>'meta', '') ~ '^[0-9]{1,13}(\.[0-9]{1,20})?$' then round((p->>'meta')::numeric, 2) end,
    'teto', case when coalesce(p->>'teto', '') ~ '^[0-9]{1,13}(\.[0-9]{1,20})?$' then round((p->>'teto')::numeric, 2) end,
    'fechar_ate', case when coalesce(p->>'fechar_ate', '') ~ '^\d{4}-\d{2}-\d{2}$' then p->>'fechar_ate' end)) $$;

-- O que vale hoje no item, pela mesma regra de _taf_erp_valores (02_rastro.sql): meta remanejada, senão a da linha de base, senão a da carga.
create or replace function public._taf_erp_meta_item_atual(p_obra text, p_codigo text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('venda', i.venda,
      'meta', coalesce(public._taf_erp_meta_num(o.estado->'metaOv'->>i.codigo), public._taf_erp_meta_num(o.estado->'baseOv'->i.codigo->>'meta_total'), i.meta),
      'teto', coalesce(public._taf_erp_meta_num(o.estado->'baseOv'->i.codigo->>'teto_total'), i.teto))
    from public.taf_erp_item i join public.taf_erp_obra o on o.codigo = i.obra
   where i.obra = p_obra and i.codigo = p_codigo $$;

-- Confere o pedido de mudança (vale para propor e para mudar direto). Levanta o motivo da recusa.
create or replace function public._taf_erp_meta_valida(p_obra text, p_alvo text, p_codigo text, p_meta numeric, p_teto numeric,
                                                       p_fechar_ate date, p_motivo text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_alvo is null or p_alvo not in ('item', 'pacote') then raise exception 'ALVO INVALIDO'; end if;
  if coalesce(p_codigo, '') = '' or length(p_codigo) > 60 then raise exception 'CODIGO INVALIDO'; end if;
  if p_alvo = 'item' and not exists (select 1 from public.taf_erp_item where obra = p_obra and codigo = p_codigo) then
    raise exception 'ITEM NAO EXISTE NA OBRA'; end if;
  if p_alvo = 'pacote' and not exists (select 1 from public.taf_erp_item where obra = p_obra and pacote = p_codigo) then
    raise exception 'PACOTE NAO EXISTE NA OBRA'; end if;
  if p_meta is null and p_teto is null and p_fechar_ate is null then raise exception 'INFORME META, TETO OU DATA'; end if;
  if p_meta < 0 or p_teto < 0 or p_meta > 9999999999 or p_teto > 9999999999 then raise exception 'VALOR INVALIDO'; end if;
  if p_alvo = 'item' and p_fechar_ate is not null then raise exception 'FECHAR ATE SO NO PACOTE'; end if;
  if p_fechar_ate is not null and p_fechar_ate not between date '2000-01-01' and date '2100-12-31' then raise exception 'DATA INVALIDA'; end if;
  if length(public._taf_erp_meta_texto(p_motivo)) < 3 then raise exception 'MOTIVO OBRIGATORIO'; end if;
  if length(public._taf_erp_meta_texto(p_motivo)) > 500 then raise exception 'MOTIVO GRANDE DEMAIS'; end if;
  if exists (select 1 from public.taf_erp_meta_prop where obra = p_obra and alvo = p_alvo and codigo = p_codigo and situacao = 'pendente') then
    raise exception 'JA HA PROPOSTA PENDENTE PARA ESTE %', upper(p_alvo); end if;
  if (select count(*) from public.taf_erp_meta_prop where obra = p_obra and situacao = 'pendente') >= 300 then
    raise exception 'MUITAS PROPOSTAS PENDENTES NA OBRA'; end if;
end $$;

-- "Antes" guardado com a proposta: item lido do banco; pacote, o que a tela mandou (só números e data).
create or replace function public._taf_erp_meta_antes(p_obra text, p_alvo text, p_codigo text, p_antes jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p_alvo = 'item' then coalesce(public._taf_erp_meta_item_atual(p_obra, p_codigo), '{}'::jsonb)
    else jsonb_strip_nulls(jsonb_build_object(
      'meta', public._taf_erp_meta_num(p_antes->>'meta'),
      'teto', public._taf_erp_meta_num(p_antes->>'teto'),
      'fechar_ate', case when coalesce(p_antes->>'fechar_ate', '') ~ '^\d{4}-\d{2}-\d{2}$' then p_antes->>'fechar_ate' end)) end $$;

-- Propor. Engenheiro, Gerente, Gestão ou Diretoria. Com a chave geral do site vale (o nome é digitado e fica marcado assim);
-- a proposta não muda nada até alguém com chave pessoal aprovar.
create or replace function public.taf_erp_meta_propor(p_chave text, p_obra text, p_quem text, p_papel text, p_alvo text, p_codigo text,
  p_meta numeric default null, p_teto numeric default null, p_fechar_ate date default null, p_motivo text default null, p_antes jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; r public.taf_erp_meta_prop;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, p_papel);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  if not (a.papel = any(array['engenheiro', 'gerente', 'gestao', 'diretoria'])) then
    raise exception 'PAPEL % NAO PROPOE META', upper(a.papel); end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_meta_' || p_obra));
  perform public._taf_erp_meta_valida(p_obra, p_alvo, p_codigo, p_meta, p_teto, p_fechar_ate, p_motivo);
  insert into public.taf_erp_meta_prop (obra, alvo, codigo, meta, teto, fechar_ate, antes, motivo, origem, situacao,
                                        proposto_por, proposto_papel, proposto_pessoal)
  values (p_obra, p_alvo, p_codigo, p_meta, p_teto, p_fechar_ate, public._taf_erp_meta_antes(p_obra, p_alvo, p_codigo, p_antes),
          public._taf_erp_meta_texto(p_motivo), 'proposta', 'pendente', a.nome, a.papel, coalesce(a.fixo, false))
  returning * into r;
  return to_jsonb(r);
end $$;

-- Mudar a meta direto, sem proposta: só Gestão ou Diretoria com chave pessoal, com motivo. Fica registrada como aprovada
-- (o navegador aplica pelo mesmo caminho da proposta aprovada, e ela não se perde).
create or replace function public.taf_erp_meta_direta(p_chave text, p_obra text, p_quem text, p_papel text, p_alvo text, p_codigo text,
  p_meta numeric default null, p_teto numeric default null, p_fechar_ate date default null, p_motivo text default null, p_antes jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; r public.taf_erp_meta_prop;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, p_papel);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  if coalesce(a.fixo, false) is not true then raise exception 'MUDAR META DIRETO SO COM CHAVE PESSOAL'; end if;
  if not (a.papel = any(array['gestao', 'diretoria'])) then raise exception 'SO GESTAO E DIRETORIA MUDAM META DIRETO'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_meta_' || p_obra));
  perform public._taf_erp_meta_valida(p_obra, p_alvo, p_codigo, p_meta, p_teto, p_fechar_ate, p_motivo);
  insert into public.taf_erp_meta_prop (obra, alvo, codigo, meta, teto, fechar_ate, antes, antes_decisao, motivo, origem, situacao,
                                        proposto_por, proposto_papel, proposto_pessoal, decidido_por, decidido_papel, decidido_em, ordem)
  values (p_obra, p_alvo, p_codigo, p_meta, p_teto, p_fechar_ate, public._taf_erp_meta_antes(p_obra, p_alvo, p_codigo, p_antes),
          public._taf_erp_meta_tela(p_antes), public._taf_erp_meta_texto(p_motivo), 'direta', 'aprovada', a.nome, a.papel, true,
          a.nome, a.papel, now(), nextval('public.taf_erp_meta_ordem_seq'))
  returning * into r;
  return to_jsonb(r);
end $$;

-- Lista da obra (as mais novas primeiro). Quem abre a obra lê: o engenheiro vê a situação das dele, o aprovador vê as pendentes.
create or replace function public.taf_erp_meta_listar(p_chave text, p_obra text, p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc)
                     from (select * from public.taf_erp_meta_prop where obra = p_obra order by id desc limit 2000) x), '[]'::jsonb);
end $$;

-- Aprovar ou recusar. Só Gerente, Gestão ou Diretoria, com CHAVE PESSOAL (D4: com a chave geral do site o nome é digitado,
-- ninguém aprova). Quem propôs não decide (mesmo nome, com qualquer chave). Recusar pede motivo.
-- p_antes: meta, teto e "fechar até" que a tela de quem decide mostrava (fica em antes_decisao; o navegador só aplica sozinho
-- se o item ainda estiver assim). A versão anterior deste rascunho não tinha p_antes: a assinatura velha é removida para não
-- ficarem duas funções com o mesmo nome.
drop function if exists public.taf_erp_meta_decidir(text, text, text, text, bigint, boolean, text);
create or replace function public.taf_erp_meta_decidir(p_chave text, p_obra text, p_quem text, p_papel text, p_id bigint,
  p_aprovar boolean, p_motivo text default null, p_antes jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; r public.taf_erp_meta_prop;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, p_papel);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if coalesce(a.fixo, false) is not true then raise exception 'DECIDIR META SO COM CHAVE PESSOAL'; end if;
  if not (a.papel = any(array['gerente', 'gestao', 'diretoria'])) then raise exception 'PAPEL % NAO DECIDE META', upper(a.papel); end if;
  if p_aprovar is null then raise exception 'DECISAO INVALIDA'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_meta_' || p_obra));
  select * into r from public.taf_erp_meta_prop where id = p_id and obra = p_obra for update;
  if r.id is null then raise exception 'PROPOSTA NAO EXISTE'; end if;
  if r.situacao <> 'pendente' then raise exception 'PROPOSTA JA DECIDIDA'; end if;
  if public._taf_erp_meta_norm(r.proposto_por) = public._taf_erp_meta_norm(a.nome) then raise exception 'QUEM PROPOS NAO DECIDE'; end if;
  if not p_aprovar and length(public._taf_erp_meta_texto(p_motivo)) < 3 then raise exception 'RECUSAR PEDE MOTIVO'; end if;
  update public.taf_erp_meta_prop
     set situacao = case when p_aprovar then 'aprovada' else 'recusada' end,
         decidido_por = a.nome, decidido_papel = a.papel, decidido_em = now(),
         decisao_motivo = nullif(left(public._taf_erp_meta_texto(p_motivo), 500), ''),
         antes_decisao = public._taf_erp_meta_tela(p_antes),
         ordem = case when p_aprovar then nextval('public.taf_erp_meta_ordem_seq') end
   where id = r.id
  returning * into r;
  return to_jsonb(r);
end $$;

-- Cancelar a própria proposta, enquanto está pendente. Proposta feita com chave pessoal só se cancela com chave pessoal.
create or replace function public.taf_erp_meta_cancelar(p_chave text, p_obra text, p_quem text, p_id bigint, p_motivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; r public.taf_erp_meta_prop;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_meta_' || p_obra));
  select * into r from public.taf_erp_meta_prop where id = p_id and obra = p_obra for update;
  if r.id is null then raise exception 'PROPOSTA NAO EXISTE'; end if;
  if r.situacao <> 'pendente' then raise exception 'PROPOSTA JA DECIDIDA'; end if;
  if public._taf_erp_meta_norm(r.proposto_por) <> public._taf_erp_meta_norm(a.nome) then raise exception 'SO QUEM PROPOS CANCELA'; end if;
  if r.proposto_pessoal and coalesce(a.fixo, false) is not true then raise exception 'CANCELE COM A SUA CHAVE PESSOAL'; end if;
  update public.taf_erp_meta_prop
     set situacao = 'cancelada', decidido_por = a.nome, decidido_papel = a.papel, decidido_em = now(),
         decisao_motivo = nullif(left(public._taf_erp_meta_texto(p_motivo), 500), '')
   where id = r.id
  returning * into r;
  return to_jsonb(r);
end $$;

-- Só as funções de entrada ficam chamáveis pela API; as internas e a tabela, não.
revoke all on function public._taf_erp_meta_trg(), public._taf_erp_meta_norm(text), public._taf_erp_meta_num(text),
  public._taf_erp_meta_texto(text), public._taf_erp_meta_tela(jsonb),
  public._taf_erp_meta_item_atual(text, text), public._taf_erp_meta_valida(text, text, text, numeric, numeric, date, text),
  public._taf_erp_meta_antes(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.taf_erp_meta_propor(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
  public.taf_erp_meta_direta(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
  public.taf_erp_meta_listar(text, text, text),
  public.taf_erp_meta_decidir(text, text, text, text, bigint, boolean, text, jsonb),
  public.taf_erp_meta_cancelar(text, text, text, bigint, text) from public;
grant execute on function public.taf_erp_meta_propor(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
  public.taf_erp_meta_direta(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
  public.taf_erp_meta_listar(text, text, text),
  public.taf_erp_meta_decidir(text, text, text, text, bigint, boolean, text, jsonb),
  public.taf_erp_meta_cancelar(text, text, text, bigint, text) to anon, authenticated;

-- ===================== COMO DESFAZER =====================
-- 1. No ERP, desligar a chave "Meta pela tela" nas obras (Compras → Parâmetros → Chaves desta obra). Desligada, a tela não chama nada daqui.
--    As metas que já foram aplicadas continuam no estado da obra (linha de base, histórico e auditoria), como qualquer Atualizar pela planilha.
-- 2. Guardar cópia das propostas:   create table public.taf_erp_meta_prop_copia as select * from public.taf_erp_meta_prop;
-- 3. Remover só o que este arquivo criou:
--    drop function if exists public.taf_erp_meta_propor(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
--      public.taf_erp_meta_direta(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
--      public.taf_erp_meta_listar(text, text, text), public.taf_erp_meta_decidir(text, text, text, text, bigint, boolean, text, jsonb),
--      public.taf_erp_meta_cancelar(text, text, text, bigint, text),
--      public._taf_erp_meta_antes(text, text, text, jsonb), public._taf_erp_meta_valida(text, text, text, numeric, numeric, date, text),
--      public._taf_erp_meta_item_atual(text, text), public._taf_erp_meta_num(text), public._taf_erp_meta_norm(text),
--      public._taf_erp_meta_texto(text), public._taf_erp_meta_tela(jsonb);
--    drop table if exists public.taf_erp_meta_prop;          -- leva junto o gatilho e os índices
--    drop function if exists public._taf_erp_meta_trg();
--    drop sequence if exists public.taf_erp_meta_ordem_seq;
-- NÃO usar o 99_reverter.sql inteiro (apaga o ERP todo).
