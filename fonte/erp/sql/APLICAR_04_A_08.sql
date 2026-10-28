-- APLICAR DE UMA VEZ: 04 (obra nova), 05 (meta), 06 (acessos), 07 (IA) e 08 (resumo) no banco da TAF.
-- O 03 (nota sem pedido) e o backup (esquema taf_backup_20261028) JÁ foram feitos em 28/10/2026.
-- Como rodar: Supabase > projeto construdata-platform > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Tudo entra junto ou nada entra (begin/commit). Se der erro, nada muda: copie a mensagem e mande para o Claude.
-- No fim desativa as 3 chaves de TESTE da obra 999 (fictícia), para a tela Acessos deixar criar a primeira Diretoria de verdade.
-- Não mexe em nenhuma tabela da WCR nem nas tarefas do site.
begin;

-- ======================================================== 04_obra_nova.sql
-- 04 (obra nova pela tela): a Gestão ou a Diretoria cria a obra no ERP e grava o orçamento dela pelo próprio ERP,
-- sem programa de fora (o antigo carga.py) e sem SQL na mão.
-- RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar (04_teste_obra_nova.sql).
-- Só aplicar junto com o ERP que abre a base marcada "tela:" pela lista fechada de campos (53_obra_nova.js, obnLimpaBase,
-- chamada em 03b_chave.js chBaseDe). Com o ERP antigo no ar, a base gravada por aqui abriria sem a limpeza.
--
-- O que este arquivo cria (nada do 01_erp.sql, do 02_rastro.sql nem do 03 é redefinido):
--   tabela   taf_erp_base_hist          histórico de cada obra criada e de cada base gravada, com a versão ANTERIOR
--                                       (base_gz, base_sha e as linhas de taf_erp_item), para poder voltar;
--   entrada  taf_erp_obra_criar(...)    cria a obra no ERP: código de 3 números, nome e contratante;
--   entrada  taf_erp_base_gravar(...)   grava a base da obra (base_gz em gzip+base64) e as linhas de taf_erp_item;
--   interna  _taf_erp_gestor(...)       quem chama e se pode (só Gestão ou Diretoria);
--   interna  _taf_erp_base_voltar(...)  volta a base de uma obra para uma versão guardada no histórico (só por SQL);
--   interna  _taf_erp_base_trava_meta   recusa mudar o orçamento de obra com proposta de meta pendente ou aprovada (05).
--
-- Quem pode (as duas entradas):
--   chave pessoal (taf_ciclo_chave) de gestor ou de diretoria; chave de leitura nunca grava;
--   chave geral do site só com o papel Gestão ou Diretoria mandado pela tela e com o nome informado
--     (como o taf_ciclo_importar aceita a chave geral como gestor): o nome digitado fica registrado.
--     O banco não sabe se a pessoa escolheu o papel ou se veio o padrão: quem pede a escolha é a tela (53_obra_nova.js,
--     passo 1, campo "Seu papel" sem nada marcado). Por isso a chave geral tem menos alcance (abaixo).
--   engenheiro (chave pessoal ou chave do Marko) não cria obra nem grava base.
--   Se a chave pessoal tem lista de obras, a obra nova entra na lista dela (senão ela não abriria a própria obra).
--   [integração] A obra nova entra também nas chaves de Diretoria "com todas as obras" (as que têm todas as obras que alguma
--     Diretoria ativa tem, a mesma regra do 06), contadas antes de criar. Assim a obra criada pelo gestor, pela Diretoria limitada
--     (sócio de consórcio) ou pela chave geral não tira de ninguém o "todas as obras" (Acessos do 06 e Resumo do 08).
--     [SUPOSIÇÃO: falta o ok do Felipe, ver o LEIA-ME-06.]
--   [integração] Obra que já existe no PLANEJADOR (taf_ciclo_obra, por exemplo importada antes de ter ERP) só ganha o ERP com
--     chave pessoal que já cuida dela: a chave tem esse código, ou é Diretoria com todas as obras. A chave geral não cria o ERP
--     dela, e quem não tem a obra não passa a ter (antes, "criar" o ERP punha a obra do planejador na chave de quem pedia).
--
-- Quando o orçamento (a base) pode ser gravado:
--   só em obra criada por taf_erp_obra_criar (tem a linha 'criar' em taf_erp_base_hist). Obra antiga, carregada pelo carga.py,
--     nunca é regravada por aqui: o caminho dela é o "Atualizar pela planilha" do ERP;
--   só em obra sem NENHUM documento lançado (de qualquer tipo: solicitação, pedido, nota, medição, boletim, tarefa ligada,
--     apontamento, contrato, título...), sem linha de base congelada e sem meta ou ajuste no estado (metaOv, baseOv, basePac);
--   [integração] só em obra sem proposta de meta pendente ou aprovada (taf_erp_meta_prop, do 05): a proposta fica presa ao
--     código do item, e o item novo com o mesmo código receberia a meta pensada para o antigo;
--   chave geral: só a PRIMEIRA gravação, e só na obra que a própria chave geral criou. Regravar, ou gravar o orçamento de obra
--     criada por chave pessoal, só com chave pessoal de gestor ou diretoria.
--
-- O que é recusado:
--   código que não tem 3 números, ou que já existe no ERP; código que já existe no planejador, para quem não cuida dele (acima);
--   nome ou contratante vazio, longo demais, com < > ou aspas;
--   base vazia, que não é gzip em base64, com base_sha que não confere (sha256 do texto base64) ou grande demais
--     (mais de 3.000.000 de caracteres); planilha sem item ou com mais de 5.000 itens;
--   item com código repetido, vazio ou com caractere fora de [0-9 A-Z a-z . _ / -]; descrição com < > ou aspas;
--     unidade com < > & " '; pacote ou evento com caractere fora do mesmo conjunto; número que não é número;
--   e as gravações fora das regras de "quando" acima.
-- Base igual à que já está gravada (mesmo base_sha) não grava nada e responde igual = true.
--
-- O formato da base é o que o ERP já lê (03b_chave.js, chBaseDe e chUsaBase): {D, origem}, em JSON,
-- comprimido em gzip e escrito em base64. O banco não abre a base (o Postgres não lê gzip): confere só o começo do gzip,
-- o tamanho e o sha. Por isso o banco grava base_sha = 'tela:' || sha256 do texto base64 (a marca "tela:" quem põe é o banco,
-- ninguém de fora consegue tirar) e o ERP, ao ver a marca, refaz a base pela lista fechada de campos (obnLimpaBase):
-- só os campos que a tela grava, código, unidade, pacote, evento e natureza só com os caracteres aceitos aqui, texto sem < > e
-- aspas, número só número; extrato, ficha e listas não entram. A base sem a marca (carga.py) abre como sempre.
-- As linhas de taf_erp_item são o índice que o banco usa para ligar compra e BM ao evento (02_rastro.sql).
--
-- Antes de aplicar: backup (PASSO A de 99_reverter.sql e PASSO A de fonte/ciclo/sql/99_reverter.sql, que tem taf_ciclo_chave,
--   salvos em arquivo fora do repositório). Fora do horário de uso.
-- Depois de aplicado e usado: o PASSO A do 99_reverter.sql NÃO guarda a base nem os itens (conta que voltam do carga.py).
--   A obra criada pela tela não tem carga.py: antes de rodar o 99_reverter, rodar também a cópia do fim deste arquivo.
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
  -- chave pessoal: o papel é o da chave; chave geral: o papel mandado pela tela tem que ser Gestão ou Diretoria
  -- (sem papel mandado, o _taf_erp_ator daria 'gestao': aqui isso não basta)
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
        v_cob text[] := '{}'; v_dir_todas boolean := false; v_ndir int := 0; v_plan boolean := false;
begin
  select * into a from public._taf_erp_gestor(p_chave, p_quem, p_papel);
  if v_cod !~ '^[0-9]{3}$' then raise exception 'CODIGO DA OBRA INVALIDO: USE 3 NUMEROS (EX.: 344)'; end if;
  if length(v_nome) < 3 or length(v_nome) > 120 then raise exception 'NOME DA OBRA: DE 3 A 120 LETRAS'; end if;
  if length(v_ct) < 2 or length(v_ct) > 80 then raise exception 'CONTRATANTE: DE 2 A 80 LETRAS'; end if;
  -- [revisão] aspas também: o nome e o contratante vão para a lista de obras de todas as telas
  if v_nome ~ '[<>"[:cntrl:]]' or v_ct ~ '[<>"[:cntrl:]]' then raise exception 'NOME OU CONTRATANTE COM CARACTERE NAO ACEITO (< > OU ASPAS)'; end if;

  perform pg_advisory_xact_lock(hashtext('taf_erp_obra_criar'));          -- duas criações ao mesmo tempo: a segunda encontra a obra
  perform pg_advisory_xact_lock(hashtext('taf_acesso'));                  -- [integração] a mesma trava do 06: as obras das chaves não mudam no meio
  if exists (select 1 from public.taf_erp_obra where codigo = v_cod) then raise exception 'OBRA % JA EXISTE NO ERP', v_cod; end if;

  -- [integração] obras que têm Diretoria ativa, contadas ANTES de criar; Diretoria com todas = tem todas essas (a regra do 06)
  if to_regclass('public.taf_ciclo_chave') is not null then
    select coalesce(array_agg(distinct u.x), '{}') into v_cob
      from public.taf_ciclo_chave c cross join lateral unnest(c.obras) as u(x)
     where c.papel = 'diretoria' and c.ativo;
    v_dir_todas := a.fixo and a.papel = 'diretoria' and v_cob <@ coalesce(a.obras, '{}');
  end if;
  -- [integração] obra que já existe no planejador: só quem já cuida dela cria o ERP (a chave não ganha obra que não tinha)
  if to_regclass('public.taf_ciclo_obra') is not null then
    select exists (select 1 from public.taf_ciclo_obra o where o.obra = v_cod) into v_plan;
  end if;
  if v_plan then
    if not a.fixo then
      raise exception 'OBRA % JA EXISTE NO PLANEJADOR: O ERP DELA SO E CRIADO COM A CHAVE PESSOAL DE QUEM JA CUIDA DELA', v_cod; end if;
    if not (v_cod = any(coalesce(a.obras, '{}'))) and not v_dir_todas then
      raise exception 'OBRA % JA EXISTE NO PLANEJADOR E NAO ESTA NA SUA CHAVE: PECA A DIRETORIA', v_cod; end if;
  end if;

  select coalesce(max(ordem), 0) + 1 into v_ord from public.taf_erp_obra;  -- obra nova vai para o fim da lista
  insert into public.taf_erp_obra (codigo, nome, contratante, ordem, atualizado_por) values (v_cod, v_nome, v_ct, v_ord, a.nome);

  -- chave pessoal com lista de obras: a obra nova entra na lista (a chave geral já vê todas)
  if a.fixo and a.obras is not null and to_regclass('public.taf_ciclo_chave') is not null then
    update public.taf_ciclo_chave c set obras = c.obras || v_cod
     where c.hash = a.hash and c.ativo and not (v_cod = any(c.obras))
    returning c.obras into v_lista;
    v_lista := coalesce(v_lista, a.obras);
  end if;
  -- [integração] e nas Diretorias com todas as obras (contadas antes): a obra nova não tira delas o "todas as obras"
  if to_regclass('public.taf_ciclo_chave') is not null then
    update public.taf_ciclo_chave c set obras = c.obras || v_cod
     where c.ativo and c.papel = 'diretoria' and v_cob <@ c.obras and not (v_cod = any(c.obras));
    get diagnostics v_ndir = row_count;
  end if;

  insert into public.taf_erp_base_hist (codigo, acao, quem, papel, verificado, detalhe)
  values (v_cod, 'criar', a.nome, a.papel, a.fixo,
          jsonb_build_object('nome', v_nome, 'contratante', v_ct, 'chave', case when a.fixo then 'pessoal' else 'geral' end,
                             'planejador', v_plan, 'diretorias_com_a_obra', v_ndir))
  returning hid into v_hid;

  return jsonb_build_object('ok', true, 'obra', jsonb_build_object('codigo', v_cod, 'nome', v_nome, 'contratante', v_ct),
                            'quem', a.nome, 'papel', a.papel, 'chave', case when a.fixo then 'pessoal' else 'geral' end,
                            'obras_da_chave', to_jsonb(v_lista), 'diretorias_com_a_obra', v_ndir, 'hid', v_hid);
end $$;

-- ===================================================================== trava das propostas de meta (05)
-- [integração] A proposta de meta (taf_erp_meta_prop, do 05) guarda só o código do item. Regravar ou voltar o orçamento com
-- proposta pendente, ou com meta aprovada, poria a meta pensada para o item antigo no item novo de mesmo código (e o
-- navegador aplicaria sozinho, porque o "antes" da decisão bate com o item novo). Sem o 05 aplicado, não faz nada.
create or replace function public._taf_erp_base_trava_meta(p_obra text) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_pend int := 0; v_aprov int := 0;
begin
  if to_regclass('public.taf_erp_meta_prop') is null then return; end if;
  execute 'select count(*) filter (where situacao = ''pendente''), count(*) filter (where situacao = ''aprovada'')
             from public.taf_erp_meta_prop where obra = $1' into v_pend, v_aprov using p_obra;
  if v_pend > 0 then
    raise exception 'OBRA % TEM PROPOSTA DE META PENDENTE (%): DECIDA OU CANCELE ANTES DE MUDAR O ORCAMENTO', p_obra, v_pend; end if;
  if v_aprov > 0 then
    raise exception 'OBRA % JA TEM META APROVADA: O ORCAMENTO NAO SE REGRAVA. USE ATUALIZAR PELA PLANILHA', p_obra; end if;
end $$;

-- ===================================================================== (b) gravar a base da obra
-- p_itens = [{codigo, descricao, unidade, qtd, pacote, evento, venda, meta, teto, meta_unit}], um por item (grupo não entra).
-- p_base_sha = sha256 (hex) do texto base64 de p_base_gz. O banco grava 'tela:' || p_base_sha e devolve esse valor em base_sha.
create or replace function public.taf_erp_base_gravar(p_chave text, p_obra text, p_base_gz text, p_base_sha text, p_itens jsonb,
                                                      p_quem text default null, p_papel text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a record; o public.taf_erp_obra; c public.taf_erp_base_hist; v_n int; v_x jsonb; v_k text; v_err text[] := '{}'; v_vistos text[] := '{}';
        v_ant jsonb; v_docs int; v_hid bigint; v_cod text; v_sha text;
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
  -- [revisão] a marca "tela:" é posta aqui, nunca vem de fora: o ERP abre esta base só pela lista fechada de campos
  v_sha := 'tela:' || p_base_sha;

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
    -- [revisão] a descrição vai para as telas do Ciclo, do Marko e do rastro: sem < > e aspas (a tela troca por ‹ › ″ antes de mandar)
    if coalesce(v_x ->> 'descricao', '') ~ '[<>"[:cntrl:]]' then v_err := v_err || format('%s: descrição com < > ou aspas', v_cod); end if;
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

  -- uma gravação por vez na obra, e nada lançado no meio (mesma trava do taf_erp_salvar)
  perform pg_advisory_xact_lock(hashtext('taf_erp_' || p_obra));
  select * into o from public.taf_erp_obra where codigo = p_obra for update;
  if o.base_sha is not distinct from v_sha then
    return jsonb_build_object('ok', true, 'igual', true, 'obra', p_obra, 'base_sha', v_sha,
                              'itens', (select count(*) from public.taf_erp_item i where i.obra = p_obra), 'versao', public._taf_erp_versao(p_obra));
  end if;
  -- [revisão] só obra criada pela tela: a obra do carga.py nunca é regravada por aqui
  select * into c from public.taf_erp_base_hist h where h.codigo = p_obra and h.acao = 'criar' order by h.hid limit 1;
  if c.hid is null then
    raise exception 'OBRA % NAO FOI CRIADA PELA TELA: O ORCAMENTO NAO SE REGRAVA. USE ATUALIZAR PELA PLANILHA', p_obra; end if;
  -- [revisão] nenhum documento de nenhum tipo (antes: só sol, oc, nf, med e bc; tarefa ligada, apontamento, contrato... ficavam de fora)
  select count(*) into v_docs from public.taf_erp_doc d where d.obra = p_obra;
  if v_docs > 0 then
    raise exception 'OBRA % JA TEM DOCUMENTO LANCADO (% DOCUMENTO(S)): O ORCAMENTO NAO SE REGRAVA. USE ATUALIZAR PELA PLANILHA', p_obra, v_docs; end if;
  if coalesce(o.estado ->> 'frozen', 'false') = 'true' then
    raise exception 'LINHA DE BASE DA OBRA % JA CONGELADA: O ORCAMENTO NAO SE REGRAVA. USE ATUALIZAR PELA PLANILHA', p_obra; end if;
  -- [revisão] meta ou ajuste no estado aponta para os códigos de agora: trocar a base deixaria o estado apontando para item que não existe
  if coalesce(o.estado -> 'metaOv', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb)
     or coalesce(o.estado -> 'baseOv', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb)
     or coalesce(o.estado -> 'basePac', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb) then
    raise exception 'OBRA % JA TEM META OU AJUSTE NA LINHA DE BASE: O ORCAMENTO NAO SE REGRAVA. USE ATUALIZAR PELA PLANILHA', p_obra; end if;
  -- [integração] proposta de meta (05) presa ao código do item de agora
  perform public._taf_erp_base_trava_meta(p_obra);
  -- [revisão] chave geral: só a primeira gravação e só na obra que a chave geral criou
  if not a.fixo then
    if o.base_sha is not null then
      raise exception 'COM A CHAVE DO SITE O ORCAMENTO SO E GRAVADO UMA VEZ: PARA REGRAVAR, USE A CHAVE PESSOAL DE GESTAO OU DIRETORIA'; end if;
    if c.verificado then
      raise exception 'OBRA % FOI CRIADA COM CHAVE PESSOAL: O ORCAMENTO DELA SO E GRAVADO COM CHAVE PESSOAL DE GESTAO OU DIRETORIA', p_obra; end if;
  end if;

  -- guarda a versão anterior (base e itens) antes de trocar
  select jsonb_agg(to_jsonb(i) - 'obra' order by i.codigo) into v_ant from public.taf_erp_item i where i.obra = p_obra;
  insert into public.taf_erp_base_hist (codigo, acao, base_gz, base_sha, itens, sha_novo, n_itens, quem, papel, verificado, detalhe)
  values (p_obra, 'base', o.base_gz, o.base_sha, v_ant, v_sha, v_n, a.nome, a.papel, a.fixo,
          jsonb_build_object('itens_antes', coalesce(jsonb_array_length(v_ant), 0), 'chave', case when a.fixo then 'pessoal' else 'geral' end))
  returning hid into v_hid;

  update public.taf_erp_obra set base_gz = p_base_gz, base_sha = v_sha, atualizado_por = a.nome where codigo = p_obra;
  delete from public.taf_erp_item where obra = p_obra;
  insert into public.taf_erp_item (obra, codigo, descricao, unidade, qtd, pacote, evento, venda, meta, teto, meta_unit)
  select p_obra, e ->> 'codigo', nullif(e ->> 'descricao', ''), nullif(e ->> 'unidade', ''), (e ->> 'qtd')::numeric,
         nullif(e ->> 'pacote', ''), nullif(e ->> 'evento', ''), (e ->> 'venda')::numeric, (e ->> 'meta')::numeric,
         (e ->> 'teto')::numeric, (e ->> 'meta_unit')::numeric
    from jsonb_array_elements(p_itens) e;

  return jsonb_build_object('ok', true, 'igual', false, 'obra', p_obra, 'base_sha', v_sha, 'itens', v_n, 'anterior', o.base_sha,
                            'hid', v_hid, 'versao', public._taf_erp_versao(p_obra), 'quem', a.nome, 'papel', a.papel);
end $$;

-- ===================================================================== voltar a base (só por SQL, com o sim do Felipe)
-- Uso: select public._taf_erp_base_voltar('998', <hid>, 'Felipe');   hid = linha do taf_erp_base_hist com a versão a recuperar
--      (a coluna base_gz de cada linha é a base que estava ANTES daquela gravação; base_sha volta junto, com a marca "tela:" se tinha).
-- Mesmas travas da gravação: não volta obra com documento lançado, com linha de base congelada ou com meta no estado.
-- A versão de agora vai para o histórico.
create or replace function public._taf_erp_base_voltar(p_obra text, p_hid bigint, p_quem text default 'SQL')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare h public.taf_erp_base_hist; o public.taf_erp_obra; v_ant jsonb; v_docs int; v_hid bigint;
begin
  select * into h from public.taf_erp_base_hist x where x.hid = p_hid and x.codigo = p_obra;
  if h.hid is null then raise exception 'VERSAO % NAO EXISTE NO HISTORICO DA OBRA %', p_hid, p_obra; end if;
  if h.base_gz is null then raise exception 'A LINHA % NAO GUARDA BASE ANTERIOR (A OBRA AINDA NAO TINHA BASE)', p_hid; end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_' || p_obra));
  select * into o from public.taf_erp_obra where codigo = p_obra for update;
  select count(*) into v_docs from public.taf_erp_doc d where d.obra = p_obra;
  if v_docs > 0 then raise exception 'OBRA % JA TEM DOCUMENTO LANCADO: NAO VOLTA A BASE', p_obra; end if;
  if coalesce(o.estado ->> 'frozen', 'false') = 'true' then raise exception 'LINHA DE BASE DA OBRA % JA CONGELADA: NAO VOLTA A BASE', p_obra; end if;
  if coalesce(o.estado -> 'metaOv', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb)
     or coalesce(o.estado -> 'baseOv', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb)
     or coalesce(o.estado -> 'basePac', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb) then
    raise exception 'OBRA % JA TEM META OU AJUSTE NA LINHA DE BASE: NAO VOLTA A BASE', p_obra; end if;
  perform public._taf_erp_base_trava_meta(p_obra);                          -- [integração] proposta de meta pendente ou aprovada
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
revoke all on function public._taf_erp_gestor(text, text, text), public._taf_erp_base_voltar(text, bigint, text),
  public._taf_erp_base_trava_meta(text) from public, anon, authenticated;
revoke all on function public.taf_erp_obra_criar(text, text, text, text, text, text),
  public.taf_erp_base_gravar(text, text, text, text, jsonb, text, text) from public;
grant execute on function public.taf_erp_obra_criar(text, text, text, text, text, text),
  public.taf_erp_base_gravar(text, text, text, text, jsonb, text, text) to anon, authenticated;

-- ===================================================================== cópia das obras criadas pela tela (antes do 99_reverter)
-- O PASSO A do 99_reverter.sql tira o base_gz e não copia taf_erp_item: para obra do carga.py, tudo volta pelo carga.py.
-- A obra criada pela tela só tem a base e os itens aqui no banco. Rodar e guardar junto com o JSON do PASSO A
-- (fora do repositório público: tem o orçamento das obras):
--   select jsonb_build_object('gerado_em', now(),
--     'obras', (select coalesce(jsonb_agg(to_jsonb(o) order by o.codigo), '[]') from public.taf_erp_obra o
--                where exists (select 1 from public.taf_erp_base_hist h where h.codigo = o.codigo and h.acao = 'criar')),
--     'itens', (select coalesce(jsonb_agg(to_jsonb(i) order by i.obra, i.codigo), '[]') from public.taf_erp_item i
--                where exists (select 1 from public.taf_erp_base_hist h where h.codigo = i.obra and h.acao = 'criar')),
--     'hist',  (select coalesce(jsonb_agg(to_jsonb(h) order by h.hid), '[]') from public.taf_erp_base_hist h)) as copia_obras_da_tela;
-- Para restaurar depois do PASSO C do 99_reverter (antes do bloco do estado, que só atualiza obra que existe), com a cópia em
-- set_config('taf.obras_tela', <json>, false):
--   do $$ declare b jsonb := current_setting('taf.obras_tela')::jsonb; begin
--     insert into public.taf_erp_obra (codigo, nome, contratante, ordem, base_gz, base_sha, estado, atualizado_por)
--     select x.codigo, x.nome, x.contratante, x.ordem, x.base_gz, x.base_sha, x.estado, x.atualizado_por
--       from jsonb_populate_recordset(null::public.taf_erp_obra, b->'obras') x on conflict (codigo) do nothing;
--     insert into public.taf_erp_item select * from jsonb_populate_recordset(null::public.taf_erp_item, b->'itens') on conflict do nothing;
--   end $$;
--   e aplicar de novo este arquivo e recarregar o histórico (taf_erp_base_hist) da cópia, se quiser o histórico de volta.

-- ===================================================================== como desfazer
-- 1. Cópia do histórico e das obras criadas pela tela (fora do repositório público: tem a base das obras): a cópia logo acima.
-- 2. Tirar as funções e a tabela (as obras criadas e as bases gravadas continuam em taf_erp_obra e taf_erp_item):
--      drop function if exists public.taf_erp_obra_criar(text, text, text, text, text, text);
--      drop function if exists public.taf_erp_base_gravar(text, text, text, text, jsonb, text, text);
--      drop function if exists public._taf_erp_base_voltar(text, bigint, text);
--      drop function if exists public._taf_erp_gestor(text, text, text);
--      drop function if exists public._taf_erp_base_trava_meta(text);
--      drop table if exists public.taf_erp_base_hist;
--    As bases já gravadas ficam com a marca "tela:" no base_sha: o ERP continua abrindo pela lista fechada de campos.
-- 3. Tirar uma obra criada por engano (só se não tem documento nenhum; o 01_erp.sql não deixa apagar obra, por isso o gatilho sai e volta):
--      alter table public.taf_erp_obra disable trigger taf_erp_obra_trg;
--      delete from public.taf_erp_item where obra = '<código>';
--      delete from public.taf_erp_obra where codigo = '<código>' and not exists (select 1 from public.taf_erp_doc d where d.obra = '<código>');
--      alter table public.taf_erp_obra enable trigger taf_erp_obra_trg;
--      update public.taf_ciclo_chave set obras = array_remove(obras, '<código>') where '<código>' = any(obras);
--    [integração] Com o 05 aplicado, a obra que tem proposta de meta não sai assim: a proposta aponta para a obra (chave estrangeira)
--    e não se apaga (gatilho "NADA E APAGADO"), então o delete da obra falha e nada muda. Confira antes:
--      select count(*) from public.taf_erp_meta_prop where obra = '<código>';
--    Com proposta, só com o sim do Felipe e numa transação: guardar a cópia das propostas da obra fora do repositório
--      (select jsonb_agg(to_jsonb(p)) from public.taf_erp_meta_prop p where p.obra = '<código>'), depois
--      alter table public.taf_erp_meta_prop disable trigger taf_erp_meta_trg;
--      delete from public.taf_erp_meta_prop where obra = '<código>';
--      alter table public.taf_erp_meta_prop enable trigger taf_erp_meta_trg;
--    e então os passos acima. A obra do planejador (taf_ciclo_obra), se existir, não é tocada.
-- O 99_reverter.sql (ERP inteiro) apaga as funções taf_erp_* deste arquivo, mas não a tabela taf_erp_base_hist: tirar com o passo 2.
-- E o 99_reverter perde a base e os itens das obras criadas pela tela se a cópia acima não for feita antes.

-- ======================================================== 05_meta.sql
-- 05 (item 2 do "sistema sozinho"): META PELA TELA. O engenheiro propõe, a Gestão aprova.
-- RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar (05_teste_999.sql, na obra 999 fictícia).
--
-- O que faz:
--   uma tabela nova, taf_erp_meta_prop, com as propostas de meta de item ou de pacote (meta, teto e, no pacote, "fechar até"),
--   o motivo de quem propôs, a situação (pendente, aprovada, recusada, cancelada), quem propôs (com o papel e se usou chave pessoal),
--   quem decidiu, quando e o motivo da decisão. Nada é apagado: a proposta só nasce e depois é decidida uma vez.
--   Funções de entrada (chamadas pelo ERP com a mesma chave do site, como as taf_erp_* do 01_erp.sql):
--     taf_erp_meta_propor   engenheiro, gerente, gestão ou diretoria propõem (chave pessoal ou chave geral do site);
--     taf_erp_meta_listar   lista as propostas da obra (quem abre a obra lê);
--     taf_erp_meta_decidir  aprova ou recusa: só Gerente, Gestão ou Diretoria com CHAVE PESSOAL (regra D4) e quem propôs não decide;
--     taf_erp_meta_cancelar quem propôs cancela a própria proposta enquanto está pendente;
--     taf_erp_meta_direta   Gestão ou Diretoria com chave pessoal mudam a meta direto, com motivo (fica registrada como já aprovada).
--
-- O que NÃO faz: não grava a meta no estado da obra. Quem aplica a meta aprovada é o navegador de quem pode gravar o estado
-- (Gestão, Diretoria ou Gerente), pelo mesmo caminho do Remanejar e do Atualizar pela planilha (estado.baseOv / estado.basePac,
-- versão nova da linha de base, histórico e auditoria), em fonte/erp/js/54_meta.js. O histórico da linha de base guarda o número
-- da proposta aplicada; ao abrir a obra, um aprovador aplica as aprovadas que ainda não estão no histórico.
-- Na decisão (e na mudança direta) o banco guarda em antes_decisao a meta, o teto e o "fechar até" que a tela de quem decidiu
-- mostrava. Antes de aplicar, o navegador confere: se o item (ou pacote) mudou depois da decisão, não aplica sozinho e mostra
-- "precisa de conferência" para Gerente, Gestão ou Diretoria escolherem (aplicar mesmo assim ou não aplicar).
-- Não mexe em taf_erp_salvar, _taf_erp_pode, _taf_erp_ator nem em nenhuma tabela que já existe.
--
-- ATENÇÃO (achado): as chaves pessoais (taf_ciclo_chave) só têm os papéis engenheiro, gestor, diretoria e leitura.
-- Não existe chave pessoal de Gerente. A função aceita Gerente com chave pessoal, mas hoje só Gestão (gestor) e Diretoria decidem.
--
-- RISCOS QUE ESTE ARQUIVO NÃO RESOLVE (precisam do sim do Felipe, em item separado):
--   1. A regra D4 protege a PROPOSTA e a DECISÃO (estas funções). A meta em si mora no estado da obra, e o taf_erp_salvar
--      (01_erp.sql, que esta tarefa não pode redefinir) grava o estado para Gestão, Diretoria e Gerente também com a chave geral
--      do site, em que o papel é escolhido na tela. Quem tem a chave geral pode mudar baseOv/metaOv/basePac pela planilha, pelo
--      Remanejar ou chamando taf_erp_salvar direto, e pode gravar marcas hist[].prop falsas (a proposta marcada não é aplicada).
--      A D4 da meta só fica completa quando taf_erp_salvar recusar mudança em baseOv, metaOv, basePac e hist vinda de chave não pessoal.
--   2. O ERP não confere a versão do estado antes de gravar: um navegador com o estado velho grava por cima do que outro gravou
--      (vale para tudo do estado, não só para a meta). A meta aprovada que some assim volta a ser aplicada, ou fica "precisa de
--      conferência" se o item mudou; mas o que o navegador velho apagou de outros (um remanejamento, uma planilha) se perde.
--      Enquanto isso, o banco fica sem a meta até um navegador de Gestão, Diretoria ou Gerente com a obra aberta ler o banco
--      (o ERP lê a cada 30 segundos e a tela de metas confere a cada minuto) ou, se nenhum estiver aberto, até alguém desses
--      papéis abrir a obra. A correção de fundo é conferir a versão antes de gravar (taf_erp_salvar e chSync).
--
-- Antes de aplicar: backup (PASSO A de 99_reverter.sql, salvo em arquivo fora do repositório). Fora do horário de uso.
-- Pode rodar mais de uma vez (tudo é "if not exists" ou "create or replace"; a ligação com a obra volta se tiver saído).
-- Para desfazer: ver o fim do arquivo.

create sequence if not exists public.taf_erp_meta_ordem_seq;

create table if not exists public.taf_erp_meta_prop (
  id bigserial primary key,
  obra text not null references public.taf_erp_obra(codigo),
  alvo text not null check (alvo in ('item', 'pacote')),
  codigo text not null check (length(codigo) between 1 and 60),
  meta numeric(16, 2) check (meta is null or meta between 0 and 9999999999),
  teto numeric(16, 2) check (teto is null or teto between 0 and 9999999999),
  fechar_ate date check (fechar_ate is null or fechar_ate between date '2000-01-01' and date '2100-12-31'),
  antes jsonb not null default '{}'::jsonb,                 -- o que valia na hora da proposta (item: lido do banco; pacote: o que a tela mostrava)
  motivo text not null check (length(btrim(regexp_replace(motivo, '[[:space:]]+', ' ', 'g'))) between 3 and 500),
  origem text not null default 'proposta' check (origem in ('proposta', 'direta')),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovada', 'recusada', 'cancelada')),
  proposto_por text not null,
  proposto_papel text not null,
  proposto_pessoal boolean not null,                         -- true = chave pessoal (nome fixo); false = chave geral do site (nome digitado)
  proposto_em timestamptz not null default now(),
  decidido_por text,
  decidido_papel text,
  decidido_em timestamptz,
  decisao_motivo text check (decisao_motivo is null or length(decisao_motivo) <= 500),
  ordem bigint unique,                                       -- ordem das aprovadas: a mais nova vale por cima das mais velhas
  check (meta is not null or teto is not null or fechar_ate is not null),
  check (alvo = 'pacote' or fechar_ate is null),
  check ((situacao = 'pendente') = (decidido_em is null)),
  check ((situacao = 'aprovada') = (ordem is not null))
);
-- uma proposta pendente por item (ou pacote) de cada vez: a segunda espera a primeira ser decidida ou cancelada
-- o que a tela de quem decidiu mostrava (meta, teto e, no pacote, "fechar até"): o navegador só aplica sozinho se o item ainda estiver assim
alter table public.taf_erp_meta_prop add column if not exists antes_decisao jsonb;
-- [integração] a ligação com a obra (chave estrangeira) volta se tiver saído: o 99_reverter.sql do ERP (drop ... cascade em
-- taf_erp_obra) tira esta ligação e deixa a tabela, e o "create table if not exists" acima não a devolveria.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.taf_erp_meta_prop'::regclass and contype = 'f') then
    alter table public.taf_erp_meta_prop add constraint taf_erp_meta_prop_obra_fkey foreign key (obra) references public.taf_erp_obra(codigo);
  end if;
end $$;
create unique index if not exists taf_erp_meta_prop_pendente on public.taf_erp_meta_prop (obra, alvo, codigo) where situacao = 'pendente';
create index if not exists taf_erp_meta_prop_obra on public.taf_erp_meta_prop (obra, id);

-- Nada é apagado; a proposta não muda depois de feita, só recebe a decisão, uma vez.
create or replace function public._taf_erp_meta_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'NADA E APAGADO'; end if;
  if old.situacao <> 'pendente' then raise exception 'PROPOSTA JA DECIDIDA'; end if;
  if (new.id, new.obra, new.alvo, new.codigo, new.meta, new.teto, new.fechar_ate, new.antes, new.motivo, new.origem,
      new.proposto_por, new.proposto_papel, new.proposto_pessoal, new.proposto_em)
     is distinct from
     (old.id, old.obra, old.alvo, old.codigo, old.meta, old.teto, old.fechar_ate, old.antes, old.motivo, old.origem,
      old.proposto_por, old.proposto_papel, old.proposto_pessoal, old.proposto_em) then
    raise exception 'PROPOSTA NAO MUDA, SO RECEBE A DECISAO';
  end if;
  return new;
end $$;
drop trigger if exists taf_erp_meta_trg on public.taf_erp_meta_prop;
create trigger taf_erp_meta_trg before update or delete on public.taf_erp_meta_prop for each row execute function public._taf_erp_meta_trg();

alter table public.taf_erp_meta_prop enable row level security;
revoke all on public.taf_erp_meta_prop from public, anon, authenticated;
revoke all on sequence public.taf_erp_meta_prop_id_seq, public.taf_erp_meta_ordem_seq from public, anon, authenticated;

-- Mesma identidade do navegador (05_motor_de_regras.js nomeNorm): sem acento, minúsculo, espaços simples.
-- [integração] e sem caractere invisível (espaço de largura zero, marcas de direção, BOM...), a mesma lista do 06 (_taf_acesso_limpa):
-- "Gestor\u200B Teste" era outra pessoa para "quem propôs não decide" e o registro mostrava duas pessoas onde houve uma.
create or replace function public._taf_erp_meta_norm(p text) returns text
language sql immutable set search_path = public as $$
  select lower(translate(btrim(regexp_replace(regexp_replace(coalesce(p, ''),
    E'[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB\U000E0000-\U000E007F]', '', 'g'),
    E'[\\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+', ' ', 'g')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN')) $$;

-- Número de um campo do "antes" mandado pela tela (só número; o resto vira vazio).
create or replace function public._taf_erp_meta_num(p text) returns numeric
language sql immutable set search_path = public as $$
  select case when p ~ '^-?[0-9]{1,13}(\.[0-9]{1,6})?$' then p::numeric end $$;

-- Texto digitado (motivo): qualquer sequência de espaço, quebra de linha, tabulação ou espaço invisível vira um espaço só, sem
-- espaço nas pontas. "Motivo" feito só disso fica vazio (a tela já barra; aqui vale para quem chama a função direto).
create or replace function public._taf_erp_meta_texto(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(coalesce(p, ''), '[[:space:]   -​    　﻿]+', ' ', 'g')) $$;

-- O que a tela de quem decide mostrava (meta, teto, "fechar até"), mandado pelo navegador: só número (2 casas) e data; o resto some.
create or replace function public._taf_erp_meta_tela(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'meta', case when coalesce(p->>'meta', '') ~ '^[0-9]{1,13}(\.[0-9]{1,20})?$' then round((p->>'meta')::numeric, 2) end,
    'teto', case when coalesce(p->>'teto', '') ~ '^[0-9]{1,13}(\.[0-9]{1,20})?$' then round((p->>'teto')::numeric, 2) end,
    'fechar_ate', case when coalesce(p->>'fechar_ate', '') ~ '^\d{4}-\d{2}-\d{2}$' then p->>'fechar_ate' end)) $$;

-- O que vale hoje no item, pela mesma regra de _taf_erp_valores (02_rastro.sql): meta remanejada, senão a da linha de base, senão a da carga.
create or replace function public._taf_erp_meta_item_atual(p_obra text, p_codigo text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('venda', i.venda,
      'meta', coalesce(public._taf_erp_meta_num(o.estado->'metaOv'->>i.codigo), public._taf_erp_meta_num(o.estado->'baseOv'->i.codigo->>'meta_total'), i.meta),
      'teto', coalesce(public._taf_erp_meta_num(o.estado->'baseOv'->i.codigo->>'teto_total'), i.teto))
    from public.taf_erp_item i join public.taf_erp_obra o on o.codigo = i.obra
   where i.obra = p_obra and i.codigo = p_codigo $$;

-- Confere o pedido de mudança (vale para propor e para mudar direto). Levanta o motivo da recusa.
create or replace function public._taf_erp_meta_valida(p_obra text, p_alvo text, p_codigo text, p_meta numeric, p_teto numeric,
                                                       p_fechar_ate date, p_motivo text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_alvo is null or p_alvo not in ('item', 'pacote') then raise exception 'ALVO INVALIDO'; end if;
  if coalesce(p_codigo, '') = '' or length(p_codigo) > 60 then raise exception 'CODIGO INVALIDO'; end if;
  if p_alvo = 'item' and not exists (select 1 from public.taf_erp_item where obra = p_obra and codigo = p_codigo) then
    raise exception 'ITEM NAO EXISTE NA OBRA'; end if;
  if p_alvo = 'pacote' and not exists (select 1 from public.taf_erp_item where obra = p_obra and pacote = p_codigo) then
    raise exception 'PACOTE NAO EXISTE NA OBRA'; end if;
  if p_meta is null and p_teto is null and p_fechar_ate is null then raise exception 'INFORME META, TETO OU DATA'; end if;
  if p_meta < 0 or p_teto < 0 or p_meta > 9999999999 or p_teto > 9999999999 then raise exception 'VALOR INVALIDO'; end if;
  if p_alvo = 'item' and p_fechar_ate is not null then raise exception 'FECHAR ATE SO NO PACOTE'; end if;
  if p_fechar_ate is not null and p_fechar_ate not between date '2000-01-01' and date '2100-12-31' then raise exception 'DATA INVALIDA'; end if;
  if length(public._taf_erp_meta_texto(p_motivo)) < 3 then raise exception 'MOTIVO OBRIGATORIO'; end if;
  if length(public._taf_erp_meta_texto(p_motivo)) > 500 then raise exception 'MOTIVO GRANDE DEMAIS'; end if;
  if exists (select 1 from public.taf_erp_meta_prop where obra = p_obra and alvo = p_alvo and codigo = p_codigo and situacao = 'pendente') then
    raise exception 'JA HA PROPOSTA PENDENTE PARA ESTE %', upper(p_alvo); end if;
  if (select count(*) from public.taf_erp_meta_prop where obra = p_obra and situacao = 'pendente') >= 300 then
    raise exception 'MUITAS PROPOSTAS PENDENTES NA OBRA'; end if;
end $$;

-- "Antes" guardado com a proposta: item lido do banco; pacote, o que a tela mandou (só números e data).
create or replace function public._taf_erp_meta_antes(p_obra text, p_alvo text, p_codigo text, p_antes jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p_alvo = 'item' then coalesce(public._taf_erp_meta_item_atual(p_obra, p_codigo), '{}'::jsonb)
    else jsonb_strip_nulls(jsonb_build_object(
      'meta', public._taf_erp_meta_num(p_antes->>'meta'),
      'teto', public._taf_erp_meta_num(p_antes->>'teto'),
      'fechar_ate', case when coalesce(p_antes->>'fechar_ate', '') ~ '^\d{4}-\d{2}-\d{2}$' then p_antes->>'fechar_ate' end)) end $$;

-- Propor. Engenheiro, Gerente, Gestão ou Diretoria. Com a chave geral do site vale (o nome é digitado e fica marcado assim);
-- a proposta não muda nada até alguém com chave pessoal aprovar.
create or replace function public.taf_erp_meta_propor(p_chave text, p_obra text, p_quem text, p_papel text, p_alvo text, p_codigo text,
  p_meta numeric default null, p_teto numeric default null, p_fechar_ate date default null, p_motivo text default null, p_antes jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; r public.taf_erp_meta_prop;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, p_papel);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  if not (a.papel = any(array['engenheiro', 'gerente', 'gestao', 'diretoria'])) then
    raise exception 'PAPEL % NAO PROPOE META', upper(a.papel); end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_meta_' || p_obra));
  perform public._taf_erp_meta_valida(p_obra, p_alvo, p_codigo, p_meta, p_teto, p_fechar_ate, p_motivo);
  insert into public.taf_erp_meta_prop (obra, alvo, codigo, meta, teto, fechar_ate, antes, motivo, origem, situacao,
                                        proposto_por, proposto_papel, proposto_pessoal)
  values (p_obra, p_alvo, p_codigo, p_meta, p_teto, p_fechar_ate, public._taf_erp_meta_antes(p_obra, p_alvo, p_codigo, p_antes),
          public._taf_erp_meta_texto(p_motivo), 'proposta', 'pendente', a.nome, a.papel, coalesce(a.fixo, false))
  returning * into r;
  return to_jsonb(r);
end $$;

-- Mudar a meta direto, sem proposta: só Gestão ou Diretoria com chave pessoal, com motivo. Fica registrada como aprovada
-- (o navegador aplica pelo mesmo caminho da proposta aprovada, e ela não se perde).
create or replace function public.taf_erp_meta_direta(p_chave text, p_obra text, p_quem text, p_papel text, p_alvo text, p_codigo text,
  p_meta numeric default null, p_teto numeric default null, p_fechar_ate date default null, p_motivo text default null, p_antes jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; r public.taf_erp_meta_prop;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, p_papel);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  if coalesce(a.fixo, false) is not true then raise exception 'MUDAR META DIRETO SO COM CHAVE PESSOAL'; end if;
  if not (a.papel = any(array['gestao', 'diretoria'])) then raise exception 'SO GESTAO E DIRETORIA MUDAM META DIRETO'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_meta_' || p_obra));
  perform public._taf_erp_meta_valida(p_obra, p_alvo, p_codigo, p_meta, p_teto, p_fechar_ate, p_motivo);
  insert into public.taf_erp_meta_prop (obra, alvo, codigo, meta, teto, fechar_ate, antes, antes_decisao, motivo, origem, situacao,
                                        proposto_por, proposto_papel, proposto_pessoal, decidido_por, decidido_papel, decidido_em, ordem)
  values (p_obra, p_alvo, p_codigo, p_meta, p_teto, p_fechar_ate, public._taf_erp_meta_antes(p_obra, p_alvo, p_codigo, p_antes),
          public._taf_erp_meta_tela(p_antes), public._taf_erp_meta_texto(p_motivo), 'direta', 'aprovada', a.nome, a.papel, true,
          a.nome, a.papel, now(), nextval('public.taf_erp_meta_ordem_seq'))
  returning * into r;
  return to_jsonb(r);
end $$;

-- Lista da obra (as mais novas primeiro). Quem abre a obra lê: o engenheiro vê a situação das dele, o aprovador vê as pendentes.
create or replace function public.taf_erp_meta_listar(p_chave text, p_obra text, p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc)
                     from (select * from public.taf_erp_meta_prop where obra = p_obra order by id desc limit 2000) x), '[]'::jsonb);
end $$;

-- Aprovar ou recusar. Só Gerente, Gestão ou Diretoria, com CHAVE PESSOAL (D4: com a chave geral do site o nome é digitado,
-- ninguém aprova). Quem propôs não decide (mesmo nome, com qualquer chave). Recusar pede motivo.
-- p_antes: meta, teto e "fechar até" que a tela de quem decide mostrava (fica em antes_decisao; o navegador só aplica sozinho
-- se o item ainda estiver assim). A versão anterior deste rascunho não tinha p_antes: a assinatura velha é removida para não
-- ficarem duas funções com o mesmo nome.
drop function if exists public.taf_erp_meta_decidir(text, text, text, text, bigint, boolean, text);
create or replace function public.taf_erp_meta_decidir(p_chave text, p_obra text, p_quem text, p_papel text, p_id bigint,
  p_aprovar boolean, p_motivo text default null, p_antes jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; r public.taf_erp_meta_prop;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, p_papel);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if coalesce(a.fixo, false) is not true then raise exception 'DECIDIR META SO COM CHAVE PESSOAL'; end if;
  if not (a.papel = any(array['gerente', 'gestao', 'diretoria'])) then raise exception 'PAPEL % NAO DECIDE META', upper(a.papel); end if;
  if p_aprovar is null then raise exception 'DECISAO INVALIDA'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_meta_' || p_obra));
  select * into r from public.taf_erp_meta_prop where id = p_id and obra = p_obra for update;
  if r.id is null then raise exception 'PROPOSTA NAO EXISTE'; end if;
  if r.situacao <> 'pendente' then raise exception 'PROPOSTA JA DECIDIDA'; end if;
  if public._taf_erp_meta_norm(r.proposto_por) = public._taf_erp_meta_norm(a.nome) then raise exception 'QUEM PROPOS NAO DECIDE'; end if;
  if not p_aprovar and length(public._taf_erp_meta_texto(p_motivo)) < 3 then raise exception 'RECUSAR PEDE MOTIVO'; end if;
  update public.taf_erp_meta_prop
     set situacao = case when p_aprovar then 'aprovada' else 'recusada' end,
         decidido_por = a.nome, decidido_papel = a.papel, decidido_em = now(),
         decisao_motivo = nullif(left(public._taf_erp_meta_texto(p_motivo), 500), ''),
         antes_decisao = public._taf_erp_meta_tela(p_antes),
         ordem = case when p_aprovar then nextval('public.taf_erp_meta_ordem_seq') end
   where id = r.id
  returning * into r;
  return to_jsonb(r);
end $$;

-- Cancelar a própria proposta, enquanto está pendente. Proposta feita com chave pessoal só se cancela com chave pessoal.
create or replace function public.taf_erp_meta_cancelar(p_chave text, p_obra text, p_quem text, p_id bigint, p_motivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; r public.taf_erp_meta_prop;
begin
  select * into a from public._taf_erp_ator(p_chave, p_quem, null);
  perform public._taf_erp_obra_ok(a.obras, p_obra);
  if a.leitura then raise exception 'CHAVE SO DE LEITURA'; end if;
  if a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_erp_meta_' || p_obra));
  select * into r from public.taf_erp_meta_prop where id = p_id and obra = p_obra for update;
  if r.id is null then raise exception 'PROPOSTA NAO EXISTE'; end if;
  if r.situacao <> 'pendente' then raise exception 'PROPOSTA JA DECIDIDA'; end if;
  if public._taf_erp_meta_norm(r.proposto_por) <> public._taf_erp_meta_norm(a.nome) then raise exception 'SO QUEM PROPOS CANCELA'; end if;
  if r.proposto_pessoal and coalesce(a.fixo, false) is not true then raise exception 'CANCELE COM A SUA CHAVE PESSOAL'; end if;
  update public.taf_erp_meta_prop
     set situacao = 'cancelada', decidido_por = a.nome, decidido_papel = a.papel, decidido_em = now(),
         decisao_motivo = nullif(left(public._taf_erp_meta_texto(p_motivo), 500), '')
   where id = r.id
  returning * into r;
  return to_jsonb(r);
end $$;

-- Só as funções de entrada ficam chamáveis pela API; as internas e a tabela, não.
revoke all on function public._taf_erp_meta_trg(), public._taf_erp_meta_norm(text), public._taf_erp_meta_num(text),
  public._taf_erp_meta_texto(text), public._taf_erp_meta_tela(jsonb),
  public._taf_erp_meta_item_atual(text, text), public._taf_erp_meta_valida(text, text, text, numeric, numeric, date, text),
  public._taf_erp_meta_antes(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.taf_erp_meta_propor(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
  public.taf_erp_meta_direta(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
  public.taf_erp_meta_listar(text, text, text),
  public.taf_erp_meta_decidir(text, text, text, text, bigint, boolean, text, jsonb),
  public.taf_erp_meta_cancelar(text, text, text, bigint, text) from public;
grant execute on function public.taf_erp_meta_propor(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
  public.taf_erp_meta_direta(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
  public.taf_erp_meta_listar(text, text, text),
  public.taf_erp_meta_decidir(text, text, text, text, bigint, boolean, text, jsonb),
  public.taf_erp_meta_cancelar(text, text, text, bigint, text) to anon, authenticated;

-- ===================== COMO DESFAZER =====================
-- 1. No ERP, desligar a chave "Meta pela tela" nas obras (Compras → Parâmetros → Chaves desta obra). Desligada, a tela não chama nada daqui.
--    As metas que já foram aplicadas continuam no estado da obra (linha de base, histórico e auditoria), como qualquer Atualizar pela planilha.
-- 2. Guardar cópia das propostas FORA do banco aberto ao site, em arquivo fora do repositório:
--      select jsonb_agg(to_jsonb(p) order by p.id) from public.taf_erp_meta_prop p;
--    [integração] nunca "create table public.taf_erp_meta_prop_copia as select": no Supabase, tabela nova em public pode nascer
--    sem RLS e com acesso do site (anon), e a cópia ficaria aberta (ver o LEIA-ME-06, passo 1).
--    O 99_reverter.sql do ERP deixa taf_erp_meta_prop (e taf_erp_base_hist, do 04): tirar pelo passo 3 abaixo e pelo desfazer do 04.
-- 3. Remover só o que este arquivo criou:
--    drop function if exists public.taf_erp_meta_propor(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
--      public.taf_erp_meta_direta(text, text, text, text, text, text, numeric, numeric, date, text, jsonb),
--      public.taf_erp_meta_listar(text, text, text), public.taf_erp_meta_decidir(text, text, text, text, bigint, boolean, text, jsonb),
--      public.taf_erp_meta_cancelar(text, text, text, bigint, text),
--      public._taf_erp_meta_antes(text, text, text, jsonb), public._taf_erp_meta_valida(text, text, text, numeric, numeric, date, text),
--      public._taf_erp_meta_item_atual(text, text), public._taf_erp_meta_num(text), public._taf_erp_meta_norm(text),
--      public._taf_erp_meta_texto(text), public._taf_erp_meta_tela(jsonb);
--    drop table if exists public.taf_erp_meta_prop;          -- leva junto o gatilho e os índices
--    drop function if exists public._taf_erp_meta_trg();
--    drop sequence if exists public.taf_erp_meta_ordem_seq;
-- NÃO usar o 99_reverter.sql inteiro (apaga o ERP todo).

-- ======================================================== 06_acessos.sql
-- 06_acessos.sql · Tela Acessos do ERP: criar e desativar a chave pessoal pela tela, sem SQL.
-- RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar (06_teste_acessos.sql, que desfaz tudo no fim).
--
-- O que faz:
--   1. taf_ciclo_chave aceita o papel 'encarregado' (troca só a regra de papel da tabela; nada mais muda nela).
--   2. taf_acesso_log: registro de quem criou e quem desativou cada chave. Só entra linha; nunca muda nem apaga.
--      Guarda só um identificador curto. Nunca a chave, nunca o hash.
--      O identificador (10 letras) é o começo do hmac do sha256 com um segredo do banco (taf_acesso_segredo, fechado para o site):
--      não entrega nenhum pedaço do sha256 a quem vê a lista (chave antiga fraca, criada à mão, não fica mais fácil de adivinhar).
--   3. Três funções de entrada, chamáveis pelo site (anon):
--        taf_acesso_listar(chave, quem)                               lista as chaves pessoais, sem o hash
--        taf_acesso_criar(chave, nome, pessoa, papel, obras, quem)    gera a chave NO BANCO, grava só o sha256, devolve o texto UMA vez
--        taf_acesso_desativar(chave, id, motivo, quem)
--      Quem pode:
--        chave pessoal de Diretoria: cria e desativa qualquer papel, só nas obras que ela cuida (ver "obras" abaixo).
--        chave pessoal de gestor: cria e desativa engenheiro, encarregado e leitura, só nas obras da própria chave.
--        chave geral do site: na PARTIDA (nenhuma chave de Diretoria ativa) cria a primeira, só de Diretoria, com o nome
--          digitado. Depois disso não cria nem desativa nada (D4: com a chave geral o nome é digitado).
--        Ninguém desativa a própria chave.
--      Obras (revisão 2): a chave nova e a chave a desativar têm de estar inteiras dentro das obras de quem faz.
--        Diretoria "com todas as obras" = a chave de Diretoria que tem todas as obras que alguma Diretoria ativa tem.
--          Ela cuida de todas as obras do sistema, inclusive obra nova que ainda não tem Diretoria (senão obra importada
--          depois ficaria sem ninguém para dar acesso). A Diretoria limitada (sócio de consórcio, uma obra só) cuida só das obras dela.
--        Tem de sobrar sempre uma Diretoria com todas as obras: não desativa a que deixaria nenhuma; e a primeira chave de
--          Diretoria de uma obra nova tem de ter também todas as obras que já têm Diretoria.
--        O gestor e a Diretoria limitada só veem na lista as chaves que têm obra em comum com eles (sem as obras de fora,
--          só quantas são); o gestor não vê as chaves de Diretoria. [SUPOSIÇÃO: falta o ok do Felipe, ver o LEIA-ME-06.]
--        Engenheiro, encarregado e leitura não veem a lista.
--      Validação: papel, obras que existem (taf_ciclo_obra ou taf_erp_obra), nome da chave (3 a 60 letras, sem repetir entre as
--      ativas) e pessoa (2 a 60 letras; só a chave de leitura pode ficar sem pessoa). Antes de validar e de comparar, tira os
--      caracteres invisíveis (espaço de largura zero e parecidos) e junta os espaços; nome e pessoa precisam de 2 letras ou números.
--      Pessoa (revisão 2): não cria chave em nome de quem já tem chave ativa que o criador não cuida (ex.: gestor criando em nome
--        da Diretoria ou de outro gestor). Vale também para a Diretoria limitada. Na partida não confere (não há quem cuide).
--      Aviso (não bloqueia): chave de engenheiro em nome diferente do engenheiro da obra no planejador (taf_ciclo_obra.engenheiro);
--        pessoa que já tem outra chave ativa (celular antigo?).
--        O planejador (02_funcoes.sql, _taf_ciclo_ator) só dá papel de engenheiro à chave antiga do site quando o nome é
--        igual a taf_ciclo_obra.engenheiro; a chave pessoal nova entra pelo papel, mas as demandas, as áreas e as tarefas
--        em nome do engenheiro (resp, dono, "para você decidir") só aparecem como dela se o nome for o mesmo.
--   4. Encarregado no planejador: só aponta o dia (apont, apont_lote, apont_apagar). Não prepara, não monta compromisso,
--      não publica, não fecha semana, não replaneja, não abre demanda solta.
--      Para isso este arquivo REDEFINE _taf_ciclo_pode: cópia inteira da versão atual (fonte/ciclo/sql/02_funcoes.sql,
--      igual à do banco: md5 do corpo 0b8e6eba22d91ff6fcba227ae952048c em /opt/pgtest/prod_md5.txt), com a linha nova marcada "06".
--      _taf_ciclo_ator e _taf_erp_ator NÃO mudam: as duas já passam adiante o papel da chave pessoal
--        (_taf_ciclo_ator: papel := v_c.papel; _taf_erp_ator: case ... else r.papel, e 'encarregado' já é papel do ERP
--        em _taf_erp_papeis). Conferido no teste: a chave de encarregado entra no ERP como encarregado e no planejador como encarregado.
--      taf_ciclo_ler, taf_ciclo_importar e _taf_ciclo_condicao não são tocadas.
--
--      [integração] Se o fonte/ciclo/sql/02_funcoes.sql for rodado de novo DEPOIS deste arquivo, ele volta o _taf_ciclo_pode
--        antigo: o encarregado para de apontar sem aviso (a tela ainda diz que ele aponta). Rode este 06 de novo logo depois
--        (pode rodar de novo sem problema). A trava do começo deste arquivo para se o _taf_ciclo_pode do banco não for nem o do
--        repositório nem o deste arquivo (alguém mexeu nele no banco): compare antes de seguir.
--   5. [integração] A chave do robô do resumo (08_resumo.sql) é de leitura e sem obra nenhuma. Chave sem obra só a Diretoria com
--      todas as obras desativa (lista vazia cabia no escopo de qualquer gestor); desativar o robô por aqui desliga também o robô
--      no Resumo (taf_resumo_robo), e a lista marca a linha como "robo".
--
-- Depende de: fonte/ciclo/sql/01 e 02 (taf_ciclo_chave, taf_ciclo_obra), fonte/erp/sql/01_erp.sql (taf_erp_obra),
--             public._taf_ok (chave geral do site), extensão pgcrypto no esquema extensions (digest, hmac e gen_random_bytes).
-- Antes de aplicar: backup de taf_ciclo_chave fora do banco aberto ao site (ver o LEIA-ME-06, passo 1: o PASSO A de
--   fonte/ciclo/sql/99_reverter.sql salvo em arquivo fora do repositório; nunca "create table public.... as select").
-- Fora do horário de uso. Rodar o arquivo inteiro de uma vez, tudo ou nada: psql -1 -v ON_ERROR_STOP=1 -f 06_acessos.sql
--   [integração] A troca da regra de papel trava taf_ciclo_chave, que todo acesso do site lê: com lock_timeout de 3 s, se outra
--   transação estiver usando a tabela, o arquivo falha inteiro em vez de deixar o site esperando. É só rodar de novo.
-- Desfazer: ver o fim do arquivo.

-- ===================================================================== 0. travas antes de mexer
set lock_timeout = '3s';
-- [integração] o _taf_ciclo_pode do banco tem de ser o do repositório (fonte/ciclo/sql/02_funcoes.sql) ou o deste arquivo
do $$ declare v text; begin
  v := md5(pg_get_functiondef('public._taf_ciclo_pode(text,text)'::regprocedure));
  if v not in ('0b8e6eba22d91ff6fcba227ae952048c',     -- fonte/ciclo/sql/02_funcoes.sql (o do banco da TAF, prod_md5)
               'e181c6427042a76781e61ec36c2be373') then -- este arquivo já aplicado
    raise exception 'FUNCAO _taf_ciclo_pode DO BANCO DIFERENTE DO REPOSITORIO (md5 %): PARE E COMPARE ANTES DE RODAR O 06', v;
  end if;
end $$;

-- ===================================================================== 1. papel 'encarregado' na chave pessoal
-- Tira a regra antiga de papel (a que lista 'gestor'), qualquer que seja o nome dela no banco, e põe a nova.
-- A regra "leitura pode ficar sem pessoa" (taf_ciclo_chave_check) não muda: o encarregado precisa de pessoa.
-- [integração] tirar e pôr no mesmo comando: se não conseguir a trava, nada muda (antes a regra antiga podia sair sem a nova entrar)
do $$ declare r record; begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.taf_ciclo_chave'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) ~ 'papel' and pg_get_constraintdef(c.oid) ~ 'gestor' loop
    execute format('alter table public.taf_ciclo_chave drop constraint %I', r.conname);
  end loop;
  alter table public.taf_ciclo_chave add constraint taf_ciclo_chave_papel_check
    check (papel in ('engenheiro','gestor','diretoria','leitura','encarregado'));
end $$;

-- ===================================================================== 2. registro de criar e desativar
create table if not exists public.taf_acesso_log (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  acao        text not null check (acao in ('criar','desativar')),
  chave_id    text not null check (chave_id ~ '^[0-9a-f]{10}$'),   -- identificador curto (_taf_acesso_id: hmac do sha256, não o sha256)
  nome        text not null,
  pessoa      text,
  papel       text not null,
  obras       text[] not null,
  motivo      text check (length(motivo) <= 300),
  quem        text not null,                                       -- quem criou ou desativou
  quem_papel  text not null,                                       -- 'diretoria', 'gestor' ou 'chave geral'
  verificado  boolean not null                                     -- true = chave pessoal; false = nome digitado com a chave geral
);
create index if not exists taf_acesso_log_chave on public.taf_acesso_log (chave_id, id);

create or replace function public._taf_acesso_log_trava() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'HISTORICO NAO SE ALTERA';
end $$;
drop trigger if exists t_trava on public.taf_acesso_log;
create trigger t_trava before update or delete on public.taf_acesso_log for each row execute function public._taf_acesso_log_trava();
drop trigger if exists t_trava_trunc on public.taf_acesso_log;
create trigger t_trava_trunc before truncate on public.taf_acesso_log for each statement execute function public._taf_acesso_log_trava();

alter table public.taf_acesso_log enable row level security;
revoke all on public.taf_acesso_log from public, anon, authenticated;
revoke all on sequence public.taf_acesso_log_id_seq from public, anon, authenticated;

-- Segredo do identificador curto (revisão 2). Uma linha só, sorteada aqui, nunca sai do banco e nunca muda
-- (se mudasse, os identificadores do registro deixariam de bater com as chaves).
create table if not exists public.taf_acesso_segredo (
  um       boolean primary key default true check (um),
  segredo  bytea not null default extensions.gen_random_bytes(32) check (octet_length(segredo) = 32)
);
insert into public.taf_acesso_segredo (um) values (true) on conflict (um) do nothing;
create or replace function public._taf_acesso_segredo_trava() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'O SEGREDO DOS IDENTIFICADORES NAO SE ALTERA';
end $$;
drop trigger if exists t_trava on public.taf_acesso_segredo;
create trigger t_trava before update or delete on public.taf_acesso_segredo for each row execute function public._taf_acesso_segredo_trava();
drop trigger if exists t_trava_trunc on public.taf_acesso_segredo;
create trigger t_trava_trunc before truncate on public.taf_acesso_segredo for each statement execute function public._taf_acesso_segredo_trava();
alter table public.taf_acesso_segredo enable row level security;
revoke all on public.taf_acesso_segredo from public, anon, authenticated;

-- ===================================================================== 3. funções internas
-- Identificador curto de uma chave: 10 letras do hmac do sha256 com o segredo. Não entrega pedaço do sha256.
create or replace function public._taf_acesso_id(p_hash text) returns text
language sql stable strict security definer set search_path = public, extensions as $$
  select left(encode(extensions.hmac(convert_to(p_hash, 'UTF8'), s.segredo, 'sha256'), 'hex'), 10)
    from public.taf_acesso_segredo s where s.um $$;

-- Texto digitado (nome e pessoa): tira os caracteres invisíveis (largura zero, marcas de direção, BOM, preenchimento),
-- troca os espaços especiais por espaço comum e junta os espaços. Vazio = null.
create or replace function public._taf_acesso_limpa(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(regexp_replace(coalesce(p, ''),
    E'[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￰-￻\U000E0000-\U000E007F]', '', 'g'),
    E'[\\s   -     　]+', ' ', 'g')), '') $$;

-- Forma de comparar nomes: limpa, sem acento, minúscula ("José  da Silva" = "jose da silva").
create or replace function public._taf_acesso_norm(p text) returns text
language sql immutable set search_path = public as $$
  select lower(translate(coalesce(public._taf_acesso_limpa(p), ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')) $$;

-- Todas as obras do sistema (planejador ou ERP).
create or replace function public._taf_acesso_todas() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(t.x order by t.x), '{}')
    from (select o.obra as x from public.taf_ciclo_obra o union select e.codigo from public.taf_erp_obra e) t $$;

-- Obras que têm chave de Diretoria ativa.
create or replace function public._taf_acesso_cobertas() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct u.x order by u.x), '{}')
    from public.taf_ciclo_chave c cross join lateral unnest(c.obras) as u(x)
   where c.papel = 'diretoria' and c.ativo $$;

-- Diretoria com todas as obras: tem todas as obras que alguma Diretoria ativa tem.
create or replace function public._taf_acesso_geral(p_tipo text, p_papel text, p_obras text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_tipo = 'pessoal' and p_papel = 'diretoria' and public._taf_acesso_cobertas() <@ coalesce(p_obras, '{}'), false) $$;

-- Obras em que o ator cuida de acesso (revisão 2: vale para a Diretoria também).
--   Diretoria com todas as obras: todas as obras do sistema (inclusive obra nova, sem Diretoria ainda).
--   Diretoria limitada e gestor: as obras da própria chave.
--   Chave geral: todas (só serve na partida; fora dela a chave geral não cria nada).
create or replace function public._taf_acesso_escopo(p_tipo text, p_papel text, p_obras text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when p_tipo = 'geral' then public._taf_acesso_todas()
    when public._taf_acesso_geral(p_tipo, p_papel, p_obras) then
      array(select distinct u.x from unnest(public._taf_acesso_todas() || coalesce(p_obras, '{}')) as u(x) order by u.x)
    when p_tipo = 'pessoal' and p_papel in ('diretoria','gestor') then coalesce(p_obras, '{}')
    else '{}'::text[] end $$;

-- Quem está chamando. tipo 'pessoal' (taf_ciclo_chave ativa) ou 'geral' (chave do site, nome digitado).
-- A chave antiga do site (taf_pessoa_chave, a do engenheiro antigo) não cuida de acessos.
create or replace function public._taf_acesso_ator(p_chave text, p_quem text,
  out tipo text, out nome text, out papel text, out obras text[], out hash text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_h text := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex'); v_c public.taf_ciclo_chave; v_n int := 0;
begin
  select * into v_c from public.taf_ciclo_chave c where c.hash = v_h and c.ativo;
  if v_c.hash is not null then
    tipo := 'pessoal'; nome := coalesce(v_c.pessoa, v_c.nome); papel := v_c.papel; obras := v_c.obras; hash := v_c.hash; return;
  end if;
  if public._taf_ok(p_chave) then
    tipo := 'geral'; nome := nullif(left(regexp_replace(trim(coalesce(p_quem, '')), '\s+', ' ', 'g'), 60), '');
    papel := null; obras := null; hash := null; return;
  end if;
  if to_regclass('public.taf_pessoa_chave') is not null then
    execute 'select count(*) from public.taf_pessoa_chave where hash = $1' into v_n using v_h;
    if v_n > 0 then raise exception 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  end if;
  raise exception 'CHAVE INVALIDA';
end $$;

-- Papéis que o ator pode criar agora.
create or replace function public._taf_acesso_pode_criar(p_tipo text, p_papel text, p_partida boolean) returns text[]
language sql immutable as $$
  select case
    when p_tipo = 'pessoal' and p_papel = 'diretoria' then array['diretoria','gestor','engenheiro','encarregado','leitura']
    when p_tipo = 'pessoal' and p_papel = 'gestor'    then array['engenheiro','encarregado','leitura']
    when p_tipo = 'geral' and p_partida               then array['diretoria']
    else array[]::text[] end $$;

-- [integração] É a chave do robô do resumo (08_resumo.sql)? Sem o 08 aplicado, nunca.
create or replace function public._taf_acesso_e_robo(p_hash text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean := false;
begin
  if p_hash is null or to_regclass('public.taf_resumo_robo') is null then return false; end if;
  execute 'select exists (select 1 from public.taf_resumo_robo r where r.hash = $1)' into v using p_hash;
  return coalesce(v, false);
end $$;

-- Por que o ator NÃO pode desativar esta chave (null = pode).
create or replace function public._taf_acesso_bloqueio(p_tipo text, p_papel text, p_obras text[], p_hash text, p_c public.taf_ciclo_chave)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_cob text[]; v_robo boolean := false;
begin
  if p_c.hash is null then return 'CHAVE NAO ENCONTRADA'; end if;
  if not p_c.ativo then return 'CHAVE JA DESATIVADA'; end if;
  if p_tipo is distinct from 'pessoal' then return 'A CHAVE GERAL NAO DESATIVA ACESSO: ENTRE COM A SUA CHAVE PESSOAL'; end if;
  if p_papel not in ('diretoria','gestor') then return 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  if p_c.hash = p_hash then return 'NAO DESATIVE A PROPRIA CHAVE: PECA A OUTRA PESSOA DA DIRETORIA'; end if;
  if p_papel = 'gestor' and p_c.papel not in ('engenheiro','encarregado','leitura') then
    return 'SEM PERMISSAO: O GESTOR SO DESATIVA ENGENHEIRO, ENCARREGADO E LEITURA'; end if;
  -- revisão 2: a Diretoria também só desativa chave que está inteira dentro das obras que ela cuida
  if not (p_c.obras <@ public._taf_acesso_escopo(p_tipo, p_papel, p_obras)) then
    return 'SEM PERMISSAO: A CHAVE TEM OBRA FORA DAS SUAS'; end if;
  -- [integração] chave sem obra nenhuma (a do robô do resumo, do 08): lista vazia cabe no escopo de qualquer um; só a Diretoria
  -- com todas as obras desativa
  if cardinality(p_c.obras) = 0 and not public._taf_acesso_geral(p_tipo, p_papel, p_obras) then
    v_robo := public._taf_acesso_e_robo(p_c.hash);
    return case when v_robo then 'SEM PERMISSAO: CHAVE DO ROBO DO RESUMO, SO A DIRETORIA COM TODAS AS OBRAS DESATIVA (OU TROQUE NA TELA RESUMO PARA O DIRETOR)'
                else 'SEM PERMISSAO: CHAVE SEM OBRA, SO A DIRETORIA COM TODAS AS OBRAS DESATIVA' end; end if;
  if p_c.papel = 'diretoria' then
    if not exists (select 1 from public.taf_ciclo_chave c where c.papel = 'diretoria' and c.ativo and c.hash <> p_c.hash) then
      return 'ULTIMA CHAVE DE DIRETORIA ATIVA: CRIE OUTRA ANTES DE DESATIVAR ESTA'; end if;
    -- revisão 2: tem de sobrar uma Diretoria com todas as obras que as Diretorias têm hoje (contando esta)
    v_cob := public._taf_acesso_cobertas();
    if not exists (select 1 from public.taf_ciclo_chave c where c.papel = 'diretoria' and c.ativo and c.hash <> p_c.hash and c.obras @> v_cob) then
      return 'SEM OUTRA DIRETORIA COM TODAS AS OBRAS: CRIE ANTES OUTRA CHAVE DE DIRETORIA COM TODAS AS OBRAS'; end if;
  end if;
  return null;
end $$;

-- Avisos que não bloqueiam (nome do engenheiro, obra sem cronograma no planejador, pessoa com outra chave ativa).
-- p_hash = a própria chave (não conta como "outra").
drop function if exists public._taf_acesso_avisos(text, text, text[]);   -- versão antes da revisão 2 (sem p_hash)
create or replace function public._taf_acesso_avisos(p_papel text, p_pessoa text, p_obras text[], p_hash text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x.t order by x.o), '{}') from (
    select o.obra as o, format('Obra %s: o engenheiro no planejador é %s e esta chave está em nome de %s. As demandas, as áreas '
             || 'e as tarefas em nome do engenheiro não aparecem como desta pessoa. Use o mesmo nome ou peça para trocar o engenheiro da obra.',
             o.obra, o.engenheiro, coalesce(p_pessoa, '(sem pessoa)')) as t
      from public.taf_ciclo_obra o
     where p_papel = 'engenheiro' and o.obra = any(p_obras) and o.engenheiro is distinct from p_pessoa
    union all
    select u.x, format('Obra %s ainda sem cronograma no planejador: por enquanto não há o que %s nela.', u.x,
             case p_papel when 'engenheiro' then 'planejar nem apontar' else 'apontar' end)
      from unnest(p_obras) as u(x)
     where p_papel in ('engenheiro','encarregado') and not exists (select 1 from public.taf_ciclo_obra o where o.obra = u.x)
    union all
    select '~', format('%s tem %s chaves ativas. Se alguma é de celular antigo ou de quem saiu, desative a que não usa mais.', p_pessoa, d.n + 1)
      from (select count(*) as n from public.taf_ciclo_chave c
             where c.ativo and c.hash is distinct from p_hash and p_pessoa is not null
               and public._taf_acesso_norm(coalesce(c.pessoa, c.nome)) = public._taf_acesso_norm(p_pessoa)) d
     where d.n > 0
  ) x $$;

-- ===================================================================== 4. funções de entrada
-- Lista. Chave pessoal de Diretoria ou de gestor: as chaves pessoais que ela cuida ou que têm obra em comum com ela (sem o hash).
--   Diretoria com todas as obras: todas. Diretoria limitada e gestor: só as que têm obra em comum (as obras de fora não aparecem,
--   só quantas são); o gestor não vê as de Diretoria. A própria chave sempre aparece. [SUPOSIÇÃO: ver o LEIA-ME-06.]
-- Chave geral: só diz se está na partida (sem a lista). Outros papéis: recusa.
create or replace function public.taf_acesso_listar(p_chave text, p_quem text default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v_partida boolean; v_pode text[]; v_geral boolean; v_escopo text[]; v_cob text[];
begin
  select * into a from public._taf_acesso_ator(p_chave, p_quem);
  if a.tipo = 'pessoal' and a.papel not in ('diretoria','gestor') then
    raise exception 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  v_partida := not exists (select 1 from public.taf_ciclo_chave c where c.papel = 'diretoria' and c.ativo);
  v_pode := public._taf_acesso_pode_criar(a.tipo, a.papel, v_partida);
  v_geral := public._taf_acesso_geral(a.tipo, a.papel, a.obras);
  v_escopo := case when cardinality(v_pode) > 0 then public._taf_acesso_escopo(a.tipo, a.papel, a.obras) else '{}'::text[] end;
  v_cob := public._taf_acesso_cobertas();
  return jsonb_build_object(
    'ator', jsonb_build_object('tipo', a.tipo, 'nome', a.nome, 'papel', coalesce(a.papel, 'chave geral'), 'verificado', a.tipo = 'pessoal',
                               'id', public._taf_acesso_id(a.hash), 'geral', v_geral,
                               'obras', case when a.tipo = 'pessoal' then to_jsonb(a.obras) else '[]'::jsonb end),
    'partida', v_partida,
    'pode_criar', to_jsonb(v_pode),
    'sem_diretoria', case when v_geral then to_jsonb(array(select u.x from unnest(public._taf_acesso_todas()) as u(x)
                                                            where not (u.x = any(v_cob)) order by u.x)) else '[]'::jsonb end,
    'obras', (select coalesce(jsonb_agg(jsonb_build_object('codigo', x.cod, 'nome', coalesce(co.nome, eo.nome), 'engenheiro', co.engenheiro,
                                  'planejador', co.obra is not null, 'erp', eo.codigo is not null) order by x.cod), '[]'::jsonb)
                from (select o.obra as cod from public.taf_ciclo_obra o union select e.codigo from public.taf_erp_obra e) x
                left join public.taf_ciclo_obra co on co.obra = x.cod
                left join public.taf_erp_obra eo on eo.codigo = x.cod
               where x.cod = any(v_escopo)),
    'chaves', case when a.tipo = 'pessoal' then
      (select coalesce(jsonb_agg(jsonb_build_object(
          'id', i.id, 'nome', c.nome, 'pessoa', c.pessoa, 'papel', c.papel, 'obras', to_jsonb(v.obras),
          'outras_obras', cardinality(c.obras) - cardinality(v.obras),
          'ativo', c.ativo, 'criado_em', c.criado_em,
          'criado_por', (select l.quem from public.taf_acesso_log l where l.chave_id = i.id and l.acao = 'criar' order by l.id limit 1),
          'desativado_em', (select l.em from public.taf_acesso_log l where l.chave_id = i.id and l.acao = 'desativar' order by l.id desc limit 1),
          'desativado_por', (select l.quem from public.taf_acesso_log l where l.chave_id = i.id and l.acao = 'desativar' order by l.id desc limit 1),
          'sua', c.hash = a.hash,
          'robo', public._taf_acesso_e_robo(c.hash),
          'bloqueio', public._taf_acesso_bloqueio(a.tipo, a.papel, a.obras, a.hash, c),
          'avisos', to_jsonb(case when c.ativo then public._taf_acesso_avisos(c.papel, c.pessoa, v.obras, c.hash) else '{}'::text[] end))
        order by c.ativo desc, c.criado_em desc, c.nome), '[]'::jsonb)
         from public.taf_ciclo_chave c
        cross join lateral (select public._taf_acesso_id(c.hash) as id) i
        cross join lateral (select case when v_geral or c.hash = a.hash then c.obras
                                        else array(select u.x from unnest(c.obras) as u(x) where u.x = any(v_escopo) order by u.x) end as obras) v
        where v_geral or c.hash = a.hash or (c.obras && v_escopo and not (a.papel = 'gestor' and c.papel = 'diretoria')))
      else '[]'::jsonb end);
end $$;

-- Cria. A chave nasce aqui: prefixo legível tirado do nome da pessoa + 24 letras aleatórias (96 bits) em grupos de 4.
-- Só o sha256 fica gravado. O texto volta UMA vez, nesta resposta.
create or replace function public.taf_acesso_criar(p_chave text, p_nome text, p_pessoa text, p_papel text, p_obras text[],
                                                   p_quem text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a record; v_partida boolean; v_pode text[]; v_escopo text[]; v_cob text[]; v_nome text; v_pessoa text; v_obras text[]; v_o text;
        v_pref text; v_hex text; v_txt text; v_h text; v_id text; v_por text; v_i int := 0;
        v_ruim constant text := '[[:cntrl:]<>"`\\{}|]';
begin
  select * into a from public._taf_acesso_ator(p_chave, p_quem);
  if a.tipo = 'pessoal' and a.papel not in ('diretoria','gestor') then
    raise exception 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  if a.tipo = 'geral' and a.nome is null then raise exception 'INFORME SEU NOME'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_acesso'));        -- uma criação ou desativação por vez (a partida não cria duas)
  v_partida := not exists (select 1 from public.taf_ciclo_chave c where c.papel = 'diretoria' and c.ativo);
  v_pode := public._taf_acesso_pode_criar(a.tipo, a.papel, v_partida);
  if cardinality(v_pode) = 0 then
    raise exception 'A CHAVE GERAL NAO CRIA ACESSO: JA EXISTE CHAVE DE DIRETORIA. ENTRE COM A SUA CHAVE PESSOAL'; end if;
  if p_papel is null or not (p_papel = any(array['diretoria','gestor','engenheiro','encarregado','leitura'])) then
    raise exception 'PAPEL INVALIDO'; end if;
  if not (p_papel = any(v_pode)) then
    if a.tipo = 'geral' then raise exception 'NA PARTIDA A CHAVE GERAL SO CRIA A PRIMEIRA CHAVE DE DIRETORIA'; end if;
    raise exception 'SEM PERMISSAO: % NAO CRIA CHAVE DE %', upper(a.papel), upper(p_papel);
  end if;
  v_escopo := public._taf_acesso_escopo(a.tipo, a.papel, a.obras);

  -- revisão 2: tira os invisíveis e junta os espaços antes de validar e de comparar
  v_pessoa := public._taf_acesso_limpa(p_pessoa);
  v_nome := coalesce(public._taf_acesso_limpa(p_nome), v_pessoa);
  if v_pessoa is null and p_papel <> 'leitura' then raise exception 'INFORME A PESSOA'; end if;
  if v_nome is null then raise exception 'INFORME O NOME DA CHAVE'; end if;
  if length(v_nome) not between 3 and 60 then raise exception 'NOME DA CHAVE: DE 3 A 60 LETRAS'; end if;
  if v_pessoa is not null and length(v_pessoa) not between 2 and 60 then raise exception 'NOME DA PESSOA: DE 2 A 60 LETRAS'; end if;
  if v_nome ~ v_ruim or coalesce(v_pessoa, '') ~ v_ruim then raise exception 'NOME COM SINAL QUE NAO PODE (< > " ` \ { } |)'; end if;
  if v_nome !~ '[[:alnum:]].*[[:alnum:]]' then raise exception 'NOME DA CHAVE: USE AO MENOS 2 LETRAS OU NUMEROS'; end if;
  if v_pessoa !~ '[[:alnum:]].*[[:alnum:]]' then raise exception 'NOME DA PESSOA: USE AO MENOS 2 LETRAS OU NUMEROS'; end if;
  if exists (select 1 from public.taf_ciclo_chave c where c.ativo and public._taf_acesso_norm(c.nome) = public._taf_acesso_norm(v_nome)) then
    raise exception 'JA EXISTE CHAVE ATIVA COM O NOME %: USE OUTRO NOME OU DESATIVE A ANTIGA', v_nome; end if;

  select coalesce(array_agg(distinct trim(x) order by trim(x)), '{}') into v_obras
    from unnest(coalesce(p_obras, '{}'::text[])) as u(x) where nullif(trim(x), '') is not null;
  if cardinality(v_obras) = 0 then raise exception 'ESCOLHA AO MENOS UMA OBRA'; end if;
  if cardinality(v_obras) > 60 then raise exception 'OBRAS DEMAIS NUMA CHAVE'; end if;
  foreach v_o in array v_obras loop
    if v_o !~ '^\d{3}$' or not (exists (select 1 from public.taf_ciclo_obra o where o.obra = v_o)
                                 or exists (select 1 from public.taf_erp_obra e where e.codigo = v_o)) then
      raise exception 'OBRA % NAO EXISTE', v_o; end if;
    -- revisão 2: vale para a Diretoria também (a limitada só cria nas obras dela)
    if not (v_o = any(v_escopo)) then
      raise exception 'SEM ACESSO A OBRA %: SO CRIA ACESSO NAS OBRAS QUE A SUA CHAVE CUIDA', v_o; end if;
  end loop;
  -- revisão 2: a primeira chave de Diretoria de uma obra nova tem de ter também todas as obras que já têm Diretoria,
  -- para sempre sobrar uma Diretoria com todas as obras
  if p_papel = 'diretoria' and a.tipo = 'pessoal' then
    v_cob := public._taf_acesso_cobertas();
    if not (v_obras <@ v_cob) and not (v_cob <@ v_obras) then
      raise exception 'OBRA SEM DIRETORIA (%): A PRIMEIRA CHAVE DE DIRETORIA DELA TEM DE TER TAMBEM AS OBRAS %',
        array_to_string(array(select u.x from unnest(v_obras) as u(x) where not (u.x = any(v_cob)) order by u.x), ', '),
        array_to_string(v_cob, ', ');
    end if;
  end if;
  -- revisão 2: não cria chave em nome de quem já tem chave ativa que o criador não cuida (papel acima ou obra fora)
  if a.tipo = 'pessoal' and exists (
       select 1 from public.taf_ciclo_chave c
        where c.ativo and public._taf_acesso_norm(coalesce(c.pessoa, c.nome)) = public._taf_acesso_norm(coalesce(v_pessoa, v_nome))
          and not (c.papel = any(v_pode) and c.obras <@ v_escopo)) then
    raise exception 'A PESSOA % JA TEM CHAVE QUE VOCE NAO CUIDA: PECA A DIRETORIA', coalesce(v_pessoa, v_nome);
  end if;

  v_pref := lower(translate(split_part(coalesce(v_pessoa, v_nome), ' ', 1),
              'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'));
  v_pref := left(regexp_replace(v_pref, '[^a-z]', '', 'g'), 12);
  if length(v_pref) < 2 then v_pref := 'taf'; end if;
  loop
    v_i := v_i + 1;
    if v_i > 20 then raise exception 'NAO CONSEGUI GERAR A CHAVE: TENTE DE NOVO'; end if;
    v_hex := encode(extensions.gen_random_bytes(12), 'hex');
    v_txt := v_pref || '-' || array_to_string(array(select substr(v_hex, g * 4 + 1, 4) from generate_series(0, 5) g), '-');
    v_h := encode(extensions.digest(v_txt, 'sha256'), 'hex');
    v_id := public._taf_acesso_id(v_h);
    exit when not exists (select 1 from public.taf_ciclo_chave c where public._taf_acesso_id(c.hash) = v_id)
          and not public._taf_ok(v_txt);
  end loop;

  v_por := case when a.tipo = 'geral' then a.nome || ' (chave geral)' else a.nome end;
  insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras, ativo)
  values (v_h, v_nome, v_pessoa, p_papel, v_obras, true);
  insert into public.taf_acesso_log (acao, chave_id, nome, pessoa, papel, obras, motivo, quem, quem_papel, verificado)
  values ('criar', v_id, v_nome, v_pessoa, p_papel, v_obras,
          case when a.tipo = 'geral' then 'partida: primeira chave de Diretoria' end,
          v_por, coalesce(a.papel, 'chave geral'), a.tipo = 'pessoal');
  return jsonb_build_object('ok', true, 'id', v_id, 'chave', v_txt, 'nome', v_nome, 'pessoa', v_pessoa, 'papel', p_papel,
                            'obras', to_jsonb(v_obras), 'partida', a.tipo = 'geral', 'criado_por', v_por,
                            'avisos', to_jsonb(public._taf_acesso_avisos(p_papel, v_pessoa, v_obras, v_h)));
end $$;

-- Desativa (não apaga: a linha fica, com ativo = false, e o registro diz quem e quando).
create or replace function public.taf_acesso_desativar(p_chave text, p_id text, p_motivo text default null, p_quem text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a record; v_n int; v_c public.taf_ciclo_chave; v_b text; v_mot text := nullif(left(trim(coalesce(p_motivo, '')), 300), '');
begin
  select * into a from public._taf_acesso_ator(p_chave, p_quem);
  if a.tipo = 'geral' then raise exception 'A CHAVE GERAL NAO DESATIVA ACESSO: ENTRE COM A SUA CHAVE PESSOAL'; end if;
  if a.papel not in ('diretoria','gestor') then raise exception 'SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'; end if;
  if coalesce(p_id, '') !~ '^[0-9a-f]{10}$' then raise exception 'IDENTIFICADOR INVALIDO'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_acesso'));
  select count(*) into v_n from public.taf_ciclo_chave c where public._taf_acesso_id(c.hash) = p_id;
  if v_n = 0 then raise exception 'CHAVE NAO ENCONTRADA'; end if;
  if v_n > 1 then raise exception 'IDENTIFICADOR REPETIDO: DESATIVE PELO BANCO'; end if;
  select * into v_c from public.taf_ciclo_chave c where public._taf_acesso_id(c.hash) = p_id for update;
  v_b := public._taf_acesso_bloqueio(a.tipo, a.papel, a.obras, a.hash, v_c);
  if v_b is not null then raise exception '%', v_b; end if;
  update public.taf_ciclo_chave c set ativo = false where c.hash = v_c.hash;
  -- [integração] desativou a chave do robô do resumo: o Resumo para o diretor passa a mostrar que não há robô (gerar outro lá)
  if public._taf_acesso_e_robo(v_c.hash) then
    execute 'update public.taf_resumo_robo set ativo = false, desativado_em = now() where hash = $1 and ativo' using v_c.hash;
  end if;
  insert into public.taf_acesso_log (acao, chave_id, nome, pessoa, papel, obras, motivo, quem, quem_papel, verificado)
  values ('desativar', p_id, v_c.nome, v_c.pessoa, v_c.papel, v_c.obras, v_mot, a.nome, a.papel, true);
  return jsonb_build_object('ok', true, 'id', p_id, 'nome', v_c.nome, 'pessoa', v_c.pessoa, 'papel', v_c.papel, 'desativado_por', a.nome);
end $$;

-- ===================================================================== 5. planejador: o encarregado só aponta
-- Cópia inteira da versão atual (fonte/ciclo/sql/02_funcoes.sql). Mudou só a linha marcada "06".
create or replace function public._taf_ciclo_pode(p_papel text, p_acao text) returns boolean
language sql immutable as $$
  select case p_papel
    -- "O Felipe nunca escreve o plano semanal" [FLUXO L73]: gestor decide, cobra, dá de acordo e reabre
    when 'gestor' then p_acao = any(array['demanda','demanda_resp','cobrar','impacto','acordo','reabrir'])
    when 'engenheiro' then p_acao = any(array['preparo','preparo_ok','comp','comp_tirar','comp_cancelar','fora','publicar',
      'apont','apont_lote','apont_apagar','real','fechar_item','fechar_semana','replan','efeito','saldo',
      'demanda','demanda_resp','cobrar','impacto'])
    when 'diretoria' then p_acao = any(array['demanda','demanda_resp','cobrar','impacto','acordo'])
    when 'encarregado' then p_acao = any(array['apont','apont_lote','apont_apagar'])   -- 06: encarregado só aponta o dia
    else false end $$;

-- ===================================================================== 6. permissões
-- Só as três funções de entrada ficam chamáveis pelo site; as internas e as tabelas ficam fechadas
-- (o Supabase dá execute por padrão a quem cria função em public).
revoke all on function public._taf_acesso_log_trava(), public._taf_acesso_segredo_trava(), public._taf_acesso_id(text),
  public._taf_acesso_limpa(text), public._taf_acesso_norm(text), public._taf_acesso_todas(), public._taf_acesso_cobertas(),
  public._taf_acesso_geral(text, text, text[]), public._taf_acesso_escopo(text, text, text[]),
  public._taf_acesso_ator(text, text), public._taf_acesso_pode_criar(text, text, boolean),
  public._taf_acesso_bloqueio(text, text, text[], text, public.taf_ciclo_chave), public._taf_acesso_avisos(text, text, text[], text),
  public._taf_acesso_e_robo(text), public._taf_ciclo_pode(text, text) from public, anon, authenticated;
revoke all on function public.taf_acesso_listar(text, text), public.taf_acesso_criar(text, text, text, text, text[], text),
  public.taf_acesso_desativar(text, text, text, text) from public;
grant execute on function public.taf_acesso_listar(text, text), public.taf_acesso_criar(text, text, text, text, text[], text),
  public.taf_acesso_desativar(text, text, text, text) to anon, authenticated;
reset lock_timeout;

-- ===================================================================== desfazer (manual, na ordem)
-- 1. Encarregado volta a não apontar: rodar de novo, de fonte/ciclo/sql/02_funcoes.sql, só o bloco
--    "create or replace function public._taf_ciclo_pode(...)" (e o revoke dele: revoke all on function public._taf_ciclo_pode(text, text) from public, anon, authenticated;).
-- 2. drop function public.taf_acesso_listar(text, text);
--    drop function public.taf_acesso_criar(text, text, text, text, text[], text);
--    drop function public.taf_acesso_desativar(text, text, text, text);
--    drop function public._taf_acesso_avisos(text, text, text[], text);
--    drop function public._taf_acesso_bloqueio(text, text, text[], text, public.taf_ciclo_chave);
--    drop function public._taf_acesso_e_robo(text);
--    drop function public._taf_acesso_pode_criar(text, text, boolean);
--    drop function public._taf_acesso_ator(text, text);
--    drop function public._taf_acesso_escopo(text, text, text[]);
--    drop function public._taf_acesso_geral(text, text, text[]);
--    drop function public._taf_acesso_cobertas();
--    drop function public._taf_acesso_todas();
--    drop function public._taf_acesso_norm(text);
--    drop function public._taf_acesso_limpa(text);
--    drop function public._taf_acesso_id(text);
-- 3. Registro: guardar uma cópia antes, FORA do banco aberto ao site (o resultado salvo em arquivo fora do repositório:
--      select jsonb_agg(to_jsonb(l) order by l.id) from public.taf_acesso_log l;
--    nunca "create table public.taf_acesso_log_copia as select": tabela nova em public pode nascer aberta ao site, ver o LEIA-ME-06), depois
--    drop table public.taf_acesso_log; drop function public._taf_acesso_log_trava();
--    drop table public.taf_acesso_segredo; drop function public._taf_acesso_segredo_trava();
--    (sem o segredo, os identificadores do registro copiado não batem mais com as chaves: guarde a cópia junto com a data)
-- 4. Papel: [integração] nada se apaga de taf_ciclo_chave. Se existir chave de encarregado, avisar a pessoa e só DESATIVAR
--    (antes do passo 3, para ficar no registro):
--      insert into public.taf_acesso_log (acao, chave_id, nome, pessoa, papel, obras, motivo, quem, quem_papel, verificado)
--      select 'desativar', public._taf_acesso_id(c.hash), c.nome, c.pessoa, c.papel, c.obras, 'desfazer do 06', 'Felipe (SQL)', 'banco', false
--        from public.taf_ciclo_chave c where c.papel = 'encarregado' and c.ativo;
--      update public.taf_ciclo_chave set ativo = false where papel = 'encarregado' and ativo;
--    A regra de papel pode continuar aceitando 'encarregado': com o _taf_ciclo_pode do passo 1 o encarregado não faz nada no
--    planejador, e no ERP a chave desativada não entra. Só se quiser mesmo a regra antiga, trocar o papel em vez de apagar:
--      update public.taf_ciclo_chave set papel = 'leitura', ativo = false where papel = 'encarregado';
--      alter table public.taf_ciclo_chave drop constraint taf_ciclo_chave_papel_check;
--      alter table public.taf_ciclo_chave add constraint taf_ciclo_chave_papel_check check (papel in ('engenheiro','gestor','diretoria','leitura'));
-- As chaves criadas pela tela continuam valendo depois do desfazer (são linhas comuns de taf_ciclo_chave). Para tirar uma
-- (antes do passo 2, enquanto _taf_acesso_id existe):
--    update public.taf_ciclo_chave set ativo = false where public._taf_acesso_id(hash) = '<id da tela>';

-- ======================================================== 07_ia.sql
-- 07 (IA): limite de uso do assistente (/api/assistente), por chave, por obra e por ação, contado por dia.
-- RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar (07_teste_999.sql, obra 999 fictícia).
-- Fora do horário de uso, o arquivo inteiro de uma vez: psql -1 -v ON_ERROR_STOP=1 -f 07_ia.sql
--
-- Para que serve: o assistente lê o relato do WhatsApp e propõe os apontamentos da semana (ação 'relato'), ou responde
-- uma pergunta sobre a situação da obra (ação 'pergunta'). Cada chamada custa dinheiro na conta da IA. Antes de chamar a IA,
-- o endpoint chama taf_ia_contar, que:
--   1. confere a chave e o acesso à obra pelas mesmas regras do planejador (_taf_ciclo_ator: chave pessoal com papel fixo,
--      chave geral com nome declarado, chave pessoal do site para o engenheiro da obra);
--   2. confere se o papel pode a ação: 'relato' só quem aponta (_taf_ciclo_pode(papel, 'apont'), hoje só o engenheiro);
--      'pergunta' engenheiro, gestor e diretoria (a chave só de leitura não gasta IA);
--   3. soma o uso do dia (dia de Brasília) daquela chave em todas as obras e ações e recusa acima do limite
--      (padrão 30 por chave por dia, em taf_ia_param, nome 'limite_dia'; 0 desliga a IA pelo banco);
--   4. conta mais um e devolve quanto já usou e quanto resta.
-- O que fica gravado: só o dia, o hash da chave (nunca a chave), a obra, a ação e o número de chamadas. Nada do relato,
-- da pergunta, da resposta nem de nome de pessoa.
-- O endpoint não grava apontamento nenhum: quem grava é a pessoa, pela tela, pelo caminho que já existe (taf_ciclo_salvar).
--
-- Não muda nenhuma função nem tabela que já existe. Objetos novos: taf_ia_param, taf_ia_uso, taf_ia_contar.
-- O nome começa com taf_ia_ (e não taf_ciclo_) de propósito: o laço de permissões do fim do 02_funcoes.sql revoga o execute
-- de toda função taf_ciclo_* que não está na lista dele; se o 02 for rodado de novo, esta função continua aberta.
-- Depende de: _taf_ciclo_ator, _taf_ciclo_pode, _taf_ciclo_hoje (fonte/ciclo/sql/02_funcoes.sql) e da extensão pgcrypto
-- no esquema extensions (já usada pelo planejador).
--
-- Ajustar o limite (hoje só por SQL, uma linha):
--   update public.taf_ia_param set valor = 50, em = now(), quem = 'Felipe' where nome = 'limite_dia';

-- ===================================================================== tabelas
create table if not exists public.taf_ia_param (
  nome  text primary key check (nome in ('limite_dia')),
  valor int  not null check (valor between 0 and 1000),
  obs   text check (length(obs) <= 300),
  em    timestamptz not null default now(),
  quem  text check (length(quem) <= 60)
);
insert into public.taf_ia_param (nome, valor, obs, quem)
values ('limite_dia', 30, 'chamadas da IA por chave por dia (todas as obras e ações somadas); 0 desliga', 'padrão')
on conflict (nome) do nothing;

create table if not exists public.taf_ia_uso (
  dia       date not null,                                   -- dia de Brasília
  hash      text not null check (hash ~ '^[0-9a-f]{64}$'),   -- SHA-256 da chave; a chave nunca é gravada
  obra      text not null check (obra ~ '^\d{3}$'),
  acao      text not null check (acao in ('relato','pergunta')),
  n         int  not null default 0 check (n >= 0),
  primeiro_em timestamptz not null default now(),
  ultimo_em   timestamptz not null default now(),
  primary key (dia, hash, obra, acao)
);
create index if not exists taf_ia_uso_hash_dia on public.taf_ia_uso (hash, dia);

alter table public.taf_ia_param enable row level security;
alter table public.taf_ia_uso enable row level security;
revoke all on public.taf_ia_param from public, anon, authenticated;
revoke all on public.taf_ia_uso from public, anon, authenticated;

-- ===================================================================== função de entrada
-- p_acao: 'relato' (ler o relato do WhatsApp) ou 'pergunta' (perguntar sobre a situação da obra).
-- Erros (a mensagem é o que o endpoint lê): OBRA INVALIDA, SEM ACESSO A OBRA, CHAVE INVALIDA (de _taf_ciclo_ator),
-- ACAO DA IA INVALIDA, SEM PERMISSAO: <PAPEL> NAO PODE USAR A IA PARA <ACAO>, IA DESLIGADA NO BANCO,
-- LIMITE DO DIA DA IA: <usado> DE <limite>.
create or replace function public.taf_ia_contar(p_chave text, p_obra text, p_acao text, p_quem text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_a record; v_h text; v_dia date; v_lim int; v_usado int;
begin
  if p_acao is null or p_acao not in ('relato','pergunta') then raise exception 'ACAO DA IA INVALIDA'; end if;
  select * into v_a from public._taf_ciclo_ator(p_chave, p_obra, p_quem);    -- levanta OBRA INVALIDA, SEM ACESSO A OBRA, CHAVE INVALIDA
  if (p_acao = 'relato' and not public._taf_ciclo_pode(v_a.papel, 'apont'))
     or (p_acao = 'pergunta' and v_a.papel not in ('engenheiro','gestor','diretoria')) then
    raise exception 'SEM PERMISSAO: % NAO PODE USAR A IA PARA %', upper(coalesce(v_a.papel, '?')), upper(p_acao);
  end if;
  v_h := encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex');
  v_dia := public._taf_ciclo_hoje();
  select p.valor into v_lim from public.taf_ia_param p where p.nome = 'limite_dia';
  v_lim := coalesce(v_lim, 30);
  if v_lim = 0 then raise exception 'IA DESLIGADA NO BANCO'; end if;
  -- uma conta por vez para a mesma chave: duas chamadas juntas não passam do limite
  perform pg_advisory_xact_lock(hashtext('taf_ia_contar'), hashtext(v_h));
  select coalesce(sum(u.n), 0) into v_usado from public.taf_ia_uso u where u.hash = v_h and u.dia = v_dia;
  if v_usado >= v_lim then raise exception 'LIMITE DO DIA DA IA: % DE %', v_usado, v_lim; end if;
  insert into public.taf_ia_uso as u (dia, hash, obra, acao, n) values (v_dia, v_h, p_obra, p_acao, 1)
  on conflict (dia, hash, obra, acao) do update set n = u.n + 1, ultimo_em = now();
  return jsonb_build_object('ok', true, 'acao', p_acao, 'obra', p_obra, 'dia', v_dia, 'papel', v_a.papel,
                            'usado', v_usado + 1, 'limite', v_lim, 'resta', v_lim - v_usado - 1);
end $$;

-- ===================================================================== permissões
-- Só taf_ia_contar é chamável de fora (o site chama com a chave publicável, como o resto). As tabelas ficam fechadas.
revoke all on function public.taf_ia_contar(text, text, text, text) from public, anon, authenticated;
grant execute on function public.taf_ia_contar(text, text, text, text) to anon, authenticated;

-- ===================================================================== desfazer (manual)
-- drop function if exists public.taf_ia_contar(text, text, text, text);
-- drop table if exists public.taf_ia_uso;
-- drop table if exists public.taf_ia_param;
-- (O endpoint sem a função responde "o banco ainda não tem o limite da IA" e não chama a IA.)

-- ======================================================== 08_resumo.sql
-- 08_resumo.sql · RESUMO AUTOMÁTICO PARA O DIRETOR (item 5): e-mail no horário com o BI de cada obra.
-- RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar.
-- Fora do horário de uso, o arquivo inteiro de uma vez: psql -1 -v ON_ERROR_STOP=1 -f 08_resumo.sql
-- Teste na obra 999 (fictícia): fonte/erp/sql/08_teste_resumo.sql (roda numa transação e desfaz tudo no fim).
--
-- O que faz
--  1. taf_resumo_dest: quem recebe o resumo por e-mail (nome, e-mail, obras ou todas, diária ou semanal, ativo, quem cadastrou).
--     Nada se apaga: desativar guarda a linha; cada mudança guarda a versão anterior em taf_resumo_dest_hist.
--     Cadastro com dono ("É o meu e-mail"): só o dono ou a Diretoria editam ou desativam; se outra pessoa troca o e-mail,
--     o cadastro deixa de ter dono (o "Mandar agora para mim" do dono não vai para o endereço novo).
--  2. taf_resumo_envio: cada e-mail reservado, mandado ou com erro. Um por destinatário por dia (semanal: um por semana);
--     o envio de teste ("Mandar agora para mim") fica à parte, com limite de 5 por pessoa por dia, e leva só as obras
--     da chave que também estão no cadastro.
--  3. taf_resumo_robo: qual chave é a do robô que manda o e-mail. É uma chave pessoal de papel leitura, sem obra nenhuma
--     (não abre ERP nem planejador); só serve para estas funções. Ela é criada pela tela (taf_resumo_robo_gerar) e aparece uma vez.
--  4. _taf_resumo_obra: o resumo de uma obra juntando o planejador e o ERP, com as funções que já existem:
--     _taf_ciclo_situacao (luzes, frase, última semana fechada, EVENTOs em risco), _taf_ciclo_resumo (semana atual),
--     _taf_ciclo_prazos, as demandas abertas, os apontamentos e _taf_erp_valores (licitado, meta, comprometido, realizado).
--     Vazio não é zero: o que não tem dado sai null e o e-mail escreve "sem dado".
--     O motivo de cada luz é o do indicador que deu a cor (P2/P3/P4 na produção, P6/P8/P10 no plano).
--     A parte do planejador segue a regra do planejador: a chave do site só vê a obra de que é o engenheiro.
--
-- Funções de entrada (as únicas chamáveis pela API):
--   taf_resumo_destinatarios, taf_resumo_destinatario_salvar, taf_resumo_destinatario_desativar
--        só chave pessoal de Diretoria ou gestor (com a chave geral do site não: ninguém manda e-mail para qualquer endereço).
--        Só cadastra as obras da própria chave; "todas" só quem tem todas as obras na chave, ou a Diretoria com todas as obras
--        (a regra do 06: tem todas as obras que alguma Diretoria ativa tem), que cobre também obra nova ainda fora das chaves.
--   taf_resumo_robo_gerar      Diretoria com todas as obras, ou gestor com todas na chave: cria a chave do robô (a anterior para de valer).
--   taf_resumo_previa          qualquer chave pessoal: as obras da prévia e, com p_enviar, reserva o teste para o próprio e-mail.
--   taf_resumo_obra            robô, ou chave pessoal com acesso à obra: o resumo de uma obra (planejador só com acesso ao planejador).
--   taf_resumo_montar          só o robô: reserva os envios do dia e devolve, por destinatário, as obras dele
--                              (até 100; quem não recebeu da última vez vai primeiro).
--   taf_resumo_registrar       robô, ou a própria pessoa no envio de teste: grava se o e-mail saiu.
-- O resumo de cada obra sai numa chamada à parte (taf_resumo_obra) porque o Supabase corta em poucos segundos a chamada
-- feita com a chave publicável; uma obra por chamada fica dentro do limite mesmo com muitas obras.
--
-- Precisa de: supabase/schema.sql (_taf_ok), fonte/ciclo/sql 01 a 04, fonte/erp/sql/01_erp.sql e 02_rastro.sql.
-- Não muda nenhuma tabela nem função que já existe. Só cria objetos taf_resumo_* e _taf_resumo_*.
-- Tudo idempotente: pode rodar de novo (a versão antiga de _taf_resumo_obra, com um parâmetro só, é trocada pela nova).

-- ===================================================================== tabelas
create table if not exists public.taf_resumo_dest (
  id             bigint generated always as identity primary key,
  nome           text not null check (length(trim(nome)) between 2 and 80),
  email          text not null check (length(email) <= 200
                   and email ~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$'),
  obras          text[] check (obras is null or cardinality(obras) between 1 and 50),   -- null = todas as obras
  frequencia     text not null check (frequencia in ('diaria','semanal')),
  ativo          boolean not null default true,
  pessoa         text,              -- dono da chave pessoal que pode usar "Mandar agora para mim" neste e-mail (só a própria pessoa marca)
  cadastrado_por text not null,
  cadastrado_em  timestamptz not null default now(),
  atualizado_por text,
  atualizado_em  timestamptz
);
create unique index if not exists taf_resumo_dest_1x on public.taf_resumo_dest (lower(email), frequencia) where ativo;

create table if not exists public.taf_resumo_dest_hist (
  hid        bigint generated always as identity primary key,
  dest       bigint not null,
  dados      jsonb not null,
  trocado_em timestamptz not null default now()
);

create table if not exists public.taf_resumo_envio (
  id            bigint generated always as identity primary key,
  dest          bigint not null references public.taf_resumo_dest(id),
  quando        text not null check (quando in ('diario','semanal','teste')),
  dia           date not null,                   -- dia do envio (semanal: a segunda da semana)
  estado        text not null default 'reservado' check (estado in ('reservado','enviado','erro')),
  tentativas    int not null default 1,
  pedido_por    text not null,                   -- 'robô' ou a pessoa que pediu o teste
  email         text not null,                   -- endereço usado neste envio
  obras         text[] not null default '{}',
  id_externo    text check (length(id_externo) <= 100),   -- id do e-mail no Resend
  erro          text check (length(erro) <= 300),
  em            timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists taf_resumo_envio_1x on public.taf_resumo_envio (dest, quando, dia) where quando <> 'teste';
create index if not exists taf_resumo_envio_dest on public.taf_resumo_envio (dest, id);

create table if not exists public.taf_resumo_robo (
  hash          text primary key check (hash ~ '^[0-9a-f]{64}$'),   -- o mesmo hash da linha em taf_ciclo_chave
  ativo         boolean not null default true,
  criado_por    text not null,
  criado_em     timestamptz not null default now(),
  desativado_em timestamptz
);

-- Destinatário não se apaga (desativa) e toda mudança guarda a versão anterior.
create or replace function public._taf_resumo_dest_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'DESTINATARIO NAO SE APAGA: DESATIVE'; end if;
  insert into public.taf_resumo_dest_hist (dest, dados) values (old.id, to_jsonb(old));
  return new;
end $$;
drop trigger if exists taf_resumo_dest_trg on public.taf_resumo_dest;
create trigger taf_resumo_dest_trg before update or delete on public.taf_resumo_dest
  for each row execute function public._taf_resumo_dest_trg();

-- Acesso: igual às outras taf_* (RLS ligada, sem política, sem grant; só se entra pelas funções).
do $$ declare t text; s text; begin
  foreach t in array array['taf_resumo_dest','taf_resumo_dest_hist','taf_resumo_envio','taf_resumo_robo'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    if t <> 'taf_resumo_robo' then
      s := pg_get_serial_sequence('public.' || t, case when t = 'taf_resumo_dest_hist' then 'hid' else 'id' end);
      if s is not null then execute 'revoke all on sequence ' || s || ' from public, anon, authenticated'; end if;
    end if;
  end loop;
end $$;

-- ===================================================================== apoio (internas)
-- Todas as obras que existem (planejador ou ERP), em ordem.
create or replace function public._taf_resumo_todas() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x order by x), '{}') from (
    select o.obra as x from public.taf_ciclo_obra o union select e.codigo from public.taf_erp_obra e) u $$;

-- A chave (obras do ator; null = todas) cobre estas obras (null = todas)?
create or replace function public._taf_resumo_cobre(p_ator text[], p_obras text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select p_ator is null or coalesce(p_obras, public._taf_resumo_todas()) <@ p_ator $$;

-- [integração] Diretoria com todas as obras, a mesma regra do 06 (Acessos): a chave tem todas as obras que alguma Diretoria ativa
-- tem. Ela cobre todas as obras do sistema, inclusive obra que entrou depois e ainda não está em chave de Diretoria nenhuma
-- (importada, criada pelo gestor ou pela chave geral). Antes "todas" era ter na chave todas as obras do sistema: uma obra nova
-- tirava da Diretoria os cadastros "todas as obras" e a chave do robô, sem ninguém mais poder mexer neles.
create or replace function public._taf_resumo_dir_todas(p_obras text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select p_obras is not null and cardinality(p_obras) > 0
     and coalesce((select array_agg(distinct u.x) from public.taf_ciclo_chave c cross join lateral unnest(c.obras) as u(x)
                    where c.papel = 'diretoria' and c.ativo), '{}') <@ p_obras $$;

-- f***@dominio: para mostrar na tela de quem não cadastrou.
create or replace function public._taf_resumo_mascara(p_email text) returns text
language sql immutable as $$
  select left(split_part(p_email, '@', 1), 1) || '***@' || split_part(p_email, '@', 2) $$;

-- Quem cadastra: só chave pessoal de Diretoria ou gestor (a do robô é de leitura e também não serve).
create or replace function public._taf_resumo_gestor(p_chave text, out nome text, out papel text, out obras text[])
language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  if p_chave is null or length(p_chave) > 200 then raise exception 'CHAVE INVALIDA'; end if;
  select * into a from public._taf_erp_ator(p_chave, null, null);    -- levanta CHAVE INVALIDA
  if not a.fixo then raise exception 'USE SUA CHAVE PESSOAL'; end if;
  if a.leitura or a.papel not in ('gestao', 'diretoria') then raise exception 'SO DIRETORIA OU GESTOR'; end if;
  nome := a.nome; papel := a.papel;
  -- [integração] Diretoria com todas as obras cobre todas (null), como em Acessos; gestor e Diretoria limitada: as da chave
  obras := case when a.papel = 'diretoria' and public._taf_resumo_dir_todas(a.obras) then null else a.obras end;
end $$;

-- É a chave do robô? (ativa nas duas tabelas e de leitura)
create or replace function public._taf_resumo_e_robo(p_chave text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select p_chave is not null and length(p_chave) <= 200 and exists (
    select 1 from public.taf_resumo_robo r join public.taf_ciclo_chave c on c.hash = r.hash
     where r.hash = encode(extensions.digest(p_chave, 'sha256'), 'hex') and r.ativo and c.ativo and c.papel = 'leitura') $$;

-- Quem pede prévia ou resumo de obra: chave pessoal (do planejador ou do site). Devolve nome e obras dela.
create or replace function public._taf_resumo_pessoal(p_chave text, out nome text, out papel text, out obras text[], out leitura boolean)
language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  if p_chave is null or length(p_chave) > 200 then raise exception 'CHAVE INVALIDA'; end if;
  select * into a from public._taf_erp_ator(p_chave, null, null);
  if not a.fixo then raise exception 'USE SUA CHAVE PESSOAL'; end if;
  nome := a.nome; papel := a.papel; obras := coalesce(a.obras, public._taf_resumo_todas()); leitura := a.leitura;
end $$;

-- Dias úteis (sem sábado, domingo e feriado; facultativo conta como útil) depois de p_de e antes de p_ate.
create or replace function public._taf_resumo_uteis_entre(p_obra text, p_de date, p_ate date) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from generate_series(p_de + 1, p_ate - 1, interval '1 day') g
   where extract(isodow from g) < 6
     and not exists (select 1 from public.taf_ciclo_feriado h where h.obra in ('*', p_obra)
                                                        and h.data = g::date and h.abrangencia <> 'FACULTATIVO') $$;

-- Uma linha de destinatário para a tela.
create or replace function public._taf_resumo_dest_json(d public.taf_resumo_dest, p_quem text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', d.id, 'nome', d.nome, 'email', d.email, 'obras', to_jsonb(d.obras), 'todas', d.obras is null,
    'frequencia', d.frequencia, 'ativo', d.ativo, 'meu', d.pessoa is not null and d.pessoa = p_quem, 'tem_dono', d.pessoa is not null,
    'cadastrado_por', d.cadastrado_por, 'cadastrado_em', d.cadastrado_em, 'atualizado_por', d.atualizado_por, 'atualizado_em', d.atualizado_em,
    'ultimo', (select jsonb_build_object('quando', e.quando, 'dia', e.dia, 'estado', e.estado, 'em', e.atualizado_em, 'erro', e.erro)
                 from public.taf_resumo_envio e where e.dest = d.id order by e.id desc limit 1),
    -- o último e-mail do horário (não o de teste) não saiu: a tela avisa
    'falhou', d.ativo and coalesce((select e.estado = 'erro' or (e.estado = 'reservado' and e.atualizado_em < now() - interval '30 minutes')
                                     from public.taf_resumo_envio e where e.dest = d.id and e.quando <> 'teste' order by e.id desc limit 1), false)) $$;

-- ===================================================================== o resumo de uma obra
-- Uma luz da Situação do Ciclo (produção ou plano) com o motivo de quem deu a cor: os indicadores (P2, P8...) que estão
-- na mesma cor da luz, em ordem. Assim o motivo nunca contradiz a cor (ex.: plano VERMELHO por P8, com P6 VERDE).
create or replace function public._taf_resumo_luz(p_luz jsonb, p_ind text[]) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('cor', p_luz ->> 'cor',
    'motivo', (select string_agg(p_luz #>> array[i, 'motivo'], '; ' order by k) from unnest(p_ind) with ordinality u(i, k)
                where p_luz #>> array[i, 'cor'] = p_luz ->> 'cor'),
    'de', (select coalesce(jsonb_agg(i order by k), '[]'::jsonb) from unnest(p_ind) with ordinality u(i, k)
            where p_luz #>> array[i, 'cor'] = p_luz ->> 'cor')) $$;

-- Planejador: luzes e frase da Situação do Ciclo, PPC da última semana fechada e da atual, semana publicada ou não,
-- atrasadas (mesmo critério da Situação) e as mais críticas (EVENTOs e marcos em risco), restrições vencidas e as que
-- vencem em 7 dias, dias úteis sem apontamento. ERP: licitado, meta, comprometido e realizado (_taf_erp_valores).
-- p_ciclo = false: quem pede não abre esta obra no planejador; a parte do planejador nem é calculada.
drop function if exists public._taf_resumo_obra(text);
create or replace function public._taf_resumo_obra(p_obra text, p_ciclo boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_hoje date := public._taf_ciclo_hoje(); v_seg date := public._taf_ciclo_segunda(public._taf_ciclo_hoje());
        v_o public.taf_ciclo_obra; v_e public.taf_erp_obra; v_s public.taf_ciclo_semana;
        v_sit jsonb; v_r jsonb; v_pz jsonb; v_ciclo jsonb; v_erp jsonb; v_ult date; v_ref jsonb;
        v_ni int; v_lic numeric; v_meta numeric; v_comp numeric; v_real numeric; v_noc int; v_nnf int;
        v_nm int; v_lic_m numeric; v_comp_m numeric; v_real_m numeric;
begin
  select * into v_o from public.taf_ciclo_obra where obra = p_obra;
  select * into v_e from public.taf_erp_obra where codigo = p_obra;
  if v_o.obra is null and v_e.codigo is null then raise exception 'OBRA INVALIDA'; end if;

  if v_o.obra is not null then
    if not coalesce(p_ciclo, false) then
      v_ciclo := jsonb_build_object('sem_acesso', true);
    elsif not exists (select 1 from public.taf_ciclo_ativ a where a.obra = p_obra) then
      v_ciclo := jsonb_build_object('cronograma', false);
    else
      begin
        v_sit := public._taf_ciclo_situacao(p_obra, null, 'leitura');
        v_ref := v_sit -> 'semana_ref';
        select * into v_s from public.taf_ciclo_semana s where s.obra = p_obra and s.seg = v_seg;
        v_pz := public._taf_ciclo_prazos(p_obra, v_seg);
        if v_s.seg is not null and v_s.estado <> 'rascunho' then v_r := public._taf_ciclo_resumo(p_obra, v_seg); end if;
        select max(a.dia) into v_ult from public.taf_ciclo_apont a where a.obra = p_obra and a.dia <= v_hoje;
        v_ciclo := jsonb_build_object(
          'cronograma', true,
          'luzes', jsonb_build_object(
             'producao', public._taf_resumo_luz(v_sit #> '{luzes,producao}', array['P2', 'P3', 'P4']),
             'plano', public._taf_resumo_luz(v_sit #> '{luzes,plano}', array['P6', 'P8', 'P10'])),
          'frase', v_sit ->> 'frase',
          'ultima_fechada', case when v_ref is not null and jsonb_typeof(v_ref) = 'object' then jsonb_build_object(
             'seg', v_ref -> 'seg', 'ensaio', v_ref -> 'ensaio', 'ppc', v_ref #> '{resumo,ppc}',
             'cumpridos', v_ref #> '{resumo,cumpridos}', 'publicados', v_ref #> '{resumo,publicados}', 'parciais', v_ref #> '{resumo,parciais}') end,
          'semana_atual', jsonb_build_object(
             'seg', v_seg, 'estado', coalesce(v_s.estado, 'sem_plano'), 'status_pub', v_s.status_pub, 'ensaio', v_s.ensaio,
             'propostos', (select count(*) from public.taf_ciclo_comp c where c.obra = p_obra and c.seg = v_seg and c.cancelado_em is null and not c.extra),
             'publicados', v_r -> 'publicados', 'cumpridos', v_r -> 'cumpridos', 'parciais', v_r -> 'parciais', 'nao', v_r -> 'nao',
             'sem_resultado', v_r -> 'sem_resultado', 'ppc', case when v_s.estado = 'fechada' then v_r -> 'ppc' end,
             'pub_limite', v_pz -> 'pub_limite',
             'fora_do_prazo', coalesce(v_s.estado, 'rascunho') = 'rascunho' and (v_pz ->> 'pub_limite') is not null
                              and public._taf_ciclo_agora() > (v_pz ->> 'pub_limite')::timestamptz),
          'atrasadas', (select jsonb_build_object('total', count(*), 'lista',
                           coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'dias', x.dias)
                                    order by x.dias desc, x.ordem) filter (where x.n <= 5), '[]'::jsonb))
                          from (select y.*, row_number() over (order by y.dias desc, y.ordem) as n from (
                                  select a.id, a.nome, a.ordem,
                                         case when coalesce(a.prev_fim, a.fim_base) < v_hoje then 'termino' else 'inicio' end as tipo,
                                         case when coalesce(a.prev_fim, a.fim_base) < v_hoje then v_hoje - coalesce(a.prev_fim, a.fim_base)
                                              else v_hoje - coalesce(a.prev_ini, a.ini_base) end as dias
                                    from public.taf_ciclo_ativ a
                                   where a.obra = p_obra and a.fim_real is null and a.dur > 0 and a.tipo in ('ativ','continua')
                                     and ((a.ini_real is null and coalesce(a.prev_ini, a.ini_base) < v_hoje)
                                          or coalesce(a.prev_fim, a.fim_base) < v_hoje)) y) x),
          'criticas', jsonb_build_object('total', jsonb_array_length(coalesce(v_sit -> 'eventos_risco', '[]'::jsonb)),
                         'lista', (select coalesce(jsonb_agg(jsonb_build_object('id', e ->> 'id', 'nome', e ->> 'nome', 'ev', e ->> 'ev',
                                            'tipo', e ->> 'tipo', 'data', e ->> 'data', 'nivel', e ->> 'nivel', 'motivo', e #>> '{motivos,0}') order by i), '[]'::jsonb)
                                     from jsonb_array_elements(coalesce(v_sit -> 'eventos_risco', '[]'::jsonb)) with ordinality z(e, i) where i <= 3)),
          'restricoes', (select jsonb_build_object(
                           'vencidas', count(*) filter (where d.ef < v_hoje),
                           'vencem_7', count(*) filter (where d.ef between v_hoje and v_hoje + 7),
                           'ate', v_hoje + 7,
                           'lista_vencidas', coalesce(jsonb_agg(jsonb_build_object('num', d.num, 'oque', d.oque, 'resp', d.resp, 'data', d.ef)
                                               order by d.ef, d.num) filter (where d.ef < v_hoje and d.nv <= 5), '[]'::jsonb),
                           'lista_vencem', coalesce(jsonb_agg(jsonb_build_object('num', d.num, 'oque', d.oque, 'resp', d.resp, 'data', d.ef)
                                               order by d.ef, d.num) filter (where d.ef between v_hoje and v_hoje + 7 and d.nf <= 5), '[]'::jsonb))
                           from (select x.num, x.oque, x.resp, coalesce(x.nova_data, x.prazo) as ef,
                                        row_number() over (partition by coalesce(x.nova_data, x.prazo) < v_hoje order by coalesce(x.nova_data, x.prazo), x.num) as nv,
                                        row_number() over (partition by coalesce(x.nova_data, x.prazo) between v_hoje and v_hoje + 7 order by coalesce(x.nova_data, x.prazo), x.num) as nf
                                   from public.taf_ciclo_demanda x where x.obra = p_obra and x.situacao in ('aberta','respondida')) d),
          'apontamento', jsonb_build_object('ultimo', v_ult,
                           'dias_uteis_sem', case when v_ult is not null then public._taf_resumo_uteis_entre(p_obra, v_ult, v_hoje) end));
      exception when others then
        v_ciclo := jsonb_build_object('cronograma', true, 'erro', 'não consegui calcular o planejador desta obra', 'detalhe', left(sqlerrm, 150));
      end;
    end if;
  end if;

  if v_e.codigo is not null then
    -- [integração] meta parcial: a soma da meta só conta os itens que têm meta. Vazio não é zero: o e-mail precisa saber
    -- quantos itens têm meta e quanto do licitado (e do gasto) está nesses itens, senão a meta parcial parece a da obra inteira.
    select count(*)::int, sum(x.venda), sum(x.meta), sum(x.comprometido), sum(x.realizado),
           count(x.meta)::int, sum(x.venda) filter (where x.meta is not null),
           sum(x.comprometido) filter (where x.meta is not null), sum(x.realizado) filter (where x.meta is not null)
      into v_ni, v_lic, v_meta, v_comp, v_real, v_nm, v_lic_m, v_comp_m, v_real_m from public._taf_erp_valores(p_obra) x;
    select count(*) filter (where d.tipo = 'oc' and coalesce(d.dados ->> 'status', '') not in ('cancelada', 'reprovada'))::int,
           count(*) filter (where d.tipo = 'nf')::int
      into v_noc, v_nnf from public.taf_erp_doc d where d.obra = p_obra;
    v_erp := jsonb_build_object('itens', v_ni,
      'licitado', case when v_ni > 0 then round(v_lic, 2) end, 'meta', case when v_ni > 0 then round(v_meta, 2) end,
      'comprometido', case when v_ni > 0 then round(v_comp, 2) end, 'realizado', case when v_ni > 0 then round(v_real, 2) end,
      'itens_com_meta', v_nm, 'licitado_com_meta', case when v_nm > 0 then round(v_lic_m, 2) end,
      'comprometido_com_meta', case when v_nm > 0 then round(v_comp_m, 2) end, 'realizado_com_meta', case when v_nm > 0 then round(v_real_m, 2) end,
      'pedidos', v_noc, 'notas', v_nnf);
  end if;

  return jsonb_build_object('obra', p_obra, 'nome', coalesce(v_o.nome, v_e.nome), 'hoje', v_hoje, 'semana', v_seg,
                            'ciclo', v_ciclo, 'erp', v_erp, 'gerado_em', public._taf_ciclo_agora());
end $$;

-- ===================================================================== entrada: cadastro (Diretoria ou gestor)
create or replace function public.taf_resumo_destinatarios(p_chave text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; v_todas text[] := public._taf_resumo_todas(); v_cobre boolean;
begin
  select * into a from public._taf_resumo_gestor(p_chave);
  v_cobre := public._taf_resumo_cobre(a.obras, null);
  return jsonb_build_object(
    'quem', a.nome, 'papel', a.papel, 'cobre_todas', v_cobre,
    'obras', (select coalesce(jsonb_agg(jsonb_build_object('obra', x, 'nome', coalesce(o.nome, e.nome)) order by x), '[]'::jsonb)
                from unnest(v_todas) x left join public.taf_ciclo_obra o on o.obra = x left join public.taf_erp_obra e on e.codigo = x
               where a.obras is null or x = any(a.obras)),
    'robo', case when v_cobre then (select jsonb_build_object('criado_em', r.criado_em, 'criado_por', r.criado_por)
                                      from public.taf_resumo_robo r where r.ativo order by r.criado_em desc limit 1) end,
    'destinatarios', (select coalesce(jsonb_agg(public._taf_resumo_dest_json(d, a.nome) order by d.ativo desc, lower(d.nome), d.id), '[]'::jsonb)
                        from public.taf_resumo_dest d
                       where v_cobre or (d.obras is not null and d.obras <@ a.obras)));
end $$;

-- p_id null = novo. p_obras: lista JSON de códigos (["342","343"]) ou null = todas. p_meu: este e-mail é de quem está salvando.
create or replace function public.taf_resumo_destinatario_salvar(p_chave text, p_id bigint, p_nome text, p_email text,
                                                                 p_obras jsonb, p_frequencia text, p_meu boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; v_todas text[] := public._taf_resumo_todas(); v_obras text[]; v_x text; v_d public.taf_resumo_dest;
        v_nome text := trim(coalesce(p_nome, '')); v_email text := lower(trim(coalesce(p_email, '')));
begin
  select * into a from public._taf_resumo_gestor(p_chave);
  if length(v_nome) not between 2 and 80 then raise exception 'NOME INVALIDO'; end if;
  if length(v_email) > 200 or v_email !~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' then
    raise exception 'E-MAIL INVALIDO'; end if;
  if coalesce(p_frequencia, '') not in ('diaria', 'semanal') then raise exception 'FREQUENCIA INVALIDA'; end if;
  if p_obras is null or jsonb_typeof(p_obras) = 'null' then
    if not public._taf_resumo_cobre(a.obras, null) then raise exception 'ESCOLHA AS OBRAS: SUA CHAVE NAO TEM TODAS'; end if;
    v_obras := null;
  else
    if jsonb_typeof(p_obras) <> 'array' or jsonb_array_length(p_obras) = 0 then raise exception 'ESCOLHA AS OBRAS'; end if;
    if jsonb_array_length(p_obras) > 50 then raise exception 'OBRAS DEMAIS'; end if;
    for v_x in select jsonb_array_elements_text(p_obras) loop
      if not (v_x = any(v_todas)) then raise exception 'OBRA INVALIDA: %', left(v_x, 10); end if;
      if a.obras is not null and not (v_x = any(a.obras)) then raise exception 'SEM ACESSO A OBRA %', v_x; end if;
    end loop;
    select array_agg(distinct x order by x) into v_obras from jsonb_array_elements_text(p_obras) x;
  end if;
  perform pg_advisory_xact_lock(hashtext('taf_resumo_dest'));
  if p_id is null then
    if (select count(*) from public.taf_resumo_dest where ativo) >= 100 then raise exception 'LIMITE DE 100 DESTINATARIOS'; end if;
    begin
      insert into public.taf_resumo_dest (nome, email, obras, frequencia, pessoa, cadastrado_por)
      values (v_nome, v_email, v_obras, p_frequencia, case when p_meu then a.nome end, a.nome) returning * into v_d;
    exception when unique_violation then raise exception 'ESTE E-MAIL JA RECEBE O RESUMO %', upper(p_frequencia);
    end;
  else
    select * into v_d from public.taf_resumo_dest where id = p_id for update;
    if v_d.id is null then raise exception 'DESTINATARIO NAO EXISTE'; end if;
    if not public._taf_resumo_cobre(a.obras, v_d.obras) then raise exception 'SEM ACESSO A ESTE DESTINATARIO'; end if;
    -- cadastro com dono ("É o meu e-mail"): só o dono ou a Diretoria mexem
    if v_d.pessoa is not null and v_d.pessoa <> a.nome and a.papel <> 'diretoria' then
      raise exception 'SO O DONO OU A DIRETORIA MEXE NESTE DESTINATARIO'; end if;
    if not v_d.ativo and (select count(*) from public.taf_resumo_dest where ativo) >= 100 then raise exception 'LIMITE DE 100 DESTINATARIOS'; end if;
    begin
      update public.taf_resumo_dest set nome = v_nome, email = v_email, obras = v_obras, frequencia = p_frequencia, ativo = true,
             pessoa = case when p_meu then a.nome
                           when v_d.pessoa = a.nome then null           -- o dono desmarcou "É o meu e-mail"
                           when v_email <> lower(v_d.email) then null   -- outra pessoa trocou o e-mail: deixa de ser do dono
                           else v_d.pessoa end,
             atualizado_por = a.nome, atualizado_em = now()
       where id = p_id returning * into v_d;
    exception when unique_violation then raise exception 'ESTE E-MAIL JA RECEBE O RESUMO %', upper(p_frequencia);
    end;
  end if;
  return public._taf_resumo_dest_json(v_d, a.nome);
end $$;

create or replace function public.taf_resumo_destinatario_desativar(p_chave text, p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; v_d public.taf_resumo_dest;
begin
  select * into a from public._taf_resumo_gestor(p_chave);
  select * into v_d from public.taf_resumo_dest where id = p_id for update;
  if v_d.id is null then raise exception 'DESTINATARIO NAO EXISTE'; end if;
  if not public._taf_resumo_cobre(a.obras, v_d.obras) then raise exception 'SEM ACESSO A ESTE DESTINATARIO'; end if;
  if v_d.pessoa is not null and v_d.pessoa <> a.nome and a.papel <> 'diretoria' then
    raise exception 'SO O DONO OU A DIRETORIA MEXE NESTE DESTINATARIO'; end if;
  if v_d.ativo then
    update public.taf_resumo_dest set ativo = false, atualizado_por = a.nome, atualizado_em = now() where id = p_id returning * into v_d;
  end if;
  return public._taf_resumo_dest_json(v_d, a.nome);
end $$;

-- Chave do robô: nova chave de leitura sem obra nenhuma; a anterior para de valer. O texto da chave sai só aqui, uma vez.
create or replace function public.taf_resumo_robo_gerar(p_chave text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a record; v_k text; v_h text;
begin
  select * into a from public._taf_resumo_gestor(p_chave);
  if not public._taf_resumo_cobre(a.obras, null) then raise exception 'SO QUEM TEM TODAS AS OBRAS GERA A CHAVE DO ROBO'; end if;
  perform pg_advisory_xact_lock(hashtext('taf_resumo_robo'));
  -- [integração] com o 06 aplicado, a troca do robô fica no registro de Acessos (a lista mostra quem criou e quem desativou)
  if to_regclass('public.taf_acesso_log') is not null then
    execute $q$insert into public.taf_acesso_log (acao, chave_id, nome, pessoa, papel, obras, motivo, quem, quem_papel, verificado)
      select 'desativar', public._taf_acesso_id(c.hash), c.nome, c.pessoa, c.papel, c.obras, 'robô do resumo trocado na tela Resumo para o diretor', $1, $2, true
        from public.taf_ciclo_chave c join public.taf_resumo_robo r on r.hash = c.hash where r.ativo and c.ativo$q$
      using a.nome, case a.papel when 'gestao' then 'gestor' else a.papel end;
  end if;
  update public.taf_ciclo_chave set ativo = false where hash in (select r.hash from public.taf_resumo_robo r where r.ativo);
  update public.taf_resumo_robo set ativo = false, desativado_em = now() where ativo;
  v_k := 'robo-' || encode(extensions.gen_random_bytes(24), 'hex');
  v_h := encode(extensions.digest(v_k, 'sha256'), 'hex');
  insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras, ativo)
  values (v_h, 'Robô do resumo do diretor', null, 'leitura', '{}', true);
  insert into public.taf_resumo_robo (hash, criado_por) values (v_h, a.nome);
  if to_regclass('public.taf_acesso_log') is not null then
    execute $q$insert into public.taf_acesso_log (acao, chave_id, nome, pessoa, papel, obras, motivo, quem, quem_papel, verificado)
      values ('criar', public._taf_acesso_id($1), 'Robô do resumo do diretor', null, 'leitura', '{}', 'robô do resumo (e-mail do horário)', $2, $3, true)$q$
      using v_h, a.nome, case a.papel when 'gestao' then 'gestor' else a.papel end;
  end if;
  return jsonb_build_object('chave', v_k, 'criado_em', now(), 'criado_por', a.nome);
end $$;

-- ===================================================================== entrada: prévia, resumo da obra, envio
-- Prévia: as obras de quem pede (ou as de um destinatário que a pessoa pode ver, cortadas pelas obras da chave).
-- p_enviar: reserva o envio de teste para os e-mails marcados como da pessoa (até 3 e-mails; 5 testes por dia).
-- Cada envio de teste leva só as obras da chave que também estão no cadastro daquele e-mail (o mesmo que ele recebe no horário).
create or replace function public.taf_resumo_previa(p_chave text, p_destinatario bigint default null, p_enviar boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a record; v_d public.taf_resumo_dest; v_obras text[]; v_hoje date := public._taf_ciclo_hoje(); v_m record;
        v_env jsonb := '[]'::jsonb; v_id bigint; v_gestor boolean; v_om text[];
begin
  if public._taf_resumo_e_robo(p_chave) then raise exception 'A CHAVE DO ROBO NAO FAZ PREVIA'; end if;
  select * into a from public._taf_resumo_pessoal(p_chave);
  v_obras := array(select x from unnest(a.obras) x where x = any(public._taf_resumo_todas()) order by x);
  if p_destinatario is not null then
    select * into v_d from public.taf_resumo_dest where id = p_destinatario;
    if v_d.id is null then raise exception 'DESTINATARIO NAO EXISTE'; end if;
    v_gestor := a.papel in ('gestao', 'diretoria') and not a.leitura;
    if not ((v_d.pessoa is not null and v_d.pessoa = a.nome) or (v_gestor and public._taf_resumo_cobre(a.obras, v_d.obras))) then
      raise exception 'SEM ACESSO A ESTE DESTINATARIO'; end if;
    v_obras := array(select x from unnest(v_obras) x where v_d.obras is null or x = any(v_d.obras) order by x);
  end if;
  if p_enviar then
    if not exists (select 1 from public.taf_resumo_dest d where d.ativo and d.pessoa = a.nome) then
      raise exception 'SEU E-MAIL NAO ESTA NA LISTA'; end if;
    perform pg_advisory_xact_lock(hashtext('taf_resumo_teste'), hashtext(a.nome));
    if (select count(*) from public.taf_resumo_envio e where e.quando = 'teste' and e.dia = v_hoje and e.pedido_por = a.nome) >= 5 then
      raise exception 'LIMITE DE 5 ENVIOS DE TESTE POR DIA'; end if;
    for v_m in select * from public.taf_resumo_dest d where d.ativo and d.pessoa = a.nome order by d.id limit 3 loop
      v_om := array(select x from unnest(v_obras) x where v_m.obras is null or x = any(v_m.obras) order by x);
      if cardinality(v_om) = 0 then continue; end if;
      insert into public.taf_resumo_envio (dest, quando, dia, pedido_por, email, obras)
      values (v_m.id, 'teste', v_hoje, a.nome, v_m.email, v_om) returning id into v_id;
      v_env := v_env || jsonb_build_object('envio', v_id, 'destinatario', v_m.id, 'nome', v_m.nome, 'email', v_m.email, 'obras', to_jsonb(v_om));
    end loop;
    if jsonb_array_length(v_env) = 0 then raise exception 'NENHUMA OBRA DO SEU CADASTRO NA SUA CHAVE'; end if;
  end if;
  return jsonb_build_object('hoje', v_hoje, 'quem', a.nome, 'papel', a.papel, 'obras', to_jsonb(v_obras),
    'meus', (select coalesce(jsonb_agg(jsonb_build_object('destinatario', d.id, 'email', public._taf_resumo_mascara(d.email),
                                                           'frequencia', d.frequencia) order by d.id), '[]'::jsonb)
               from public.taf_resumo_dest d where d.ativo and d.pessoa = a.nome),
    'envios', case when p_enviar then v_env end);
end $$;

-- Chave pessoal: a obra tem de estar na chave (regra do ERP) e a parte do planejador segue a regra do planejador
-- (_taf_ciclo_ator: a chave do site, que no ERP abre a 342, só vê o planejador da obra de que é o engenheiro).
create or replace function public.taf_resumo_obra(p_chave text, p_obra text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; v_ciclo boolean := true;
begin
  if not (coalesce(p_obra, '') = any(public._taf_resumo_todas())) then raise exception 'OBRA INVALIDA'; end if;
  if not public._taf_resumo_e_robo(p_chave) then
    select * into a from public._taf_resumo_pessoal(p_chave);
    if not (p_obra = any(a.obras)) then raise exception 'SEM ACESSO A OBRA'; end if;
    if exists (select 1 from public.taf_ciclo_obra o where o.obra = p_obra) then
      begin
        perform public._taf_ciclo_ator(p_chave, p_obra, null);
      exception when others then v_ciclo := false;   -- recusa do planejador: sem a parte dele, sem dizer por quê
      end;
    end if;
  end if;
  return public._taf_resumo_obra(p_obra, v_ciclo);
end $$;

-- Robô: reserva os envios de hoje (diario) ou da semana (semanal) que ainda não saíram, até p_limite (1 a 100; o cadastro
-- tem no máximo 100 ativos, então numa execução cabem todos), e devolve, por destinatário, o envio (e a tentativa), o nome,
-- o e-mail e as obras dele. Reservado há menos de 10 minutos é de outra execução em andamento e fica de fora; erro é
-- tentado de novo até 3 vezes (a repescagem do agendador, mais tarde no mesmo dia, pega o que ficou).
-- Ordem: quem não recebeu da última vez vai primeiro (assim, se faltar tempo, não são sempre os mesmos que ficam sem).
create or replace function public.taf_resumo_montar(p_chave text, p_quando text, p_limite int default 20)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_hoje date := public._taf_ciclo_hoje(); v_dia date; v_freq text; v_lim int := least(greatest(coalesce(p_limite, 20), 1), 100);
        v_todas text[] := public._taf_resumo_todas(); v_d public.taf_resumo_dest; v_e public.taf_resumo_envio; v_obras text[];
        v_env jsonb := '[]'::jsonb; v_n int := 0; v_rest int := 0; v_desist int := 0; v_sem int := 0; v_ja int := 0; v_id bigint; v_t int;
begin
  if not public._taf_resumo_e_robo(p_chave) then raise exception 'CHAVE DO ROBO INVALIDA'; end if;
  if coalesce(p_quando, '') not in ('diario', 'semanal') then raise exception 'QUANDO INVALIDO'; end if;
  v_dia := case when p_quando = 'semanal' then public._taf_ciclo_segunda(v_hoje) else v_hoje end;
  v_freq := case when p_quando = 'semanal' then 'semanal' else 'diaria' end;
  perform pg_advisory_xact_lock(hashtext('taf_resumo_montar'));
  for v_d in select d.* from public.taf_resumo_dest d
               left join lateral (select max(e.dia) as ult from public.taf_resumo_envio e
                                   where e.dest = d.id and e.quando = p_quando and e.estado = 'enviado') u on true
              where d.ativo and d.frequencia = v_freq order by u.ult nulls first, d.id loop
    v_obras := case when v_d.obras is null then v_todas else array(select x from unnest(v_d.obras) x where x = any(v_todas) order by x) end;
    if cardinality(v_obras) = 0 then v_sem := v_sem + 1; continue; end if;
    select * into v_e from public.taf_resumo_envio e where e.dest = v_d.id and e.quando = p_quando and e.dia = v_dia;
    if v_e.id is not null then
      if v_e.estado = 'enviado' then v_ja := v_ja + 1; continue; end if;
      if v_e.estado = 'reservado' and v_e.atualizado_em > now() - interval '10 minutes' then v_ja := v_ja + 1; continue; end if;
      if v_e.tentativas >= 3 then v_desist := v_desist + 1; continue; end if;
      if v_n >= v_lim then v_rest := v_rest + 1; continue; end if;
      update public.taf_resumo_envio set estado = 'reservado', tentativas = tentativas + 1, email = v_d.email, obras = v_obras,
             erro = null, atualizado_em = now() where id = v_e.id returning tentativas into v_t;
      v_id := v_e.id;
    else
      if v_n >= v_lim then v_rest := v_rest + 1; continue; end if;
      insert into public.taf_resumo_envio (dest, quando, dia, pedido_por, email, obras)
      values (v_d.id, p_quando, v_dia, 'robô', v_d.email, v_obras) returning id, tentativas into v_id, v_t;
    end if;
    v_env := v_env || jsonb_build_object('envio', v_id, 'tentativa', v_t, 'destinatario', v_d.id, 'nome', v_d.nome, 'email', v_d.email,
                                         'obras', to_jsonb(v_obras));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('hoje', v_hoje, 'dia', v_dia, 'quando', p_quando, 'envios', v_env,
    'restantes', v_rest, 'ja_enviados', v_ja, 'desistidos', v_desist, 'sem_obra', v_sem,
    'obras', (select coalesce(jsonb_agg(distinct o order by o), '[]'::jsonb)
                from jsonb_array_elements(v_env) x, jsonb_array_elements_text(x -> 'obras') o));
end $$;

-- p_envios: [{"envio": 12, "ok": true, "id": "<id do Resend>"}, {"envio": 13, "ok": false, "erro": "Resend respondeu 422"}]
create or replace function public.taf_resumo_registrar(p_chave text, p_envios jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_robo boolean := public._taf_resumo_e_robo(p_chave); v_nome text; x jsonb; v_e public.taf_resumo_envio;
        v_ok int := 0; v_ign int := 0;
begin
  if not v_robo then select p.nome into v_nome from public._taf_resumo_pessoal(p_chave) p; end if;
  if p_envios is null or jsonb_typeof(p_envios) <> 'array' then raise exception 'ENVIOS INVALIDOS'; end if;
  if jsonb_array_length(p_envios) > 100 then raise exception 'ENVIOS DEMAIS'; end if;
  for x in select * from jsonb_array_elements(p_envios) loop
    if jsonb_typeof(x) <> 'object' or coalesce(x ->> 'envio', '') !~ '^\d{1,15}$' then v_ign := v_ign + 1; continue; end if;
    select * into v_e from public.taf_resumo_envio e where e.id = (x ->> 'envio')::bigint for update;
    if v_e.id is null or v_e.estado <> 'reservado'
       or (not v_robo and (v_e.quando <> 'teste' or v_e.pedido_por is distinct from v_nome)) then v_ign := v_ign + 1; continue; end if;
    update public.taf_resumo_envio set
           estado = case when coalesce(x ->> 'ok', '') = 'true' then 'enviado' else 'erro' end,
           id_externo = left(nullif(x ->> 'id', ''), 100),
           erro = case when coalesce(x ->> 'ok', '') = 'true' then null else left(coalesce(nullif(x ->> 'erro', ''), 'não saiu'), 300) end,
           atualizado_em = now()
     where id = v_e.id;
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('gravados', v_ok, 'ignorados', v_ign);
end $$;

-- ===================================================================== permissões
-- Só as 8 funções de entrada ficam chamáveis pela API; as internas (_taf_resumo_*) não (o Supabase dá execute por padrão).
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'taf\_resumo\_%' or p.proname like '\_taf\_resumo\_%') loop
    execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
    if r.proname in ('taf_resumo_destinatarios', 'taf_resumo_destinatario_salvar', 'taf_resumo_destinatario_desativar',
                     'taf_resumo_robo_gerar', 'taf_resumo_previa', 'taf_resumo_obra', 'taf_resumo_montar', 'taf_resumo_registrar') then
      execute 'grant execute on function ' || r.sig || ' to anon, authenticated';
    end if;
  end loop;
end $$;

-- ===================================================================== como desfazer
-- Guarde antes uma cópia da lista, se quiser: select * from public.taf_resumo_dest;
-- Depois, numa transação:
--   update public.taf_ciclo_chave set ativo = false where hash in (select hash from public.taf_resumo_robo);
--   drop function if exists public.taf_resumo_destinatarios(text), public.taf_resumo_destinatario_salvar(text, bigint, text, text, jsonb, text, boolean),
--     public.taf_resumo_destinatario_desativar(text, bigint), public.taf_resumo_robo_gerar(text), public.taf_resumo_previa(text, bigint, boolean),
--     public.taf_resumo_obra(text, text), public.taf_resumo_montar(text, text, int), public.taf_resumo_registrar(text, jsonb),
--     public._taf_resumo_obra(text, boolean), public._taf_resumo_luz(jsonb, text[]),
--     public._taf_resumo_dest_json(public.taf_resumo_dest, text), public._taf_resumo_uteis_entre(text, date, date),
--     public._taf_resumo_pessoal(text), public._taf_resumo_e_robo(text), public._taf_resumo_gestor(text), public._taf_resumo_mascara(text),
--     public._taf_resumo_cobre(text[], text[]), public._taf_resumo_dir_todas(text[]), public._taf_resumo_todas();
--   drop table if exists public.taf_resumo_envio, public.taf_resumo_dest_hist, public.taf_resumo_robo;
--   drop table if exists public.taf_resumo_dest;   -- leva junto o gatilho
--   drop function if exists public._taf_resumo_dest_trg();
-- A linha da chave do robô em taf_ciclo_chave fica desativada (nada é apagado de taf_ciclo_chave).
-- Na Vercel: tirar os "crons" do public/vercel.json e as variáveis CRON_SECRET, RESEND_API_KEY, RESUMO_REMETENTE, TAF_CHAVE_RESUMO.

-- ======================================================== chaves de teste da obra 999 (fictícia)
update public.taf_ciclo_chave set ativo = false where ativo and pessoa like '%TESTE 999%' and obras = array['999'];

commit;
