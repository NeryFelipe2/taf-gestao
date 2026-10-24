-- Migration taf_ciclo_v1_04_obras_e_importacao
-- Planejador para todas as obras (24/10/2026). Ajustes mínimos, sem tabela nova:
--   1. taf_ciclo_obras: lista as obras que a chave vê (com ou sem cronograma), para o Centro não ter obra fixa.
--   2. Compromisso condicionado: "com restrição" só vale para restrição condicionável (material, equipe,
--      equipamento) com dono e prazo até o dia prometido. Restrição obrigatória aberta continua bloqueando.
--      As funções antigas de compromisso e de publicar são renomeadas para *_v1 e chamadas depois da conferência.
--   3. taf_ciclo_importar: entrada do cronograma de uma obra nova, validada também aqui, numa transação,
--      com trava por obra e registro no histórico.
--   4. _taf_ciclo_remover_teste: remove uma obra de TESTE importada (só por SQL; o histórico fica).
-- Reverter: ver o fim do arquivo.

-- ===================================================================== 1. obras que a chave vê
create or replace function public.taf_ciclo_obras(p_chave text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_h text := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex');
        v_c public.taf_ciclo_chave; v_p text; v_l text[]; v_r jsonb;
begin
  select * into v_c from public.taf_ciclo_chave c where c.hash = v_h and c.ativo;
  if v_c.hash is not null then
    v_l := v_c.obras;
  elsif public._taf_ok(p_chave) then                    -- chave geral: todas as obras do ciclo e do ERP
    select coalesce(array_agg(x order by x), '{}') into v_l from (
      select o.obra as x from public.taf_ciclo_obra o union select e.codigo from public.taf_erp_obra e) u;
  else
    v_p := public._taf_pessoa(p_chave, null);           -- chave pessoal do site: as obras em que a pessoa é engenheiro
    select coalesce(array_agg(o.obra order by o.obra), '{}') into v_l from public.taf_ciclo_obra o where o.engenheiro = v_p;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'obra', x,
      'nome', coalesce(o.nome, e.nome),
      'cronograma', exists (select 1 from public.taf_ciclo_ativ a where a.obra = x),
      'n_ativ', (select count(*) from public.taf_ciclo_ativ a where a.obra = x),
      'base_rev', o.base_rev,
      'base_aprovada_por', o.base_aprovada_por,
      'base_aprovada_em', o.base_aprovada_em,
      'atualizado_em', (select l.em from public.taf_ciclo_log l where l.obra = x order by l.id desc limit 1),
      'ult_fechada', (select jsonb_build_object('seg', s.seg, 'ensaio', s.ensaio,
                               'ppc', coalesce(s.resumo_atual, s.resumo) -> 'ppc',
                               'publicados', coalesce(s.resumo_atual, s.resumo) -> 'publicados',
                               'cumpridos', coalesce(s.resumo_atual, s.resumo) -> 'cumpridos')
                        from public.taf_ciclo_semana s where s.obra = x and s.estado = 'fechada' order by s.seg desc limit 1),
      'erp', e.codigo is not null
    ) order by x), '[]'::jsonb) into v_r
  from unnest(v_l) as x
  left join public.taf_ciclo_obra o on o.obra = x
  left join public.taf_erp_obra e on e.codigo = x;
  return v_r;
end $$;

-- ===================================================================== 2. compromisso condicionado
-- O que trava a atividade, separado em obrigatório (nunca condicionável) e condicionável.
-- Obrigatório: serviço anterior, marco anterior sem data real, espera, item de preparo não conferido,
--              projeto, liberação da frente, e qualquer demanda que não seja de material/equipe/equipamento.
-- Condicionável: material, equipe ou equipamento com dono e prazo de remoção até o dia prometido.
create or replace function public._taf_ciclo_condicao(p_obra text, p_ativ text, p_seg date, p_prometido date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_lib jsonb := public._taf_ciclo_liberada(p_obra, p_ativ, p_seg); v_a public.taf_ciclo_ativ;
        v_ob text[] := '{}'; v_cd text[] := '{}'; v_x text; v_it text; v_rot text; v_pr public.taf_ciclo_preparo;
        v_dm public.taf_ciclo_demanda; v_vista int[] := '{}'; v_lim date; v_prom date := coalesce(p_prometido, p_seg + 4);
begin
  if (v_lib ->> 'liberada')::boolean then
    return jsonb_build_object('liberada', true, 'ok', true, 'obrig', '[]'::jsonb, 'cond', '[]'::jsonb);
  end if;
  select * into v_a from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = p_ativ;
  for v_x in select jsonb_array_elements_text(v_lib -> 'falta') loop          -- serviço anterior (mesmas regras da liberação)
    if v_x ~ '^(Serviço anterior|Marco |Espera )' then v_ob := v_ob || v_x; end if;
  end loop;
  if v_a.ini_real is null and v_a.tipo = 'ativ' then
    foreach v_it in array array['material','equipe','equipamento','projeto','liberacao'] loop
      v_rot := case v_it when 'material' then 'Material' when 'equipe' then 'Equipe' when 'equipamento' then 'Equipamento'
                         when 'projeto' then 'Projeto' else 'Liberação da frente' end;
      select * into v_pr from public.taf_ciclo_preparo x where x.obra = p_obra and x.ativ = p_ativ and x.item = v_it;
      if v_pr.item is null then
        v_ob := v_ob || (v_rot || ': não conferido (confira antes de condicionar)');
      elsif v_pr.estado = 'pendente' then
        select * into v_dm from public.taf_ciclo_demanda x where x.obra = p_obra and x.num = v_pr.demanda;
        v_vista := v_vista || v_dm.num;
        if v_dm.situacao in ('aberta','respondida') then
          v_lim := coalesce(v_dm.nova_data, v_dm.prazo);
          if v_it not in ('material','equipe','equipamento') then
            v_ob := v_ob || format('%s: D%s %s (obrigatória: não se condiciona)', v_rot, v_dm.num, v_dm.oque);
          elsif nullif(trim(coalesce(v_dm.resp, '')), '') is null then
            v_ob := v_ob || format('%s: D%s sem dono', v_rot, v_dm.num);
          elsif v_lim > v_prom then
            v_ob := v_ob || format('%s: D%s precisa até %s, depois do dia prometido %s', v_rot, v_dm.num,
                                   public._taf_ciclo_dm(v_lim), public._taf_ciclo_dm(v_prom));
          else
            v_cd := v_cd || format('%s: D%s %s (%s remove até %s)', v_rot, v_dm.num, v_dm.oque, v_dm.resp, public._taf_ciclo_dm(v_lim));
          end if;
        end if;
      end if;
    end loop;
  end if;
  for v_dm in select * from public.taf_ciclo_demanda x where x.obra = p_obra and p_ativ = any(x.ativs)
                 and x.situacao in ('aberta','respondida') and not (x.num = any(v_vista)) order by x.num loop
    v_lim := coalesce(v_dm.nova_data, v_dm.prazo);
    if coalesce(v_dm.item, '') not in ('material','equipe','equipamento') then
      v_ob := v_ob || format('D%s %s: %s%s (obrigatória: não se condiciona)', v_dm.num, v_dm.area, v_dm.oque,
                             case when v_dm.tarefa_id is not null then ' [' || v_dm.tarefa_id || ']' else '' end);
    elsif nullif(trim(coalesce(v_dm.resp, '')), '') is null then
      v_ob := v_ob || format('D%s %s sem dono', v_dm.num, v_dm.oque);
    elsif v_lim > v_prom then
      v_ob := v_ob || format('D%s precisa até %s, depois do dia prometido %s', v_dm.num, public._taf_ciclo_dm(v_lim), public._taf_ciclo_dm(v_prom));
    else
      v_cd := v_cd || format('D%s %s (%s remove até %s)', v_dm.num, v_dm.oque, v_dm.resp, public._taf_ciclo_dm(v_lim));
    end if;
  end loop;
  return jsonb_build_object('liberada', false, 'ok', cardinality(v_ob) = 0, 'obrig', to_jsonb(v_ob), 'cond', to_jsonb(v_cd));
end $$;

alter function public._taf_ciclo_a_comp(text, jsonb) rename to _taf_ciclo_a_comp_v1;
alter function public._taf_ciclo_a_publicar(text, jsonb) rename to _taf_ciclo_a_publicar_v1;

create or replace function public._taf_ciclo_a_comp(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_cid text := p_d ->> 'cid'; v_c public.taf_ciclo_comp;
        v_ativ text; v_cr boolean; v_prom date; v_k jsonb;
begin
  if v_cid is null then
    v_ativ := nullif(p_d ->> 'ativ', ''); v_cr := coalesce((p_d ->> 'com_restricao')::boolean, false);
    v_prom := coalesce((p_d ->> 'prometido')::date, v_seg + 4);
  else
    select * into v_c from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cid = v_cid;
    v_ativ := case when p_d ? 'ativ' then nullif(p_d ->> 'ativ', '') else v_c.ativ end;
    v_cr := coalesce((p_d ->> 'com_restricao')::boolean, v_c.com_restricao, false);
    v_prom := coalesce((p_d ->> 'prometido')::date, v_c.prometido, v_seg + 4);
  end if;
  if v_ativ is not null and v_cr and exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra and a.id = v_ativ and a.fim_real is null) then
    v_k := public._taf_ciclo_condicao(p_obra, v_ativ, v_seg, v_prom);
    if not (v_k ->> 'ok')::boolean then
      raise exception 'RESTRICAO OBRIGATORIA ABERTA: %. SO MATERIAL, EQUIPE OU EQUIPAMENTO COM DONO E PRAZO ATE O DIA PROMETIDO PODEM SER CONDICIONADOS',
        (select string_agg(x, '; ') from jsonb_array_elements_text(v_k -> 'obrig') x);
    end if;
  end if;
  return public._taf_ciclo_a_comp_v1(p_obra, p_d)
         || case when v_k is not null then jsonb_build_object('condicao', v_k) else '{}'::jsonb end;
end $$;

create or replace function public._taf_ciclo_a_publicar(p_obra text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seg date := (p_d ->> 'seg')::date; v_c record; v_k jsonb; v_trav text[] := '{}';
begin
  for v_c in select c.* from public.taf_ciclo_comp c join public.taf_ciclo_ativ a on a.obra = c.obra and a.id = c.ativ
              where c.obra = p_obra and c.seg = v_seg and c.com_restricao and c.cancelado_em is null and a.fim_real is null order by c.cid loop
    v_k := public._taf_ciclo_condicao(p_obra, v_c.ativ, v_seg, v_c.prometido);
    if not (v_k ->> 'ok')::boolean then
      v_trav := v_trav || (v_c.cid || ' ' || v_c.ativ || ': ' || (select string_agg(x, '; ') from jsonb_array_elements_text(v_k -> 'obrig') x));
    end if;
  end loop;
  if cardinality(v_trav) > 0 then
    raise exception 'RESTRICAO OBRIGATORIA AO PUBLICAR: %. RESOLVA OU TIRE O COMPROMISSO', array_to_string(v_trav, ' | ');
  end if;
  return public._taf_ciclo_a_publicar_v1(p_obra, p_d);
end $$;

-- ===================================================================== 3. importar cronograma de uma obra nova
-- p_dados = {"obra": {"obra","nome","engenheiro","ep","base_rev"},
--            "feriados": [{"data","nome","abrangencia","cal_mpp"}]   (só os da obra; os nacionais '*' já valem),
--            "ativs": [{"id","ordem","nome","fase","tipo","evento","contratual","frente","cal","dur","ini","fim","hora","pred":[["T1","FS",0]]}]}
-- p_assinatura = 'obra|n_atividades|ep|primeiro_inicio|ultimo_fim' da prévia que a pessoa confirmou.
create or replace function public.taf_ciclo_importar(p_chave text, p_obra text, p_dados jsonb, p_assinatura text, p_quem text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_h text := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex');
        v_c public.taf_ciclo_chave; v_quem text; v_papel text; v_verif boolean;
        v_o jsonb := p_dados -> 'obra'; v_ep date; v_n int; v_x jsonb; v_lk jsonb; v_err text[] := '{}';
        v_ini date; v_fim date; v_ass text; v_topo int := 0; v_ids text[]; v_uid uuid := gen_random_uuid(); v_novo boolean;
begin
  -- quem pode: gestor ou diretoria com acesso à obra, ou a chave geral do site (gestor com nome declarado)
  select * into v_c from public.taf_ciclo_chave c where c.hash = v_h and c.ativo;
  if v_c.hash is not null then
    if v_c.papel not in ('gestor','diretoria') then raise exception 'SEM PERMISSAO: SO GESTOR OU DIRETORIA IMPORTA CRONOGRAMA'; end if;
    if not (p_obra = any(v_c.obras)) then raise exception 'SEM ACESSO A OBRA'; end if;
    v_quem := coalesce(v_c.pessoa, v_c.nome); v_papel := v_c.papel; v_verif := true;
  elsif public._taf_ok(p_chave) then
    v_quem := nullif(left(trim(coalesce(p_quem, '')), 60), ''); v_papel := 'gestor'; v_verif := false;
    if v_quem is null then raise exception 'INFORME SEU NOME'; end if;
  else
    raise exception 'CHAVE INVALIDA OU SEM PERMISSAO PARA IMPORTAR';
  end if;
  if coalesce(p_obra, '') !~ '^\d{3}$' then raise exception 'OBRA INVALIDA'; end if;
  if coalesce(v_o ->> 'obra', '') <> p_obra then raise exception 'A OBRA DOS DADOS (%) NAO E A OBRA ESCOLHIDA (%)', v_o ->> 'obra', p_obra; end if;

  -- uma importação por vez para a mesma obra (a segunda espera e depois encontra a obra já carregada)
  perform pg_advisory_xact_lock(hashtext('taf_ciclo_importar'), hashtext(p_obra));
  if exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra) then
    raise exception 'OBRA % JA TEM CRONOGRAMA: A IMPORTACAO NUNCA SOBRESCREVE', p_obra; end if;

  -- validação (a mesma da tela, repetida aqui)
  v_ep := (v_o ->> 'ep')::date;
  if v_ep is null then raise exception 'FALTA O DIA ZERO (EP) DA OBRA'; end if;
  if nullif(trim(coalesce(v_o ->> 'nome', '')), '') is null then v_err := v_err || 'falta o nome da obra'::text; end if;
  if nullif(trim(coalesce(v_o ->> 'engenheiro', '')), '') is null then v_err := v_err || 'falta o engenheiro'::text; end if;
  v_n := coalesce(jsonb_array_length(p_dados -> 'ativs'), 0);
  if v_n < 1 or v_n > 3000 then raise exception 'CRONOGRAMA VAZIO OU GRANDE DEMAIS (% ATIVIDADES)', v_n; end if;
  create temp table if not exists _taf_imp (id text primary key, ordem int, nome text, fase text, tipo text, evento text, contratual boolean,
    frente text, cal text, dur int, ini date, fim date, hora smallint, pred jsonb, topo int) on commit drop;
  create temp table if not exists _taf_imp_l (suc text, pre text, tipo text, lag int) on commit drop;
  truncate _taf_imp; truncate _taf_imp_l;
  for v_x in select jsonb_array_elements(p_dados -> 'ativs') loop
    if coalesce(v_x ->> 'id', '') !~ '^T\d{1,4}$' then v_err := v_err || format('id inválido: %s', v_x ->> 'id'); continue; end if;
    if exists (select 1 from _taf_imp i where i.id = v_x ->> 'id') then v_err := v_err || format('%s repetido', v_x ->> 'id'); continue; end if;
    begin
      insert into _taf_imp values (v_x ->> 'id', coalesce((v_x ->> 'ordem')::int, substr(v_x ->> 'id', 2)::int), nullif(trim(v_x ->> 'nome'), ''),
        coalesce(nullif(trim(v_x ->> 'fase'), ''), 'SEM FASE'), coalesce(v_x ->> 'tipo', 'ativ'), nullif(v_x ->> 'evento', ''),
        coalesce((v_x ->> 'contratual')::boolean, false), nullif(trim(coalesce(v_x ->> 'frente', '')), ''), coalesce(v_x ->> 'cal', 'CORRIDOS'),
        (v_x ->> 'dur')::int, (v_x ->> 'ini')::date, (v_x ->> 'fim')::date, coalesce((v_x ->> 'hora')::smallint, 17),
        coalesce(v_x -> 'pred', '[]'::jsonb), null);
    exception when others then v_err := v_err || format('%s: dado inválido (%s)', v_x ->> 'id', sqlerrm); continue;
    end;
  end loop;
  for v_x in select to_jsonb(i) from _taf_imp i loop
    if v_x ->> 'nome' is null then v_err := v_err || format('%s sem nome', v_x ->> 'id'); end if;
    if (v_x ->> 'tipo') not in ('ativ','continua','marco','evento','evento_pct') then v_err := v_err || format('%s: tipo %s não existe', v_x ->> 'id', v_x ->> 'tipo'); end if;
    if (v_x ->> 'cal') not in ('CORRIDOS','UTEIS') then v_err := v_err || format('%s: calendário %s não existe (use CORRIDOS ou UTEIS)', v_x ->> 'id', v_x ->> 'cal'); end if;
    if (v_x ->> 'dur') is null or (v_x ->> 'dur')::int < 0 then v_err := v_err || format('%s: duração inválida', v_x ->> 'id'); end if;
    if ((v_x ->> 'tipo') in ('marco','evento')) <> (coalesce((v_x ->> 'dur')::int, -1) = 0) then
      v_err := v_err || format('%s: marco e EVENTO têm duração zero; atividade com duração zero deve ser marco', v_x ->> 'id'); end if;
    if (v_x ->> 'evento') is not null and (v_x ->> 'evento') !~ '^\d\.\d\.\d$' then v_err := v_err || format('%s: código de evento %s inválido', v_x ->> 'id', v_x ->> 'evento'); end if;
    if (v_x ->> 'ini') is null or (v_x ->> 'fim') is null then v_err := v_err || format('%s sem início ou término', v_x ->> 'id');
    elsif (v_x ->> 'fim')::date < (v_x ->> 'ini')::date then v_err := v_err || format('%s termina antes de começar', v_x ->> 'id');
    elsif coalesce((v_x ->> 'dur')::int, 0) = 0 and (v_x ->> 'fim') <> (v_x ->> 'ini') then v_err := v_err || format('%s: marco com início e término diferentes', v_x ->> 'id');
    elsif (v_x ->> 'ini')::date < v_ep - 366 or (v_x ->> 'fim')::date > v_ep + 3650 then v_err := v_err || format('%s: data fora da faixa da obra', v_x ->> 'id'); end if;
    if (v_x ->> 'hora')::int not in (8, 17) then v_err := v_err || format('%s: hora do marco deve ser 8 ou 17', v_x ->> 'id'); end if;
    if jsonb_typeof(v_x -> 'pred') <> 'array' then v_err := v_err || format('%s: predecessoras inválidas', v_x ->> 'id');
    else
      for v_lk in select jsonb_array_elements(v_x -> 'pred') loop
        if jsonb_typeof(v_lk) <> 'array' or coalesce(v_lk ->> 1, '') not in ('FS','SS','FF') or (v_lk ->> 2) !~ '^-?\d{1,4}$' then
          v_err := v_err || format('%s: ligação %s inválida (use [id, FS|SS|FF, dias])', v_x ->> 'id', v_lk::text);
        elsif (v_lk ->> 0) = (v_x ->> 'id') then v_err := v_err || format('%s depende dela mesma', v_x ->> 'id');
        elsif not exists (select 1 from _taf_imp i where i.id = v_lk ->> 0) then v_err := v_err || format('%s depende de %s, que não existe', v_x ->> 'id', v_lk ->> 0);
        else insert into _taf_imp_l values (v_x ->> 'id', v_lk ->> 0, v_lk ->> 1, (v_lk ->> 2)::int);
        end if;
      end loop;
    end if;
  end loop;
  if cardinality(v_err) > 0 then
    raise exception 'IMPORTACAO RECUSADA (% PROBLEMA(S)): %', cardinality(v_err), array_to_string(v_err[1:30], '; ');
  end if;
  -- ordem topológica; o que sobrar está em ciclo
  loop
    select coalesce(array_agg(i.id order by i.ordem, i.id), '{}') into v_ids from _taf_imp i
     where i.topo is null and not exists (select 1 from _taf_imp_l l join _taf_imp p on p.id = l.pre where l.suc = i.id and p.topo is null);
    exit when cardinality(v_ids) = 0;
    update _taf_imp i set topo = v_topo + u.n from unnest(v_ids) with ordinality as u(id, n) where i.id = u.id;
    v_topo := v_topo + cardinality(v_ids);
  end loop;
  if exists (select 1 from _taf_imp i where i.topo is null) then
    raise exception 'DEPENDENCIA CICLICA: %', (select string_agg(l.pre || '>' || l.suc, ', ' order by l.suc, l.pre)
      from _taf_imp_l l join _taf_imp a on a.id = l.suc and a.topo is null join _taf_imp b on b.id = l.pre and b.topo is null);
  end if;
  -- a prévia confirmada tem que ser esta
  select min(ini), max(fim) into v_ini, v_fim from _taf_imp;
  v_ass := format('%s|%s|%s|%s|%s', p_obra, v_n, v_ep, v_ini, v_fim);
  if coalesce(p_assinatura, '') <> v_ass then
    raise exception 'A PREVIA CONFIRMADA (%) NAO CORRESPONDE AOS DADOS ENVIADOS (%): REFACA A PREVIA', p_assinatura, v_ass; end if;

  -- gravação (tudo nesta transação: qualquer erro desfaz tudo)
  perform set_config('taf.quem', v_quem, true), set_config('taf.papel', v_papel, true), set_config('taf.verif', v_verif::text, true),
          set_config('taf.acao', 'importar', true), set_config('taf.uid', v_uid::text, true),
          set_config('taf.motivo', left('Importação do cronograma: ' || coalesce(v_o ->> 'base_rev', ''), 300), true);
  v_novo := not exists (select 1 from public.taf_ciclo_obra o where o.obra = p_obra);
  if v_novo then
    insert into public.taf_ciclo_obra (obra, nome, engenheiro, ep, base_rev, equipe)
    values (p_obra, trim(v_o ->> 'nome'), trim(v_o ->> 'engenheiro'), v_ep,
            left(coalesce(nullif(trim(v_o ->> 'base_rev'), ''), 'Importado'), 300), array[trim(v_o ->> 'engenheiro')]);
    insert into public.taf_ciclo_area (obra, area, rotulo, dono, ordem)
    select p_obra, a.area, a.rotulo, case when a.area in ('TECNICA','OPERACIONAL','CLIENTE') then trim(v_o ->> 'engenheiro') end, a.ordem
      from (values ('TECNICA','Técnica: projeto, ART, traçado, topografia',1), ('OPERACIONAL','Operacional: equipe, equipamento, frente',2),
                   ('SUPRIMENTOS','Suprimentos: compra e entrega de material',3), ('ADMINISTRATIVA','Administrativa: pessoal, SST, documentos, ligações',4),
                   ('FINANCEIRA','Financeira: pagamento, adiantamento',5), ('ECONOMICA','Econômica: medição, BM, aditivo, preço',6),
                   ('DIRETORIA','Diretoria: decisão da empresa',7), ('CLIENTE','Cliente / fiscal',8)) as a(area, rotulo, ordem);
  end if;
  insert into public.taf_ciclo_feriado (obra, data, nome, abrangencia, cal_mpp)
  select p_obra, (f ->> 'data')::date, left(trim(f ->> 'nome'), 80), f ->> 'abrangencia', coalesce((f ->> 'cal_mpp')::boolean, true)
    from jsonb_array_elements(coalesce(p_dados -> 'feriados', '[]'::jsonb)) f
   where (f ->> 'data') is not null
  on conflict (obra, data) do nothing;
  insert into public.taf_ciclo_ativ (obra, id, ordem, topo, nome, fase, tipo, evento, contratual, frente_cod, cal, dur, hora_marco,
                                     b0, b1, ini_base, fim_base, pred)
  select p_obra, i.id, i.ordem, i.topo, i.nome, i.fase, i.tipo, i.evento, i.contratual, i.frente, i.cal, i.dur,
         case when i.dur = 0 then i.hora end,
         case when i.dur = 0 then (i.fim - v_ep) + case when i.hora = 17 then 1 else 0 end else i.ini - v_ep end,
         case when i.dur = 0 then (i.fim - v_ep) + case when i.hora = 17 then 1 else 0 end else (i.fim - v_ep) + 1 end,
         i.ini, i.fim, i.pred
    from _taf_imp i;
  insert into public.taf_ciclo_evento (obra, acao, ref, ativ, dados, resultado, autor, papel, verificado, uid)
  values (p_obra, 'importar', v_ass, null, jsonb_build_object('obra', v_o, 'n_ativ', v_n, 'feriados', p_dados -> 'feriados'),
          jsonb_build_object('ok', true, 'obra_nova', v_novo, 'n_ativ', v_n), v_quem, v_papel, v_verif, v_uid);
  return jsonb_build_object('ok', true, 'obra', p_obra, 'obra_nova', v_novo, 'n_ativ', v_n, 'assinatura', v_ass,
                            'aprovacao', 'pendente', 'versao', (select coalesce(max(l.id), 0) from public.taf_ciclo_log l where l.obra = p_obra));
end $$;

-- ===================================================================== 4. remover obra de TESTE importada (só SQL)
create or replace function public._taf_ciclo_remover_teste(p_obra text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_o public.taf_ciclo_obra; v_n int;
begin
  select * into v_o from public.taf_ciclo_obra o where o.obra = p_obra;
  if v_o.obra is null then raise exception 'OBRA NAO EXISTE NO CICLO'; end if;
  if v_o.nome !~* 'TESTE' then raise exception 'SO OBRA DE TESTE (NOME COM TESTE) SE REMOVE POR AQUI'; end if;
  if exists (select 1 from public.taf_ciclo_demanda d where d.obra = p_obra)
     or exists (select 1 from public.taf_ciclo_semana s where s.obra = p_obra and s.estado <> 'rascunho') then
    raise exception 'A OBRA DE TESTE TEM DEMANDA OU SEMANA PUBLICADA: USE O 99_REVERTER PARA LIMPAR'; end if;
  perform set_config('taf.rebase', 'sim', true), set_config('taf.acao', 'remover_teste', true);
  delete from public.taf_ciclo_preparo where obra = p_obra;
  delete from public.taf_ciclo_fora where obra = p_obra;
  delete from public.taf_ciclo_apont where obra = p_obra;
  delete from public.taf_ciclo_comp where obra = p_obra;
  delete from public.taf_ciclo_semana where obra = p_obra;
  delete from public.taf_ciclo_ativ where obra = p_obra;
  get diagnostics v_n = row_count;
  delete from public.taf_ciclo_area where obra = p_obra;
  delete from public.taf_ciclo_feriado where obra = p_obra;
  delete from public.taf_ciclo_obra where obra = p_obra;
  return jsonb_build_object('ok', true, 'obra', p_obra, 'atividades_removidas', v_n);
end $$;

-- ===================================================================== permissões
-- Só taf_ciclo_obras e taf_ciclo_importar são chamáveis de fora; o resto fica fechado (o Supabase dá execute por padrão).
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('taf_ciclo_obras','taf_ciclo_importar','_taf_ciclo_condicao',
              '_taf_ciclo_a_comp','_taf_ciclo_a_publicar','_taf_ciclo_a_comp_v1','_taf_ciclo_a_publicar_v1','_taf_ciclo_remover_teste') loop
    execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
    if r.proname in ('taf_ciclo_obras','taf_ciclo_importar') then
      execute 'grant execute on function ' || r.sig || ' to anon, authenticated';
    end if;
  end loop;
end $$;

-- ===================================================================== reverter (manual)
-- drop function public.taf_ciclo_obras(text);
-- drop function public.taf_ciclo_importar(text, text, jsonb, text, text);
-- drop function public._taf_ciclo_remover_teste(text);
-- drop function public._taf_ciclo_a_comp(text, jsonb);       alter function public._taf_ciclo_a_comp_v1(text, jsonb) rename to _taf_ciclo_a_comp;
-- drop function public._taf_ciclo_a_publicar(text, jsonb);   alter function public._taf_ciclo_a_publicar_v1(text, jsonb) rename to _taf_ciclo_a_publicar;
-- drop function public._taf_ciclo_condicao(text, text, date, date);
-- Obra importada de teste: select public._taf_ciclo_remover_teste('998');  (o histórico em taf_ciclo_log fica)
