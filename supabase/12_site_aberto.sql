-- Site aberto sem chave (03/11/2026, pedido do Felipe: "Tira a chave de tudo por enquanto, quando ficarmos maiores colocamos chave.")
-- Só o site principal (planilha de gestão + tarefas). Continuam com chave: taf_snap_salvar (trocar a planilha de todos),
-- ERP (CPF, ASO, atestado, banco de horas, salário, conta bancária, celular) e planejador/ciclo (permissão por papel).
-- Funções novas, sem mexer nas antigas: para voltar a fechar, rodar o bloco "reverter" do fim.
create or replace function public.taf_edicoes_aberto() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'dados',e.dados,'quem',e.quem,'em',e.atualizado_em) order by e.id) from public.taf_tarefa_edicao e),'[]'::jsonb);
$$;

create or replace function public.taf_ler_aberto() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record;
begin
  select * into s from public.taf_snapshot order by id desc limit 1;
  return jsonb_build_object('snap', s.snap, 'wa', s.wa, 'fonte', s.fonte, 'snap_quem', s.quem, 'snap_em', s.criado_em,
    'edicoes', public.taf_edicoes_aberto());
end $$;

create or replace function public.taf_tarefa_salvar_aberto(p_id text, p_dados jsonb, p_quem text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v timestamptz := now();
begin
  if p_id is null or p_id !~ '^(R\d{1,4}|N\d{1,15})$' then raise exception 'ID INVALIDO'; end if;
  if p_dados is not null and (jsonb_typeof(p_dados) <> 'object' or length(p_dados::text) > 20000) then raise exception 'DADOS INVALIDOS'; end if;
  if p_dados is null then delete from public.taf_tarefa_edicao where id = p_id;
  else insert into public.taf_tarefa_edicao(id, dados, quem, atualizado_em) values (p_id, p_dados, left(trim(coalesce(p_quem,'sem nome')),80), v)
       on conflict (id) do update set dados = excluded.dados, quem = excluded.quem, atualizado_em = v;
  end if;
  insert into public.taf_tarefa_hist(tarefa_id, dados, quem, em) values (p_id, p_dados, left(trim(coalesce(p_quem,'sem nome')),80), v);
  return v;
end $$;

revoke all on function public.taf_edicoes_aberto(), public.taf_ler_aberto(), public.taf_tarefa_salvar_aberto(text,jsonb,text) from public;
grant execute on function public.taf_edicoes_aberto(), public.taf_ler_aberto(), public.taf_tarefa_salvar_aberto(text,jsonb,text) to anon, authenticated;

-- reverter (fecha de novo; o site volta a pedir a chave sozinho):
-- drop function public.taf_tarefa_salvar_aberto(text,jsonb,text); drop function public.taf_ler_aberto(); drop function public.taf_edicoes_aberto();
