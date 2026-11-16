-- Painel por obra (16/11/2026): /obra343 lê os dados da obra por aqui. O repositório é público,
-- então os números ficam só no banco (tabela taf_painel_obra), nunca no código.
-- Gravação só pelo Claude (service role); leitura aberta, como o resto do site desde 03/11.
create table if not exists public.taf_painel_obra(
  obra text primary key,
  dados jsonb not null default '{}'::jsonb,
  quem text,
  em timestamptz not null default now()
);
alter table public.taf_painel_obra enable row level security;

create or replace function public.taf_painel_ler_aberto(p_obra text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('obra',p.obra,'dados',p.dados,'quem',p.quem,'em',p.em)
                   from public.taf_painel_obra p where p.obra = p_obra), '{}'::jsonb);
$$;
revoke all on function public.taf_painel_ler_aberto(text) from public;
grant execute on function public.taf_painel_ler_aberto(text) to anon, authenticated;

-- reverter: drop function public.taf_painel_ler_aberto(text); drop table public.taf_painel_obra;
