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
