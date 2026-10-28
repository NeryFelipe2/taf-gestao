# ERP TAF dentro do site (taf_erp_*)

Ordem: 01_erp.sql, 02_rastro.sql (precisa do ciclo instalado antes). Reverter: 99_reverter.sql.
Rascunho NÃO aplicado: 04_obra_nova.sql (obra nova e orçamento pela tela do ERP; teste em 04_teste_obra_nova.sql). Só com o sim do Felipe, e junto com o ERP que abre a base marcada "tela:" pela lista fechada de campos (53_obra_nova.js). Antes do 99_reverter, rodar a cópia das obras criadas pela tela (fim do 04).
Só cria objetos `taf_erp_*`. Base/itens do ERP (dados privados) NÃO ficam no repositório.

md5: 01_erp b27d3d59b53ab8e28ae304bc1d128a09, 02_rastro 6448e08045c1b33a8651fef2b1266f5a, 99_reverter e1763f5d3ae4e7f13f7abcec2191eb17

08_resumo.sql (resumo automático para o diretor: destinatários, envios, chave do robô e resumo de cada obra): RASCUNHO, NÃO APLICADO. Só com o sim do Felipe, depois de testar.
Precisa do ciclo (fonte/ciclo/sql 01 a 04) e de 01_erp e 02_rastro. Teste na obra 999 fictícia: 08_teste_resumo.sql (transação com rollback). Desfazer: fim do próprio 08.

Rascunhos do "sistema sozinho" (nenhum aplicado; ordem 04, 05, 06, 07, 08, cada um com o teste dele, só num banco de teste novo):
- Backup antes de aplicar: PASSO A do `99_reverter.sql` do ERP **e** PASSO A do `fonte/ciclo/sql/99_reverter.sql` (tem `taf_ciclo_chave`, que o 04, o 06 e o 08 mudam), salvos em arquivo fora do repositório. Nunca `create table public.... as select` como cópia: tabela nova em `public` pode nascer aberta ao site (ver o LEIA-ME-06, passo 1).
- O PASSO A do 99_reverter não guarda as tabelas novas (`taf_erp_base_hist` do 04, `taf_erp_meta_prop` do 05, `taf_acesso_*` do 06, `taf_ia_*` do 07, `taf_resumo_*` do 08). Cada uma tem a cópia e o desfazer no fim do próprio arquivo. O PASSO B do 99_reverter deixa essas tabelas no banco e tira, pelo `cascade`, a ligação de `taf_erp_meta_prop` com `taf_erp_obra`; rodar o 05 de novo devolve a ligação.
- Aplicar cada arquivo fora do horário de uso e inteiro: `psql -1 -v ON_ERROR_STOP=1 -f <arquivo>`.
