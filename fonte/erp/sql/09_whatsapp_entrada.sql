-- 09 (WhatsApp, entrada): função pública que recebe a mensagem do WhatsApp oficial (Meta Cloud API) vinda de /api/whatsapp e
-- grava em ia.fato. RASCUNHO. NÃO APLICADO. Só aplicar no banco com o sim do Felipe, depois de testar (09_teste_whatsapp.sql).
-- Fora do horário de uso, o arquivo inteiro de uma vez: psql -1 -v ON_ERROR_STOP=1 -f 09_whatsapp_entrada.sql
--
-- Para que serve: o endpoint da Vercel confere a assinatura da Meta e chama public.ia_whatsapp_receber com a chave publicável.
-- Como a porta é pública, a função só grava se:
--   1. p_segredo bate com o SHA-256 guardado em ia.config, chave 'whatsapp_segredo_banco', valor {"sha256": "<hex>"}.
--      Sem essa linha em ia.config: SEGREDO NAO CONFIGURADO (a porta fica fechada). Segredo diferente: SEGREDO INVALIDO.
--   2. o número está na lista ia.config, chave 'whatsapp_allowlist', valor ["+55...", ...] (E.164). Número fora da lista:
--      grava só um registro "WhatsApp de número não liberado" com os 4 últimos dígitos, sem o texto, sem o nome, sem o número.
-- Número liberado: ia.fato (empresa GRUPO, tipo mensagem, titulo 'WhatsApp de <nome>', texto = a mensagem, dados com wa_id,
-- número completo (só aqui), quando e o bruto resumido), hash = md5('wa:' || id da mensagem): a Meta reenvia o mesmo lote
-- quando não recebe 200, e a segunda chegada não duplica (devolve o mesmo fato_id, repetido = true).
-- Nada é enviado a ninguém. A função não lê nada além de ia.config e ia.fato. Nunca grava o segredo, só o compara.
--
-- Depende de: esquema ia (ia.config e ia.fato já existem no banco do centro de comando) e da extensão pgcrypto no esquema
-- extensions (já usada pelo planejador). Os "create ... if not exists" abaixo só servem para o banco local de teste.
--
-- Configurar (uma vez, no SQL Editor, fora do repositório; o segredo em texto aparece só na hora de calcular o hash):
--   insert into ia.config (chave, valor) values ('whatsapp_segredo_banco',
--     jsonb_build_object('sha256', encode(extensions.digest('<o mesmo texto de WHATSAPP_SEGREDO_BANCO na Vercel>', 'sha256'), 'hex')))
--   on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
--   insert into ia.config (chave, valor) values ('whatsapp_allowlist', '["+55DDDNUMERO"]'::jsonb)
--   on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
-- Trocar o segredo: rodar o primeiro insert de novo com o texto novo e trocar a variável na Vercel.

-- ===================================================================== só para o banco local de teste (no real já existem)
create schema if not exists ia;
create table if not exists ia.config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
create table if not exists ia.fato (
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
alter table ia.config enable row level security;
alter table ia.fato enable row level security;
revoke all on ia.config from public, anon, authenticated;
revoke all on ia.fato from public, anon, authenticated;

-- ===================================================================== função de entrada
-- Erros (a mensagem é o que o endpoint lê): SEGREDO NAO CONFIGURADO, SEGREDO INVALIDO, MENSAGEM SEM ID, NUMERO INVALIDO.
create or replace function public.ia_whatsapp_receber(p_segredo text, p_de text, p_nome text, p_texto text, p_wa_id text,
                                                      p_quando timestamptz default now(), p_bruto jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, ia, extensions as $$
declare
  v_hash_cfg text; v_lista jsonb; v_digitos text; v_liberado boolean; v_hash text; v_id bigint; v_repetido boolean := false;
  v_nome text; v_quando timestamptz; v_data date; v_bruto jsonb; v_dados jsonb; v_titulo text; v_texto text;
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
  return jsonb_build_object('ok', true, 'fato_id', v_id, 'liberado', v_liberado, 'repetido', v_repetido);
end $$;

-- ===================================================================== permissões
-- É a porta pública (o endpoint chama com a chave publicável): aberta a anon e authenticated, protegida pelo segredo.
revoke all on function public.ia_whatsapp_receber(text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.ia_whatsapp_receber(text, text, text, text, text, timestamptz, jsonb) to anon, authenticated;

-- ===================================================================== desfazer (manual)
-- drop function if exists public.ia_whatsapp_receber(text, text, text, text, text, timestamptz, jsonb);
-- delete from ia.config where chave in ('whatsapp_segredo_banco', 'whatsapp_allowlist');
-- (As linhas de ia.fato com fonte = 'whatsapp' ficam; apagar só se o Felipe mandar. Sem a função o endpoint responde 200 à Meta
--  e registra no log "falta aplicar o 09_whatsapp_entrada.sql".)
