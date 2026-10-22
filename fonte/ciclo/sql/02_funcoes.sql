-- Migration taf_ciclo_v1_funcoes (parte A: núcleo de cálculo; nenhuma destas é chamável de fora)

-- Relógio. taf.agora só existe nos testes (o PostgREST não deixa o aparelho mudar configuração).
create or replace function public._taf_ciclo_agora() returns timestamptz
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('taf.agora', true), '')::timestamptz, now()) $$;

create or replace function public._taf_ciclo_hoje() returns date
language sql stable set search_path = public as $$
  select (public._taf_ciclo_agora() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public._taf_ciclo_dm(p date) returns text
language sql immutable as $$ select to_char(p, 'DD/MM') $$;

create or replace function public._taf_ciclo_segunda(p date) returns date
language sql immutable as $$ select p - (extract(isodow from p)::int - 1) $$;

-- Quem está chamando. O papel vem da chave, nunca do aparelho.
create or replace function public._taf_ciclo_ator(p_chave text, p_obra text, p_quem text,
  out nome text, out papel text, out verificado boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_h text := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex');
        v_o public.taf_ciclo_obra; v_c public.taf_ciclo_chave; v_p text;
begin
  select * into v_o from public.taf_ciclo_obra o where o.obra = p_obra;
  if v_o.obra is null then raise exception 'OBRA INVALIDA'; end if;
  select * into v_c from public.taf_ciclo_chave c where c.hash = v_h and c.ativo;
  if v_c.hash is not null then
    if not (p_obra = any(v_c.obras)) then raise exception 'SEM ACESSO A OBRA'; end if;
    nome := coalesce(v_c.pessoa, v_c.nome); papel := v_c.papel; verificado := true; return;
  end if;
  if public._taf_ok(p_chave) then                      -- chave geral: nome declarado, não verificado
    nome := nullif(left(trim(coalesce(p_quem, '')), 60), '');
    papel := case when v_o.chave_geral_escreve then 'gestor' else 'leitura' end;
    verificado := false; return;
  end if;
  v_p := public._taf_pessoa(p_chave, null);            -- chave pessoal do site; levanta CHAVE INVALIDA
  if v_p = v_o.engenheiro then nome := v_p; papel := 'engenheiro'; verificado := true; return; end if;
  raise exception 'SEM ACESSO A OBRA';
end $$;

-- Dia útil do MS Project (cal_mpp) depois de p_data: n = 0 devolve o próprio dia ou o próximo útil.
create or replace function public._taf_ciclo_mais_uteis(p_obra text, p_data date, p_n int) returns date
language sql stable security definer set search_path = public as $$
  select g::date from generate_series(p_data + case when p_n = 0 then 0 else 1 end, p_data + 3 * p_n + 30, interval '1 day') g
   where extract(isodow from g) < 6
     and not exists (select 1 from public.taf_ciclo_feriado h where h.obra in ('*', p_obra) and h.cal_mpp and h.data = g::date)
   order by g offset greatest(p_n, 1) - 1 limit 1 $$;

-- CPM: uma passada em ordem topológica, calendário por tarefa, só empurra.
-- Índices em dias desde ep: início às 8h = d; fim às 17h = d + 1 (fim exclusivo).
-- p_fixos {"T18":{"ini":"2026-10-26","fim":"2026-11-04"}}; p_status projeta o que não aconteceu até essa data;
-- p_disp são ligações suspensas a mais ('T18>T44'), além das dos replanejamentos "só esta" em vigor.
create or replace function public._taf_ciclo_cpm(p_obra text, p_fixos jsonb default '{}', p_status date default null,
                                                  p_disp text[] default '{}')
returns table(id text, s int, f int, ini date, fim date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ep date; v_h constant int := 1100; v_cum int[]; v_wdk int[]; v_hol date[]; v_c int := 0; v_d int; v_dt date;
  v_ids text[]; v_ut boolean[]; v_du int[]; v_m17 int[]; v_fe int[]; v_v0 int[]; v_v1 int[]; v_r0 date[]; v_r1 date[];
  v_pr jsonb[]; v_pos jsonb; v_disp text[]; v_S int[]; v_F int[]; v_n int; v_k int; v_lk jsonb; v_p int; v_x int;
  v_cand int; v_dv int; v_st int; v_fx jsonb; v_ai int; v_bf int; v_lag int; v_ham boolean[]; v_cf int;
begin
  select o.ep into v_ep from public.taf_ciclo_obra o where o.obra = p_obra;
  if v_ep is null then raise exception 'OBRA INVALIDA'; end if;
  select coalesce(array_agg(h.data), '{}') into v_hol from public.taf_ciclo_feriado h where h.obra in ('*', p_obra) and h.cal_mpp;
  -- v_cum[t+1] = dias úteis antes de t; v_wdk[k] = índice do k-ésimo dia útil
  v_cum := array_fill(0, array[v_h + 1]); v_wdk := array_fill(0, array[v_h]);
  for v_d in 0 .. v_h - 1 loop
    v_cum[v_d + 1] := v_c; v_dt := v_ep + v_d;
    if extract(isodow from v_dt) < 6 and not (v_dt = any(v_hol)) then v_c := v_c + 1; v_wdk[v_c] := v_d; end if;
  end loop;
  v_cum[v_h + 1] := v_c;

  select array_agg(a.id order by a.topo), array_agg(a.cal = 'UTEIS' and a.dur > 0 order by a.topo),
         array_agg(a.dur order by a.topo),
         array_agg(case when a.dur = 0 and a.hora_marco = 17 then 1 else 0 end order by a.topo),
         array_agg(case when a.dur > 0 or a.hora_marco = 17 then 1 else 0 end order by a.topo),
         array_agg(coalesce(a.prev_ini - v_ep + case when a.dur = 0 and a.hora_marco = 17 then 1 else 0 end, a.b0) order by a.topo),
         array_agg(coalesce(a.prev_fim - v_ep + case when a.dur > 0 or a.hora_marco = 17 then 1 else 0 end, a.b1) order by a.topo),
         array_agg(a.ini_real order by a.topo), array_agg(a.fim_real order by a.topo), array_agg(a.pred order by a.topo),
         jsonb_object_agg(a.id, a.rn), array_agg(a.tipo in ('continua','evento_pct') order by a.topo)
    into v_ids, v_ut, v_du, v_m17, v_fe, v_v0, v_v1, v_r0, v_r1, v_pr, v_pos, v_ham
    from (select x.*, row_number() over (order by x.topo) as rn from public.taf_ciclo_ativ x where x.obra = p_obra) a;

  select coalesce(array_agg(u.x), '{}') into v_disp
    from public.taf_ciclo_replan r cross join lateral unnest(r.dispensa) as u(x)
   where r.obra = p_obra and r.decisao = 'so_esta'
     and not exists (select 1 from public.taf_ciclo_replan r2 where r2.substitui = r.id);
  v_disp := v_disp || coalesce(p_disp, '{}');

  v_n := coalesce(array_length(v_ids, 1), 0);
  v_S := array_fill(0, array[greatest(v_n, 1)]); v_F := array_fill(0, array[greatest(v_n, 1)]);
  v_st := case when p_status is null then null else p_status - v_ep end;
  for v_k in 1 .. v_n loop
    v_dv := case when v_du[v_k] = 0 then 0
                 when v_ut[v_k] then v_cum[v_v1[v_k] + 1] - v_cum[v_v0[v_k] + 1]
                 else v_v1[v_k] - v_v0[v_k] end;                         -- duração vigente
    v_fx := p_fixos -> v_ids[v_k];
    if v_fx is not null then                                              -- data dada (simulação ou replanejamento)
      v_ai := coalesce((v_fx ->> 'ini')::date - v_ep + v_m17[v_k],
                       case when v_r0[v_k] is not null then v_r0[v_k] - v_ep + v_m17[v_k] end,
                       case when v_du[v_k] = 0 and v_fx ? 'fim' then (v_fx ->> 'fim')::date - v_ep + v_fe[v_k] end,
                       v_v0[v_k]);
      if v_ut[v_k] and v_r0[v_k] is null then v_ai := v_wdk[v_cum[v_ai + 1] + 1]; end if;
      v_bf := case when v_fx ? 'fim' then (v_fx ->> 'fim')::date - v_ep + v_fe[v_k] end;
      if v_du[v_k] = 0 then v_bf := v_ai; end if;
      if v_bf is null then
        v_bf := case when v_dv = 0 then v_ai when v_ut[v_k] then v_wdk[v_cum[v_ai + 1] + v_dv] + 1 else v_ai + v_dv end;
      end if;
      v_S[v_k] := v_ai; v_F[v_k] := greatest(v_bf, v_ai); continue;
    end if;
    if v_r0[v_k] is not null then                                         -- começou: o real manda
      v_S[v_k] := v_r0[v_k] - v_ep + v_m17[v_k];
      if v_r1[v_k] is not null then v_F[v_k] := v_r1[v_k] - v_ep + v_fe[v_k];
      else
        v_F[v_k] := greatest(v_v1[v_k], v_S[v_k] + 1);                    -- mantém o fim vigente
        if v_st is not null then v_F[v_k] := greatest(v_F[v_k], v_st + 2); end if;
      end if;
      continue;
    end if;
    v_cand := null; v_cf := null;                                         -- não começou: lógica
    for v_lk in select jsonb_array_elements(v_pr[v_k]) loop
      if ((v_lk ->> 0) || '>' || v_ids[v_k]) = any(v_disp) then continue; end if;
      v_p := (v_pos ->> (v_lk ->> 0))::int;
      if v_p is null then continue; end if;
      v_lag := (v_lk ->> 2)::int;
      v_x := case v_lk ->> 1 when 'SS' then v_S[v_p] else v_F[v_p] end;
      if v_lag <> 0 then
        v_x := case when v_ut[v_k] then v_wdk[v_cum[v_x + 1] + 1 + v_lag] else v_x + v_lag end;
      end if;
      if v_ham[v_k] and v_lk ->> 1 = 'FF' then                            -- contínua / evento %: o fim acompanha
        v_cf := greatest(v_cf, v_x); continue;
      end if;
      if v_lk ->> 1 = 'FF' then
        v_x := case when v_dv = 0 then v_x when v_ut[v_k] then v_wdk[v_cum[v_x + 1] - v_dv + 1] else v_x - v_dv end;
      end if;
      v_cand := greatest(v_cand, v_x);
    end loop;
    v_x := v_v0[v_k];                                                     -- piso: data vigente
    if v_cand is not null then
      v_x := greatest(v_x, case when v_ut[v_k] then v_wdk[v_cum[v_cand + 1] + 1] else v_cand end);
    end if;
    if v_st is not null then
      v_x := greatest(v_x, case when v_ut[v_k] then v_wdk[v_cum[v_st + 2] + 1] else v_st + 1 + v_m17[v_k] end);
    end if;
    v_S[v_k] := v_x;
    if v_ham[v_k] and v_cf is not null then
      v_F[v_k] := greatest(v_v1[v_k], v_cf, v_x + 1);
    else
      v_F[v_k] := case when v_dv = 0 then v_x when v_ut[v_k] then v_wdk[v_cum[v_x + 1] + v_dv] + 1 else v_x + v_dv end;
    end if;
  end loop;
  for v_k in 1 .. v_n loop
    id := v_ids[v_k]; s := v_S[v_k]; f := v_F[v_k];
    ini := v_ep + v_S[v_k] - v_m17[v_k]; fim := v_ep + v_F[v_k] - v_fe[v_k];
    return next;
  end loop;
end $$;

create or replace function public._taf_ciclo_bm(p_obra text, p_data date) returns text
language sql stable security definer set search_path = public as $$
  select case when o.corte_bm_dia is null or p_data is null then null else
    (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[extract(month from m)::int]
    || '/' || to_char(m, 'YY') end
  from public.taf_ciclo_obra o,
       lateral (select case when extract(day from p_data) <= o.corte_bm_dia then p_data
                            else (date_trunc('month', p_data) + interval '1 month')::date end as m) x
  where o.obra = p_obra $$;

create or replace function public._taf_ciclo_aviso_dia(p_obra text, p_data date, p_tipo text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select public._taf_ciclo_dm(p_data) || ' é ' || h.nome || ' (fora do calendário do MS Project)'
       from public.taf_ciclo_feriado h where h.obra in ('*', p_obra) and h.data = p_data and not h.cal_mpp limit 1),
    case when p_tipo in ('marco','evento') and extract(isodow from p_data) >= 6
         then public._taf_ciclo_dm(p_data) || ' cai em ' || case when extract(isodow from p_data) = 6 then 'sábado' else 'domingo' end end) $$;

-- Sugestão = data vigente gravada de cada atividade x propagação com as datas dadas.
-- Para quem já começou, para as contínuas e para os eventos % só o fim conta; quem já terminou não entra.
create or replace function public._taf_ciclo_sugestao(p_obra text, p_fixos jsonb, p_disp text[] default '{}')
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (select * from public._taf_ciclo_cpm(p_obra, coalesce(p_fixos, '{}'), null, p_disp)),
  j as (select a.id, a.ordem, a.nome, a.tipo, a.evento, a.contratual, a.ini_real, a.fim_real,
               coalesce(a.ini_real, a.prev_ini, a.ini_base) as vi, coalesce(a.prev_fim, a.fim_base) as vf,
               p.ini as pi, p.fim as pf, coalesce(p_fixos, '{}') ? a.id as fixo
          from public.taf_ciclo_ativ a join p on p.id = a.id where a.obra = p_obra),
  m as (select j.*, j.pi - j.vi as d_ini, j.pf - j.vf as d
          from j where not j.fixo and j.fim_real is null
           and (j.pf <> j.vf or (j.ini_real is null and j.tipo not in ('continua','evento_pct') and j.pi <> j.vi))),
  l as (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'id', m.id, 'n', m.nome, 'tipo', m.tipo, 'ev', m.evento, 'contratual', nullif(m.contratual, false),
                 'ini_de', m.vi, 'ini_para', m.pi, 'fim_de', m.vf, 'fim_para', m.pf, 'd_ini', m.d_ini, 'd', m.d,
                 'aviso', public._taf_ciclo_aviso_dia(p_obra, case when m.d_ini <> 0 and m.d = 0 then m.pi else m.pf end, m.tipo),
                 'bm_de', case when m.tipo in ('evento','evento_pct') then public._taf_ciclo_bm(p_obra, m.vf) end,
                 'bm_para', case when m.tipo in ('evento','evento_pct') then public._taf_ciclo_bm(p_obra, m.pf) end))
               order by m.pf, m.ordem), '[]'::jsonb) as lista,
               count(*) as n,
               count(*) filter (where m.tipo in ('evento','evento_pct')) as eventos,
               count(*) filter (where m.tipo = 'marco') as marcos,
               count(*) filter (where m.contratual) as contratuais,
               count(*) filter (where m.tipo in ('evento','evento_pct')
                                  and public._taf_ciclo_bm(p_obra, m.vf) is distinct from public._taf_ciclo_bm(p_obra, m.pf)) as bm_muda
          from m),
  pd as (select coalesce(jsonb_object_agg(x.d::text, x.k), '{}'::jsonb) as por_d
           from (select m.d, count(*) as k from m group by m.d) x),
  pr as (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'n', j.nome, 'ini_de', j.vi, 'ini_para', j.pi,
                                                      'fim_de', j.vf, 'fim_para', j.pf, 'd', j.pf - j.vf)), '[]'::jsonb) as proprio
           from j where j.fixo),
  fo as (select max(j.pf) - max(coalesce(j.fim_real, j.vf)) as fim_obra, max(j.pf) as fim_obra_data from j)
  select jsonb_build_object(
    'proprio', pr.proprio, 'lista', l.lista,
    'resumo', jsonb_build_object('n', l.n, 'eventos', l.eventos, 'marcos', l.marcos, 'contratuais', l.contratuais,
                                 'por_d', pd.por_d, 'fim_obra', fo.fim_obra, 'fim_obra_data', fo.fim_obra_data,
                                 'mexe_evento', (l.eventos + l.contratuais) > 0 or fo.fim_obra > 0, 'bm_muda', l.bm_muda),
    'assinatura', md5(pr.proprio::text || l.lista::text),
    'calculado_em', public._taf_ciclo_agora())
  from l, pd, pr, fo $$;

-- Quanto o término de uma atividade pode atrasar: sem mexer em nenhuma outra (livre) e sem mexer em evento,
-- marco contratual nem no fim da obra (ate_alvo). Busca binária de 0 a 120 dias.
create or replace function public._taf_ciclo_folga(p_obra text, p_ativ text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_a public.taf_ciclo_ativ; v_vf date; v_base jsonb; v_lo int; v_hi int; v_mid int; v_l jsonb; v_s jsonb;
        v_livre int; v_alvo int; v_prim text; v_modo int;
begin
  select * into v_a from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = p_ativ;
  if v_a.id is null then raise exception 'ATIVIDADE NAO EXISTE: %', p_ativ; end if;
  if v_a.fim_real is not null then return jsonb_build_object('ativ', p_ativ, 'terminou', v_a.fim_real); end if;
  v_vf := coalesce(v_a.prev_fim, v_a.fim_base);
  select coalesce(jsonb_agg(e order by e->>'id'), '[]') into v_base
    from jsonb_array_elements(public._taf_ciclo_sugestao(p_obra, '{}') -> 'lista') e where e->>'id' <> p_ativ;
  for v_modo in 1 .. 2 loop
    v_lo := 0; v_hi := 121;
    while v_hi - v_lo > 1 loop
      v_mid := (v_lo + v_hi) / 2;
      v_s := public._taf_ciclo_sugestao(p_obra, jsonb_build_object(p_ativ, jsonb_build_object('fim', v_vf + v_mid)));
      select coalesce(jsonb_agg(e order by e->>'id'), '[]') into v_l from jsonb_array_elements(v_s -> 'lista') e
       where v_modo = 1 or e->>'tipo' in ('evento','evento_pct') or (e->>'contratual')::boolean;
      if v_l = (case when v_modo = 1 then v_base else
                (select coalesce(jsonb_agg(e order by e->>'id'), '[]') from jsonb_array_elements(v_base) e
                  where e->>'tipo' in ('evento','evento_pct') or (e->>'contratual')::boolean) end)
         and (v_modo = 1 or coalesce((v_s -> 'resumo' ->> 'fim_obra')::int, 0) <= 0) then
        v_lo := v_mid;
      else v_hi := v_mid; end if;
    end loop;
    if v_modo = 1 then v_livre := v_lo; else v_alvo := v_lo; end if;
  end loop;
  v_s := public._taf_ciclo_sugestao(p_obra, jsonb_build_object(p_ativ, jsonb_build_object('fim', v_vf + v_livre + 1)));
  select e->>'id' into v_prim from jsonb_array_elements(v_s -> 'lista') e
   where not (v_base @> jsonb_build_array(e)) order by (e->>'fim_para')::date limit 1;
  return jsonb_build_object('ativ', p_ativ, 'fim', v_vf, 'livre', v_livre, 'ate_alvo', v_alvo,
                            'primeira_afetada', v_prim, 'limite', 120);
end $$;

-- Liberação de uma atividade para a semana p_seg: 5 itens de preparo + serviço anterior + demandas.
create or replace function public._taf_ciclo_liberada(p_obra text, p_ativ text, p_seg date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_a public.taf_ciclo_ativ; v_p public.taf_ciclo_ativ; v_pr public.taf_ciclo_preparo; v_dm public.taf_ciclo_demanda;
        v_falta text[] := '{}'; v_aviso text[] := '{}'; v_it text; v_rot text; v_lk jsonb; v_lib date; v_disp text[];
        v_vista int[] := '{}'; v_fim date := p_seg + 6; v_em_sem boolean; v_lag int;
begin
  select * into v_a from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = p_ativ;
  if v_a.id is null then raise exception 'ATIVIDADE NAO EXISTE: %', p_ativ; end if;
  if v_a.fim_real is not null then
    return jsonb_build_object('liberada', true, 'falta', '[]'::jsonb,
                              'aviso', jsonb_build_array('Já terminou em ' || public._taf_ciclo_dm(v_a.fim_real)));
  end if;
  select coalesce(array_agg(u.x), '{}') into v_disp
    from public.taf_ciclo_replan r cross join lateral unnest(r.dispensa) as u(x)
   where r.obra = p_obra and r.decisao = 'so_esta'
     and not exists (select 1 from public.taf_ciclo_replan r2 where r2.substitui = r.id);
  if v_a.ini_real is null and v_a.tipo = 'ativ' then
    foreach v_it in array array['material','equipe','equipamento','projeto','liberacao'] loop
      v_rot := case v_it when 'material' then 'Material' when 'equipe' then 'Equipe' when 'equipamento' then 'Equipamento'
                         when 'projeto' then 'Projeto' else 'Liberação da frente' end;
      select * into v_pr from public.taf_ciclo_preparo x where x.obra = p_obra and x.ativ = p_ativ and x.item = v_it;
      if v_pr.item is null then
        v_falta := v_falta || (v_rot || ': não conferido');
      elsif v_pr.estado = 'pendente' then
        select * into v_dm from public.taf_ciclo_demanda x where x.obra = p_obra and x.num = v_pr.demanda;
        v_vista := v_vista || v_dm.num;
        if v_dm.situacao in ('aberta','respondida') then
          v_falta := v_falta || format('%s: D%s %s (%s, precisa até %s)', v_rot, v_dm.num, v_dm.oque, v_dm.resp,
                                       public._taf_ciclo_dm(coalesce(v_dm.nova_data, v_dm.prazo)));
        else
          v_aviso := v_aviso || format('%s: D%s %s; confira', v_rot, v_dm.num, v_dm.situacao);
        end if;
      end if;
    end loop;
    for v_lk in select jsonb_array_elements(v_a.pred) loop
      if ((v_lk ->> 0) || '>' || p_ativ) = any(v_disp) then
        v_aviso := v_aviso || format('Ligação %s>%s suspensa por replanejamento', v_lk ->> 0, p_ativ); continue;
      end if;
      select * into v_p from public.taf_ciclo_ativ x where x.obra = p_obra and x.id = v_lk ->> 0;
      if v_p.id is null then continue; end if;
      v_lag := (v_lk ->> 2)::int;
      v_em_sem := exists (select 1 from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = p_seg
                                                                and c.ativ = v_p.id and c.cancelado_em is null);
      if v_p.dur = 0 then
        if v_p.fim_real is null then v_falta := v_falta || format('Marco %s sem data real: %s', v_p.id, v_p.nome); end if;
      elsif v_lk ->> 1 = 'FF' then
        if v_p.fim_real is null then v_aviso := v_aviso || format('Termina junto com %s %s', v_p.id, v_p.nome); end if;
      elsif v_lk ->> 1 = 'FS' then
        if v_p.fim_real is null then
          if v_em_sem then v_aviso := v_aviso || format('Encadeada na semana: %s %s termina antes', v_p.id, v_p.nome);
          else v_falta := v_falta || format('Serviço anterior: %s %s não terminou', v_p.id, v_p.nome); end if;
        elsif v_lag > 0 then
          v_lib := case when v_a.cal = 'UTEIS' then public._taf_ciclo_mais_uteis(p_obra, v_p.fim_real, v_lag + 1)
                        else v_p.fim_real + 1 + v_lag end;
          if v_lib > v_fim then
            v_falta := v_falta || format('Espera de %s dias depois de %s (terminou %s): libera em %s',
                                         v_lag, v_p.id, public._taf_ciclo_dm(v_p.fim_real), public._taf_ciclo_dm(v_lib));
          elsif v_lib > p_seg then v_aviso := v_aviso || format('Libera em %s (espera depois de %s)', public._taf_ciclo_dm(v_lib), v_p.id);
          end if;
        end if;
      else  -- SS
        if v_p.ini_real is null then
          if v_em_sem then v_aviso := v_aviso || format('Encadeada na semana: %s %s começa antes%s', v_p.id, v_p.nome,
                                                      case when v_lag > 0 then format(' (espera de %s dias depois do início)', v_lag) else '' end);
          else v_falta := v_falta || format('Serviço anterior: %s %s não começou', v_p.id, v_p.nome); end if;
        elsif v_lag > 0 then
          v_lib := case when v_a.cal = 'UTEIS' then public._taf_ciclo_mais_uteis(p_obra, v_p.ini_real, v_lag)
                        else v_p.ini_real + v_lag end;
          if v_lib > v_fim then
            v_falta := v_falta || format('Espera de %s dias depois do início de %s (%s): libera em %s',
                                         v_lag, v_p.id, public._taf_ciclo_dm(v_p.ini_real), public._taf_ciclo_dm(v_lib));
          elsif v_lib > p_seg then v_aviso := v_aviso || format('Libera em %s (espera depois do início de %s)', public._taf_ciclo_dm(v_lib), v_p.id);
          end if;
        end if;
      end if;
    end loop;
  end if;
  for v_dm in select * from public.taf_ciclo_demanda x where x.obra = p_obra and p_ativ = any(x.ativs)
                 and x.situacao in ('aberta','respondida') and not (x.num = any(v_vista)) order by x.num loop
    v_falta := v_falta || format('D%s %s: %s (%s, precisa até %s)', v_dm.num, v_dm.area, v_dm.oque, v_dm.resp,
                                 public._taf_ciclo_dm(coalesce(v_dm.nova_data, v_dm.prazo)));
  end loop;
  return jsonb_build_object('liberada', cardinality(v_falta) = 0, 'falta', to_jsonb(v_falta), 'aviso', to_jsonb(v_aviso));
end $$;

-- Janela de preparação (6 semanas; as 3 primeiras obrigatórias)
create or replace function public._taf_ciclo_janela(p_obra text, p_seg date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_o public.taf_ciclo_obra; v_ate date; v_hoje date := public._taf_ciclo_hoje(); v_r record; v_ativs jsonb := '[]';
        v_sem int; v_lib jsonb; v_marcos jsonb;
begin
  select * into v_o from public.taf_ciclo_obra o where o.obra = p_obra;
  v_ate := p_seg + 7 * v_o.janela_semanas - 1;
  for v_r in select a.*, coalesce(a.prev_ini, a.ini_base) as vi, coalesce(a.prev_fim, a.fim_base) as vf
               from public.taf_ciclo_ativ a
              where a.obra = p_obra and a.tipo in ('ativ','continua') and a.fim_real is null
                and coalesce(a.ini_real, a.prev_ini, a.ini_base) <= v_ate
              order by coalesce(a.ini_real, a.prev_ini, a.ini_base), a.ordem loop
    v_sem := greatest(1, (greatest(v_r.vi, p_seg) - p_seg) / 7 + 1);
    v_lib := public._taf_ciclo_liberada(p_obra, v_r.id, p_seg + 7 * (v_sem - 1));
    v_ativs := v_ativs || jsonb_strip_nulls(jsonb_build_object(
      'id', v_r.id, 'nome', v_r.nome, 'fase', v_r.fase, 'tipo', v_r.tipo, 'cal', v_r.cal, 'ini', v_r.vi, 'fim', v_r.vf,
      'ini_real', v_r.ini_real, 'semana', v_sem, 'obrig', v_sem <= v_o.janela_obrig,
      'vencida', v_r.vf < v_hoje, 'atrasada', v_r.ini_real is null and v_r.vi < v_hoje,
      'liberada', v_lib -> 'liberada', 'falta', v_lib -> 'falta', 'aviso', nullif(v_lib -> 'aviso', '[]'::jsonb),
      'preparo', (select jsonb_object_agg(x.item, jsonb_strip_nulls(jsonb_build_object('estado', x.estado, 'demanda', x.demanda,
                                          'lote', nullif(x.lote, false), 'em', x.em, 'quem', x.quem)))
                    from public.taf_ciclo_preparo x where x.obra = p_obra and x.ativ = v_r.id)));
  end loop;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', a.id, 'nome', a.nome, 'tipo', a.tipo, 'ev', a.evento,
           'contratual', nullif(a.contratual, false), 'data', coalesce(a.prev_fim, a.fim_base), 'base', a.fim_base,
           'vencido', coalesce(a.prev_fim, a.fim_base) < v_hoje, 'bm', public._taf_ciclo_bm(p_obra, coalesce(a.prev_fim, a.fim_base))))
           order by coalesce(a.prev_fim, a.fim_base), a.ordem), '[]')
    into v_marcos
    from public.taf_ciclo_ativ a
   where a.obra = p_obra and a.tipo in ('marco','evento') and a.fim_real is null and coalesce(a.prev_fim, a.fim_base) <= v_ate;
  return jsonb_build_object('seg', p_seg, 'ate', v_ate, 'semanas', v_o.janela_semanas, 'obrig', v_o.janela_obrig,
                            'ativs', v_ativs, 'marcos', v_marcos, 'gerado_em', public._taf_ciclo_agora());
end $$;

-- Programação da semana: atividades que o cronograma vigente põe na semana (ou que já deviam ter terminado)
-- e se cada uma está num compromisso ou tem justificativa. COMPLETA / INCOMPLETA (até 3) / MUITO INCOMPLETA (4+).
create or replace function public._taf_ciclo_programacao(p_obra text, p_seg date) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select x.id, x.nome, x.ordem, coalesce(x.ini_real, x.prev_ini, x.ini_base) as vi, coalesce(x.prev_fim, x.fim_base) as vf
               from public.taf_ciclo_ativ x
              where x.obra = p_obra and x.tipo = 'ativ' and x.fim_real is null
                and coalesce(x.ini_real, x.prev_ini, x.ini_base) <= p_seg + 6),
  l as (select a.*, (select array_agg(c.cid order by c.cid) from public.taf_ciclo_comp c
                      where c.obra = p_obra and c.seg = p_seg and c.ativ = a.id and c.cancelado_em is null) as cids,
               f.motivo, f.txt
          from a left join public.taf_ciclo_fora f on f.obra = p_obra and f.seg = p_seg and f.ativ = a.id)
  select jsonb_build_object(
    'ativs', coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', l.id, 'nome', l.nome, 'ini', l.vi, 'fim', l.vf,
               'cids', to_jsonb(l.cids), 'fora', l.motivo, 'fora_txt', l.txt)) order by l.vi, l.ordem), '[]'),
    'total', count(*),
    'sem_justificativa', count(*) filter (where l.cids is null and l.motivo is null),
    'cobertura', case when count(*) filter (where l.cids is null and l.motivo is null) = 0 then 'COMPLETA'
                      when count(*) filter (where l.cids is null and l.motivo is null) <= 3 then 'INCOMPLETA'
                      else 'MUITO INCOMPLETA' end)
  from l $$;

-- Prazos da semana (dias úteis de verdade: sem sábado, domingo e feriado; facultativo conta como útil)
create or replace function public._taf_ciclo_prazos(p_obra text, p_seg date) returns jsonb
language sql stable security definer set search_path = public as $$
  with o as (select * from public.taf_ciclo_obra where obra = p_obra),
  u as (select array_agg(g::date order by g) as u from generate_series(p_seg, p_seg + 6, interval '1 day') g
         where extract(isodow from g) < 6
           and not exists (select 1 from public.taf_ciclo_feriado h where h.obra in ('*', p_obra)
                                                             and h.data = g::date and h.abrangencia <> 'FACULTATIVO'))
  select jsonb_build_object('uteis', to_jsonb(u.u), 'u1', u.u[1], 'u2', coalesce(u.u[2], u.u[1]), 'ult', u.u[cardinality(u.u)],
    'pub_no_prazo', (u.u[1] + make_time(o.pub_no_prazo_h, 0, 0)) at time zone 'America/Sao_Paulo',
    'pub_limite', (coalesce(u.u[2], u.u[1]) + make_time(o.pub_limite_h, 0, 0)) at time zone 'America/Sao_Paulo',
    'fecha_de', (u.u[cardinality(u.u)] + make_time(o.fecha_de_h, 0, 0)) at time zone 'America/Sao_Paulo')
  from o, u $$;

-- Placar da semana. PPC = cumpridos ÷ publicados; parcial conta zero; cancelado fica no denominador; extra fora.
-- Quantidade (P4): média, por compromisso com quantidade, de feito ÷ prometido (cada um limitado a 100%),
-- porque m², m³ e un não se somam. O total por unidade vai em qtd_por_un.
create or replace function public._taf_ciclo_resumo(p_obra text, p_seg date) returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (select x.*, (select sum(ap.qtd) from public.taf_ciclo_apont ap
                            where ap.obra = x.obra and ap.seg = x.seg and ap.cid = x.cid) as qtd_apont
               from public.taf_ciclo_comp x where x.obra = p_obra and x.seg = p_seg),
  p as (select * from c where c.publicado is not null),
  k as (select count(*) as pub, count(*) filter (where p.resultado = 'cumprido') as cumpr from p),
  qi as (select p.publicado ->> 'un' as un, (p.publicado ->> 'qtd')::numeric as prom,
                case when p.resultado = 'cumprido' then greatest((p.publicado ->> 'qtd')::numeric, coalesce(p.feito_qtd, p.qtd_apont, 0))
                     when p.resultado = 'parcial' and p.feito_qtd is null and p.qtd_apont is null and p.feito_pct is not null
                          then (p.publicado ->> 'qtd')::numeric * p.feito_pct / 100
                     else coalesce(p.feito_qtd, p.qtd_apont, 0) end as feito
           from p where p.publicado ->> 'qtd' is not null),
  q as (select count(*) as n, round(100 * avg(least(qi.feito / qi.prom, 1))) as pct,
               (select jsonb_object_agg(z.un, jsonb_build_object('prometida', z.pr, 'realizada', z.fe))
                  from (select qi.un, sum(qi.prom) as pr, sum(qi.feito) as fe from qi group by qi.un) z) as por_un
          from qi),
  ap as (select count(distinct a.dia) as dias, count(*) filter (where a.tardio) as tardios
           from public.taf_ciclo_apont a where a.obra = p_obra and a.seg = p_seg),
  apo as (select count(distinct a.dia) as dias from public.taf_ciclo_apont a where a.obra = p_obra and a.dia <= p_seg + 4),
  s as (select * from public.taf_ciclo_semana where obra = p_obra and seg = p_seg)
  select jsonb_build_object(
    'seg', p_seg, 'estado', (select s.estado from s), 'status_pub', (select s.status_pub from s), 'cobertura', (select s.cobertura from s),
    'ensaio', (select s.ensaio from s),
    'publicados', k.pub, 'cumpridos', k.cumpr,
    'parciais', (select count(*) from p where p.resultado = 'parcial'),
    'nao', (select count(*) from p where p.resultado = 'nao' and p.cancelado_em is null),
    'cancelados', (select count(*) from p where p.cancelado_em is not null),
    'sem_resultado', (select count(*) from p where p.resultado is null),
    'extras', (select count(*) from c where c.extra), 'extras_cumpridos', (select count(*) from c where c.extra and c.resultado = 'cumprido'),
    'saldos', (select count(*) from p where p.origem = 'saldo'),
    'com_restricao', (select count(*) from p where p.com_restricao),
    'com_restricao_cumpridos', (select count(*) from p where p.com_restricao and p.resultado = 'cumprido'),
    'ppc', case when k.pub > 0 then round(100.0 * k.cumpr / k.pub) end,
    'por_causa', (select coalesce(jsonb_object_agg(x.causa, x.n), '{}') from
                   (select p.causa, count(*) as n from p where p.resultado in ('parcial','nao') group by p.causa) x),
    -- "veio de compromisso com restrição": a mesma contagem só dos assumidos com restrição
    'por_causa_restricao', (select coalesce(jsonb_object_agg(x.causa, x.n), '{}') from
                   (select p.causa, count(*) as n from p where p.resultado in ('parcial','nao') and p.com_restricao group by p.causa) x),
    'paradas_por_causa', (select coalesce(jsonb_object_agg(x.causa, x.n), '{}') from
                   (select a.causa, count(*) as n from public.taf_ciclo_apont a
                     where a.obra = p_obra and a.seg = p_seg and a.situacao = 'parado' group by a.causa) x),
    'por_resp', (select coalesce(jsonb_object_agg(x.r, jsonb_build_object('pub', x.n, 'cumpr', x.m)), '{}') from
                   (select p.publicado ->> 'resp' as r, count(*) as n, count(*) filter (where p.resultado = 'cumprido') as m
                      from p group by 1) x),
    -- cumprido sem nenhum "andou" ou "entregue" no apontamento
    'sem_lastro', (select coalesce(jsonb_agg(p.cid order by substr(p.cid, 2)::int), '[]') from p
                    where p.resultado = 'cumprido' and not exists (select 1 from public.taf_ciclo_apont a
                      where a.obra = p.obra and a.seg = p.seg and a.cid = p.cid and a.situacao in ('andou','entregue'))),
    -- atividade com parcial ou não cumprido nesta semana e na anterior
    'reincidentes', (select coalesce(jsonb_agg(distinct p.ativ), '[]') from p
                      where p.ativ is not null and p.resultado in ('parcial','nao')
                        and exists (select 1 from public.taf_ciclo_comp y where y.obra = p.obra and y.seg = p.seg - 7
                                                                          and y.ativ = p.ativ and y.resultado in ('parcial','nao'))),
    -- liberação na fotografia da publicação: no cronograma x prontas x comprometidas
    'liberacao', (select case when s.janela is null then null else jsonb_build_object(
                     'no_cronograma', jsonb_array_length(s.janela -> 'programacao' -> 'ativs'),
                     'prontas', (select count(*) from jsonb_array_elements(s.janela -> 'programacao' -> 'ativs') g
                                  where exists (select 1 from jsonb_array_elements(s.janela -> 'ativs') w
                                                 where w ->> 'id' = g ->> 'id' and (w ->> 'liberada')::boolean)),
                     'comprometidas', (select count(*) from jsonb_array_elements(s.janela -> 'programacao' -> 'ativs') g
                                        where g ? 'cids')) end from s),
    'qtd_n', q.n, 'qtd_pct', q.pct, 'qtd_por_un', q.por_un,
    'dias_apontados', ap.dias, 'tardios', ap.tardios, 'dias_apontados_obra', apo.dias,
    'dias_uteis', jsonb_array_length(coalesce(public._taf_ciclo_prazos(p_obra, p_seg) -> 'uteis', '[]')))
  from k, q, ap, apo $$;

-- Resumo curto de uma sugestão (para demanda e cobrança)
create or replace function public._taf_ciclo_sug_curta(p_s jsonb) returns jsonb
language sql immutable as $$
  select case when p_s is null then null else jsonb_build_object(
    'n', p_s -> 'resumo' -> 'n', 'fim_obra', p_s -> 'resumo' -> 'fim_obra', 'bm_muda', p_s -> 'resumo' -> 'bm_muda',
    'eventos', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e->'id', 'ev', e->'ev', 'n', e->'n',
                 'de', e->'fim_de', 'para', e->'fim_para', 'd', e->'d', 'bm_de', e->'bm_de', 'bm_para', e->'bm_para')))
               from jsonb_array_elements(p_s -> 'lista') e
              where e->>'tipo' in ('evento','evento_pct') or (e->>'contratual')::boolean), '[]')) end $$;

-- Impacto de uma demanda: se resolver no prazo efetivo, se atrasar 7 dias, e o cenário anotado.
create or replace function public._taf_ciclo_impacto(p_obra text, p_num int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_dm public.taf_ciclo_demanda; v_ef date; v_fx jsonb := '{}'; v_fx7 jsonb := '{}'; v_r record; v_itens jsonb := '[]';
        v_precisa date; v_cen jsonb;
begin
  select * into v_dm from public.taf_ciclo_demanda d where d.obra = p_obra and d.num = p_num;
  if v_dm.num is null then raise exception 'DEMANDA NAO EXISTE: D%', p_num; end if;
  v_ef := coalesce(v_dm.nova_data, v_dm.prazo);
  for v_r in select a.id, a.nome, coalesce(a.prev_ini, a.ini_base) as vi from public.taf_ciclo_ativ a
              where a.obra = p_obra and a.id = any(v_dm.ativs) and a.ini_real is null and a.fim_real is null order by 3 loop
    v_precisa := least(v_precisa, v_r.vi - 1);
    if v_ef + 1 > v_r.vi then v_fx := v_fx || jsonb_build_object(v_r.id, jsonb_build_object('ini', v_ef + 1)); end if;
    if v_ef + 8 > v_r.vi then v_fx7 := v_fx7 || jsonb_build_object(v_r.id, jsonb_build_object('ini', v_ef + 8)); end if;
    v_itens := v_itens || jsonb_build_object('ativ', v_r.id, 'nome', v_r.nome, 'ini_vig', v_r.vi,
                                             'ini_se_resolver', greatest(v_r.vi, v_ef + 1), 'd', greatest(0, v_ef + 1 - v_r.vi));
  end loop;
  if v_dm.cenario ? 'ativ' then
    v_cen := jsonb_build_object('fonte', v_dm.cenario -> 'fonte', 'ativ', v_dm.cenario -> 'ativ', 'ini', v_dm.cenario -> 'ini',
               'fim', v_dm.cenario -> 'fim',
               'efeito', public._taf_ciclo_sug_curta(public._taf_ciclo_sugestao(p_obra,
                           jsonb_build_object(v_dm.cenario ->> 'ativ', v_dm.cenario - 'ativ' - 'fonte'))));
  end if;
  return jsonb_strip_nulls(jsonb_build_object('calculado_em', public._taf_ciclo_agora(), 'efetivo', v_ef,
    'precisa_ate', v_precisa, 'itens', v_itens,
    'no_prazo', case when v_fx <> '{}' then public._taf_ciclo_sug_curta(public._taf_ciclo_sugestao(p_obra, v_fx)) end,
    'mais_7', case when v_fx7 <> '{}' then public._taf_ciclo_sug_curta(public._taf_ciclo_sugestao(p_obra, v_fx7)) end,
    'cenario', v_cen));
end $$;

-- Migration taf_ciclo_v1_funcoes (parte B: ações de escrita; só taf_ciclo_salvar chama estas)

create or replace function public._taf_ciclo_quem() returns text
language sql stable as $$ select current_setting('taf.quem', true) $$;

-- Concorrência otimista: recusa se OUTRA pessoa gravou depois da leitura (a própria fila do aparelho não conflita consigo).
create or replace function public._taf_ciclo_em_lido(p_em timestamptz, p_quem text, p_d jsonb) returns void
language plpgsql stable as $$
begin
  if p_d ? 'em_lido' and p_em is not null and p_em > (p_d ->> 'em_lido')::timestamptz
     and p_quem is distinct from public._taf_ciclo_quem() then
    raise exception 'MUDOU DEPOIS: % ALTEROU EM %. RECARREGUE E CONFIRA', p_quem,
      to_char(p_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
  end if;
end $$;

create or replace function public._taf_ciclo_pode(p_papel text, p_acao text) returns boolean
language sql immutable as $$
  select case p_papel
    -- "O Felipe nunca escreve o plano semanal" [FLUXO L73]: gestor decide, cobra, dá de acordo e reabre
    when 'gestor' then p_acao = any(array['demanda','demanda_resp','cobrar','impacto','acordo','reabrir'])
    when 'engenheiro' then p_acao = any(array['preparo','preparo_ok','comp','comp_tirar','comp_cancelar','fora','publicar',
      'apont','apont_lote','apont_apagar','real','fechar_item','fechar_semana','replan','efeito','saldo',
      'demanda','demanda_resp','cobrar','impacto'])
    when 'diretoria' then p_acao = any(array['demanda','demanda_resp','cobrar','impacto','acordo'])
    else false end $$;

create or replace function public._taf_ciclo_semana_abrir(p_obra text, p_seg date) returns public.taf_ciclo_semana
language plpgsql security definer set search_path = public as $$
declare v_s public.taf_ciclo_semana;
begin
  if p_seg is null or extract(isodow from p_seg) <> 1 then raise exception 'SEMANA PELA SEGUNDA-FEIRA: %', p_seg; end if;
  insert into public.taf_ciclo_semana (obra, seg) values (p_obra, p_seg) on conflict do nothing;
  select * into v_s from public.taf_ciclo_semana where obra = p_obra and seg = p_seg for update;
  return v_s;
end $$;

-- Cria demanda. Prazo no passado só com nova data (hoje ou depois) e referência de onde foi combinado.
create or replace function public._taf_ciclo_demanda_criar(p_obra text, p_d jsonb, p_origem text, p_oref text) returns int
language plpgsql security definer set search_path = public as $$
declare v_ar public.taf_ciclo_area; v_resp text; v_prazo date := (p_d ->> 'prazo')::date; v_nova date := (p_d ->> 'nova_data')::date;
        v_num int; v_ativs text[]; v_hoje date := public._taf_ciclo_hoje(); v_x text;
begin
  select * into v_ar from public.taf_ciclo_area a where a.obra = p_obra and a.area = upper(coalesce(p_d ->> 'area', ''));
  if v_ar.area is null then raise exception 'AREA INVALIDA: %', p_d ->> 'area'; end if;
  v_resp := coalesce(nullif(trim(p_d ->> 'resp'), ''), v_ar.dono);
  if v_resp is null then raise exception 'FALTA RESPONSAVEL (A AREA % NAO TEM DONO)', v_ar.area; end if;
  if v_prazo is null then raise exception 'FALTA PRAZO (PRECISA ATE)'; end if;
  select coalesce(array_agg(x order by x), '{}') into v_ativs
    from (select distinct jsonb_array_elements_text(coalesce(p_d -> 'ativs', '[]')) as x) y;
  foreach v_x in array v_ativs loop
    if not exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_x) then
      raise exception 'ATIVIDADE NAO EXISTE: %', v_x;
    end if;
  end loop;
  if v_prazo < v_hoje then
    if v_nova is null or v_nova < v_hoje
       or coalesce(nullif(p_d ->> 'ref_ext', ''), nullif(p_d ->> 'tarefa_id', ''), p_oref) is null then
      raise exception 'PRAZO JA PASSOU (%): INFORME A NOVA DATA (HOJE OU DEPOIS) E ONDE FOI COMBINADO', public._taf_ciclo_dm(v_prazo);
    end if;
  elsif v_nova is not null and v_nova < v_hoje then
    raise exception 'NOVA DATA NO PASSADO';
  end if;
  if v_nova = v_prazo then v_nova := null; end if;
  perform 1 from public.taf_ciclo_obra where obra = p_obra for update;   -- numeração sem corrida
  select coalesce(max(num), 0) + 1 into v_num from public.taf_ciclo_demanda where obra = p_obra;
  insert into public.taf_ciclo_demanda (obra, num, area, oque, resp, pede_decisao, decisores, contraparte, prazo, nova_data, vezes,
    ativs, sem_ativ, item, origem, origem_ref, ref_ext, tarefa_id, cenario, criada_por, quem)
  values (p_obra, v_num, v_ar.area, trim(p_d ->> 'oque'), v_resp, coalesce((p_d ->> 'pede_decisao')::boolean, false),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_d -> 'decisores') x), '{}'),
    nullif(trim(p_d ->> 'contraparte'), ''), v_prazo, v_nova, case when v_nova is null then 0 else 1 end,
    v_ativs, coalesce((p_d ->> 'sem_ativ')::boolean, false), p_d ->> 'item', p_origem, p_oref,
    nullif(trim(p_d ->> 'ref_ext'), ''), nullif(p_d ->> 'tarefa_id', ''), p_d -> 'cenario',
    public._taf_ciclo_quem(), public._taf_ciclo_quem());
  return v_num;
end $$;

-- ===== PREPARAÇÃO =====
create or replace function public._taf_ciclo_a_preparo(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ativ text := p_d ->> 'ativ'; v_item text := p_d ->> 'item'; v_est text := p_d ->> 'estado';
        v_dem int := (p_d ->> 'demanda')::int; v_old public.taf_ciclo_preparo;
        v_seg date := coalesce((p_d ->> 'seg')::date, public._taf_ciclo_segunda(public._taf_ciclo_hoje()));
begin
  if not exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_ativ) then
    raise exception 'ATIVIDADE NAO EXISTE: %', v_ativ; end if;
  if v_item not in ('material','equipe','equipamento','projeto','liberacao') then raise exception 'ITEM INVALIDO: %', v_item; end if;
  if v_est not in ('ok','pendente','na') then raise exception 'ESTADO INVALIDO: %', v_est; end if;
  select * into v_old from public.taf_ciclo_preparo x where x.obra = p_obra and x.ativ = v_ativ and x.item = v_item;
  perform public._taf_ciclo_em_lido(v_old.em, v_old.quem, p_d);
  if v_est = 'pendente' and v_dem is null then
    if p_d ? 'nova_demanda' then
      v_dem := public._taf_ciclo_demanda_criar(p_obra,
                 (p_d -> 'nova_demanda') || jsonb_build_object('ativs', jsonb_build_array(v_ativ), 'item', v_item),
                 'preparo', v_ativ || '|' || v_item);
    else raise exception 'PENDENTE PRECISA DE DEMANDA: O QUE FALTA, QUEM RESOLVE E ATE QUANDO'; end if;
  end if;
  if v_est = 'pendente' and not exists (select 1 from public.taf_ciclo_demanda x where x.obra = p_obra and x.num = v_dem) then
    raise exception 'DEMANDA NAO EXISTE: D%', v_dem; end if;
  if v_est <> 'pendente' then v_dem := null; end if;
  insert into public.taf_ciclo_preparo (obra, ativ, item, estado, demanda, lote, obs, em, quem)
  values (p_obra, v_ativ, v_item, v_est, v_dem, false, nullif(trim(p_d ->> 'obs'), ''), now(), public._taf_ciclo_quem())
  on conflict (obra, ativ, item) do update set estado = excluded.estado, demanda = excluded.demanda, lote = false,
     obs = excluded.obs, em = now(), quem = excluded.quem;
  return jsonb_build_object('ref', v_ativ || '|' || v_item, 'ativ', v_ativ, 'demanda', v_dem,
                            'liberacao', public._taf_ciclo_liberada(p_obra, v_ativ, v_seg));
end $$;

create or replace function public._taf_ciclo_a_preparo_ok(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ativ text := p_d ->> 'ativ'; v_n int;
        v_seg date := coalesce((p_d ->> 'seg')::date, public._taf_ciclo_segunda(public._taf_ciclo_hoje()));
begin
  if not exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_ativ) then
    raise exception 'ATIVIDADE NAO EXISTE: %', v_ativ; end if;
  insert into public.taf_ciclo_preparo (obra, ativ, item, estado, lote, quem)
  select p_obra, v_ativ, i, 'ok', true, public._taf_ciclo_quem()
    from unnest(array['material','equipe','equipamento','projeto','liberacao']) i
   where not exists (select 1 from public.taf_ciclo_preparo x where x.obra = p_obra and x.ativ = v_ativ and x.item = i);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ref', v_ativ, 'ativ', v_ativ, 'marcados', v_n,
                            'liberacao', public._taf_ciclo_liberada(p_obra, v_ativ, v_seg));
end $$;

-- ===== COMPROMISSOS =====
create or replace function public._taf_ciclo_a_comp(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_s public.taf_ciclo_semana; v_c public.taf_ciclo_comp; v_cid text := p_d ->> 'cid';
        v_ativ text; v_lib jsonb; v_tipo text; v_ent text; v_k text;
begin
  v_s := public._taf_ciclo_semana_abrir(p_obra, v_seg);
  if v_s.estado = 'fechada' then raise exception 'SEMANA FECHADA'; end if;
  if v_cid is null then
    v_ativ := nullif(p_d ->> 'ativ', '');
    if v_ativ is not null and not exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_ativ) then
      raise exception 'ATIVIDADE NAO EXISTE: %', v_ativ; end if;
    if v_ativ is not null and exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_ativ and a.fim_real is not null) then
      raise exception 'ATIVIDADE JA TERMINOU: %', v_ativ; end if;
    v_lib := case when v_ativ is not null then public._taf_ciclo_liberada(p_obra, v_ativ, v_seg) end;
    if v_ativ is not null and not (v_lib ->> 'liberada')::boolean and not coalesce((p_d ->> 'com_restricao')::boolean, false) then
      raise exception 'NAO LIBERADA: %. MARQUE "COM RESTRICAO" E JUSTIFIQUE, OU RESOLVA ANTES',
        (select string_agg(x, '; ') from jsonb_array_elements_text(v_lib -> 'falta') x);
    end if;
    v_tipo := coalesce(p_d ->> 'entrega_tipo', 'concluir');
    v_ent := coalesce(nullif(trim(p_d ->> 'entrega'), ''), case when v_tipo = 'concluir' then 'Atividade concluída' end);
    select 'C' || (coalesce(max(substr(c.cid, 2)::int), 0) + 1) into v_cid from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg;
    insert into public.taf_ciclo_comp (obra, seg, cid, ativ, titulo, frente, entrega_tipo, entrega, qtd, un, resp, prometido, local,
      com_restricao, justif_restricao, extra, quem)
    values (p_obra, v_seg, v_cid, v_ativ, nullif(trim(p_d ->> 'titulo'), ''), nullif(trim(p_d ->> 'frente'), ''), v_tipo, v_ent,
      (p_d ->> 'qtd')::numeric, nullif(p_d ->> 'un', ''), trim(p_d ->> 'resp'), coalesce((p_d ->> 'prometido')::date, v_seg + 4),
      nullif(trim(p_d ->> 'local'), ''), coalesce((p_d ->> 'com_restricao')::boolean, false), nullif(trim(p_d ->> 'justif_restricao'), ''),
      v_s.estado = 'publicada', public._taf_ciclo_quem());
    select * into v_c from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cid = v_cid;
  else
    select * into v_c from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cid = v_cid for update;
    if v_c.cid is null then raise exception 'COMPROMISSO NAO EXISTE: %', v_cid; end if;
    perform public._taf_ciclo_em_lido(v_c.em, v_c.quem, p_d);
    if v_c.cancelado_em is not null then raise exception 'COMPROMISSO CANCELADO'; end if;
    if v_c.resultado is not null then raise exception 'COMPROMISSO JA FECHADO'; end if;
    if v_c.publicado is not null then
      foreach v_k in array array['ativ','titulo','frente','entrega_tipo','entrega','qtd','un','com_restricao','justif_restricao'] loop
        if p_d ? v_k and (p_d ->> v_k) is distinct from (to_jsonb(v_c) ->> v_k) then
          raise exception 'PUBLICADO: SO MUDAM RESPONSAVEL, LOCAL E DIA. PARA MUDAR A ENTREGA, CANCELE E CRIE UM EXTRA';
        end if;
      end loop;
    end if;
    v_ativ := case when p_d ? 'ativ' then nullif(p_d ->> 'ativ', '') else v_c.ativ end;
    if v_ativ is distinct from v_c.ativ and v_ativ is not null then
      v_lib := public._taf_ciclo_liberada(p_obra, v_ativ, v_seg);
      if not (v_lib ->> 'liberada')::boolean and not coalesce((p_d ->> 'com_restricao')::boolean, v_c.com_restricao) then
        raise exception 'NAO LIBERADA: %', (select string_agg(x, '; ') from jsonb_array_elements_text(v_lib -> 'falta') x);
      end if;
    end if;
    update public.taf_ciclo_comp c set
      ativ = v_ativ,
      titulo = case when p_d ? 'titulo' then nullif(trim(p_d ->> 'titulo'), '') else c.titulo end,
      frente = case when p_d ? 'frente' then nullif(trim(p_d ->> 'frente'), '') else c.frente end,
      entrega_tipo = coalesce(p_d ->> 'entrega_tipo', c.entrega_tipo),
      entrega = coalesce(nullif(trim(p_d ->> 'entrega'), ''), c.entrega),
      qtd = case when p_d ? 'qtd' then (p_d ->> 'qtd')::numeric else c.qtd end,
      un = case when p_d ? 'un' then nullif(p_d ->> 'un', '') else c.un end,
      resp = coalesce(nullif(trim(p_d ->> 'resp'), ''), c.resp),
      prometido = coalesce((p_d ->> 'prometido')::date, c.prometido),
      local = case when p_d ? 'local' then nullif(trim(p_d ->> 'local'), '') else c.local end,
      com_restricao = coalesce((p_d ->> 'com_restricao')::boolean, c.com_restricao),
      justif_restricao = case when p_d ? 'justif_restricao' then nullif(trim(p_d ->> 'justif_restricao'), '') else c.justif_restricao end,
      versao = c.versao + 1, em = now(), quem = public._taf_ciclo_quem()
    where c.obra = p_obra and c.seg = v_seg and c.cid = v_cid
    returning * into v_c;
  end if;
  return jsonb_build_object('ref', v_seg || '|' || v_cid, 'ativ', v_c.ativ, 'cid', v_cid, 'extra', v_c.extra,
                            'em', v_c.em, 'liberacao', v_lib);
end $$;

create or replace function public._taf_ciclo_a_comp_tirar(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_c public.taf_ciclo_comp;
begin
  select * into v_c from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cid = p_d ->> 'cid' for update;
  if v_c.cid is null then raise exception 'COMPROMISSO NAO EXISTE'; end if;
  if v_c.publicado is not null then raise exception 'PUBLICADO NAO SE TIRA: CANCELE (CONTINUA NO PPC)'; end if;
  if exists (select 1 from public.taf_ciclo_apont a where a.obra = p_obra and a.seg = v_seg and a.cid = v_c.cid) then
    raise exception 'TEM APONTAMENTO: APAGUE OS APONTAMENTOS ANTES'; end if;
  delete from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cid = v_c.cid;
  if v_c.origem = 'saldo' then   -- o saldo volta a esperar decisão
    update public.taf_ciclo_comp c set saldo = null, saldo_motivo = null, em = now(), quem = public._taf_ciclo_quem()
     where c.obra = p_obra and c.seg = split_part(v_c.origem_ref, '|', 1)::date and c.cid = split_part(v_c.origem_ref, '|', 2);
  end if;
  return jsonb_build_object('ref', v_seg || '|' || v_c.cid, 'ativ', v_c.ativ);
end $$;

create or replace function public._taf_ciclo_a_comp_cancelar(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_s public.taf_ciclo_semana; v_c public.taf_ciclo_comp;
begin
  select * into v_s from public.taf_ciclo_semana where obra = p_obra and seg = v_seg;
  if v_s.estado is distinct from 'publicada' then raise exception 'SO SE CANCELA EM SEMANA PUBLICADA E ABERTA (NO RASCUNHO, TIRE)'; end if;
  select * into v_c from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cid = p_d ->> 'cid' for update;
  if v_c.cid is null then raise exception 'COMPROMISSO NAO EXISTE'; end if;
  perform public._taf_ciclo_em_lido(v_c.em, v_c.quem, p_d);
  if v_c.resultado is not null then raise exception 'COMPROMISSO JA FECHADO'; end if;
  update public.taf_ciclo_comp c set cancelado_em = public._taf_ciclo_agora(), cancel_motivo = trim(p_d ->> 'motivo'),
    resultado = 'nao', causa = p_d ->> 'causa', causa_det = nullif(p_d ->> 'causa_det', ''), causa_txt = nullif(trim(p_d ->> 'causa_txt'), ''),
    fechado_em = public._taf_ciclo_agora(), fechado_por = public._taf_ciclo_quem(), em = now(), quem = public._taf_ciclo_quem()
  where c.obra = p_obra and c.seg = v_seg and c.cid = v_c.cid;
  return jsonb_build_object('ref', v_seg || '|' || v_c.cid, 'ativ', v_c.ativ, 'pede_replan', v_c.ativ is not null);
end $$;

create or replace function public._taf_ciclo_a_fora(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_s public.taf_ciclo_semana; v_ativ text := p_d ->> 'ativ';
begin
  v_s := public._taf_ciclo_semana_abrir(p_obra, v_seg);
  if v_s.estado <> 'rascunho' then raise exception 'SEMANA JA PUBLICADA'; end if;
  if coalesce((p_d ->> 'apagar')::boolean, false) then
    delete from public.taf_ciclo_fora f where f.obra = p_obra and f.seg = v_seg and f.ativ = v_ativ;
  else
    insert into public.taf_ciclo_fora (obra, seg, ativ, motivo, txt, quem)
    values (p_obra, v_seg, v_ativ, p_d ->> 'motivo', nullif(trim(p_d ->> 'txt'), ''), public._taf_ciclo_quem())
    on conflict (obra, seg, ativ) do update set motivo = excluded.motivo, txt = excluded.txt, em = now(), quem = excluded.quem;
  end if;
  return jsonb_build_object('ref', v_seg || '|' || v_ativ, 'ativ', v_ativ);
end $$;

-- ===== PUBLICAR =====
create or replace function public._taf_ciclo_a_publicar(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_s public.taf_ciclo_semana; v_hoje date := public._taf_ciclo_hoje();
        v_ag timestamptz := public._taf_ciclo_agora(); v_pz jsonb; v_st text; v_prog jsonb; v_jan jsonb; v_x text; v_n int;
        v_trav text[] := '{}'; v_c record; v_lib jsonb;
begin
  select * into v_s from public.taf_ciclo_semana where obra = p_obra and seg = v_seg for update;
  if v_s.seg is null then raise exception 'SEMANA SEM COMPROMISSOS'; end if;
  if v_s.estado <> 'rascunho' then raise exception 'SEMANA JA PUBLICADA'; end if;
  if v_seg > v_hoje + 7 then raise exception 'SO SE PUBLICA A SEMANA ATUAL OU A PROXIMA'; end if;
  if v_hoje > v_seg + 6 then raise exception 'SEMANA JA PASSOU'; end if;
  if not exists (select 1 from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg) then
    raise exception 'SEMANA SEM COMPROMISSOS'; end if;
  select string_agg(public._taf_ciclo_dm(x.seg), ', ' order by x.seg) into v_x
    from public.taf_ciclo_semana x where x.obra = p_obra and x.seg < v_seg and x.estado <> 'fechada'
     and exists (select 1 from public.taf_ciclo_comp c where c.obra = x.obra and c.seg = x.seg);
  if v_x is not null then raise exception 'FECHE ANTES A SEMANA DE %', v_x; end if;
  select string_agg(public._taf_ciclo_dm(c.seg) || ' ' || c.cid || coalesce(' ' || c.ativ, ''), ', ' order by c.seg, c.cid) into v_x
    from public.taf_ciclo_comp c join public.taf_ciclo_semana s on s.obra = c.obra and s.seg = c.seg
   where c.obra = p_obra and s.estado = 'fechada' and c.resultado in ('parcial','nao') and c.saldo is null
     and not exists (select 1 from public.taf_ciclo_ativ a where a.obra = c.obra and a.id = c.ativ and a.fim_real is not null);
  if v_x is not null then raise exception 'DECIDA O SALDO (ACEITAR OU DESCARTAR): %', v_x; end if;
  select string_agg('#' || r.id || coalesce(' ' || r.ativ, ''), ', ' order by r.id) into v_x
    from public.taf_ciclo_replan r where r.obra = p_obra and r.decisao = 'pendente';
  if v_x is not null then raise exception 'DECIDA OS REPLANEJAMENTOS PENDENTES: %', v_x; end if;
  select string_agg(e ->> 'id', ', ') into v_x
    from jsonb_array_elements(public._taf_ciclo_sugestao(p_obra, '{}') -> 'lista') e;
  if v_x is not null then
    raise exception 'CRONOGRAMA DESATUALIZADO: A LOGICA EMPURRA % SEM DECISAO. REPLANEJE A ORIGEM (DATA REAL)', v_x; end if;
  for v_c in select c.* from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.ativ is not null order by c.cid loop
    v_lib := public._taf_ciclo_liberada(p_obra, v_c.ativ, v_seg);
    if not (v_lib ->> 'liberada')::boolean and not v_c.com_restricao then
      v_trav := v_trav || (v_c.cid || ' ' || v_c.ativ || ': ' ||
                           (select string_agg(x, '; ') from jsonb_array_elements_text(v_lib -> 'falta') x));
    end if;
    update public.taf_ciclo_comp c set publicado = jsonb_strip_nulls(jsonb_build_object(
        'ativ', c.ativ, 'titulo', c.titulo, 'frente', c.frente, 'entrega_tipo', c.entrega_tipo, 'entrega', c.entrega,
        'qtd', c.qtd, 'un', c.un, 'resp', c.resp, 'prometido', c.prometido, 'local', c.local,
        'com_restricao', c.com_restricao, 'justif_restricao', c.justif_restricao, 'origem', c.origem, 'origem_ref', c.origem_ref,
        'versao', c.versao, 'liberacao', v_lib))
     where c.obra = p_obra and c.seg = v_seg and c.cid = v_c.cid;
  end loop;
  if cardinality(v_trav) > 0 then
    raise exception 'NAO LIBERADA AO PUBLICAR: %. MARQUE "COM RESTRICAO" E JUSTIFIQUE, OU TIRE', array_to_string(v_trav, ' | ');
  end if;
  update public.taf_ciclo_comp c set publicado = jsonb_strip_nulls(jsonb_build_object(
      'titulo', c.titulo, 'frente', c.frente, 'entrega_tipo', c.entrega_tipo, 'entrega', c.entrega, 'qtd', c.qtd, 'un', c.un,
      'resp', c.resp, 'prometido', c.prometido, 'local', c.local, 'origem', c.origem, 'origem_ref', c.origem_ref, 'versao', c.versao))
   where c.obra = p_obra and c.seg = v_seg and c.ativ is null;
  get diagnostics v_n = row_count;
  v_pz := public._taf_ciclo_prazos(p_obra, v_seg);
  v_st := case when v_ag <= (v_pz ->> 'pub_no_prazo')::timestamptz then 'NO_PRAZO'
               when v_ag <= (v_pz ->> 'pub_limite')::timestamptz then 'ATRASADA' else 'FORA_DO_PRAZO' end;
  v_prog := public._taf_ciclo_programacao(p_obra, v_seg);
  v_jan := public._taf_ciclo_janela(p_obra, v_seg);
  update public.taf_ciclo_semana set estado = 'publicada', publicada_em = v_ag, publicada_por = public._taf_ciclo_quem(),
    status_pub = v_st, cobertura = v_prog ->> 'cobertura', janela = v_jan || jsonb_build_object('programacao', v_prog),
    ensaio = coalesce((p_d ->> 'ensaio')::boolean, false)
  where obra = p_obra and seg = v_seg;
  select count(*) into v_n from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg;
  return jsonb_build_object('ref', v_seg::text, 'status_pub', v_st, 'cobertura', v_prog ->> 'cobertura',
                            'sem_justificativa', v_prog -> 'sem_justificativa', 'publicados', v_n);
end $$;

-- ===== APONTAMENTO =====
create or replace function public._taf_ciclo_a_apont(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_dia date := (p_d ->> 'dia')::date; v_s public.taf_ciclo_semana;
        v_c public.taf_ciclo_comp; v_old public.taf_ciclo_apont; v_a public.taf_ciclo_ativ; v_sit text := p_d ->> 'situacao';
        v_dem int := (p_d ->> 'demanda')::int; v_res jsonb; v_hoje date := public._taf_ciclo_hoje();
begin
  select * into v_s from public.taf_ciclo_semana where obra = p_obra and seg = v_seg;
  if v_s.estado is null or v_s.estado = 'rascunho' then raise exception 'PUBLIQUE A SEMANA ANTES DE APONTAR'; end if;
  if v_s.estado = 'fechada' then raise exception 'SEMANA FECHADA: PECA AO GESTOR PARA REABRIR'; end if;
  select * into v_c from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cid = p_d ->> 'cid';
  if v_c.cid is null then raise exception 'COMPROMISSO NAO EXISTE'; end if;
  if v_c.cancelado_em is not null then raise exception 'COMPROMISSO CANCELADO'; end if;
  if v_dia is null or v_dia < v_seg or v_dia > v_seg + 6 then raise exception 'DIA FORA DA SEMANA'; end if;
  if v_dia > v_hoje then raise exception 'NAO SE APONTA DIA FUTURO'; end if;
  select * into v_old from public.taf_ciclo_apont a where a.obra = p_obra and a.seg = v_seg and a.cid = v_c.cid and a.dia = v_dia;
  perform public._taf_ciclo_em_lido(v_old.em, v_old.quem, p_d);
  if v_sit = 'parado' and nullif(p_d ->> 'causa', '') is null then raise exception 'PARADO PRECISA DE CAUSA'; end if;
  if p_d ? 'nova_demanda' and v_dem is null then
    v_dem := public._taf_ciclo_demanda_criar(p_obra, (p_d -> 'nova_demanda') ||
               case when v_c.ativ is not null then jsonb_build_object('ativs', jsonb_build_array(v_c.ativ))
                    else jsonb_build_object('sem_ativ', true) end,
               'apontamento', v_seg || '|' || v_c.cid || '|' || v_dia);
  end if;
  insert into public.taf_ciclo_apont (obra, seg, cid, dia, situacao, qtd, causa, causa_det, obs, link, demanda, lote, tardio, quem)
  values (p_obra, v_seg, v_c.cid, v_dia, v_sit, (p_d ->> 'qtd')::numeric, case when v_sit = 'parado' then p_d ->> 'causa' end,
          nullif(p_d ->> 'causa_det', ''), nullif(trim(p_d ->> 'obs'), ''), nullif(trim(p_d ->> 'link'), ''), v_dem, false,
          public._taf_ciclo_agora() > ((v_dia + 1) + time '09:00') at time zone 'America/Sao_Paulo', public._taf_ciclo_quem())
  on conflict (obra, seg, cid, dia) do update set situacao = excluded.situacao, qtd = excluded.qtd, causa = excluded.causa,
     causa_det = excluded.causa_det, obs = excluded.obs, link = excluded.link, demanda = excluded.demanda, lote = false,
     tardio = excluded.tardio, em = now(), quem = excluded.quem;
  v_res := jsonb_build_object('ref', v_seg || '|' || v_c.cid || '|' || v_dia, 'ativ', v_c.ativ, 'demanda', v_dem);
  if v_c.ativ is not null and v_sit in ('andou','entregue') then
    select * into v_a from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_c.ativ;
    if v_a.dur > 0 and (v_a.ini_real is null or (v_a.real_origem = 'apontamento' and v_a.ini_real > v_dia and v_a.fim_real is null)) then
      update public.taf_ciclo_ativ a set ini_real = v_dia, real_origem = 'apontamento',
        atualizado_em = now(), atualizado_por = public._taf_ciclo_quem() where a.obra = p_obra and a.id = v_c.ativ;
      v_res := v_res || jsonb_build_object('inicio_real', jsonb_build_object('ativ', v_c.ativ, 'data', v_dia, 'desfazer', true));
    end if;
    if v_sit = 'entregue' and v_c.entrega_tipo = 'concluir' and v_a.fim_real is null then
      v_res := v_res || jsonb_build_object('propor_termino', jsonb_build_object('ativ', v_c.ativ, 'data', v_dia,
                 'pergunta', format('Lançar término real de %s em %s?', v_c.ativ, public._taf_ciclo_dm(v_dia))));
    end if;
  end if;
  return v_res;
end $$;

create or replace function public._taf_ciclo_a_apont_lote(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_dia date := (p_d ->> 'dia')::date; v_s public.taf_ciclo_semana;
        v_sit text := p_d ->> 'situacao'; v_c record; v_n int := 0; v_pul jsonb := '[]';
begin
  select * into v_s from public.taf_ciclo_semana where obra = p_obra and seg = v_seg;
  if v_s.estado is distinct from 'publicada' then raise exception 'SO EM SEMANA PUBLICADA E ABERTA'; end if;
  if v_dia is null or v_dia < v_seg or v_dia > v_seg + 6 then raise exception 'DIA FORA DA SEMANA'; end if;
  if v_dia > public._taf_ciclo_hoje() then raise exception 'NAO SE APONTA DIA FUTURO'; end if;
  if v_sit not in ('andou','parado') then raise exception 'LOTE SO PARA ANDOU OU PARADO'; end if;
  if v_sit = 'parado' and nullif(p_d ->> 'causa', '') is null then raise exception 'PARADO PRECISA DE CAUSA'; end if;
  for v_c in select c.*, a.ini_real from public.taf_ciclo_comp c left join public.taf_ciclo_ativ a on a.obra = c.obra and a.id = c.ativ
              where c.obra = p_obra and c.seg = v_seg and c.cancelado_em is null and c.resultado is null
                and (not (p_d ? 'cids') or c.cid = any(select jsonb_array_elements_text(p_d -> 'cids')))
                and not exists (select 1 from public.taf_ciclo_apont x where x.obra = c.obra and x.seg = c.seg and x.cid = c.cid
                                   and (x.dia = v_dia or (x.dia < v_dia and x.situacao = 'entregue')))
              order by c.cid loop
    if v_sit = 'andou' and v_c.ativ is not null and v_c.ini_real is null then
      v_pul := v_pul || jsonb_build_object('cid', v_c.cid, 'ativ', v_c.ativ, 'motivo', 'ainda não começou: aponte individualmente');
      continue;
    end if;
    insert into public.taf_ciclo_apont (obra, seg, cid, dia, situacao, causa, causa_det, obs, lote, tardio, quem)
    values (p_obra, v_seg, v_c.cid, v_dia, v_sit, case when v_sit = 'parado' then p_d ->> 'causa' end, nullif(p_d ->> 'causa_det', ''),
            nullif(trim(p_d ->> 'obs'), ''), true,
            public._taf_ciclo_agora() > ((v_dia + 1) + time '09:00') at time zone 'America/Sao_Paulo', public._taf_ciclo_quem());
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ref', v_seg || '|' || v_dia, 'gravados', v_n, 'pulados', v_pul);
end $$;

create or replace function public._taf_ciclo_a_apont_apagar(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_dia date := (p_d ->> 'dia')::date; v_s public.taf_ciclo_semana;
        v_c public.taf_ciclo_comp; v_a public.taf_ciclo_ativ; v_desf boolean := false;
begin
  select * into v_s from public.taf_ciclo_semana where obra = p_obra and seg = v_seg;
  if v_s.estado is distinct from 'publicada' then raise exception 'SO EM SEMANA PUBLICADA E ABERTA'; end if;
  select * into v_c from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cid = p_d ->> 'cid';
  delete from public.taf_ciclo_apont a where a.obra = p_obra and a.seg = v_seg and a.cid = v_c.cid and a.dia = v_dia;
  if not found then raise exception 'APONTAMENTO NAO EXISTE'; end if;
  select * into v_a from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_c.ativ;
  if v_a.real_origem = 'apontamento' and v_a.ini_real = v_dia and v_a.fim_real is null
     and not exists (select 1 from public.taf_ciclo_apont x join public.taf_ciclo_comp c on c.obra = x.obra and c.seg = x.seg and c.cid = x.cid
                      where x.obra = p_obra and c.ativ = v_a.id and x.situacao in ('andou','entregue')) then
    update public.taf_ciclo_ativ a set ini_real = null, real_origem = null, atualizado_em = now(), atualizado_por = public._taf_ciclo_quem()
     where a.obra = p_obra and a.id = v_a.id;
    v_desf := true;
  end if;
  return jsonb_build_object('ref', v_seg || '|' || v_c.cid || '|' || v_dia, 'ativ', v_c.ativ, 'desfeito_inicio', v_desf);
end $$;

-- ===== DATA REAL (início/término) =====
create or replace function public._taf_ciclo_a_real(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_a public.taf_ciclo_ativ; v_ini date; v_fim date; v_hoje date := public._taf_ciclo_hoje(); v_ef jsonb; v_desf text := p_d ->> 'desfazer';
begin
  select * into v_a from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = p_d ->> 'ativ' for update;
  if v_a.id is null then raise exception 'ATIVIDADE NAO EXISTE: %', p_d ->> 'ativ'; end if;
  if v_desf = 'fim' then v_ini := v_a.ini_real; v_fim := null;
  elsif v_desf = 'ini' then
    if v_a.fim_real is not null and v_a.dur > 0 then raise exception 'DESFACA O TERMINO ANTES'; end if;
    v_ini := null; v_fim := null;
  else
    v_ini := coalesce((p_d ->> 'ini')::date, v_a.ini_real);
    v_fim := case when p_d ? 'fim' then (p_d ->> 'fim')::date else v_a.fim_real end;
    if v_a.dur = 0 then v_ini := coalesce((p_d ->> 'fim')::date, (p_d ->> 'ini')::date); v_fim := v_ini; end if;
    if v_ini is null then raise exception 'LANCE O INICIO REAL ANTES DO TERMINO'; end if;
    if v_ini > v_hoje or v_fim > v_hoje then raise exception 'DATA REAL NO FUTURO'; end if;
    if v_fim < v_ini then raise exception 'TERMINO ANTES DO INICIO'; end if;
  end if;
  update public.taf_ciclo_ativ a set ini_real = v_ini, fim_real = v_fim,
    real_origem = case when v_ini is null then null else coalesce(p_d ->> 'origem', 'manual') end,
    atualizado_em = now(), atualizado_por = public._taf_ciclo_quem()
  where a.obra = p_obra and a.id = v_a.id;
  v_ef := public._taf_ciclo_sugestao(p_obra, '{}');   -- o que a data real empurra nas outras (data vigente x propagação)
  return jsonb_build_object('ref', v_a.id, 'ativ', v_a.id, 'ini_real', v_ini, 'fim_real', v_fim,
    'efeito', public._taf_ciclo_sug_curta(v_ef), 'pede_replan', (v_ef -> 'resumo' ->> 'n')::int > 0);
end $$;

-- ===== FECHAMENTO =====
create or replace function public._taf_ciclo_a_fechar_item(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_s public.taf_ciclo_semana; v_c public.taf_ciclo_comp; v_res jsonb;
        v_pz jsonb; v_r text := p_d ->> 'resultado'; v_a public.taf_ciclo_ativ;
begin
  select * into v_s from public.taf_ciclo_semana where obra = p_obra and seg = v_seg;
  if v_s.estado is null or v_s.estado = 'rascunho' then raise exception 'SEMANA NAO PUBLICADA'; end if;
  if v_s.estado = 'fechada' then raise exception 'SEMANA FECHADA: PECA AO GESTOR PARA REABRIR'; end if;
  v_pz := public._taf_ciclo_prazos(p_obra, v_seg);
  if public._taf_ciclo_agora() < (v_pz ->> 'fecha_de')::timestamptz then
    raise exception 'FECHAMENTO ABRE EM % AS %H', public._taf_ciclo_dm((v_pz ->> 'ult')::date),
      (select fecha_de_h from public.taf_ciclo_obra where obra = p_obra);
  end if;
  select * into v_c from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cid = p_d ->> 'cid' for update;
  if v_c.cid is null then raise exception 'COMPROMISSO NAO EXISTE'; end if;
  if v_c.cancelado_em is not null then raise exception 'CANCELADO: JA CONTA COMO NAO CUMPRIDO'; end if;
  perform public._taf_ciclo_em_lido(v_c.em, v_c.quem, p_d);
  if v_r not in ('cumprido','parcial','nao') then raise exception 'RESULTADO: CUMPRIDO, PARCIAL OU NAO'; end if;
  if v_r <> 'cumprido' and nullif(p_d ->> 'causa', '') is null then raise exception 'NAO CUMPRIDO PRECISA DE CAUSA'; end if;
  update public.taf_ciclo_comp c set resultado = v_r,
    feito_qtd = case when v_r = 'cumprido' then null else (p_d ->> 'feito_qtd')::numeric end,
    feito_pct = case when v_r = 'parcial' then (p_d ->> 'feito_pct')::smallint end,
    falta = case when v_r = 'cumprido' then null else nullif(trim(p_d ->> 'falta'), '') end,
    causa = case when v_r = 'cumprido' then null else p_d ->> 'causa' end,
    causa_det = case when v_r = 'cumprido' then null else nullif(p_d ->> 'causa_det', '') end,
    causa_txt = case when v_r = 'cumprido' then null else nullif(trim(p_d ->> 'causa_txt'), '') end,
    fechado_em = public._taf_ciclo_agora(), fechado_por = public._taf_ciclo_quem(), em = now(), quem = public._taf_ciclo_quem()
  where c.obra = p_obra and c.seg = v_seg and c.cid = v_c.cid;
  v_res := jsonb_build_object('ref', v_seg || '|' || v_c.cid, 'ativ', v_c.ativ, 'resultado', v_r);
  if v_c.ativ is not null then
    select * into v_a from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_c.ativ;
    if v_r <> 'cumprido' and v_a.fim_real is null then v_res := v_res || jsonb_build_object('pede_replan', true); end if;
    if v_r = 'cumprido' and v_c.entrega_tipo = 'concluir' and v_a.fim_real is null then
      v_res := v_res || jsonb_build_object('propor_termino', jsonb_build_object('ativ', v_c.ativ,
        'data', coalesce((select max(x.dia) from public.taf_ciclo_apont x where x.obra = p_obra and x.seg = v_seg and x.cid = v_c.cid
                            and x.situacao = 'entregue'), least(public._taf_ciclo_hoje(), v_c.prometido))));
    end if;
  end if;
  return v_res;
end $$;

create or replace function public._taf_ciclo_a_fechar_semana(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_s public.taf_ciclo_semana; v_x text; v_res jsonb; v_pz jsonb;
begin
  select * into v_s from public.taf_ciclo_semana where obra = p_obra and seg = v_seg for update;
  if v_s.estado is distinct from 'publicada' then raise exception 'SO SE FECHA SEMANA PUBLICADA E ABERTA'; end if;
  v_pz := public._taf_ciclo_prazos(p_obra, v_seg);
  if public._taf_ciclo_agora() < (v_pz ->> 'fecha_de')::timestamptz then
    raise exception 'FECHAMENTO ABRE EM %', public._taf_ciclo_dm((v_pz ->> 'ult')::date); end if;
  select string_agg(c.cid, ', ' order by c.cid) into v_x from public.taf_ciclo_comp c
   where c.obra = p_obra and c.seg = v_seg and c.resultado is null;
  if v_x is not null then raise exception 'FALTA FECHAR: %', v_x; end if;
  select string_agg(c.cid || ' ' || c.ativ, ', ' order by c.cid) into v_x
    from public.taf_ciclo_comp c join public.taf_ciclo_ativ a on a.obra = c.obra and a.id = c.ativ
   where c.obra = p_obra and c.seg = v_seg and c.resultado in ('parcial','nao') and a.fim_real is null
     -- basta existir o replanejamento: "decidir depois" (decisão pendente) não trava o fechamento, trava a publicação seguinte
     and not exists (select 1 from public.taf_ciclo_replan r where r.obra = c.obra and r.seg = c.seg and r.cid = c.cid);
  if v_x is not null then raise exception 'REPLANEJE (NOVA PREVISAO, ACAO E RESPONSAVEL): %', v_x; end if;
  v_res := public._taf_ciclo_resumo(p_obra, v_seg) || jsonb_build_object('estado', 'fechada', 'fechada_em', public._taf_ciclo_agora(),
             'fechada_por', public._taf_ciclo_quem());
  update public.taf_ciclo_semana set estado = 'fechada', fechada_em = public._taf_ciclo_agora(), fechada_por = public._taf_ciclo_quem(),
    resumo = coalesce(resumo, v_res), resumo_atual = case when resumo is null then null else v_res end,
    nota = coalesce(nullif(trim(p_d ->> 'nota'), ''), nota)
  where obra = p_obra and seg = v_seg;
  return jsonb_build_object('ref', v_seg::text, 'resumo', v_res);
end $$;

create or replace function public._taf_ciclo_a_reabrir(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date;
begin
  if length(trim(coalesce(p_d ->> 'motivo', ''))) < 10 then raise exception 'REABRIR PRECISA DE MOTIVO (10 LETRAS OU MAIS)'; end if;
  update public.taf_ciclo_semana set estado = 'publicada', fechada_em = null, fechada_por = null, reaberta = reaberta + 1
   where obra = p_obra and seg = v_seg and estado = 'fechada';
  if not found then raise exception 'SEMANA NAO ESTA FECHADA'; end if;
  return jsonb_build_object('ref', v_seg::text);
end $$;

-- ===== REPLANEJAMENTO =====
create or replace function public._taf_ciclo_a_replan(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_a public.taf_ciclo_ativ; v_ini date := (p_d ->> 'ini_novo')::date; v_fim date := (p_d ->> 'fim_novo')::date;
        v_org text := coalesce(p_d ->> 'origem', 'manual'); v_sug jsonb; v_dec text; v_id bigint; v_old public.taf_ciclo_replan;
        v_fx jsonb; v_acordo text; v_seg date := (p_d ->> 'seg')::date; v_cid text := nullif(p_d ->> 'cid', '');
begin
  select * into v_a from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = p_d ->> 'ativ';
  if v_a.id is null then raise exception 'ATIVIDADE NAO EXISTE: %', p_d ->> 'ativ'; end if;
  if v_a.fim_real is not null and v_org <> 'data_real' then raise exception 'ATIVIDADE JA TERMINOU'; end if;
  if v_cid is not null and not exists (select 1 from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg
                                                                          and c.cid = v_cid and c.ativ = v_a.id) then
    raise exception 'COMPROMISSO % NAO E DESTA ATIVIDADE', v_cid; end if;
  if p_d ? 'substitui' then
    select * into v_old from public.taf_ciclo_replan r where r.id = (p_d ->> 'substitui')::bigint and r.obra = p_obra for update;
    if v_old.id is null or v_old.ativ is distinct from v_a.id then raise exception 'SUBSTITUI: REPLANEJAMENTO DE OUTRA ATIVIDADE'; end if;
  elsif exists (select 1 from public.taf_ciclo_replan r where r.obra = p_obra and r.ativ = v_a.id and r.decisao = 'pendente') then
    raise exception 'JA HA REPLANEJAMENTO PENDENTE PARA %: DECIDA OU SUBSTITUA', v_a.id;
  end if;
  if v_a.ini_real is not null then
    if v_ini is not null and v_ini <> v_a.ini_real then raise exception 'INICIO REAL JA LANCADO (%)', public._taf_ciclo_dm(v_a.ini_real); end if;
    v_ini := null;
  end if;
  if v_fim is null then v_fim := coalesce(v_a.fim_real, v_a.prev_fim, v_a.fim_base); end if;
  if v_a.dur = 0 then v_ini := v_fim; end if;
  if v_a.fim_real is null and v_fim < public._taf_ciclo_hoje() then raise exception 'NOVA DATA NO PASSADO'; end if;
  v_fx := jsonb_build_object(v_a.id, jsonb_strip_nulls(jsonb_build_object('ini', v_ini, 'fim', v_fim)));
  if v_old.id is not null then
    -- a substituição desfaz a dispensa do anterior: a sugestão já sai sem ela
    perform set_config('taf.motivo', 'Substitui #' || v_old.id, true);
  end if;
  insert into public.taf_ciclo_replan (obra, ativ, seg, cid, origem, causa, causa_det, motivo_txt, acao, resp,
     ini_antes, fim_antes, ini_novo, fim_novo, decisao, substitui, autor, papel)
  values (p_obra, v_a.id, case when v_cid is not null then v_seg end, v_cid, v_org, p_d ->> 'causa', nullif(p_d ->> 'causa_det', ''),
     nullif(trim(p_d ->> 'motivo_txt'), ''), trim(p_d ->> 'acao'), trim(p_d ->> 'resp'),
     coalesce(v_a.ini_real, v_a.prev_ini, v_a.ini_base), coalesce(v_a.prev_fim, v_a.fim_base), v_ini, v_fim, 'pendente',
     v_old.id, public._taf_ciclo_quem(), current_setting('taf.papel', true))
  returning id into v_id;
  v_sug := public._taf_ciclo_sugestao(p_obra, v_fx);
  v_dec := case when (v_sug -> 'resumo' ->> 'n')::int = 0 then 'sem_efeito' else 'pendente' end;
  v_acordo := case when v_dec = 'sem_efeito' and (v_a.contratual or v_a.tipo in ('evento','evento_pct'))
                        and v_fim is distinct from coalesce(v_a.prev_fim, v_a.fim_base) then 'pendente' end;
  update public.taf_ciclo_replan set sugestao = v_sug, decisao = v_dec, acordo = v_acordo,
     decidido_em = case when v_dec = 'sem_efeito' then public._taf_ciclo_agora() end
   where id = v_id;
  if v_dec = 'sem_efeito' then
    update public.taf_ciclo_ativ a set prev_ini = coalesce(v_ini, a.prev_ini, a.ini_base), prev_fim = v_fim, prev_replan = v_id,
      atualizado_em = now(), atualizado_por = public._taf_ciclo_quem()
    where a.obra = p_obra and a.id = v_a.id and a.fim_real is null;
  end if;
  if v_old.id is not null and v_old.decisao = 'pendente' then
    update public.taf_ciclo_replan set decisao = 'sem_efeito', justif = 'Substituído pelo #' || v_id, decidido_em = public._taf_ciclo_agora()
     where id = v_old.id;
  end if;
  return jsonb_build_object('ref', v_id::text, 'ativ', v_a.id, 'replan', v_id, 'decisao', v_dec, 'acordo', v_acordo, 'sugestao', v_sug);
end $$;

create or replace function public._taf_ciclo_a_efeito(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_r public.taf_ciclo_replan; v_fx jsonb; v_sug jsonb; v_chk jsonb; v_dec text := p_d ->> 'decisao'; v_disp text[];
        v_e jsonb; v_n int := 0; v_acordo text; v_x text;
begin
  select * into v_r from public.taf_ciclo_replan r where r.obra = p_obra and r.id = (p_d ->> 'replan')::bigint for update;
  if v_r.id is null then raise exception 'REPLANEJAMENTO NAO EXISTE'; end if;
  if v_r.decisao <> 'pendente' then raise exception 'REPLANEJAMENTO JA DECIDIDO'; end if;
  if v_dec not in ('tudo','so_esta') then raise exception 'DECISAO: TUDO OU SO ESTA'; end if;
  v_fx := jsonb_build_object(v_r.ativ, jsonb_strip_nulls(jsonb_build_object('ini', v_r.ini_novo, 'fim', v_r.fim_novo)));
  v_sug := public._taf_ciclo_sugestao(p_obra, v_fx);
  if p_d ->> 'assinatura' is distinct from v_sug ->> 'assinatura' then
    raise exception 'SUGESTAO DESATUALIZADA: O CRONOGRAMA MUDOU DEPOIS DO CALCULO. REVEJA A LISTA';
  end if;
  perform set_config('taf.motivo', format('Replanejamento #%s (%s)', v_r.id, v_r.ativ), true);
  if v_dec = 'tudo' then
    for v_e in select jsonb_array_elements(v_sug -> 'lista') loop
      update public.taf_ciclo_ativ a set prev_ini = (v_e ->> 'ini_para')::date, prev_fim = (v_e ->> 'fim_para')::date,
        prev_replan = v_r.id, atualizado_em = now(), atualizado_por = public._taf_ciclo_quem()
       where a.obra = p_obra and a.id = v_e ->> 'id';
      v_n := v_n + 1;
    end loop;
    v_acordo := case when (v_sug -> 'resumo' ->> 'mexe_evento')::boolean then 'pendente' end;
  else
    if length(trim(coalesce(p_d ->> 'justif', ''))) < 10 then raise exception 'SO ESTA PRECISA DE JUSTIFICATIVA (10 LETRAS OU MAIS)'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_disp from jsonb_array_elements_text(coalesce(p_d -> 'dispensa', '[]')) x;
    foreach v_x in array v_disp loop
      if not exists (select 1 from public.taf_ciclo_ativ a, jsonb_array_elements(a.pred) l
                      where a.obra = p_obra and a.id = split_part(v_x, '>', 2) and l ->> 0 = split_part(v_x, '>', 1)) then
        raise exception 'LIGACAO NAO EXISTE: %', v_x; end if;
    end loop;
    v_chk := public._taf_ciclo_sugestao(p_obra, v_fx, v_disp);
    if (v_chk -> 'resumo' ->> 'n')::int > 0 then
      raise exception 'FALTA DISPENSAR: AINDA MEXE EM %', (select string_agg(e ->> 'id', ', ') from
        (select e from jsonb_array_elements(v_chk -> 'lista') e limit 8) z);
    end if;
    v_acordo := 'pendente';
  end if;
  update public.taf_ciclo_ativ a set prev_ini = coalesce(v_r.ini_novo, a.prev_ini, a.ini_base), prev_fim = v_r.fim_novo,
    prev_replan = v_r.id, atualizado_em = now(), atualizado_por = public._taf_ciclo_quem()
   where a.obra = p_obra and a.id = v_r.ativ and a.fim_real is null;
  update public.taf_ciclo_replan set decisao = v_dec, justif = nullif(trim(p_d ->> 'justif'), ''),
    dispensa = case when v_dec = 'so_esta' then v_disp else '{}' end, decidido_em = public._taf_ciclo_agora(),
    sugestao = v_sug, acordo = v_acordo
   where id = v_r.id;
  return jsonb_build_object('ref', v_r.id::text, 'ativ', v_r.ativ, 'decisao', v_dec, 'aplicados', v_n, 'acordo', v_acordo);
end $$;

create or replace function public._taf_ciclo_a_acordo(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_r public.taf_ciclo_replan; v_ac text := p_d ->> 'acordo';
begin
  select * into v_r from public.taf_ciclo_replan r where r.obra = p_obra and r.id = (p_d ->> 'replan')::bigint for update;
  if v_r.id is null then raise exception 'REPLANEJAMENTO NAO EXISTE'; end if;
  if v_r.acordo is distinct from 'pendente' then raise exception 'NAO HA DE ACORDO PENDENTE NESTE REPLANEJAMENTO'; end if;
  if v_r.autor = public._taf_ciclo_quem() then raise exception 'QUEM REPLANEJOU NAO DA O PROPRIO DE ACORDO'; end if;
  if v_ac not in ('ok','revisar') then raise exception 'DE ACORDO: OK OU REVISAR'; end if;
  update public.taf_ciclo_replan set acordo = v_ac, acordo_por = public._taf_ciclo_quem(), acordo_em = public._taf_ciclo_agora(),
    acordo_obs = nullif(trim(p_d ->> 'obs'), '') where id = v_r.id;
  return jsonb_build_object('ref', v_r.id::text, 'ativ', v_r.ativ, 'acordo', v_ac);
end $$;

-- ===== SALDO (uma vez só) =====
create or replace function public._taf_ciclo_a_saldo(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ref text := p_d ->> 'origem_ref'; v_oc public.taf_ciclo_comp; v_os public.taf_ciclo_semana; v_seg date := (p_d ->> 'seg')::date;
        v_s public.taf_ciclo_semana; v_cid text; v_lib jsonb; v_q numeric; v_u record;
begin
  select * into v_oc from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = split_part(v_ref, '|', 1)::date
                                                    and c.cid = split_part(v_ref, '|', 2) for update;
  if v_oc.cid is null then raise exception 'COMPROMISSO DE ORIGEM NAO EXISTE: %', v_ref; end if;
  select * into v_os from public.taf_ciclo_semana where obra = p_obra and seg = v_oc.seg;
  if v_os.estado <> 'fechada' then raise exception 'FECHE ANTES A SEMANA DE %', public._taf_ciclo_dm(v_oc.seg); end if;
  if v_oc.resultado not in ('parcial','nao') then raise exception 'NAO HA SALDO: COMPROMISSO CUMPRIDO'; end if;
  if v_oc.saldo is not null then
    select c.seg, c.cid into v_u from public.taf_ciclo_comp c where c.obra = p_obra and c.origem_ref = v_ref;
    raise exception 'SALDO JA DECIDIDO: %', case when v_oc.saldo = 'aceito'
      then 'ACEITO NA SEMANA DE ' || public._taf_ciclo_dm(v_u.seg) || ' (' || v_u.cid || ')' else 'DESCARTADO' end;
  end if;
  if coalesce((p_d ->> 'aceitar')::boolean, false) then
    if v_seg is null or v_seg <= v_oc.seg then raise exception 'SALDO VAI PARA UMA SEMANA DEPOIS DA ORIGEM'; end if;
    v_s := public._taf_ciclo_semana_abrir(p_obra, v_seg);
    if v_s.estado = 'fechada' then raise exception 'SEMANA FECHADA'; end if;
    if v_oc.ativ is not null then
      v_lib := public._taf_ciclo_liberada(p_obra, v_oc.ativ, v_seg);
      if not (v_lib ->> 'liberada')::boolean and not coalesce((p_d ->> 'com_restricao')::boolean, false) then
        raise exception 'NAO LIBERADA: %. MARQUE "COM RESTRICAO" E JUSTIFIQUE',
          (select string_agg(x, '; ') from jsonb_array_elements_text(v_lib -> 'falta') x);
      end if;
    end if;
    v_q := coalesce((p_d ->> 'qtd')::numeric, case when v_oc.qtd is not null then
             greatest(v_oc.qtd - coalesce(v_oc.feito_qtd, v_oc.qtd * coalesce(v_oc.feito_pct, 0) / 100.0), 0.001) end);
    select 'C' || (coalesce(max(substr(c.cid, 2)::int), 0) + 1) into v_cid from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg;
    begin
      insert into public.taf_ciclo_comp (obra, seg, cid, ativ, titulo, frente, entrega_tipo, entrega, qtd, un, resp, prometido, local,
        com_restricao, justif_restricao, origem, origem_ref, extra, quem)
      values (p_obra, v_seg, v_cid, v_oc.ativ, v_oc.titulo, v_oc.frente, coalesce(p_d ->> 'entrega_tipo', v_oc.entrega_tipo),
        coalesce(nullif(trim(p_d ->> 'entrega'), ''), 'Saldo: ' || coalesce(v_oc.falta, v_oc.entrega)),
        v_q, case when v_q is not null then v_oc.un end, coalesce(nullif(trim(p_d ->> 'resp'), ''), v_oc.resp),
        coalesce((p_d ->> 'prometido')::date, v_seg + 4), v_oc.local, coalesce((p_d ->> 'com_restricao')::boolean, false),
        nullif(trim(p_d ->> 'justif_restricao'), ''), 'saldo', v_ref, v_s.estado = 'publicada', public._taf_ciclo_quem());
    exception when unique_violation then raise exception 'SALDO JA USADO: %', v_ref;
    end;
    update public.taf_ciclo_comp c set saldo = 'aceito', em = now(), quem = public._taf_ciclo_quem()
     where c.obra = p_obra and c.seg = v_oc.seg and c.cid = v_oc.cid;
    return jsonb_build_object('ref', v_ref, 'ativ', v_oc.ativ, 'seg', v_seg, 'cid', v_cid, 'qtd', v_q);
  else
    update public.taf_ciclo_comp c set saldo = 'descartado', saldo_motivo = trim(p_d ->> 'motivo'), em = now(), quem = public._taf_ciclo_quem()
     where c.obra = p_obra and c.seg = v_oc.seg and c.cid = v_oc.cid;
    return jsonb_build_object('ref', v_ref, 'ativ', v_oc.ativ, 'descartado', true);
  end if;
end $$;

-- ===== DEMANDAS =====
create or replace function public._taf_ciclo_a_demanda(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dm public.taf_ciclo_demanda; v_num int := (p_d ->> 'num')::int; v_nova date; v_hoje date := public._taf_ciclo_hoje();
        v_quem text := public._taf_ciclo_quem(); v_sit text := p_d ->> 'situacao'; v_x text; v_ativs text[];
begin
  if v_num is null then
    v_num := public._taf_ciclo_demanda_criar(p_obra, p_d, coalesce(p_d ->> 'origem', 'manual'), nullif(p_d ->> 'origem_ref', ''));
    return jsonb_build_object('ref', 'D' || v_num, 'num', v_num);
  end if;
  select * into v_dm from public.taf_ciclo_demanda d where d.obra = p_obra and d.num = v_num for update;
  if v_dm.num is null then raise exception 'DEMANDA NAO EXISTE: D%', v_num; end if;
  perform public._taf_ciclo_em_lido(v_dm.em, v_dm.quem, p_d);
  if current_setting('taf.papel', true) = 'diretoria' and v_quem <> v_dm.resp and not (v_quem = any(v_dm.decisores)) then
    raise exception 'SEM PERMISSAO: SO O RESPONSAVEL, QUEM DECIDE OU O ENGENHEIRO MUDAM ESTA DEMANDA'; end if;
  if v_dm.situacao in ('resolvida','cancelada') and v_sit is distinct from 'aberta' then raise exception 'DEMANDA ENCERRADA'; end if;
  if p_d ? 'prazo' and (p_d ->> 'prazo')::date is distinct from v_dm.prazo then
    raise exception 'PRAZO ORIGINAL NAO MUDA: USE NOVA DATA'; end if;
  v_nova := case when p_d ? 'nova_data' then (p_d ->> 'nova_data')::date else v_dm.nova_data end;
  if v_nova is distinct from v_dm.nova_data then
    if v_nova is null or v_nova < v_hoje then raise exception 'NOVA DATA TEM QUE SER HOJE OU DEPOIS'; end if;
    if length(trim(coalesce(p_d ->> 'motivo', ''))) < 5 then raise exception 'NOVA DATA PRECISA DE MOTIVO'; end if;
  end if;
  if v_sit = 'cancelada' and length(trim(coalesce(p_d ->> 'motivo', ''))) < 5 then raise exception 'CANCELAR PRECISA DE MOTIVO'; end if;
  if p_d ? 'ativs' then
    select coalesce(array_agg(x order by x), '{}') into v_ativs from (select distinct jsonb_array_elements_text(p_d -> 'ativs') x) y;
    foreach v_x in array v_ativs loop
      if not exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_x) then
        raise exception 'ATIVIDADE NAO EXISTE: %', v_x; end if;
    end loop;
  end if;
  update public.taf_ciclo_demanda d set
    area = coalesce(upper(p_d ->> 'area'), d.area), oque = coalesce(nullif(trim(p_d ->> 'oque'), ''), d.oque),
    resp = coalesce(nullif(trim(p_d ->> 'resp'), ''), d.resp),
    pede_decisao = coalesce((p_d ->> 'pede_decisao')::boolean, d.pede_decisao),
    decisores = case when p_d ? 'decisores' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_d -> 'decisores') x), '{}') else d.decisores end,
    contraparte = case when p_d ? 'contraparte' then nullif(trim(p_d ->> 'contraparte'), '') else d.contraparte end,
    nova_data = v_nova, vezes = d.vezes + case when v_nova is distinct from d.nova_data then 1 else 0 end,
    ativs = coalesce(v_ativs, d.ativs), sem_ativ = coalesce((p_d ->> 'sem_ativ')::boolean, d.sem_ativ),
    ref_ext = case when p_d ? 'ref_ext' then nullif(trim(p_d ->> 'ref_ext'), '') else d.ref_ext end,
    tarefa_id = case when p_d ? 'tarefa_id' then nullif(p_d ->> 'tarefa_id', '') else d.tarefa_id end,
    cenario = case when p_d ? 'cenario' then p_d -> 'cenario' else d.cenario end,
    situacao = coalesce(v_sit, d.situacao),
    resolvida_em = case when v_sit = 'resolvida' then coalesce((p_d ->> 'resolvida_em')::date, v_hoje)
                        when v_sit = 'aberta' then null else d.resolvida_em end,
    resolvida_por = case when v_sit = 'resolvida' then v_quem when v_sit = 'aberta' then null else d.resolvida_por end,
    em = now(), quem = v_quem
  where d.obra = p_obra and d.num = v_num;
  return jsonb_build_object('ref', 'D' || v_num, 'num', v_num);
end $$;

create or replace function public._taf_ciclo_a_demanda_resp(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dm public.taf_ciclo_demanda; v_quem text := public._taf_ciclo_quem(); v_res boolean := coalesce((p_d ->> 'resolver')::boolean, false);
begin
  select * into v_dm from public.taf_ciclo_demanda d where d.obra = p_obra and d.num = (p_d ->> 'num')::int for update;
  if v_dm.num is null then raise exception 'DEMANDA NAO EXISTE'; end if;
  if v_dm.situacao in ('resolvida','cancelada') then raise exception 'DEMANDA ENCERRADA'; end if;
  if current_setting('taf.papel', true) <> 'gestor' and v_quem <> v_dm.resp and not (v_quem = any(v_dm.decisores))
     and not (current_setting('taf.papel', true) = 'engenheiro') then
    raise exception 'SO O RESPONSAVEL OU QUEM DECIDE RESPONDE'; end if;
  if length(trim(coalesce(p_d ->> 'resposta', ''))) < 3 then raise exception 'ESCREVA A RESPOSTA'; end if;
  update public.taf_ciclo_demanda d set situacao = case when v_res then 'resolvida' else 'respondida' end,
    resposta = left(trim(p_d ->> 'resposta'), 1000), respondida_por = v_quem, respondida_em = public._taf_ciclo_agora(),
    resolvida_em = case when v_res then coalesce((p_d ->> 'resolvida_em')::date, public._taf_ciclo_hoje()) end,
    resolvida_por = case when v_res then v_quem end, em = now(), quem = v_quem
  where d.obra = p_obra and d.num = v_dm.num;
  return jsonb_build_object('ref', 'D' || v_dm.num, 'num', v_dm.num, 'situacao', case when v_res then 'resolvida' else 'respondida' end);
end $$;

create or replace function public._taf_ciclo_a_cobrar(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dm public.taf_ciclo_demanda; v_txt text; v_trava text; v_imp text;
begin
  select * into v_dm from public.taf_ciclo_demanda d where d.obra = p_obra and d.num = (p_d ->> 'num')::int for update;
  if v_dm.num is null then raise exception 'DEMANDA NAO EXISTE'; end if;
  select string_agg(a.id || ' ' || a.nome, '; ' order by a.ordem) into v_trava from public.taf_ciclo_ativ a
   where a.obra = p_obra and a.id = any(v_dm.ativs);
  select string_agg(coalesce('EVENTO ' || (e ->> 'ev'), e ->> 'id') || ' +' || (e ->> 'd') || 'd', ', ') into v_imp
    from jsonb_array_elements(coalesce(v_dm.impacto -> 'mais_7' -> 'eventos', '[]')) e;
  v_txt := format('D%s (%s) para %s: %s. Precisa até %s%s.%s%s', v_dm.num, v_dm.area, v_dm.resp, v_dm.oque,
    public._taf_ciclo_dm(v_dm.prazo),
    case when v_dm.nova_data is not null then format(' (nova data %s, %sª vez)', public._taf_ciclo_dm(v_dm.nova_data), v_dm.vezes) else '' end,
    case when v_trava is not null then ' Trava: ' || v_trava || '.' else '' end,
    case when v_imp is not null then ' Se atrasar 7 dias: ' || v_imp || '.' else '' end);
  update public.taf_ciclo_demanda d set cobrancas = d.cobrancas || jsonb_build_array(jsonb_build_object('em', public._taf_ciclo_agora(),
      'quem', public._taf_ciclo_quem(), 'canal', coalesce(p_d ->> 'canal', 'whatsapp'))), em = now(), quem = public._taf_ciclo_quem()
   where d.obra = p_obra and d.num = v_dm.num;
  return jsonb_build_object('ref', 'D' || v_dm.num, 'num', v_dm.num, 'texto', v_txt, 'cobrancas', jsonb_array_length(v_dm.cobrancas) + 1);
end $$;

create or replace function public._taf_ciclo_a_impacto(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_imp jsonb := public._taf_ciclo_impacto(p_obra, (p_d ->> 'num')::int);
begin
  update public.taf_ciclo_demanda d set impacto = v_imp, em = now(), quem = public._taf_ciclo_quem()
   where d.obra = p_obra and d.num = (p_d ->> 'num')::int;
  return jsonb_build_object('ref', 'D' || (p_d ->> 'num'), 'num', (p_d ->> 'num')::int, 'impacto', v_imp);
end $$;

-- ===== PORTA ÚNICA DE ESCRITA =====
create or replace function public.taf_ciclo_salvar(p_chave text, p_obra text, p_acao text, p_dados jsonb, p_uid uuid,
                                                   p_quem text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_a record; v_ev public.taf_ciclo_evento; v_r jsonb; v_d jsonb := coalesce(p_dados, '{}'); v_c text;
begin
  if p_uid is null then raise exception 'FALTA UID'; end if;
  select * into v_a from public._taf_ciclo_ator(p_chave, p_obra, p_quem);
  select * into v_ev from public.taf_ciclo_evento where uid = p_uid;
  if v_ev.id is not null then                                     -- reenvio da fila do celular: não grava de novo
    return coalesce(v_ev.resultado, '{}') || jsonb_build_object('repetido', true);
  end if;
  if v_a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  if not public._taf_ciclo_pode(v_a.papel, p_acao) then
    raise exception 'SEM PERMISSAO: % NAO PODE %', upper(v_a.papel), upper(coalesce(p_acao, '?')); end if;
  perform set_config('taf.quem', v_a.nome, true), set_config('taf.papel', v_a.papel, true),
          set_config('taf.verif', v_a.verificado::text, true), set_config('taf.acao', p_acao, true),
          set_config('taf.uid', p_uid::text, true), set_config('taf.motivo', coalesce(left(v_d ->> 'motivo', 300), ''), true);
  begin
  v_r := case p_acao
    when 'preparo'       then public._taf_ciclo_a_preparo(p_obra, v_d)
    when 'preparo_ok'    then public._taf_ciclo_a_preparo_ok(p_obra, v_d)
    when 'comp'          then public._taf_ciclo_a_comp(p_obra, v_d)
    when 'comp_tirar'    then public._taf_ciclo_a_comp_tirar(p_obra, v_d)
    when 'comp_cancelar' then public._taf_ciclo_a_comp_cancelar(p_obra, v_d)
    when 'fora'          then public._taf_ciclo_a_fora(p_obra, v_d)
    when 'publicar'      then public._taf_ciclo_a_publicar(p_obra, v_d)
    when 'apont'         then public._taf_ciclo_a_apont(p_obra, v_d)
    when 'apont_lote'    then public._taf_ciclo_a_apont_lote(p_obra, v_d)
    when 'apont_apagar'  then public._taf_ciclo_a_apont_apagar(p_obra, v_d)
    when 'real'          then public._taf_ciclo_a_real(p_obra, v_d)
    when 'fechar_item'   then public._taf_ciclo_a_fechar_item(p_obra, v_d)
    when 'fechar_semana' then public._taf_ciclo_a_fechar_semana(p_obra, v_d)
    when 'reabrir'       then public._taf_ciclo_a_reabrir(p_obra, v_d)
    when 'replan'        then public._taf_ciclo_a_replan(p_obra, v_d)
    when 'efeito'        then public._taf_ciclo_a_efeito(p_obra, v_d)
    when 'acordo'        then public._taf_ciclo_a_acordo(p_obra, v_d)
    when 'saldo'         then public._taf_ciclo_a_saldo(p_obra, v_d)
    when 'demanda'       then public._taf_ciclo_a_demanda(p_obra, v_d)
    when 'demanda_resp'  then public._taf_ciclo_a_demanda_resp(p_obra, v_d)
    when 'cobrar'        then public._taf_ciclo_a_cobrar(p_obra, v_d)
    when 'impacto'       then public._taf_ciclo_a_impacto(p_obra, v_d)
  end;
  if v_r is null then raise exception 'ACAO DESCONHECIDA: %', p_acao; end if;
  insert into public.taf_ciclo_evento (obra, acao, ref, ativ, dados, resultado, autor, papel, verificado, uid)
  values (p_obra, p_acao, v_r ->> 'ref', v_r ->> 'ativ', v_d, v_r, v_a.nome, v_a.papel, v_a.verificado, p_uid);
  exception when unique_violation then                            -- o mesmo uid chegou duas vezes ao mesmo tempo
    get stacked diagnostics v_c = constraint_name;
    if v_c is distinct from 'taf_ciclo_evento_uid_key' then raise; end if;
    return coalesce((select e.resultado from public.taf_ciclo_evento e where e.uid = p_uid), '{}') || jsonb_build_object('repetido', true);
  end;
  return v_r || jsonb_build_object('ok', true, 'quem', v_a.nome, 'papel', v_a.papel,
    'versao', (select coalesce(max(l.id), 0) from public.taf_ciclo_log l where l.obra = p_obra));
end $$;
-- Migration taf_ciclo_v1_funcoes (parte C: leitura e permissões)

create or replace function public._taf_ciclo_alerta(p_obra text, p_dm public.taf_ciclo_demanda) returns text
language sql stable security definer set search_path = public as $$
  select case when p_dm.situacao in ('resolvida','cancelada') then null
    when p_dm.resp = any(o.setores) then 'SEM DONO (setor)'
    when coalesce(p_dm.nova_data, p_dm.prazo) < public._taf_ciclo_hoje() then 'VENCIDA'
    when coalesce(p_dm.nova_data, p_dm.prazo) <= public._taf_ciclo_hoje() + 7 then 'ESTA SEMANA'
    when coalesce(p_dm.nova_data, p_dm.prazo) <= public._taf_ciclo_hoje() + 42 then 'PRÓXIMAS 6 SEMANAS'
    else 'NO PRAZO' end
  from public.taf_ciclo_obra o where o.obra = p_obra $$;

-- Tudo o que as telas precisam, numa chamada. p_seg = segunda da semana em foco (padrão: a semana de hoje).
create or replace function public.taf_ciclo_ler(p_chave text, p_obra text, p_seg date default null, p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_a record; v_hoje date := public._taf_ciclo_hoje(); v_seg date; v_o public.taf_ciclo_obra; v_sem jsonb; v_t jsonb; v_sug jsonb;
begin
  select * into v_a from public._taf_ciclo_ator(p_chave, p_obra, p_quem);
  select * into v_o from public.taf_ciclo_obra where obra = p_obra;
  v_sug := public._taf_ciclo_sugestao(p_obra, '{}');   -- previsão gravada x lógica: o que está desatualizado
  v_seg := coalesce(public._taf_ciclo_segunda(p_seg), public._taf_ciclo_segunda(v_hoje));
  begin
    select coalesce(jsonb_object_agg(t.id, jsonb_build_object('sit', t.d ->> 'sit', 'dono', t.d ->> 'dono', 'ate', t.d ->> 'ate',
                    'nova', t.d ->> 'nova', 'txt', t.d ->> 'txt')), '{}')
      into v_t from public._taf_tarefas() t where t.d ->> 'obra' = p_obra;
  exception when others then v_t := '{}';   -- o site principal fora do ar não derruba o ciclo
  end;
  select to_jsonb(s) - 'janela' || jsonb_build_object(
      'comps', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
          'ativ_nome', (select a.nome from public.taf_ciclo_ativ a where a.obra = c.obra and a.id = c.ativ),
          'apont', coalesce((select jsonb_agg(to_jsonb(x) - 'obra' - 'seg' - 'cid' order by x.dia)
                               from public.taf_ciclo_apont x where x.obra = c.obra and x.seg = c.seg and x.cid = c.cid), '[]'),
          'replan', (select jsonb_build_object('id', r.id, 'decisao', r.decisao, 'acordo', r.acordo, 'fim_novo', r.fim_novo)
                       from public.taf_ciclo_replan r where r.obra = c.obra and r.seg = c.seg and r.cid = c.cid order by r.id desc limit 1),
          'saldo_em', (select jsonb_build_object('seg', y.seg, 'cid', y.cid) from public.taf_ciclo_comp y
                        where y.obra = c.obra and y.origem_ref = c.seg || '|' || c.cid))
          order by substr(c.cid, 2)::int)
        from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg), '[]'),
      'tem_janela', s.janela is not null)
    into v_sem from public.taf_ciclo_semana s where s.obra = p_obra and s.seg = v_seg;
  return jsonb_build_object(
    'ator', jsonb_build_object('nome', v_a.nome, 'papel', v_a.papel, 'verificado', v_a.verificado),
    'hoje', v_hoje, 'agora', public._taf_ciclo_agora(),
    'versao', (select coalesce(max(l.id), 0) from public.taf_ciclo_log l where l.obra = p_obra),
    'obra', to_jsonb(v_o) - 'criado_em',
    'areas', (select jsonb_agg(to_jsonb(x) - 'obra' || jsonb_build_object('falta_pessoa', x.dono is null or x.dono = any(v_o.setores))
                 order by x.ordem) from public.taf_ciclo_area x where x.obra = p_obra),
    'feriados', (select jsonb_agg(jsonb_build_object('data', h.data, 'nome', h.nome, 'abrangencia', h.abrangencia, 'cal_mpp', h.cal_mpp) order by h.data)
                   from public.taf_ciclo_feriado h where h.obra in ('*', p_obra)),
    'seg', v_seg, 'prazos', public._taf_ciclo_prazos(p_obra, v_seg),
    'semana', coalesce(v_sem, jsonb_build_object('seg', v_seg, 'estado', 'nova', 'comps', '[]'::jsonb)),
    'janela_publicada', (select s.janela from public.taf_ciclo_semana s where s.obra = p_obra and s.seg = v_seg),
    'programacao', public._taf_ciclo_programacao(p_obra, v_seg),
    'fora', (select coalesce(jsonb_agg(to_jsonb(f) - 'obra' - 'seg'), '[]') from public.taf_ciclo_fora f where f.obra = p_obra and f.seg = v_seg),
    'placar', public._taf_ciclo_resumo(p_obra, v_seg),
    'janela', public._taf_ciclo_janela(p_obra, v_seg),
    'pendencias', jsonb_build_object(
      'desatualizadas', public._taf_ciclo_sug_curta(v_sug) ||
                        jsonb_build_object('ids', (select coalesce(jsonb_agg(e -> 'id'), '[]') from jsonb_array_elements(v_sug -> 'lista') e)),
      -- dia útil de semana publicada sem nenhum lançamento depois do prazo (9h do dia seguinte)
      'dias_sem_apont', (select coalesce(jsonb_agg(u.d order by u.d), '[]') from
                  (select (jsonb_array_elements_text(public._taf_ciclo_prazos(p_obra, s.seg) -> 'uteis'))::date as d, s.seg
                     from public.taf_ciclo_semana s where s.obra = p_obra and s.estado = 'publicada') u
                  where public._taf_ciclo_agora() > ((u.d + 1) + time '09:00') at time zone 'America/Sao_Paulo'
                    and not exists (select 1 from public.taf_ciclo_apont a where a.obra = p_obra and a.seg = u.seg and a.dia = u.d)),
      'fechar', (select coalesce(jsonb_agg(s.seg order by s.seg), '[]') from public.taf_ciclo_semana s
                  where s.obra = p_obra and s.estado = 'publicada' and s.seg < v_seg),
      'saldo', (select coalesce(jsonb_agg(jsonb_build_object('ref', c.seg || '|' || c.cid, 'ativ', c.ativ, 'entrega', c.entrega,
                  'qtd', c.qtd, 'un', c.un, 'feito_qtd', c.feito_qtd, 'feito_pct', c.feito_pct, 'falta', c.falta,
                  'resultado', c.resultado, 'resp', c.resp) order by c.seg, c.cid), '[]')
                  from public.taf_ciclo_comp c join public.taf_ciclo_semana s on s.obra = c.obra and s.seg = c.seg
                 where c.obra = p_obra and s.estado = 'fechada' and c.resultado in ('parcial','nao') and c.saldo is null
                   and not exists (select 1 from public.taf_ciclo_ativ a where a.obra = c.obra and a.id = c.ativ and a.fim_real is not null)),
      'replan', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'ativ', r.ativ, 'fim_novo', r.fim_novo, 'n', r.sugestao -> 'resumo' -> 'n')
                  order by r.id), '[]') from public.taf_ciclo_replan r where r.obra = p_obra and r.decisao = 'pendente'),
      'acordo', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'ativ', r.ativ, 'decisao', r.decisao, 'autor', r.autor,
                  'fim_antes', r.fim_antes, 'fim_novo', r.fim_novo, 'justif', r.justif, 'dispensa', r.dispensa,
                  'resumo', r.sugestao -> 'resumo') order by r.id), '[]')
                  from public.taf_ciclo_replan r where r.obra = p_obra and r.acordo = 'pendente'),
      'sem_replan', (select coalesce(jsonb_agg(jsonb_build_object('seg', c.seg, 'cid', c.cid, 'ativ', c.ativ) order by c.seg, c.cid), '[]')
                  from public.taf_ciclo_comp c join public.taf_ciclo_semana s on s.obra = c.obra and s.seg = c.seg
                  join public.taf_ciclo_ativ a on a.obra = c.obra and a.id = c.ativ
                 where c.obra = p_obra and s.estado = 'publicada' and c.resultado in ('parcial','nao') and a.fim_real is null
                   and not exists (select 1 from public.taf_ciclo_replan r where r.obra = c.obra and r.seg = c.seg and r.cid = c.cid))),
    'demandas', (select coalesce(jsonb_agg(to_jsonb(d) - 'obra' || jsonb_build_object(
                    'efetivo', coalesce(d.nova_data, d.prazo), 'dias', coalesce(d.nova_data, d.prazo) - v_hoje,
                    'alerta', public._taf_ciclo_alerta(p_obra, d),
                    'vencida_7', d.situacao in ('aberta','respondida') and coalesce(d.nova_data, d.prazo) < v_hoje - 7,
                    'diverge', case when d.tarefa_id is null then null
                      when not v_t ? d.tarefa_id then d.tarefa_id || ' não encontrada no site'
                      when v_t -> d.tarefa_id ->> 'sit' = 'RESOLVIDA' and d.situacao in ('aberta','respondida')
                        then 'No site, ' || d.tarefa_id || ' está RESOLVIDA'
                      when d.situacao = 'resolvida' and v_t -> d.tarefa_id ->> 'sit' <> 'RESOLVIDA'
                        then 'No site, ' || d.tarefa_id || ' continua ' || (v_t -> d.tarefa_id ->> 'sit')
                      when coalesce(nullif(v_t -> d.tarefa_id ->> 'nova', ''), v_t -> d.tarefa_id ->> 'ate') ~ '^\d{4}-\d{2}-\d{2}$'
                       and coalesce(nullif(v_t -> d.tarefa_id ->> 'nova', ''), v_t -> d.tarefa_id ->> 'ate')::date
                           is distinct from coalesce(d.nova_data, d.prazo)
                        then 'No site, ' || d.tarefa_id || ' vence em ' ||
                             public._taf_ciclo_dm(coalesce(nullif(v_t -> d.tarefa_id ->> 'nova', ''), v_t -> d.tarefa_id ->> 'ate')::date) ||
                             ' (aqui ' || public._taf_ciclo_dm(coalesce(d.nova_data, d.prazo)) || ')' end,
                    'area_rotulo', (select x.rotulo from public.taf_ciclo_area x where x.obra = d.obra and x.area = d.area),
                    'tarefa', case when d.tarefa_id is not null then v_t -> d.tarefa_id end) order by d.num), '[]')
                   from public.taf_ciclo_demanda d where d.obra = p_obra),
    'donos', (select coalesce(jsonb_object_agg(x.resp, jsonb_build_object('abertas', x.n, 'vencidas', x.v, 'mais_de_8', x.n > 8,
                 'setor', x.resp = any(v_o.setores))), '{}')
                from (select d.resp, count(*) as n, count(*) filter (where coalesce(d.nova_data, d.prazo) < v_hoje) as v
                        from public.taf_ciclo_demanda d where d.obra = p_obra and d.situacao in ('aberta','respondida') group by d.resp) x),
    'replans', (select coalesce(jsonb_agg(to_jsonb(r) - 'obra' - 'sugestao' || jsonb_build_object('resumo', r.sugestao -> 'resumo')
                   order by r.id desc), '[]')
                  from (select * from public.taf_ciclo_replan x where x.obra = p_obra order by x.id desc limit 60) r),
    'crono', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', a.id, 'o', a.ordem, 'nome', a.nome, 'fase', a.fase,
                 'tipo', a.tipo, 'ev', a.evento, 'contratual', nullif(a.contratual, false), 'cal', a.cal, 'dur', a.dur,
                 'ini_base', a.ini_base, 'fim_base', a.fim_base,
                 'ini', coalesce(a.prev_ini, a.ini_base), 'fim', coalesce(a.prev_fim, a.fim_base),
                 'ini_real', a.ini_real, 'fim_real', a.fim_real, 'real_origem', a.real_origem, 'prev_replan', a.prev_replan,
                 'atraso', coalesce(a.fim_real, a.prev_fim, a.fim_base) - a.fim_base,
                 'vencida', a.fim_real is null and coalesce(a.prev_fim, a.fim_base) < v_hoje,
                 'nao_comecou', a.ini_real is null and coalesce(a.prev_ini, a.ini_base) < v_hoje and a.dur > 0,
                 'pred', a.pred, 'bm', case when a.tipo in ('evento','evento_pct') then public._taf_ciclo_bm(p_obra, coalesce(a.fim_real, a.prev_fim, a.fim_base)) end))
                 order by a.ordem) from public.taf_ciclo_ativ a where a.obra = p_obra),
    'semanas', (select coalesce(jsonb_agg(jsonb_build_object('seg', s.seg, 'sexta', s.sexta, 'estado', s.estado, 'status_pub', s.status_pub,
                  'cobertura', s.cobertura, 'reaberta', s.reaberta,
                  'ppc', coalesce(s.resumo_atual, s.resumo) -> 'ppc', 'ppc_1o', s.resumo -> 'ppc',
                  'publicados', coalesce(s.resumo_atual, s.resumo) -> 'publicados', 'cumpridos', coalesce(s.resumo_atual, s.resumo) -> 'cumpridos',
                  'por_causa', coalesce(s.resumo_atual, s.resumo) -> 'por_causa', 'qtd_pct', coalesce(s.resumo_atual, s.resumo) -> 'qtd_pct',
                  'dias_apontados_obra', coalesce(s.resumo_atual, s.resumo) -> 'dias_apontados_obra', 'nota', s.nota)
                  order by s.seg), '[]') from public.taf_ciclo_semana s where s.obra = p_obra));
end $$;

-- Para o aparelho saber se precisa recarregar (chamada a cada 30 s)
create or replace function public.taf_ciclo_versao(p_chave text, p_obra text) returns bigint
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._taf_ciclo_ator(p_chave, p_obra, null);
  return (select coalesce(max(l.id), 0) from public.taf_ciclo_log l where l.obra = p_obra);
end $$;

-- "E se?": efeito de mudar o início e/ou o término de uma atividade (não grava nada)
create or replace function public.taf_ciclo_simular(p_chave text, p_obra text, p_ativ text, p_ini date default null,
                                                    p_fim date default null, p_dispensa text[] default '{}', p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_a record;
begin
  select * into v_a from public._taf_ciclo_ator(p_chave, p_obra, p_quem);
  if v_a.papel = 'leitura' then raise exception 'SEM PERMISSAO: LEITURA NAO SIMULA'; end if;
  if p_ini is null and p_fim is null then raise exception 'INFORME O NOVO INICIO OU O NOVO TERMINO'; end if;
  if not exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = p_ativ) then
    raise exception 'ATIVIDADE NAO EXISTE: %', p_ativ; end if;
  return public._taf_ciclo_sugestao(p_obra,
           jsonb_build_object(p_ativ, jsonb_strip_nulls(jsonb_build_object('ini', p_ini, 'fim', p_fim))), p_dispensa);
end $$;

create or replace function public.taf_ciclo_folga(p_chave text, p_obra text, p_ativ text, p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_a record;
begin
  select * into v_a from public._taf_ciclo_ator(p_chave, p_obra, p_quem);
  if v_a.papel = 'leitura' then raise exception 'SEM PERMISSAO: LEITURA NAO SIMULA'; end if;
  return public._taf_ciclo_folga(p_obra, p_ativ);
end $$;

-- Histórico (quem mudou o quê, quando). Filtros opcionais por tabela, item e atividade.
create or replace function public.taf_ciclo_historico(p_chave text, p_obra text, p_tabela text default null, p_item text default null,
                                                      p_ativ text default null, p_limite int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._taf_ciclo_ator(p_chave, p_obra, null);
  return (select coalesce(jsonb_agg(to_jsonb(l) - 'obra' order by l.id desc), '[]')
            from (select * from public.taf_ciclo_log x
                   where x.obra = p_obra and (p_tabela is null or x.tabela = 'taf_ciclo_' || p_tabela)
                     and (p_item is null or x.chave = p_item) and (p_ativ is null or x.ativ = p_ativ)
                   order by x.id desc limit least(greatest(coalesce(p_limite, 200), 1), 1000)) l);
end $$;

-- Cor mais grave: VERDE < SEM BASE < AMARELO < VERMELHO. SEM BASE nunca vira verde.
create or replace function public._taf_ciclo_pior(p_cores text[]) returns text
language sql immutable as $$
  select c from unnest(p_cores) c
   order by case c when 'VERMELHO' then 4 when 'AMARELO' then 3 when 'SEM BASE' then 2 else 1 end desc limit 1 $$;

-- Aba Situação do /ciclo: 3 luzes (rev6 01A), frase-resumo por regra, "para você decidir", EVENTOs em risco,
-- qualidade do dado e o texto do "Copiar resumo". Nada aqui é gravado.
create or replace function public._taf_ciclo_situacao(p_obra text, p_pessoa text, p_papel text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_o public.taf_ciclo_obra; v_hoje date := public._taf_ciclo_hoje(); v_s public.taf_ciclo_semana; v_r jsonb;
        v_px public.taf_ciclo_semana; v_seg_px date; v_p2 jsonb; v_p3 jsonb; v_p4 jsonb; v_p6 jsonb; v_p8 jsonb; v_p10 jsonb;
        v_prod jsonb; v_plano jsonb; v_din jsonb; v_venc int; v_vence int; v_n int; v_nr int; v_sd int;
        v_ev jsonb := '[]'; v_dm record; v_imp jsonb; v_e jsonb; v_dec jsonb; v_q jsonb; v_frase text[] := '{}';
        v_rp record; v_txt text; v_ppc int; v_cor text; v_lin text; v_atr text[]; v_anc jsonb := '{}'; v_x record;
        v_set text[]; v_lk jsonb;
begin
  select * into v_o from public.taf_ciclo_obra where obra = p_obra;
  select * into v_s from public.taf_ciclo_semana where obra = p_obra and estado = 'fechada' order by seg desc limit 1;
  v_r := coalesce(v_s.resumo_atual, v_s.resumo);

  -- P2 PPC
  if v_s.seg is null or coalesce((v_r ->> 'publicados')::int, 0) = 0 then
    v_p2 := jsonb_build_object('cor', 'SEM BASE', 'motivo', 'nenhuma semana fechada com compromisso');
  elsif coalesce((v_r ->> 'dias_apontados_obra')::int, 0) < 5 then
    v_p2 := jsonb_build_object('cor', 'SEM BASE', 'motivo', format('só %s dias apontados na obra (mínimo 5)', coalesce(v_r ->> 'dias_apontados_obra', '0')));
  else
    v_ppc := (v_r ->> 'ppc')::int;
    v_p2 := jsonb_build_object('cor', case when v_ppc >= v_o.ppc_verde then 'VERDE' when v_ppc >= v_o.ppc_amarelo then 'AMARELO' else 'VERMELHO' end,
                               'motivo', format('PPC %s%% (%s de %s)', v_ppc, v_r ->> 'cumpridos', v_r ->> 'publicados'), 'valor', v_ppc);
  end if;
  v_p3 := jsonb_build_object('cor', 'SEM BASE', 'motivo', 'efetivo em campo não é apontado na v1');
  if v_s.seg is null or (v_r ->> 'qtd_pct') is null then
    v_p4 := jsonb_build_object('cor', 'SEM BASE', 'motivo', 'nenhum compromisso com quantidade');
  else
    v_p4 := jsonb_build_object('cor', case when (v_r ->> 'qtd_pct')::int >= 90 then 'VERDE' when (v_r ->> 'qtd_pct')::int >= 70 then 'AMARELO' else 'VERMELHO' end,
                               'motivo', format('quantidade %s%% do prometido em %s compromisso(s)', v_r ->> 'qtd_pct', v_r ->> 'qtd_n'),
                               'valor', (v_r ->> 'qtd_pct')::int);
  end if;
  v_prod := jsonb_build_object('cor', public._taf_ciclo_pior(array[v_p2 ->> 'cor', v_p3 ->> 'cor', v_p4 ->> 'cor']),
                               'P2', v_p2, 'P3', v_p3, 'P4', v_p4);

  -- P6 restrições (demandas abertas ou respondidas)
  select count(*) filter (where coalesce(d.nova_data, d.prazo) < v_hoje),
         count(*) filter (where coalesce(d.nova_data, d.prazo) between v_hoje and v_hoje + 7),
         count(*) filter (where d.resp = any(v_o.setores))
    into v_venc, v_vence, v_sd
    from public.taf_ciclo_demanda d where d.obra = p_obra and d.situacao in ('aberta','respondida');
  v_p6 := jsonb_build_object('cor', case when v_venc >= 3 then 'VERMELHO' when v_venc > 0 or v_vence > 0 then 'AMARELO' else 'VERDE' end,
                             'motivo', format('%s vencida(s); %s vence(m) até %s', v_venc, v_vence, public._taf_ciclo_dm(v_hoje + 7)));
  -- P8 compromisso da semana seguinte à fechada (ou desta, se nenhuma fechou)
  v_seg_px := coalesce(v_s.seg + 7, public._taf_ciclo_segunda(v_hoje));
  select * into v_px from public.taf_ciclo_semana where obra = p_obra and seg = v_seg_px;
  select count(*), count(*) filter (where c.com_restricao) into v_n, v_nr
    from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg_px and c.cancelado_em is null and not c.extra;
  v_p8 := case
    when v_n = 0 then jsonb_build_object('cor', 'VERMELHO', 'motivo', format('sem compromisso para a semana de %s', public._taf_ciclo_dm(v_seg_px)))
    when v_px.estado = 'rascunho' then jsonb_build_object('cor', 'AMARELO', 'motivo', format('semana de %s só proposta (não publicada)', public._taf_ciclo_dm(v_seg_px)))
    when v_nr > 0 then jsonb_build_object('cor', 'AMARELO', 'motivo', format('%s de %s compromissos assumidos com restrição', v_nr, v_n))
    when exists (select 1 from public.taf_ciclo_demanda d join public.taf_ciclo_comp c on c.obra = d.obra and c.seg = v_seg_px and c.ativ = any(d.ativs)
                  where d.obra = p_obra and d.situacao in ('aberta','respondida') and d.resp = any(v_o.setores))
         then jsonb_build_object('cor', 'AMARELO', 'motivo', 'restrição sem dono (setor) numa frente da semana')
    else jsonb_build_object('cor', 'VERDE', 'motivo', format('%s compromissos publicados sem restrição aberta', v_n)) end;
  v_p10 := jsonb_build_object('cor', 'SEM BASE', 'motivo', 'IDP depende do BM e do % físico (v2)');
  v_plano := jsonb_build_object('cor', public._taf_ciclo_pior(array[v_p6 ->> 'cor', v_p8 ->> 'cor', v_p10 ->> 'cor']),
                                'P6', v_p6, 'P8', v_p8, 'P10', v_p10);
  v_din := jsonb_build_object('cor', 'SEM BASE', 'motivo', 'custo, margem e caixa ficam para a v2 (P1, P5, P7, P9)');

  -- EVENTOs e marcos contratuais em risco
  -- atrasadas (não começou no previsto ou já devia ter terminado) e, para cada atividade, as atrasadas antes dela
  select coalesce(array_agg(a.id), '{}') into v_atr from public.taf_ciclo_ativ a
   where a.obra = p_obra and a.fim_real is null and a.dur > 0 and a.tipo in ('ativ','continua')
     and ((a.ini_real is null and coalesce(a.prev_ini, a.ini_base) < v_hoje) or coalesce(a.prev_fim, a.fim_base) < v_hoje);
  for v_x in select a.id, a.pred from public.taf_ciclo_ativ a where a.obra = p_obra order by a.topo loop
    v_set := '{}';
    for v_lk in select jsonb_array_elements(v_x.pred) loop
      v_set := v_set || coalesce((select array_agg(u) from jsonb_array_elements_text(v_anc -> (v_lk ->> 0)) u), '{}');
      if (v_lk ->> 0) = any(v_atr) then v_set := v_set || (v_lk ->> 0); end if;
    end loop;
    v_anc := v_anc || jsonb_build_object(v_x.id, (select coalesce(jsonb_agg(distinct u order by u), '[]') from unnest(v_set) u));
  end loop;
  -- EVENTOs e marcos contratuais: previsão vigente x projeção pela lógica com hoje como data de status
  with proj as (select * from public._taf_ciclo_cpm(p_obra, '{}', v_hoje - 1)),
  ev as (select a.id, a.nome, a.evento, a.tipo, a.contratual, coalesce(a.prev_fim, a.fim_base) as vf, p.fim as pf
           from public.taf_ciclo_ativ a join proj p on p.id = a.id
          where a.obra = p_obra and a.fim_real is null and (a.tipo in ('evento','evento_pct') or a.contratual))
  select coalesce(jsonb_agg(jsonb_build_object('id', ev.id, 'nome', ev.nome, 'ev', ev.evento, 'tipo', ev.tipo, 'data', ev.vf,
           'bm', public._taf_ciclo_bm(p_obra, ev.vf), 'logica', ev.pf, 'd_logica', ev.pf - ev.vf,
           'atrasadas', coalesce(v_anc -> ev.id, '[]'),
           'aviso_dia', public._taf_ciclo_aviso_dia(p_obra, ev.vf, ev.tipo),
           'dias_corte', case when v_o.corte_bm_dia is not null then
              make_date(extract(year from m)::int, extract(month from m)::int, least(v_o.corte_bm_dia, extract(day from (date_trunc('month', m) + interval '1 month - 1 day'))::int)) - ev.vf end)
         order by ev.vf), '[]')
    into v_ev
    from ev cross join lateral (select case when extract(day from ev.vf) <= coalesce(v_o.corte_bm_dia, 31) then ev.vf
                                            else (date_trunc('month', ev.vf) + interval '1 month')::date end as m) mm(m);
  -- efeito de cada demanda aberta que trava atividade
  for v_dm in select * from public.taf_ciclo_demanda d where d.obra = p_obra and d.situacao in ('aberta','respondida')
                 and cardinality(d.ativs) > 0 order by d.num loop
    v_imp := public._taf_ciclo_impacto(p_obra, v_dm.num);
    select coalesce(jsonb_agg(case when x ? 'no_prazo' or x ? 'mais_7'
                                   then e || jsonb_build_object('demandas', coalesce(e -> 'demandas', '[]') || jsonb_build_array(x))
                                   else e end order by (e ->> 'data')::date), '[]')
      into v_ev
      from jsonb_array_elements(v_ev) e
      cross join lateral (select jsonb_strip_nulls(jsonb_build_object('num', v_dm.num, 'efetivo', coalesce(v_dm.nova_data, v_dm.prazo),
               'no_prazo', (select (y ->> 'd')::int from jsonb_array_elements(v_imp -> 'no_prazo' -> 'eventos') y where y ->> 'id' = e ->> 'id'),
               'mais_7', (select (y ->> 'd')::int from jsonb_array_elements(v_imp -> 'mais_7' -> 'eventos') y where y ->> 'id' = e ->> 'id'))) as x) xx;
  end loop;
  -- nível e motivo de cada um; ficam só os que têm motivo
  select coalesce(jsonb_agg(z.j order by case z.j ->> 'nivel' when 'VERMELHO' then 1 else 2 end, (z.j ->> 'data')::date), '[]') into v_ev
    from (select e || jsonb_build_object(
                 'nivel', case when (e ->> 'd_logica')::int > 0
                                 or exists (select 1 from jsonb_array_elements(coalesce(e -> 'demandas', '[]')) x where (x ->> 'no_prazo')::int > 0)
                               then 'VERMELHO' else 'AMARELO' end,
                 'motivos', to_jsonb(array_remove(array[
                    case when (e ->> 'd_logica')::int > 0 and (e ->> 'data')::date < v_hoje then
                         format('previsto para %s e ainda sem data real', public._taf_ciclo_dm((e ->> 'data')::date))
                         when (e ->> 'd_logica')::int > 0 then format('pela lógica, contando de hoje, vai para %s (+%s)%s',
                         public._taf_ciclo_dm((e ->> 'logica')::date), e ->> 'd_logica',
                         case when jsonb_array_length(e -> 'atrasadas') > 0 then ': ' ||
                              (select string_agg(x, ', ') from jsonb_array_elements_text(e -> 'atrasadas') x) || ' atrasada(s)' else '' end) end,
                    (select string_agg(case when (x ->> 'no_prazo')::int > 0
                                            then format('D%s resolvida em %s ainda empurra +%s', x ->> 'num', public._taf_ciclo_dm((x ->> 'efetivo')::date), x ->> 'no_prazo')
                                            else format('se D%s atrasar 7 dias: +%s', x ->> 'num', x ->> 'mais_7') end, '; ')
                       from jsonb_array_elements(coalesce(e -> 'demandas', '[]')) x where (x ->> 'no_prazo')::int > 0 or (x ->> 'mais_7')::int > 0),
                    case when (e ->> 'data')::date <= v_hoje + 42 then e ->> 'aviso_dia' end,   -- alerta de data: só nas 6 semanas
                    case when (e ->> 'data')::date <= v_hoje + 42 and (e ->> 'dias_corte')::int between 0 and 5 then
                         format('a %s dia(s) do corte do BM (dia %s, %s): pode passar para o BM seguinte (regra proposta, R94)',
                                e ->> 'dias_corte', v_o.corte_bm_dia, coalesce(v_o.corte_bm_sit, 'PROPOSTA')) end], null))) as j
            from jsonb_array_elements(v_ev) e) z
   where jsonb_array_length(z.j -> 'motivos') > 0;

  -- Para você decidir (pela pessoa da chave)
  v_dec := jsonb_build_object(
    'demandas', (select coalesce(jsonb_agg(jsonb_build_object('num', d.num, 'area', d.area, 'oque', d.oque, 'resp', d.resp,
                    'efetivo', coalesce(d.nova_data, d.prazo), 'alerta', public._taf_ciclo_alerta(p_obra, d), 'ativs', to_jsonb(d.ativs),
                    'como', case when d.resp = p_pessoa then 'responsável' else 'decide' end) order by coalesce(d.nova_data, d.prazo)), '[]')
                   from public.taf_ciclo_demanda d where d.obra = p_obra and d.situacao in ('aberta','respondida')
                    and p_pessoa is not null and (d.resp = p_pessoa or p_pessoa = any(d.decisores))),
    'acordos', (select coalesce(jsonb_agg(jsonb_build_object('replan', r.id, 'ativ', r.ativ, 'decisao', r.decisao, 'autor', r.autor,
                    'fim_antes', r.fim_antes, 'fim_novo', r.fim_novo, 'n', r.sugestao -> 'resumo' -> 'n',
                    'eventos', r.sugestao -> 'resumo' -> 'eventos', 'justif', r.justif,
                    'causa', r.causa, 'causa_det', r.causa_det, 'acao', r.acao, 'resp', r.resp) order by r.id), '[]')
                  from public.taf_ciclo_replan r where r.obra = p_obra and r.acordo = 'pendente'
                   and p_papel in ('gestor','diretoria') and r.autor is distinct from p_pessoa),
    'decisao_da_semana', exists (select 1 from public.taf_ciclo_demanda d where d.obra = p_obra and d.origem = 'segunda'
                                    and d.criada_em >= (public._taf_ciclo_segunda(v_hoje)::timestamp at time zone 'America/Sao_Paulo')));

  -- Qualidade do dado
  v_q := jsonb_strip_nulls(jsonb_build_object(
    'semana', case when v_s.seg is not null then jsonb_build_object('seg', v_s.seg, 'dias_apontados', v_r -> 'dias_apontados',
               'dias_uteis', v_r -> 'dias_uteis', 'tardios', v_r -> 'tardios', 'sem_lastro', v_r -> 'sem_lastro',
               'status_pub', v_s.status_pub, 'cobertura', v_s.cobertura, 'reaberta', v_s.reaberta) end,
    'vencidas_sem_real', (select coalesce(jsonb_agg(a.id order by a.ordem), '[]') from public.taf_ciclo_ativ a
                           where a.obra = p_obra and a.fim_real is null and coalesce(a.prev_fim, a.fim_base) < v_hoje),
    'nao_comecaram', (select coalesce(jsonb_agg(a.id order by a.ordem), '[]') from public.taf_ciclo_ativ a
                       where a.obra = p_obra and a.tipo in ('ativ','continua') and a.ini_real is null and coalesce(a.prev_ini, a.ini_base) < v_hoje),
    'areas_sem_pessoa', (select coalesce(jsonb_agg(x.rotulo order by x.ordem), '[]') from public.taf_ciclo_area x
                          where x.obra = p_obra and (x.dono is null or x.dono = any(v_o.setores))),
    'demandas_sem_dono', v_sd,
    'vencidas_7', (select count(*) from public.taf_ciclo_demanda d where d.obra = p_obra and d.situacao in ('aberta','respondida')
                     and coalesce(d.nova_data, d.prazo) < v_hoje - 7),
    'donos_mais_8', (select coalesce(jsonb_agg(x.resp), '[]') from (select d.resp from public.taf_ciclo_demanda d
                       where d.obra = p_obra and d.situacao in ('aberta','respondida') group by d.resp having count(*) > 8) x),
    'base', case when v_o.base_aprovada_por is null then 'Base não aprovada (PENDENTE Thadeu)' end));

  -- Frase-resumo (até 3 frases, sempre pelas mesmas regras)
  if v_s.seg is null then v_frase := v_frase || 'Nenhuma semana fechada ainda.'::text;
  else
    v_frase := v_frase || format('Semana %s a %s fechada com PPC %s%% (%s de %s)%s%s.', public._taf_ciclo_dm(v_s.seg),
      public._taf_ciclo_dm(v_s.seg + 6), v_r ->> 'ppc', v_r ->> 'cumpridos', v_r ->> 'publicados',
      case when (v_r ->> 'parciais')::int > 0 then format(', %s parcial(is)', v_r ->> 'parciais') else '' end,
      case when v_s.ensaio then ' (ensaio: não entra na média)' else '' end);
  end if;
  select r.* into v_rp from public.taf_ciclo_replan r where r.obra = p_obra and r.decisao = 'so_esta'
     and (r.acordo = 'pendente' or r.decidido_em >= coalesce(v_s.fechada_em, v_s.publicada_em, now()) - interval '7 days')
   order by (r.acordo = 'pendente') desc, r.id desc limit 1;
  if v_rp.id is not null then
    v_frase := v_frase || format('%s foi para %s (%s%s d) só com a própria atividade (a sugestão mexia em %s, %s EVENTOs): %s.',
      v_rp.ativ, public._taf_ciclo_dm(v_rp.fim_novo), case when v_rp.fim_novo >= v_rp.fim_antes then '+' else '' end,
      v_rp.fim_novo - v_rp.fim_antes, v_rp.sugestao -> 'resumo' ->> 'n', v_rp.sugestao -> 'resumo' ->> 'eventos',
      case v_rp.acordo when 'pendente' then 'aguarda de acordo' when 'ok' then 'de acordo de ' || v_rp.acordo_por
                       when 'revisar' then 'revisão pedida por ' || v_rp.acordo_por else 'sem de acordo' end);
  end if;
  if jsonb_array_length(v_ev) > 0 then
    select e into v_e from jsonb_array_elements(v_ev) with ordinality x(e, i)
     order by (e ->> 'nivel' = 'VERMELHO') desc, (e ->> 'tipo' in ('evento','evento_pct')) desc, i limit 1;
    v_frase := v_frase || format('%s (%s) em risco: %s%s.',
      case when v_e ->> 'tipo' in ('evento','evento_pct') then 'EVENTO ' || (v_e ->> 'ev') || ' de ' || public._taf_ciclo_dm((v_e ->> 'data')::date)
           else 'Marco ' || (v_e ->> 'nome') end,
      v_e ->> 'id', v_e -> 'motivos' ->> 0,
      case when jsonb_array_length(v_ev) > 1 then format(' (mais %s em risco)', jsonb_array_length(v_ev) - 1) else '' end);
  else v_frase := v_frase || 'Nenhum EVENTO em risco.'::text;
  end if;

  -- Texto do "Copiar resumo" (pauta de segunda)
  v_txt := format('OBRA %s · %s', p_obra, v_o.nome) || chr(10) || array_to_string(v_frase, ' ') || chr(10) ||
    format('PRODUÇÃO %s (%s) · PLANO %s (%s) · DINHEIRO SEM BASE (v2)', v_prod ->> 'cor', v_p2 ->> 'motivo', v_plano ->> 'cor', v_p6 ->> 'motivo');
  for v_lin in select format('D%s %s · %s · até %s%s', d ->> 'num', d ->> 'oque', d ->> 'resp', public._taf_ciclo_dm((d ->> 'efetivo')::date),
                             coalesce(' · ' || (d ->> 'alerta'), ''))
                 from jsonb_array_elements(v_dec -> 'demandas') d loop
    v_txt := v_txt || chr(10) || 'Decidir: ' || v_lin;
  end loop;
  for v_lin in select format('%s %s %s %s: %s', coalesce('EVENTO ' || (e ->> 'ev'), 'Marco'), e ->> 'id', public._taf_ciclo_dm((e ->> 'data')::date),
                             e ->> 'nivel', e -> 'motivos' ->> 0) from jsonb_array_elements(v_ev) e limit 5 loop
    v_txt := v_txt || chr(10) || 'Em risco: ' || v_lin;
  end loop;

  return jsonb_build_object('calculado_em', public._taf_ciclo_agora(), 'hoje', v_hoje,
    'semana_ref', case when v_s.seg is not null then jsonb_build_object('seg', v_s.seg, 'sexta', v_s.sexta, 'ensaio', v_s.ensaio,
                       'fechada_em', v_s.fechada_em, 'fechada_por', v_s.fechada_por, 'resumo', v_r) end,
    'semana_seguinte', v_seg_px,
    'luzes', jsonb_build_object('producao', v_prod, 'plano', v_plano, 'dinheiro', v_din, 'ensaio', coalesce(v_s.ensaio, false)),
    'frase', array_to_string(v_frase, ' '), 'para_decidir', v_dec, 'eventos_risco', v_ev, 'qualidade', v_q, 'texto', v_txt);
end $$;

create or replace function public.taf_ciclo_situacao(p_chave text, p_obra text, p_quem text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_a record;
begin
  select * into v_a from public._taf_ciclo_ator(p_chave, p_obra, p_quem);
  return jsonb_build_object('ator', jsonb_build_object('nome', v_a.nome, 'papel', v_a.papel, 'verificado', v_a.verificado))
         || public._taf_ciclo_situacao(p_obra, v_a.nome, v_a.papel);
end $$;

-- Permissões: só as 7 funções públicas recebem execute; o resto fica fechado (o Supabase dá execute por padrão).
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'taf\_ciclo\_%' or p.proname like '\_taf\_ciclo\_%') loop
    execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
    if r.proname in ('taf_ciclo_ler','taf_ciclo_salvar','taf_ciclo_versao','taf_ciclo_simular','taf_ciclo_folga','taf_ciclo_historico',
                     'taf_ciclo_situacao') then
      execute 'grant execute on function ' || r.sig || ' to anon, authenticated';
    end if;
  end loop;
end $$;
