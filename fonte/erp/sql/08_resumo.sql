-- 08_resumo.sql · RESUMO AUTOMÁTICO PARA O DIRETOR (item 5): e-mail no horário com o BI de cada obra.
-- RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar.
-- Teste na obra 999 (fictícia): fonte/erp/sql/08_teste_resumo.sql (roda numa transação e desfaz tudo no fim).
--
-- O que faz
--  1. taf_resumo_dest: quem recebe o resumo por e-mail (nome, e-mail, obras ou todas, diária ou semanal, ativo, quem cadastrou).
--     Nada se apaga: desativar guarda a linha; cada mudança guarda a versão anterior em taf_resumo_dest_hist.
--  2. taf_resumo_envio: cada e-mail reservado, mandado ou com erro. Um por destinatário por dia (semanal: um por semana);
--     o envio de teste ("Mandar agora para mim") fica à parte, com limite de 5 por pessoa por dia.
--  3. taf_resumo_robo: qual chave é a do robô que manda o e-mail. É uma chave pessoal de papel leitura, sem obra nenhuma
--     (não abre ERP nem planejador); só serve para estas funções. Ela é criada pela tela (taf_resumo_robo_gerar) e aparece uma vez.
--  4. _taf_resumo_obra: o resumo de uma obra juntando o planejador e o ERP, com as funções que já existem:
--     _taf_ciclo_situacao (luzes, frase, última semana fechada, EVENTOs em risco), _taf_ciclo_resumo (semana atual),
--     _taf_ciclo_prazos, as demandas abertas, os apontamentos e _taf_erp_valores (licitado, meta, comprometido, realizado).
--     Vazio não é zero: o que não tem dado sai null e o e-mail escreve "sem dado".
--
-- Funções de entrada (as únicas chamáveis pela API):
--   taf_resumo_destinatarios, taf_resumo_destinatario_salvar, taf_resumo_destinatario_desativar
--        só chave pessoal de Diretoria ou gestor (com a chave geral do site não: ninguém manda e-mail para qualquer endereço).
--        Só cadastra as obras da própria chave; "todas" só quem tem todas as obras na chave.
--   taf_resumo_robo_gerar      Diretoria ou gestor com todas as obras: cria a chave do robô (a anterior para de valer).
--   taf_resumo_previa          qualquer chave pessoal: as obras da prévia e, com p_enviar, reserva o teste para o próprio e-mail.
--   taf_resumo_obra            robô, ou chave pessoal com acesso à obra: o resumo de uma obra.
--   taf_resumo_montar          só o robô: reserva os envios do dia e devolve, por destinatário, as obras dele.
--   taf_resumo_registrar       robô, ou a própria pessoa no envio de teste: grava se o e-mail saiu.
-- O resumo de cada obra sai numa chamada à parte (taf_resumo_obra) porque o Supabase corta em poucos segundos a chamada
-- feita com a chave publicável; uma obra por chamada fica dentro do limite mesmo com muitas obras.
--
-- Precisa de: supabase/schema.sql (_taf_ok), fonte/ciclo/sql 01 a 04, fonte/erp/sql/01_erp.sql e 02_rastro.sql.
-- Não muda nenhuma tabela nem função que já existe. Só cria objetos taf_resumo_* e _taf_resumo_*.
-- Tudo idempotente: pode rodar de novo.

-- ===================================================================== tabelas
create table if not exists public.taf_resumo_dest (
  id             bigint generated always as identity primary key,
  nome           text not null check (length(trim(nome)) between 2 and 80),
  email          text not null check (length(email) <= 200
                   and email ~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$'),
  obras          text[] check (obras is null or cardinality(obras) between 1 and 50),   -- null = todas as obras
  frequencia     text not null check (frequencia in ('diaria','semanal')),
  ativo          boolean not null default true,
  pessoa         text,              -- dono da chave pessoal que pode usar "Mandar agora para mim" neste e-mail (só a própria pessoa marca)
  cadastrado_por text not null,
  cadastrado_em  timestamptz not null default now(),
  atualizado_por text,
  atualizado_em  timestamptz
);
create unique index if not exists taf_resumo_dest_1x on public.taf_resumo_dest (lower(email), frequencia) where ativo;

create table if not exists public.taf_resumo_dest_hist (
  hid        bigint generated always as identity primary key,
  dest       bigint not null,
  dados      jsonb not null,
  trocado_em timestamptz not null default now()
);

create table if not exists public.taf_resumo_envio (
  id            bigint generated always as identity primary key,
  dest          bigint not null references public.taf_resumo_dest(id),
  quando        text not null check (quando in ('diario','semanal','teste')),
  dia           date not null,                   -- dia do envio (semanal: a segunda da semana)
  estado        text not null default 'reservado' check (estado in ('reservado','enviado','erro')),
  tentativas    int not null default 1,
  pedido_por    text not null,                   -- 'robô' ou a pessoa que pediu o teste
  email         text not null,                   -- endereço usado neste envio
  obras         text[] not null default '{}',
  id_externo    text check (length(id_externo) <= 100),   -- id do e-mail no Resend
  erro          text check (length(erro) <= 300),
  em            timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists taf_resumo_envio_1x on public.taf_resumo_envio (dest, quando, dia) where quando <> 'teste';
create index if not exists taf_resumo_envio_dest on public.taf_resumo_envio (dest, id);

create table if not exists public.taf_resumo_robo (
  hash          text primary key check (hash ~ '^[0-9a-f]{64}$'),   -- o mesmo hash da linha em taf_ciclo_chave
  ativo         boolean not null default true,
  criado_por    text not null,
  criado_em     timestamptz not null default now(),
  desativado_em timestamptz
);

-- Destinatário não se apaga (desativa) e toda mudança guarda a versão anterior.
create or replace function public._taf_resumo_dest_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'DESTINATARIO NAO SE APAGA: DESATIVE'; end if;
  insert into public.taf_resumo_dest_hist (dest, dados) values (old.id, to_jsonb(old));
  return new;
end $$;
drop trigger if exists taf_resumo_dest_trg on public.taf_resumo_dest;
create trigger taf_resumo_dest_trg before update or delete on public.taf_resumo_dest
  for each row execute function public._taf_resumo_dest_trg();

-- Acesso: igual às outras taf_* (RLS ligada, sem política, sem grant; só se entra pelas funções).
do $$ declare t text; s text; begin
  foreach t in array array['taf_resumo_dest','taf_resumo_dest_hist','taf_resumo_envio','taf_resumo_robo'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    if t <> 'taf_resumo_robo' then
      s := pg_get_serial_sequence('public.' || t, case when t = 'taf_resumo_dest_hist' then 'hid' else 'id' end);
      if s is not null then execute 'revoke all on sequence ' || s || ' from public, anon, authenticated'; end if;
    end if;
  end loop;
end $$;

-- ===================================================================== apoio (internas)
-- Todas as obras que existem (planejador ou ERP), em ordem.
create or replace function public._taf_resumo_todas() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x order by x), '{}') from (
    select o.obra as x from public.taf_ciclo_obra o union select e.codigo from public.taf_erp_obra e) u $$;

-- A chave (obras do ator; null = todas) cobre estas obras (null = todas)?
create or replace function public._taf_resumo_cobre(p_ator text[], p_obras text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select p_ator is null or coalesce(p_obras, public._taf_resumo_todas()) <@ p_ator $$;

-- f***@dominio: para mostrar na tela de quem não cadastrou.
create or replace function public._taf_resumo_mascara(p_email text) returns text
language sql immutable as $$
  select left(split_part(p_email, '@', 1), 1) || '***@' || split_part(p_email, '@', 2) $$;

-- Quem cadastra: só chave pessoal de Diretoria ou gestor (a do robô é de leitura e também não serve).
create or replace function public._taf_resumo_gestor(p_chave text, out nome text, out papel text, out obras text[])
language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  if p_chave is null or length(p_chave) > 200 then raise exception 'CHAVE INVALIDA'; end if;
  select * into a from public._taf_erp_ator(p_chave, null, null);    -- levanta CHAVE INVALIDA
  if not a.fixo then raise exception 'USE SUA CHAVE PESSOAL'; end if;
  if a.leitura or a.papel not in ('gestao', 'diretoria') then raise exception 'SO DIRETORIA OU GESTOR'; end if;
  nome := a.nome; papel := a.papel; obras := a.obras;
end $$;

-- É a chave do robô? (ativa nas duas tabelas e de leitura)
create or replace function public._taf_resumo_e_robo(p_chave text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select p_chave is not null and length(p_chave) <= 200 and exists (
    select 1 from public.taf_resumo_robo r join public.taf_ciclo_chave c on c.hash = r.hash
     where r.hash = encode(extensions.digest(p_chave, 'sha256'), 'hex') and r.ativo and c.ativo and c.papel = 'leitura') $$;

-- Quem pede prévia ou resumo de obra: chave pessoal (do planejador ou do site). Devolve nome e obras dela.
create or replace function public._taf_resumo_pessoal(p_chave text, out nome text, out papel text, out obras text[], out leitura boolean)
language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  if p_chave is null or length(p_chave) > 200 then raise exception 'CHAVE INVALIDA'; end if;
  select * into a from public._taf_erp_ator(p_chave, null, null);
  if not a.fixo then raise exception 'USE SUA CHAVE PESSOAL'; end if;
  nome := a.nome; papel := a.papel; obras := coalesce(a.obras, public._taf_resumo_todas()); leitura := a.leitura;
end $$;

-- Dias úteis (sem sábado, domingo e feriado; facultativo conta como útil) depois de p_de e antes de p_ate.
create or replace function public._taf_resumo_uteis_entre(p_obra text, p_de date, p_ate date) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from generate_series(p_de + 1, p_ate - 1, interval '1 day') g
   where extract(isodow from g) < 6
     and not exists (select 1 from public.taf_ciclo_feriado h where h.obra in ('*', p_obra)
                                                        and h.data = g::date and h.abrangencia <> 'FACULTATIVO') $$;

-- Uma linha de destinatário para a tela.
create or replace function public._taf_resumo_dest_json(d public.taf_resumo_dest, p_quem text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', d.id, 'nome', d.nome, 'email', d.email, 'obras', to_jsonb(d.obras), 'todas', d.obras is null,
    'frequencia', d.frequencia, 'ativo', d.ativo, 'meu', d.pessoa is not null and d.pessoa = p_quem, 'tem_dono', d.pessoa is not null,
    'cadastrado_por', d.cadastrado_por, 'cadastrado_em', d.cadastrado_em, 'atualizado_por', d.atualizado_por, 'atualizado_em', d.atualizado_em,
    'ultimo', (select jsonb_build_object('quando', e.quando, 'dia', e.dia, 'estado', e.estado, 'em', e.atualizado_em, 'erro', e.erro)
                 from public.taf_resumo_envio e where e.dest = d.id order by e.id desc limit 1)) $$;

-- ===================================================================== o resumo de uma obra
-- Planejador: luzes e frase da Situação do Ciclo, PPC da última semana fechada e da atual, semana publicada ou não,
-- atrasadas (mesmo critério da Situação) e as mais críticas (EVENTOs e marcos em risco), restrições vencidas e as que
-- vencem em 7 dias, dias úteis sem apontamento. ERP: licitado, meta, comprometido e realizado (_taf_erp_valores).
create or replace function public._taf_resumo_obra(p_obra text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_hoje date := public._taf_ciclo_hoje(); v_seg date := public._taf_ciclo_segunda(public._taf_ciclo_hoje());
        v_o public.taf_ciclo_obra; v_e public.taf_erp_obra; v_s public.taf_ciclo_semana;
        v_sit jsonb; v_r jsonb; v_pz jsonb; v_ciclo jsonb; v_erp jsonb; v_ult date; v_ref jsonb;
        v_ni int; v_lic numeric; v_meta numeric; v_comp numeric; v_real numeric; v_noc int; v_nnf int;
begin
  select * into v_o from public.taf_ciclo_obra where obra = p_obra;
  select * into v_e from public.taf_erp_obra where codigo = p_obra;
  if v_o.obra is null and v_e.codigo is null then raise exception 'OBRA INVALIDA'; end if;

  if v_o.obra is not null then
    if not exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra) then
      v_ciclo := jsonb_build_object('cronograma', false);
    else
      begin
        v_sit := public._taf_ciclo_situacao(p_obra, null, 'leitura');
        v_ref := v_sit -> 'semana_ref';
        select * into v_s from public.taf_ciclo_semana s where s.obra = p_obra and s.seg = v_seg;
        v_pz := public._taf_ciclo_prazos(p_obra, v_seg);
        if v_s.seg is not null and v_s.estado <> 'rascunho' then v_r := public._taf_ciclo_resumo(p_obra, v_seg); end if;
        select max(a.dia) into v_ult from public.taf_ciclo_apont a where a.obra = p_obra and a.dia <= v_hoje;
        v_ciclo := jsonb_build_object(
          'cronograma', true,
          'luzes', jsonb_build_object(
             'producao', jsonb_build_object('cor', v_sit #>> '{luzes,producao,cor}', 'motivo', v_sit #>> '{luzes,producao,P2,motivo}'),
             'plano', jsonb_build_object('cor', v_sit #>> '{luzes,plano,cor}', 'motivo', v_sit #>> '{luzes,plano,P6,motivo}',
                                         'semana_seguinte', v_sit #>> '{luzes,plano,P8,motivo}')),
          'frase', v_sit ->> 'frase',
          'ultima_fechada', case when v_ref is not null and jsonb_typeof(v_ref) = 'object' then jsonb_build_object(
             'seg', v_ref -> 'seg', 'ensaio', v_ref -> 'ensaio', 'ppc', v_ref #> '{resumo,ppc}',
             'cumpridos', v_ref #> '{resumo,cumpridos}', 'publicados', v_ref #> '{resumo,publicados}', 'parciais', v_ref #> '{resumo,parciais}') end,
          'semana_atual', jsonb_build_object(
             'seg', v_seg, 'estado', coalesce(v_s.estado, 'sem_plano'), 'status_pub', v_s.status_pub, 'ensaio', v_s.ensaio,
             'propostos', (select count(*) from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cancelado_em is null and not c.extra),
             'publicados', v_r -> 'publicados', 'cumpridos', v_r -> 'cumpridos', 'parciais', v_r -> 'parciais', 'nao', v_r -> 'nao',
             'sem_resultado', v_r -> 'sem_resultado', 'ppc', case when v_s.estado = 'fechada' then v_r -> 'ppc' end,
             'pub_limite', v_pz -> 'pub_limite',
             'fora_do_prazo', coalesce(v_s.estado, 'rascunho') = 'rascunho' and (v_pz ->> 'pub_limite') is not null
                              and public._taf_ciclo_agora() > (v_pz ->> 'pub_limite')::timestamptz),
          'atrasadas', (select jsonb_build_object('total', count(*), 'lista',
                           coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'dias', x.dias)
                                    order by x.dias desc, x.ordem) filter (where x.n <= 5), '[]'::jsonb))
                          from (select y.*, row_number() over (order by y.dias desc, y.ordem) as n from (
                                  select a.id, a.nome, a.ordem,
                                         case when coalesce(a.prev_fim, a.fim_base) < v_hoje then 'termino' else 'inicio' end as tipo,
                                         case when coalesce(a.prev_fim, a.fim_base) < v_hoje then v_hoje - coalesce(a.prev_fim, a.fim_base)
                                              else v_hoje - coalesce(a.prev_ini, a.ini_base) end as dias
                                    from public.taf_ciclo_ativ a
                                   where a.obra = p_obra and a.fim_real is null and a.dur > 0 and a.tipo in ('ativ','continua')
                                     and ((a.ini_real is null and coalesce(a.prev_ini, a.ini_base) < v_hoje)
                                          or coalesce(a.prev_fim, a.fim_base) < v_hoje)) y) x),
          'criticas', jsonb_build_object('total', jsonb_array_length(coalesce(v_sit -> 'eventos_risco', '[]'::jsonb)),
                         'lista', (select coalesce(jsonb_agg(jsonb_build_object('id', e ->> 'id', 'nome', e ->> 'nome', 'ev', e ->> 'ev',
                                            'tipo', e ->> 'tipo', 'data', e ->> 'data', 'nivel', e ->> 'nivel', 'motivo', e #>> '{motivos,0}') order by i), '[]'::jsonb)
                                     from jsonb_array_elements(coalesce(v_sit -> 'eventos_risco', '[]'::jsonb)) with ordinality z(e, i) where i <= 3)),
          'restricoes', (select jsonb_build_object(
                           'vencidas', count(*) filter (where d.ef < v_hoje),
                           'vencem_7', count(*) filter (where d.ef between v_hoje and v_hoje + 7),
                           'ate', v_hoje + 7,
                           'lista_vencidas', coalesce(jsonb_agg(jsonb_build_object('num', d.num, 'oque', d.oque, 'resp', d.resp, 'data', d.ef)
                                               order by d.ef, d.num) filter (where d.ef < v_hoje and d.nv <= 5), '[]'::jsonb),
                           'lista_vencem', coalesce(jsonb_agg(jsonb_build_object('num', d.num, 'oque', d.oque, 'resp', d.resp, 'data', d.ef)
                                               order by d.ef, d.num) filter (where d.ef between v_hoje and v_hoje + 7 and d.nf <= 5), '[]'::jsonb))
                           from (select x.num, x.oque, x.resp, coalesce(x.nova_data, x.prazo) as ef,
                                        row_number() over (partition by coalesce(x.nova_data, x.prazo) < v_hoje order by coalesce(x.nova_data, x.prazo), x.num) as nv,
                                        row_number() over (partition by coalesce(x.nova_data, x.prazo) between v_hoje and v_hoje + 7 order by coalesce(x.nova_data, x.prazo), x.num) as nf
                                   from public.taf_ciclo_demanda x where x.obra = p_obra and x.situacao in ('aberta','respondida')) d),
          'apontamento', jsonb_build_object('ultimo', v_ult,
                           'dias_uteis_sem', case when v_ult is not null then public._taf_resumo_uteis_entre(p_obra, v_ult, v_hoje) end));
      exception when others then
        v_ciclo := jsonb_build_object('cronograma', true, 'erro', 'não consegui calcular o planejador desta obra', 'detalhe', left(sqlerrm, 150));
      end;
    end if;
  end if;

  if v_e.codigo is not null then
    select count(*)::int, sum(x.venda), sum(x.meta), sum(x.comprometido), sum(x.realizado)
      into v_ni, v_lic, v_meta, v_comp, v_real from public._taf_erp_valores(p_obra) x;
    select count(*) filter (where d.tipo = 'oc' and coalesce(d.dados ->> 'status', '') not in ('cancelada', 'reprovada'))::int,
           count(*) filter (where d.tipo = 'nf')::int
      into v_noc, v_nnf from public.taf_erp_doc d where d.obra = p_obra;
    v_erp := jsonb_build_object('itens', v_ni,
      'licitado', case when v_ni > 0 then round(v_lic, 2) end, 'meta', case when v_ni > 0 then round(v_meta, 2) end,
      'comprometido', case when v_ni > 0 then round(v_comp, 2) end, 'realizado', case when v_ni > 0 then round(v_real, 2) end,
      'pedidos', v_noc, 'notas', v_nnf);
  end if;

  return jsonb_build_object('obra', p_obra, 'nome', coalesce(v_o.nome, v_e.nome), 'hoje', v_hoje, 'semana', v_seg,
                            'ciclo', v_ciclo, 'erp', v_erp, 'gerado_em', public._taf_ciclo_agora());
end $$;

-- ===================================================================== entrada: cadastro (Diretoria ou gestor)
create or replace function public.taf_resumo_destinatarios(p_chave text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; v_todas text[] := public._taf_resumo_todas(); v_cobre boolean;
begin
  select * into a from public._taf_resumo_gestor(p_chave);
  v_cobre := public._taf_resumo_cobre(a.obras, null);
  return jsonb_build_object(
    'quem', a.nome, 'papel', a.papel, 'cobre_todas', v_cobre,
    'obras', (select coalesce(jsonb_agg(jsonb_build_object('obra', x, 'nome', coalesce(o.nome, e.nome)) order by x), '[]'::jsonb)
                from unnest(v_todas) x left join public.taf_ciclo_obra o on o.obra = x left join public.taf_erp_obra e on e.codigo = x
               where a.obras is null or x = any(a.obras)),
    'robo', case when v_cobre then (select jsonb_build_object('criado_em', r.criado_em, 'criado_por', r.criado_por)
                                      from public.taf_resumo_robo r where r.ativo order by r.criado_em desc limit 1) end,
    'destinatarios', (select coalesce(jsonb_agg(public._taf_resumo_dest_json(d, a.nome) order by d.ativo desc, lower(d.nome), d.id), '[]'::jsonb)
                        from public.taf_resumo_dest d
                       where v_cobre or (d.obras is not null and d.obras <@ a.obras)));
end $$;

-- p_id null = novo. p_obras: lista JSON de códigos (["342","343"]) ou null = todas. p_meu: este e-mail é de quem está salvando.
create or replace function public.taf_resumo_destinatario_salvar(p_chave text, p_id bigint, p_nome text, p_email text,
                                                                 p_obras jsonb, p_frequencia text, p_meu boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; v_todas text[] := public._taf_resumo_todas(); v_obras text[]; v_x text; v_d public.taf_resumo_dest;
        v_nome text := trim(coalesce(p_nome, '')); v_email text := lower(trim(coalesce(p_email, '')));
begin
  select * into a from public._taf_resumo_gestor(p_chave);
  if length(v_nome) not between 2 and 80 then raise exception 'NOME INVALIDO'; end if;
  if length(v_email) > 200 or v_email !~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' then
    raise exception 'E-MAIL INVALIDO'; end if;
  if coalesce(p_frequencia, '') not in ('diaria', 'semanal') then raise exception 'FREQUENCIA INVALIDA'; end if;
  if p_obras is null or jsonb_typeof(p_obras) = 'null' then
    if not public._taf_resumo_cobre(a.obras, null) then raise exception 'ESCOLHA AS OBRAS: SUA CHAVE NAO TEM TODAS'; end if;
    v_obras := null;
  else
    if jsonb_typeof(p_obras) <> 'array' or jsonb_array_length(p_obras) = 0 then raise exception 'ESCOLHA AS OBRAS'; end if;
    if jsonb_array_length(p_obras) > 50 then raise exception 'OBRAS DEMAIS'; end if;
    for v_x in select jsonb_array_elements_text(p_obras) loop
      if not (v_x = any(v_todas)) then raise exception 'OBRA INVALIDA: %', left(v_x, 10); end if;
      if a.obras is not null and not (v_x = any(a.obras)) then raise exception 'SEM ACESSO A OBRA %', v_x; end if;
    end loop;
    select array_agg(distinct x order by x) into v_obras from jsonb_array_elements_text(p_obras) x;
  end if;
  perform pg_advisory_xact_lock(hashtext('taf_resumo_dest'));
  if p_id is null then
    if (select count(*) from public.taf_resumo_dest where ativo) >= 100 then raise exception 'LIMITE DE 100 DESTINATARIOS'; end if;
    begin
      insert into public.taf_resumo_dest (nome, email, obras, frequencia, pessoa, cadastrado_por)
      values (v_nome, v_email, v_obras, p_frequencia, case when p_meu then a.nome end, a.nome) returning * into v_d;
    exception when unique_violation then raise exception 'ESTE E-MAIL JA RECEBE O RESUMO %', upper(p_frequencia);
    end;
  else
    select * into v_d from public.taf_resumo_dest where id = p_id for update;
    if v_d.id is null then raise exception 'DESTINATARIO NAO EXISTE'; end if;
    if not public._taf_resumo_cobre(a.obras, v_d.obras) then raise exception 'SEM ACESSO A ESTE DESTINATARIO'; end if;
    if not v_d.ativo and (select count(*) from public.taf_resumo_dest where ativo) >= 100 then raise exception 'LIMITE DE 100 DESTINATARIOS'; end if;
    begin
      update public.taf_resumo_dest set nome = v_nome, email = v_email, obras = v_obras, frequencia = p_frequencia, ativo = true,
             pessoa = case when p_meu then a.nome when pessoa = a.nome then null else pessoa end,
             atualizado_por = a.nome, atualizado_em = now()
       where id = p_id returning * into v_d;
    exception when unique_violation then raise exception 'ESTE E-MAIL JA RECEBE O RESUMO %', upper(p_frequencia);
    end;
  end if;
  return public._taf_resumo_dest_json(v_d, a.nome);
end $$;

create or replace function public.taf_resumo_destinatario_desativar(p_chave text, p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; v_d public.taf_resumo_dest;
begin
  select * into a from public._taf_resumo_gestor(p_chave);
  select * into v_d from public.taf_resumo_dest where id = p_id for update;
  if v_d.id is null then raise exception 'DESTINATARIO NAO EXISTE'; end if;
  if not public._taf_resumo_cobre(a.obras, v_d.obras) then raise exception 'SEM ACESSO A ESTE DESTINATARIO'; end if;
  if v_d.ativo then
    update public.taf_resumo_dest set ativo = false, atualizado_por = a.nome, atualizado_em = now() where id = p_id returning * into v_d;
  end if;
  return public._taf_resumo_dest_json(v_d, a.nome);
end $$;

-- Chave do robô: nova chave de leitura sem obra nenhuma; a anterior para de valer. O texto da chave sai só aqui, uma vez.
create or replace function public.taf_resumo_robo_gerar(p_chave text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a record; v_k text; v_h text;
begin
  select * into a from public._taf_resumo_gestor(p_chave);
  if not public._taf_resumo_cobre(a.obras, null) then raise exception 'SO QUEM TEM TODAS AS OBRAS GERA A CHAVE DO ROBO'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_resumo_robo'));
  update public.taf_ciclo_chave set ativo = false where hash in (select r.hash from public.taf_resumo_robo r where r.ativo);
  update public.taf_resumo_robo set ativo = false, desativado_em = now() where ativo;
  v_k := 'robo-' || encode(extensions.gen_random_bytes(24), 'hex');
  v_h := encode(extensions.digest(v_k, 'sha256'), 'hex');
  insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras, ativo)
  values (v_h, 'Robô do resumo do diretor', null, 'leitura', '{}', true);
  insert into public.taf_resumo_robo (hash, criado_por) values (v_h, a.nome);
  return jsonb_build_object('chave', v_k, 'criado_em', now(), 'criado_por', a.nome);
end $$;

-- ===================================================================== entrada: prévia, resumo da obra, envio
-- Prévia: as obras de quem pede (ou as de um destinatário que a pessoa pode ver, cortadas pelas obras da chave).
-- p_enviar: reserva o envio de teste para os e-mails marcados como da pessoa (até 3 e-mails; 5 testes por dia).
create or replace function public.taf_resumo_previa(p_chave text, p_destinatario bigint default null, p_enviar boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; v_d public.taf_resumo_dest; v_obras text[]; v_hoje date := public._taf_ciclo_hoje(); v_m record;
        v_env jsonb := '[]'::jsonb; v_id bigint; v_gestor boolean;
begin
  if public._taf_resumo_e_robo(p_chave) then raise exception 'A CHAVE DO ROBO NAO FAZ PREVIA'; end if;
  select * into a from public._taf_resumo_pessoal(p_chave);
  v_obras := array(select x from unnest(a.obras) x where x = any(public._taf_resumo_todas()) order by x);
  if p_destinatario is not null then
    select * into v_d from public.taf_resumo_dest where id = p_destinatario;
    if v_d.id is null then raise exception 'DESTINATARIO NAO EXISTE'; end if;
    v_gestor := a.papel in ('gestao', 'diretoria') and not a.leitura;
    if not ((v_d.pessoa is not null and v_d.pessoa = a.nome) or (v_gestor and public._taf_resumo_cobre(a.obras, v_d.obras))) then
      raise exception 'SEM ACESSO A ESTE DESTINATARIO'; end if;
    v_obras := array(select x from unnest(v_obras) x where v_d.obras is null or x = any(v_d.obras) order by x);
  end if;
  if p_enviar then
    if not exists (select 1 from public.taf_resumo_dest d where d.ativo and d.pessoa = a.nome) then
      raise exception 'SEU E-MAIL NAO ESTA NA LISTA'; end if;
    perform pg_advisory_xact_lock(hashtext('taf_resumo_teste'), hashtext(a.nome));
    if (select count(*) from public.taf_resumo_envio e where e.quando = 'teste' and e.dia = v_hoje and e.pedido_por = a.nome) >= 5 then
      raise exception 'LIMITE DE 5 ENVIOS DE TESTE POR DIA'; end if;
    for v_m in select * from public.taf_resumo_dest d where d.ativo and d.pessoa = a.nome order by d.id limit 3 loop
      insert into public.taf_resumo_envio (dest, quando, dia, pedido_por, email, obras)
      values (v_m.id, 'teste', v_hoje, a.nome, v_m.email, v_obras) returning id into v_id;
      v_env := v_env || jsonb_build_object('envio', v_id, 'destinatario', v_m.id, 'nome', v_m.nome, 'email', v_m.email);
    end loop;
  end if;
  return jsonb_build_object('hoje', v_hoje, 'quem', a.nome, 'papel', a.papel, 'obras', to_jsonb(v_obras),
    'meus', (select coalesce(jsonb_agg(jsonb_build_object('destinatario', d.id, 'email', public._taf_resumo_mascara(d.email),
                                                           'frequencia', d.frequencia) order by d.id), '[]'::jsonb)
               from public.taf_resumo_dest d where d.ativo and d.pessoa = a.nome),
    'envios', case when p_enviar then v_env end);
end $$;

create or replace function public.taf_resumo_obra(p_chave text, p_obra text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  if not (coalesce(p_obra, '') = any(public._taf_resumo_todas())) then raise exception 'OBRA INVALIDA'; end if;
  if not public._taf_resumo_e_robo(p_chave) then
    select * into a from public._taf_resumo_pessoal(p_chave);
    if not (p_obra = any(a.obras)) then raise exception 'SEM ACESSO A OBRA'; end if;
  end if;
  return public._taf_resumo_obra(p_obra);
end $$;

-- Robô: reserva os envios de hoje (diario) ou da semana (semanal) que ainda não saíram, até p_limite (1 a 50),
-- e devolve, por destinatário, o envio, o nome, o e-mail e as obras dele. Reservado há menos de 10 minutos é de
-- outra execução em andamento e fica de fora; erro é tentado de novo até 3 vezes.
create or replace function public.taf_resumo_montar(p_chave text, p_quando text, p_limite int default 20)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_hoje date := public._taf_ciclo_hoje(); v_dia date; v_freq text; v_lim int := least(greatest(coalesce(p_limite, 20), 1), 50);
        v_todas text[] := public._taf_resumo_todas(); v_d public.taf_resumo_dest; v_e public.taf_resumo_envio; v_obras text[];
        v_env jsonb := '[]'::jsonb; v_n int := 0; v_rest int := 0; v_desist int := 0; v_sem int := 0; v_ja int := 0; v_id bigint;
begin
  if not public._taf_resumo_e_robo(p_chave) then raise exception 'CHAVE DO ROBO INVALIDA'; end if;
  if coalesce(p_quando, '') not in ('diario', 'semanal') then raise exception 'QUANDO INVALIDO'; end if;
  v_dia := case when p_quando = 'semanal' then public._taf_ciclo_segunda(v_hoje) else v_hoje end;
  v_freq := case when p_quando = 'semanal' then 'semanal' else 'diaria' end;
  perform pg_advisory_xact_lock(hashtext('taf_resumo_montar'));
  for v_d in select * from public.taf_resumo_dest d where d.ativo and d.frequencia = v_freq order by d.id loop
    v_obras := case when v_d.obras is null then v_todas else array(select x from unnest(v_d.obras) x where x = any(v_todas) order by x) end;
    if cardinality(v_obras) = 0 then v_sem := v_sem + 1; continue; end if;
    select * into v_e from public.taf_resumo_envio e where e.dest = v_d.id and e.quando = p_quando and e.dia = v_dia;
    if v_e.id is not null then
      if v_e.estado = 'enviado' then v_ja := v_ja + 1; continue; end if;
      if v_e.estado = 'reservado' and v_e.atualizado_em > now() - interval '10 minutes' then v_ja := v_ja + 1; continue; end if;
      if v_e.tentativas >= 3 then v_desist := v_desist + 1; continue; end if;
      if v_n >= v_lim then v_rest := v_rest + 1; continue; end if;
      update public.taf_resumo_envio set estado = 'reservado', tentativas = tentativas + 1, email = v_d.email, obras = v_obras,
             erro = null, atualizado_em = now() where id = v_e.id;
      v_id := v_e.id;
    else
      if v_n >= v_lim then v_rest := v_rest + 1; continue; end if;
      insert into public.taf_resumo_envio (dest, quando, dia, pedido_por, email, obras)
      values (v_d.id, p_quando, v_dia, 'robô', v_d.email, v_obras) returning id into v_id;
    end if;
    v_env := v_env || jsonb_build_object('envio', v_id, 'destinatario', v_d.id, 'nome', v_d.nome, 'email', v_d.email, 'obras', to_jsonb(v_obras));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('hoje', v_hoje, 'dia', v_dia, 'quando', p_quando, 'envios', v_env,
    'restantes', v_rest, 'ja_enviados', v_ja, 'desistidos', v_desist, 'sem_obra', v_sem,
    'obras', (select coalesce(jsonb_agg(distinct o order by o), '[]'::jsonb)
                from jsonb_array_elements(v_env) x, jsonb_array_elements_text(x -> 'obras') o));
end $$;

-- p_envios: [{"envio": 12, "ok": true, "id": "<id do Resend>"}, {"envio": 13, "ok": false, "erro": "Resend respondeu 422"}]
create or replace function public.taf_resumo_registrar(p_chave text, p_envios jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_robo boolean := public._taf_resumo_e_robo(p_chave); v_nome text; x jsonb; v_e public.taf_resumo_envio;
        v_ok int := 0; v_ign int := 0;
begin
  if not v_robo then select p.nome into v_nome from public._taf_resumo_pessoal(p_chave) p; end if;
  if p_envios is null or jsonb_typeof(p_envios) <> 'array' then raise exception 'ENVIOS INVALIDOS'; end if;
  if jsonb_array_length(p_envios) > 100 then raise exception 'ENVIOS DEMAIS'; end if;
  for x in select * from jsonb_array_elements(p_envios) loop
    if jsonb_typeof(x) <> 'object' or coalesce(x ->> 'envio', '') !~ '^\d{1,15}$' then v_ign := v_ign + 1; continue; end if;
    select * into v_e from public.taf_resumo_envio e where e.id = (x ->> 'envio')::bigint for update;
    if v_e.id is null or v_e.estado <> 'reservado'
       or (not v_robo and (v_e.quando <> 'teste' or v_e.pedido_por is distinct from v_nome)) then v_ign := v_ign + 1; continue; end if;
    update public.taf_resumo_envio set
           estado = case when coalesce(x ->> 'ok', '') = 'true' then 'enviado' else 'erro' end,
           id_externo = left(nullif(x ->> 'id', ''), 100),
           erro = case when coalesce(x ->> 'ok', '') = 'true' then null else left(coalesce(nullif(x ->> 'erro', ''), 'não saiu'), 300) end,
           atualizado_em = now()
     where id = v_e.id;
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('gravados', v_ok, 'ignorados', v_ign);
end $$;

-- ===================================================================== permissões
-- Só as 8 funções de entrada ficam chamáveis pela API; as internas (_taf_resumo_*) não (o Supabase dá execute por padrão).
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'taf\_resumo\_%' or p.proname like '\_taf\_resumo\_%') loop
    execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
    if r.proname in ('taf_resumo_destinatarios', 'taf_resumo_destinatario_salvar', 'taf_resumo_destinatario_desativar',
                     'taf_resumo_robo_gerar', 'taf_resumo_previa', 'taf_resumo_obra', 'taf_resumo_montar', 'taf_resumo_registrar') then
      execute 'grant execute on function ' || r.sig || ' to anon, authenticated';
    end if;
  end loop;
end $$;

-- ===================================================================== como desfazer
-- Guarde antes uma cópia da lista, se quiser: select * from public.taf_resumo_dest;
-- Depois, numa transação:
--   update public.taf_ciclo_chave set ativo = false where hash in (select hash from public.taf_resumo_robo);
--   drop function if exists public.taf_resumo_destinatarios(text), public.taf_resumo_destinatario_salvar(text, bigint, text, text, jsonb, text, boolean),
--     public.taf_resumo_destinatario_desativar(text, bigint), public.taf_resumo_robo_gerar(text), public.taf_resumo_previa(text, bigint, boolean),
--     public.taf_resumo_obra(text, text), public.taf_resumo_montar(text, text, int), public.taf_resumo_registrar(text, jsonb),
--     public._taf_resumo_obra(text), public._taf_resumo_dest_json(public.taf_resumo_dest, text), public._taf_resumo_uteis_entre(text, date, date),
--     public._taf_resumo_pessoal(text), public._taf_resumo_e_robo(text), public._taf_resumo_gestor(text), public._taf_resumo_mascara(text),
--     public._taf_resumo_cobre(text[], text[]), public._taf_resumo_todas();
--   drop table if exists public.taf_resumo_envio, public.taf_resumo_dest_hist, public.taf_resumo_robo;
--   drop table if exists public.taf_resumo_dest;   -- leva junto o gatilho
--   drop function if exists public._taf_resumo_dest_trg();
-- A linha da chave do robô em taf_ciclo_chave fica desativada (nada é apagado de taf_ciclo_chave).
-- Na Vercel: tirar os "crons" do public/vercel.json e as variáveis CRON_SECRET, RESEND_API_KEY, RESUMO_REMETENTE, TAF_CHAVE_RESUMO.
