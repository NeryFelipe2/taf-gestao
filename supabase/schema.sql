-- Site TAF: tabelas e funções (já aplicado no Supabase "construdata-platform" em 21/10/2026).
-- Tudo isolado com prefixo taf_. As tabelas ficam fechadas (RLS sem política); o site só entra pelas funções, com a chave de acesso.
create extension if not exists pgcrypto;

create table if not exists public.taf_chave (hash text primary key, nome text, criado_em timestamptz not null default now());
create table if not exists public.taf_snapshot (id bigserial primary key, snap jsonb not null, wa jsonb, fonte text, quem text, criado_em timestamptz not null default now());
create table if not exists public.taf_tarefa_edicao (id text primary key, dados jsonb not null, quem text, atualizado_em timestamptz not null default now());
create table if not exists public.taf_tarefa_hist (id bigserial primary key, tarefa_id text not null, dados jsonb, quem text, em timestamptz not null default now());

alter table public.taf_chave enable row level security;
alter table public.taf_snapshot enable row level security;
alter table public.taf_tarefa_edicao enable row level security;
alter table public.taf_tarefa_hist enable row level security;
revoke all on public.taf_chave, public.taf_snapshot, public.taf_tarefa_edicao, public.taf_tarefa_hist from anon, authenticated;

create or replace function public._taf_ok(p_chave text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists(select 1 from public.taf_chave where hash = encode(extensions.digest(coalesce(p_chave,''),'sha256'),'hex'));
$$;
revoke all on function public._taf_ok(text) from public, anon, authenticated;

create or replace function public.taf_edicoes(p_chave text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._taf_ok(p_chave) then raise exception 'CHAVE INVALIDA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'dados',e.dados,'quem',e.quem,'em',e.atualizado_em) order by e.id) from public.taf_tarefa_edicao e),'[]'::jsonb);
end $$;

create or replace function public.taf_ler(p_chave text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record;
begin
  if not public._taf_ok(p_chave) then raise exception 'CHAVE INVALIDA'; end if;
  select * into s from public.taf_snapshot order by id desc limit 1;
  return jsonb_build_object('snap', s.snap, 'wa', s.wa, 'fonte', s.fonte, 'snap_quem', s.quem, 'snap_em', s.criado_em,
    'edicoes', public.taf_edicoes(p_chave));
end $$;

create or replace function public.taf_tarefa_salvar(p_chave text, p_id text, p_dados jsonb, p_quem text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v timestamptz := now();
begin
  if not public._taf_ok(p_chave) then raise exception 'CHAVE INVALIDA'; end if;
  if p_id is null or p_id !~ '^(R\d{1,4}|N\d{1,15})$' then raise exception 'ID INVALIDO'; end if;
  if p_dados is not null and (jsonb_typeof(p_dados) <> 'object' or length(p_dados::text) > 20000) then raise exception 'DADOS INVALIDOS'; end if;
  if p_dados is null then delete from public.taf_tarefa_edicao where id = p_id;
  else insert into public.taf_tarefa_edicao(id, dados, quem, atualizado_em) values (p_id, p_dados, left(trim(p_quem),80), v)
       on conflict (id) do update set dados = excluded.dados, quem = excluded.quem, atualizado_em = v;
  end if;
  insert into public.taf_tarefa_hist(tarefa_id, dados, quem, em) values (p_id, p_dados, left(trim(p_quem),80), v);
  return v;
end $$;

create or replace function public.taf_snap_salvar(p_chave text, p_snap jsonb, p_fonte text, p_quem text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_wa jsonb;
begin
  if not public._taf_ok(p_chave) then raise exception 'CHAVE INVALIDA'; end if;
  if p_snap is null or jsonb_typeof(p_snap->'restricoes') <> 'array' or length(p_snap::text) > 3000000 then raise exception 'LEITURA INVALIDA'; end if;
  select wa into v_wa from public.taf_snapshot order by id desc limit 1;
  insert into public.taf_snapshot(snap, wa, fonte, quem) values (p_snap, v_wa, left(p_fonte,200), left(trim(p_quem),80)) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.taf_edicoes(text), public.taf_ler(text), public.taf_tarefa_salvar(text,text,jsonb,text), public.taf_snap_salvar(text,jsonb,text,text) from public;
grant execute on function public.taf_edicoes(text), public.taf_ler(text), public.taf_tarefa_salvar(text,text,jsonb,text), public.taf_snap_salvar(text,jsonb,text,text) to anon, authenticated;

-- Nova chave (rode no SQL Editor, troque o texto): 
-- insert into public.taf_chave(hash,nome) values (encode(extensions.digest('NOVA-CHAVE','sha256'),'hex'),'quem');
