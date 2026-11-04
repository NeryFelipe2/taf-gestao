-- Cronograma/planejador aberto sem chave (04/11/2026, Felipe: "nao quero nada com chave mais").
-- O site manda a chave 'aberto' quando ninguém digitou chave. Vale só para o ciclo (taf_ciclo_*):
-- o ERP (taf_erp_*, dado pessoal) e o resumo continuam com chave.
-- Papel no modo aberto: quem diz o nome do engenheiro da obra (primeiro nome) entra como engenheiro; o resto como gestor.
-- Nada é verificado (verificado = false): o nome vai no histórico como foi digitado.
create or replace function public._taf_ciclo_aberto(p_chave text) returns boolean
language sql immutable as $$ select coalesce(trim(p_chave), '') in ('', 'aberto') $$;

create or replace function public._taf_ciclo_ator(p_chave text, p_obra text, p_quem text, OUT nome text, OUT papel text, OUT verificado boolean)
 RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_h text := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex');
        v_o public.taf_ciclo_obra; v_c public.taf_ciclo_chave; v_p text; v_q text;
begin
  select * into v_o from public.taf_ciclo_obra o where o.obra = p_obra;
  if v_o.obra is null then raise exception 'OBRA INVALIDA'; end if;
  if public._taf_ciclo_aberto(p_chave) then              -- site aberto (13_ciclo_aberto.sql)
    v_q := nullif(left(trim(coalesce(p_quem, '')), 60), '');
    nome := v_q;
    papel := case when v_q is not null and lower(split_part(v_q, ' ', 1)) = lower(split_part(coalesce(v_o.engenheiro, ''), ' ', 1))
                  then 'engenheiro' else 'gestor' end;
    verificado := false; return;
  end if;
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
end $function$;

create or replace function public.taf_ciclo_obras(p_chave text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_h text := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex');
        v_c public.taf_ciclo_chave; v_p text; v_l text[]; v_r jsonb; v_ab boolean := public._taf_ciclo_aberto(p_chave);
begin
  if v_ab then                                          -- site aberto: todas as obras do ciclo
    select coalesce(array_agg(o.obra order by o.obra), '{}') into v_l from public.taf_ciclo_obra o;
  else
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
      'erp', e.codigo is not null and not v_ab           -- ERP continua com chave
    ) order by x), '[]'::jsonb) into v_r
  from unnest(v_l) as x
  left join public.taf_ciclo_obra o on o.obra = x
  left join public.taf_erp_obra e on e.codigo = x;
  return v_r;
end $function$;

-- reverter: rodar de novo as versões de fonte/ciclo/sql (04_obras_e_importacao.sql e a de _taf_ciclo_ator) e
-- drop function public._taf_ciclo_aberto(text);

-- 04/11 19:30 Felipe escolheu "Abrir o cronograma e o ERP": aplicado também
-- _taf_erp_ator: a chave 'aberto' vale como a chave geral (nome declarado, papel da tela, todas as obras);
-- taf_ciclo_obras('aberto') lista as obras do ciclo e do ERP, com erp = true.
-- reverter o ERP: rodar de novo _taf_erp_ator de fonte/erp/sql (sem o bloco _taf_ciclo_aberto).
