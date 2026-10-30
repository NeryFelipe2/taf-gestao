-- 10 (WhatsApp, aprovação por comando): troca a função public.ia_whatsapp_receber do 09 por uma que, além de tudo o que o 09 faz,
-- entende comandos de aprovação digitados no celular ("ok 12", "não 12", "não 12: falta o documento"). RASCUNHO. NÃO APLICADO.
-- Só aplicar no banco com o sim do Felipe, depois de testar (10_teste_whatsapp_aprovacao.sql e de novo o 09_teste_whatsapp.sql).
-- Fora do horário de uso, o arquivo inteiro de uma vez: psql -1 -v ON_ERROR_STOP=1 -f 10_whatsapp_aprovacao.sql
--
-- MESMA assinatura do 09 (create or replace, sem mudar quem chama): public.ia_whatsapp_receber(p_segredo, p_de, p_nome, p_texto, p_wa_id,
-- p_quando, p_bruto). Tudo o que o 09 faz continua igual: confere o segredo pelo SHA-256 em ia.config ('whatsapp_segredo_banco'), confere
-- a lista de números ('whatsapp_allowlist'), grava em ia.fato (mensagem de número fora da lista: só os 4 últimos dígitos, sem texto;
-- de número liberado: texto, nome, número e bruto), idempotente pelo hash md5('wa:'||id da mensagem).
--
-- O que o 10 acrescenta (só para número LIBERADO e só para mensagem NOVA; reenvio da Meta ou da Bird do mesmo id nunca reaplica comando):
--   aprovar  ^\s*(ok|sim|aprovo|aprovado|pode)\s+#?(\d{1,9})\s*[.!]?\s*$             (sem diferenciar maiúscula)
--   recusar  ^\s*(n[aãÃ]o|recuso|recusado|cancela)\s+#?(\d{1,9})\s*(?:[:;,.\-–—](?!\d)\s*(.*))?$   (sem diferenciar maiúscula)
--            o número vem SOZINHO ou seguido de um separador (dois pontos, ponto e vírgula, vírgula, ponto, hífen, travessão curto
--            ou longo) e só então o motivo, que vai até 500 caracteres. Sem o separador não é comando. O separador não pode ser
--            seguido de dígito colado (?!\d): assim "3,5", "3.5", "12:30" e "12-15" são número escrito, não separador.
--   Aprovar/recusar mexe em ia.aprovacao SÓ se o número pedido existir E estiver 'pendente': status 'aprovado' ou 'recusado',
--   decidido_em = now(), decidido_por = 'whatsapp final <4 últimos dígitos>' (motivo só na recusa; vazio fica nulo).
--   Número que não existe, ou aprovação que já não está 'pendente' (aprovada, recusada, enviada, expirada): não altera nada e o
--   comando vale 'nao_encontrado'.
--   A mensagem continua gravada em ia.fato como antes (auditoria); quando houve comando, dados ganha {"comando": "aprovado" |
--   "recusado" | "nao_encontrado", "aprovacao_id": <o número pedido>}.
--   O retorno ganha "comando" e "aprovacao_id" (nulos quando não houve comando, e também no reenvio de mensagem já gravada).
-- Frase comum NÃO vira comando. O texto inteiro tem de ser só a palavra e o número ("ok 12", "não 12") ou, na recusa, o número, um
-- separador e o motivo ("não 12: falta o documento"). "não 3 equipes foram à obra", "não 12 falta documento" (sem separador) e
-- "ok 3 equipes" NÃO viram comando e não mexem em nada. Número com dígito colado depois ("não 3,5 metros", "não 3.5 toneladas",
-- "não 12:30 da tarde", "não 12-15 pessoas") também não. Limite que sobra: número, separador e texto É a recusa com motivo, então uma
-- frase que por acaso tenha esse formato ("não 3, são 4 equipes") ainda recusa a aprovação 3 se ela estiver pendente.
-- Nada é enviado a ninguém, e o sistema não responde no WhatsApp: para saber se pegou, ver ia.aprovacao (status) ou ia.fato (dados).
--
-- Depende do 09 (esquema ia, ia.config, ia.fato), de ia.aprovacao e da extensão pgcrypto no esquema extensions. O primeiro bloco
-- abaixo só serve para o banco local de teste: cria o que falta e, no banco real, onde as tabelas já existem, não faz nada.
-- Desfazer: rodar de novo a parte da função do 09_whatsapp_entrada.sql (volta à função sem comandos).

-- ===================================================================== só para o banco local de teste (no real já existem)
-- Cria só o que NÃO existe. No banco real as três tabelas já existem e este bloco não faz nada: não altera, não revoga, não abre
-- permissão (diferente do bloco equivalente do 09, que roda alter/revoke sem condição). Por isso o arquivo inteiro pode ser aplicado.
do $local$
begin
  create schema if not exists ia;
  if to_regclass('ia.config') is null then
    create table ia.config (
      chave text primary key,
      valor jsonb not null,
      atualizado_em timestamptz not null default now()
    );
    alter table ia.config enable row level security;
    revoke all on ia.config from public, anon, authenticated;
  end if;
  if to_regclass('ia.fato') is null then
    create table ia.fato (
      id bigserial primary key,
      empresa text not null check (empresa in ('WCR', 'TAF', 'CONSTRUDATA', 'GRUPO')),
      contrato text,
      obra text,
      data date not null,
      tipo text not null,
      titulo text not null,
      texto text,
      dados jsonb,
      responsavel text,
      fonte text,
      fonte_id text,
      agente_id text,
      hash text unique,
      criado_em timestamptz not null default now()
    );
    alter table ia.fato enable row level security;
    revoke all on ia.fato from public, anon, authenticated;
  end if;
  -- mesmo formato da ia.aprovacao do banco real (lá há também a chave estrangeira de agente_id para ia.agente, que aqui não é preciso)
  if to_regclass('ia.aprovacao') is null then
    create table ia.aprovacao (
      id bigserial primary key,
      agente_id text,
      tipo text not null,
      destinatario text,
      conteudo text not null,
      dados jsonb,
      status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'enviado', 'expirado')),
      criado_em timestamptz not null default now(),
      decidido_em timestamptz,
      decidido_por text,
      motivo text
    );
    alter table ia.aprovacao enable row level security;
    revoke all on ia.aprovacao from public, anon, authenticated;
  end if;
end $local$;

-- ===================================================================== função de entrada
-- Erros (a mensagem é o que o endpoint lê): SEGREDO NAO CONFIGURADO, SEGREDO INVALIDO, MENSAGEM SEM ID, NUMERO INVALIDO.
create or replace function public.ia_whatsapp_receber(p_segredo text, p_de text, p_nome text, p_texto text, p_wa_id text,
                                                      p_quando timestamptz default now(), p_bruto jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, ia, extensions as $$
declare
  v_hash_cfg text; v_lista jsonb; v_digitos text; v_liberado boolean; v_hash text; v_id bigint; v_repetido boolean := false;
  v_nome text; v_quando timestamptz; v_data date; v_bruto jsonb; v_dados jsonb; v_titulo text; v_texto text;
  v_m text[]; v_cmd text; v_n bigint; v_aid bigint; v_motivo text;
begin
  select c.valor->>'sha256' into v_hash_cfg from ia.config c where c.chave = 'whatsapp_segredo_banco';
  if v_hash_cfg is null or v_hash_cfg !~ '^[0-9a-f]{64}$' then raise exception 'SEGREDO NAO CONFIGURADO'; end if;
  if p_segredo is null or encode(extensions.digest(p_segredo, 'sha256'), 'hex') <> v_hash_cfg then raise exception 'SEGREDO INVALIDO'; end if;
  if p_wa_id is null or length(trim(p_wa_id)) = 0 or length(p_wa_id) > 200 then raise exception 'MENSAGEM SEM ID'; end if;
  v_digitos := regexp_replace(coalesce(p_de, ''), '\D', '', 'g');
  if length(v_digitos) < 8 or length(v_digitos) > 20 then raise exception 'NUMERO INVALIDO'; end if;

  -- lista de números liberados: compara só os dígitos (a Meta manda sem o "+")
  select c.valor into v_lista from ia.config c where c.chave = 'whatsapp_allowlist';
  if v_lista is null or jsonb_typeof(v_lista) <> 'array' then v_lista := '[]'::jsonb; end if;
  v_liberado := exists (select 1 from jsonb_array_elements_text(v_lista) e where regexp_replace(e, '\D', '', 'g') = v_digitos);

  v_quando := coalesce(p_quando, now());
  v_data := (v_quando at time zone 'America/Sao_Paulo')::date;
  v_hash := md5('wa:' || p_wa_id);
  v_bruto := case when p_bruto is null or jsonb_typeof(p_bruto) <> 'object' then '{}'::jsonb
                  when length(p_bruto::text) > 2000 then jsonb_build_object('cortado', true, 'tipo', p_bruto->>'tipo')
                  else p_bruto end;

  if v_liberado then
    v_nome := nullif(trim(coalesce(p_nome, '')), '');
    v_titulo := 'WhatsApp de ' || coalesce(left(v_nome, 120), 'número final ' || right(v_digitos, 4));
    v_texto := left(p_texto, 8000);
    v_dados := jsonb_build_object('wa_id', p_wa_id, 'de', v_digitos, 'nome', v_nome, 'quando', v_quando, 'tipo', v_bruto->>'tipo', 'bruto', v_bruto);
  else
    v_titulo := 'WhatsApp de número não liberado';
    v_texto := null;                                                      -- o texto de quem não está na lista não entra
    v_dados := jsonb_build_object('wa_id', p_wa_id, 'de_final', right(v_digitos, 4), 'quando', v_quando, 'tipo', v_bruto->>'tipo');
  end if;

  insert into ia.fato (empresa, contrato, obra, data, tipo, titulo, texto, dados, responsavel, fonte, fonte_id, agente_id, hash)
  values ('GRUPO', null, null, v_data, 'mensagem', v_titulo, v_texto, v_dados, null, 'whatsapp', p_wa_id, null, v_hash)
  on conflict (hash) do nothing
  returning id into v_id;
  if v_id is null then
    select f.id into v_id from ia.fato f where f.hash = v_hash;
    v_repetido := true;
  end if;

  -- comandos de aprovação: só número liberado e só mensagem nova (quem decide que é nova é o insert acima, que é atômico:
  -- duas entregas ao mesmo tempo do mesmo id não aplicam o comando duas vezes). A aprovação só muda se estiver 'pendente'.
  if v_liberado and not v_repetido and v_texto is not null then
    v_m := regexp_match(v_texto, '^\s*(ok|sim|aprovo|aprovado|pode)\s+#?(\d{1,9})\s*[.!]?\s*$', 'i');
    if v_m is not null then
      v_n := v_m[2]::bigint;
      update ia.aprovacao a
         set status = 'aprovado', decidido_em = now(), decidido_por = 'whatsapp final ' || right(v_digitos, 4)
       where a.id = v_n and a.status = 'pendente'
      returning a.id into v_aid;
      v_cmd := case when v_aid is null then 'nao_encontrado' else 'aprovado' end;
    else
      -- "n[aãÃ]o" e não só (não|nao) com a opção de maiúscula: assim "NÃO" pega em qualquer configuração de idioma do banco
      -- o motivo (grupo 3) é opcional e fica dentro do grupo não capturante com o separador; sem separador não casa, e o
      -- separador com dígito logo depois (3,5 / 12:30 / 12-15) também não: (?!\d)
      v_m := regexp_match(v_texto, '^\s*(n[aãÃ]o|recuso|recusado|cancela)\s+#?(\d{1,9})\s*(?:[:;,.\-–—](?!\d)\s*(.*))?$', 'i');
      if v_m is not null then
        v_n := v_m[2]::bigint;
        v_motivo := nullif(left(regexp_replace(v_m[3], '^\s+|\s+$', '', 'g'), 500), '');
        update ia.aprovacao a
           set status = 'recusado', decidido_em = now(), decidido_por = 'whatsapp final ' || right(v_digitos, 4), motivo = v_motivo
         where a.id = v_n and a.status = 'pendente'
        returning a.id into v_aid;
        v_cmd := case when v_aid is null then 'nao_encontrado' else 'recusado' end;
      end if;
    end if;
    if v_cmd is not null then
      update ia.fato f set dados = coalesce(f.dados, '{}'::jsonb) || jsonb_build_object('comando', v_cmd, 'aprovacao_id', v_n) where f.id = v_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'fato_id', v_id, 'liberado', v_liberado, 'repetido', v_repetido,
                            'comando', v_cmd, 'aprovacao_id', case when v_cmd is null then null else v_n end);
end $$;

-- ===================================================================== permissões
-- É a porta pública (o endpoint chama com a chave publicável): aberta a anon e authenticated, protegida pelo segredo.
-- Comando de aprovação só vale para número da lista; nenhuma tabela do esquema ia fica aberta a anon.
revoke all on function public.ia_whatsapp_receber(text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.ia_whatsapp_receber(text, text, text, text, text, timestamptz, jsonb) to anon, authenticated;

-- ===================================================================== desfazer (manual)
-- Voltar à função sem comandos: rodar de novo a parte "função de entrada" e "permissões" do 09_whatsapp_entrada.sql.
-- As aprovações já decididas por WhatsApp ficam como estão (decidido_por começa com 'whatsapp final '); as linhas de ia.fato também.
