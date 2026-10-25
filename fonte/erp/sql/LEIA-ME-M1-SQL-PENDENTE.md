# M1, parte do banco: PENDENTE de ok separado do Felipe

Nada de SQL foi escrito, aplicado ou testado contra o banco nesta etapa. Este arquivo só diz o que falta e por quê.

## O que já está feito (só navegador, em branch, nada publicado)

`fonte/erp/js/05_motor_de_regras.js` tem `contaObra()`, a única conta de comprometido e realizado. As telas do ERP (05, 16, 29, 44, 48) chamam essa função.
A chave `par.calc_v2` (por obra, padrão DESLIGADA, em `Parâmetros → Chaves desta obra`) escolhe a conta:

- desligada: a OC é abatida pelas notas rateadas no mesmo item da OC (chave `oc|item`). É o que o ERP faz hoje.
- ligada [SUPOSIÇÃO do plano `00-MATRIZ-E-PLANO.md`, M1]: a OC é abatida pelo total das notas ligadas a ela, em qualquer item do rateio; nota rateada fora do item do pedido vira aviso.

## O que falta no banco

A mesma conta do comprometido está escrita em SQL em `fonte/erp/sql/02_rastro.sql`, função `public._taf_erp_valores(p_obra text)` (linhas 10 a 38):

- o trecho `nf` (linha 19) soma as notas por pedido **e por item**;
- o trecho `cp` (linhas 25 a 29) abate o pedido só pela nota do **mesmo item** (`nf.oc = o.id and nf.item = o.dados->>'item'`).

Isso é a dupla contagem de hoje. Para o banco acompanhar a chave `calc_v2`:

1. a função precisa ler `par.calc_v2` da obra (está em `taf_erp_obra.estado`, a mesma chave que o navegador grava);
2. com a chave ligada, o pedido é abatido pelo total das notas ligadas a ele (agrupando as notas só por pedido) e o valor continua no item do pedido. **Só contam as linhas de rateio em item que existe no orçamento (EAP) da obra**: rateio para item que não existe não vira realizado de item nenhum, então não abate o pedido (o valor continua comprometido; no navegador isso vira aviso). Foi achado da revisão (B4): sem essa regra o valor sumia das duas pontas;
3. com a chave desligada, a função tem de devolver **exatamente** o mesmo número da atual [SUPOSIÇÃO do plano, seção "Banco"];
4. a função é a base de `taf_erp_rastro` e `taf_erp_resumo` (`02_rastro.sql:65` e `:118`): a tela "Da tarefa à compra" e o resumo do Ciclo/Marko leem esses números.

## Por que não foi feito agora

- `_taf_erp_valores` é função que o site usa hoje. O banco é o mesmo em qualquer deploy (`fonte/erp/build.py:14-17`): trocar a função, mesmo com o código em branch, muda o que o Ciclo/Marko da 342 mostram na hora.
- O plano manda: arquivo novo (`fonte/erp/sql/03_*.sql` com `create or replace`), nunca editar `01_erp.sql` e `02_rastro.sql` já aplicados (md5 em `LEIA-ME.md`), backup antes (PASSO A de `99_reverter.sql`, que não copia `base_gz`) e **sim separado do Felipe**.
- Para desfazer: reaplicar a função como está em `02_rastro.sql` (não usar o `99_reverter.sql` inteiro, que apaga o ERP).

## Enquanto isso (importante)

Com `calc_v2` ligada numa obra, o navegador conta uma vez só a nota rateada fora do item do pedido, mas o SQL do rastro continua contando como hoje. Os números da tela "Da tarefa à compra" (rastro) e os da aba Eventos/Orçamento podem diferir **nos eventos que têm nota rateada fora do item do pedido**. Por isso: só ligar `calc_v2` nas obras de teste (999) até o SQL ser aplicado, ou ligar sabendo dessa diferença.

## Já avisado na tela (revisão M3)

Com `calc_v2` ligada o ERP mostra, até o SQL ser aplicado: a frase na descrição da chave (Parâmetros), um alerta fixo, e uma faixa nas telas "Eventos" e "Da tarefa à compra e ao BM", dizendo que o banco ainda conta como antes. Quando o SQL for aplicado, apagar `AVISO_SQL_CALC` e `avisoSqlCalc` (`05_motor_de_regras.js`) e os pontos que os chamam (`07_alertas.js`, `50_rastro.js`, `52_eventos.js`). O texto do Ciclo (`fonte/ciclo-erp.js:92`, "nunca se somam para o mesmo valor") é de antes deste trabalho e não foi alterado.

## Como provar depois que o SQL for aplicado (na obra 999, por RPC, como na prova de 22/10)

Cenário do plano: item A com meta R$ 1.000 (fictício), OC de R$ 600 no item A, NF de R$ 600 rateada 100% no item B.

- `calc_v2` desligada: o banco tem de devolver comprometido 600 no A e realizado 600 no B (soma 1.200, como hoje);
- `calc_v2` ligada: comprometido 0 no A e realizado 600 no B (soma 600);
- o mesmo cenário já está provado no navegador em `fonte/erp/teste/m1_conta.test.js` (função `cenA`). O resultado do banco deve bater com ele.
