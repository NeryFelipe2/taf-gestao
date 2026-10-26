-- 03 (M4, "nota P3"): Gerente e Diretoria passam a gravar a DECISÃO da alçada numa nota sem pedido (tipo nf), e só ela.
-- RASCUNHO PARA O FELIPE REVISAR. NÃO APLICADO. Só aplicar com o sim dele, depois do teste na obra 999 (03_teste_999.sql).
--
-- Problema (LEIA-ME-M4-SQL-PENDENTE.md): com a chave par.ev_ctrl ligada, a nota sem pedido acima do saldo ou da alçada nasce
-- aprov = 'pendente' e quem decide é Gerente ou Diretoria. A decisão muda o próprio documento nf, e _taf_erp_pode só deixa
-- adm, engenheiro e financeiro gravarem nf. Resultado: a aprovação não fica salva e a nota trava.
--
-- Escolha (opção estreita, sem tipo novo e sem mexer no navegador): _taf_erp_pode NÃO muda. taf_erp_salvar ganha uma exceção:
-- Gerente ou Diretoria podem gravar uma nf que JÁ EXISTE e está aguardando (aprov = 'pendente'), desde que a mudança seja só
-- a decisão. Qualquer outro campo mudado (valor, fornecedor, data, itens...) continua recusado.
--
-- O que muda em relação ao 01_erp.sql: a função nova _taf_erp_nf_decisao e um bloco em taf_erp_salvar (marcado "03").
-- O resto de taf_erp_salvar é cópia exata do 01_erp.sql, que é igual ao que está no banco hoje (conferido por md5 em 26/10/2026).
-- O SQL do M1 (_taf_erp_valores, decisão E2) não é tocado.
--
-- Regras da decisão (iguais ao navegador, 12_compras.js notaDecideFim e can_aprovar):
--   1. só chave pessoal (D4: com a chave geral do site o nome é digitado, ninguém aprova);
--   2. nota com alcada = 'diretoria' só a Diretoria decide; as outras, Gerente ou Diretoria;
--   3. quem decide não é quem lançou (solicitanteId e nome);
--   4. aprovar: aprov vira 'aprovada', aprovador = quem gravou; nada mais muda além de sem/alcada (recálculo na hora de aprovar);
--   5. reprovar: aprov vira 'reprovada', motivo obrigatório, rateio volta vazio, o rateio recusado é guardado igual ao que era,
--      status volta para 'lancada';
--   6. sem decidir (só recálculo do semáforo antes de aprovar): só sem e alcada podem mudar.
--
-- ATENÇÃO (achado ao escrever): as chaves pessoais (taf_ciclo_chave) só têm os papéis engenheiro, gestor, diretoria e leitura.
-- Não existe chave pessoal de Gerente. Então, com a regra 1, hoje só uma chave pessoal de Diretoria consegue decidir.
--
-- Antes de aplicar: backup (PASSO A de 99_reverter.sql). Fora do horário de uso.
-- Para desfazer: rodar de novo, do 01_erp.sql, só o bloco "create or replace function public.taf_erp_salvar(...)" e depois
--   drop function public._taf_erp_nf_decisao(text, text, boolean, jsonb, jsonb);
-- NÃO usar o 99_reverter.sql inteiro (apaga o ERP todo).

-- Devolve null quando a mudança é só a decisão permitida; senão o motivo da recusa.
create or replace function public._taf_erp_nf_decisao(p_papel text, p_nome text, p_fixo boolean, p_old jsonb, p_new jsonb)
returns text language plpgsql immutable as $$
declare v_mud text[]; v_livres constant text[] := array['aprov','aprovador','aprovadorId','motivoAlcada','rateio','rateioRecusado','status','sem','alcada'];
        v_alc text := coalesce(p_new->>'alcada', p_old->>'alcada', '');
        v_norm text;
begin
  if coalesce(p_fixo, false) is not true then return 'DECISAO DA NOTA SO COM CHAVE PESSOAL'; end if;
  if coalesce(p_old->>'aprov', '') <> 'pendente' then return 'PAPEL ' || upper(p_papel) || ' NAO GRAVA NF'; end if;
  if v_alc = 'diretoria' and p_papel <> 'diretoria' then return 'NOTA NA ALCADA DA DIRETORIA'; end if;
  select coalesce(array_agg(k), '{}') into v_mud
    from (select jsonb_object_keys(p_old) k union select jsonb_object_keys(p_new)) s
   where p_old->k is distinct from p_new->k;
  if not (v_mud <@ v_livres) then return 'GERENTE E DIRETORIA SO DECIDEM A NOTA, NAO MUDAM OUTROS CAMPOS'; end if;
  if not ('aprov' = any(v_mud)) then
    if v_mud <@ array['sem','alcada'] then return null; end if;
    return 'MUDANCA SEM DECISAO';
  end if;
  -- quem decide não é quem lançou
  -- mesma identidade do navegador (05_motor_de_regras.js nomeNorm): sem acento, minúsculo, espaços simples
  v_norm := 'pessoa:' || translate(lower(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  if coalesce(p_new->>'aprovador', '') <> coalesce(p_nome, '') then return 'APROVADOR DIFERENTE DE QUEM GRAVA'; end if;
  if lower(trim(coalesce(p_old->>'solicitante', ''))) = lower(trim(coalesce(p_nome, '')))
     or coalesce(p_old->>'solicitanteId', '') in (coalesce(p_new->>'aprovadorId', '-'), v_norm) then
    return 'QUEM LANCOU A NOTA NAO DECIDE';
  end if;
  if p_new->>'aprov' = 'aprovada' then
    if v_mud <@ array['aprov','aprovador','aprovadorId','sem','alcada'] then return null; end if;
    return 'APROVAR NAO MUDA RATEIO NEM SITUACAO';
  elsif p_new->>'aprov' = 'reprovada' then
    if coalesce(trim(p_new->>'motivoAlcada'), '') = '' then return 'REPROVAR PEDE MOTIVO'; end if;
    if p_new->'rateio' is distinct from '[]'::jsonb then return 'REPROVAR ESVAZIA O RATEIO'; end if;
    if p_new->'rateioRecusado' is distinct from coalesce(p_old->'rateio', 'null'::jsonb) then return 'RATEIO RECUSADO DIFERENTE DO ORIGINAL'; end if;
    if coalesce(p_new->>'status', '') <> 'lancada' then return 'REPROVAR VOLTA A NOTA PARA LANCADA'; end if;
    return null;
  end if;
  return 'DECISAO INVALIDA';
end $$;

create or replace function public.taf_erp_salvar(p_chave text, p_obra text, p_quem text, p_papel text,
                                                 p_docs jsonb default '[]'::jsonb, p_estado jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; d jsonb; v_id text; v_tipo text; v_dados jsonb; v_obra text; v_old public.taf_erp_doc;
        v_ok int := 0; v_igual int := 0; v_rec jsonb := '[]'::jsonb; v_est text := null; c text; dt text;
        v_global constant text[] := array['forn','ins','banc'];
        v_m text;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, p_papel);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  if p_docs is null then p_docs := '[]'::jsonb; end if;
  if jsonb_typeof(p_docs) <> 'array' then raise exception 'DOCS INVALIDOS'; end if;
  if jsonb_array_length(p_docs) > 500 then raise exception 'MUITOS DOCUMENTOS DE UMA VEZ'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_' || p_obra));

  for d in select * from jsonb_array_elements(p_docs) loop
    v_id := d->>'id'; v_tipo := d->>'tipo'; v_dados := d->'dados';
    if v_id is null or length(v_id) not between 1 and 120 or v_tipo is null or jsonb_typeof(v_dados) is distinct from 'object' then
      v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'DOCUMENTO INVALIDO'); continue; end if;
    if octet_length(v_dados::text) > 300000 then
      v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'DOCUMENTO GRANDE DEMAIS'); continue; end if;
    if not (v_tipo = any(array['sol','oc','nf','tit','med','conc','aud','apt','rst','atv','tar','bc','fat','rec','lan','fech',
        'forn','ins','banc','lfx','mov','cobr','ctb','est','inv','ctr','prj','pat','frt','fmv','col','pto','sst','elo'])) then
      v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'TIPO INVALIDO'); continue; end if;
    v_obra := case when v_tipo = any(v_global) then '*' else p_obra end;
    select * into v_old from public.taf_erp_doc where obra = v_obra and id = v_id;
    if v_old.id is not null and v_old.dados = v_dados then v_igual := v_igual + 1; continue; end if;
    if v_old.id is not null and v_old.tipo <> v_tipo then
      v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'TIPO NAO PODE MUDAR'); continue; end if;
    if not public._taf_erp_pode(a.papel, v_tipo) then
      -- 03: Gerente e Diretoria não gravam nota, mas podem gravar a DECISÃO da alçada numa nota sem pedido que está aguardando
      if v_tipo = 'nf' and v_old.id is not null and a.papel in ('gerente', 'diretoria') then
        v_m := public._taf_erp_nf_decisao(a.papel, a.nome, a.fixo, v_old.dados, v_dados);
        if v_m is not null then v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', v_m); continue; end if;
      else
        v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'PAPEL ' || upper(a.papel) || ' NAO GRAVA ' || upper(v_tipo)); continue;
      end if;
    end if;
    if v_tipo = 'aud' and v_old.id is not null then v_igual := v_igual + 1; continue; end if;   -- auditoria não muda
    if v_tipo = 'elo' then      -- vínculo tarefa x solicitação: a tarefa existe no cronograma e há solicitação indicada
      if coalesce(v_dados->>'ativ', '') !~ '^T[0-9]{1,4}$' or coalesce(v_dados->>'sol', '') = '' then
        v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'VINCULO INCOMPLETO'); continue; end if;
      if to_regclass('public.taf_ciclo_ativ') is not null and not exists (select 1 from public.taf_ciclo_ativ t where t.obra = p_obra and t.id = v_dados->>'ativ') then
        v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'TAREFA NAO EXISTE NO CRONOGRAMA'); continue; end if;
    end if;
    -- competência fechada (porte do gatilho da migração 0011)
    if v_tipo = 'fech' then
      if v_old.id is not null and coalesce(v_dados->>'reaberta', 'false') = 'true' and coalesce(v_old.dados->>'reaberta', 'false') <> 'true'
         and a.papel not in ('admin', 'diretoria') then
        v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'SO A DIRETORIA REABRE COMPETENCIA'); continue; end if;
    elsif v_tipo in ('ctb', 'nf', 'fat', 'rec', 'lan') and not (v_tipo = 'nf' and v_old.id is not null) then
      dt := coalesce(v_dados->>'data', v_dados->>'emissao', v_dados->>'pago'); c := left(dt, 7);
      if c is not null and exists (select 1 from public.taf_erp_doc f where f.obra = p_obra and f.tipo = 'fech'
                                     and f.dados->>'comp' = c and coalesce(f.dados->>'reaberta', 'false') <> 'true') then
        v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'COMPETENCIA ' || c || ' FECHADA'); continue; end if;
    end if;
    if v_old.id is null then
      insert into public.taf_erp_doc (obra, id, tipo, dados, criado_por, atualizado_por, papel)
      values (v_obra, v_id, v_tipo, v_dados, a.nome, a.nome, a.papel);
    else
      update public.taf_erp_doc set dados = v_dados, atualizado_por = a.nome, papel = a.papel where obra = v_obra and id = v_id;
    end if;
    v_ok := v_ok + 1;
  end loop;

  if p_estado is not null then
    if jsonb_typeof(p_estado) <> 'object' or octet_length(p_estado::text) > 1000000 then raise exception 'ESTADO INVALIDO'; end if;
    if a.papel in ('admin', 'gestao', 'diretoria', 'gerente') then
      update public.taf_erp_obra set estado = p_estado, atualizado_por = a.nome where codigo = p_obra and estado is distinct from p_estado;
      v_est := 'gravado';
    else
      v_est := 'ignorado';
    end if;
  end if;

  return jsonb_build_object('gravados', v_ok, 'iguais', v_igual, 'recusados', v_rec, 'estado', v_est,
                            'versao', public._taf_erp_versao(p_obra), 'quem', a.nome, 'papel', a.papel);
end $$;

revoke all on function public._taf_erp_nf_decisao(text, text, boolean, jsonb, jsonb) from public, anon, authenticated;
-- taf_erp_salvar mantém a mesma assinatura: o grant do 01_erp.sql continua valendo.
