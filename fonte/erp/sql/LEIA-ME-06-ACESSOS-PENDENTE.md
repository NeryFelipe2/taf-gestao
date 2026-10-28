# Acessos (item 3): SQL PENDENTE do sim do Felipe

**28/10/2026: escrito e testado num Postgres local igual ao da TAF (sem dado real). NÃO aplicado no banco.**
**Revisão 2 (28/10/2026):** obras da Diretoria limitada, pessoa, lista do gestor, identificador, caracteres invisíveis.

- `06_acessos.sql`: tela Acessos do ERP. Cria, lista e desativa chave pessoal sem SQL; papel novo `encarregado` (só aponta o dia no planejador).
- `06_teste_acessos.sql`: 140 conferências na OBRA 999 · DEMONSTRAÇÃO, na 998 e na 997 (fictícias), rodando como o site (papel anon). Desfaz tudo no fim (rollback).

## O que muda no banco

| O quê | Como |
|---|---|
| `taf_ciclo_chave` | só a regra de papel: aceita `encarregado`. Nenhuma coluna nova. |
| `taf_acesso_log` (nova) | quem criou e quem desativou cada chave. Só entra linha. Guarda o identificador curto, nunca a chave nem o hash. |
| `taf_acesso_segredo` (nova) | uma linha, sorteada ao aplicar, fechada para o site e travada. O identificador curto é o hmac do sha256 com ela: não sai pedaço do sha256 para quem vê a lista. |
| `taf_acesso_listar`, `taf_acesso_criar`, `taf_acesso_desativar` (novas) | únicas chamáveis pelo site. |
| `_taf_ciclo_pode` (já existe) | **redefinida**: cópia inteira da atual com uma linha a mais (`encarregado`: `apont`, `apont_lote`, `apont_apagar`). |
| `_taf_ciclo_ator`, `_taf_erp_ator` | **não mudam**: já passam o papel da chave pessoal adiante (conferido no teste). |

## Regras

- Diretoria (chave pessoal) cria e desativa qualquer papel. Gestor (chave pessoal) cria e desativa engenheiro, encarregado e leitura.
- **Obras:** cada um só cria e desativa chave que está inteira dentro das obras que cuida.
  - **Diretoria com todas as obras** = a que tem todas as obras que alguma Diretoria ativa tem. Cuida de todas as obras do sistema, inclusive obra nova importada depois (que ainda não tem Diretoria).
  - **Diretoria limitada** (sócio de consórcio, uma obra só) e **gestor**: só as obras da própria chave. No ERP já era assim (`_taf_erp_obra_ok`); agora em Acessos também.
  - Sempre sobra uma Diretoria com todas as obras: não desativa a que deixaria nenhuma, e a primeira chave de Diretoria de uma obra nova tem de ter também as obras que já têm Diretoria.
- **Pessoa:** não cria chave em nome de quem já tem chave ativa que o criador não cuida (Diretoria, gestor, outra obra). Comparação sem acento, sem maiúscula, sem espaço sobrando e sem caractere invisível.
- Partida: sem chave de Diretoria ativa, a chave geral do site cria a primeira, só de Diretoria, com o nome digitado. Depois, a chave geral não cria nem desativa nada.
- Ninguém desativa a própria chave.
- A chave nasce no banco (`gen_random_bytes`, 96 bits), com prefixo do primeiro nome da pessoa, por exemplo `engenheira-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx` (cada `x` é uma letra de 0 a 9 ou a a f). Só o sha256 é gravado. O texto aparece uma vez na tela.
- Nome e pessoa: os caracteres invisíveis (espaço de largura zero e parecidos) saem antes de validar; precisam de ao menos 2 letras ou números.
- Avisos (não bloqueiam): chave de engenheiro com nome diferente do engenheiro da obra no planejador; obra sem cronograma; pessoa com outra chave ativa.

## Para o Felipe decidir

1. [SUPOSIÇÃO] **O que o gestor e a Diretoria limitada veem na lista.** Hoje: só as chaves com alguma obra em comum com a deles, sem mostrar as obras de fora (aparece "+N obras fora da sua chave"); o gestor não vê as chaves de Diretoria. A Diretoria com todas as obras vê todas. Padrão proposto: deixar assim.
2. [SUPOSIÇÃO] **Obra nova.** A Diretoria com todas as obras dá acesso de engenheiro e encarregado na obra nova na hora. Para ela mesma ver a obra no ERP, cria uma chave nova de Diretoria com todas as obras e desativa a antiga com a nova (obra nova não entra sozinha numa chave que já existe). Padrão proposto: deixar assim.
3. [SUPOSIÇÃO] **Pessoa.** O gestor não cria chave em nome de quem já tem chave de Diretoria, de gestor ou de obra que não é dele, nem para ele mesmo (pede à Diretoria). Na partida não há essa conferência. Padrão proposto: deixar assim.

## Aplicar (com o sim)

1. Backup: `create table public.taf_ciclo_chave_copia_0610 as select * from public.taf_ciclo_chave;`
2. Rodar `06_acessos.sql` inteiro. Pode rodar de novo sem problema.
3. Rodar `06_teste_acessos.sql` num banco de teste novo (precisa de uma chave geral de teste em `taf_chave` e da obra 999 sem semana no planejador; ver o cabeçalho). Tem de terminar com `06 OK`. No banco de verdade ele também desfaz tudo, mas só roda se a obra 999 estiver sem semana.
4. Se já existem chaves de Diretoria criadas à mão, conferir que uma delas tem todas as obras das outras (senão a tela não desativa Diretoria nem dá obra nova):
   `select nome, pessoa, obras, public._taf_acesso_cobertas() <@ obras as tem_todas from public.taf_ciclo_chave where papel = 'diretoria' and ativo;`
   Nenhuma com `tem_todas = true`: com o sim do Felipe, pôr todas as obras na chave dele (`update ... set obras = public._taf_acesso_cobertas() where ...`).
5. Montar e publicar o site (ERP com a tela Acessos; planejador aceitando o encarregado).
6. **Logo depois de publicar, criar a primeira chave de Diretoria** (ERP com a chave geral, Acessos, "Criar a primeira chave de Diretoria", com todas as obras). Até isso acontecer, qualquer pessoa com a chave geral do site cria essa primeira Diretoria com o nome que quiser, e ela não sai pela tela (é a última Diretoria). Entrar com a chave nova e conferir em Acessos: só a sua chave, e "criada por" com o seu nome e "(chave geral)".

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
