# Acessos (item 3): SQL PENDENTE do sim do Felipe

**28/10/2026: escrito e testado num Postgres local igual ao da TAF (sem dado real). NÃO aplicado no banco.**

- `06_acessos.sql`: tela Acessos do ERP. Cria, lista e desativa chave pessoal sem SQL; papel novo `encarregado` (só aponta o dia no planejador).
- `06_teste_acessos.sql`: 86 conferências (140 com as repetições) na OBRA 999 · DEMONSTRAÇÃO, rodando como o site (papel anon). Desfaz tudo no fim (rollback).

## O que muda no banco

| O quê | Como |
|---|---|
| `taf_ciclo_chave` | só a regra de papel: aceita `encarregado`. Nenhuma coluna nova. |
| `taf_acesso_log` (nova) | quem criou e quem desativou cada chave. Só entra linha. Guarda o identificador curto (10 letras do sha256), nunca a chave. |
| `taf_acesso_listar`, `taf_acesso_criar`, `taf_acesso_desativar` (novas) | únicas chamáveis pelo site. |
| `_taf_ciclo_pode` (já existe) | **redefinida**: cópia inteira da atual com uma linha a mais (`encarregado`: `apont`, `apont_lote`, `apont_apagar`). |
| `_taf_ciclo_ator`, `_taf_erp_ator` | **não mudam**: já passam o papel da chave pessoal adiante (conferido no teste). |

## Regras

- Diretoria (chave pessoal) cria e desativa qualquer papel. Gestor (chave pessoal) cria e desativa engenheiro, encarregado e leitura, só nas obras da chave dele.
- Partida: sem chave de Diretoria ativa, a chave geral do site cria a primeira, só de Diretoria, com o nome digitado. Depois, a chave geral não cria nem desativa nada.
- Ninguém desativa a própria chave nem a última de Diretoria.
- A chave nasce no banco (`gen_random_bytes`, 96 bits), com prefixo do primeiro nome da pessoa: `marko-7f3a-91c2-0b4e-d5a8-33f1-6c90`. Só o sha256 é gravado. O texto aparece uma vez na tela.
- Chave de engenheiro com nome diferente do engenheiro da obra no planejador: cria, mas avisa (as demandas, as áreas e as tarefas em nome do engenheiro não aparecem como dele).

## Aplicar (com o sim)

1. Backup: `create table public.taf_ciclo_chave_copia_0610 as select * from public.taf_ciclo_chave;`
2. Rodar `06_acessos.sql` inteiro. Pode rodar de novo sem problema.
3. Rodar `06_teste_acessos.sql` num banco de teste novo (precisa de uma chave geral de teste em `taf_chave` e da obra 999 sem semana no planejador; ver o cabeçalho). Tem de terminar com `06 OK`. No banco de verdade ele também desfaz tudo, mas só roda se a obra 999 estiver sem semana.
4. Montar e publicar o site (ERP com a tela Acessos; planejador aceitando o encarregado).

Desfazer: fim do `06_acessos.sql`.
