-- ERP TAF Admin dentro do site taf-gestao: mesma chave do site, mesmo banco.
-- Tudo com prefixo taf_erp_ (o banco já tem tabelas obras e plano_contas de outro sistema).
-- Nada é apagado: documento só entra ou muda, e cada mudança guarda a versão anterior em taf_erp_doc_hist.
-- Reverter: 99_reverter.sql (guarda cópia e remove só o que este arquivo criou).

create sequence if not exists public.taf_erp_mud_seq;

-- Uma linha por obra. base_gz = dados fixos da obra (EAP, pacotes, metas, plano, extrato, ficha) em gzip+base64.
create table if not exists public.taf_erp_obra (
  codigo text primary key check (codigo ~ '^[0-9]{3}$'),
  nome text not null,
  contratante text,
  ordem int not null default 0,
  base_gz text,
  base_sha text,
  estado jsonb not null default '{}'::jsonb,       -- linha de base, remanejamentos, parâmetros (S.t sem os documentos)
  mud bigint not null default nextval('public.taf_erp_mud_seq'),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Documentos do fluxo do ERP (solicitação, OC, nota, título, medição, ...). obra '*' = cadastros que valem para todas.
-- Índice dos itens da planilha da obra (só para ligar compra, custo e BM a tarefa e evento sem abrir a base compactada).
-- É derivado de taf_erp_obra.base_gz na carga; quem manda é a base.
create table if not exists public.taf_erp_item (
  obra text not null references public.taf_erp_obra(codigo),
  codigo text not null, descricao text, unidade text, qtd numeric, pacote text, evento text,
  venda numeric, meta numeric, teto numeric, meta_unit numeric,
  primary key (obra, codigo)
);
create index if not exists taf_erp_item_evento on public.taf_erp_item (obra, evento);
create index if not exists taf_erp_item_pacote on public.taf_erp_item (obra, pacote);

create table if not exists public.taf_erp_doc (
  obra text not null,
  id text not null check (length(id) between 1 and 120),
  tipo text not null check (tipo in ('sol','oc','nf','tit','med','conc','aud','apt','rst','atv','tar','bc','fat','rec','lan','fech',
    'forn','ins','banc','lfx','mov','cobr','ctb','est','inv','ctr','prj','pat','frt','fmv','col','pto','sst','elo')),
  dados jsonb not null,
  mud bigint not null default nextval('public.taf_erp_mud_seq'),
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  papel text,
  primary key (obra, id)
);
create index if not exists taf_erp_doc_obra_tipo on public.taf_erp_doc (obra, tipo);
create index if not exists taf_erp_doc_mud on public.taf_erp_doc (obra, mud);

create table if not exists public.taf_erp_doc_hist (
  hid bigserial primary key,
  obra text not null, id text not null, tipo text not null, dados jsonb not null, mud bigint,
  atualizado_em timestamptz, atualizado_por text, papel text,
  trocado_em timestamptz not null default now()
);
create index if not exists taf_erp_doc_hist_doc on public.taf_erp_doc_hist (obra, id);

create table if not exists public.taf_erp_obra_hist (
  hid bigserial primary key,
  codigo text not null, estado jsonb not null, mud bigint, atualizado_em timestamptz, atualizado_por text,
  trocado_em timestamptz not null default now()
);

create table if not exists public.taf_erp_contador (
  obra text not null, tipo text not null, ultimo int not null default 0,
  primary key (obra, tipo)
);

-- Guarda a versão anterior e nunca deixa apagar.
create or replace function public._taf_erp_doc_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'NADA E APAGADO'; end if;
  if tg_op = 'UPDATE' then
    insert into public.taf_erp_doc_hist (obra, id, tipo, dados, mud, atualizado_em, atualizado_por, papel)
    values (old.obra, old.id, old.tipo, old.dados, old.mud, old.atualizado_em, old.atualizado_por, old.papel);
    new.mud := nextval('public.taf_erp_mud_seq'); new.atualizado_em := now();
    new.criado_em := old.criado_em; new.criado_por := old.criado_por;
  end if;
  return new;
end $$;
drop trigger if exists taf_erp_doc_trg on public.taf_erp_doc;
create trigger taf_erp_doc_trg before update or delete on public.taf_erp_doc for each row execute function public._taf_erp_doc_trg();

create or replace function public._taf_erp_obra_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'NADA E APAGADO'; end if;
  if new.estado is distinct from old.estado then
    insert into public.taf_erp_obra_hist (codigo, estado, mud, atualizado_em, atualizado_por)
    values (old.codigo, old.estado, old.mud, old.atualizado_em, old.atualizado_por);
  end if;
  new.mud := nextval('public.taf_erp_mud_seq'); new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists taf_erp_obra_trg on public.taf_erp_obra;
create trigger taf_erp_obra_trg before update or delete on public.taf_erp_obra for each row execute function public._taf_erp_obra_trg();

alter table public.taf_erp_obra enable row level security;
alter table public.taf_erp_doc enable row level security;
alter table public.taf_erp_doc_hist enable row level security;
alter table public.taf_erp_obra_hist enable row level security;
alter table public.taf_erp_contador enable row level security;
alter table public.taf_erp_item enable row level security;
revoke all on public.taf_erp_item, public.taf_erp_obra, public.taf_erp_doc, public.taf_erp_doc_hist, public.taf_erp_obra_hist, public.taf_erp_contador from anon, authenticated;
revoke all on sequence public.taf_erp_mud_seq from anon, authenticated;

-- Papéis do ERP (iguais aos do TAF Admin, sem 'pendente').
create or replace function public._taf_erp_papeis() returns text[] language sql immutable as $$
  select array['admin','gestao','diretoria','gerente','engenheiro','compras','almox','adm','financeiro','encarregado','planejamento'] $$;

-- Quem está chamando.
--  chave pessoal do ciclo (taf_ciclo_chave): papel fixo (gestor -> gestao, diretoria, engenheiro; leitura só lê), obras da chave;
--  chave do Marko (taf_pessoa_chave): engenheiro fixo, obra 342;
--  chave geral do site: nome e papel escolhidos na tela (como no modo aberto do TAF Admin), todas as obras.
create or replace function public._taf_erp_ator(p_chave text, p_quem text, p_papel text,
  out nome text, out papel text, out fixo boolean, out leitura boolean, out obras text[])
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_h text := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex');
        r record; v_p text;
begin
  if to_regclass('public.taf_ciclo_chave') is not null then
    execute 'select nome, pessoa, papel, obras from public.taf_ciclo_chave where hash = $1 and ativo' into r using v_h;
    if r.papel is not null then
      nome := coalesce(r.pessoa, r.nome); fixo := true; obras := r.obras;
      papel := case r.papel when 'gestor' then 'gestao' when 'leitura' then 'gestao' else r.papel end;
      leitura := r.papel = 'leitura'; return;
    end if;
  end if;
  if public._taf_ok(p_chave) then
    nome := nullif(left(trim(coalesce(p_quem, '')), 60), '');
    papel := case when p_papel = any(public._taf_erp_papeis()) and p_papel <> 'admin' then p_papel else 'gestao' end;
    fixo := false; leitura := false; obras := null; return;      -- null = todas
  end if;
  v_p := public._taf_pessoa(p_chave, null);                      -- levanta CHAVE INVALIDA
  nome := v_p; papel := 'engenheiro'; fixo := true; leitura := false; obras := array['342'];
end $$;

-- Matriz de quem grava cada tipo (porte de pode_escrever da migração 0014 do TAF Admin).
create or replace function public._taf_erp_pode(p_papel text, p_tipo text) returns boolean
language sql immutable as $$
  select p_papel = 'admin' or case p_tipo
    when 'sol'  then p_papel = any(array['engenheiro','gerente','compras','diretoria'])
    when 'oc'   then p_papel = any(array['compras','gerente','diretoria','almox','engenheiro'])
    when 'nf'   then p_papel = any(array['adm','engenheiro','financeiro'])
    when 'tit'  then true
    when 'med'  then p_papel = any(array['engenheiro','gerente','diretoria'])
    when 'conc' then p_papel = any(array['financeiro'])
    when 'apt'  then p_papel = any(array['encarregado','engenheiro','gerente'])
    when 'rst'  then p_papel = any(array['engenheiro','gerente','planejamento','encarregado','compras','diretoria'])
    when 'atv'  then p_papel = any(array['engenheiro','gerente','planejamento','encarregado'])
    when 'tar'  then p_papel = any(array['engenheiro','gerente','planejamento','encarregado','compras','adm','almox','financeiro','diretoria'])
    when 'bc'   then p_papel = any(array['gerente','engenheiro','diretoria','financeiro','adm'])
    when 'fat'  then p_papel = any(array['financeiro','adm','gerente','diretoria'])
    when 'rec'  then p_papel = any(array['financeiro','adm','diretoria'])
    when 'lan'  then p_papel = any(array['financeiro','diretoria'])
    when 'fech' then p_papel = any(array['financeiro','adm','diretoria'])
    when 'forn' then p_papel = any(array['compras','adm','financeiro','gerente','diretoria','gestao','almox'])
    when 'ins'  then p_papel = any(array['compras','adm','financeiro','gerente','diretoria','gestao','almox'])
    when 'banc' then p_papel = any(array['financeiro','adm','diretoria','gestao'])
    when 'lfx'  then p_papel = any(array['financeiro','adm','diretoria','gestao'])
    when 'mov'  then p_papel = any(array['financeiro','adm','diretoria','gestao'])
    when 'ctb'  then p_papel = any(array['financeiro','adm','diretoria','gestao'])
    when 'est'  then p_papel = any(array['almox','adm','engenheiro','compras','financeiro','diretoria','gestao'])
    when 'inv'  then p_papel = any(array['almox','adm','diretoria','gestao'])
    when 'ctr'  then p_papel = any(array['gerente','diretoria','adm','financeiro','engenheiro','gestao'])
    when 'prj'  then p_papel = any(array['engenheiro','gerente','planejamento','diretoria','gestao'])
    when 'pat'  then p_papel = any(array['adm','financeiro','diretoria','gestao'])
    when 'frt'  then p_papel = any(array['almox','adm','engenheiro','encarregado','gerente','diretoria','gestao'])
    when 'fmv'  then p_papel = any(array['almox','adm','engenheiro','encarregado','gerente','diretoria','gestao'])
    when 'col'  then p_papel = any(array['adm','gerente','engenheiro','diretoria','gestao'])
    when 'pto'  then p_papel = any(array['encarregado','engenheiro','gerente','adm','diretoria','gestao'])
    when 'sst'  then p_papel = any(array['adm','engenheiro','gerente','diretoria','gestao'])
    when 'cobr' then p_papel = any(array['financeiro','adm','diretoria','gestao'])
    when 'aud'  then true
    when 'elo'  then p_papel = any(array['engenheiro','gerente','planejamento','compras','diretoria','gestao'])
    else false end $$;

create or replace function public._taf_erp_obra_ok(p_ator_obras text[], p_obra text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.taf_erp_obra where codigo = p_obra) then raise exception 'OBRA INVALIDA'; end if;
  if p_ator_obras is not null and not (p_obra = any(p_ator_obras)) then raise exception 'SEM ACESSO A OBRA'; end if;
end $$;

create or replace function public._taf_erp_versao(p_obra text) returns bigint
language sql stable security definer set search_path = public as $$
  select greatest(
    coalesce((select max(mud) from public.taf_erp_doc where obra in (p_obra, '*')), 0),
    coalesce((select mud from public.taf_erp_obra where codigo = p_obra), 0)) $$;

-- Entrada: quem é, que papel e quais obras.
create or replace function public.taf_erp_entrar(p_chave text, p_quem text default null, p_papel text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, p_papel);
  return jsonb_build_object('quem', a.nome, 'papel', a.papel, 'fixo', a.fixo, 'leitura', a.leitura,
    'obras', coalesce((select jsonb_agg(jsonb_build_object('codigo', o.codigo, 'nome', o.nome, 'contratante', o.contratante) order by o.ordem, o.codigo)
                         from public.taf_erp_obra o where a.obras is null or o.codigo = any(a.obras)), '[]'::jsonb));
end $$;

-- Leitura da obra: base (só se mudou), estado e os documentos (da obra e os cadastros '*'); p_desde = só o que mudou depois dessa versão.
create or replace function public.taf_erp_ler(p_chave text, p_obra text, p_quem text default null, p_base_sha text default null,
                                              p_desde bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; o public.taf_erp_obra;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  select * into o from public.taf_erp_obra where codigo = p_obra;
  return jsonb_build_object(
    'obra', jsonb_build_object('codigo', o.codigo, 'nome', o.nome, 'contratante', o.contratante),
    'base_sha', o.base_sha,
    'base_gz', case when p_base_sha is not distinct from o.base_sha then null else o.base_gz end,
    'estado', o.estado,
    'docs', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'dados', d.dados) order by d.mud)
                        from public.taf_erp_doc d where (d.obra = p_obra or d.obra = '*') and (p_desde is null or d.mud > p_desde)), '[]'::jsonb),
    'parcial', p_desde is not null,
    'versao', public._taf_erp_versao(p_obra));
end $$;

-- Só os dados fixos de uma obra (para o painel da carteira, que soma as obras).
create or replace function public.taf_erp_base(p_chave text, p_obra text, p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  return (select jsonb_build_object('codigo', codigo, 'base_gz', base_gz, 'base_sha', base_sha) from public.taf_erp_obra where codigo = p_obra);
end $$;

create or replace function public.taf_erp_versao(p_chave text, p_obra text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._taf_erp_ator(p_chave, null, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  return public._taf_erp_versao(p_obra);
end $$;

-- Gravação: lista de documentos [{id,tipo,dados}] e, se mudou, o estado da obra.
-- Recusa o que o papel não grava e o que cai em competência fechada; auditoria só entra, nunca muda.
create or replace function public.taf_erp_salvar(p_chave text, p_obra text, p_quem text, p_papel text,
                                                 p_docs jsonb default '[]'::jsonb, p_estado jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; d jsonb; v_id text; v_tipo text; v_dados jsonb; v_obra text; v_old public.taf_erp_doc;
        v_ok int := 0; v_igual int := 0; v_rec jsonb := '[]'::jsonb; v_est text := null; c text; dt text;
        v_global constant text[] := array['forn','ins','banc'];
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
      v_rec := v_rec || jsonb_build_object('id', v_id, 'motivo', 'PAPEL ' || upper(a.papel) || ' NAO GRAVA ' || upper(v_tipo)); continue; end if;
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

-- Numeração (porte de reservar_numeros da migração 0009): devolve o primeiro de p_qtd números reservados.
create or replace function public.taf_erp_numeros(p_chave text, p_obra text, p_tipo text, p_qtd int default 20, p_quem text default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare a record; v int; t text;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if p_qtd is null or p_qtd < 1 or p_qtd > 100 then raise exception 'QUANTIDADE INVALIDA'; end if;
  if p_tipo not in ('sol','oc','nf','bm','apt','rst','tar','bc','fat') then raise exception 'TIPO INVALIDO'; end if;
  t := case p_tipo when 'bm' then 'med' else p_tipo end;
  if not exists (select 1 from public.taf_erp_contador where obra = p_obra and tipo = p_tipo) then
    select coalesce(max((regexp_replace(dados->>'num', '\D', '', 'g'))::bigint), 0)::int into v
      from public.taf_erp_doc where obra = p_obra and tipo = t and (dados->>'num') ~ '\d';
    insert into public.taf_erp_contador (obra, tipo, ultimo) values (p_obra, p_tipo, v) on conflict do nothing;
  end if;
  update public.taf_erp_contador set ultimo = ultimo + p_qtd where obra = p_obra and tipo = p_tipo returning ultimo - p_qtd + 1 into v;
  return v;
end $$;

-- Só as funções públicas abaixo ficam chamáveis pela API; as internas (_taf_erp_*) não.
revoke all on function public._taf_erp_doc_trg(), public._taf_erp_obra_trg(), public._taf_erp_papeis(),
  public._taf_erp_ator(text, text, text), public._taf_erp_pode(text, text), public._taf_erp_obra_ok(text[], text),
  public._taf_erp_versao(text) from public, anon, authenticated;
revoke all on function public.taf_erp_entrar(text, text, text), public.taf_erp_ler(text, text, text, text, bigint), public.taf_erp_base(text, text, text),
  public.taf_erp_versao(text, text), public.taf_erp_salvar(text, text, text, text, jsonb, jsonb),
  public.taf_erp_numeros(text, text, text, int, text) from public;
grant execute on function public.taf_erp_entrar(text, text, text), public.taf_erp_ler(text, text, text, text, bigint), public.taf_erp_base(text, text, text),
  public.taf_erp_versao(text, text), public.taf_erp_salvar(text, text, text, text, jsonb, jsonb),
  public.taf_erp_numeros(text, text, text, int, text) to anon, authenticated;
