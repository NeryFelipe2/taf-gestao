-- 04 (obra nova pela tela): a Gestão ou a Diretoria cria a obra no ERP e grava o orçamento dela pelo próprio ERP,
-- sem programa de fora (o antigo carga.py) e sem SQL na mão.
-- RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar (04_teste_obra_nova.sql).
--
-- O que este arquivo cria (nada do 01_erp.sql, do 02_rastro.sql nem do 03 é redefinido):
--   tabela   taf_erp_base_hist          histórico de cada obra criada e de cada base gravada, com a versão ANTERIOR
--                                       (base_gz, base_sha e as linhas de taf_erp_item), para poder voltar;
--   entrada  taf_erp_obra_criar(...)    cria a obra no ERP: código de 3 números, nome e contratante;
--   entrada  taf_erp_base_gravar(...)   grava a base da obra (base_gz em gzip+base64, base_sha) e as linhas de taf_erp_item;
--   interna  _taf_erp_gestor(...)       quem chama e se pode (só Gestão ou Diretoria);
--   interna  _taf_erp_base_voltar(...)  volta a base de uma obra para uma versão guardada no histórico (só por SQL).
--
-- Quem pode (as duas entradas):
--   chave pessoal (taf_ciclo_chave) de gestor ou de diretoria; chave de leitura nunca grava;
--   chave geral do site só com o papel Gestão ou Diretoria escolhido na tela e com o nome informado
--     (como o taf_ciclo_importar aceita a chave geral como gestor): o nome digitado fica registrado;
--   engenheiro (chave pessoal ou chave do Marko) não cria obra nem grava base.
--   Se a chave pessoal tem lista de obras, a obra nova entra na lista dela (senão ela não abriria a própria obra).
--
-- O que é recusado:
--   código que não tem 3 números, ou que já existe no ERP; nome ou contratante vazio, longo demais ou com < >;
--   base vazia, que não é gzip em base64, com base_sha que não confere (sha256 do texto base64) ou grande demais
--     (mais de 3.000.000 de caracteres); planilha sem item ou com mais de 5.000 itens;
--   item com código repetido, vazio ou com caractere fora de [0-9 A-Z a-z . _ / -]; unidade com < > & " ';
--     pacote ou evento com caractere fora do mesmo conjunto; número que não é número;
--   regravar a base de obra que já tem compra ou nota (solicitação, pedido, nota, medição ou boletim lançado)
--     ou com a linha de base congelada: aí o caminho é o "Atualizar pela planilha" do ERP.
-- Base igual à que já está gravada (mesmo base_sha) não grava nada e responde igual = true.
--
-- O formato da base é o que o ERP já lê (03b_chave.js, chBaseDe e chUsaBase): {D, extrato?, ficha?, listas?}, em JSON,
-- comprimido em gzip e escrito em base64. O banco não abre a base: confere só o começo do gzip, o tamanho e o sha.
-- As linhas de taf_erp_item são o índice que o banco usa para ligar compra e BM ao evento (02_rastro.sql).
--
-- Antes de aplicar: backup (PASSO A de 99_reverter.sql). Fora do horário de uso.
-- Como desfazer: ver o fim do arquivo.

-- ===================================================================== histórico
create table if not exists public.taf_erp_base_hist (
  hid bigserial primary key,
  codigo text not null,
  acao text not null check (acao in ('criar', 'base', 'voltar')),
  base_gz text,               -- base ANTERIOR (null quando a obra ainda não tinha base)
  base_sha text,              -- sha da base anterior
  itens jsonb,                -- linhas de taf_erp_item ANTERIORES
  sha_novo text,              -- sha que entrou
  n_itens int,                -- quantos itens entraram
  quem text, papel text, verificado boolean,   -- verificado = chave pessoal (nome fixo); false = chave geral (nome digitado)
  detalhe jsonb,
  em timestamptz not null default now()
);
create index if not exists taf_erp_base_hist_obra on public.taf_erp_base_hist (codigo, hid);
alter table public.taf_erp_base_hist enable row level security;
revoke all on public.taf_erp_base_hist from public, anon, authenticated;
revoke all on sequence public.taf_erp_base_hist_hid_seq from public, anon, authenticated;

-- ===================================================================== quem chama
-- Usa o _taf_erp_ator do 01_erp.sql (não muda) e só deixa passar Gestão ou Diretoria.
create or replace function public._taf_erp_gestor(p_chave text, p_quem text, p_papel text,
  out nome text, out papel text, out fixo boolean, out obras text[], out hash text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare a record;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, p_papel);     -- levanta CHAVE INVALIDA
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  -- chave pessoal: o papel é o da chave; chave geral: o papel tem que ter sido escolhido na tela (nunca o padrão)
  if (a.fixo and a.papel not in ('gestao', 'diretoria'))
     or (not a.fixo and coalesce(p_papel, '') not in ('gestao', 'diretoria')) then
    raise exception 'SEM PERMISSAO: SO GESTAO OU DIRETORIA CRIA OBRA E GRAVA O ORCAMENTO';
  end if;
  if a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  nome := a.nome; papel := a.papel; fixo := a.fixo; obras := a.obras;
  hash := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex');
end $$;

-- ===================================================================== (a) criar a obra
create or replace function public.taf_erp_obra_criar(p_chave text, p_codigo text, p_nome text, p_contratante text,
                                                     p_quem text default null, p_papel text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a record; v_cod text := trim(coalesce(p_codigo, '')); v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
        v_ct text := regexp_replace(trim(coalesce(p_contratante, '')), '\s+', ' ', 'g'); v_ord int; v_lista text[]; v_hid bigint;
begin
  select * into a from public._taf_erp_gestor(p_chave, p_quem, p_papel);
  if v_cod !~ '^[0-9]{3}$' then raise exception 'CODIGO DA OBRA INVALIDO: USE 3 NUMEROS (EX.: 344)'; end if;
  if length(v_nome) < 3 or length(v_nome) > 120 then raise exception 'NOME DA OBRA: DE 3 A 120 LETRAS'; end if;
  if length(v_ct) < 2 or length(v_ct) > 80 then raise exception 'CONTRATANTE: DE 2 A 80 LETRAS'; end if;
  if v_nome ~ '[<>[:cntrl:]]' or v_ct ~ '[<>[:cntrl:]]' then raise exception 'NOME OU CONTRATANTE COM CARACTERE NAO ACEITO (< OU >)'; end if;

  perform pg_advisory_xact_lock(hashtext('taf_erp_obra_criar'));          -- duas criações ao mesmo tempo: a segunda encontra a obra
  if exists (select 1 from public.taf_erp_obra where codigo = v_cod) then raise exception 'OBRA % JA EXISTE NO ERP', v_cod; end if;
  select coalesce(max(ordem), 0) + 1 into v_ord from public.taf_erp_obra;  -- obra nova vai para o fim da lista
  insert into public.taf_erp_obra (codigo, nome, contratante, ordem, atualizado_por) values (v_cod, v_nome, v_ct, v_ord, a.nome);

  -- chave pessoal com lista de obras: a obra nova entra na lista (a chave geral já vê todas)
  if a.fixo and a.obras is not null and to_regclass('public.taf_ciclo_chave') is not null then
    update public.taf_ciclo_chave c set obras = c.obras || v_cod
     where c.hash = a.hash and c.ativo and not (v_cod = any(c.obras))
    returning c.obras into v_lista;
    v_lista := coalesce(v_lista, a.obras);
  end if;

  insert into public.taf_erp_base_hist (codigo, acao, quem, papel, verificado, detalhe)
  values (v_cod, 'criar', a.nome, a.papel, a.fixo,
          jsonb_build_object('nome', v_nome, 'contratante', v_ct, 'chave', case when a.fixo then 'pessoal' else 'geral' end))
  returning hid into v_hid;

  return jsonb_build_object('ok', true, 'obra', jsonb_build_object('codigo', v_cod, 'nome', v_nome, 'contratante', v_ct),
                            'quem', a.nome, 'papel', a.papel, 'chave', case when a.fixo then 'pessoal' else 'geral' end,
                            'obras_da_chave', to_jsonb(v_lista), 'hid', v_hid);
end $$;

-- ===================================================================== (b) gravar a base da obra
-- p_itens = [{codigo, descricao, unidade, qtd, pacote, evento, venda, meta, teto, meta_unit}], um por item (grupo não entra).
create or replace function public.taf_erp_base_gravar(p_chave text, p_obra text, p_base_gz text, p_base_sha text, p_itens jsonb,
                                                      p_quem text default null, p_papel text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a record; o public.taf_erp_obra; v_n int; v_x jsonb; v_k text; v_err text[] := '{}'; v_vistos text[] := '{}';
        v_ant jsonb; v_docs int; v_hid bigint; v_cod text;
        v_num constant text[] := array['qtd', 'venda', 'meta', 'teto', 'meta_unit'];
        v_txt constant text[] := array['codigo', 'descricao', 'unidade', 'pacote', 'evento'];
        v_lim constant int := 3000000;
begin
  select * into a from public._taf_erp_gestor(p_chave, p_quem, p_papel);
  perform public._taf_erp_obra_ok(a.obras, p_obra);                          -- OBRA INVALIDA / SEM ACESSO A OBRA

  -- a base: gzip ("H4sI" é o começo do gzip em base64), base64 bem formado, tamanho e sha
  if coalesce(length(p_base_gz), 0) < 20 then raise exception 'BASE VAZIA'; end if;
  if length(p_base_gz) > v_lim then raise exception 'BASE GRANDE DEMAIS (% CARACTERES; O LIMITE E %)', length(p_base_gz), v_lim; end if;
  if p_base_gz !~ '^H4sI[A-Za-z0-9+/]*={0,2}$' or length(p_base_gz) % 4 <> 0 then raise exception 'BASE INVALIDA: ESPERADO GZIP EM BASE64'; end if;
  if coalesce(p_base_sha, '') !~ '^[0-9a-f]{64}$' or p_base_sha <> encode(extensions.digest(p_base_gz, 'sha256'), 'hex') then
    raise exception 'BASE_SHA NAO CONFERE COM A BASE ENVIADA'; end if;

  -- os itens
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then raise exception 'ITENS INVALIDOS'; end if;
  v_n := jsonb_array_length(p_itens);
  if v_n < 1 or v_n > 5000 then raise exception 'PLANILHA VAZIA OU GRANDE DEMAIS (% ITENS; O LIMITE E 5000)', v_n; end if;
  for v_x in select jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_x) <> 'object' then v_err := v_err || 'linha que não é item'::text; continue; end if;
    v_cod := v_x ->> 'codigo';
    foreach v_k in array v_txt loop
      if v_x ? v_k and jsonb_typeof(v_x -> v_k) not in ('string', 'null') then v_err := v_err || format('%s: %s não é texto', coalesce(v_cod, '?'), v_k); end if;
    end loop;
    foreach v_k in array v_num loop
      if v_x ? v_k and jsonb_typeof(v_x -> v_k) not in ('number', 'null') then v_err := v_err || format('%s: %s não é número', coalesce(v_cod, '?'), v_k); end if;
    end loop;
    if coalesce(v_cod, '') !~ '^[0-9A-Za-z][0-9A-Za-z._/-]{0,39}$' then v_err := v_err || format('código de item inválido: %s', coalesce(v_cod, '(vazio)'));
    elsif v_cod = any(v_vistos) then v_err := v_err || format('código repetido: %s', v_cod);
    else v_vistos := v_vistos || v_cod; end if;
    if length(coalesce(v_x ->> 'descricao', '')) > 2000 then v_err := v_err || format('%s: descrição longa demais', v_cod); end if;
    if coalesce(v_x ->> 'unidade', '') ~ '[<>&"''[:cntrl:]]' or length(coalesce(v_x ->> 'unidade', '')) > 20 then
      v_err := v_err || format('%s: unidade inválida', v_cod); end if;
    if coalesce(v_x ->> 'pacote', '') <> '' and (v_x ->> 'pacote') !~ '^[0-9A-Za-z][0-9A-Za-z._/-]{0,29}$' then
      v_err := v_err || format('%s: pacote inválido (%s)', v_cod, v_x ->> 'pacote'); end if;
    if coalesce(v_x ->> 'evento', '') <> '' and (v_x ->> 'evento') !~ '^[0-9A-Za-z][0-9A-Za-z._/-]{0,19}$' then
      v_err := v_err || format('%s: evento inválido (%s)', v_cod, v_x ->> 'evento'); end if;
  end loop;
  if cardinality(v_err) > 0 then
    raise exception 'ORCAMENTO RECUSADO (% PROBLEMA(S)): %', cardinality(v_err), array_to_string(v_err[1:30], '; ');
  end if;

  -- uma gravação por vez na obra, e nenhuma compra ou nota no meio (mesma trava do taf_erp_salvar)
  perform pg_advisory_xact_lock(hashtext('taf_erp_' || p_obra));
  select * into o from public.taf_erp_obra where codigo = p_obra for update;
  if o.base_sha is not distinct from p_base_sha then
    return jsonb_build_object('ok', true, 'igual', true, 'obra', p_obra, 'base_sha', p_base_sha,
                              'itens', (select count(*) from public.taf_erp_item i where i.obra = p_obra), 'versao', public._taf_erp_versao(p_obra));
  end if;
  select count(*) into v_docs from public.taf_erp_doc d where d.obra = p_obra and d.tipo in ('sol', 'oc', 'nf', 'med', 'bc');
  if v_docs > 0 then
    raise exception 'OBRA % JA TEM COMPRA OU NOTA LANCADA (% DOCUMENTO(S)): O ORCAMENTO NAO SE REGRAVA. USE ATUALIZAR PELA PLANILHA', p_obra, v_docs; end if;
  if coalesce(o.estado ->> 'frozen', 'false') = 'true' then
    raise exception 'LINHA DE BASE DA OBRA % JA CONGELADA: O ORCAMENTO NAO SE REGRAVA. USE ATUALIZAR PELA PLANILHA', p_obra; end if;

  -- guarda a versão anterior (base e itens) antes de trocar
  select jsonb_agg(to_jsonb(i) - 'obra' order by i.codigo) into v_ant from public.taf_erp_item i where i.obra = p_obra;
  insert into public.taf_erp_base_hist (codigo, acao, base_gz, base_sha, itens, sha_novo, n_itens, quem, papel, verificado, detalhe)
  values (p_obra, 'base', o.base_gz, o.base_sha, v_ant, p_base_sha, v_n, a.nome, a.papel, a.fixo,
          jsonb_build_object('itens_antes', coalesce(jsonb_array_length(v_ant), 0), 'chave', case when a.fixo then 'pessoal' else 'geral' end))
  returning hid into v_hid;

  update public.taf_erp_obra set base_gz = p_base_gz, base_sha = p_base_sha, atualizado_por = a.nome where codigo = p_obra;
  delete from public.taf_erp_item where obra = p_obra;
  insert into public.taf_erp_item (obra, codigo, descricao, unidade, qtd, pacote, evento, venda, meta, teto, meta_unit)
  select p_obra, e ->> 'codigo', nullif(e ->> 'descricao', ''), nullif(e ->> 'unidade', ''), (e ->> 'qtd')::numeric,
         nullif(e ->> 'pacote', ''), nullif(e ->> 'evento', ''), (e ->> 'venda')::numeric, (e ->> 'meta')::numeric,
         (e ->> 'teto')::numeric, (e ->> 'meta_unit')::numeric
    from jsonb_array_elements(p_itens) e;

  return jsonb_build_object('ok', true, 'igual', false, 'obra', p_obra, 'base_sha', p_base_sha, 'itens', v_n, 'anterior', o.base_sha,
                            'hid', v_hid, 'versao', public._taf_erp_versao(p_obra), 'quem', a.nome, 'papel', a.papel);
end $$;

-- ===================================================================== voltar a base (só por SQL, com o sim do Felipe)
-- Uso: select public._taf_erp_base_voltar('998', <hid>, 'Felipe');   hid = linha do taf_erp_base_hist com a versão a recuperar
--      (a coluna base_gz de cada linha é a base que estava ANTES daquela gravação).
-- Mesmas travas da gravação: não volta obra com compra ou nota, nem com linha de base congelada. A versão de agora vai para o histórico.
create or replace function public._taf_erp_base_voltar(p_obra text, p_hid bigint, p_quem text default 'SQL')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare h public.taf_erp_base_hist; o public.taf_erp_obra; v_ant jsonb; v_docs int; v_hid bigint;
begin
  select * into h from public.taf_erp_base_hist x where x.hid = p_hid and x.codigo = p_obra;
  if h.hid is null then raise exception 'VERSAO % NAO EXISTE NO HISTORICO DA OBRA %', p_hid, p_obra; end if;
  if h.base_gz is null then raise exception 'A LINHA % NAO GUARDA BASE ANTERIOR (A OBRA AINDA NAO TINHA BASE)', p_hid; end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_' || p_obra));
  select * into o from public.taf_erp_obra where codigo = p_obra for update;
  select count(*) into v_docs from public.taf_erp_doc d where d.obra = p_obra and d.tipo in ('sol', 'oc', 'nf', 'med', 'bc');
  if v_docs > 0 then raise exception 'OBRA % JA TEM COMPRA OU NOTA LANCADA: NAO VOLTA A BASE', p_obra; end if;
  if coalesce(o.estado ->> 'frozen', 'false') = 'true' then raise exception 'LINHA DE BASE DA OBRA % JA CONGELADA: NAO VOLTA A BASE', p_obra; end if;
  select jsonb_agg(to_jsonb(i) - 'obra' order by i.codigo) into v_ant from public.taf_erp_item i where i.obra = p_obra;
  insert into public.taf_erp_base_hist (codigo, acao, base_gz, base_sha, itens, sha_novo, n_itens, quem, papel, verificado, detalhe)
  values (p_obra, 'voltar', o.base_gz, o.base_sha, v_ant, h.base_sha, coalesce(jsonb_array_length(h.itens), 0), left(coalesce(p_quem, 'SQL'), 60), 'sql', true,
          jsonb_build_object('volta_para_hid', p_hid))
  returning hid into v_hid;
  update public.taf_erp_obra set base_gz = h.base_gz, base_sha = h.base_sha, atualizado_por = left(coalesce(p_quem, 'SQL'), 60) where codigo = p_obra;
  delete from public.taf_erp_item where obra = p_obra;
  insert into public.taf_erp_item (obra, codigo, descricao, unidade, qtd, pacote, evento, venda, meta, teto, meta_unit)
  select p_obra, r.codigo, r.descricao, r.unidade, r.qtd, r.pacote, r.evento, r.venda, r.meta, r.teto, r.meta_unit
    from jsonb_populate_recordset(null::public.taf_erp_item, coalesce(h.itens, '[]'::jsonb)) r;
  return jsonb_build_object('ok', true, 'obra', p_obra, 'base_sha', h.base_sha, 'itens', coalesce(jsonb_array_length(h.itens), 0), 'hid', v_hid);
end $$;

-- ===================================================================== permissões
-- Só as duas entradas ficam chamáveis pela API; as internas e a tabela não (o Supabase dá execute por padrão).
revoke all on function public._taf_erp_gestor(text, text, text), public._taf_erp_base_voltar(text, bigint, text) from public, anon, authenticated;
revoke all on function public.taf_erp_obra_criar(text, text, text, text, text, text),
  public.taf_erp_base_gravar(text, text, text, text, jsonb, text, text) from public;
grant execute on function public.taf_erp_obra_criar(text, text, text, text, text, text),
  public.taf_erp_base_gravar(text, text, text, text, jsonb, text, text) to anon, authenticated;

-- ===================================================================== como desfazer
-- 1. Cópia do histórico (fora do repositório público: tem a base das obras):
--      select jsonb_agg(to_jsonb(h) order by h.hid) from public.taf_erp_base_hist h;
-- 2. Tirar as funções e a tabela (as obras criadas e as bases gravadas continuam em taf_erp_obra e taf_erp_item):
--      drop function if exists public.taf_erp_obra_criar(text, text, text, text, text, text);
--      drop function if exists public.taf_erp_base_gravar(text, text, text, text, jsonb, text, text);
--      drop function if exists public._taf_erp_base_voltar(text, bigint, text);
--      drop function if exists public._taf_erp_gestor(text, text, text);
--      drop table if exists public.taf_erp_base_hist;
-- 3. Tirar uma obra criada por engano (só se não tem documento nenhum; o 01_erp.sql não deixa apagar obra, por isso o gatilho sai e volta):
--      alter table public.taf_erp_obra disable trigger taf_erp_obra_trg;
--      delete from public.taf_erp_item where obra = '<código>';
--      delete from public.taf_erp_obra where codigo = '<código>' and not exists (select 1 from public.taf_erp_doc d where d.obra = '<código>');
--      alter table public.taf_erp_obra enable trigger taf_erp_obra_trg;
--      update public.taf_ciclo_chave set obras = array_remove(obras, '<código>') where '<código>' = any(obras);
-- O 99_reverter.sql (ERP inteiro) apaga as funções taf_erp_* deste arquivo, mas não a tabela taf_erp_base_hist: tirar com o passo 2.
