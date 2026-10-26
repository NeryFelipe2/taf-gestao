# M4, parte do banco: PENDENTE de ok separado do Felipe (decisão E2)

**26/10/2026: SQL escrito, NÃO aplicado.** `03_nota_alcada.sql` (opção estreita, abaixo) e `03_teste_999.sql` (12 regras na obra 999, tudo desfeito no fim). Testado num Postgres 16 local com o `01_erp.sql` (cujas funções são iguais às do banco, conferido por md5): sem o 03 o teste falha no passo 2 (a aprovação não grava), com o 03 passa. Aplicar só com o sim do Felipe.

Texto original: Este arquivo só diz o que o servidor ainda impede e por quê.
Achado da revisão cética de M3 e M4 (lendo `01_erp.sql`; o teste no Node não enxerga a regra de papéis do servidor).

## O problema: aprovar nota sem pedido não fica salvo em obra real

Com a chave `par.ev_ctrl` ligada (decisão D7), a nota sem pedido acima do saldo ou da alçada nasce `aprov: "pendente"` e quem aprova é o Gerente ou a Diretoria.
A aprovação (e a reprovação) muda o próprio documento da nota (tipo `nf`). No servidor, `public._taf_erp_pode(papel, tipo)` (`01_erp.sql`, matriz "porte de pode_escrever") diz:

| Tipo | Quem grava hoje |
|---|---|
| `nf` | `adm`, `engenheiro`, `financeiro` (e `admin`) |
| `oc` | `compras`, `gerente`, `diretoria`, `almox`, `engenheiro` (e `admin`) |
| `sol` | `engenheiro`, `gerente`, `compras`, `diretoria` (e `admin`) |

Então:

- aprovar ou reprovar **OC** (tipo `oc`) por Gerente ou Diretoria grava normalmente;
- aprovar ou reprovar **nota sem pedido** (tipo `nf`) por Gerente ou Diretoria é **recusado**: `taf_erp_salvar` devolve `PAPEL GERENTE NAO GRAVA NF` (ou `DIRETORIA`).
  O navegador mostra "Não salvou 1 registro(s): o papel ... não grava este tipo de registro", recarrega do servidor e a nota volta a `pendente`.
  Como só Gerente ou Diretoria aprovam, a nota fica parada: não confere, não libera, não paga.

Conclusão: em obra real, ligar `ev_ctrl` antes do ajuste abaixo trava as notas sem pedido que passarem da alçada. **Só ligar `ev_ctrl` na obra 999** até o banco ser ajustado.
A aprovação de OC, a solicitação, a reserva de saldo e o semáforo de três níveis não dependem disso.

## O que o banco precisa (a decidir; qualquer opção é mudança em produção)

1. Opção mais curta: na `_taf_erp_pode`, `nf` passa a incluir `gerente` e `diretoria`. Efeito colateral: os dois passam a poder gravar qualquer campo de nota, não só a aprovação.
2. Opção mais estreita: tipo novo só para a decisão sobre a nota (por exemplo `nfap`, com `{nota, decisao, quem, motivo}`), com os dois papéis gravando e o navegador lendo a decisão por cima da nota. Exige a lista de tipos de `taf_erp_salvar` e o `DOCS` do navegador.
3. Em qualquer opção, M5 (regras no servidor) deve conferir que quem aprova não é quem lançou, por usuário (chave pessoal), e que a alçada bate com o valor.

Regras para quando for escrito: arquivo novo `03_*.sql` com `create or replace`, nunca editar `01_erp.sql` já aplicado, backup antes (PASSO A de `99_reverter.sql`, que não copia `base_gz`),
só com ok separado do Felipe e fora do horário de uso. Para desfazer: reaplicar a função como está em `01_erp.sql`. **Não** usar o `99_reverter.sql` inteiro (apaga o ERP todo).

## O que o servidor ainda não faz (M5, parado por E2)

Saldo, alçada, aprovador diferente do solicitante e soma do rateio só são conferidos no navegador. Quem chamar `taf_erp_salvar` direto grava uma OC já aprovada acima do limite.
Por isso a regra de três níveis é um aviso forte na tela, não uma trava.

## Já avisado na tela

Com a chave ligada o ERP mostra, até o ajuste: a frase na descrição da chave (Parâmetros), um alerta fixo e uma faixa na aba Aprovações quando há nota aguardando.
Quando o banco for ajustado, apagar `AVISO_SQL_CTRL` e `avisoSqlCtrl` (`05_motor_de_regras.js`) e os pontos que os chamam (`07_alertas.js`, `12_compras.js`).
