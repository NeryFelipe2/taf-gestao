# M3, parte do banco: PENDENTE de ok separado do Felipe (decisão E2)

Nada de SQL foi escrito, aplicado ou testado contra o banco. Este arquivo só diz o que o rastro precisa para ler `linhas` e por quê.
Quem decide e manda aplicar é o Felipe. Hoje a compra de várias linhas só existe no navegador, atrás da chave `par.oc_linhas` (padrão DESLIGADA).

## O que já está feito (só navegador, em branch, nada publicado)

Com `par.oc_linhas` ligada na obra, a solicitação e a OC ganham o campo `linhas`: lista de `{item, nat, conta, qtd, valor}` (na solicitação também `preco`).
O servidor já guarda JSON livre em `taf_erp_doc.dados` (`01_erp.sql`, função `taf_erp_salvar`): **a gravação não muda e nenhum documento antigo é reescrito**.

Como o documento fica gravado (para o SQL saber ler):

| Campo | Pedido ou solicitação de uma linha | De várias linhas |
|---|---|---|
| `item`, `nat`, `conta` | da linha única | **da primeira linha** (compatibilidade: quem não conhece `linhas` lê só o primeiro item) |
| `qtd`, `preco` | quantidade e preço unitário de sempre | `qtd = 1` e `preco = valor total` (o pacote é uma unidade só; recebimento e conferência da nota falam em fração do pacote) |
| `valor` (só na OC) | total | total |
| `linhas` | `[{item, nat, conta, qtd, valor}]` (uma linha) | `[{item, nat, conta, qtd, valor}, ...]`, soma dos `valor` = `valor` do pedido |
| proposta do fornecedor (`cots[].preco`) | preço unitário | **valor total do pedido** (a OC reparte entre as linhas, proporcional ao valor estimado) [SUPOSIÇÃO] |

Documento sem `linhas` (todo documento criado antes, e todo criado com a chave desligada) continua valendo como uma linha só, `{item, qtd, valor}`.

## O que falta no banco (arquivo `02_rastro.sql`, que está aplicado e não se edita: a mudança vai num `03_*.sql` novo, com `create or replace`)

Tudo abaixo hoje lê `dados->>'item'` e, com pedido de várias linhas, enxerga **só a primeira linha** (com o valor do pedido inteiro nela):

1. `public._taf_erp_valores(p_obra)` (linhas 10 a 38), base de `taf_erp_rastro` e `taf_erp_resumo`:
   - `cp` (comprometido, linhas 25 a 29): soma `o.dados->>'valor'` inteiro no `o.dados->>'item'` e abate só a nota `nf.item = o.dados->>'item'`. Precisa abrir `o.dados->'linhas'` (com `jsonb_array_elements`) e fazer a conta por linha: cada linha é abatida primeiro pela nota rateada no mesmo item; com `calc_v2` ligada, o que a nota realizou em outros itens do orçamento abate o que sobrou, repartido na proporção do que sobrou em cada linha (a mesma conta de `contaObra()` em `05_motor_de_regras.js`).
   - `ct` (solicitações em cotação, linhas 30 a 35): usa `s.dados->>'item'`, `qtd` e `cots[].preco`. Para solicitação de várias linhas, `qtd = 1` e `preco = total` já dão o total certo, mas ele cai todo no primeiro item; precisa repartir pelas `linhas` (peso = `valor` de cada linha).
2. `public._taf_erp_compras(p_obra, p_ativs)` (linhas 58 a 103): junta `taf_erp_item` por `s.dados->>'item'` (item, pacote e evento da solicitação) e soma `valor_item` da nota por `l->>'item' = s.dados->>'item'`. Para solicitação de várias linhas deve devolver um `item` por linha (ou a lista de itens e eventos) e o `valor_item` de cada uma.
3. `taf_erp_rastro` (linhas 157 e 160, compras nos itens dos eventos da tarefa que ninguém ligou): `join ... i.codigo = s.dados->>'item'`. Uma solicitação de dois eventos aparece só no evento da primeira linha. Deve olhar todas as linhas.
4. `taf_erp_rastro` (trecho `val`, linhas 116 a 118, soma por `i.evento`) e `taf_erp_resumo` (a partir da linha 186) usam `_taf_erp_valores`: melhoram sozinhos quando o item 1 estiver certo.

Regras para quando for escrito:

- Com a chave desligada, ou em documento sem `linhas`, a função tem de devolver **exatamente** o número da atual [SUPOSIÇÃO do plano, seção "Banco"]. A chave `par.oc_linhas` fica em `taf_erp_obra.estado`, a mesma que o navegador grava.
- Trocar função que o site usa hoje (`_taf_erp_valores`, `taf_erp_rastro`) mexe em produção mesmo com o código em branch: o banco é o mesmo em qualquer deploy (`build.py:14-17`). Só com ok separado, backup antes (PASSO A de `99_reverter.sql`, que não copia `base_gz`) e fora do horário de uso. Para desfazer: reaplicar a função como está em `02_rastro.sql`. **Não** usar o `99_reverter.sql` inteiro (apaga o ERP todo).
- As duas pendências (esta e a de `calc_v2`, em `LEIA-ME-M1-SQL-PENDENTE.md`) mexem na mesma função `_taf_erp_valores`: convém escrever as duas num `03_*.sql` só.

## Enquanto isso (importante)

Com `oc_linhas` ligada numa obra, o navegador conta cada linha no próprio item, mas "Da tarefa à compra e ao BM", o Ciclo e o Marko continuam lendo só a primeira linha. Nos pedidos de várias linhas os números e o evento dessas telas diferem de Orçamento, Eventos e Painéis.
Por isso: só ligar `oc_linhas` na obra 999 (teste) até o SQL ser aplicado, ou ligar sabendo dessa diferença.

## Já avisado na tela

Com a chave ligada o ERP mostra, até o SQL ser aplicado: a frase na descrição da chave (Parâmetros), um alerta fixo e uma faixa nas telas "Eventos" e "Da tarefa à compra e ao BM". Quando o SQL for aplicado, apagar `AVISO_SQL_LINHAS` e `avisoSqlLinhas` (`05_motor_de_regras.js`) e os pontos que os chamam (`07_alertas.js`, `50_rastro.js`, `52_eventos.js`).

## Como provar depois que o SQL for aplicado (na obra 999, por RPC, como na prova de 22/10)

Cenário do teste `fonte/erp/teste/m3.test.js` (itens fictícios 2.1 e 2.2 no mesmo pacote, eventos iguais):

- pedido `FOFO` de duas linhas, 2.1 = R$ 6.000 e 2.2 = R$ 3.200, aprovado e sem nota: o banco tem de devolver comprometido 6.000 no item 2.1 e 3.200 no item 2.2 (hoje devolveria 9.200 no 2.1);
- depois de uma nota de R$ 4.600 rateada 3.000 em 2.1 e 1.600 em 2.2: comprometido 3.000 e 1.600, realizado 3.000 e 1.600;
- documento sem `linhas` (OC-9001 da 999): mesmo número de hoje, com a chave ligada e desligada.
