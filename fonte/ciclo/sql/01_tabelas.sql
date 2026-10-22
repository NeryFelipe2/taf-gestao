-- Migration taf_ciclo_v1_tabelas
-- Cria só objetos novos com prefixo taf_ciclo_. Não altera nenhuma tabela ou função existente.

create domain public.taf_ciclo_causa as text check (value in
  ('MÃO DE OBRA','PLANEJAMENTO','MATERIAL','EQUIPAMENTO','PROJETO','CLIENTE / FISCAL','CHUVA','OUTRO'));

-- 1. Obra e parâmetros (como a 02. PARÂMETROS da rev6)
create table public.taf_ciclo_obra (
  obra            text primary key check (obra ~ '^\d{3}$'),
  nome            text not null,
  engenheiro      text not null,                 -- igual a taf_pessoa_chave.pessoa e ao dono das tarefas
  ep              date not null,                 -- dia zero do cronograma (03/09/2026)
  base_rev        text not null,                 -- de onde veio a base congelada
  base_aprovada_por text,                        -- null = "base não aprovada (PENDENTE Thadeu)"
  base_aprovada_em  date,
  equipe          text[] not null default '{}',  -- chips de responsável, na ordem
  setores         text[] not null default '{}',  -- nomes que são setor: "SEM DONO (setor)"
  pub_no_prazo_h  smallint not null default 10 check (pub_no_prazo_h between 0 and 23),  -- 1º dia útil
  pub_limite_h    smallint not null default 18 check (pub_limite_h between 0 and 23),    -- 2º dia útil
  fecha_de_h      smallint not null default 12 check (fecha_de_h between 0 and 23),      -- último dia útil
  ppc_verde       smallint not null default 80,
  ppc_amarelo     smallint not null default 60,
  janela_semanas  smallint not null default 6 check (janela_semanas between 3 and 8),
  janela_obrig    smallint not null default 3 check (janela_obrig between 1 and 6),
  corte_bm_dia    smallint check (corte_bm_dia between 1 and 31),     -- R30: 20 (proposta)
  corte_bm_sit    text check (corte_bm_sit in ('PROPOSTA','ACEITA')),
  chave_geral_escreve boolean not null default true,  -- false depois de entregar as chaves pessoais
  criado_em       timestamptz not null default now()
);

-- 2. Feriados. cal_mpp = está no calendário de dias úteis do MS Project (entra no cálculo das tarefas UTEIS).
create table public.taf_ciclo_feriado (
  obra        text not null default '*',          -- '*' = todas as obras
  data        date not null,
  nome        text not null,
  abrangencia text not null check (abrangencia in ('NACIONAL','ESTADUAL','MUNICIPAL','FACULTATIVO')),
  cal_mpp     boolean not null default false,
  primary key (obra, data)
);

-- 3. Áreas das demandas (REQ-27), com dono por obra
create table public.taf_ciclo_area (
  obra   text not null references public.taf_ciclo_obra,
  area   text not null check (area ~ '^[A-Z]{4,14}$'),
  rotulo text not null,
  dono   text,                                     -- null = "falta pessoa"
  ordem  smallint not null,
  primary key (obra, area)
);

-- 4. Chaves pessoais novas (gestor, diretoria, leitura, engenheiro substituto). Só o hash.
create table public.taf_ciclo_chave (
  hash      text primary key check (hash ~ '^[0-9a-f]{64}$'),
  nome      text not null,                         -- 'Felipe (pessoal)'
  pessoa    text,                                  -- nome usado como responsável/decisor
  papel     text not null check (papel in ('engenheiro','gestor','diretoria','leitura')),
  obras     text[] not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  check (papel = 'leitura' or pessoa is not null)
);

-- 5. Cronograma: base congelada + previsão vigente + datas reais
create table public.taf_ciclo_ativ (
  obra        text not null references public.taf_ciclo_obra,
  id          text not null check (id ~ '^T\d{1,4}$'),
  ordem       int  not null,                       -- ordem do MS Project
  topo        int  not null,                       -- ordem topológica (calculada na carga)
  nome        text not null,
  fase        text not null,                       -- '3.1 TERRAPLANAGEM E DESVIO DE TUBULAÇÃO'
  tipo        text not null check (tipo in ('ativ','continua','marco','evento','evento_pct')),
  evento      text check (evento ~ '^\d\.\d\.\d$'),
  contratual  boolean not null default false,      -- marco contratual (alvo de folga e de "de acordo")
  frente_cod  text,                                -- código da LISTA_FRENTES da rev6 (PENDENTE conferência)
  cal         text not null check (cal in ('CORRIDOS','UTEIS')),
  dur         int  not null check (dur >= 0),      -- em dias do calendário da tarefa
  hora_marco  smallint check (hora_marco in (8,17)),
  b0          int  not null,                       -- BASE: início, em dias desde ep (inclusivo)
  b1          int  not null,                       -- BASE: fim exclusivo (17h do dia d = d+1)
  ini_base    date not null,                       -- BASE como o MS Project mostra
  fim_base    date not null,
  pred        jsonb not null default '[]',         -- [["T17","SS",5], ...]  BASE
  prev_ini    date,                                -- previsão vigente (null = base)
  prev_fim    date,
  prev_replan bigint,                              -- replanejamento que fixou a previsão
  ini_real    date,
  fim_real    date,
  real_origem text check (real_origem in ('apontamento','manual','fechamento')),
  atualizado_em timestamptz,
  atualizado_por text,
  primary key (obra, id),
  check (b1 >= b0),
  check ((tipo in ('marco','evento')) = (dur = 0)),
  check ((dur = 0) = (hora_marco is not null)),
  check (jsonb_typeof(pred) = 'array'),
  check (prev_ini is null or prev_fim is not null),
  check (prev_fim is null or prev_ini is null or prev_fim >= prev_ini),
  check (fim_real is null or ini_real is null or fim_real >= ini_real),
  check (dur > 0 or ini_real is not distinct from fim_real)
);

-- 6. Semana (chave = segunda; sexta = chave da rev6)
create table public.taf_ciclo_semana (
  obra         text not null references public.taf_ciclo_obra,
  seg          date not null check (extract(isodow from seg) = 1),
  sexta        date generated always as (seg + 4) stored,
  estado       text not null default 'rascunho' check (estado in ('rascunho','publicada','fechada')),
  publicada_em timestamptz, publicada_por text,
  status_pub   text check (status_pub in ('NO_PRAZO','ATRASADA','FORA_DO_PRAZO')),
  cobertura    text check (cobertura in ('COMPLETA','INCOMPLETA','MUITO INCOMPLETA')),
  janela       jsonb,                              -- fotografia da preparação no ato de publicar (congelada)
  fechada_em   timestamptz, fechada_por text,
  resumo       jsonb,                              -- foto do 1º fechamento (congelada)
  resumo_atual jsonb,                              -- refeito em cada novo fechamento depois de reabrir
  reaberta     int not null default 0,
  ensaio       boolean not null default false,          -- semana de ensaio: mostra o PPC, não entra nas luzes
  nota         text check (length(nota) <= 1000),  -- "principal causa" nas palavras do engenheiro
  primary key (obra, seg),
  check (estado = 'rascunho' or (publicada_em is not null and status_pub is not null and janela is not null)),
  check (estado <> 'fechada' or (fechada_em is not null and resumo is not null))
);

-- 7. Compromisso (vários por T na mesma semana: C1..Cn)
create table public.taf_ciclo_comp (
  obra          text not null,
  seg           date not null,
  cid           text not null check (cid ~ '^C\d{1,3}$'),
  ativ          text,                              -- T do cronograma; null = avulso
  titulo        text check (length(titulo) <= 120),
  frente        text check (length(frente) <= 40), -- obrigatória no avulso (ADM, BM, APONT, 3.5.1...)
  entrega_tipo  text not null check (entrega_tipo in ('concluir','etapa','qtd')),
  entrega       text not null check (length(trim(entrega)) between 3 and 300),  -- critério de concluído
  qtd           numeric(14,3) check (qtd > 0),
  un            text check (un in ('m','m²','m³','un','kg','t','trecho','evento','vb')),
  resp          text not null check (length(trim(resp)) between 2 and 60),
  prometido     date not null,
  local         text check (length(local) <= 60),
  com_restricao boolean not null default false,
  justif_restricao text check (length(justif_restricao) <= 500),
  origem        text not null default 'plano' check (origem in ('plano','saldo')),
  origem_ref    text check (origem_ref ~ '^\d{4}-\d{2}-\d{2}\|C\d{1,3}$'),
  extra         boolean not null default false,    -- criado depois de publicar: fora do PPC
  publicado     jsonb,                             -- cópia congelada no ato de publicar
  versao        int not null default 1,
  cancelado_em  timestamptz,
  cancel_motivo text check (length(cancel_motivo) <= 300),
  resultado     text check (resultado in ('cumprido','parcial','nao')),
  feito_qtd     numeric(14,3) check (feito_qtd >= 0),
  feito_pct     smallint check (feito_pct between 1 and 99),
  falta         text check (length(falta) <= 300),
  causa         public.taf_ciclo_causa,
  causa_det     text check (length(causa_det) <= 40),
  causa_txt     text check (length(causa_txt) <= 500),
  fechado_em    timestamptz, fechado_por text,
  saldo         text check (saldo in ('aceito','descartado')),  -- destino do saldo DESTE compromisso
  saldo_motivo  text check (length(saldo_motivo) <= 300),
  em            timestamptz not null default now(),
  quem          text not null,
  primary key (obra, seg, cid),
  foreign key (obra, seg)  references public.taf_ciclo_semana,
  foreign key (obra, ativ) references public.taf_ciclo_ativ,
  constraint "AVULSO PRECISA DE TITULO E FRENTE" check (ativ is not null or (length(trim(coalesce(titulo,''))) >= 3 and length(trim(coalesce(frente,''))) >= 2)),
  constraint "QUANTIDADE E UNIDADE ANDAM JUNTAS" check ((qtd is null) = (un is null)),
  constraint "ENTREGA POR QUANTIDADE PRECISA DA QUANTIDADE" check (entrega_tipo <> 'qtd' or qtd is not null),
  constraint "DATA PROMETIDA FORA DA SEMANA" check (prometido between seg and seg + 6),
  constraint "COM RESTRICAO PRECISA DE JUSTIFICATIVA (10 LETRAS)" check (not com_restricao or length(trim(coalesce(justif_restricao,''))) >= 10),
  constraint "SALDO PRECISA DA ORIGEM" check ((origem = 'saldo') = (origem_ref is not null)),
  constraint "EXTRA NAO TEM COPIA PUBLICADA" check (not extra or publicado is null),
  constraint "CANCELAR PRECISA DE MOTIVO (5 LETRAS)" check (cancelado_em is null or (length(trim(coalesce(cancel_motivo,''))) >= 5 and resultado = 'nao')),
  constraint "NAO CUMPRIDO PRECISA DE CAUSA" check (resultado is null or resultado = 'cumprido' or causa is not null),
  constraint "PARCIAL PRECISA DE QUANTO FOI FEITO OU DO QUE FALTA" check (resultado is distinct from 'parcial'
         or feito_qtd is not null or feito_pct is not null or length(trim(coalesce(falta,''))) >= 3),
  constraint "CAUSA OUTRO PRECISA DE TEXTO (5 LETRAS)" check (causa is distinct from 'OUTRO' or length(trim(coalesce(causa_txt,''))) >= 5),
  constraint "DESCARTAR SALDO PRECISA DE MOTIVO" check (saldo is distinct from 'descartado' or length(trim(coalesce(saldo_motivo,''))) >= 5)
);
create unique index taf_ciclo_comp_saldo_1x on public.taf_ciclo_comp (obra, origem_ref) where origem_ref is not null;
create index taf_ciclo_comp_ativ on public.taf_ciclo_comp (obra, ativ);

-- 8. Atividade da semana que não entrou (cobertura da programação, 05A S:T)
create table public.taf_ciclo_fora (
  obra   text not null,
  seg    date not null,
  ativ   text not null,
  motivo text not null check (motivo in ('NAO_COMECA','TRAVADA','OUTRA_PRIORIDADE','JA_TERMINOU','OUTRO')),
  txt    text check (length(txt) <= 300),
  em     timestamptz not null default now(), quem text not null,
  primary key (obra, seg, ativ),
  foreign key (obra, seg)  references public.taf_ciclo_semana,
  foreign key (obra, ativ) references public.taf_ciclo_ativ,
  constraint "MOTIVO OUTRO PRECISA DE TEXTO" check (motivo <> 'OUTRO' or length(trim(coalesce(txt,''))) >= 5)
);

-- 9. Demanda = restrição atribuída a uma área (modelo 05C)
create table public.taf_ciclo_demanda (
  obra         text not null references public.taf_ciclo_obra,
  num          int  not null check (num > 0),      -- D1, D2... por obra
  area         text not null,
  oque         text not null check (length(trim(oque)) between 5 and 300),  -- escrito como estado concluído
  resp         text not null check (length(trim(resp)) between 2 and 60),   -- uma pessoa (setor = SEM DONO)
  pede_decisao boolean not null default false,
  decisores    text[] not null default '{}',
  contraparte  text check (length(contraparte) <= 80),   -- 'SANEAGO', 'concessionária de energia'
  prazo        date not null,                       -- "precisa até" ORIGINAL: nunca muda
  nova_data    date,                                -- última nova data (05C U)
  vezes        int  not null default 0 check (vezes >= 0),   -- vezes replanejada (05C V)
  ativs        text[] not null default '{}',
  sem_ativ     boolean not null default false,      -- "não trava atividade", marcado de propósito
  item         text check (item in ('material','equipe','equipamento','projeto','liberacao')),
  situacao     text not null default 'aberta' check (situacao in ('aberta','respondida','resolvida','cancelada')),
  resposta     text check (length(resposta) <= 1000),
  respondida_por text, respondida_em timestamptz,
  resolvida_em date, resolvida_por text,
  origem       text not null check (origem in ('preparo','apontamento','fechamento','replan','manual','segunda')),
  origem_ref   text,
  ref_ext      text check (length(ref_ext) <= 80),  -- protocolo, e-mail, ofício
  tarefa_id    text check (tarefa_id ~ '^(R\d{1,4}|N\d{1,15})$'),  -- Rxx/Nxx do site principal (só leitura)
  cenario      jsonb,                               -- {"ativ":"T30","fim":"2027-01-29","fonte":"R103"}
  impacto      jsonb,                               -- última simulação "se não resolver até"
  cobrancas    jsonb not null default '[]',         -- [{"em":..,"quem":..,"canal":"email"}]
  criada_por   text not null,
  criada_em    timestamptz not null default now(),
  em           timestamptz not null default now(),
  quem         text not null,
  primary key (obra, num),
  foreign key (obra, area) references public.taf_ciclo_area,
  constraint "DEMANDA PRECISA DE ATIVIDADE OU DE NAO TRAVA" check (cardinality(ativs) > 0 or sem_ativ),
  constraint "PEDE DECISAO: INFORME QUEM DECIDE" check (not pede_decisao or cardinality(decisores) > 0),
  check ((nova_data is null) = (vezes = 0)),
  constraint "RESPOSTA VAZIA" check (situacao <> 'respondida' or length(trim(coalesce(resposta,''))) >= 3),
  check (situacao <> 'resolvida' or resolvida_em is not null),
  check (jsonb_typeof(cobrancas) = 'array')
);
create index taf_ciclo_dem_ativs on public.taf_ciclo_demanda using gin (ativs);

-- 10. Preparação (5 itens digitados; "serviço anterior" é calculado)
create table public.taf_ciclo_preparo (
  obra    text not null,
  ativ    text not null,
  item    text not null check (item in ('material','equipe','equipamento','projeto','liberacao')),
  estado  text not null check (estado in ('ok','pendente','na')),
  demanda int,
  lote    boolean not null default false,          -- veio de "Tudo OK"
  obs     text check (length(obs) <= 300),
  em      timestamptz not null default now(), quem text not null,
  primary key (obra, ativ, item),
  foreign key (obra, ativ)    references public.taf_ciclo_ativ,
  foreign key (obra, demanda) references public.taf_ciclo_demanda,
  constraint "PENDENTE PRECISA DE DEMANDA" check (estado <> 'pendente' or demanda is not null)
);

-- 11. Apontamento: uma linha por compromisso por dia
create table public.taf_ciclo_apont (
  obra      text not null,
  seg       date not null,
  cid       text not null,
  dia       date not null,
  situacao  text not null check (situacao in ('andou','parado','entregue')),
  qtd       numeric(14,3) check (qtd >= 0),        -- do dia; null = não informado
  causa     public.taf_ciclo_causa,
  causa_det text check (length(causa_det) <= 40),
  obs       text check (length(obs) <= 300),
  link      text check (link ~ '^https://' and length(link) <= 300),
  demanda   int,
  lote      boolean not null default false,        -- veio de "Andou em todos" ou "Dia parado para todos"
  tardio    boolean not null default false,        -- gravado depois das 9h do dia seguinte
  em        timestamptz not null default now(), quem text not null,
  primary key (obra, seg, cid, dia),
  foreign key (obra, seg, cid) references public.taf_ciclo_comp,
  foreign key (obra, demanda)  references public.taf_ciclo_demanda,
  check (dia between seg and seg + 6),
  constraint "PARADO PRECISA DE CAUSA" check ((situacao = 'parado') = (causa is not null))
);

-- 12. Replanejamento: nunca é alterado (só a decisão enquanto pendente e o "de acordo")
create table public.taf_ciclo_replan (
  id          bigint generated always as identity primary key,
  obra        text not null references public.taf_ciclo_obra,
  ativ        text,
  seg         date,
  cid         text,
  origem      text not null check (origem in ('fechamento','data_real','preparo','manual','revisao')),
  causa       public.taf_ciclo_causa not null,
  causa_det   text check (length(causa_det) <= 40),
  motivo_txt  text check (length(motivo_txt) <= 300),
  acao        text not null check (length(trim(acao)) between 3 and 300),
  resp        text not null check (length(trim(resp)) between 2 and 60),
  ini_antes   date, fim_antes date,
  ini_novo    date, fim_novo  date not null,
  sugestao    jsonb,                               -- saída de _taf_ciclo_sugestao, como foi mostrada
  decisao     text not null default 'pendente' check (decisao in ('pendente','sem_efeito','tudo','so_esta')),
  justif      text check (length(justif) <= 500),
  dispensa    text[] not null default '{}',        -- ligações suspensas: 'T18>T44'
  decidido_em timestamptz,
  substitui   bigint references public.taf_ciclo_replan,
  acordo      text check (acordo in ('pendente','ok','revisar')),   -- null = não precisa
  acordo_por  text, acordo_em timestamptz,
  acordo_obs  text check (length(acordo_obs) <= 500),
  autor       text not null, papel text not null,
  em          timestamptz not null default now(),
  foreign key (obra, ativ) references public.taf_ciclo_ativ,
  foreign key (obra, seg, cid) references public.taf_ciclo_comp,
  check (ativ is not null or cid is not null),
  check (ini_novo is null or fim_novo >= ini_novo),
  constraint "SO ESTA PRECISA DE JUSTIFICATIVA (10 LETRAS)" check (decisao <> 'so_esta' or length(trim(coalesce(justif,''))) >= 10),
  constraint "PEDIR REVISAO PRECISA DE MOTIVO (5 LETRAS)" check (acordo is distinct from 'revisar' or length(trim(coalesce(acordo_obs,''))) >= 5)
);
create unique index taf_ciclo_replan_subst_1x on public.taf_ciclo_replan (substitui) where substitui is not null;
create index taf_ciclo_replan_ativ on public.taf_ciclo_replan (obra, ativ, id);

-- 13. Envelope de cada chamada de escrita (idempotência da fila do celular)
create table public.taf_ciclo_evento (
  id         bigint generated always as identity primary key,
  obra       text not null,
  acao       text not null,
  ref        text,
  ativ       text,
  dados      jsonb not null,                       -- o que veio do aparelho
  resultado  jsonb,
  autor      text not null, papel text not null, verificado boolean not null,
  uid        uuid not null unique,
  em         timestamptz not null default now()
);

-- 14. Histórico linha a linha (gatilho): antes e depois só dos campos que mudaram
create table public.taf_ciclo_log (
  id         bigint generated always as identity primary key,
  obra       text not null,
  tabela     text not null,
  chave      text not null,
  ativ       text,
  acao       text not null,                        -- INSERT/UPDATE/DELETE ou a ação da RPC
  antes      jsonb,
  depois     jsonb,
  motivo     text,
  quem       text not null,
  papel      text not null,
  verificado boolean not null,                     -- true = identidade pela chave pessoal
  uid        uuid,                                 -- liga ao taf_ciclo_evento
  em         timestamptz not null default now()
);
create index taf_ciclo_log_obra_id on public.taf_ciclo_log (obra, id);
create index taf_ciclo_log_item    on public.taf_ciclo_log (obra, tabela, chave, id);
create index taf_ciclo_log_ativ    on public.taf_ciclo_log (obra, ativ, id) where ativ is not null;

-- Gatilho de histórico (vale também para SQL direto)
create or replace function public._taf_ciclo_log_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
        r jsonb; a jsonb := '{}'; d jsonb := '{}'; k text; ch text := ''; i int; v_ativ text;
begin
  r := coalesce(n, o);
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('em','quem','atualizado_em','atualizado_por') and (o->k) is distinct from (n->k) then
        a := a || jsonb_build_object(k, o->k);
        d := d || jsonb_build_object(k, n->k);
      end if;
    end loop;
    if d = '{}'::jsonb then return new; end if;
  else
    a := o; d := n;
  end if;
  for i in 0 .. tg_nargs - 1 loop
    ch := ch || (case when i > 0 then '|' else '' end) || coalesce(r ->> tg_argv[i], '');
  end loop;
  v_ativ := case tg_table_name when 'taf_ciclo_ativ' then r->>'id' else r->>'ativ' end;
  if tg_table_name = 'taf_ciclo_apont' then
    select c.ativ into v_ativ from public.taf_ciclo_comp c
     where c.obra = r->>'obra' and c.seg = (r->>'seg')::date and c.cid = r->>'cid';
  end if;
  insert into public.taf_ciclo_log(obra, tabela, chave, ativ, acao, antes, depois, motivo, quem, papel, verificado, uid)
  values (r->>'obra', tg_table_name, ch, v_ativ,
          coalesce(nullif(current_setting('taf.acao', true), ''), tg_op), a, d,
          nullif(current_setting('taf.motivo', true), ''),
          coalesce(nullif(current_setting('taf.quem', true), ''), 'SQL direto (' || session_user || ')'),
          coalesce(nullif(current_setting('taf.papel', true), ''), 'banco'),
          coalesce(nullif(current_setting('taf.verif', true), '')::boolean, false),
          nullif(current_setting('taf.uid', true), '')::uuid);
  return coalesce(new, old);
end $$;

-- Gatilho de congelamento
create or replace function public._taf_ciclo_trava() returns trigger
language plpgsql set search_path = public as $$
declare k_acordo text[] := array['acordo','acordo_por','acordo_em','acordo_obs'];
        k_decisao text[] := array['decisao','justif','dispensa','decidido_em','sugestao'];
begin
  if tg_op = 'TRUNCATE' then raise exception 'HISTORICO NAO SE ALTERA'; end if;
  if tg_table_name in ('taf_ciclo_log','taf_ciclo_evento') then
    raise exception 'HISTORICO NAO SE ALTERA';
  elsif tg_table_name = 'taf_ciclo_ativ' then
    if coalesce(current_setting('taf.rebase', true), '') <> 'sim' and (tg_op = 'DELETE' or
       (new.nome, new.fase, new.tipo, new.evento, new.cal, new.dur, new.hora_marco, new.b0, new.b1,
        new.ini_base, new.fim_base, new.pred, new.ordem, new.topo)
       is distinct from
       (old.nome, old.fase, old.tipo, old.evento, old.cal, old.dur, old.hora_marco, old.b0, old.b1,
        old.ini_base, old.fim_base, old.pred, old.ordem, old.topo)) then
      raise exception 'BASE CONGELADA';
    end if;
  elsif tg_table_name = 'taf_ciclo_semana' then
    if tg_op = 'DELETE' then
      if old.estado <> 'rascunho' then raise exception 'SEMANA PUBLICADA NAO SE APAGA'; end if;
    elsif (old.janela is not null and (new.janela, new.publicada_em, new.status_pub, new.ensaio)
                                       is distinct from (old.janela, old.publicada_em, old.status_pub, old.ensaio))
       or (old.resumo is not null and new.resumo is distinct from old.resumo) then
      raise exception 'SEMANA CONGELADA';
    end if;
  elsif tg_table_name = 'taf_ciclo_comp' then
    if old.publicado is not null and (tg_op = 'DELETE' or new.publicado is distinct from old.publicado) then
      raise exception 'PUBLICADO NAO SE ALTERA';
    end if;
  elsif tg_table_name = 'taf_ciclo_demanda' then
    if tg_op = 'DELETE' then raise exception 'DEMANDA NAO SE APAGA: CANCELE'; end if;
    if new.prazo is distinct from old.prazo then raise exception 'PRAZO ORIGINAL NAO MUDA: USE NOVA DATA'; end if;
  elsif tg_table_name = 'taf_ciclo_replan' then
    if tg_op = 'DELETE' then raise exception 'REPLANEJAMENTO NAO SE ALTERA: FACA OUTRO'; end if;
    if (to_jsonb(new) - k_acordo - k_decisao) is distinct from (to_jsonb(old) - k_acordo - k_decisao)
       or (old.decisao <> 'pendente'
           and (to_jsonb(new) - k_acordo) is distinct from (to_jsonb(old) - k_acordo)) then
      raise exception 'REPLANEJAMENTO NAO SE ALTERA: FACA OUTRO';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger t_trava before update or delete on public.taf_ciclo_ativ    for each row execute function public._taf_ciclo_trava();
create trigger t_trava before update or delete on public.taf_ciclo_semana  for each row execute function public._taf_ciclo_trava();
create trigger t_trava before update or delete on public.taf_ciclo_comp    for each row execute function public._taf_ciclo_trava();
create trigger t_trava before update or delete on public.taf_ciclo_demanda for each row execute function public._taf_ciclo_trava();
create trigger t_trava before update or delete on public.taf_ciclo_replan  for each row execute function public._taf_ciclo_trava();
create trigger t_trava before update or delete on public.taf_ciclo_evento  for each row execute function public._taf_ciclo_trava();
create trigger t_trava before update or delete on public.taf_ciclo_log     for each row execute function public._taf_ciclo_trava();
create trigger t_trava_trunc before truncate on public.taf_ciclo_evento for each statement execute function public._taf_ciclo_trava();
create trigger t_trava_trunc before truncate on public.taf_ciclo_log    for each statement execute function public._taf_ciclo_trava();

create trigger t_log after insert or update or delete on public.taf_ciclo_obra    for each row execute function public._taf_ciclo_log_trg('obra');
create trigger t_log after insert or update or delete on public.taf_ciclo_area    for each row execute function public._taf_ciclo_log_trg('area');
create trigger t_log after insert or update or delete on public.taf_ciclo_ativ    for each row execute function public._taf_ciclo_log_trg('id');
create trigger t_log after insert or update or delete on public.taf_ciclo_semana  for each row execute function public._taf_ciclo_log_trg('seg');
create trigger t_log after insert or update or delete on public.taf_ciclo_comp    for each row execute function public._taf_ciclo_log_trg('seg','cid');
create trigger t_log after insert or update or delete on public.taf_ciclo_fora    for each row execute function public._taf_ciclo_log_trg('seg','ativ');
create trigger t_log after insert or update or delete on public.taf_ciclo_demanda for each row execute function public._taf_ciclo_log_trg('num');
create trigger t_log after insert or update or delete on public.taf_ciclo_preparo for each row execute function public._taf_ciclo_log_trg('ativ','item');
create trigger t_log after insert or update or delete on public.taf_ciclo_apont   for each row execute function public._taf_ciclo_log_trg('seg','cid','dia');
create trigger t_log after insert or update or delete on public.taf_ciclo_replan  for each row execute function public._taf_ciclo_log_trg('id');

-- Acesso: igual às taf_* atuais (RLS ligada, sem política, sem grant; só se entra pelas funções)
do $$ declare t text; begin
  foreach t in array array['taf_ciclo_obra','taf_ciclo_feriado','taf_ciclo_area','taf_ciclo_chave','taf_ciclo_ativ',
    'taf_ciclo_semana','taf_ciclo_comp','taf_ciclo_fora','taf_ciclo_demanda','taf_ciclo_preparo','taf_ciclo_apont',
    'taf_ciclo_replan','taf_ciclo_evento','taf_ciclo_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on function public._taf_ciclo_log_trg(), public._taf_ciclo_trava() from public, anon, authenticated;
