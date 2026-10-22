-- 22/10/2026: ligar restrição 05C (tarefa_id Rxx) a atividades pela demanda, sem duplicar.
-- 1) uma demanda não cancelada por restrição, por obra
create unique index if not exists taf_ciclo_demanda_tarefa_1x on public.taf_ciclo_demanda (obra, tarefa_id)
  where tarefa_id is not null and situacao <> 'cancelada';
-- 2) taf_ciclo_ler passa a devolver a frente da EAP em cada atividade de 'crono' ('frente', a.frente_cod),
--    aplicado com replace sobre a definição atual (uma ocorrência de "'ev', a.evento,").
-- Reverter: drop index public.taf_ciclo_demanda_tarefa_1x; (a chave 'frente' extra no JSON é inofensiva)
