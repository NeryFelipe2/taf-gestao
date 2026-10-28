# Acessos (item 3): SQL PENDENTE do sim do Felipe

**28/10/2026: escrito e testado num Postgres local igual ao da TAF (sem dado real). NÃO aplicado no banco.**
**Revisão 2 (28/10/2026):** obras da Diretoria limitada, pessoa, lista do gestor, identificador, caracteres invisíveis.

- `06_acessos.sql`: tela Acessos do ERP. Cria, lista e desativa chave pessoal sem SQL; papel novo `encarregado`: no planejador só aponta o dia; no ERP entra como encarregado (ver "O que o encarregado vê no ERP").
- `06_teste_acessos.sql`: 148 conferências na OBRA 999 · DEMONSTRAÇÃO, na 998 e na 997 (fictícias), rodando como o site (papel anon). Desfaz tudo no fim (rollback). **Só num banco de teste novo.**

**Integração (28/10/2026, com os itens 1 a 5 juntos):** obra criada pela tela entra também nas Diretorias com todas as obras (04); obra que só existe no planejador não entra na chave de quem não cuida dela (04); a chave do robô do resumo (08) só a Diretoria com todas as obras desativa; trava de md5 do `_taf_ciclo_pode` e `lock_timeout` no começo do 06.

## O que muda no banco

| O quê | Como |
|---|---|
| `taf_ciclo_chave` | só a regra de papel: aceita `encarregado`. Nenhuma coluna nova. |
| `taf_acesso_log` (nova) | quem criou e quem desativou cada chave. Só entra linha. Guarda o identificador curto, nunca a chave nem o hash. |
| `taf_acesso_segredo` (nova) | uma linha, sorteada ao aplicar, fechada para o site e travada. O identificador curto é o hmac do sha256 com ela: não sai pedaço do sha256 para quem vê a lista. |
| `taf_acesso_listar`, `taf_acesso_criar`, `taf_acesso_desativar` (novas) | únicas chamáveis pelo site. |
| `_taf_ciclo_pode` (já existe) | **redefinida**: cópia inteira da atual com uma linha a mais (`encarregado`: `apont`, `apont_lote`, `apont_apagar`). O 06 para no começo se a versão do banco não for a do repositório (md5). **Se o `fonte/ciclo/sql/02_funcoes.sql` for rodado de novo, rode o 06 de novo logo depois**, senão o encarregado para de apontar sem aviso. |
| `_taf_ciclo_ator`, `_taf_erp_ator` | **não mudam**: já passam o papel da chave pessoal adiante (conferido no teste). |

## Regras

- Diretoria (chave pessoal) cria e desativa qualquer papel. Gestor (chave pessoal) cria e desativa engenheiro, encarregado e leitura.
- **Obras:** cada um só cria e desativa chave que está inteira dentro das obras que cuida.
  - **Diretoria com todas as obras** = a que tem todas as obras que alguma Diretoria ativa tem. Cuida de todas as obras do sistema, inclusive obra nova importada depois (que ainda não tem Diretoria).
  - **Diretoria limitada** (sócio de consórcio, uma obra só) e **gestor**: só as obras da própria chave. No ERP já era assim (`_taf_erp_obra_ok`); agora em Acessos também.
  - Sempre sobra uma Diretoria com todas as obras: não desativa a que deixaria nenhuma, e a primeira chave de Diretoria de uma obra nova tem de ter também as obras que já têm Diretoria.
  - Obra criada pela tela do ERP (04): entra na chave de quem cria e nas chaves de Diretoria com todas as obras. Obra importada de outro jeito (planejador, carga.py) não entra sozinha em chave nenhuma.
  - Chave sem obra nenhuma (a do robô do resumo, do 08): só a Diretoria com todas as obras desativa. Desativar o robô aqui desliga também o robô no Resumo para o diretor.
- **Pessoa:** não cria chave em nome de quem já tem chave ativa que o criador não cuida (Diretoria, gestor, outra obra). Comparação sem acento, sem maiúscula, sem espaço sobrando e sem caractere invisível.
- Partida: sem chave de Diretoria ativa, a chave geral do site cria a primeira, só de Diretoria, com o nome digitado. Depois, a chave geral não cria nem desativa nada.
- Ninguém desativa a própria chave.
- A chave nasce no banco (`gen_random_bytes`, 96 bits), com prefixo do primeiro nome da pessoa, por exemplo `engenheira-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx` (cada `x` é uma letra de 0 a 9 ou a a f). Só o sha256 é gravado. O texto aparece uma vez na tela.
- Nome e pessoa: os caracteres invisíveis (espaço de largura zero e parecidos) saem antes de validar; precisam de ao menos 2 letras ou números.
- Avisos (não bloqueiam): chave de engenheiro com nome diferente do engenheiro da obra no planejador; obra sem cronograma; pessoa com outra chave ativa.

## Para o Felipe decidir

1. [SUPOSIÇÃO] **O que o gestor e a Diretoria limitada veem na lista.** Hoje: só as chaves com alguma obra em comum com a deles, sem mostrar as obras de fora (aparece "+N obras fora da sua chave"); o gestor não vê as chaves de Diretoria. A Diretoria com todas as obras vê todas. Padrão proposto: deixar assim.
2. [SUPOSIÇÃO] **Obra nova.** Obra criada pela tela do ERP (Nova obra) entra sozinha na chave de quem criou e nas chaves de Diretoria com todas as obras (assim ninguém perde o "todas as obras", nem em Acessos nem no Resumo). Obra importada de outro jeito (planejador, carga.py) não entra sozinha: a Diretoria com todas as obras dá acesso de engenheiro e encarregado nela na hora; para ela mesma ver a obra no ERP, cria uma chave nova de Diretoria com todas as obras e desativa a antiga com a nova. Padrão proposto: deixar assim.
3. [SUPOSIÇÃO] **Pessoa.** O gestor não cria chave em nome de quem já tem chave de Diretoria, de gestor ou de obra que não é dele, nem para ele mesmo (pede à Diretoria). Na partida não há essa conferência. Padrão proposto: deixar assim.
4. [SUPOSIÇÃO] **Quem cria obra.** Hoje criam: gestor e Diretoria (inclusive a limitada, o sócio de consórcio) com chave pessoal, e a chave geral do site (com o nome digitado, mesmo depois da partida). Obra criada não se apaga sem SQL. Padrão proposto: deixar assim; se preferir, só a Diretoria com todas as obras e o gestor criam, e a chave geral só na partida.
5. [SUPOSIÇÃO] **O que o encarregado vê no ERP.** A chave de encarregado entra também no ERP (de propósito: Obra > Campo, Ponto e Frota, como no MANUAL_encarregado). Lá ele vê Início, Orçamento (licitado, meta e teto), Pessoas e ponto (com banco de horas) e Frota, grava ponto, frota, apontamento de campo, restrição e tarefa, e a prévia do resumo traz o custo da obra. Padrão proposto: deixar assim (a tela Acessos agora diz isso). Se o encarregado for só do planejador, a recusa tem de ficar no banco (`_taf_erp_ator`/`taf_erp_ler` e `taf_resumo_previa`/`taf_resumo_obra`), não só na tela.

## Aplicar (com o sim)

1. Backup **fora do banco aberto ao site**: rodar o PASSO A de `fonte/ciclo/sql/99_reverter.sql` (já tem `taf_ciclo_chave`) e salvar o resultado em arquivo fora do repositório público. **Nunca** `create table public.... as select`: no Supabase, tabela nova em `public` pode nascer sem RLS e com acesso do site (`anon`), e a cópia entregaria o sha256 de todas as chaves, com nome, papel e obras, e ainda poderia ser apagada pelo site. Se precisar da cópia dentro do banco, só num esquema fechado e na mesma transação:
   ```sql
   begin;
   create schema if not exists taf_copia;
   revoke all on schema taf_copia from public, anon, authenticated;
   create table taf_copia.taf_ciclo_chave_aaaammdd as select * from public.taf_ciclo_chave;
   alter table taf_copia.taf_ciclo_chave_aaaammdd enable row level security;
   revoke all on taf_copia.taf_ciclo_chave_aaaammdd from public, anon, authenticated;
   commit;
   ```
   Conferir: `select has_table_privilege('anon', 'taf_copia.taf_ciclo_chave_aaaammdd', 'select');` tem de dar `false`. Apagar a cópia (`drop table taf_copia.taf_ciclo_chave_aaaammdd;`) quando não precisar mais.
2. Rodar `06_acessos.sql` inteiro, fora do horário de uso, tudo ou nada: `psql -1 -v ON_ERROR_STOP=1 -f 06_acessos.sql`. Pode rodar de novo sem problema. Se parar em "FUNCAO _taf_ciclo_pode DO BANCO DIFERENTE DO REPOSITORIO", alguém mudou essa função no banco: compare antes de seguir. Se parar por "lock timeout", alguma transação estava usando `taf_ciclo_chave`: rode de novo.
3. `06_teste_acessos.sql` **só num banco de teste novo** (`/opt/pgtest/novo_banco.sh`, os SQL 04 a 08 e o teste; tem de terminar com `06 OK`). **No banco de verdade não rodar**: ele falha com as chaves e obras de verdade, e precisaria de uma chave geral de teste no banco real. A conferência no banco real é o passo 4 e: `select md5(pg_get_functiondef('public._taf_ciclo_pode(text,text)'::regprocedure));` = `e181c6427042a76781e61ec36c2be373`; `select public._taf_ciclo_pode('encarregado','apont');` = `true`; `select has_table_privilege('anon','public.taf_acesso_log','select');` = `false`.
4. Se já existem chaves de Diretoria criadas à mão, conferir que uma delas tem todas as obras das outras (senão a tela não desativa Diretoria nem dá obra nova):
   `select nome, pessoa, obras, public._taf_acesso_cobertas() <@ obras as tem_todas from public.taf_ciclo_chave where papel = 'diretoria' and ativo;`
   Nenhuma com `tem_todas = true`: com o sim do Felipe, pôr todas as obras na chave dele (`update ... set obras = public._taf_acesso_cobertas() where ...`).
5. Montar e publicar o site (ERP com a tela Acessos; planejador aceitando o encarregado).
6. **Logo depois de publicar, criar a primeira chave de Diretoria** (ERP com a chave geral, Acessos, "Criar a primeira chave de Diretoria", com todas as obras). Num banco sem nenhuma obra, a obra vem primeiro (Nova obra com a chave geral), porque a chave precisa de ao menos uma obra e sem obra o ERP não mostra o menu. Depois de criar, **Sair** no ERP e entrar com a chave nova (o Sair agora não volta sozinho para a chave geral guardada pelo Centro). Até isso acontecer, qualquer pessoa com a chave geral do site cria essa primeira Diretoria com o nome que quiser, e ela não sai pela tela (é a última Diretoria). Entrar com a chave nova e conferir em Acessos: só a sua chave, e "criada por" com o seu nome e "(chave geral)".

### Se a primeira Diretoria não foi você

A chave geral do site vazou: troque a chave geral antes de refazer. Depois, no banco, desative tudo o que a tela criou e registre (a partida reabre):

```sql
begin;
insert into public.taf_acesso_log (acao, chave_id, nome, pessoa, papel, obras, motivo, quem, quem_papel, verificado)
select 'desativar', public._taf_acesso_id(c.hash), c.nome, c.pessoa, c.papel, c.obras, 'partida refeita no banco', 'Felipe (SQL)', 'banco', false
  from public.taf_ciclo_chave c
 where c.ativo and public._taf_acesso_id(c.hash) in (select l.chave_id from public.taf_acesso_log l where l.acao = 'criar');
update public.taf_ciclo_chave c set ativo = false
 where c.ativo and public._taf_acesso_id(c.hash) in (select l.chave_id from public.taf_acesso_log l where l.acao = 'criar');
commit;
```

Depois refaça o passo 6.

## O que não cobre

- Letra de outro alfabeto parecida com a nossa (ex.: "а" cirílico no lugar de "a") passa como nome diferente.
- Quem tem a chave geral do site antes da partida (ver o passo 6).

Desfazer: fim do `06_acessos.sql`.
