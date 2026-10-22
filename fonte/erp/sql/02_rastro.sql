-- Da tarefa da semana até a compra, o custo e o BM (obra -> evento -> item -> solicitação -> pedido -> nota -> medição -> boletim -> NF -> recebimento).
-- Só lê. Usa as regras do próprio ERP (saldos() e faturamento), sem duplicar documento nem valor.
-- Ligações usadas, nesta ordem de confiança:
--   1. vínculo explícito tarefa x solicitação (documento 'elo', criado por uma pessoa);
--   2. evento do cronograma (taf_ciclo_ativ.evento, que é o código do Anexo VII) = evento do item da planilha (taf_erp_item.evento);
--   3. dependências do cronograma: a tarefa alimenta os eventos que ela alcança, parando no primeiro evento de cada caminho.
-- Nada disso pressupõe 1 tarefa = 1 pedido = 1 item de BM.

-- Valores por item, no mesmo critério do ERP (meta com revisões; comprometido = pedido aprovado ainda sem nota; realizado = nota rateada).
create or replace function public._taf_erp_valores(p_obra text)
returns table(codigo text, venda numeric, meta numeric, teto numeric, cotado numeric, comprometido numeric, realizado numeric)
language sql stable security definer set search_path = public as $$
  with est as (select o.estado e from public.taf_erp_obra o where o.codigo = p_obra),
  it as (
    select i.codigo, i.venda,
           coalesce((est.e->'metaOv'->>i.codigo)::numeric, (est.e->'baseOv'->i.codigo->>'meta_total')::numeric, i.meta) as meta,
           coalesce((est.e->'baseOv'->i.codigo->>'teto_total')::numeric, i.teto) as teto
      from public.taf_erp_item i, est where i.obra = p_obra),
  nf as (
    select n.dados->>'oc' as oc, l->>'item' as item, sum((l->>'valor')::numeric) as v
      from public.taf_erp_doc n, jsonb_array_elements(coalesce(n.dados->'rateio', '[]'::jsonb)) l
     where n.obra = p_obra and n.tipo = 'nf' and coalesce(n.dados->>'status', '') <> 'lancada'
     group by 1, 2),
  rl as (select item, sum(v) as v from nf group by 1),
  cp as (
    select o.dados->>'item' as item, sum(greatest(0, (o.dados->>'valor')::numeric - coalesce(nf.v, 0))) as v
      from public.taf_erp_doc o left join nf on nf.oc = o.id and nf.item = o.dados->>'item'
     where o.obra = p_obra and o.tipo = 'oc' and o.dados->>'status' in ('aprovada', 'recebida_parcial', 'recebida')
     group by 1),
  ct as (
    select s.dados->>'item' as item,
           sum((select min((c->>'preco')::numeric) from jsonb_array_elements(s.dados->'cots') c) * (s.dados->>'qtd')::numeric) as v
      from public.taf_erp_doc s
     where s.obra = p_obra and s.tipo = 'sol' and coalesce(s.dados->>'status', '') in ('enviada', 'em_cotacao')
       and jsonb_array_length(coalesce(s.dados->'cots', '[]'::jsonb)) > 0
     group by 1)
  select it.codigo, it.venda, it.meta, it.teto, coalesce(ct.v, 0), coalesce(cp.v, 0), coalesce(rl.v, 0)
    from it left join ct on ct.item = it.codigo left join cp on cp.item = it.codigo left join rl on rl.item = it.codigo $$;

-- Eventos que a tarefa alimenta: o próprio (se for evento) ou os primeiros alcançados pelas dependências.
create or replace function public._taf_erp_eventos_da(p_obra text, p_ativ text)
returns table(ativ_id text, evento text, via text)
language sql stable security definer set search_path = public as $$
  with recursive suc(a, de) as (
    select p_ativ::text, null::text
    union
    select t.id, s.a
      from suc s
      join public.taf_ciclo_ativ t on t.obra = p_obra
       and exists (select 1 from jsonb_array_elements(t.pred) pr where pr->>0 = s.a)
      join public.taf_ciclo_ativ cur on cur.obra = p_obra and cur.id = s.a
     where cur.evento is null)
  select a.id, a.evento, case when a.id = p_ativ then 'propria' else 'dependencia' end
    from suc join public.taf_ciclo_ativ a on a.obra = p_obra and a.id = suc.a
   where a.evento is not null $$;

-- Compras ligadas às tarefas por vínculo explícito (documento 'elo').
create or replace function public._taf_erp_compras(p_obra text, p_ativs text[])
returns jsonb language sql stable security definer set search_path = public as $$
  with el as (
    select e.id as elo_id, e.dados->>'ativ' as ativ, e.dados->>'sol' as sol_id, nullif(e.dados->>'demanda', '')::int as demanda,
           e.dados->>'obs' as obs, e.criado_por, e.criado_em
      from public.taf_erp_doc e where e.obra = p_obra and e.tipo = 'elo' and e.dados->>'ativ' = any(p_ativs)
         and coalesce(e.dados->>'cancelado', 'false') <> 'true'),
  v as (select * from public._taf_erp_valores(p_obra)),
  linhas as (
    select el.*, s.dados as s, i.codigo as i_cod, i.descricao as i_desc, i.unidade as i_un, i.pacote as i_pac, i.evento as i_ev,
           (select jsonb_agg(jsonb_build_object('id', o.id, 'num', o.dados->>'num', 'status', o.dados->>'status', 'forn', o.dados->>'forn',
                    'qtd', (o.dados->>'qtd')::numeric, 'valor', (o.dados->>'valor')::numeric, 'recebido_qtd', coalesce((o.dados->>'recebido')::numeric, 0),
                    'alcada', o.dados->>'alcada') order by o.mud)
              from public.taf_erp_doc o
             where o.obra = p_obra and o.tipo = 'oc' and o.dados->>'sol' = el.sol_id
               and coalesce(o.dados->>'status', '') not in ('cancelada', 'reprovada')) as ocs,
           (select jsonb_agg(jsonb_build_object('num', n.dados->>'num', 'status', n.dados->>'status', 'oc', n.dados->>'oc',
                    'valor_item', (select coalesce(sum((l->>'valor')::numeric), 0) from jsonb_array_elements(coalesce(n.dados->'rateio', '[]'::jsonb)) l
                                    where l->>'item' = s.dados->>'item')) order by n.mud)
              from public.taf_erp_doc n
             where n.obra = p_obra and n.tipo = 'nf'
               and exists (select 1 from public.taf_erp_doc o2 where o2.obra = p_obra and o2.tipo = 'oc' and o2.dados->>'sol' = el.sol_id and o2.id = n.dados->>'oc')) as nfs
      from el
      left join public.taf_erp_doc s on s.obra = p_obra and s.tipo = 'sol' and s.id = el.sol_id
      left join public.taf_erp_item i on i.obra = p_obra and i.codigo = s.dados->>'item')
  select coalesce(jsonb_agg(jsonb_build_object(
      'elo', l.elo_id, 'ativ', l.ativ, 'demanda', l.demanda, 'obs', l.obs, 'ligado_por', l.criado_por, 'ligado_em', l.criado_em,
      'sol', case when l.s is null then null else jsonb_build_object('id', l.sol_id, 'num', l.s->>'num', 'status', l.s->>'status', 'desc', l.s->>'desc',
                'qtd', (l.s->>'qtd')::numeric, 'preco', (l.s->>'preco')::numeric, 'valor', round(((l.s->>'qtd')::numeric * (l.s->>'preco')::numeric), 2),
                'semaforo', l.s->>'sem', 'precisa_em', l.s->>'data', 'solicitante', l.s->>'solicitante',
                'cotacoes', jsonb_array_length(coalesce(l.s->'cots', '[]'::jsonb)),
                'menor_cotacao', (select min((c->>'preco')::numeric) from jsonb_array_elements(coalesce(l.s->'cots', '[]'::jsonb)) c)) end,
      'item', case when l.i_cod is null then null else jsonb_build_object('codigo', l.i_cod, 'descricao', l.i_desc, 'unidade', l.i_un, 'pacote', l.i_pac, 'evento', l.i_ev) end,
      'oc', l.ocs, 'notas', l.nfs,
      'pedido_valor', coalesce((select sum((o->>'valor')::numeric) from jsonb_array_elements(coalesce(l.ocs, '[]'::jsonb)) o where o->>'status' in ('aprovada', 'recebida_parcial', 'recebida')), 0),
      'nota_valor', coalesce((select sum((n->>'valor_item')::numeric) from jsonb_array_elements(coalesce(l.nfs, '[]'::jsonb)) n where coalesce(n->>'status', '') <> 'lancada'), 0),
      'canteiro', case
          when l.s is null then 'solicitacao_nao_encontrada'
          when l.ocs is null then 'sem_pedido'
          when exists (select 1 from jsonb_array_elements(l.ocs) o where o->>'status' = 'em_alcada') and not exists (select 1 from jsonb_array_elements(l.ocs) o where o->>'status' in ('aprovada', 'recebida_parcial', 'recebida')) then 'aguarda_aprovacao'
          when (select coalesce(sum((o->>'recebido_qtd')::numeric), 0) from jsonb_array_elements(l.ocs) o) <= 0 then 'pedido_emitido'
          when (select coalesce(sum((o->>'recebido_qtd')::numeric), 0) from jsonb_array_elements(l.ocs) o) < (select coalesce(sum((o->>'qtd')::numeric), 0) from jsonb_array_elements(l.ocs) o) then 'recebido_parcial'
          else 'recebido' end
    ) order by l.ativ, l.elo_id), '[]'::jsonb)
  from linhas l $$;

-- Rastro completo de uma tarefa.
create or replace function public.taf_erp_rastro(p_chave text, p_obra text, p_ativ text, p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; t public.taf_ciclo_ativ; v_ev jsonb; v_compras jsonb; v_sem jsonb; v_av jsonb := '[]'::jsonb; v_evs text[];
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  select * into t from public.taf_ciclo_ativ x where x.obra = p_obra and x.id = p_ativ;
  if t.id is null then raise exception 'TAREFA NAO EXISTE NO CRONOGRAMA'; end if;

  -- eventos alcançados, com receita, meta, cotado, comprometido, realizado e a cadeia de medição
  with ev as (select distinct e.evento, e.ativ_id, e.via from public._taf_erp_eventos_da(p_obra, p_ativ) e),
  val as (select i.evento, count(*) as n, sum(x.venda) as venda, sum(x.meta) as meta, sum(x.teto) as teto, sum(x.cotado) as cotado,
                 sum(x.comprometido) as comp, sum(x.realizado) as real
            from public._taf_erp_valores(p_obra) x join public.taf_erp_item i on i.obra = p_obra and i.codigo = x.codigo group by i.evento),
  md as (   -- medições com o valor da receita (quantidade medida x preço licitado unitário do item)
    select m.id as med_id, m.dados->>'item' as item, i.evento, m.dados->>'status' as st, m.dados->>'bc' as bc,
           coalesce((m.dados->>'qtd')::numeric, 0) * case when coalesce(i.qtd, 0) = 0 then 0 else i.venda / i.qtd end as valor
      from public.taf_erp_doc m left join public.taf_erp_item i on i.obra = p_obra and i.codigo = m.dados->>'item'
     where m.obra = p_obra and m.tipo = 'med'),
  bcv as (select bc, sum(valor) as bruto from md where bc is not null group by bc),
  bc as (select b.id, b.dados->>'status' as st, b.dados->>'num' as num,
                nullif(b.dados->>'valorAprovado', '')::numeric as aprov, coalesce(nullif(b.dados->>'reajuste', '')::numeric, 0) as rj,
                (select f.dados->>'valor' from public.taf_erp_doc f where f.obra = p_obra and f.tipo = 'fat' and f.dados->>'bc' = b.id limit 1)::numeric as fat_valor,
                (select coalesce(sum((r.dados->>'valor')::numeric), 0) from public.taf_erp_doc f join public.taf_erp_doc r on r.obra = p_obra and r.tipo = 'rec' and r.dados->>'fat' = f.id
                  where f.obra = p_obra and f.tipo = 'fat' and f.dados->>'bc' = b.id) as rec_valor
           from public.taf_erp_doc b where b.obra = p_obra and b.tipo = 'bc'),
  med as (
    select md.evento,
           sum(md.valor) as lancado,
           sum(md.valor) filter (where md.st = 'atestada') as atestado,
           sum(md.valor) filter (where md.bc is not null) as em_boletim,
           sum(case when bc.st in ('aprovado', 'faturado') and bcv.bruto > 0 then md.valor / bcv.bruto * coalesce(bc.aprov, round(bcv.bruto * (1 + bc.rj / 100), 2)) end) as aprovado,
           sum(case when bc.fat_valor is not null and bcv.bruto > 0 then md.valor / bcv.bruto * bc.fat_valor end) as faturado,
           sum(case when bcv.bruto > 0 then md.valor / bcv.bruto * bc.rec_valor end) as recebido
      from md left join bc on bc.id = md.bc left join bcv on bcv.bc = md.bc group by md.evento)
  select coalesce(jsonb_agg(jsonb_build_object(
      'evento', ev.evento, 'ativ', ev.ativ_id, 'ativ_nome', ta.nome, 'via', ev.via,
      'previsto_fim', coalesce(ta.prev_fim, ta.fim_base), 'bm_previsto', public._taf_ciclo_bm(p_obra, coalesce(ta.prev_fim, ta.fim_base)),
      'itens', coalesce(val.n, 0),
      'receita_contratual', round(coalesce(val.venda, 0), 2), 'meta_custo', round(coalesce(val.meta, 0), 2), 'teto', round(coalesce(val.teto, 0), 2),
      'cotado_aberto', round(coalesce(val.cotado, 0), 2), 'comprometido', round(coalesce(val.comp, 0), 2), 'realizado', round(coalesce(val.real, 0), 2),
      'medicao', jsonb_build_object('lancada', round(coalesce(med.lancado, 0), 2), 'atestada', round(coalesce(med.atestado, 0), 2),
                 'em_boletim', round(coalesce(med.em_boletim, 0), 2), 'aprovada_cliente', round(coalesce(med.aprovado, 0), 2),
                 'faturada', round(coalesce(med.faturado, 0), 2), 'recebida', round(coalesce(med.recebido, 0), 2))
    ) order by ev.evento), '[]'::jsonb), coalesce(array_agg(ev.evento), '{}')
    into v_ev, v_evs
    from ev join public.taf_ciclo_ativ ta on ta.obra = p_obra and ta.id = ev.ativ_id
    left join val on val.evento = ev.evento left join med on med.evento = ev.evento;

  v_compras := public._taf_erp_compras(p_obra, array[p_ativ]);

  -- compras nos itens desses eventos que ninguém ligou a esta tarefa (aparecem como "pelo evento", não confirmadas)
  select coalesce(jsonb_agg(jsonb_build_object('sol', s.dados->>'num', 'status', s.dados->>'status', 'item', s.dados->>'item', 'evento', i.evento,
            'valor', round((s.dados->>'qtd')::numeric * (s.dados->>'preco')::numeric, 2), 'desc', s.dados->>'desc') order by s.mud desc), '[]'::jsonb)
    into v_sem
    from public.taf_erp_doc s join public.taf_erp_item i on i.obra = p_obra and i.codigo = s.dados->>'item'
   where s.obra = p_obra and s.tipo = 'sol' and coalesce(s.dados->>'status', '') <> 'cancelada' and i.evento = any(v_evs)
     and not exists (select 1 from public.taf_erp_doc e where e.obra = p_obra and e.tipo = 'elo' and e.dados->>'ativ' = p_ativ and e.dados->>'sol' = s.id
                      and coalesce(e.dados->>'cancelado', 'false') <> 'true');

  if jsonb_array_length(v_ev) = 0 then
    v_av := v_av || to_jsonb('Esta tarefa não alimenta nenhum evento do cronograma pelas dependências conhecidas.'::text); end if;
  if exists (select 1 from jsonb_array_elements(v_compras) c where jsonb_typeof(c->'item') = 'object' and not ((c->'item'->>'evento') = any(v_evs))) then
    v_av := v_av || to_jsonb('Há compra ligada a esta tarefa cujo item é de um evento que a tarefa não alcança pelas dependências: conferir o vínculo ou a dependência.'::text); end if;
  if exists (select 1 from jsonb_array_elements(v_compras) c where jsonb_typeof(c->'item') <> 'object' and jsonb_typeof(c->'sol') = 'object') then
    v_av := v_av || to_jsonb('Há compra ligada a esta tarefa cujo item não consta na planilha da obra.'::text); end if;
  if exists (select 1 from jsonb_array_elements(v_compras) c where c->>'canteiro' = 'solicitacao_nao_encontrada') then
    v_av := v_av || to_jsonb('Há vínculo apontando para uma solicitação que não existe mais.'::text); end if;

  return jsonb_build_object(
    'ativ', jsonb_build_object('id', t.id, 'nome', t.nome, 'tipo', t.tipo, 'evento', t.evento, 'fase', t.fase,
              'prev_ini', coalesce(t.prev_ini, t.ini_base), 'prev_fim', coalesce(t.prev_fim, t.fim_base), 'ini_real', t.ini_real, 'fim_real', t.fim_real),
    'eventos', v_ev, 'compras', v_compras, 'compras_do_evento_sem_vinculo', v_sem, 'avisos', v_av,
    'regras', jsonb_build_array(
      'Pedido emitido não prova material no canteiro: só o recebimento do pedido mostra o que chegou.',
      'Nota substitui o pedido no custo: o comprometido é o pedido aprovado ainda sem nota; o realizado é a nota rateada. Os dois nunca se somam para o mesmo valor.',
      'Receita contratual é o preço licitado do item; meta é o custo interno; nenhum dos dois é dinheiro recebido.',
      'Medida, aprovada pelo cliente, faturada e recebida são etapas diferentes; faturada e recebida são rateadas pelo valor medido de cada evento dentro do boletim.'));
end $$;

-- Resumo curto para listas (telas do ciclo): uma linha por tarefa que tem compra vinculada.
create or replace function public.taf_erp_resumo(p_chave text, p_obra text, p_ativs text[], p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if p_ativs is null or cardinality(p_ativs) = 0 or cardinality(p_ativs) > 200 then return '{}'::jsonb; end if;
  return coalesce((
    select jsonb_object_agg(g.ativ, g.v) from (
      select c->>'ativ' as ativ, jsonb_agg(jsonb_build_object('sol', c#>>'{sol,num}', 'solicitacao', c#>>'{sol,status}', 'canteiro', c->>'canteiro', 'demanda', c->'demanda',
               'pedido', (select string_agg(o->>'num', ', ') from jsonb_array_elements(coalesce(nullif(c->'oc', 'null'::jsonb), '[]'::jsonb)) o),
               'item', c#>>'{item,codigo}', 'evento', c#>>'{item,evento}', 'pedido_valor', c->'pedido_valor', 'nota_valor', c->'nota_valor')) as v
        from jsonb_array_elements(public._taf_erp_compras(p_obra, p_ativs)) c group by 1) g), '{}'::jsonb);
end $$;

revoke all on function public._taf_erp_valores(text), public._taf_erp_eventos_da(text, text), public._taf_erp_compras(text, text[]) from public, anon, authenticated;
revoke all on function public.taf_erp_rastro(text, text, text, text), public.taf_erp_resumo(text, text, text[], text) from public;
grant execute on function public.taf_erp_rastro(text, text, text, text), public.taf_erp_resumo(text, text, text[], text) to anon, authenticated;
