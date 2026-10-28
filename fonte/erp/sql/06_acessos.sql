-- 06_acessos.sql · Tela Acessos do ERP: criar e desativar a chave pessoal pela tela, sem SQL.
-- RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar (06_teste_acessos.sql, que desfaz tudo no fim).
--
-- O que faz:
--   1. taf_ciclo_chave aceita o papel 'encarregado' (troca só a regra de papel da tabela; nada mais muda nela).
--   2. taf_acesso_log: registro de quem criou e quem desativou cada chave. Só entra linha; nunca muda nem apaga.
--      Guarda só um identificador curto. Nunca a chave, nunca o hash.
--      O identificador (10 letras) é o começo do hmac do sha256 com um segredo do banco (taf_acesso_segredo, fechado para o site):
--      não entrega nenhum pedaço do sha256 a quem vê a lista (chave antiga fraca, criada à mão, não fica mais fácil de adivinhar).
--   3. Três funções de entrada, chamáveis pelo site (anon):
--        taf_acesso_listar(chave, quem)                               lista as chaves pessoais, sem o hash
--        taf_acesso_criar(chave, nome, pessoa, papel, obras, quem)    gera a chave NO BANCO, grava só o sha256, devolve o texto UMA vez
--        taf_acesso_desativar(chave, id, motivo, quem)
--      Quem pode:
--        chave pessoal de Diretoria: cria e desativa qualquer papel, só nas obras que ela cuida (ver "obras" abaixo).
--        chave pessoal de gestor: cria e desativa engenheiro, encarregado e leitura, só nas obras da própria chave.
--        chave geral do site: na PARTIDA (nenhuma chave de Diretoria ativa) cria a primeira, só de Diretoria, com o nome
--          digitado. Depois disso não cria nem desativa nada (D4: com a chave geral o nome é digitado).
--        Ninguém desativa a própria chave.
--      Obras (revisão 2): a chave nova e a chave a desativar têm de estar inteiras dentro das obras de quem faz.
--        Diretoria "com todas as obras" = a chave de Diretoria que tem todas as obras que alguma Diretoria ativa tem.
--          Ela cuida de todas as obras do sistema, inclusive obra nova que ainda não tem Diretoria (senão obra importada
--          depois ficaria sem ninguém para dar acesso). A Diretoria limitada (sócio de consórcio, uma obra só) cuida só das obras dela.
--        Tem de sobrar sempre uma Diretoria com todas as obras: não desativa a que deixaria nenhuma; e a primeira chave de
--          Diretoria de uma obra nova tem de ter também todas as obras que já têm Diretoria.
--        O gestor e a Diretoria limitada só veem na lista as chaves que têm obra em comum com eles (sem as obras de fora,
--          só quantas são); o gestor não vê as chaves de Diretoria. [SUPOSIÇÃO: falta o ok do Felipe, ver o LEIA-ME-06.]
--        Engenheiro, encarregado e leitura não veem a lista.
--      Validação: papel, obras que existem (taf_ciclo_obra ou taf_erp_obra), nome da chave (3 a 60 letras, sem repetir entre as
--      ativas) e pessoa (2 a 60 letras; só a chave de leitura pode ficar sem pessoa). Antes de validar e de comparar, tira os
--      caracteres invisíveis (espaço de largura zero e parecidos) e junta os espaços; nome e pessoa precisam de 2 letras ou números.
--      Pessoa (revisão 2): não cria chave em nome de quem já tem chave ativa que o criador não cuida (ex.: gestor criando em nome
--        da Diretoria ou de outro gestor). Vale também para a Diretoria limitada. Na partida não confere (não há quem cuide).
--      Aviso (não bloqueia): chave de engenheiro em nome diferente do engenheiro da obra no planejador (taf_ciclo_obra.engenheiro);
--        pessoa que já tem outra chave ativa (celular antigo?).
--        O planejador (02_funcoes.sql, _taf_ciclo_ator) só dá papel de engenheiro à chave antiga do site quando o nome é
--        igual a taf_ciclo_obra.engenheiro; a chave pessoal nova entra pelo papel, mas as demandas, as áreas e as tarefas
--        em nome do engenheiro (resp, dono, "para você decidir") só aparecem como dela se o nome for o mesmo.
--   4. Encarregado no planejador: só aponta o dia (apont, apont_lote, apont_apagar). Não prepara, não monta compromisso,
--      não publica, não fecha semana, não replaneja, não abre demanda solta.
--      Para isso este arquivo REDEFINE _taf_ciclo_pode: cópia inteira da versão atual (fonte/ciclo/sql/02_funcoes.sql,
--      igual à do banco: md5 do corpo 0b8e6eba22d91ff6fcba227ae952048c em /opt/pgtest/prod_md5.txt), com a linha nova marcada "06".
--      _taf_ciclo_ator e _taf_erp_ator NÃO mudam: as duas já passam adiante o papel da chave pessoal
--        (_taf_ciclo_ator: papel := v_c.papel; _taf_erp_ator: case ... else r.papel, e 'encarregado' já é papel do ERP
--        em _taf_erp_papeis). Conferido no teste: a chave de encarregado entra no ERP como encarregado e no planejador como encarregado.
--      taf_ciclo_ler, taf_ciclo_importar e _taf_ciclo_condicao não são tocadas.
--
-- Depende de: fonte/ciclo/sql/01 e 02 (taf_ciclo_chave, taf_ciclo_obra), fonte/erp/sql/01_erp.sql (taf_erp_obra),
--             public._taf_ok (chave geral do site), extensão pgcrypto no esquema extensions (digest, hmac e gen_random_bytes).
-- Antes de aplicar: backup de taf_ciclo_chave (create table ... as select). Rodar o arquivo inteiro de uma vez.
-- Desfazer: ver o fim do arquivo.

-- ===================================================================== 1. papel 'encarregado' na chave pessoal
-- Tira a regra antiga de papel (a que lista 'gestor'), qualquer que seja o nome dela no banco, e põe a nova.
-- A regra "leitura pode ficar sem pessoa" (taf_ciclo_chave_check) não muda: o encarregado precisa de pessoa.
do $$ declare r record; begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.taf_ciclo_chave'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) ~ 'papel' and pg_get_constraintdef(c.oid) ~ 'gestor' loop
    execute format('alter table public.taf_ciclo_chave drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.taf_ciclo_chave add constraint taf_ciclo_chave_papel_check
  check (papel in ('engenheiro','gestor','diretoria','leitura','encarregado'));

-- ===================================================================== 2. registro de criar e desativar
create table if not exists public.taf_acesso_log (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  acao        text not null check (acao in ('criar','desativar')),
  chave_id    text not null check (chave_id ~ '^[0-9a-f]{10}$'),   -- identificador curto (_taf_acesso_id: hmac do sha256, não o sha256)
  nome        text not null,
  pessoa      text,
  papel       text not null,
  obras       text[] not null,
  motivo      text check (length(motivo) <= 300),
  quem        text not null,                                       -- quem criou ou desativou
  quem_papel  text not null,                                       -- 'diretoria', 'gestor' ou 'chave geral'
  verificado  boolean not null                                     -- true = chave pessoal; false = nome digitado com a chave geral
);
create index if not exists taf_acesso_log_chave on public.taf_acesso_log (chave_id, id);

create or replace function public._taf_acesso_log_trava() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'HISTORICO NAO SE ALTERA';
end $$;
drop trigger if exists t_trava on public.taf_acesso_log;
create trigger t_trava before update or delete on public.taf_acesso_log for each row execute function public._taf_acesso_log_trava();
drop trigger if exists t_trava_trunc on public.taf_acesso_log;
create trigger t_trava_trunc before truncate on public.taf_acesso_log for each statement execute function public._taf_acesso_log_trava();

alter table public.taf_acesso_log enable row level security;
revoke all on public.taf_acesso_log from public, anon, authenticated;
revoke all on sequence public.taf_acesso_log_id_seq from public, anon, authenticated;

-- Segredo do identificador curto (revisão 2). Uma linha só, sorteada aqui, nunca sai do banco e nunca muda
-- (se mudasse, os identificadores do registro deixariam de bater com as chaves).
create table if not exists public.taf_acesso_segredo (
  um       boolean primary key default true check (um),
  segredo  bytea not null default extensions.gen_random_bytes(32) check (octet_length(segredo) = 32)
);
insert into public.taf_acesso_segredo (um) values (true) on conflict (um) do nothing;
create or replace function public._taf_acesso_segredo_trava() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'O SEGREDO DOS IDENTIFICADORES NAO SE ALTERA';
end $$;
drop trigger if exists t_trava on public.taf_acesso_segredo;
create trigger t_trava before update or delete on public.taf_acesso_segredo for each row execute function public._taf_acesso_segredo_trava();
drop trigger if exists t_trava_trunc on public.taf_acesso_segredo;
create trigger t_trava_trunc before truncate on public.taf_acesso_segredo for each statement execute function public._taf_acesso_segredo_trava();
alter table public.taf_acesso_segredo enable row level security;
revoke all on public.taf_acesso_segredo from public, anon, authenticated;

-- ===================================================================== 3. funções internas
-- Identificador curto de uma chave: 10 letras do hmac do sha256 com o segredo. Não entrega pedaço do sha256.
create or replace function public._taf_acesso_id(p_hash text) returns text
language sql stable strict security definer set search_path = public, extensions as $$
  select left(encode(extensions.hmac(convert_to(p_hash, 'UTF8'), s.segredo, 'sha256'), 'hex'), 10)
    from public.taf_acesso_segredo s where s.um $$;

-- Texto digitado (nome e pessoa): tira os caracteres invisíveis (largura zero, marcas de direção, BOM, preenchimento),
-- troca os espaços especiais por espaço comum e junta os espaços. Vazio = null.
create or replace function public._taf_acesso_limpa(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(regexp_replace(coalesce(p, ''),
    E'[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￰-￻\U000E0000-\U000E007F]', '', 'g'),
    E'[\\s   -     　]+', ' ', 'g')), '') $$;

-- Forma de comparar nomes: limpa, sem acento, minúscula ("José  da Silva" = "jose da silva").
create or replace function public._taf_acesso_norm(p text) returns text
language sql immutable set search_path = public as $$
  select lower(translate(coalesce(public._taf_acesso_limpa(p), ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')) $$;

-- Todas as obras do sistema (planejador ou ERP).
create or replace function public._taf_acesso_todas() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(t.x order by t.x), '{}')
    from (select o.obra as x from public.taf_ciclo_obra o union select e.codigo from public.taf_erp_obra e) t $$;

-- Obras que têm chave de Diretoria ativa.
create or replace function public._taf_acesso_cobertas() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct u.x order by u.x), '{}')
    from public.taf_ciclo_chave c cross join lateral unnest(c.obras) as u(x)
   where c.papel = 'diretoria' and c.ativo $$;

-- Diretoria com todas as obras: tem todas as obras que alguma Diretoria ativa tem.
create or replace function public._taf_acesso_geral(p_tipo text, p_papel text, p_obras text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_tipo = 'pessoal' and p_papel = 'diretoria' and public._taf_acesso_cobertas() <@ coalesce(p_obras, '{}'), false) $$;

-- Obras em que o ator cuida de acesso (revisão 2: vale para a Diretoria também).
--   Diretoria com todas as obras: todas as obras do sistema (inclusive obra nova, sem Diretoria ainda).
--   Diretoria limitada e gestor: as obras da própria chave.
--   Chave geral: todas (só serve na partida; fora dela a chave geral não cria nada).
create or replace function public._taf_acesso_escopo(p_tipo text, p_papel text, p_obras text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when p_tipo = 'geral' then public._taf_acesso_todas()
    when public._taf_acesso_geral(p_tipo, p_papel, p_obras) then
      array(select distinct u.x from unnest(public._taf_acesso_todas() || coalesce(p_obras, '{}')) as u(x) order by u.x)
    when p_tipo = 'pessoal' and p_papel in ('diretoria','gestor') then coalesce(p_obras, '{}')
    else '{}'::text[] end $$;

-- Quem está chamando. tipo 'pessoal' (taf_ciclo_chave ativa) ou 'geral' (chave do site, nome digitado).
-- A chave antiga do site (taf_pessoa_chave, a do engenheiro antigo) não cuida de acessos.
create or replace function public._taf_acesso_ator(p_chave text, p_quem text,
  out tipo text, out nome text, out papel text, out obras text[], out hash text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_h text := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex'); v_c public.taf_ciclo_chave; v_n int := 0;
begin
  select * into v_c from public.taf_ciclo_chave c where c.hash = v_h and c.ativo;
  if v_c.hash is not null then
    tipo := 'pessoal'; nome := coalesce(v_c.pessoa, v_c.nome); papel := v_c.papel; obras := v_c.obras; hash := v_c.hash; return;
  end if;
  if public._taf_ok(p_chave) then
    tipo := 'geral'; nome := nullif(left(regexp_replace(trim(coalesce(p_quem, '')), '\s+', ' ', 'g'), 60), '');
    papel := null; obras := null; hash := null; return;
  end if;
  if to_regclass('public.taf_pessoa_chave') is not null then
    execute 'select count(*) from public.taf_pessoa_chave where hash = $1' into v_n using v_h;
    if v_n > 0 then raise exception 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  end if;
  raise exception 'CHAVE INVALIDA';
end $$;

-- Papéis que o ator pode criar agora.
create or replace function public._taf_acesso_pode_criar(p_tipo text, p_papel text, p_partida boolean) returns text[]
language sql immutable as $$
  select case
    when p_tipo = 'pessoal' and p_papel = 'diretoria' then array['diretoria','gestor','engenheiro','encarregado','leitura']
    when p_tipo = 'pessoal' and p_papel = 'gestor'    then array['engenheiro','encarregado','leitura']
    when p_tipo = 'geral' and p_partida               then array['diretoria']
    else array[]::text[] end $$;

-- Por que o ator NÃO pode desativar esta chave (null = pode).
create or replace function public._taf_acesso_bloqueio(p_tipo text, p_papel text, p_obras text[], p_hash text, p_c public.taf_ciclo_chave)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_cob text[];
begin
  if p_c.hash is null then return 'CHAVE NAO ENCONTRADA'; end if;
  if not p_c.ativo then return 'CHAVE JA DESATIVADA'; end if;
  if p_tipo is distinct from 'pessoal' then return 'A CHAVE GERAL NAO DESATIVA ACESSO: ENTRE COM A SUA CHAVE PESSOAL'; end if;
  if p_papel not in ('diretoria','gestor') then return 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  if p_c.hash = p_hash then return 'NAO DESATIVE A PROPRIA CHAVE: PECA A OUTRA PESSOA DA DIRETORIA'; end if;
  if p_papel = 'gestor' and p_c.papel not in ('engenheiro','encarregado','leitura') then
    return 'SEM PERMISSAO: O GESTOR SO DESATIVA ENGENHEIRO, ENCARREGADO E LEITURA'; end if;
  -- revisão 2: a Diretoria também só desativa chave que está inteira dentro das obras que ela cuida
  if not (p_c.obras <@ public._taf_acesso_escopo(p_tipo, p_papel, p_obras)) then
    return 'SEM PERMISSAO: A CHAVE TEM OBRA FORA DAS SUAS'; end if;
  if p_c.papel = 'diretoria' then
    if not exists (select 1 from public.taf_ciclo_chave c where c.papel = 'diretoria' and c.ativo and c.hash <> p_c.hash) then
      return 'ULTIMA CHAVE DE DIRETORIA ATIVA: CRIE OUTRA ANTES DE DESATIVAR ESTA'; end if;
    -- revisão 2: tem de sobrar uma Diretoria com todas as obras que as Diretorias têm hoje (contando esta)
    v_cob := public._taf_acesso_cobertas();
    if not exists (select 1 from public.taf_ciclo_chave c where c.papel = 'diretoria' and c.ativo and c.hash <> p_c.hash and c.obras @> v_cob) then
      return 'SEM OUTRA DIRETORIA COM TODAS AS OBRAS: CRIE ANTES OUTRA CHAVE DE DIRETORIA COM TODAS AS OBRAS'; end if;
  end if;
  return null;
end $$;

-- Avisos que não bloqueiam (nome do engenheiro, obra sem cronograma no planejador, pessoa com outra chave ativa).
-- p_hash = a própria chave (não conta como "outra").
drop function if exists public._taf_acesso_avisos(text, text, text[]);   -- versão antes da revisão 2 (sem p_hash)
create or replace function public._taf_acesso_avisos(p_papel text, p_pessoa text, p_obras text[], p_hash text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x.t order by x.o), '{}') from (
    select o.obra as o, format('Obra %s: o engenheiro no planejador é %s e esta chave está em nome de %s. As demandas, as áreas '
             || 'e as tarefas em nome do engenheiro não aparecem como desta pessoa. Use o mesmo nome ou peça para trocar o engenheiro da obra.',
             o.obra, o.engenheiro, coalesce(p_pessoa, '(sem pessoa)')) as t
      from public.taf_ciclo_obra o
     where p_papel = 'engenheiro' and o.obra = any(p_obras) and o.engenheiro is distinct from p_pessoa
    union all
    select u.x, format('Obra %s ainda sem cronograma no planejador: por enquanto não há o que %s nela.', u.x,
             case p_papel when 'engenheiro' then 'planejar nem apontar' else 'apontar' end)
      from unnest(p_obras) as u(x)
     where p_papel in ('engenheiro','encarregado') and not exists (select 1 from public.taf_ciclo_obra o where o.obra = u.x)
    union all
    select '~', format('%s tem %s chaves ativas. Se alguma é de celular antigo ou de quem saiu, desative a que não usa mais.', p_pessoa, d.n + 1)
      from (select count(*) as n from public.taf_ciclo_chave c
             where c.ativo and c.hash is distinct from p_hash and p_pessoa is not null
               and public._taf_acesso_norm(coalesce(c.pessoa, c.nome)) = public._taf_acesso_norm(p_pessoa)) d
     where d.n > 0
  ) x $$;

-- ===================================================================== 4. funções de entrada
-- Lista. Chave pessoal de Diretoria ou de gestor: as chaves pessoais que ela cuida ou que têm obra em comum com ela (sem o hash).
--   Diretoria com todas as obras: todas. Diretoria limitada e gestor: só as que têm obra em comum (as obras de fora não aparecem,
--   só quantas são); o gestor não vê as de Diretoria. A própria chave sempre aparece. [SUPOSIÇÃO: ver o LEIA-ME-06.]
-- Chave geral: só diz se está na partida (sem a lista). Outros papéis: recusa.
create or replace function public.taf_acesso_listar(p_chave text, p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v_partida boolean; v_pode text[]; v_geral boolean; v_escopo text[]; v_cob text[];
begin
  select * into a from public._taf_acesso_ator(p_chave, p_quem);
  if a.tipo = 'pessoal' and a.papel not in ('diretoria','gestor') then
    raise exception 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  v_partida := not exists (select 1 from public.taf_ciclo_chave c where c.papel = 'diretoria' and c.ativo);
  v_pode := public._taf_acesso_pode_criar(a.tipo, a.papel, v_partida);
  v_geral := public._taf_acesso_geral(a.tipo, a.papel, a.obras);
  v_escopo := case when cardinality(v_pode) > 0 then public._taf_acesso_escopo(a.tipo, a.papel, a.obras) else '{}'::text[] end;
  v_cob := public._taf_acesso_cobertas();
  return jsonb_build_object(
    'ator', jsonb_build_object('tipo', a.tipo, 'nome', a.nome, 'papel', coalesce(a.papel, 'chave geral'), 'verificado', a.tipo = 'pessoal',
                               'id', public._taf_acesso_id(a.hash), 'geral', v_geral,
                               'obras', case when a.tipo = 'pessoal' then to_jsonb(a.obras) else '[]'::jsonb end),
    'partida', v_partida,
    'pode_criar', to_jsonb(v_pode),
    'sem_diretoria', case when v_geral then to_jsonb(array(select u.x from unnest(public._taf_acesso_todas()) as u(x)
                                                            where not (u.x = any(v_cob)) order by u.x)) else '[]'::jsonb end,
    'obras', (select coalesce(jsonb_agg(jsonb_build_object('codigo', x.cod, 'nome', coalesce(co.nome, eo.nome), 'engenheiro', co.engenheiro,
                                  'planejador', co.obra is not null, 'erp', eo.codigo is not null) order by x.cod), '[]'::jsonb)
                from (select o.obra as cod from public.taf_ciclo_obra o union select e.codigo from public.taf_erp_obra e) x
                left join public.taf_ciclo_obra co on co.obra = x.cod
                left join public.taf_erp_obra eo on eo.codigo = x.cod
               where x.cod = any(v_escopo)),
    'chaves', case when a.tipo = 'pessoal' then
      (select coalesce(jsonb_agg(jsonb_build_object(
          'id', i.id, 'nome', c.nome, 'pessoa', c.pessoa, 'papel', c.papel, 'obras', to_jsonb(v.obras),
          'outras_obras', cardinality(c.obras) - cardinality(v.obras),
          'ativo', c.ativo, 'criado_em', c.criado_em,
          'criado_por', (select l.quem from public.taf_acesso_log l where l.chave_id = i.id and l.acao = 'criar' order by l.id limit 1),
          'desativado_em', (select l.em from public.taf_acesso_log l where l.chave_id = i.id and l.acao = 'desativar' order by l.id desc limit 1),
          'desativado_por', (select l.quem from public.taf_acesso_log l where l.chave_id = i.id and l.acao = 'desativar' order by l.id desc limit 1),
          'sua', c.hash = a.hash,
          'bloqueio', public._taf_acesso_bloqueio(a.tipo, a.papel, a.obras, a.hash, c),
          'avisos', to_jsonb(case when c.ativo then public._taf_acesso_avisos(c.papel, c.pessoa, v.obras, c.hash) else '{}'::text[] end))
        order by c.ativo desc, c.criado_em desc, c.nome), '[]'::jsonb)
         from public.taf_ciclo_chave c
        cross join lateral (select public._taf_acesso_id(c.hash) as id) i
        cross join lateral (select case when v_geral or c.hash = a.hash then c.obras
                                        else array(select u.x from unnest(c.obras) as u(x) where u.x = any(v_escopo) order by u.x) end as obras) v
        where v_geral or c.hash = a.hash or (c.obras && v_escopo and not (a.papel = 'gestor' and c.papel = 'diretoria')))
      else '[]'::jsonb end);
end $$;

-- Cria. A chave nasce aqui: prefixo legível tirado do nome da pessoa + 24 letras aleatórias (96 bits) em grupos de 4.
-- Só o sha256 fica gravado. O texto volta UMA vez, nesta resposta.
create or replace function public.taf_acesso_criar(p_chave text, p_nome text, p_pessoa text, p_papel text, p_obras text[],
                                                   p_quem text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a record; v_partida boolean; v_pode text[]; v_escopo text[]; v_cob text[]; v_nome text; v_pessoa text; v_obras text[]; v_o text;
        v_pref text; v_hex text; v_txt text; v_h text; v_id text; v_por text; v_i int := 0;
        v_ruim constant text := '[[:cntrl:]<>"`\\{}|]';
begin
  select * into a from public._taf_acesso_ator(p_chave, p_quem);
  if a.tipo = 'pessoal' and a.papel not in ('diretoria','gestor') then
    raise exception 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  if a.tipo = 'geral' and a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_acesso'));        -- uma criação ou desativação por vez (a partida não cria duas)
  v_partida := not exists (select 1 from public.taf_ciclo_chave c where c.papel = 'diretoria' and c.ativo);
  v_pode := public._taf_acesso_pode_criar(a.tipo, a.papel, v_partida);
  if cardinality(v_pode) = 0 then
    raise exception 'A CHAVE GERAL NAO CRIA ACESSO: JA EXISTE CHAVE DE DIRETORIA. ENTRE COM A SUA CHAVE PESSOAL'; end if;
  if p_papel is null or not (p_papel = any(array['diretoria','gestor','engenheiro','encarregado','leitura'])) then
    raise exception 'PAPEL INVALIDO'; end if;
  if not (p_papel = any(v_pode)) then
    if a.tipo = 'geral' then raise exception 'NA PARTIDA A CHAVE GERAL SO CRIA A PRIMEIRA CHAVE DE DIRETORIA'; end if;
    raise exception 'SEM PERMISSAO: % NAO CRIA CHAVE DE %', upper(a.papel), upper(p_papel);
  end if;
  v_escopo := public._taf_acesso_escopo(a.tipo, a.papel, a.obras);

  -- revisão 2: tira os invisíveis e junta os espaços antes de validar e de comparar
  v_pessoa := public._taf_acesso_limpa(p_pessoa);
  v_nome := coalesce(public._taf_acesso_limpa(p_nome), v_pessoa);
  if v_pessoa is null and p_papel <> 'leitura' then raise exception 'INFORME A PESSOA'; end if;
  if v_nome is null then raise exception 'INFORME O NOME DA CHAVE'; end if;
  if length(v_nome) not between 3 and 60 then raise exception 'NOME DA CHAVE: DE 3 A 60 LETRAS'; end if;
  if v_pessoa is not null and length(v_pessoa) not between 2 and 60 then raise exception 'NOME DA PESSOA: DE 2 A 60 LETRAS'; end if;
  if v_nome ~ v_ruim or coalesce(v_pessoa, '') ~ v_ruim then raise exception 'NOME COM SINAL QUE NAO PODE (< > " ` \ { } |)'; end if;
  if v_nome !~ '[[:alnum:]].*[[:alnum:]]' then raise exception 'NOME DA CHAVE: USE AO MENOS 2 LETRAS OU NUMEROS'; end if;
  if v_pessoa !~ '[[:alnum:]].*[[:alnum:]]' then raise exception 'NOME DA PESSOA: USE AO MENOS 2 LETRAS OU NUMEROS'; end if;
  if exists (select 1 from public.taf_ciclo_chave c where c.ativo and public._taf_acesso_norm(c.nome) = public._taf_acesso_norm(v_nome)) then
    raise exception 'JA EXISTE CHAVE ATIVA COM O NOME %: USE OUTRO NOME OU DESATIVE A ANTIGA', v_nome; end if;

  select coalesce(array_agg(distinct trim(x) order by trim(x)), '{}') into v_obras
    from unnest(coalesce(p_obras, '{}'::text[])) as u(x) where nullif(trim(x), '') is not null;
  if cardinality(v_obras) = 0 then raise exception 'ESCOLHA AO MENOS UMA OBRA'; end if;
  if cardinality(v_obras) > 60 then raise exception 'OBRAS DEMAIS NUMA CHAVE'; end if;
  foreach v_o in array v_obras loop
    if v_o !~ '^\d{3}$' or not (exists (select 1 from public.taf_ciclo_obra o where o.obra = v_o)
                                 or exists (select 1 from public.taf_erp_obra e where e.codigo = v_o)) then
      raise exception 'OBRA % NAO EXISTE', v_o; end if;
    -- revisão 2: vale para a Diretoria também (a limitada só cria nas obras dela)
    if not (v_o = any(v_escopo)) then
      raise exception 'SEM ACESSO A OBRA %: SO CRIA ACESSO NAS OBRAS QUE A SUA CHAVE CUIDA', v_o; end if;
  end loop;
  -- revisão 2: a primeira chave de Diretoria de uma obra nova tem de ter também todas as obras que já têm Diretoria,
  -- para sempre sobrar uma Diretoria com todas as obras
  if p_papel = 'diretoria' and a.tipo = 'pessoal' then
    v_cob := public._taf_acesso_cobertas();
    if not (v_obras <@ v_cob) and not (v_cob <@ v_obras) then
      raise exception 'OBRA SEM DIRETORIA (%): A PRIMEIRA CHAVE DE DIRETORIA DELA TEM DE TER TAMBEM AS OBRAS %',
        array_to_string(array(select u.x from unnest(v_obras) as u(x) where not (u.x = any(v_cob)) order by u.x), ', '),
        array_to_string(v_cob, ', ');
    end if;
  end if;
  -- revisão 2: não cria chave em nome de quem já tem chave ativa que o criador não cuida (papel acima ou obra fora)
  if a.tipo = 'pessoal' and exists (
       select 1 from public.taf_ciclo_chave c
        where c.ativo and public._taf_acesso_norm(coalesce(c.pessoa, c.nome)) = public._taf_acesso_norm(coalesce(v_pessoa, v_nome))
          and not (c.papel = any(v_pode) and c.obras <@ v_escopo)) then
    raise exception 'A PESSOA % JA TEM CHAVE QUE VOCE NAO CUIDA: PECA A DIRETORIA', coalesce(v_pessoa, v_nome);
  end if;

  v_pref := lower(translate(split_part(coalesce(v_pessoa, v_nome), ' ', 1),
              'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'));
  v_pref := left(regexp_replace(v_pref, '[^a-z]', '', 'g'), 12);
  if length(v_pref) < 2 then v_pref := 'taf'; end if;
  loop
    v_i := v_i + 1;
    if v_i > 20 then raise exception 'NAO CONSEGUI GERAR A CHAVE: TENTE DE NOVO'; end if;
    v_hex := encode(extensions.gen_random_bytes(12), 'hex');
    v_txt := v_pref || '-' || array_to_string(array(select substr(v_hex, g * 4 + 1, 4) from generate_series(0, 5) g), '-');
    v_h := encode(extensions.digest(v_txt, 'sha256'), 'hex');
    v_id := public._taf_acesso_id(v_h);
    exit when not exists (select 1 from public.taf_ciclo_chave c where public._taf_acesso_id(c.hash) = v_id)
          and not public._taf_ok(v_txt);
  end loop;

  v_por := case when a.tipo = 'geral' then a.nome || ' (chave geral)' else a.nome end;
  insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras, ativo)
  values (v_h, v_nome, v_pessoa, p_papel, v_obras, true);
  insert into public.taf_acesso_log (acao, chave_id, nome, pessoa, papel, obras, motivo, quem, quem_papel, verificado)
  values ('criar', v_id, v_nome, v_pessoa, p_papel, v_obras,
          case when a.tipo = 'geral' then 'partida: primeira chave de Diretoria' end,
          v_por, coalesce(a.papel, 'chave geral'), a.tipo = 'pessoal');
  return jsonb_build_object('ok', true, 'id', v_id, 'chave', v_txt, 'nome', v_nome, 'pessoa', v_pessoa, 'papel', p_papel,
                            'obras', to_jsonb(v_obras), 'partida', a.tipo = 'geral', 'criado_por', v_por,
                            'avisos', to_jsonb(public._taf_acesso_avisos(p_papel, v_pessoa, v_obras, v_h)));
end $$;

-- Desativa (não apaga: a linha fica, com ativo = false, e o registro diz quem e quando).
create or replace function public.taf_acesso_desativar(p_chave text, p_id text, p_motivo text default null, p_quem text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a record; v_n int; v_c public.taf_ciclo_chave; v_b text; v_mot text := nullif(left(trim(coalesce(p_motivo, '')), 300), '');
begin
  select * into a from public._taf_acesso_ator(p_chave, p_quem);
  if a.tipo = 'geral' then raise exception 'A CHAVE GERAL NAO DESATIVA ACESSO: ENTRE COM A SUA CHAVE PESSOAL'; end if;
  if a.papel not in ('diretoria','gestor') then raise exception 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  if coalesce(p_id, '') !~ '^[0-9a-f]{10}$' then raise exception 'IDENTIFICADOR INVALIDO'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_acesso'));
  select count(*) into v_n from public.taf_ciclo_chave c where public._taf_acesso_id(c.hash) = p_id;
  if v_n = 0 then raise exception 'CHAVE NAO ENCONTRADA'; end if;
  if v_n > 1 then raise exception 'IDENTIFICADOR REPETIDO: DESATIVE PELO BANCO'; end if;
  select * into v_c from public.taf_ciclo_chave c where public._taf_acesso_id(c.hash) = p_id for update;
  v_b := public._taf_acesso_bloqueio(a.tipo, a.papel, a.obras, a.hash, v_c);
  if v_b is not null then raise exception '%', v_b; end if;
  update public.taf_ciclo_chave c set ativo = false where c.hash = v_c.hash;
  insert into public.taf_acesso_log (acao, chave_id, nome, pessoa, papel, obras, motivo, quem, quem_papel, verificado)
  values ('desativar', p_id, v_c.nome, v_c.pessoa, v_c.papel, v_c.obras, v_mot, a.nome, a.papel, true);
  return jsonb_build_object('ok', true, 'id', p_id, 'nome', v_c.nome, 'pessoa', v_c.pessoa, 'papel', v_c.papel, 'desativado_por', a.nome);
end $$;

-- ===================================================================== 5. planejador: o encarregado só aponta
-- Cópia inteira da versão atual (fonte/ciclo/sql/02_funcoes.sql). Mudou só a linha marcada "06".
create or replace function public._taf_ciclo_pode(p_papel text, p_acao text) returns boolean
language sql immutable as $$
  select case p_papel
    -- "O Felipe nunca escreve o plano semanal" [FLUXO L73]: gestor decide, cobra, dá de acordo e reabre
    when 'gestor' then p_acao = any(array['demanda','demanda_resp','cobrar','impacto','acordo','reabrir'])
    when 'engenheiro' then p_acao = any(array['preparo','preparo_ok','comp','comp_tirar','comp_cancelar','fora','publicar',
      'apont','apont_lote','apont_apagar','real','fechar_item','fechar_semana','replan','efeito','saldo',
      'demanda','demanda_resp','cobrar','impacto'])
    when 'diretoria' then p_acao = any(array['demanda','demanda_resp','cobrar','impacto','acordo'])
    when 'encarregado' then p_acao = any(array['apont','apont_lote','apont_apagar'])   -- 06: encarregado só aponta o dia
    else false end $$;

-- ===================================================================== 6. permissões
-- Só as três funções de entrada ficam chamáveis pelo site; as internas e as tabelas ficam fechadas
-- (o Supabase dá execute por padrão a quem cria função em public).
revoke all on function public._taf_acesso_log_trava(), public._taf_acesso_segredo_trava(), public._taf_acesso_id(text),
  public._taf_acesso_limpa(text), public._taf_acesso_norm(text), public._taf_acesso_todas(), public._taf_acesso_cobertas(),
  public._taf_acesso_geral(text, text, text[]), public._taf_acesso_escopo(text, text, text[]),
  public._taf_acesso_ator(text, text), public._taf_acesso_pode_criar(text, text, boolean),
  public._taf_acesso_bloqueio(text, text, text[], text, public.taf_ciclo_chave), public._taf_acesso_avisos(text, text, text[], text),
  public._taf_ciclo_pode(text, text) from public, anon, authenticated;
revoke all on function public.taf_acesso_listar(text, text), public.taf_acesso_criar(text, text, text, text, text[], text),
  public.taf_acesso_desativar(text, text, text, text) from public;
grant execute on function public.taf_acesso_listar(text, text), public.taf_acesso_criar(text, text, text, text, text[], text),
  public.taf_acesso_desativar(text, text, text, text) to anon, authenticated;

-- ===================================================================== desfazer (manual, na ordem)
-- 1. Encarregado volta a não apontar: rodar de novo, de fonte/ciclo/sql/02_funcoes.sql, só o bloco
--    "create or replace function public._taf_ciclo_pode(...)" (e o revoke dele: revoke all on function public._taf_ciclo_pode(text, text) from public, anon, authenticated;).
-- 2. drop function public.taf_acesso_listar(text, text);
--    drop function public.taf_acesso_criar(text, text, text, text, text[], text);
--    drop function public.taf_acesso_desativar(text, text, text, text);
--    drop function public._taf_acesso_avisos(text, text, text[], text);
--    drop function public._taf_acesso_bloqueio(text, text, text[], text, public.taf_ciclo_chave);
--    drop function public._taf_acesso_pode_criar(text, text, boolean);
--    drop function public._taf_acesso_ator(text, text);
--    drop function public._taf_acesso_escopo(text, text, text[]);
--    drop function public._taf_acesso_geral(text, text, text[]);
--    drop function public._taf_acesso_cobertas();
--    drop function public._taf_acesso_todas();
--    drop function public._taf_acesso_norm(text);
--    drop function public._taf_acesso_limpa(text);
--    drop function public._taf_acesso_id(text);
-- 3. Registro: guardar uma cópia antes (create table public.taf_acesso_log_copia as select * from public.taf_acesso_log;), depois
--    drop table public.taf_acesso_log; drop function public._taf_acesso_log_trava();
--    drop table public.taf_acesso_segredo; drop function public._taf_acesso_segredo_trava();
--    (sem o segredo, os identificadores do registro copiado não batem mais com as chaves: guarde a cópia junto com a data)
-- 4. Papel: se existir chave de encarregado, avisar a pessoa e tirar a chave (delete from public.taf_ciclo_chave where papel = 'encarregado';). Depois
--    alter table public.taf_ciclo_chave drop constraint taf_ciclo_chave_papel_check;
--    alter table public.taf_ciclo_chave add constraint taf_ciclo_chave_papel_check check (papel in ('engenheiro','gestor','diretoria','leitura'));
-- As chaves criadas pela tela continuam valendo depois do desfazer (são linhas comuns de taf_ciclo_chave). Para tirar uma
-- (antes do passo 2, enquanto _taf_acesso_id existe):
--    update public.taf_ciclo_chave set ativo = false where public._taf_acesso_id(hash) = '<id da tela>';
